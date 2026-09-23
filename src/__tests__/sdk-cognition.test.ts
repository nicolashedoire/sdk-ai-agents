import { afterEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/index.js';
import { json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const DISTILLED = {
  summary: 'Pragmatic builder who looks for limits first and prototypes fast.',
  reasoningSequence: [
    { id: 'real-capability', instruction: 'Establish what the technology really enables' },
    { id: 'limits', instruction: 'Find its limits immediately' },
    { id: 'workaround', instruction: 'Imagine how to work around those limits' },
    { id: 'product', instruction: 'Check whether it can become a product' },
    { id: 'prototype', instruction: 'Design the smallest prototype that tests it' },
  ],
  priorities: ['Real capability over hype', 'Free and open options first'],
  heuristics: [{ when: 'a service is paid and closed', action: 'look for an open clone before paying' }],
  rejectionCriteria: ['Cannot be tested with a prototype'],
  riskAppetite: 'high',
};

describe('SDK cognition entry points', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('distills a thinker profile from explained topics and keeps them as examples', async () => {
    const provider = new ScriptedLLMProvider()
      .enqueue('default', { content: 'Here is the profile: not json' })
      .enqueue('repair', json(DISTILLED));
    env = createTestSDK({}, provider);

    const profile = await env.sdk.distillThinkerProfile({
      id: 'nicolas',
      name: 'Nicolas',
      model: 'test-model',
      samples: [
        {
          topic: 'Typed decision APIs like Jev',
          reasoning: 'What does it really allow? Then the limits: closed, US only, paid. Is there an open clone? Could it be the controller of my agent?',
          conclusion: 'Use an open clone as the controller and benchmark it',
        },
        { topic: 'World models', reasoning: 'Structure beats scale; test on a small chaotic system first.' },
      ],
    });

    expect(profile).toMatchObject({ id: 'nicolas', name: 'Nicolas', version: '1.0.0', riskAppetite: 'high' });
    expect(profile.reasoningSequence.map((move) => move.id)).toEqual(['real-capability', 'limits', 'workaround', 'product', 'prototype']);
    expect(profile.examples).toEqual([
      {
        topic: 'Typed decision APIs like Jev',
        reasoning: expect.stringContaining('What does it really allow?'),
        conclusion: 'Use an open clone as the controller and benchmark it',
      },
    ]);
    expect(provider.channels()).toEqual(['default', 'repair']);
  });

  it('thinks with a distilled profile in every prompt', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'nicolas',
      model: 'test-model',
      profile: { id: 'nicolas', name: 'Nicolas', ...DISTILLED, riskAppetite: 'high' },
    });

    await agent.think({ problem: 'Should we adopt a typed decision API?' });

    const prompts = env.provider.requests.filter((request) => !request.tools).map((request) => request.messages[0]?.content ?? '');
    expect(prompts.length).toBeGreaterThan(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('1. [real-capability] Establish what the technology really enables');
      expect(prompt).toContain('When a service is paid and closed, then look for an open clone before paying');
    }
  });

  it('refuses a typed controller without a decision backend', () => {
    env = createTestSDK();
    expect(() => env.sdk.createCognitiveAgent({ name: 'x', model: 'm', controller: 'typed' })).toThrow(ValidationError);
    expect(() => env.sdk.createCognitiveAgent({ name: 'x', model: 'm', assessment: 'typed' })).toThrow(ValidationError);
  });

  it('exports a controller dataset for every cognitive run and ignores native runs', async () => {
    env = createTestSDK();
    scriptBuildOrBuy(env.provider).always('default', { content: 'native answer' });
    const cognitive = await env.sdk.createCognitiveAgent({ name: 'a', model: 'test-model' }).think({ problem: 'Build or buy?' });
    await env.sdk.createAgent({ name: 'native', model: 'test-model' }).run({ message: 'hi' });

    const lines = (await env.sdk.exportControllerDataset()).split('\n').map((line) => JSON.parse(line));
    expect(new Set(lines.map((line) => line.runId))).toEqual(new Set([cognitive.runId]));
    expect(lines.map((line) => line.operation)).toEqual(['represent', 'hypothesize', 'simulate', 'critique', 'compare', 'decide']);
    expect(lines[4]?.state.hypotheses).toHaveLength(2);
  });

  it('keeps native agents working with an injected provider', async () => {
    env = createTestSDK();
    env.provider.always('default', { content: 'Paris' });
    const result = await env.sdk.createAgent({ name: 'native', model: 'test-model' }).run({ message: 'Capital of France?' });
    expect(result).toMatchObject({ status: 'completed', output: 'Paris' });
    const cost = await env.sdk.getRunCost(result.runId);
    expect(cost.lines).toEqual([{ model: 'test-model', source: 'llm', calls: 1, inputTokens: 100, outputTokens: 20 }]);
    expect(await env.sdk.getIncidents(result.runId)).toEqual([]);
  });
});
