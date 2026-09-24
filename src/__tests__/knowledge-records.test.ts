import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKnowledgeStore } from '../cognition/file-knowledge-store.js';
import { knowledgeFindings } from '../cognition/knowledge-findings.js';
import type { KnowledgeEntry, KnowledgeFinding, KnowledgeItem } from '../cognition/knowledge-records.js';
import { projectKnowledge, rankKnowledge } from '../cognition/knowledge-records.js';
import { InMemoryKnowledgeStore } from '../cognition/knowledge-store.js';
import { applyThought } from '../cognition/mental-state-reducer.js';
import { createMentalState, type MentalState } from '../cognition/mental-state.js';
import { observationFromTest } from '../cognition/observation-records.js';
import { thoughtPatchSchema, type ThoughtPatchInput } from '../cognition/thought-patch.js';
import { ValidationError } from '../errors/index.js';

const SCOPE = 'inclined-plane';
const FREE_RULE = 'Rolling time on this plane does not depend on the ball';
const RIGID_RULE = 'For rigid balls, rolling time on this plane does not depend on mass';

function finding(
  statement: string,
  runId: string,
  verdict: 'confirmed' | 'refuted',
  predictionId = 'P1',
  observed = `${verdict} on the bench`
): KnowledgeFinding {
  return {
    statement,
    kind: 'rule',
    scope: 'balls on this plane',
    evidence: [{ runId, predictionId, verdict, expected: 'about 1.07 s', observed, evaluatorId: 'bench', evaluatorVersion: '1' }],
  };
}

function entry(runId: string, recordedAt: number, findings: KnowledgeFinding[]): KnowledgeEntry {
  return { scope: SCOPE, runId, recordedAt, findings };
}

function think(state: MentalState, operation: string, patch: ThoughtPatchInput) {
  return applyThought(state, operation, thoughtPatchSchema.parse(patch));
}

describe('knowledge journal', () => {
  it('merges the tests of every run and says whether they agree', () => {
    const items = projectKnowledge([
      entry('run-1', 1, [finding(FREE_RULE, 'run-1', 'confirmed')]),
      entry('run-2', 2, [finding('rolling time on this plane does NOT depend on the ball.', 'run-2', 'refuted')]),
      entry('run-3', 3, [finding(RIGID_RULE, 'run-3', 'confirmed')]),
      entry('run-4', 4, [finding('Sliding friction is negligible', 'run-4', 'refuted')]),
    ]);

    // The same statement with another case and punctuation is the same knowledge.
    expect(items.map((item) => [item.statement, item.status, item.confirmations, item.refutations, item.version])).toEqual([
      ['rolling time on this plane does NOT depend on the ball.', 'contested', 1, 1, 2],
      [RIGID_RULE, 'verified', 1, 0, 1],
      ['Sliding friction is negligible', 'refuted', 0, 1, 1],
    ]);
    expect(items[0]?.runIds).toEqual(['run-1', 'run-2']);
  });

  it('adds nothing when the same run is recorded twice', () => {
    const once = entry('run-1', 1, [finding(RIGID_RULE, 'run-1', 'confirmed')]);
    const [item] = projectKnowledge([once, { ...once, recordedAt: 5 }]);
    expect(item).toMatchObject({ confirmations: 1, version: 1, lastRecordedAt: 5 });
    expect(item?.tests).toHaveLength(1);
  });

  it('recalls what shares the most words with the goal, then what was tested most', () => {
    const items = projectKnowledge([
      entry('run-1', 1, [finding('Sliding friction is negligible', 'run-1', 'confirmed')]),
      entry('run-2', 2, [finding(RIGID_RULE, 'run-2', 'confirmed'), finding(FREE_RULE, 'run-2', 'refuted')]),
      entry('run-3', 3, [finding(RIGID_RULE, 'run-3', 'confirmed')]),
    ]);
    const statements = (ranked: KnowledgeItem[]) => ranked.map((item) => item.statement);

    expect(statements(rankKnowledge(items, 'How long does a rigid steel ball take to roll?', 2))).toEqual([RIGID_RULE, FREE_RULE]);
    expect(statements(rankKnowledge(items, 'Is friction negligible when sliding?', 1))).toEqual(['Sliding friction is negligible']);
    expect(rankKnowledge(items, 'anything', 0)).toEqual([]);
  });
});

