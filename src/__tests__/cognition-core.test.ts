import { describe, expect, it } from 'vitest';
import { availableOperations, MAX_ATTEMPTS_PER_UNKNOWN } from '../cognition/cognitive-operations.js';
import { HeuristicController } from '../cognition/cognitive-controller.js';
import { extractJsonObject, parseThought } from '../cognition/llm-thought-generator.js';
import { applyThought } from '../cognition/mental-state-reducer.js';
import { createMentalState, type MentalState } from '../cognition/mental-state.js';
import { thoughtPatchSchema, type ThoughtPatchInput } from '../cognition/thought-patch.js';
import {
  DEFAULT_THINKER_PROFILE,
  MAX_PROFILE_EXAMPLES,
  bumpPatchVersion,
  defineThinkerProfile,
  refineProfile,
  renderProfile,
} from '../cognition/thinker-profile.js';

function think(state: MentalState, operation: string, patch: ThoughtPatchInput) {
  return applyThought(state, operation, thoughtPatchSchema.parse(patch));
}

function framedState(): MentalState {
  let state = createMentalState('Should we build or buy the analytics module?');
  state = think(state, 'represent', {
    summary: 'framed',
    addFacts: [{ statement: 'Budget is 10k', source: 'input', confidence: 0.9 }],
    addUnknowns: [{ question: 'What is the churn rate?' }],
  }).state;
  return think(state, 'hypothesize', {
    summary: 'two options',
    addHypotheses: [{ statement: 'Build in-house' }, { statement: 'Buy a SaaS' }],
  }).state;
}

describe('mental state reducer', () => {
  it('assigns sequential ids and records the trail', () => {
    const state = framedState();
    expect(state.step).toBe(2);
    expect(state.facts.map((fact) => fact.id)).toEqual(['F1']);
    expect(state.unknowns[0]).toMatchObject({ id: 'U1', status: 'open', attempts: 0 });
    expect(state.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis.status, hypothesis.support])).toEqual([
      ['H1', 'proposed', 0.5],
      ['H2', 'proposed', 0.5],
    ]);
    expect(state.trail.map((entry) => entry.operation)).toEqual(['represent', 'hypothesize']);
  });

  it('does not mutate the previous state', () => {
    const before = framedState();
    const snapshot = JSON.stringify(before);
    think(before, 'simulate', {
      summary: 'simulated',
      simulations: [{ hypothesisId: 'H1', steps: ['hire two engineers'], outcome: 'ships in 6 months' }],
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('moves hypotheses forward and rejects them on a fatal critique without rebuttal', () => {
    let state = framedState();
    state = think(state, 'simulate', {
      summary: 'simulated',
      simulations: [{ hypothesisId: 'H1', steps: ['hire'], outcome: 'late' }],
    }).state;
    expect(state.hypotheses[0]?.status).toBe('simulated');

    const { state: critiqued } = think(state, 'critique', {
      summary: 'critique',
      critiques: [
        { hypothesisId: 'H1', objection: 'No team available', severity: 'fatal' },
        { hypothesisId: 'H2', objection: 'Lock-in', severity: 'fatal', rebuttal: 'Export API exists' },
      ],
    });
    expect(critiqued.hypotheses[0]).toMatchObject({ status: 'rejected', rejectionReason: 'No team available' });
    expect(critiqued.hypotheses[1]?.status).toBe('critiqued');
  });

  it('reports references it cannot apply instead of inventing items', () => {
    const { state, issues } = think(framedState(), 'critique', {
      summary: 'bad refs',
      critiques: [{ hypothesisId: 'H9', objection: 'x', severity: 'minor' }],
      resolveUnknowns: [{ unknownId: 'U7', resolution: 'y' }],
      addContradictions: [{ description: 'budget vs scope', between: ['F1', 'Z3'] }],
    });
    expect(issues).toEqual([
      'cannot resolve unknown U7: not found',
      'cannot critique hypothesis H9: not found',
      'contradiction references unknown id Z3',
      // Nothing was critiqued: the step counts as a failed attempt.
      'critique examined no hypothesis that lacked a critique',
    ]);
    expect(state.trail.at(-1)?.failed).toBe(true);
    expect(state.contradictions[0]).toMatchObject({ id: 'C1', between: ['F1'], resolved: false });
  });

  it('refuses a decision on a rejected hypothesis', () => {
    const state = think(framedState(), 'critique', {
      summary: 'reject H1',
      hypothesisUpdates: [{ hypothesisId: 'H1', reject: true, reason: 'too slow' }],
    }).state;
    const { state: decided, issues } = think(state, 'decide', {
      summary: 'decide',
      decision: { hypothesisId: 'H1', answer: 'Build it', rationale: 'r', confidence: 0.6 },
    });
    expect(issues).toEqual(['decision refused: H1 was rejected (too slow)']);
    expect(decided.decision).toBeUndefined();
  });

  it('rebuilds legacy (v1) runs with their original decision rule', () => {
    let state = createMentalState('Build or buy?', undefined, { schemaVersion: 1 });
    state = think(state, 'hypothesize', { summary: 'h', addHypotheses: [{ statement: 'Build' }] }).state;
    state = think(state, 'critique', {
      summary: 'reject H1',
      hypothesisUpdates: [{ hypothesisId: 'H1', reject: true, reason: 'too slow' }],
      confidence: 0.4,
    }).state;
    expect(state.confidence).toBe(0.4);
    const { state: decided, issues } = think(state, 'decide', {
      summary: 'decide',
      decision: { hypothesisId: 'H1', answer: 'Build it', rationale: 'r', confidence: 0.6 },
    });
    expect(issues).toEqual(['decision cannot select rejected hypothesis H1']);
    expect(decided.decision).toMatchObject({ answer: 'Build it' });
    expect(decided.decision?.hypothesisId).toBeUndefined();
    expect(decided.decision?.status).toBeUndefined();
    expect(decided.confidence).toBe(0.6);
  });

  it('counts investigations and marks comparisons', () => {
    let state = think(framedState(), 'seek_information', {
      summary: 'looked it up',
      investigatedUnknownId: 'U1',
      resolveUnknowns: [{ unknownId: 'U1', resolution: '4% monthly' }],
    }).state;
    expect(state.unknowns[0]).toMatchObject({ attempts: 1, status: 'resolved', resolution: '4% monthly' });
    state = think(state, 'compare', { summary: 'ranked', hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.8 }] }).state;
    expect(state.comparedAtStep).toBe(state.step);
    expect(state.hypotheses[1]?.support).toBe(0.8);
  });
});

