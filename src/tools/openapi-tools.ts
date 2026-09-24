import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { ToolDefinition, ToolMetadata, ToolRetryPolicy } from '../types/tool.js';
import { clip } from './bounded-text.js';
import { bindArguments, callOperation, type OperationCall } from './openapi-call.js';
import {
  extractOperations,
  isRecord,
  loadOpenApiSpec,
  type HttpMethod,
  type OpenApiFetch,
  type OpenApiOperation,
  type OpenApiSpecSource,
} from './openapi-spec.js';
import { ToolNameAllocator, prefixed } from './tool-names.js';

export interface OpenApiToolsOptions {
  /** URL (`https://…/openapi.json`), file path, or an already parsed object (JSON or YAML). */
  spec: OpenApiSpecSource;
  /** Where requests go. Defaults to the spec's first `servers` entry. */
  baseUrl?: string;
  /** Sent with every request, e.g. `{ Authorization: `Bearer ${token}` }`. Never shown to the model. */
  headers?: Record<string, string>;
  /**
   * Operations to turn into tools, by `operationId`. Without it, only `GET` operations are
   * used. Listing an operation is the only way to get `POST`, `PUT`, `PATCH` or `DELETE`.
   */
  include?: string[];
  /** Operations to leave out, by `operationId`. */
  exclude?: string[];
  /** Only operations with at least one of these tags. */
  tags?: string[];
  /** Prefix of every tool name, e.g. `petstore_`. */
  prefix?: string;
  /**
   * Governance metadata per operation. Defaults: `GET` → low risk, read-only; any other
   * method → high risk and `requiresApproval: true`. What you return is merged over that.
   */
  metadata?: (operation: OpenApiOperationInfo) => ToolMetadata | undefined;
  /** Retries for failed calls. Only set it for idempotent operations. */
  retry?: ToolRetryPolicy;
  /** HTTP port; defaults to the global `fetch`. */
  fetch?: OpenApiFetch;
  /** Per request, spec download included. Default 30 000 ms. */
  timeoutMs?: number;
  /** Longer response bodies are cut. Default 100 000 bytes. */
  maxResponseBytes?: number;
  /** Largest spec accepted. Default 10 MB. */
  maxSpecBytes?: number;
}

/** What `metadata` receives to decide on an operation. */
export interface OpenApiOperationInfo {
  operationId?: string;
  method: HttpMethod;
  path: string;
  tags: string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 100_000;
const DEFAULT_MAX_SPEC_BYTES = 10_000_000;

/**
 * Turns the operations of an OpenAPI 3 description into tools, one per operation. Read-only
 * by default: only `GET` operations, unless you list others in `include`.
 *
 * ```ts
 * const tools = await openApiTools({ spec: 'https://api.example.com/openapi.json' });
 * ```
 */
export async function openApiTools(options: OpenApiToolsOptions): Promise<ToolDefinition[]> {
  const fetch = options.fetch ?? defaultFetch();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const loaded = await loadOpenApiSpec(options.spec, {
    fetch,
    timeoutMs,
    maxSpecBytes: options.maxSpecBytes ?? DEFAULT_MAX_SPEC_BYTES,
  });
  const baseUrl = resolveBaseUrl(options.baseUrl, loaded.document, loaded.sourceUrl);
  const operations = selectOperations(extractOperations(loaded.document), options);
  const names = new ToolNameAllocator();
  const title = specTitle(loaded.document);

  return operations.map((operation) => {
    const { bindings, inputSchema } = bindArguments(operation);
    const call: OperationCall = {
      operation,
      bindings,
      baseUrl,
      headers: options.headers ?? {},
      fetch,
      timeoutMs,
      maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    };
    const label = operation.operationId ?? `${operation.method}_${operation.path}`;
    return {
      name: names.allocate(prefixed(options.prefix, label)),
      description: describe(operation),
      schema: z.record(z.unknown()),
      inputJsonSchema: inputSchema,
      capability: `openapi:${title}`,
      metadata: metadataFor(operation, options),
      ...(options.retry ? { retry: options.retry } : {}),
      handler: (args: Record<string, unknown>, context) =>
        callOperation(call, args, context?.signal),
    };
  });
}

function selectOperations(
  operations: OpenApiOperation[],
  options: OpenApiToolsOptions
): OpenApiOperation[] {
  const known = new Set(operations.map((operation) => operation.operationId));
  for (const id of options.include ?? []) {
    if (!known.has(id)) {
      throw new ValidationError('include', `no operation with operationId "${id}" in the spec`);
    }
  }
  const selected = operations.filter((operation) => {
    const id = operation.operationId;
    if (id !== undefined && options.exclude?.includes(id)) return false;
    if (options.tags && !operation.tags.some((tag) => options.tags?.includes(tag))) return false;
    if (options.include) return id !== undefined && options.include.includes(id);
    return operation.method === 'get';
  });
  // An operation you asked for by name must work; others that cannot are left out.
  const unusable = options.include
    ? selected.find((operation) => operation.unsupported)
    : undefined;
  if (unusable) {
    throw new ValidationError(
      'include',
      `${unusable.operationId} cannot be called: ${unusable.unsupported}`
    );
  }
  return selected.filter((operation) => !operation.unsupported);
}

function metadataFor(operation: OpenApiOperation, options: OpenApiToolsOptions): ToolMetadata {
  const defaults: ToolMetadata =
    operation.method === 'get'
      ? { category: 'openapi', riskLevel: 'low', requiresApproval: false, readOnly: true }
      : { category: 'openapi', riskLevel: 'high', requiresApproval: true, readOnly: false };
  const override = options.metadata?.({
    method: operation.method,
    path: operation.path,
    tags: operation.tags,
    ...(operation.operationId ? { operationId: operation.operationId } : {}),
  });
  return { ...defaults, ...override };
}

function describe(operation: OpenApiOperation): string {
  const text = [operation.summary, operation.description]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .map((part) => part.trim())
    .join('\n\n');
  const route = `${operation.method.toUpperCase()} ${operation.path}`;
  return text ? `${clip(text, 1000)}\n\n(${route})` : route;
}

function resolveBaseUrl(
  option: string | undefined,
  document: Record<string, unknown>,
  sourceUrl: string | undefined
): URL {
  const raw = option ?? firstServerUrl(document);
  if (!raw) {
    throw new ValidationError('baseUrl', 'the spec declares no servers: pass `baseUrl`');
  }
  let url: URL;
  try {
    url = new URL(raw, sourceUrl);
  } catch {
    throw new ValidationError(
      'baseUrl',
      `cannot resolve the server URL "${raw}": pass an absolute \`baseUrl\``
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ValidationError('baseUrl', `unsupported protocol ${url.protocol}`);
  }
  return url;
}

/** First server URL, with its variables replaced by their default values. */
function firstServerUrl(document: Record<string, unknown>): string | undefined {
  const servers = Array.isArray(document.servers) ? document.servers : [];
  const first: unknown = servers[0];
  if (!isRecord(first) || typeof first.url !== 'string') {
    return undefined;
  }
  const variables = isRecord(first.variables) ? first.variables : {};
  return first.url.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const variable = variables[name];
    return isRecord(variable) && typeof variable.default === 'string' ? variable.default : match;
  });
}

function specTitle(document: Record<string, unknown>): string {
  const info = isRecord(document.info) ? document.info : {};
  return typeof info.title === 'string' && info.title.trim() !== '' ? info.title.trim() : 'api';
}

function defaultFetch(): OpenApiFetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new ValidationError('fetch', 'no global fetch available; pass a fetch implementation');
  }
  return (url, init) => globalThis.fetch(url, init);
}
