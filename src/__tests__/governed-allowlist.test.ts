import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

/** Model stand-in that always asks for a tool the agent should not be able to run. */
class AsksForDeletion implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    return {
      content: null,
      toolCalls: [{ function: { name: 'delete_customer', arguments: '{"customerId":"c-42"}' } }],
      model: request.model,
    };
  }
  supportsModel(): boolean {
    return true;
  }
  getProviderName(): string {
    return 'test';
  }
}

describe('governed agent with an allowlist policy', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('never runs a registered tool outside the allowlist', async () => {
    env = createTestSDK({ llmProvider: new AsksForDeletion() });
    let deleted = false;
    const schema = z.object({ customerId: z.string() });
    const lookup = env.sdk.defineTool({
      name: 'lookup_customer',
      description: 'Reads a customer',
      schema,
      handler: async ({ customerId }) => ({ customerId }),
    });
    env.sdk.defineTool({
      name: 'delete_customer',
      description: 'Deletes a customer',
      schema,
      handler: async () => {
        deleted = true;
        return 'deleted';
      },
    });
    const agent = env.sdk.createAgent({
      name: 'support',
      model: 'test-model',
      tools: [lookup],
      policies: [
        {
          id: 'support-tools',
          type: 'allowlist',
          scope: 'agent',
          enabled: true,
          rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
        },
      ],
    });

    const result = await agent.run({ message: 'Delete customer c-42' });

    expect(deleted).toBe(false);
    expect(result.status).toBe('failed');
    const events = await env.sdk.getEvents(result.runId);
    expect(events.find((event) => event.type === 'policy.violated')?.data.reason).toBe(
      'Tool "delete_customer" not in allowlist'
    );
  });
});
