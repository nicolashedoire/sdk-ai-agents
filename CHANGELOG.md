# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation
- *Why this SDK*: what it does differently from other agent frameworks, what they also do, what they do better and when to choose it (docs page and README section).

### Changed
- The conclusion guard can commit a **choice of action** the thinker clearly prefers (`preferenceFit` ≥ `decisionThreshold`) when its evidence support reaches `limits.minProposalSupport` (0.35): with a real thinker profile, questions such as "would you take this job?" always ended in an abstention because they have little evidence to weigh. Claims about the world (rules, explanations) still need evidence support ≥ `decisionThreshold`. The rule is recorded in `cognition.started` (`commitRules.minProposalSupport`); runs recorded before keep the evidence-only rule.
  - Public types: `CognitiveLimits` has a new field `minProposalSupport`, and `DecisionBlocker` a new variant `low_fit` (an exhaustive `switch` over blocker kinds needs a new case).
  - `minProposalSupport` may not exceed `decisionThreshold` (`ValidationError`); set it equal to switch the path off. Lowering `decisionThreshold` without setting it lowers the default floor with it.
  - The model is told that a statement about what is true is never a `proposal`, since the kind now decides which commitment rule applies, and, first of all, that when the goal asks what to do, how to react or which action to take, the hypotheses are the candidate courses of action and must cover the answer the thinker would give. With a real model and a real thinker profile, the hypotheses for "would you take this job?" were statements ("the systems could be modernized"), so no answer could be committed even when the rationale said "I decline"; with this instruction, two of three such questions ended committed instead of none.
- The documentation says plainly that a cognitive agent can imitate the way a given person reasons, and what that covers: the thinker profiles guide explains each step, where the profile weighs and where it never does, and how to measure how close the imitation gets. A new page, *Key terms in plain words*, explains every term used in the documentation.

### Fixed
- Tool parameter schemas sent to LLMs and MCP clients kept only property types: enum values, descriptions, nested objects and array items were lost, so models invented arguments (seen with a real model inventing a metric name). They are now converted with `zod-to-json-schema` (new dependency).
- `seek_information` no longer spends two attempts on a question no available tool can answer: the unknown is dropped at once with the reason, so the other open questions get their turn. A step that brings no observation is recorded as failed.
- The minimum zod version is 3.25.28 (required by `zod-to-json-schema`).
- The model sees the experiments already run and their results, and is asked for untested, discriminating tests: with a real model, runs stopped repeating the same experiment.
- Jev reached through Vercel AI Gateway (`typesafe-ai/jev`) is priced by default; the typed decisions guide and the cognitive example show how to use an AI Gateway key.
- A 429 meaning the account is out of credit or quota (`insufficient_quota`, `credit_balance_exhausted`, billing limits) is no longer retried: it failed only after useless waits. Found with a real OpenAI key.
- `LLMProviderError` messages include the vendor's message (`LLM provider error: openai: 429 You have no credits remaining…`), with any API key fragment masked (`redactApiKeys`), and a cognitive run that stops after consecutive failures says what the last one was.

### Added
- **Evidence loop** (observe → compare → deduce → verify → revise) in cognitive agents, with three new operations:
  - `compare_observations` records similarities, differences, evolutions, incompatibilities and counterexamples;
  - `test_prediction` runs your `OutcomeEvaluator` (no LLM call) and records a `cognition.evaluated` event;
  - `revise` turns a refuted or contradicted hypothesis into a variant with `parentId`, scope and a required `difference`.
