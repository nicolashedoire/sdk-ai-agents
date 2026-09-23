import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type Converter = (
  schema: ZodTypeAny,
  options: { $refStrategy: 'none'; target: 'jsonSchema7' }
) => Record<string, unknown>;

// The library's generic signature makes TypeScript give up (TS2589, "excessively deep")
// even on assignment, so it is viewed through the narrower signature the SDK uses.
const convert = zodToJsonSchema as unknown as Converter;

/**
 * JSON Schema of a tool's parameters, as sent to LLM providers and MCP clients. Enum values,
 * descriptions, nested objects and array items are kept: without them a model has to guess
 * valid arguments. References are inlined because function-calling APIs do not resolve them.
 */
export function zodSchemaToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const { $schema: _dialect, ...json } = convert(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });
  return json.type === 'object' ? json : { type: 'object', properties: {} };
}
