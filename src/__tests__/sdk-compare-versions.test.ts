import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgentImpl } from '../agent.js';
import { defineTool } from '../sdk.js';
import type { AgentConfig } from '../types/agent.js';
import type { Policy } from '../types/policy.js';
import { ValidationError } from '../errors/index.js';
import { SQLiteEventStore } from '../stores/sqlite-event-store.js';
import { loadNodeSqlite } from './support/node-sqlite.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

/** USD per million tokens of the scripted model: every call uses 100 input and 20 output tokens. */
const PRICING = { 'test-model': { inputPerMillion: 10, outputPerMillion: 50 } };
const COST_OF_ONE_CALL = (100 * 10 + 20 * 50) / 1_000_000;

async function runTwice(env: TestSDK, agent: AgentImpl): Promise<string[]> {
  const runIds: string[] = [];
  for (const message of ['Hi', 'Hello']) {
    env.provider.enqueue('default', { content: `${message}!` });
    runIds.push((await agent.run({ message })).runId);
  }
  return runIds;
}

describe('compareVersions', () => {
  let env: TestSDK;

  beforeEach(() => {
    env = createTestSDK({ pricing: PRICING });
  });

  afterEach(async () => {
    await env.dispose();
  });

  it('compares the runs of two declared versions of an agent', async () => {
    const before = await runTwice(
      env,
      env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '1.0.0' })
    );
    const after = await runTwice(
      env,
      env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '1.1.0' })
    );
    // Another agent's runs with the same version are not the greeter's.
    await runTwice(
      env,
      env.sdk.createAgent({ name: 'other', model: 'test-model', version: '1.1.0' })
    );

    const analysis = await env.sdk.compareVersions('greeter', '1.0.0', '1.1.0');

    // Before, it could never succeed: an agent id has one version only.
    expect(analysis.beforeRunIds.sort()).toEqual([...before].sort());
    expect(analysis.afterRunIds.sort()).toEqual([...after].sort());
    expect(await env.sdk.getImpactAnalysis(analysis.id)).toEqual(analysis);
  });

  it('compares two configurations of the same version by their config hash', async () => {
    const terse = env.sdk.createAgent({
      name: 'greeter',
      model: 'test-model',
      systemPrompt: 'Be terse.',
    });
    const warm = env.sdk.createAgent({
      name: 'greeter',
      model: 'test-model',
      systemPrompt: 'Be warm.',
    });
    const before = await runTwice(env, terse);
    const after = await runTwice(env, warm);

    expect(terse.version).toBe(warm.version);
    expect(terse.configHash).not.toBe(warm.configHash);
    const analysis = await env.sdk.compareVersions(
      warm.id,
      terse.configHash ?? '',
      warm.configHash ?? ''
    );

    expect(analysis.beforeRunIds.sort()).toEqual([...before].sort());
    expect(analysis.afterRunIds.sort()).toEqual([...after].sort());
  });

  it('says which versions were recorded when one has no run', async () => {
    const greeter = env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '1.0.0' });
    await runTwice(env, greeter);

    const refusal = env.sdk.compareVersions('greeter', '1.0.0', '2.0.0');

    await expect(refusal).rejects.toThrow(ValidationError);
    await expect(refusal).rejects.toThrow(
      `no run of agent "greeter" has version or config hash "2.0.0" (recorded: 1.0.0 (config ${greeter.configHash}))`
    );
  });

  it('refuses to compare a version with itself, or two versions that select the same runs', async () => {
    const greeter = env.sdk.createAgent({ name: 'greeter', model: 'test-model' });
    await runTwice(env, greeter);

    await expect(env.sdk.compareVersions('greeter', '1.0.0', '1.0.0')).rejects.toThrow(
      'version2 - must differ from version1 ("1.0.0")'
    );
    // Every agent is 1.0.0 by default: its config hash selects the same runs.
    await expect(
      env.sdk.compareVersions('greeter', '1.0.0', greeter.configHash ?? '')
    ).rejects.toThrow(`"1.0.0" and "${greeter.configHash}" both select 2 run(s)`);
  });

  it('names runs recorded without a version as such', async () => {
    const lookup = env.sdk.defineTool({
      name: 'lookup',
      description: 'Looks up',
      schema: z.object({}),
      handler: async () => 'ok',
    });
    await env.sdk.executeTool(lookup.name, {}, { agentId: 'mcp:crm' });

    await expect(env.sdk.compareVersions('mcp:crm', '1.0.0', '2.0.0')).rejects.toThrow(
      '(recorded: no version)'
    );
  });

  it('prices the cost metric in USD from the model calls, as getRunCost does', async () => {
    const before = await runTwice(env, env.sdk.createAgent({ name: 'a', model: 'test-model' }));
    const after = await runTwice(env, env.sdk.createAgent({ name: 'b', model: 'test-model' }));

    const analysis = await env.sdk.analyzeImpact(before, after, { metrics: ['cost'] });

    // Before, "cost (tokens)" was the number of tool calls times 0.01.
    expect(analysis.metrics).toMatchObject([
      {
        name: 'cost (usd)',
        before: { average: COST_OF_ONE_CALL, count: 2 },
        after: { average: COST_OF_ONE_CALL, count: 2 },
        change: { absolute: 0, direction: 'neutral' },
      },
    ]);
    expect((await env.sdk.getRunCost(before[0] ?? '')).totalUsd).toBe(COST_OF_ONE_CALL);
    await expect(env.sdk.analyzeImpact([], after)).rejects.toThrow(/beforeRunIds/);
  });
});

