import { ValidationError } from '../errors/index.js';
import type { JsonSchema, OpenApiOperation } from './openapi-spec.js';

/** Where one tool argument goes in the HTTP request. */
export interface ArgumentBinding {
  argument: string;
  location: 'path' | 'query' | 'header' | 'body';
  /** Name in the request (parameter name; unused for the body). */
  name: string;
  required: boolean;
}

/** A request ready to send, built only from checked arguments. */
export interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** Longest JSON Schema of one tool, in characters; larger ones are replaced by a note. */
const MAX_TOOL_SCHEMA_CHARS = 64_000;

/**
 * Flat tool arguments for an operation: one per parameter, plus `body` for a JSON request
 * body. A name used twice gets its location as a prefix (`query_id`); if that name is taken
 * too, the operation is refused rather than having two parameters share one argument.
 */
export function bindArguments(operation: OpenApiOperation): {
  bindings: ArgumentBinding[];
  inputSchema: JsonSchema;
} {
  const label = operation.operationId ?? `${operation.method.toUpperCase()} ${operation.path}`;
  const bindings: ArgumentBinding[] = [];
  const properties: Record<string, unknown> = {};
  const taken = new Set<string>();
  const claim = (preferred: string, fallback: string): string => {
    const name = taken.has(preferred) ? fallback : preferred;
    if (taken.has(name)) {
      throw new ValidationError(
        'spec',
        `${label}: two parameters would share the argument name "${name}"`
      );
    }
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
      properties: boundedProperties(properties),
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
  };
}

/** Keeps a tool's schema small enough to send: an oversized one keeps only descriptions. */
function boundedProperties(properties: Record<string, unknown>): Record<string, unknown> {
  if (JSON.stringify(properties).length <= MAX_TOOL_SCHEMA_CHARS) {
    return properties;
  }
  const reduced: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(properties)) {
    const description =
      typeof schema === 'object' && schema !== null
        ? Reflect.get(schema, 'description')
        : undefined;
    reduced[name] = {
      description: `${typeof description === 'string' ? `${description.slice(0, 500)} ` : ''}(schema too large to show)`,
    };
  }
  return reduced;
}

/**
 * Checks the arguments and builds the request, or throws a `ValidationError` saying which
 * argument is wrong. Nothing is sent here: the same check runs before policies and
 * approvals, then again when the call is made.
 */
export function prepareRequest(
  operation: OpenApiOperation,
  bindings: ArgumentBinding[],
  baseUrl: URL,
  configuredHeaders: Record<string, string>,
  args: Record<string, unknown>
): PreparedRequest {
  const known = new Set(bindings.map((binding) => binding.argument));
  for (const name of Object.keys(args)) {
    if (!known.has(name)) {
      const expected = [...known].join(', ') || 'none';
      throw new ValidationError(name, `unknown argument (expected: ${expected})`);
    }
  }

  let path = operation.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = { accept: 'application/json' };
  let body: string | undefined;
  for (const binding of bindings) {
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
  for (const [name, value] of Object.entries(configuredHeaders)) {
    headers[name.toLowerCase()] = value;
  }
  const unresolved = /\{([^}]+)\}/.exec(path);
  if (unresolved) {
    throw new ValidationError('path', `{${unresolved[1]}} is not a declared path parameter`);
  }
  return {
    url: requestUrl(baseUrl, path, query),
    headers,
    ...(body !== undefined ? { body } : {}),
  };
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

/**
 * One path segment. Slashes, backslashes and `.` / `..` segments are refused even when
 * percent-encoded (once or several times): servers and proxies that decode them would
 * otherwise let a value walk up the path, with your credentials.
 */
function pathSegment(argument: string, value: unknown): string {
  const text = scalar(argument, value);
  let decoded = text;
  for (let round = 0; round < 5; round++) {
    if (decoded === '' || decoded === '.' || decoded === '..' || /[/\\]/.test(decoded)) {
      throw new ValidationError(argument, `"${text}" is not a valid path parameter`);
    }
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (next === decoded) break;
    decoded = next;
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
