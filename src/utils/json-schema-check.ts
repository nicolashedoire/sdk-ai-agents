/**
 * Checks a value against a JSON Schema, for a subset of its keywords: `type`, `enum`, `const`,
 * `properties`, `required`, `additionalProperties`, `items`, `minItems`, `maxItems`,
 * `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`,
 * `prefixItems`, `allOf`, `anyOf` and `oneOf` (read as `anyOf`), and OpenAPI's `nullable`.
 * Any other keyword (`$ref`, `pattern`, `format`, `not`, `if`…) is not checked: the owner of
 * the schema checks it. So a problem reported here breaks the published schema (a lenient
 * server may still accept it: extra keys dropped, "5" read as 5), and a value accepted here
 * may still be refused. A key whose value is `undefined` counts as absent, as in JSON.
 */

export interface SchemaProblem {
  /** Where the problem is, from the root: property names and array indexes. */
  path: Array<string | number>;
  message: string;
}

const MAX_DEPTH = 32;
const MAX_PROBLEMS = 10;

export function jsonSchemaProblems(schema: unknown, value: unknown): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  check(schema, value, [], 0, problems);
  return problems.slice(0, MAX_PROBLEMS);
}

function check(
  schema: unknown,
  value: unknown,
  path: Array<string | number>,
  depth: number,
  problems: SchemaProblem[]
): void {
  if (problems.length >= MAX_PROBLEMS || depth > MAX_DEPTH) return;
  if (schema === false) {
    problems.push({ path, message: 'no value is allowed here' });
    return;
  }
  // `true`, a missing schema, or a reference this subset does not resolve: nothing to check.
  if (!isRecord(schema) || typeof schema.$ref === 'string') return;
  // OpenAPI 3.0: `nullable: true` allows null whatever `type` and `enum` say.
  if (value === null && schema.nullable === true) return;

  const types = typeList(schema.type);
  if (types && !types.some((type) => hasType(value, type))) {
    problems.push({ path, message: `expected ${types.join(' or ')}, got ${typeOf(value)}` });
    return;
  }
  if (
    Array.isArray(schema.enum) &&
    schema.enum.every(isPrimitive) &&
    !(schema.enum as unknown[]).includes(value)
  ) {
    problems.push({ path, message: `expected one of ${schema.enum.map(show).join(', ')}` });
  }
  if (isPrimitive(schema.const) && value !== schema.const) {
    problems.push({ path, message: `expected ${show(schema.const)}` });
  }

  if (typeof value === 'string') checkString(schema, value, path, problems);
  if (typeof value === 'number') checkNumber(schema, value, path, problems);
  if (Array.isArray(value)) checkArray(schema, value, path, depth, problems);
  if (isRecord(value)) checkObject(schema, value, path, depth, problems);

  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) check(part, value, path, depth + 1, problems);
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const options = schema[keyword];
    if (!Array.isArray(options) || options.length === 0) continue;
    const fits = options.some((option) => {
      const found: SchemaProblem[] = [];
      check(option, value, path, depth + 1, found);
      return found.length === 0;
    });
    if (!fits) problems.push({ path, message: `matches none of the ${keyword} schemas` });
  }
}

function checkString(
  schema: Record<string, unknown>,
  value: string,
  path: Array<string | number>,
  problems: SchemaProblem[]
): void {
  // JSON Schema counts characters (code points), not UTF-16 units.
  const length = [...value].length;
  if (isCount(schema.minLength) && length < schema.minLength) {
    problems.push({ path, message: `at least ${schema.minLength} characters` });
  }
  if (isCount(schema.maxLength) && length > schema.maxLength) {
    problems.push({ path, message: `at most ${schema.maxLength} characters` });
  }
}

function checkNumber(
  schema: Record<string, unknown>,
  value: number,
  path: Array<string | number>,
  problems: SchemaProblem[]
): void {
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema;
  if (typeof minimum === 'number' && value < minimum) {
    problems.push({ path, message: `at least ${minimum}` });
  }
  if (typeof maximum === 'number' && value > maximum) {
    problems.push({ path, message: `at most ${maximum}` });
  }
  // The number form (draft 6 and later); the boolean form of draft 4 is left alone.
  if (typeof exclusiveMinimum === 'number' && value <= exclusiveMinimum) {
    problems.push({ path, message: `more than ${exclusiveMinimum}` });
  }
  if (typeof exclusiveMaximum === 'number' && value >= exclusiveMaximum) {
    problems.push({ path, message: `less than ${exclusiveMaximum}` });
  }
}

function checkArray(
  schema: Record<string, unknown>,
  value: unknown[],
  path: Array<string | number>,
  depth: number,
  problems: SchemaProblem[]
): void {
  if (isCount(schema.minItems) && value.length < schema.minItems) {
    problems.push({ path, message: `at least ${schema.minItems} items` });
  }
  if (isCount(schema.maxItems) && value.length > schema.maxItems) {
    problems.push({ path, message: `at most ${schema.maxItems} items` });
  }
  // JSON Schema 2020-12: `prefixItems` gives the first items one schema each, and `items`
  // covers only the items after them. The older tuple form (`items: [...]`) is not checked.
  const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
  value.forEach((item, index) => {
    if (index < prefix.length) {
      check(prefix[index], item, [...path, index], depth + 1, problems);
    } else if (isRecord(schema.items) || typeof schema.items === 'boolean') {
      check(schema.items, item, [...path, index], depth + 1, problems);
    }
  });
}

function checkObject(
  schema: Record<string, unknown>,
  value: Record<string, unknown>,
  path: Array<string | number>,
  depth: number,
  problems: SchemaProblem[]
): void {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      if (typeof name === 'string' && (!Object.hasOwn(value, name) || value[name] === undefined)) {
        problems.push({ path: [...path, name], message: 'required' });
      }
    }
  }
  for (const [name, item] of Object.entries(value)) {
    // Absent once sent as JSON.
    if (item === undefined) continue;
    if (Object.hasOwn(properties, name)) {
      check(properties[name], item, [...path, name], depth + 1, problems);
    } else if (!isRecord(schema.patternProperties)) {
      // With pattern properties, which names are extra depends on patterns this does not read.
      if (schema.additionalProperties === false) {
        problems.push({ path: [...path, name], message: 'unknown argument' });
      } else if (isRecord(schema.additionalProperties)) {
        check(schema.additionalProperties, item, [...path, name], depth + 1, problems);
      }
    }
  }
}

function typeList(type: unknown): string[] | undefined {
  if (typeof type === 'string') return [type];
  if (Array.isArray(type) && type.every((entry) => typeof entry === 'string')) return type;
  return undefined;
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      // A type this subset does not know: accepted, the owner of the schema decides.
      return true;
  }
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}