const nodeSqlite = loadNodeSqlite();
describe.skipIf(!nodeSqlite)('compareVersions on SQLite', () => {
  it('finds the runs of each version in the database', async () => {
    const db = new (nodeSqlite as NonNullable<typeof nodeSqlite>).DatabaseSync(':memory:');
    const env = createTestSDK({ eventStore: new SQLiteEventStore({ db }) });
    try {
      const before = await runTwice(
        env,
        env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '1.0.0' })
      );
      const after = await runTwice(
        env,
        env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '2.0.0' })
      );

      const analysis = await env.sdk.compareVersions('greeter', '1.0.0', '2.0.0');

      expect(analysis.beforeRunIds.sort()).toEqual([...before].sort());
      expect(analysis.afterRunIds.sort()).toEqual([...after].sort());
    } finally {
      await env.dispose();
    }
  });
});

describe('configHash', () => {
  let env: TestSDK;

  beforeEach(() => {
    env = createTestSDK();
  });

  afterEach(async () => {
    await env.dispose();
  });

  const caps = (maxToolCalls: number): Policy => ({
    id: 'caps',
    type: 'budget',
    scope: 'agent',
    enabled: true,
    rules: [
      {
        condition: 'true',
        action: 'deny',
        metadata: { budgetLimit: { period: 'day', maxToolCalls } },
      },
    ],
  });

  const hashOf = (config: Partial<AgentConfig>) =>
    env.sdk.createAgent({ name: 'greeter', model: 'test-model', ...config }).configHash;

  it('changes with what makes the agent behave differently', () => {
    const tool = (description: string, schema: z.ZodTypeAny) =>
      defineTool({ name: 'lookup', description, schema, handler: async () => 'ok' });

    // Before, only the policies' id and type, and the tools' name and version, were hashed.
    expect(hashOf({ policies: [caps(5)] })).not.toBe(hashOf({ policies: [caps(50)] }));
    expect(hashOf({ providerSettings: { default: { temperature: 0 } } })).not.toBe(
      hashOf({ providerSettings: { default: { temperature: 1 } } })
    );
    expect(hashOf({ tools: [tool('Looks up', z.object({ id: z.string() }))] })).not.toBe(
      hashOf({ tools: [tool('Looks up', z.object({ id: z.number() }))] })
    );
    expect(hashOf({ tools: [tool('Looks up', z.object({}))] })).not.toBe(
      hashOf({ tools: [tool('Finds a customer', z.object({}))] })
    );
    expect(hashOf({ model: 'test-model', systemPrompt: 'A' })).toBe(
      hashOf({ model: 'test-model', systemPrompt: 'A' })
    );
  });

  it('follows setPolicy and addTools, and each run records the hash it started with', async () => {
    const greeter = env.sdk.createAgent({ name: 'greeter', model: 'test-model' });
    const [before] = await runTwice(env, greeter);
    const initial = greeter.configHash;

    greeter.setPolicy(caps(5));
    const withPolicy = greeter.configHash;
    greeter.addTools([
      defineTool({
        name: 'lookup',
        description: 'Looks up',
        schema: z.object({}),
        handler: async () => 'ok',
      }),
    ]);
    const [after] = await runTwice(env, greeter);

    expect(withPolicy).not.toBe(initial);
    expect(greeter.configHash).not.toBe(withPolicy);
    const [started] = await env.sdk.getEvents(before ?? '', { type: 'run.started' });
    const [startedAfter] = await env.sdk.getEvents(after ?? '', { type: 'run.started' });
    expect(started?.metadata?.configHash).toBe(initial);
    expect(startedAfter?.metadata?.configHash).toBe(greeter.configHash);
  });
});
