# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig`

| Option | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | Key of the primary provider (not needed with `llmProvider`) |
| `provider` | `'openai' \| 'anthropic'` | Primary provider, default `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | Per-provider `apiKey` and `defaultModel` |
| `fallbackProviders` | `Array<{ provider, config? }>` | Tried in order when the primary fails |
| `llmProvider` | `LLMProvider` | Your own provider (local model, gateway, test double) |
| `retry` | `Partial<RetryPolicy> \| false` | LLM retry policy, per provider, before fallback |
| `jev` | `JevClientConfig` | Enables TypeSafe Jev for typed decisions — directly, or through [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) with `baseUrl` and `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Any typed-decision backend (takes precedence over `jev`) |
| `pricing` | `PricingTable` | USD per million tokens, merged over defaults |
| `incidents` | `IncidentMonitorOptions` | Notifiers, rules, severity threshold, throttling |
| `eventStore` | `IEventStore` | Defaults to `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Global policies |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Storage of testing artifacts |

## Agents

| Method | Returns | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Governed agent: `run(input)`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name` |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Registers a tool; the handler is typed from its Zod schema |
| `defineCapability(definition)` | `Capability` | Groups tools |
| `listTools()` | `Tool[]` | Every registered tool |
| `executeTool(name, params, { agentId?, runId?, allowedTools? })` | `Promise<unknown>` | Governed execution outside an agent (used by the MCP server) |
| `stopRun(runId)` | `Promise<void>` | Stops a governed or cognitive run |

### `CognitiveAgentConfig`

| Option | Default | |
| --- | --- | --- |
| `name`, `model` | — | Required |
| `profile` | `DEFAULT_THINKER_PROFILE` | How the agent reasons |
| `tools`, `policies` | `[]` | Governed like everywhere else |
| `systemPrompt` | — | Extra instructions for every prompt |
| `limits` | see [Cognitive agents](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` or a `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` or your own `HypothesisAssessor` for the `compare` operation |
| `knowledge` | — | Memory across runs: `{ store, scope, recallLimit? (10), record? (true) }`, see [Memory across runs](../guide/memory) |
| `evaluator` | — | An `OutcomeEvaluator` that tests predictions; enables `test_prediction` |
| `generator` | LLM generator on `model` | Your own `ThoughtGenerator` (observation comparisons included); its thoughts still go through the engine's admission rules |
| `temperature`, `maxTokens` | `0.4`, — | Thought generation settings |
| `providerSettings` | — | Settings for tool selection (native reasoning engine) |

### `CognitiveRunResult`

`{ runId, status, answer?, decision?, state, error? }` — `status` is `completed`, `failed` or `cancelled`; `decision.status` is `committed`, `provisional` or `abstain`, with `decision.missing` listing what is not established; `state` is the final `MentalState`.

### `OutcomeEvaluator`

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

See [Evidence & verification](../guide/evidence-and-verification).

## Reasoning & profiles

| Method | Returns |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — rebuilt from events |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Typed decisions — `sdk.decisions`

Throws a `ValidationError` when no backend is configured.

| Method | Returns |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — answers typed from the questions |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Question helpers: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Operations

| Method | Returns |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Human approvals |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets and policy audit |

## Traces, replay and testing

| Method | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Read runs |
| `replay(runId, modifications?)` | Re-execute without the LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Understand decisions |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Test agents like code |

## MCP — `@sdk-ai-agents/core/mcp`

| Function | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, agentId?, instructions?, exposeErrorDetails? })` | MCP `Server` exposing the listed governed tools (`tools` is required) |
| `serveMcpOverStdio(sdk, options)` | Same, connected to stdin/stdout |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` |

## Building blocks

Everything the SDK uses is exported for custom setups: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, and all the types.
