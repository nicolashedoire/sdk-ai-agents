import type { z } from 'zod';

export function zodSchemaToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null) {
    return {
      type: 'object',
      properties: {},
    };
  }

  const zodSchema = schema as {
    _def?: { typeName?: string; shape?: () => Record<string, unknown> };
  };

  if (zodSchema._def?.typeName === 'ZodObject') {
    const shape = zodSchema._def.shape?.() || {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as {
        _def?: { typeName?: string; innerType?: { _def?: { typeName?: string } } };
      };
      const typeName = zodValue._def?.typeName || '';

      if (typeName === 'ZodOptional') {
        const innerType = zodValue._def?.innerType?._def?.typeName || '';
        properties[key] = {
          type: zodTypeToJsonType(innerType),
        };
      } else {
        properties[key] = {
          type: zodTypeToJsonType(typeName),
        };
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return {
    type: 'object',
    properties: {},
  };
}

function zodTypeToJsonType(typeName: string): string {
  const typeMap: Record<string, string> = {
    ZodString: 'string',
    ZodNumber: 'number',
    ZodBoolean: 'boolean',
    ZodArray: 'array',
    ZodObject: 'object',
    ZodEnum: 'string',
    ZodLiteral: 'string',
  };

  return typeMap[typeName] || 'string';
}
