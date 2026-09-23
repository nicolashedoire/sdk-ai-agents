import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodSchemaToJsonSchema } from '../utils/zod-to-json-schema.js';

describe('tool parameter schemas', () => {
  it('tell the model every valid value, description and nested field', () => {
    const schema = z.object({
      metric: z.enum(['monthly_churn', 'active_customers']).describe('Metric to read'),
      window: z.object({ from: z.string(), to: z.string().optional() }).optional(),
      tags: z.array(z.string()).default([]),
      limit: z.number().int().min(1),
    });

    expect(zodSchemaToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['monthly_churn', 'active_customers'], description: 'Metric to read' },
        window: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          required: ['from'],
          additionalProperties: false,
        },
        tags: { type: 'array', items: { type: 'string' }, default: [] },
        limit: { type: 'integer', minimum: 1 },
      },
      required: ['metric', 'limit'],
      additionalProperties: false,
    });
  });

  it('always describes an object, as function-calling APIs require', () => {
    expect(zodSchemaToJsonSchema(z.string())).toEqual({ type: 'object', properties: {} });
  });
});