describe('what a run remembers', () => {
  it('keeps only rules and explanations a real test confirmed or refuted', () => {
    let state = createMentalState('Does the rolling time depend on the ball?');
    state = think(state, 'hypothesize', {
      summary: 'four ideas',
      addHypotheses: [
        { statement: 'Use the steel ball for the demo', kind: 'proposal' },
        { statement: 'Glass rolls like steel', kind: 'rule' },
        { statement: 'Wood rolls like steel', kind: 'rule' },
        { statement: 'Mass does not matter for rigid balls', kind: 'rule', scope: 'rigid balls' },
      ],
    }).state;
    state = think(state, 'simulate', {
      summary: 'predictions',
      predictions: ['H1', 'H2', 'H3', 'H4'].map((hypothesisId) => ({ hypothesisId, expected: `${hypothesisId} holds`, falsifier: 'it does not' })),
    }).state;
    const observed = (summary: string) =>
      observationFromTest({ evaluatorId: 'bench', observed: summary, summary, sourceEventId: `evt-${summary}`, observedAt: 1 });
    state = think(state, 'test_prediction', {
      summary: 'bench',
      evaluations: [
        { predictionId: 'P1', verdict: 'confirmed', evaluatorId: 'bench', evaluatorVersion: '1', observation: observed('steel ran fine') },
        { predictionId: 'P2', verdict: 'inconclusive', evaluatorId: 'bench', evaluatorVersion: '1', reason: 'bench busy' },
        { predictionId: 'P4', verdict: 'confirmed', evaluatorId: 'bench', evaluatorVersion: '1', observation: observed('100 g and 400 g: 1.07 s') },
      ],
    }).state;

    // The proposal, the inconclusive test and the untested prediction leave no trace.
    expect(knowledgeFindings(state, 'run-1')).toEqual([
      {
        statement: 'Mass does not matter for rigid balls',
        kind: 'rule',
        scope: 'rigid balls',
        evidence: [
          { runId: 'run-1', predictionId: 'P4', verdict: 'confirmed', expected: 'H4 holds', observed: '100 g and 400 g: 1.07 s', evaluatorId: 'bench', evaluatorVersion: '1' },
        ],
      },
    ]);
  });

  it('refuses only a word-for-word restatement of a refuted rule, and links verified ones', () => {
    const remembered = (statement: string, status: 'verified' | 'refuted') => ({
      itemId: `k-${status}`,
      statement,
      kind: 'rule' as const,
      scope: 'balls on this plane',
      status,
      confirmations: status === 'verified' ? 1 : 0,
      refutations: status === 'refuted' ? 1 : 0,
      evidence: [],
    });
    const state = createMentalState('Does the ball matter?', undefined, {
      knowledge: [remembered(FREE_RULE, 'refuted'), remembered(RIGID_RULE, 'verified')],
    });

    const propose = (proposal: { statement: string; kind: 'rule' | 'explanation'; scope: string; premiseRefs?: string[] }) => {
      const { state: next, issues } = think(state, 'hypothesize', { summary: 'idea', addHypotheses: [proposal] });
      return { hypotheses: next.hypotheses.map((hypothesis) => [hypothesis.kind, hypothesis.scope, hypothesis.premiseRefs]), issues };
    };

    expect(propose({ statement: FREE_RULE, kind: 'rule', scope: 'balls on this plane' })).toEqual({
      hypotheses: [],
      issues: [
        `"${FREE_RULE}" restates M1, refuted in earlier runs; propose a variant that cites M1 in premiseRefs and explains the refutation`,
        'hypothesize added no hypothesis',
      ],
    });
    // Another scope or another kind is another claim.
    expect(propose({ statement: FREE_RULE, kind: 'rule', scope: 'balls on a steeper plane' })).toEqual({
      hypotheses: [['rule', 'balls on a steeper plane', []]],
      issues: [],
    });
    expect(propose({ statement: FREE_RULE, kind: 'explanation', scope: 'balls on this plane' })).toEqual({
      hypotheses: [['explanation', 'balls on this plane', []]],
      issues: [],
    });
    // A verified rule restated rests on its earlier tests, cited or not.
    expect(propose({ statement: RIGID_RULE, kind: 'rule', scope: 'balls on this plane', premiseRefs: ['O9'] })).toEqual({
      hypotheses: [['rule', 'balls on this plane', ['M2']]],
      issues: ['H1 cites unknown premise O9'],
    });
  });
});