describe('available operations', () => {
  const context = { maxHypotheses: 3, canSeekInformation: true };

  it('forces a representation first', () => {
    expect(availableOperations(createMentalState('goal'), context)).toEqual(['represent']);
  });

  it('only offers what the state allows', () => {
    const state = framedState();
    // Nothing was examined yet, so no answer can be committed.
    expect(availableOperations(state, context)).toEqual(['hypothesize', 'simulate', 'critique', 'seek_information']);
    expect(availableOperations(state, { ...context, canSeekInformation: false })).not.toContain('seek_information');
  });

  it('stops investigating an unknown after repeated attempts', () => {
    let state = framedState();
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_UNKNOWN; attempt++) {
      state = think(state, 'seek_information', { summary: 'no luck', investigatedUnknownId: 'U1' }).state;
    }
    expect(availableOperations(state, context)).not.toContain('seek_information');
  });

  it('offers a comparison only when critiqued hypotheses changed since the last one', () => {
    let state = think(framedState(), 'critique', {
      summary: 'c',
      critiques: [{ hypothesisId: 'H2', objection: 'cost', severity: 'minor' }],
    }).state;
    expect(availableOperations(state, context)).toContain('compare');
    state = think(state, 'compare', { summary: 'ranked', hypothesisUpdates: [{ hypothesisId: 'H2', support: 0.7 }] }).state;
    expect(availableOperations(state, context)).not.toContain('compare');
  });

  it('offers nothing once a decision exists', () => {
    const state = think(framedState(), 'decide', {
      summary: 'd',
      decision: { answer: 'Buy', rationale: 'cheaper', confidence: 0.8 },
    }).state;
    expect(availableOperations(state, context)).toEqual([]);
  });
});

