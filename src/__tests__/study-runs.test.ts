import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import type { StudyConfig } from '../study/study-types.js';
import type { Event } from '../types/events.js';
import type { SDKConfig } from '../types/sdk.js';
import { channelOf, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { defineSearchTool, REPLIES, scriptStudy, studyConfig } from './support/study-script.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

// $1 per token: costs read as token counts.
const PRICING = { 'test-model': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 } };

/**
 * The scripted study provider, reshaped per channel: it can discard a billed answer before
 * answering (`onDiscardedAnswer`, as the OpenAI provider does with an empty answer), or answer
 * without any token counts.
 */
class ReshapingProvider implements LLMProvider {
  constructor(
    readonly inner: ScriptedLLMProvider,
    private readonly shape: { discardOn?: string; unmeteredOn?: string }
  ) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const channel = channelOf(request);
    if (channel === this.shape.discardOn) {
      request.onDiscardedAnswer?.({
        provider: 'scripted',
        model: request.model,
        usage: { promptTokens: 30, completionTokens: 0, totalTokens: 30 },
        reason: 'No response from LLM',
      });
    }
    const response = await this.inner.generateCompletion(request);
    if (channel === this.shape.unmeteredOn) {
      const { usage: _usage, ...unmetered } = response;
      return unmetered;
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

describe('study runs', () => {
  let env: TestSDK | undefined;

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
  });

  function setup(
    config: Partial<StudyConfig> = {},
    options: { provider?: ScriptedLLMProvider; sdk?: Partial<SDKConfig> } = {}
  ) {
    const provider = scriptStudy(options.provider ?? new ScriptedLLMProvider());
    env = createTestSDK(options.sdk ?? {}, provider);
    const searches = defineSearchTool(env.sdk);
    const study = env.sdk.createStudy(studyConfig(config));
    return { env, study, provider, searches };
  }

  describe('costs', () => {
    it('counts a run’s model calls in getRunCost and in budgets per period alike', async () => {
      const scripted = scriptStudy(new ScriptedLLMProvider());
      // A reply that cannot be used, then its repair: two calls of one study.model_called.
      scripted.enqueue('study:observe', { content: 'not JSON' });
      scripted.enqueue('study:observe:repair', REPLIES.observe);
      const provider = new ReshapingProvider(scripted, {
        discardOn: 'study:decompose',
        unmeteredOn: 'study-check:decompose',
      });
      env = createTestSDK({ llmProvider: provider, pricing: PRICING }, scripted);
      defineSearchTool(env.sdk);
      const study = env.sdk.createStudy(studyConfig());

      const result = await study.run();

      expect(result.status).toBe('completed');
      const cost = await env.sdk.getRunCost(result.runId);
      const budget = await env.sdk.getBudgetUsage({ agentId: study.id, period: 'all' });
      // Every call the vendor answered: 19 answers (18 + a repair), one without token counts,
      // and one answer discarded after it was billed.
      const answered = scripted.requests.length;
      expect(answered).toBe(19);
      const meteredTokens = (answered - 1) * 120 + 30;
      expect(cost).toMatchObject({
        totalUsd: meteredTokens,
        complete: false,
        unmeteredCalls: 1,
        unpricedCalls: 0,
      });
      expect(cost.lines.reduce((calls, line) => calls + line.calls, 0)).toBe(answered + 1);
      expect(budget).toMatchObject({
        costUsd: cost.totalUsd,
        tokensUsed: meteredTokens,
        unmeteredCalls: cost.unmeteredCalls,
        unpricedCalls: cost.unpricedCalls,
        toolCallsCount: 4,
      });
      // Nothing else was counted: the budget for every caller is the study's.
      const all = await env.sdk.getBudgetUsage({ period: 'all' });
      expect(all.costUsd).toBe(cost.totalUsd);

      const discarded = await env.sdk.getEvents(result.runId, { type: 'provider.answer_discarded' });
      expect(discarded).toHaveLength(1);
      const calls = await env.sdk.getEvents(result.runId, { type: 'study.model_called' });
      expect(calls[0]?.data).toMatchObject({
        purpose: 'passage',
        passage: 'observe',
        model: 'test-model',
        requestedModel: 'test-model',
        usage: { promptTokens: 200, completionTokens: 40, calls: 2 },
      });
      expect(calls.map((event) => event.data.purpose)).toContain('priorArtCheck');
    });

    it('counts an amendment’s call in its own run', async () => {
      const scripted = new ScriptedLLMProvider();
      scripted.enqueue('study-amendment', {
        content: JSON.stringify({ verdict: 'refines', reason: 'Within the objective' }),
      });
      const { study, env } = setup({}, { provider: scripted, sdk: { pricing: PRICING } });

      const amendment = await study.amend('Examine memory safety too');

      expect((await env.sdk.getRunCost(amendment.runId)).totalUsd).toBe(120);
      expect((await env.sdk.getBudgetUsage({ agentId: study.id, period: 'all' })).costUsd).toBe(
        120
      );
    });
  });

  describe('limits', () => {
    it('stops at maxModelCalls with a partial report', async () => {
      const { study, env } = setup({ limits: { maxModelCalls: 5 } });

      const result = await study.run();

      expect(result).toMatchObject({ status: 'stopped', stoppedBy: 'maxModelCalls' });
      expect(result.error?.message).toBe('the run made its 5 model calls (limits.maxModelCalls)');
      expect(result.report.passages.map((state) => state.state)).toEqual([
        'complete',
        'complete',
        'notRun',
        'notRun',
        'notRun',
        'notRun',
        'notRun',
      ]);
      // What was done is kept.
      expect(result.report.observations).toHaveLength(2);
      expect(result.report.pieces).toHaveLength(2);
      expect(result.report.status).toBe('stopped');
      expect(result.report.notices.map((notice) => notice.code)).toEqual(
        expect.arrayContaining(['stopped', 'passagesNotRun'])
      );
      expect(result.report.stats.modelCalls).toBe(5);
      const events = await env.sdk.getEvents(result.runId);
      expect(events.at(-2)).toMatchObject({
        type: 'study.failed',
        data: { status: 'stopped', stoppedBy: 'maxModelCalls', partial: true },
      });
      expect(events.at(-1)?.type).toBe('run.failed');
    });

    it('keeps the items the guardian could not judge before the run stopped', async () => {
      const { study } = setup({ limits: { maxModelCalls: 1 } });

      const result = await study.run();

      expect(result.status).toBe('stopped');
      expect(result.report.observations.map((observation) => observation.unchecked)).toEqual([
        true,
        true,
      ]);
      expect(result.report.passages[0]).toMatchObject({ passage: 'observe', state: 'unchecked' });
      expect(result.report.notices).toContainEqual(
        expect.objectContaining({ code: 'uncheckedItems', details: ['observe'] })
      );
      expect(result.markdown).toContain('_not judged by the guardian_');
    });

    it('stops at timeoutMs with a partial report', async () => {
      const { study } = setup(
        { limits: { timeoutMs: 150 } },
        { provider: new ScriptedLLMProvider({ delayMs: 20 }) }
      );

      const result = await study.run();

      expect(result).toMatchObject({ status: 'stopped', stoppedBy: 'timeoutMs' });
      expect(result.report.observations.length).toBeGreaterThan(0);
      expect(result.report.passages.at(-1)?.state).toBe('notRun');
      expect(result.markdown).toContain('The run was stopped (time limit); this dossier is partial.');
    });

    it('goes on without searching once maxSearches is spent, and says so', async () => {
      const { study, provider, searches } = setup({ limits: { maxSearches: 1 } });

      const result = await study.run();

      expect(result.status).toBe('completed');
      expect(searches.queries).toEqual(['WorldWideWeb NeXT text editor']);
      // The changes passage was not even asked for searches it could not run.
      expect(provider.channels()).not.toContain('study-queries:changes');
      expect(result.report.notices).toContainEqual(
        expect.objectContaining({ code: 'searchesSkipped', details: ['changes', 'design'] })
      );
      // S2 was never retrieved: the advance citing it is only a hypothesis.
      expect(result.report.advances[0]).toMatchObject({
        status: 'hypothesis',
        unretrievedSources: ['S2'],
      });
    });

    it('resumes at the first passage not complete', async () => {
      const { study, provider, env } = setup({ limits: { maxModelCalls: 4 } });
      const first = await study.run();
      expect(first.status).toBe('stopped');
      const before = provider.requests.length;

      const second = await study.run();

      const channels = provider.requests.slice(before).map(channelOf);
      expect(channels[0]).toBe('study-queries:historicalChoices');
      expect(channels).not.toContain('study:observe');
      expect(second.status).toBe('stopped');
      // The first run's work stays, with the run that did it.
      expect(second.report.observations.map((observation) => observation.runId)).toEqual([
        first.runId,
        first.runId,
      ]);
      expect(second.report.runIds).toEqual([first.runId, second.runId]);
      const [started] = await env.sdk.getEvents(second.runId, { type: 'study.started' });
      expect(started?.data.resumeAt).toBe('historicalChoices');

      const restarted = await study.run({ restart: true });
      expect(restarted.report.observations[0]?.runId).toBe(restarted.runId);
    });

    it('ends as cancelled, with what was done, when its signal aborts', async () => {
      const { study } = setup();
      const controller = new AbortController();

      const result = await study.run({
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'study.passage_completed') controller.abort();
        },
      });

      expect(result.status).toBe('cancelled');
      expect(result.report.observations).toHaveLength(2);
      expect(result.report.passages[1]?.state).toBe('notRun');
    });

    it('stops at a budget policy checked before each passage', async () => {
      const { study, env } = setup();
      env.sdk.defineGlobalPolicy({
        id: 'study-tokens',
        type: 'budget',
        rules: [{ condition: 'maxTokens', action: 'deny', metadata: { value: 500 } }],
        scope: 'global',
        enabled: true,
      });

      const result = await study.run();

      expect(result).toMatchObject({ status: 'stopped', stoppedBy: 'policy' });
      const violated = await env.sdk.getEvents(result.runId, { type: 'policy.violated' });
      expect(violated[0]?.data).toMatchObject({
        intention: { type: 'continue' },
        violatedPolicies: ['study-tokens'],
      });
      expect(result.report.observations).toHaveLength(2);
      expect(result.report.passages.some((state) => state.state === 'notRun')).toBe(true);
    });

    it('records a search that failed, and goes on', async () => {
      const provider = scriptStudy(new ScriptedLLMProvider());
      env = createTestSDK({}, provider);
      env.sdk.defineTool({
        name: 'search_web',
        description: 'Searches the web',
        schema: z.object({ query: z.string() }),
        handler: async () => {
          throw new Error('the search service is down');
        },
      });
      const study = env.sdk.createStudy(studyConfig());

      const result = await study.run();

      expect(result.status).toBe('completed');
      expect(result.report.searches[0]).toMatchObject({
        tool: 'search_web',
        resultIds: [],
        error: expect.stringContaining('the search service is down'),
      });
      expect(result.report.results).toEqual([]);
      expect(result.report.stats.byStatus.established).toBe(0);
      // No prior-art search succeeded: the novelty stays to verify.
      expect(result.report.noveltyClaims[0]).toMatchObject({ toVerify: true });
    });

    it('refuses a second run while one is in progress', async () => {
      const { study } = setup({}, { provider: new ScriptedLLMProvider({ delayMs: 5 }) });

      const running = study.run();
      await expect(study.run()).rejects.toThrow(ValidationError);
      expect((await running).status).toBe('completed');
    });
  });

  describe('events', () => {
    it('streams the run’s events to onEvent, in order, as the event store holds them', async () => {
      const { study, env } = setup();
      const received: Event[] = [];

      const result = await study.run({
        onEvent: async (event) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          received.push(event);
        },
      });

      const recorded = await env.sdk.getEvents(result.runId);
      expect(received.map((event) => event.id)).toEqual(recorded.map((event) => event.id));
      const types = received.map((event) => event.type);
      expect(types.slice(0, 3)).toEqual(['run.started', 'study.started', 'study.passage_started']);
      expect(types.slice(-2)).toEqual(['study.completed', 'run.completed']);
      // The searches' own tool events are part of the run.
      expect(types).toContain('tool.called');
      expect(types).toContain('study.search');
      for (const type of [
        'study.model_called',
        'study.passage_completed',
      ] as const) {
        expect(types.filter((candidate) => candidate === type)).toHaveLength(
          type === 'study.passage_completed' ? 7 : 18
        );
      }
      expect(received.every((event) => event.runId === result.runId)).toBe(true);
    });

    it('delivers study events to sdk.subscribe, filtered by the study’s id', async () => {
      const { study, env } = setup();
      const types: string[] = [];
      const unsubscribe = env.sdk.subscribe((event) => {
        types.push(event.type);
      }, { agentId: study.id, types: ['study.passage_completed'] });

      await study.run();
      unsubscribe();

      expect(types).toHaveLength(7);
    });
  });
});
