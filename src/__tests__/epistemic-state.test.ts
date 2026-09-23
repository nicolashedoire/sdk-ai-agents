import { describe, expect, it } from 'vitest';
import { availableOperations, nextRevisionTarget } from '../cognition/cognitive-operations.js';
import { assessReadiness, rankHypotheses, readyHypothesis, settleDecision } from '../cognition/decision-readiness.js';
import { TypedHypothesisAssessor } from '../cognition/hypothesis-assessor.js';
import { applyThought } from '../cognition/mental-state-reducer.js';
import { createMentalState, type MentalState } from '../cognition/mental-state.js';
import { observationFromInput, observationFromTool } from '../cognition/observation-records.js';
import { defineThinkerProfile } from '../cognition/thinker-profile.js';
import { thoughtPatchSchema, type ObservationRecord, type ThoughtPatchInput } from '../cognition/thought-patch.js';
import { InMemoryDecisionClient, level } from './support/in-memory-decision-client.js';

const context = { maxHypotheses: 3, canSeekInformation: false };

function think(state: MentalState, operation: string, patch: ThoughtPatchInput) {
  return applyThought(state, operation, thoughtPatchSchema.parse(patch));
}

function measurement(content: unknown, originGroup: string): ObservationRecord {
  return observationFromInput({ content, originGroup }, 1_000);
}

/** A framed problem with one critiqued, assessed proposal (H1) at support 0.8. */
function examinedState(options: Parameters<typeof createMentalState>[2] = {}): MentalState {
  let state = createMentalState('Which supplier should we use?', undefined, options);
  state = think(state, 'represent', {
    summary: 'framed',
    addFacts: [{ statement: 'Supplier A delivered on time twice', source: 'input' }],
  }).state;
  state = think(state, 'hypothesize', { summary: 'h', addHypotheses: [{ statement: 'Choose supplier A' }] }).state;
  return think(state, 'critique', {
    summary: 'c',
    critiques: [{ hypothesisId: 'H1', objection: 'Only two deliveries observed', severity: 'minor' }],
    hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.8 }],
  }).state;
}

describe('observations and provenance', () => {
  it('links tool facts to the observation recorded in the same thought', () => {
    const observation = observationFromTool({
      toolName: 'lookup_metric',
      parameters: { metric: 'churn' },
      result: { value: '4%' },
      sourceEventId: 'evt_42',
      observedAt: 5,
      context: 'U1: churn?',
    });
    const { state, issues } = think(createMentalState('goal'), 'seek_information', {
      summary: 'churn measured',
      observations: [observation],
      addFacts: [
        { statement: 'Churn is 4%', source: 'tool' },
        { statement: 'Churn is high', source: 'inference', observationRefs: ['O9'] },
      ],
    });
    expect(state.observations[0]).toMatchObject({ id: 'O1', sourceKind: 'tool', source: 'lookup_metric', sourceEventId: 'evt_42', originGroup: 'tool:lookup_metric' });
    expect(state.facts[0]?.observationRefs).toEqual(['O1']);
    expect(state.facts[1]?.observationRefs).toEqual([]);
    expect(issues).toEqual(['fact cites unknown observation O9']);
  });

  it('does not count a repetition of the same evidence', () => {
    let state = examinedState({ observations: [measurement({ delivery: 'on time' }, 'audit-1')] });
    const before = state.evidenceRevision;
    expect(readyHypothesis(state)?.id).toBe('H1');

    state = think(state, 'seek_information', {
      summary: 'same report again',
      observations: [measurement({ delivery: 'on time' }, 'audit-1')],
    }).state;
    expect(state.observations[1]).toMatchObject({ id: 'O2', duplicateOf: 'O1' });
    expect(state.evidenceRevision).toBe(before);
    expect(readyHypothesis(state)?.id).toBe('H1');

    // The same content from another origin is new evidence: the assessment becomes stale.
    state = think(state, 'seek_information', {
      summary: 'second audit',
      observations: [measurement({ delivery: 'on time' }, 'audit-2')],
    }).state;
    expect(state.observations[2]?.duplicateOf).toBeUndefined();
    expect(state.evidenceRevision).toBe(before + 1);
    expect(assessReadiness(state, 'H1').blockers).toEqual([{ kind: 'stale_assessment', hypothesisId: 'H1' }]);
  });
});

