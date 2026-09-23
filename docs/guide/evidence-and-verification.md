# Evidence & verification

A cognitive agent should believe what it can justify, test what it predicts, and change its rules when the world disagrees. The cognitive loop therefore tracks **where every piece of evidence comes from**, keeps **evidence and preferences apart**, confronts predictions with **real tests**, and only **commits** to an answer that passes a readiness check written in code.

![Observe, compare, deduce, test, revise — then the conclusion guard](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## Give it what you observed

Pass the measurements, cases or documents you already have with the problem. Each one becomes an **observation** with an id (`O1`, `O2`…) the reasoning can cite.

```ts
const result = await agent.think({
  problem: 'Does the rolling time on our plane depend on the ball?',
  observations: [
    {
      content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
      summary: 'Steel ball, 100 g: 1.07 s',
      originGroup: 'bench',
    },
    {
      content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
      summary: 'Steel ball, 400 g: 1.07 s',
      originGroup: 'bench',
    },
  ],
});
```

Tool results and test results become observations too. Their provenance is written by the engine, never by the model:

| Field | Meaning |
| --- | --- |
| `sourceKind` | `input` (given with the problem), `tool` (a governed tool call) or `evaluation` (a prediction test) |
| `source`, `sourceEventId` | The tool or evaluator, and the event holding the full payload (`action.executed`, `cognition.evaluated`) |
| `observedAt`, `context` | When, and in which situation, it was observed |
| `summary` | Bounded text shown to the model |
| `fingerprint` | Hash of the full content |
| `originGroup` | Observations with the same origin are **not** independent confirmations |
| `duplicateOf` | Set when the same content from the same origin was already observed |

Facts cite the observations they were read from (`observationRefs`); a fact extracted from a tool result is linked to it automatically, and a fact already known is not added twice — the new source is added to it as corroboration. The model is instructed to read a source that asserts X as *the source asserts X*, not as proof of X. The code makes sure that repeating the same evidence adds no weight: a duplicate does not count as a change of evidence, and facts or tests that repeat an earlier observation point to the original.

## Compare observations

`compare_observations` relates observations (and facts) to each other. It is offered when at least two comparable observations exist — given with the problem or returned by tools, duplicates and test results excluded — and new ones arrived since the last comparison.

| Relation | Meaning | What the code does |
| --- | --- | --- |
| `similarity` | Same value or behaviour on an aspect | Recorded — a similarity is not a cause |
| `difference` | A difference explained by context | Recorded |
| `evolution` | A change over time | Recorded |
| `incompatibility` | They cannot both hold | Opens a contradiction (`source_disagreement` across origins), once |
| `counterexample` | A case that breaks a hypothesis | Kept as counter-evidence of that hypothesis, opens a contradiction, once |

## Rules, explanations and proposals

A hypothesis states what kind of claim it is, how it was inferred and what it rests on:

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind` is `proposal` (an answer or an action — the default), `rule` (a regularity) or `explanation` (a cause). `inference` is `induction`, `abduction` or `deduction`; the label never makes the claim true.

## Predictions and the outcome evaluator

`simulate` deduces **predictions** that could fail: what should be observed (`expected`), which observation would prove the hypothesis wrong (`falsifier`), in which `context`, and the structured `test` parameters an evaluator needs. A prediction is recorded **before** it is tested, and tested once. The model sees the experiments already run and their results (`experiments` in the state view) and is asked not to repeat one, but to choose a test on which the hypotheses in play disagree.

An `OutcomeEvaluator` confronts it with the world — a simulator, a measurement, a test suite, a query:

```ts
import type { OutcomeEvaluator } from '@sdk-ai-agents/core';

const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const run = await rollOnTheBench(prediction.test); // your measurement
    if (!run) return { verdict: 'inconclusive', reason: 'the bench is busy' };
    const refuted = Math.abs(run.seconds - run.expectedSeconds) / run.expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: run,
      summary: `${run.material} ball: ${run.seconds} s`,
      metrics: { seconds: run.seconds },
      ...(refuted ? { causeCandidates: ['material deforms', 'surface grip'] } : {}),
    };
  },
};

