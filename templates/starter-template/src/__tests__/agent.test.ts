import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { createSDK, FileEventStore } from '@sdk-ai-agents/core';
import { z } from 'zod';
import { defineTool } from '@sdk-ai-agents/core';

describe('Agent', () => {
  // Tests record their events in a temporary folder, not in the project's ./events.
  let directory: string;
  let eventStore: FileEventStore;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agent-test-'));
    eventStore = new FileEventStore(directory);
  });

  afterEach(async () => {
    await eventStore.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  it('should create an SDK instance', () => {
    const sdk = createSDK({
      apiKey: 'test-key',
      eventStore,
    });
    expect(sdk).toBeDefined();
  });

  it('should create an agent with tools', () => {
    const sdk = createSDK({
      apiKey: 'test-key',
      eventStore,
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
      model: 'gpt-5.4',
      tools: [calculatorTool],
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-agent');
  });
});