describe('stale assessments', () => {
  it('asks for a new comparison when evidence arrives, and a failed one does not count', () => {
    let state = think(examinedState(), 'compare', { summary: 'ranked', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.8 }] }).state;
    expect(availableOperations(state, context)).not.toContain('compare');
    expect(availableOperations(state, context)).toContain('decide');

    state = think(state, 'represent', {
      summary: 'new fact',
      addFacts: [{ statement: 'Supplier A was late last week', source: 'input' }],
    }).state;
    expect(availableOperations(state, context)).toContain('compare');
    expect(availableOperations(state, context)).not.toContain('decide');

    const failed = think(state, 'compare', { summary: 'compare failed', failed: true, addFailures: [{ description: 'timeout' }] }).state;
    expect(failed.comparedAtStep).toBe(state.comparedAtStep);
    expect(availableOperations(failed, context)).toContain('compare');

    const compared = think(failed, 'compare', { summary: 'reassessed', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.78 }] }).state;
    expect(readyHypothesis(compared)?.id).toBe('H1');
  });
});

describe('evidence and preferences', () => {
  function twoProposals(): MentalState {
    let state = createMentalState('Which tool should the team adopt?');
    state = think(state, 'represent', { summary: 'r', addFacts: [{ statement: 'Budget is small', source: 'input' }] }).state;
    return think(state, 'hypothesize', {
      summary: 'h',
      addHypotheses: [
        { statement: 'Adopt the paid tool', kind: 'proposal' },
        { statement: 'Adopt the open-source clone', kind: 'proposal' },
        { statement: 'Adoption rate depends on onboarding time', kind: 'rule' },
      ],
    }).state;
  }

  it('lets preferences reorder actions but never changes support', () => {
    const state = think(twoProposals(), 'compare', {
      summary: 'judged',
      hypothesisUpdates: [
        { hypothesisId: 'H1', support: 0.7, preferenceFit: 0.2 },
        { hypothesisId: 'H2', support: 0.7, preferenceFit: 0.9 },
        { hypothesisId: 'H3', support: 0.6, preferenceFit: 1 },
      ],
    }).state;
    // H1 and H2 are equally supported: the thinker's preference puts H2 first (0.78) and
    // H1 last (0.5). The rule H3 keeps its evidence score (0.6) despite a perfect fit.
    expect(rankHypotheses(state).map((hypothesis) => hypothesis.id)).toEqual(['H2', 'H3', 'H1']);
    expect(state.hypotheses.map((hypothesis) => hypothesis.support)).toEqual([0.7, 0.7, 0.6]);
    expect(state.confidence).toBe(0.7);
  });

  it('asks the typed assessor for fit only on proposals and keeps it apart from evidence', async () => {
    const state = twoProposals();
    const assess = async (rejects: string[]) => {
      const client = new InMemoryDecisionClient((id, question) => {
        if (id.startsWith('evidence_')) return level(question, 3);
        return level(question, id === 'fit_H1' ? (rejects.includes('paid') ? 1 : 4) : 3);
      });
      const profile = defineThinkerProfile({ id: 'p', name: 'P', rejectionCriteria: rejects });
      const assessment = await new TypedHypothesisAssessor(client).assess({ state, profile });
      return { client, updates: assessment.patch.hypothesisUpdates };
    };
    const frugal = await assess(['paid']);
    const neutral = await assess([]);

    // Evidence is judged without the thinker's profile; fit is asked apart, for proposals only.
    const [evidenceRequest, fitRequest] = frugal.client.requests;
    expect(Object.keys(evidenceRequest?.questions ?? {})).toEqual(['evidence_H1', 'evidence_H2', 'evidence_H3']);
    expect(evidenceRequest?.state).not.toHaveProperty('thinker');
    expect(Object.keys(fitRequest?.questions ?? {})).toEqual(['fit_H1', 'fit_H2']);
    expect(fitRequest?.state).toHaveProperty('thinker');
    expect(frugal.updates.map((update) => update.support)).toEqual(neutral.updates.map((update) => update.support));
    expect(frugal.updates.map((update) => update.preferenceFit)).toEqual([0.25, 0.75, undefined]);
    expect(neutral.updates.map((update) => update.preferenceFit)).toEqual([1, 0.75, undefined]);
  });
});

