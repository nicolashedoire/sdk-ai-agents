import type { KnowledgeEvidence, KnowledgeFinding } from './knowledge-records.js';
import type { Hypothesis, MentalState } from './mental-state.js';

/**
 * What a run established with real tests: every rule or explanation with at least one
 * prediction an outcome evaluator confirmed or refuted. Proposals (choices of action) and
 * untested or inconclusive predictions are never remembered: memory keeps only what the
 * world answered, not what the model or the thinker believed.
 */
export function knowledgeFindings(state: MentalState, runId: string): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  for (const hypothesis of state.hypotheses) {
    if (hypothesis.kind === 'proposal') continue;
    const evidence = testedEvidence(state, hypothesis, runId);
    if (evidence.length === 0) continue;
    const parent = hypothesis.parentId
      ? state.hypotheses.find((candidate) => candidate.id === hypothesis.parentId)
      : undefined;
    findings.push({
      statement: hypothesis.statement,
      kind: hypothesis.kind,
      ...(hypothesis.scope ? { scope: hypothesis.scope } : {}),
      ...(parent ? { revises: parent.statement } : {}),
      ...(hypothesis.difference ? { difference: hypothesis.difference } : {}),
      evidence,
    });
  }
  return findings;
}

function testedEvidence(
  state: MentalState,
  hypothesis: Hypothesis,
  runId: string
): KnowledgeEvidence[] {
  const evidence: KnowledgeEvidence[] = [];
  for (const prediction of state.predictions) {
    const evaluation = prediction.evaluation;
    if (prediction.hypothesisId !== hypothesis.id || !evaluation) continue;
    if (evaluation.verdict === 'inconclusive') continue;
    const observation = evaluation.observationId
      ? state.observations.find((candidate) => candidate.id === evaluation.observationId)
      : undefined;
    evidence.push({
      runId,
      predictionId: prediction.id,
      verdict: evaluation.verdict,
      expected: prediction.expected,
      observed: observation?.summary ?? evaluation.reason ?? evaluation.verdict,
      ...(prediction.context ? { context: prediction.context } : {}),
      evaluatorId: evaluation.evaluatorId,
      evaluatorVersion: evaluation.evaluatorVersion,
    });
  }
  return evidence;
}
