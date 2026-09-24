import { ValidationError } from '../errors/index.js';
import { clip, readBoundedText } from './bounded-text.js';
import type { JsonSchema, OpenApiFetch, OpenApiOperation } from './openapi-spec.js';

/** Where one tool argument goes in the HTTP request. */
export interface ArgumentBinding {
  argument: string;
  location: 'path' | 'query' | 'header' | 'body';
  /** Name in the request (parameter name; unused for the body). */
  name: string;
  required: boolean;
}

/** What an operation tool returns: the HTTP status and the parsed body. */
export interface OpenApiResult {
  status: number;
  data: unknown;
  /** Set when the body was longer than `maxResponseBytes` and was cut. */
  truncated?: true;
}

export interface OperationCall {
  operation: OpenApiOperation;
  bindings: ArgumentBinding[];
  baseUrl: URL;
  headers: Record<string, string>;
  fetch: OpenApiFetch;
  timeoutMs: number;
  maxResponseBytes: number;
}

/**
 * Flat tool arguments for an operation: one per parameter, plus `body` for a JSON request
 * body. A name used twice gets its location as a prefix (`query_id`).
 */
export function bindArguments(operation: OpenApiOperation): {
  bindings: ArgumentBinding[];
  inputSchema: JsonSchema;
} {
  const bindings: ArgumentBinding[] = [];
  const properties: Record<string, unknown> = {};
  const taken = new Set<string>();
  const claim = (preferred: string, fallback: string): string => {
    const name = taken.has(preferred) ? fallback : preferred;
    taken.add(name);
    return name;
  };
  for (const parameter of operation.parameters) {
    const argument = claim(parameter.name, `${parameter.in}_${parameter.name}`);
    bindings.push({
      argument,
      location: parameter.in,
      name: parameter.name,
      required: parameter.required,
    });
    const description = parameter.description ?? stringField(parameter.schema, 'description');
    const where = parameter.in === 'header' ? `HTTP header ${parameter.name}` : undefined;
    const text = [description, where].filter((part) => part !== undefined).join(' — ');
    properties[argument] = { ...parameter.schema, ...(text ? { description: text } : {}) };
  }
  if (operation.body) {
    const argument = claim('body', 'requestBody');
    bindings.push({
      argument,
      location: 'body',
      name: argument,
      required: operation.body.required,
    });
    properties[argument] = {
      ...operation.body.schema,
      description: operation.body.description ?? 'JSON request body',
    };
  }
  const required = bindings
    .filter((binding) => binding.required)
    .map((binding) => binding.argument);
  return {
    bindings,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
  };
}

/** Sends one operation and returns its result; a non-2xx status is an error. */
export async function callOperation(
  call: OperationCall,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<OpenApiResult> {
  const known = new Set(call.bindings.map((binding) => binding.argument));
  for (const name of Object.keys(args)) {
    if (!known.has(name)) {
      const expected = [...known].join(', ') || 'none';
      throw new ValidationError(name, `unknown argument (expected: ${expected})`);
    }
  }

  const label = `${call.operation.method.toUpperCase()} ${call.operation.path}`;
  let path = call.operation.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = { accept: 'application/json' };
  let body: string | undefined;
  for (const binding of call.bindings) {
    const value = args[binding.argument];
    if (value === undefined || value === null) {
      if (binding.required) {
        throw new ValidationError(binding.argument, 'missing required argument');
      }
      continue;
    }
    switch (binding.location) {
      case 'path':
        path = path.split(`{${binding.name}}`).join(pathSegment(binding.argument, value));
        break;
      case 'query':
        for (const item of Array.isArray(value) ? value : [value]) {
          query.append(binding.name, scalar(binding.argument, item));
        }
        break;
      case 'header':
        headers[binding.name.toLowerCase()] = headerValue(binding.argument, value);
        break;
      case 'body':
        body = JSON.stringify(value);
        headers['content-type'] = 'application/json';
        break;
    }
  }
  // Configured headers (authentication) always win over values chosen by the model.
  for (const [name, value] of Object.entries(call.headers)) {
    headers[name.toLowerCase()] = value;
  }
  const unresolved = /\{([^}]+)\}/.exec(path);
  if (unresolved) {
    throw new ValidationError('path', `{${unresolved[1]}} is not a declared path parameter`);
  }

  const url = requestUrl(call.baseUrl, path, query);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, call.timeoutMs);
  let status: number;
  let contentType: string | null;
  let content: { text: string; truncated: boolean };
  try {
    const response = await call.fetch(url, {
      method: call.operation.method.toUpperCase(),
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: controller.signal,
      redirect: 'manual',
    });
    status = response.status;
    contentType = response.headers.get('content-type');
    content = await readBoundedText(response, call.maxResponseBytes);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(`${label} timed out after ${call.timeoutMs} ms`);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${reason}`, { cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
  if (status < 200 || status >= 300) {
    const redirect = status >= 300 && status < 400;
    const detail = redirect ? 'redirects are not followed' : clip(content.text.trim(), 500);
    throw new Error(`${label} returned HTTP ${status}${detail ? `: ${detail}` : ''}`);
  }
  return toResult(status, contentType, content);
}

function toResult(
  status: number,
  contentType: string | null,
  content: { text: string; truncated: boolean }
): OpenApiResult {
  if (content.truncated) {
    return { status, data: content.text, truncated: true };
  }
  if (content.text === '') {
    return { status, data: null };
  }
  if (contentType && /json/i.test(contentType)) {
    try {
      const data: unknown = JSON.parse(content.text);
      return { status, data };
    } catch {
      return { status, data: content.text };
    }
  }
  return { status, data: content.text };
}

/** The final URL must stay under the base URL: same origin, same base path. */
function requestUrl(baseUrl: URL, path: string, query: URLSearchParams): string {
  const basePath = baseUrl.pathname.replace(/\/+$/, '');
  const search = query.toString();
  const url = new URL(`${basePath}${path}${search ? `?${search}` : ''}`, baseUrl.origin);
  const inside = url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
  if (url.origin !== baseUrl.origin || !inside) {
    throw new ValidationError('path', `the request would leave ${baseUrl.origin}${basePath}`);
  }
  return url.toString();
}

function pathSegment(argument: string, value: unknown): string {
  const text = scalar(argument, value);
  if (text === '' || text === '.' || text === '..') {
    throw new ValidationError(argument, `"${text}" is not a valid path parameter`);
  }
  return encodeURIComponent(text);
}

function headerValue(argument: string, value: unknown): string {
  const text = scalar(argument, value);
  if (/[\r\n]/.test(text)) {
    throw new ValidationError(argument, 'header values cannot contain line breaks');
  }
  return text;
}

function scalar(argument: string, value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  throw new ValidationError(argument, 'expected a string, a number or a boolean');
}

function stringField(schema: JsonSchema, key: string): string | undefined {
  const value = schema[key];
  return typeof value === 'string' ? value : undefined;
}
