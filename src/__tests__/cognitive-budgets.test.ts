import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LLMThoughtGenerator } from '../cognition/llm-thought-generator.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';
import type { Policy } from '../types/policy.js';
import type { SDKConfig } from '../types/sdk.js';
import { InMemoryDecisionClient, level, yes } from './support/in-memory-decision-client.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { channelOf, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  createTestSDK,
  lookupMetricDefinition,
  scriptBuildOrBuy,
  type TestSDK,
} from './support/test-sdk.js';
import { openAIChat } from './support/vendor-api.js';

// Budgets per period must count a cognitive run's model calls exactly as `getRunCost` prices
// them: the same calls, tokens and cost, and the same calls whose cost is unknown. Each test
// makes one kind of billed call happen and compares the two.
const PROBLEM = 'Should we build or buy the analytics module?';

// $1 per token: costs read as token counts.
const PRICING = {
  'test-model': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
  'gpt-4o': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
};

interface Shape {
  /** Tokens of an answer the provider discards (billed, then unusable) before answering. */
  discardedTokens?: (channel: string) => number;
  /** Answers reported without any token counts. */
  unmetered?: (channel: string) => boolean;
  /** Tool selections whose arguments are not valid JSON. */
  unreadableArguments?: boolean;
}

/**
 * The scripted build-or-buy provider, reshaped per channel (the operation, or
 * `tool-selection`): it can discard a billed answer first (`onDiscardedAnswer`, as the
 * OpenAI provider does with an empty answer), drop the usage, or break the tool arguments.
 */
class ReshapingProvider implements LLMProvider {
  constructor(
    private readonly inner: ScriptedLLMProvider,
    private readonly shape: Shape
  ) {}

  get requests(): LLMRequest[] {
    return this.inner.requests;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const channel = channelOf(request);
    const discarded = this.shape.discardedTokens?.(channel) ?? 0;
    if (discarded > 0) {
      request.onDiscardedAnswer?.({
        provider: 'scripted',
        model: request.model,
        usage: { promptTokens: discarded, completionTokens: 0, totalTokens: discarded },
        reason: 'No response from LLM',
      });
    }
    const response = await this.inner.generateCompletion(request);
    if (this.shape.unmetered?.(channel)) {
      const { usage: _usage, ...unmetered } = response;
      return unmetered;
    }
    if (this.shape.unreadableArguments && response.toolCalls) {
      return {
        ...response,
        toolCalls: response.toolCalls.map((call) => ({
          function: { name: call.function.name, arguments: '{"metric": ' },
        })),
      };
    }
    return response;
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'scripted';
  }
}

/** A file event store that cannot write one type of event (a full disk, a failing database). */
class RefusingEventStore extends FileEventStore {
  constructor(
    directory: string,
    private readonly refused: Event['type']
  ) {
    super(directory);
  }

  override async append(runId: string, event: Event): Promise<void> {
    if (event.type === this.refused) throw new Error(`cannot write ${event.type}`);
    return super.append(runId, event);
  }
}

