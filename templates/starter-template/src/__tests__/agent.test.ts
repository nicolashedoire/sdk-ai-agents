import { describe, it, expect } from 'vitest';
import { createSDK } from '@sdk-ai-agents/core';
import { z } from 'zod';
import { defineTool } from '@sdk-ai-agents/core';

describe('Agent', () => {
  it('should create an SDK instance', () => {
    const sdk = createSDK({
      apiKey: 'test-key',
    });
    expect(sdk).toBeDefined();
  });

  it('should create an agent with tools', () => {
    const sdk = createSDK({
      apiKey: 'test-key',
    });

    const calculatorTool = defineTool({
      name: 'calculator',
      description: 'Performs basic arithmetic',
      schema: z.object({
        operation: z.enum(['add', 'subtract']),
        a: z.number(),
        b: z.number(),
      }),
      handler: async ({ operation, a, b }) => {
        return operation === 'add' ? a + b : a - b;
      },
    });

    const agent = sdk.createAgent({
      name: 'test-agent',
      model: 'gpt-4',
      tools: [calculatorTool],
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-agent');
  });
});

