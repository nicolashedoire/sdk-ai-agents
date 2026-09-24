import { readFile, stat } from 'node:fs/promises';
import { ValidationError } from '../errors/index.js';
import { readBoundedText, type ByteStream } from './bounded-text.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type JsonSchema = Record<string, unknown>;

const METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
/**
 * Beyond these many schema nodes, a `$ref` is left unexpanded: per operation, and for the
 * whole spec (a small spec whose references multiply must not fill the memory).
 */
const MAX_OPERATION_NODES = 20_000;
const MAX_SPEC_NODES = 200_000;

/** A spec given as a URL, a file path, or an object you already parsed (JSON or YAML). */
export type OpenApiSpecSource = string | URL | Record<string, unknown>;

/** HTTP port: satisfied by the global `fetch`; inject another one for proxies or tests. */
export type OpenApiFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    redirect?: 'manual';
  }
) => Promise<{
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  body?: ByteStream | null;
  /** Set by `fetch` when it followed a redirect. */
  redirected?: boolean;
  text(): Promise<string>;
}>;

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  description?: string;
  schema: JsonSchema;
}

export interface OpenApiOperation {
  operationId?: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: OpenApiParameter[];
  /** JSON request body. */
  body?: { required: boolean; description?: string; schema: JsonSchema };
  /** Why the operation cannot be called by this adapter, if it cannot. */
  unsupported?: string;
}

export interface LoadedSpec {
  document: Record<string, unknown>;
  /** Where the spec was downloaded from, to resolve relative server URLs. */
  sourceUrl?: string;
}

export async function loadOpenApiSpec(
  source: OpenApiSpecSource,
  options: { fetch: OpenApiFetch; timeoutMs: number; maxSpecBytes: number }
): Promise<LoadedSpec> {
  let loaded: LoadedSpec;
  if (source instanceof URL || (typeof source === 'string' && /^https?:\/\//i.test(source))) {
    const url = source.toString();
    loaded = { document: parseSpecText(await download(url, options), url), sourceUrl: url };
  } else if (typeof source === 'string') {
    const info = await stat(source);
    if (info.size > options.maxSpecBytes) {
      throw new ValidationError('spec', `${source} is larger than ${options.maxSpecBytes} bytes`);
    }
    loaded = { document: parseSpecText(await readFile(source, 'utf8'), source) };
  } else {
    loaded = { document: source };
  }
  assertOpenApi3(loaded.document);
  return loaded;
}

async function download(
  url: string,
  options: { fetch: OpenApiFetch; timeoutMs: number; maxSpecBytes: number }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    // Redirects are followed here: no credentials are sent with the spec request.
    const response = await options.fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new ValidationError('spec', `${url} returned HTTP ${response.status}`);
    }
    const body = await readBoundedText(response, options.maxSpecBytes);
    if (body.truncated) {
      throw new ValidationError('spec', `${url} is larger than ${options.maxSpecBytes} bytes`);
    }
    return body.text;
  } finally {
    clearTimeout(timer);
  }
}

function parseSpecText(text: string, origin: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError(
      'spec',
      `${origin} is not JSON. For a YAML spec, parse it yourself (for example with the \`yaml\` package) and pass the object`
    );
  }
  if (!isRecord(parsed)) {
    throw new ValidationError('spec', `${origin} does not contain a JSON object`);
  }
  return parsed;
}

function assertOpenApi3(document: Record<string, unknown>): void {
  if (document.swagger !== undefined) {
    throw new ValidationError(
      'spec',
      'Swagger 2.0 is not supported: convert the spec to OpenAPI 3 (e.g. with swagger2openapi)'
    );
  }
  if (typeof document.openapi !== 'string' || !document.openapi.startsWith('3.')) {
    throw new ValidationError('spec', 'not an OpenAPI 3.x document (missing "openapi": "3.x")');
  }
  if (!isRecord(document.paths)) {
    throw new ValidationError('spec', 'the OpenAPI document has no "paths" object');
  }
}

/** Every operation of the spec, with `$ref`s resolved and parameters merged. */
export function extractOperations(document: Record<string, unknown>): OpenApiOperation[] {
  const paths = isRecord(document.paths) ? document.paths : {};
  const operations: OpenApiOperation[] = [];
  const budget = { nodes: 0 };
  for (const [path, rawItem] of Object.entries(paths)) {
    const item = new RefResolver(document, budget).follow(rawItem);
    if (!isRecord(item)) continue;
    const shared = arrayOf(item.parameters);
    for (const method of METHODS) {
      const operation = item[method];
      if (isRecord(operation)) {
        // A resolver per operation (its own budget), sharing the budget of the whole spec.
        const resolver = new RefResolver(document, budget);
        operations.push(readOperation(resolver, path, method, operation, shared));
      }
    }
  }
  return operations;
}