describe('contradictions', () => {
  it('only resolves a contradiction that cites what settles it, and keeps the resolution', () => {
    let state = think(examinedState(), 'compare', { summary: 'ranked', hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.8 }] }).state;
    state = think(state, 'represent', {
      summary: 'conflict',
      addContradictions: [{ description: 'Late delivery contradicts reliability', between: ['F1', 'H1'], category: 'source_disagreement' }],
    }).state;
    expect(assessReadiness(state, 'H1').blockers).toContainEqual(expect.objectContaining({ kind: 'contradiction', contradictionId: 'C1' }));

    const unjustified = think(state, 'represent', {
      summary: 'hand-waving',
      resolveContradictions: [{ contradictionId: 'C1', resolution: 'It is fine' }],
    });
    expect(unjustified.issues).toEqual(['cannot resolve contradiction C1: cite the observations or facts that resolve it']);
    expect(unjustified.state.contradictions[0]?.resolved).toBe(false);

    const revision = state.evidenceRevision;
    const settled = think(state, 'represent', {
      summary: 'explained',
      resolveContradictions: [{ contradictionId: 'C1', resolution: 'The late delivery was a strike', action: 'explained', basisRefs: ['F1'] }],
    }).state;
    expect(settled.contradictions[0]).toMatchObject({ resolved: true, resolutionAction: 'explained', resolutionBasis: ['F1'], category: 'source_disagreement' });
    expect(settled.evidenceRevision).toBe(revision + 1);
  });

  it('retracts and supersedes facts without losing their history', () => {
    const state = think(examinedState(), 'represent', {
      summary: 'corrected',
      reviseFacts: [
        { factId: 'F1', status: 'superseded', reason: 'the second delivery was late', replacement: { statement: 'Supplier A delivered on time once' } },
        { factId: 'F9', status: 'retracted', reason: 'typo' },
      ],
    });
    expect(state.state.facts[0]).toMatchObject({ status: 'superseded', revision: { reason: 'the second delivery was late', replacedBy: 'F2' } });
    expect(state.state.facts[1]).toMatchObject({ id: 'F2', status: 'active', statement: 'Supplier A delivered on time once' });
    expect(state.issues).toEqual(['cannot revise fact F9: not found']);
  });
});

