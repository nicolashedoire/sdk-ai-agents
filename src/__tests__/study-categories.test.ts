import { afterEach, describe, expect, it } from 'vitest';
import {
  channelOf,
  ScriptedLLMProvider,
  type ScriptedReply,
} from './support/scripted-llm-provider.js';
import {
  defineSearchTool,
  item,
  passage,
  REPLIES,
  scriptStudy,
  studyConfig,
} from './support/study-script.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

// A real GPT-5.4 study named a historical factor "accessibility" and a combination's change
// "trust": the whole item was refused for its label and logged as drift, though it served the
// objective. A category the list lacks is now read as "other", and trust and verification are
// changes a combination can make, as they are principles an architecture can change.

describe('categories a model names outside the list', () => {
  let env: TestSDK | undefined;

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
  });

  /** The cross passage's reply, with one combination whose changes are given. */
  function crossWith(changes: string[]): ScriptedReply {
    const reply = REPLIES.cross as { content: string };
    const data = JSON.parse(reply.content) as { combinations: Array<Record<string, unknown>> };
    data.combinations = [{ ...data.combinations[0], changes }];
    return { content: JSON.stringify(data) };
  }

  it('keeps the item, reading an unknown category as other', async () => {
    const provider = new ScriptedLLMProvider();
    provider.enqueue(
      'study:historicalChoices',
      passage({
        historicalChoices: [
          item('Early pages were read aloud by nothing', {
            choice: 'A visual document first',
            factors: ['accessibility', 'tools'],
          }),
        ],
      })
    );
    provider.enqueue('study:cross', crossWith(['trust', 'verification', 'governance']));
    env = createTestSDK({}, scriptStudy(provider));
    defineSearchTool(env.sdk);
    const study = env.sdk.createStudy(studyConfig());

    const { report } = await study.run();

    // Before: both items were refused ("Invalid enum value") and logged as drift.
    expect(report.historicalChoices.map((choice) => choice.factors)).toEqual([['other', 'tools']]);
    expect(report.combinations.map((combination) => combination.changes)).toContainEqual([
      'trust',
      'verification',
      'other',
    ]);
    expect(report.driftLog.filter((entry) => entry.by === 'schema')).toEqual([]);
  });
  /** A passage's reply with its data changed by `edit`. */
  function edited(reply: ScriptedReply, edit: (data: Record<string, any>) => void): ScriptedReply {
    const data = JSON.parse((reply as { content: string }).content) as Record<string, any>;
    edit(data);
    return { content: JSON.stringify(data) };
  }

  it('leaves blank labels out and keeps each category once', async () => {
    const provider = new ScriptedLLMProvider();
    provider.enqueue(
      'study:historicalChoices',
      passage({
        historicalChoices: [
          item('Early browsers reused what the workstation offered', {
            choice: 'Reuse the platform',
            factors: ['governance', 'security', '', '   ', '信頼', 'cost', 'costs'],
          }),
        ],
      })
    );
    provider.enqueue(
      'study:changes',
      edited(REPLIES.changes, (data) => {
        data.independentLeads = [{ ...data.independentLeads[0], kind: 'statistical' }];
      })
    );
    env = createTestSDK({}, scriptStudy(provider));
    defineSearchTool(env.sdk);
    const study = env.sdk.createStudy(studyConfig());

    const { report } = await study.run();

    // Before: ['other', 'other', 'other', 'other', 'other', 'costs', 'costs'], and the lead of
    // kind "statistical" was refused whole.
    expect(report.historicalChoices.map((choice) => choice.factors)).toEqual([['other', 'costs']]);
    expect(report.independentLeads.map((lead) => lead.kind)).toEqual(['other']);
  });

  it('refuses a capability whose principle is not one of the list', async () => {
    const provider = new ScriptedLLMProvider();
    provider.enqueue(
      'study:design',
      edited(REPLIES.design, (data) => {
        for (const architecture of data.architectures) {
          if (architecture.kind === 'capability') architecture.principleChange.principle = 'none';
        }
      })
    );
    // Too few architectures are left: the study asks again, and this time the reply is sound.
    provider.enqueue('study:design:repair', REPLIES.design);
    env = createTestSDK({}, scriptStudy(provider));
    defineSearchTool(env.sdk);
    const study = env.sdk.createStudy(studyConfig());

    const { report } = await study.run();

    // "A capability states the principle it changes": "none" is no principle, so the reply is
    // refused and asked again. Read as "other", it would have been accepted as it was.
    expect(provider.requests.map(channelOf)).toContain('study:design:repair');
    const capabilities = report.architectures.filter((a) => a.kind === 'capability');
    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities.map((a) => a.principleChange?.principle)).not.toContain('other');
  });
});