function ofType(events: Event[], type: Event['type']): Event[] {
  return events.filter((event) => event.type === type);
}

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("budgets per period count a cognitive run's calls as its cost report does", () => {
  let env: TestSDK;
  let lookups: number;
  let openai: LocalHttpServer | undefined;
  let refusing: { store: RefusingEventStore; directory: string } | undefined;

  afterEach(async () => {
    await openai?.stop();
    openai = undefined;
    await env.dispose();
    if (refusing) {
      await refusing.store.destroy();
      rmSync(refusing.directory, { recursive: true, force: true });
      refusing = undefined;
    }
  });

  function analyst(
    shape: Shape,
    overrides: Partial<SDKConfig> = {},
    config: { policies?: Policy[]; assessment?: 'typed' } = {}
  ) {
    const provider = new ReshapingProvider(scriptBuildOrBuy(new ScriptedLLMProvider()), shape);
    env = createTestSDK({ llmProvider: provider, ...overrides });
    lookups = 0;
    const tool = env.sdk.defineTool({
      ...lookupMetricDefinition,
      handler: async (params: unknown) => {
        lookups++;
        return lookupMetricDefinition.handler(params);
      },
    });
    const agent = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [tool],
      controller: 'heuristic',
      ...(config.assessment ? { assessment: config.assessment } : {}),
      ...(config.policies ? { policies: config.policies } : {}),
    });
    return { agent, provider };
  }

  /** Budgets and the run's cost report agree on every count; the report is returned. */
  async function expectBudgetsToMatchRunCost(runId: string, agentId: string) {
    const cost = await env.sdk.getRunCost(runId);
    const usage = await env.sdk.getBudgetUsage({ agentId, period: 'all' });
    const tokens = cost.lines.reduce((sum, line) => sum + line.inputTokens + line.outputTokens, 0);
    expect({
      tokensUsed: usage.tokensUsed,
      unpricedCalls: usage.unpricedCalls,
      unmeteredCalls: usage.unmeteredCalls,
    }).toEqual({
      tokensUsed: tokens,
      unpricedCalls: cost.unpricedCalls,
      unmeteredCalls: cost.unmeteredCalls,
    });
    expect(usage.costUsd).toBeCloseTo(cost.totalUsd, 6);
    return cost;
  }

  it('counts thoughts that reported no token counts as calls whose cost is unknown', async () => {
    const { agent, provider } = analyst({ unmetered: () => true }, { pricing: PRICING });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const cost = await expectBudgetsToMatchRunCost(result.runId, agent.id);
    // Every call, thoughts and tool selection alike: $0 known, none taken as free.
    expect(cost).toMatchObject({ totalUsd: 0, unmeteredCalls: provider.requests.length });
  });

  it('refuses the next step once a thought reported no token counts under a cost cap', async () => {
    const { agent } = analyst(
      { unmetered: (channel) => channel === 'represent' },
      { pricing: PRICING }
    );
    env.sdk.defineGlobalPolicy({
      id: 'cost-cap',
      type: 'budget',
      scope: 'global',
      enabled: true,
      rules: [
        {
          condition: 'budgetLimit',
          action: 'deny',
          metadata: { budgetLimit: { period: 'all', maxCost: 1_000_000 } },
        },
      ],
    });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain(
      'Cost budget cannot be checked: 1 model call(s) without input and output token counts'
    );
  });

  it('counts the answer a provider discarded on a tool selection', async () => {
    const { agent } = analyst(
      { discardedTokens: (channel) => (channel === 'tool-selection' ? 1_000 : 0) },
      { pricing: PRICING }
    );

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const cost = await expectBudgetsToMatchRunCost(result.runId, agent.id);
    expect(cost.totalUsd).toBe(1_900);
  });

  it('counts a tool selection whose arguments are not valid JSON', async () => {
    const { agent } = analyst({ unreadableArguments: true }, { pricing: PRICING });

    const result = await agent.think({ problem: PROBLEM });

    expect(lookups).toBe(0);
    const events = await env.sdk.getEvents(result.runId);
    expect(ofType(events, 'intention.generated').length).toBeGreaterThan(1);
    await expectBudgetsToMatchRunCost(result.runId, agent.id);
  });

  it('counts the answers a provider discarded on thoughts', async () => {
    const { agent } = analyst(
      { discardedTokens: (channel) => (channel === 'tool-selection' ? 0 : 1_000) },
      { pricing: PRICING }
    );

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const cost = await expectBudgetsToMatchRunCost(result.runId, agent.id);
    // 7 thoughts, each after an answer of 1 000 tokens the provider discarded.
    expect(cost.totalUsd).toBe(900 + 7_000);
  });

  it('counts the billed attempts of an operation a stop cut short', async () => {
    openai = new LocalHttpServer();
    openai.reply(
      openAIChat({ model: 'gpt-4o', content: 'not json', usage: { prompt: 30, completion: 3 } }),
      { ...openAIChat({ model: 'gpt-4o', content: 'too late' }), delayMs: 10_000 }
    );
    const server = openai;
    const provider = new OpenAIProvider('k', 'gpt-4o', {
      baseURL: `${await server.start()}/v1`,
      maxRetries: 0,
    });
    env = createTestSDK({ llmProvider: provider, pricing: PRICING });
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o' });

    const running = agent.think({ problem: PROBLEM });
    await until(() => server.requests.length === 2);
    await agent.stop();
    const result = await running;

    expect(result.status).toBe('cancelled');
    const cost = await expectBudgetsToMatchRunCost(result.runId, agent.id);
    expect(cost.totalUsd).toBe(33);
  });

  it('counts every call once', async () => {
    // No price: every call is counted in `unpricedCalls`, which a double count would inflate.
    const client = new InMemoryDecisionClient((id, question) =>
      id === 'ready_to_decide' ? yes(0.1) : level(question, id.includes('H2') ? 4 : 1)
    );
    const { agent, provider } = analyst(
      {
        discardedTokens: (channel) =>
          channel === 'represent' || channel === 'tool-selection' ? 50 : 0,
      },
      { decisionClient: client },
      { assessment: 'typed' }
    );

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const events = await env.sdk.getEvents(result.runId);
    const discarded = ofType(events, 'provider.answer_discarded').length;
    expect(discarded).toBe(2);
    const cost = await expectBudgetsToMatchRunCost(result.runId, agent.id);
    expect(cost.unpricedCalls).toBe(provider.requests.length + discarded + client.requests.length);
  });

  it('counts a thought whose usage is malformed as its cost report does', async () => {
    const provider = scriptBuildOrBuy(new ScriptedLLMProvider());
    env = createTestSDK({ pricing: PRICING }, provider);
    const llm = new LLMThoughtGenerator(provider, { model: 'test-model' });
    const agent = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      // A custom generator reporting an impossible number of calls.
      generator: {
        generate: async (request) => {
          const thought = await llm.generate(request);
          return thought.usage ? { ...thought, usage: { ...thought.usage, calls: 0 } } : thought;
        },
      },
    });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const cost = await expectBudgetsToMatchRunCost(result.runId, agent.id);
    // A count that is not a whole number above 0 counts one call; the tokens the thought
    // reported are read all the same (the whole usage used to be dropped).
    expect(cost.unmeteredCalls).toBe(0);
    expect(cost.lines.reduce((calls, line) => calls + line.calls, 0)).toBe(
      provider.requests.length
    );
    expect(cost.totalUsd).toBeGreaterThan(0);
  });

  it("refuses again, in a replay, a call the discarded answers put over the run's tokens", async () => {
    // 480 tokens after 4 steps; the tool selection's discarded answer (700) and its own answer
    // (60) bring the run to 1 240 at the tool call: over the 1 000 allowed.
    const { agent } = analyst(
      { discardedTokens: (channel) => (channel === 'tool-selection' ? 700 : 0) },
      {},
      {
        policies: [
          {
            id: 'run-tokens',
            type: 'budget',
            scope: 'agent',
            enabled: true,
            rules: [{ condition: 'maxTokens', action: 'deny', metadata: { value: 1_000 } }],
          },
        ],
      }
    );
    const original = await agent.think({ problem: PROBLEM });
    expect(original.status).toBe('failed');
    expect(lookups).toBe(0);

    const replay = await env.sdk.replay(original.runId);

    expect(lookups).toBe(0);
    const violations = ofType(await env.sdk.getEvents(replay.runId), 'policy.violated');
    expect(violations.map((event) => event.data.reason)).toEqual(['Max tokens (1000) exceeded']);
  });

  it('counts a billed answer before its discarded answers are recorded', async () => {
    // A governed agent whose store cannot record the answer the provider discarded.
    const directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-refusing-'));
    refusing = {
      store: new RefusingEventStore(join(directory, 'events'), 'provider.answer_discarded'),
      directory,
    };
    const scripted = new ScriptedLLMProvider().always('tool-selection', { content: 'Done' });
    const provider = new ReshapingProvider(scripted, { discardedTokens: () => 30 });
    env = createTestSDK({ llmProvider: provider, eventStore: refusing.store, pricing: PRICING });
    const lookup = env.sdk.defineTool({
      ...lookupMetricDefinition,
      handler: async (params: unknown) => lookupMetricDefinition.handler(params),
    });
    const agent = env.sdk.createAgent({ name: 'governed', model: 'test-model', tools: [lookup] });

    const result = await agent.run({ message: 'Hi' });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('cannot write provider.answer_discarded');
    // The discarded answer (30 tokens) and the answer itself (120): both billed, both counted.
    expect(await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' })).toMatchObject({
      tokensUsed: 150,
      costUsd: 150,
    });
  });
});

describe('billed answers the store cannot record', () => {
  it('are reported on stderr, and the caller gets the original error', async () => {
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const script = join(
      process.cwd(),
      'src',
      '__tests__',
      'support',
      'unrecorded-billed-answers.ts'
    );
    const directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-unrecorded-'));
    const child = spawn(tsx, [script, join(directory, 'events')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      const code = await new Promise<number | null>((resolve) =>
        child.on('exit', (exitCode) => resolve(exitCode))
      );

      expect(code).toBe(0);
      expect(stdout).toContain('step failed: LLM provider error: test: No response from LLM');
      expect(stdout).toContain('decision failed: Decision client error (rejecting)');
      expect(stderr).toContain(
        'Discarded answers of run run_discarded could not be recorded: cannot write provider.answer_discarded'
      );
      expect(stderr).toContain(
        'The rejected decision of run run_rejected could not be recorded: cannot write decision.evaluated'
      );
    } finally {
      child.kill();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