describe('predictions and revisions', () => {
  function ruleWithPrediction(): MentalState {
    let state = createMentalState('Does rolling time depend on mass?', undefined, {
      observations: [measurement('steel ball 100 g: 1.20 s', 'bench'), measurement('steel ball 400 g: 1.21 s', 'bench')],
      commitRules: { maxPredictionTests: 3 },
    });
    state = think(state, 'represent', { summary: 'r', addFacts: [{ statement: 'Two steel balls took 1.2 s', source: 'input', observationRefs: ['O1', 'O2'] }] }).state;
    state = think(state, 'hypothesize', {
      summary: 'rule',
      addHypotheses: [{ statement: 'Rolling time does not depend on mass', kind: 'rule', inference: 'induction', premiseRefs: ['O1', 'O2', 'Z9'] }],
    }).state;
    return think(state, 'simulate', {
      summary: 'predicted',
      simulations: [{ hypothesisId: 'H1', steps: ['roll a rubber ball'], outcome: 'same time' }],
      predictions: [{ hypothesisId: 'H1', expected: 'A 100 g rubber ball takes 1.2 s', falsifier: 'It takes more than 1.32 s', test: { material: 'rubber' } }],
    }).state;
  }

  const evaluation = (verdict: 'confirmed' | 'refuted' | 'inconclusive', predictionId = 'P1') => ({
    predictionId,
    verdict,
    evaluatorId: 'bench',
    evaluatorVersion: '1',
    observation: { ...observationFromInput({ content: `rubber ball: ${verdict}`, originGroup: 'bench' }, 2_000), sourceKind: 'evaluation' as const, sourceEventId: 'evt_9' },
    reason: 'rubber ball took 1.9 s',
  });

  it('records the inference, its premises and a pending prediction', () => {
    const state = ruleWithPrediction();
    expect(state.hypotheses[0]).toMatchObject({ kind: 'rule', inference: 'induction', premiseRefs: ['O1', 'O2'] });
    expect(state.predictions[0]).toMatchObject({ id: 'P1', hypothesisId: 'H1', status: 'pending', step: 3 });
    expect(availableOperations(state, context)).toContain('test_prediction');
  });

  it('refutes a rule when its falsifier is observed, keeps the counterexample and asks for a variant', () => {
    const { state, issues } = think(ruleWithPrediction(), 'test_prediction', { summary: 'tested', evaluations: [evaluation('refuted')] });
    expect(issues).toEqual([]);
    expect(state.predictions[0]).toMatchObject({ status: 'refuted', evaluation: { evaluatorId: 'bench', observationId: 'O3', reason: 'rubber ball took 1.9 s' } });
    expect(state.hypotheses[0]).toMatchObject({ status: 'rejected', counterEvidenceRefs: ['O3'], rejectionReason: 'prediction P1 refuted: rubber ball took 1.9 s' });
    expect(nextRevisionTarget(state)?.id).toBe('H1');
    expect(availableOperations(state, context)).toContain('revise');

    const restated = think(state, 'revise', { summary: 'same again', addHypotheses: [{ statement: 'Rolling time does NOT depend on mass!', kind: 'rule' }] });
    expect(restated.state.hypotheses).toHaveLength(1);
    expect(restated.issues[0]).toContain('restates rejected hypothesis H1');

    const variant = think(state, 'revise', {
      summary: 'restricted',
      addHypotheses: [{ statement: 'For rigid balls, rolling time does not depend on mass', kind: 'rule', parentId: 'H1', difference: 'restricted to rigid materials', scope: 'rigid balls, smooth plane' }],
    }).state;
    expect(variant.hypotheses[1]).toMatchObject({ id: 'H2', parentId: 'H1', difference: 'restricted to rigid materials', status: 'proposed' });
    expect(variant.hypotheses[0]?.status).toBe('rejected');
    expect(nextRevisionTarget(variant)).toBeUndefined();
  });

  it('treats a failed measurement as inconclusive, never as a refutation', () => {
    const state = think(ruleWithPrediction(), 'test_prediction', { summary: 'tested', evaluations: [evaluation('inconclusive')] }).state;
    expect(state.predictions[0]?.status).toBe('inconclusive');
    expect(state.hypotheses[0]?.status).not.toBe('rejected');
  });

  it('tests a prediction once, and only after it was recorded', () => {
    const tested = think(ruleWithPrediction(), 'test_prediction', { summary: 'tested', evaluations: [evaluation('confirmed')] }).state;
    expect(tested.hypotheses[0]?.evidenceRefs).toEqual(['O3']);
    expect(think(tested, 'test_prediction', { summary: 'again', evaluations: [evaluation('refuted')] }).issues).toEqual(['prediction P1 was already evaluated']);

    const sameStep = think(ruleWithPrediction(), 'simulate', {
      summary: 'predict and test at once',
      predictions: [{ hypothesisId: 'H1', expected: 'x', falsifier: 'y' }],
      evaluations: [evaluation('confirmed', 'P2')],
    });
    expect(sameStep.issues).toContain('prediction P2 must be recorded before it is tested');
  });

  it('keeps a counterexample found by comparison as counter-evidence that blocks commitment', () => {
    let state = ruleWithPrediction();
    state = think(state, 'critique', { summary: 'c', critiques: [{ hypothesisId: 'H1', objection: 'only steel', severity: 'minor' }], hypothesisUpdates: [{ hypothesisId: 'H1', support: 0.8 }] }).state;
    state = think(state, 'seek_information', { summary: 'new case', observations: [measurement('wooden ball 100 g: 1.6 s', 'bench-2')] }).state;
    state = think(state, 'compare_observations', {
      summary: 'wood is slower',
      comparisons: [{ left: ['O3'], right: ['O1', 'O2'], relation: 'counterexample', aspect: 'rolling time', rationale: 'same mass, different time', hypothesisId: 'H1' }],
    }).state;
    expect(state.comparisons[0]).toMatchObject({ id: 'R1', relation: 'counterexample', hypothesisId: 'H1' });
    expect(state.hypotheses[0]?.counterEvidenceRefs).toEqual(['O3']);
    expect(state.contradictions[0]).toMatchObject({ category: 'logical_incompatibility', between: ['O3', 'H1'] });
    expect(assessReadiness(state, 'H1').ready).toBe(false);
    expect(state.observationsCompared).toBe(3);
  });
});