- **Observations with provenance**: `think({ observations })`, tool results and test results become observations (`O1…`) with source, event id, time, context, fingerprint and origin group; repeated evidence is marked as a duplicate and adds no weight; facts cite the observations they come from, are not added twice, and can be retracted or superseded.
- **Hypotheses** state their `kind` (proposal, rule, explanation), inference, premises and scope; **predictions** (`P1…`) carry an expected result, a falsifier and test parameters, are recorded before they are tested and tested once. A refuted prediction rejects its hypothesis and is logged as a resolved `refuted_prediction` contradiction; an inconclusive or failed test, or a refutation that reports no observation, never rejects anything.
- **Evidence kept apart from preferences**: `support` (evidence) and `preferenceFit` (thinker fit, proposals only) are separate scores; only proposals are ranked with preferences (`limits.preferenceWeight`); the state's confidence is the evidence support of the best-ranked hypothesis.
- **Stale assessments**: an `evidenceRevision` counter makes earlier assessments stale when the evidence changes; a comparison must reassess every hypothesis in play (the LLM is asked to repair an incomplete one), and one that fails or skips a hypothesis does not count.
- **Conclusion guard**: `decide` is offered only when a hypothesis is critiqued, freshly assessed, free of unresolved contradictions in its scope, has no untested prediction while tests are possible, and reaches `decisionThreshold`. A decision that is not ready, or selects no hypothesis, is deferred while the budget lasts; a forced decision becomes `provisional` with `missing`, or an `abstain` (confidence 0) — also when the model cannot produce a decision at all. Decision confidence is capped by evidence support.
- Contradictions have a category and are resolved once, only with cited observations or facts; the resolution and its action are kept. Engine-found contradictions are not duplicated.
- Thinker feedback accepts `agreement` (share the thinker agreed with) and `wrongAbout` (where the reasoning went wrong); both are kept with corrections and `agreement` is exported with the controller dataset.
- Options `evaluator`, `generator` and a custom `HypothesisAssessor` for `assessment`; limits `maxPredictionTests` and `preferenceWeight`.
- Building blocks exported: `assembleThought`, `admitProposal`, `settleDecision`, `assessReadiness`, `rankHypotheses`, `PredictionTester`, observation builders and their types.
- Documentation: *Evidence & verification* guide, new evidence-loop illustration, updated loop and architecture illustrations, `examples/rule-discovery.ts`.