const agent = sdk.createCognitiveAgent({ name: 'physicist', model: 'gpt-4o', evaluator: bench });
```

With an evaluator, `test_prediction` becomes available. It calls **your evaluator, not the language model**, records the full report as a `cognition.evaluated` event, and adds what was observed as an `evaluation` observation pointing to that event.

| Verdict | Effect |
| --- | --- |
| `confirmed` | The observation is added to the hypothesis' `evidenceRefs` |
| `refuted` | The falsifier was observed: the hypothesis is **rejected**, the observation kept as counter-evidence, and the refutation logged as a resolved `refuted_prediction` contradiction |
| `inconclusive` | Recorded; what it observed, if anything, is new evidence; nothing else changes |

Every test uses one of the `limits.maxPredictionTests`. An evaluator that throws or returns an invalid report gives `inconclusive`, and so does a `refuted` report that does not say what was observed — a failed measurement never refutes anything. Do not use a model judging its own reasoning as an evaluator: self-critique can prepare a test, it cannot replace one.

## Revision

When evidence contradicts a hypothesis, `revise` asks for a **variant**: a new hypothesis with `parentId`, a narrower `scope` or an added variable, and the `difference` it makes — a variant that does not state its difference is refused. The original keeps its id, its rejection reason and its counterexample; restating a hypothesis already considered, rejected or not, is refused. In the inclined-plane test, the refuted rule *"rolling time does not depend on the ball"* becomes *"for rigid balls, rolling time does not depend on mass"*, which a second test confirms.

## Evidence is not preference

| Score | Question | Who sees the thinker profile? |
| --- | --- | --- |
| `support` | How well do observations, facts, predictions and critiques support it? | Jev: nobody — the evidence questions are sent without the profile. LLM: the model is instructed to ignore preferences |
| `preferenceFit` | How well does this proposal suit the thinker? (proposals only) | Yes, that is its purpose |

The code never mixes the two scores. Hypotheses are ranked by `support` alone for rules and explanations; proposals are ranked by `(1 − w) · support + w · preferenceFit`, with `w = limits.preferenceWeight` (0.4 by default). Changing the profile can therefore change **which action is chosen**; with Jev it cannot change **how credible a claim is**, and with an LLM judge that separation rests on its instructions. The state's `confidence` follows the evidence support of the best-ranked hypothesis: the `confidence` a model writes in a thought is ignored.

`support` is a judgement by a model, not a calibrated probability. What is measured is the track record: which predictions were confirmed or refuted.

## Stale assessments

The state keeps an `evidenceRevision` counter. It increases when a new (non-duplicate) observation, a new fact, a fact revision, a contradiction, a counterexample or a conclusive test result arrives. Assessments made before are **stale**: `compare` is offered again, and a stale hypothesis cannot be committed. A comparison must reassess **every** hypothesis in play — the model is asked to repair one that skips a hypothesis, and one that still skips a hypothesis, or fails, does not count as done.

## Contradictions and fact revisions

Contradictions carry a `category`: `source_disagreement`, `temporal_change`, `context_difference`, `logical_incompatibility` or `refuted_prediction`. A contradiction is resolved **once**, and only when the resolution **cites observations or facts** that settle it (`basisRefs` — other references are reported and ignored); it can say what was done (`retracted`, `restricted`, `replaced`, or `explained` by default). The resolution is kept with the contradiction. Facts are never deleted: they are `retracted` or `superseded` by a replacement, with the reason.

## The conclusion guard

An answer may be **committed** only when its hypothesis:

- was critiqued;
- was assessed since the evidence last changed;
- is not concerned by an unresolved contradiction (one naming nothing concerns everything);
- has no untested prediction while the test budget allows testing it;
- has an evidence `support` of at least `limits.decisionThreshold`.

`decide` is offered only when a hypothesis passes. A decision that selects another hypothesis, or none, is **deferred** while the budget lasts; a deferral counts as a failed attempt, and `decide` is not offered after two in a row. On the last step, or when nothing else is possible, the engine still asks for a decision, and settles it:

| `decision.status` | When | `decision.missing` |
| --- | --- | --- |
| `committed` | The readiness check passes | `[]` |
| `provisional` | The budget ran out on a live hypothesis | What is not established yet |
| `abstain` | No hypothesis is selected, the one selected was rejected, or the model could not produce a decision at all | Why — an abstention has confidence 0, and its answer is written by the engine (what the model wrote is kept in `rationale`) |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

The run status stays `completed`: an explicit abstention is a valid outcome. A decision's confidence is capped at the evidence support of its hypothesis.

## A budget that is not wasted

A step that changed nothing it was meant to change — no new hypothesis (all proposals refused), nothing newly simulated or critiqued, no comparison recorded — a comparison that skips a hypothesis, and a deferred decision all count as failed attempts of their operation. When `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `seek_information`, `compare` or `decide` failed twice in a row, it is no longer offered **until another step brings new evidence** — a step that succeeded, or a tool or test result the engine recorded; what failing steps wrote themselves does not count — so the run moves on instead of repeating itself. A `seek_information` that brings no observation (no tool fits, or the call fails) counts as such a failure; `test_prediction` is bounded by its test budget.

`limits.maxConsecutiveFailures` counts failures of the model or its tools, including a comparison that still skips a hypothesis after repair. Deferred decisions and steps that changed nothing are recorded as failed steps but never count toward it. Components (thought generator, assessor, evaluator) receive a copy of the state: they cannot alter what is recorded, and an invalid thought from a custom component is recorded as a failed operation instead of stopping the run.

## Tests are your specification

`src/__tests__/rule-discovery.test.ts` runs the whole loop with a scripted model and a deterministic physics bench — induce, predict, get refuted, revise, verify, commit — and checks every event. `src/__tests__/epistemic-state.test.ts`, `epistemic-guards.test.ts` and `epistemic-liveness.test.ts` check each rule above on its own, and a trace recorded by the previous version checks that older runs rebuild unchanged.

## Older runs

Runs record the version of these rules (`schemaVersion: 2` in `cognition.started`). Runs recorded before have no version: `getMentalState` rebuilds them with their original rules, and their new collections are empty.

## Not there yet

- **Memory across runs.** Verified rules are not yet reused by later runs; a `KnowledgeStore` is the next step.
- **Targeted staleness.** New evidence makes every assessment stale, not only the ones it concerns — conservative, and simple to audit.
- **Choosing what to explore.** Controllers choose an operation; the target (which unknown, which prediction) is the first eligible one.
- **Calibration.** There is no calibrated predictive confidence yet: `support` is a judgement, and the track record of predictions is what is measured.
- **Verified inference.** The inference label (induction, abduction, deduction) is declared, not checked by a formal verifier.
- **Structured checks.** Constraints are free text and are not checked by the conclusion guard; conflicts are not detected by rules on structured data; a resolution action does not change facts or hypotheses by itself.