describe('conclusion guard', () => {
  it('defers an unready decision, then concludes provisionally when the budget forces it', () => {
    let state = createMentalState('Which supplier?');
    state = think(state, 'represent', { summary: 'r', addFacts: [{ statement: 'Two suppliers', source: 'input' }] }).state;
    state = think(state, 'hypothesize', { summary: 'h', addHypotheses: [{ statement: 'Choose A' }] }).state;
    const decision = { hypothesisId: 'H1', answer: 'Choose A', rationale: 'cheaper', confidence: 0.9, nextActions: [] };

    expect(settleDecision(state, decision, false)).toEqual({
      outcome: 'defer',
      issue: 'decision on H1 deferred: H1 has not been critiqued; H1 was not reassessed since the evidence changed; H1 has evidence support 0.5, below 0.75',
    });
    const forced = settleDecision(state, decision, true);
    expect(forced).toMatchObject({ outcome: 'apply', decision: { status: 'provisional', missing: expect.arrayContaining(['H1 has not been critiqued']) } });
    if (forced.outcome !== 'apply') throw new Error('expected a decision');

    const concluded = think(state, 'decide', { summary: 'd', decision: forced.decision });
    expect(concluded.state.decision).toMatchObject({ status: 'provisional', confidence: 0.5 });
    expect(concluded.issues).toEqual(['decision confidence capped at the evidence support of H1 (0.5)']);
  });

  it('abstains instead of answering with a rejected hypothesis', () => {
    const state = think(examinedState(), 'critique', { summary: 'x', hypothesisUpdates: [{ hypothesisId: 'H1', reject: true, reason: 'bankrupt' }] }).state;
    const settled = settleDecision(state, { hypothesisId: 'H1', answer: 'Choose A', rationale: 'r', confidence: 0.9, nextActions: [] }, true);
    expect(settled).toMatchObject({
      outcome: 'apply',
      decision: {
        status: 'abstain',
        confidence: 0,
        answer: 'No answer can be committed yet: the proposed answer relied on H1, which was rejected (bankrupt).',
        missing: ['no hypothesis is in play'],
      },
    });
  });

  it('commits when the readiness check passes', () => {
    const state = examinedState();
    const settled = settleDecision(state, { hypothesisId: 'H1', answer: 'Choose A', rationale: 'r', confidence: 0.7, nextActions: [] }, false);
    expect(settled).toMatchObject({ outcome: 'apply', decision: { status: 'committed', missing: [] } });
  });
});