describe('heuristic controller', () => {
  const controller = new HeuristicController();
  const base = { profile: DEFAULT_THINKER_PROFILE, decisionThreshold: 0.75 };

  it('follows the order of attention', async () => {
    const state = framedState();
    const choice = await controller.selectNext({
      ...base,
      state,
      stepsRemaining: 10,
      available: availableOperations(state, { maxHypotheses: 3, canSeekInformation: true }),
    });
    expect(choice).toMatchObject({ operation: 'simulate', controller: 'heuristic' });
  });

  it('decides when the step budget is nearly exhausted', async () => {
    const state = framedState();
    const choice = await controller.selectNext({
      ...base,
      state,
      stepsRemaining: 2,
      available: ['simulate', 'decide'],
    });
    expect(choice.operation).toBe('decide');
  });
});

describe('thought parsing', () => {
  it('accepts fenced JSON surrounded by prose', () => {
    const parsed = parseThought('hypothesize', 'Sure!\n```json\n{"summary":"s","addHypotheses":[{"statement":"A"}]}\n```');
    expect(parsed).toMatchObject({ ok: true, ignoredFields: [] });
  });

  it('ignores fields the operation may not write', () => {
    const parsed = parseThought(
      'simulate',
      JSON.stringify({
        summary: 's',
        simulations: [{ hypothesisId: 'H1', steps: ['a'], outcome: 'b' }],
        decision: { answer: 'x', rationale: 'y', confidence: 1 },
      })
    );
    expect(parsed.ok && parsed.ignoredFields).toEqual(['decision']);
    expect(parsed.ok && parsed.patch.decision).toBeUndefined();
  });

  it('explains what is wrong so the model can repair its reply', () => {
    expect(parseThought('decide', '{"summary":"s"}')).toEqual({
      ok: false,
      error: '"decision" is required for the decide operation',
    });
    expect(parseThought('critique', JSON.stringify({ summary: 's', critiques: [{ hypothesisId: 'H1', objection: 'o', severity: 'huge' }] })))
      .toMatchObject({ ok: false, error: expect.stringContaining('critiques.0.severity') });
    expect(parseThought('represent', 'no json here')).toEqual({ ok: false, error: 'the reply does not contain a JSON object' });
    expect(extractJsonObject('{ broken')).toBeUndefined();
  });
});

describe('thinker profile', () => {
  const profile = defineThinkerProfile({
    id: 'builder',
    name: 'Builder',
    reasoningSequence: [{ id: 'limits', instruction: 'Look for the limits first' }],
  });

  it('fills defaults', () => {
    expect(profile).toMatchObject({ version: '1.0.0', riskAppetite: 'medium', corrections: [], examples: [] });
  });

  it('learns from a mismatch and puts the lesson last in prompts', () => {
    const refined = refineProfile(
      profile,
      { runId: 'run_1', goal: 'Adopt Jev?', conclusion: 'Adopt now', reasoningSummary: 'represent: ...' },
      { verdict: 'mismatch', expected: 'Prototype on a free clone first', lesson: 'Test the free option before paying' }
    );
    expect(refined.version).toBe('1.0.1');
    expect(refined.corrections[0]).toMatchObject({ verdict: 'mismatch', lesson: 'Test the free option before paying', runId: 'run_1' });
    const rendered = renderProfile(refined);
    expect(rendered.indexOf('Lesson: Test the free option')).toBeGreaterThan(rendered.indexOf('Order of attention'));
  });

  it('keeps validated runs as bounded calibration examples', () => {
    let refined = profile;
    for (let index = 0; index < MAX_PROFILE_EXAMPLES + 3; index++) {
      refined = refineProfile(
        refined,
        { runId: `run_${index}`, goal: `topic ${index}`, conclusion: 'c', reasoningSummary: 'r' },
        { verdict: 'match' }
      );
    }
    expect(refined.examples).toHaveLength(MAX_PROFILE_EXAMPLES);
    expect(refined.examples[0]?.topic).toBe('topic 3');
  });

  it('bumps versions predictably', () => {
    expect(bumpPatchVersion('2.4.9')).toBe('2.4.10');
    expect(bumpPatchVersion('draft')).toBe('draft.1');
  });
});