function readOperation(
  resolver: RefResolver,
  path: string,
  method: HttpMethod,
  operation: Record<string, unknown>,
  shared: unknown[]
): OpenApiOperation {
  const result: OpenApiOperation = {
    method,
    path,
    tags: arrayOf(operation.tags).filter((tag): tag is string => typeof tag === 'string'),
    parameters: [],
    ...(typeof operation.operationId === 'string' ? { operationId: operation.operationId } : {}),
    ...(typeof operation.summary === 'string' ? { summary: operation.summary } : {}),
    ...(typeof operation.description === 'string' ? { description: operation.description } : {}),
  };
  // Operation-level parameters override path-level ones with the same name and location.
  const byKey = new Map<string, OpenApiParameter>();
  for (const raw of [...shared, ...arrayOf(operation.parameters)]) {
    const parameter = resolver.resolve(raw);
    if (!isRecord(parameter) || typeof parameter.name !== 'string') continue;
    const location = parameter.in;
    // Cookie parameters are not supported: they are left out of the tool.
    if (location !== 'path' && location !== 'query' && location !== 'header') continue;
    byKey.set(`${location}:${parameter.name}`, {
      name: parameter.name,
      in: location,
      required: location === 'path' || parameter.required === true,
      ...(typeof parameter.description === 'string' ? { description: parameter.description } : {}),
      schema: parameterSchema(resolver, parameter),
    });
  }
  result.parameters = [...byKey.values()];

  const body = resolver.resolve(operation.requestBody);
  if (isRecord(body) && isRecord(body.content)) {
    const jsonType = Object.keys(body.content).find((type) =>
      /^application\/(.+\+)?json/i.test(type)
    );
    const media = jsonType ? body.content[jsonType] : undefined;
    if (isRecord(media)) {
      result.body = {
        required: body.required === true,
        schema: schemaOrAny(resolver.resolve(media.schema)),
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
      };
    } else if (body.required === true) {
      result.unsupported = `request body is not JSON (${Object.keys(body.content).join(', ')})`;
    }
  }
  return result;
}

function parameterSchema(resolver: RefResolver, parameter: Record<string, unknown>): JsonSchema {
  if (parameter.schema !== undefined) {
    return schemaOrAny(resolver.resolve(parameter.schema));
  }
  if (isRecord(parameter.content)) {
    const first = Object.values(parameter.content)[0];
    if (isRecord(first)) {
      return schemaOrAny(resolver.resolve(first.schema));
    }
  }
  return {};
}

function schemaOrAny(value: unknown): JsonSchema {
  return isRecord(value) ? value : {};
}

/** Resolves local `$ref`s (`#/components/...`), with a cycle guard and a size budget. */
class RefResolver {
  private nodes = 0;

  constructor(
    private readonly root: Record<string, unknown>,
    private readonly spec: { nodes: number }
  ) {}

  /** Follows a chain of `$ref`s at the top level only. */
  follow(value: unknown): unknown {
    let current = value;
    for (let hops = 0; hops < 16 && isRecord(current) && typeof current.$ref === 'string'; hops++) {
      if (!current.$ref.startsWith('#/')) return undefined;
      current = this.lookup(current.$ref);
    }
    return current;
  }

  resolve(value: unknown, stack: readonly string[] = []): unknown {
    this.nodes++;
    this.spec.nodes++;
    if (Array.isArray(value)) {
      return value.map((item) => this.resolve(item, stack));
    }
    if (!isRecord(value)) {
      return value;
    }
    const { $ref: ref, ...siblings } = value;
    if (typeof ref === 'string') {
      if (!ref.startsWith('#/')) {
        return { description: `External reference ${ref} (not resolved)` };
      }
      if (stack.includes(ref)) {
        return { description: `Recursive reference to ${ref}` };
      }
      if (this.nodes > MAX_OPERATION_NODES || this.spec.nodes > MAX_SPEC_NODES) {
        return { description: `Reference ${ref} not expanded (schema too large)` };
      }
      const target = this.resolve(this.lookup(ref), [...stack, ref]);
      const extra = this.resolve(siblings, stack);
      return isRecord(target) && isRecord(extra) ? { ...target, ...extra } : target;
    }
    const resolved: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      resolved[key] = this.resolve(item, stack);
    }
    return resolved;
  }

  private lookup(ref: string): unknown {
    let current: unknown = this.root;
    for (const raw of ref.slice(2).split('/')) {
      const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
      // Own properties only: `#/constructor` must not reach into the object prototype.
      if (!isRecord(current) || !Object.hasOwn(current, key)) {
        return { description: `Unresolved reference ${ref}` };
      }
      current = current[key];
    }
    return current;
  }
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