describe('knowledge stores', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });
  function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'knowledge-'));
    directories.push(directory);
    return directory;
  }

  it('keeps knowledge in a file journal that survives the process', async () => {
    const directory = temporaryDirectory();
    await new FileKnowledgeStore(directory).record(entry('run-1', 1, [finding(RIGID_RULE, 'run-1', 'confirmed')]));
    await new FileKnowledgeStore(directory).record(entry('run-2', 2, [finding(RIGID_RULE, 'run-2', 'confirmed', 'P4')]));

    const reopened = new FileKnowledgeStore(directory);
    expect(await reopened.list(SCOPE)).toEqual([expect.objectContaining({ statement: RIGID_RULE, confirmations: 2, version: 2 })]);
    expect(await reopened.recall({ scope: SCOPE, goal: 'rigid balls', limit: 5 })).toHaveLength(1);
    expect(await reopened.list('another-scope')).toEqual([]);
  });

  it('serializes the writes of one instance, even entries too large for one system write', async () => {
    const store = new FileKnowledgeStore(temporaryDirectory());
    const large = 'x'.repeat(700 * 1024);
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        store.record(entry(`run-${index}`, index, [finding(RIGID_RULE, `run-${index}`, 'confirmed', 'P1', `${index}${large}`)]))
      )
    );
    expect(await store.list(SCOPE)).toEqual([expect.objectContaining({ confirmations: 6, version: 6 })]);
  });

  it('survives an interrupted write but refuses an altered journal', async () => {
    const directory = temporaryDirectory();
    const store = new FileKnowledgeStore(directory);
    const journal = join(directory, `${SCOPE}.jsonl`);
    await store.record(entry('run-1', 1, [finding(RIGID_RULE, 'run-1', 'confirmed')]));
    await appendFile(journal, '{"scope":"inclined-plane","runId":"run-2","recor');
    await store.record(entry('run-3', 3, [finding(RIGID_RULE, 'run-3', 'confirmed')]));

    // The interrupted line is skipped; the next entry was written on a line of its own.
    expect(await store.list(SCOPE)).toEqual([expect.objectContaining({ confirmations: 2, runIds: ['run-1', 'run-3'] })]);

    // An entry of another scope found in this file is never returned for this scope.
    writeFileSync(journal, `${JSON.stringify({ ...entry('run-4', 4, [finding(FREE_RULE, 'run-4', 'refuted')]), scope: 'another-client' })}\n`);
    expect(await store.list(SCOPE)).toEqual([]);

    writeFileSync(journal, '{"scope":"inclined-plane","runId":"run-1"}\n');
    await expect(store.list(SCOPE)).rejects.toThrow(`knowledge.${SCOPE}:1`);
  });

  it('refuses scopes that could escape the folder or collide on case-insensitive disks', async () => {
    const store = new FileKnowledgeStore(temporaryDirectory());
    await expect(store.list('../outside')).rejects.toThrow(ValidationError);
    await expect(store.list('Acme')).rejects.toThrow(ValidationError);
    await expect(store.record({ scope: SCOPE, runId: 'run-1', recordedAt: 1, findings: [] })).rejects.toThrow(ValidationError);
    await expect(new InMemoryKnowledgeStore().list('a/b')).rejects.toThrow(ValidationError);
  });
});