### Changed
- Every thought enters the state through `assembleThought`: fields are restricted per operation, engine-only fields (observations, test results, failures, decision status) are stripped from proposals, and an invalid thought from a custom component is recorded as a failed operation instead of stopping the run. Components receive a copy of the state.
- A step that changed nothing it was meant to change (no new hypothesis, nothing newly simulated or critiqued, no comparison recorded), an incomplete comparison and a deferred decision count as failed attempts of their operation; `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `compare` and `decide` are no longer offered after two failed attempts in a row, until another step brings new evidence (a step that succeeded, or a tool or test result recorded by the engine). Deferrals and steps without effect are recorded as failed (`cognition.thought.failed`, `cognition.operation_failed`) but do not count toward `maxConsecutiveFailures`, which counts failures of the model or its tools (an incomplete comparison after repair included).
- A repeated observation counts as the same evidence as its original (facts and test results reference the original), and the same model contradiction is not recorded twice.
- Proposals that restate an existing hypothesis (rejected or still in play) or a variant without `difference` are removed before the `maxHypotheses` cap, so they cannot take a valid proposal's place; a known fact read again gains the new source instead of being duplicated.
- `TypedHypothesisAssessor` asks evidence questions without the thinker's profile and fit questions in a second request, proposals only (the `evidenceWeight` option is removed); a missing evidence answer makes it fall back to the LLM comparison.
- `cognition.started` records `schemaVersion: 2`, initial observations and commit rules; runs without a version are rebuilt with their original rules (decision on a rejected hypothesis kept without its reference, patch confidence used, no evidence rules).
- `ActionEngine.executeIntention` returns the `tool.called` and `action.executed` events it recorded (the `events` field used to be empty).
- Public types gained required fields: `CognitiveLimits` (`maxPredictionTests`, `preferenceWeight`), `MentalState` (`schemaVersion`, `observations`, `comparisons`, `predictions`, `evidenceRevision`, `observationsCompared`, `commitRules`), `Hypothesis` (`kind`, `premiseRefs`, `evidenceRefs`, `counterEvidenceRefs`), `Fact` (`observationRefs`, `status`) and profile corrections (`wrongAbout`). `ThoughtRequest.observation` is a `ToolObservation` with an `observationId`. The patch `confidence` is only used by legacy runs, and `ALLOWED_FIELDS` no longer lists it.
- `describeMentalState` omits empty collections and adds readiness and ranking, so the `state` of exported controller datasets changes shape, for older runs too.
- `ReasoningFeedback` is the schema's input type (`wrongAbout` optional) and `refineProfile` validates it; `thoughtPatchSchema` and patch types live in `thought-patch.ts`, `describeMentalState` in `mental-state-view.ts` (both still exported from the package entry).

## [0.2.0] - 2026-09-23

### Added
- **Cognitive agents** (`sdk.createCognitiveAgent`, `agent.think`): explicit mental state (facts, assumptions, constraints, unknowns, hypotheses, contradictions, failures, confidence) improved by seven operations — represent, hypothesize, simulate, critique, seek information, compare, decide. Event-sourced thought patches, deterministic reducer with invariants, forced decision on the last step, timeout and cancellation.
- **Controllers**: deterministic heuristic controller and a typed-decision controller (Jev) with confidence gating and fallback; custom controllers through `CognitiveController`.
- **Thinker profiles**: versioned reasoning profiles rendered into every prompt, `distillThinkerProfile` from explained topics, `learnFromFeedback` with `match` / `partial` / `mismatch` verdicts, `exportControllerDataset` (JSON Lines).
- **Typed decisions**: `JevClient` for TypeSafe Jev (`POST /v1/systemone`) or any compatible backend, with question validation, answer validation, timeout, retries honoring `retry-after`; `sdk.decisions` with `ask`, `choose`, `selectMany`, `check`, `rate`.
- **MCP connectors** (`@sdk-ai-agents/core/mcp`): `createMcpServer` / `serveMcpOverStdio` expose governed tools, `connectMcpServer` imports tools from stdio, Streamable HTTP or custom transports.
- **API costs**: token usage recorded on LLM and typed-decision events, `sdk.getRunCost(runId)`, configurable pricing (Jev price included).
- **Retry policy**: `retry` option applied per provider before fallback (vendor client retries disabled to avoid stacking), OpenAI/Anthropic connection errors and timeouts recognized, `retry-after` / `retry-after-ms` honored up to `maxRetryAfterMs` (60 s, or `maxDelayMs` when a fallback provider can take over), per-tool `retry`, `provider.retry` and `tool.retry` events, exported `withRetry`.
- **Incident alerts**: `incidents` option, `MonitoredEventStore`, default rules, throttling, severity threshold, `EmailIncidentNotifier`, `ResendEmailTransport`, `WebhookIncidentNotifier` (JSON or Slack), `incident.reported` events, `sdk.getIncidents(runId)`.
- `llmProvider` option to inject any `LLMProvider`; `sdk.listTools()` and `sdk.executeTool()` for governed execution outside agents; `AgentImpl.id` and `AgentImpl.name`; `sdk.stopRun()` also stops cognitive runs.
- `ActionContext.allowedTools`: cognitive agents and the MCP server can only run the tools they were given, denied as `allowed-tools` policy violations before execution; replay applies the restriction recorded in `cognition.started` and, like the cognitive run itself, continues past denied or failing tools. Governed agents keep their existing behavior (documented). `createMcpServer` sends error causes to clients only with `exposeErrorDetails`.
- Guards in the cognitive loop: `maxHypotheses` enforced in code, reframing capped, failed operations not counted as done, limits validated, profile snapshotted per run, custom controllers that throw fall back to the heuristic.
- Documentation site (VitePress) with illustrations, published by the `Docs` workflow; README rewritten.

### Changed
- `defineTool` infers the handler parameters from the Zod schema; typed Choice answers are typed with the offered options.
- Costs include failed thought attempts and model calls per repair, and prices are looked up by the returned model id and by the requested model name.
- The run status is the last lifecycle event, so events appended after the end of a run do not reopen it.
- `FileEventStore` serializes flushes per run, takes the buffer before writing and writes atomically (temporary file + rename): overlapping flushes no longer duplicate or drop events. `getRunIds()` flushes buffered events first; `destroy()` returns a promise that resolves after the final flush. Mental-state rebuild, costs and datasets ignore events repeated with the same id.
- SQLite and PostgreSQL event stores are exported from the package entry.
- `apiKey` is optional when `llmProvider` is given; `pg` and `@modelcontextprotocol/sdk` are optional peer dependencies; `zod` (^3.25, zod 4 not supported yet) is a peer dependency. `createMcpServer` requires the explicit list of tools to expose. The Jev API key is kept in a private field.
- All documentation, planning artifacts and code comments are in English.

### Fixed
- Policy engine: built-in rules (`maxSteps`, `maxTokens`, `budgetLimit`, `maxDuration`, `allowedTools`) were read as missing fields by the generic condition evaluator and never applied — budget, timeout and allowlist policies now deny as documented.
- Regression detector: an event that became a failure (e.g. `action.executed` → `action.failed`) is now a critical regression.
- Trace validator: with `compareStructureOnly`, value differences are reported and give a `partial` status instead of a silent `pass`.
- Golden trace YAML export always quotes strings, so values like `true`, `null` or `123` keep their type.
- The package-level `defineTool` builds a tool without registering it in a hidden module-wide SDK (which also opened an event store on `./events`); the SDK registers it when an agent uses it.
- Approval workflow tests now drive a real agent run through an injected LLM provider instead of calling the OpenAI API with a fake key.
- Lint: 177 Biome errors in older modules fixed (`noStaticOnlyClass` turned off: the static utility classes are part of the tested API); sources formatted; CI uses a valid `npm run format:check`.

### Known issues
- The built-in OpenAI and Anthropic providers do not cancel a request already in flight: timeouts and stops apply between model calls.

## [0.1.0] - 2026-01-06

### Added
- **MVP Core Features**
  - Native event-sourcing with file persistence
  - Reasoning Engine with OpenAI integration
  - Action Engine with reasoning/action separation
  - Policy Engine with validation before every action
  - Tool Registry with deny-by-default
  - Replay Engine to replay executions without an LLM
  - SDK API Layer with a simple, intuitive interface

- **Agent Lifecycle**
  - Agent creation with minimal configuration
  - Agent execution with a controlled loop
  - Execution stop with AbortController
  - Active run management

- **Tool Management**
  - Tool definition with Zod validation
  - Tool Registry with allowlist
  - Tool versioning
  - Validation error handling

- **Capabilities System**
  - Capability creation to group tools
  - Auto-registration of tools in capabilities
  - Support in AgentConfig

- **Policies & Governance**
  - Global and per-agent policies
  - Budget (maxSteps, maxTokens)
  - Timeout
  - Tool allowlist
  - Custom policies

- **Tracing & Observability**
  - Structured traces with timeline
  - JSON and text export
  - Event filtering
  - Trace retrieval by runId

- **Replay**
  - Deterministic replay without an LLM
  - Replay with modifications (input, policies, tools)
  - Reproduction of the same action sequence

- **Versioning**
  - Agent versioning
  - Tool versioning
  - Capability versioning
  - Configuration hash (configHash)

- **Documentation**
  - Complete Quick Start guide
  - Key concepts documentation
  - Complete examples
  - README with installation and usage

- **Testing**
  - 74 passing unit tests
  - Integration tests
  - Performance tests (benchmarks)

### Security
- Deny-by-default for all tools
- Mandatory Zod validation for all inputs
- Policies applied structurally
- Full traceability of all actions

### Performance
- Optimized SDK overhead (< 10ms per event)
- Automatic event batching
- Fast SDK initialization

## [Unreleased]

### Planned
- Multi-provider LLM (Anthropic, etc.)
- SQL-based Event Store
- Advanced policies (human approval)
- Cognitive observability (reasoning graph)
- Performance optimizations
