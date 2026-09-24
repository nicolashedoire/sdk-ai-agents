import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AgentImpl } from './agent.js';
import { ActionEngine } from './engines/action-engine.js';
import { assertCheckableLimits, PolicyEngine } from './engines/policy-engine.js';
import { ReasoningEngine } from './engines/reasoning-engine.js';
import { ReplayEngine } from './engines/replay-engine.js';
import { ApprovalManager } from './managers/approval-manager.js';
import { BudgetTracker } from './managers/budget-tracker.js';
import type { LLMProvider } from './providers/llm-provider.js';
import { createLLMProvider } from './providers/create-llm-provider.js';
import { FallbackProvider } from './providers/fallback-provider.js';
import { DEFAULT_RETRY_POLICY } from './resilience/retry.js';
import { RetryingLLMProvider, type ProviderRetryInfo } from './resilience/retrying-provider.js';
import type { CognitiveAgent } from './cognition/cognitive-agent.js';
import {
  assembleCognitiveAgent,
  type CognitiveAgentConfig,
} from './cognition/create-cognitive-agent.js';
import type { MentalState } from './cognition/mental-state.js';
import {
  buildControllerDataset,
  rebuildMentalState,
  toJsonLines,
  type ControllerTrainingExample,
} from './cognition/mental-state-replay.js';
import { distillThinkerProfile, type DistillProfileInput } from './cognition/profile-distiller.js';
import type { ThinkerProfile } from './cognition/thinker-profile.js';
import { DEFAULT_PRICING, type PricingTable } from './costs/pricing.js';
import { computeRunCost, type RunCostReport } from './costs/run-cost.js';
import { DecisionService } from './decisions/decision-service.js';
import { JevClient } from './decisions/jev-client.js';
import type { TypedDecisionClient } from './decisions/typed-decisions.js';
import { LLMProviderError, ValidationError } from './errors/index.js';
import { incidentSchema, type Incident } from './incidents/incident.js';
import { MonitoredEventStore } from './incidents/monitored-event-store.js';
import { computeConfigHash } from './utils/config-hash.js';
import { deriveRunStatus } from './utils/run-status.js';
import { CapabilityRegistry } from './registry/capability-registry.js';
import { ToolRegistry } from './registry/tool-registry.js';
import type { IEventStore } from './stores/event-store.js';
import { FileEventStore } from './stores/file-event-store.js';
import {
  finishWatch,
  forwardingListener,
  ObservedEventStore,
  watchRun,
} from './stores/observed-event-store.js';
import type { Agent, AgentConfig } from './types/agent.js';
import type {
  Event,
  EventFilters,
  LiveEventListener,
  LiveSubscriptionOptions,
} from './types/events.js';
import type { Policy } from './types/policy.js';
import type { ReplayModifications, ReplayOptions, RunResult } from './types/run.js';
import type { SDKConfig, Trace } from './types/sdk.js';
import type { Capability, Tool, ToolDefinition } from './types/tool.js';
import type { ResourceContent } from './types/resource.js';
import type { ReasoningGraph } from './types/reasoning-graph.js';
import type { AlternativesAnalysis } from './types/alternatives.js';
import type { DecisionPatternAnalysis } from './types/decision-patterns.js';
import type { TraceVisualization } from './types/trace-visualization.js';
import { ReasoningGraphBuilder } from './utils/reasoning-graph-builder.js';
import { ReasoningGraphExporter } from './utils/reasoning-graph-export.js';
import { AlternativesExtractor } from './utils/alternatives-extractor.js';
import { PatternAnalyzer } from './utils/pattern-analyzer.js';
import { TraceVisualizer } from './utils/trace-visualizer.js';
import { GoldenTraceManager } from './managers/golden-trace-manager.js';
import type { GoldenTrace, GoldenTraceConfig } from './types/golden-trace.js';
import { TraceValidator } from './utils/trace-validator.js';
import type { ValidationOptions, ValidationResult } from './types/validation.js';
import { RegressionDetector } from './utils/regression-detector.js';
import type { RegressionDetectionOptions, RegressionReport } from './types/regression.js';
import { RegressionTestManager } from './managers/regression-test-manager.js';
import { isRunInput, RegressionTestRunner } from './utils/regression-test-runner.js';
import { TestResultsExporter } from './utils/test-results-exporter.js';
import { AssertionManager } from './managers/assertion-manager.js';
import { AssertionEvaluator } from './utils/assertion-evaluator.js';
import { RunComparator } from './utils/run-comparator.js';
import { ComparisonReportGenerator } from './utils/comparison-report-generator.js';
import { ImpactAnalyzer } from './utils/impact-analyzer.js';
import { ImpactAnalysisManager } from './managers/impact-analysis-manager.js';
import { AdvancedEventFilterEvaluator } from './utils/advanced-event-filter.js';
import { inTimeOrder } from './utils/event-filters.js';
import type {
  RegressionTestSuite,
  RegressionTestSuiteConfig,
  RegressionTestOptions,
  RegressionTestRunResult,
  RegressionTestSuiteResult,
} from './types/regression-test.js';
import type { TestResultsExportOptions } from './types/test-results-export.js';
import type {
  Assertion,
  AssertionCondition,
  AssertionEvaluationReport,
  AssertionOptions,
} from './types/assertion.js';
import type { ComparisonOptions, RunComparison } from './types/comparison.js';
import type { ImpactAnalysisOptions, ImpactAnalysis } from './types/impact-analysis.js';
import type {
  AdvancedEventFilter,
  AdvancedEventQueryResult,
  EventStatistics,
} from './types/advanced-event-filter.js';

export interface SDK {
  createAgent(config: AgentConfig): AgentImpl;
  defineTool<Schema extends z.ZodSchema>(definition: ToolDefinition<Schema>): Tool;
  defineCapability(definition: {
    name: string;
    description: string;
    tools: string[] | Tool[];
    version?: string;
    metadata?: Record<string, unknown>;
  }): Capability;
  /** Re-executes a run's recorded intentions without the LLM; `options.onEvent` watches it live. */
  replay(
    runId: string,
    modifications?: ReplayModifications,
    options?: ReplayOptions
  ): Promise<RunResult>;
  getTrace(runId: string): Promise<Trace>;
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>;
  /**
   * Live events of every run (agents, cognitive runs, MCP calls, typed decisions, replays):
   * `listener` gets each event matching `options` (`runId`, `agentId`, `types`) once the event
   * store has accepted it, in the order of each run, one event at a time (a promise it returns
   * is awaited before its next event). Runs never wait for it. Past `maxQueued` events waiting
   * (default 10 000), new ones are dropped for it. Its errors and drops are reported on
   * standard error, or to the `onListenerError` of an `ObservedEventStore` given as
   * `eventStore`. Returns the function that unsubscribes: from then on the listener is not
   * called, not even for events already queued.
   */
  subscribe(listener: LiveEventListener, options?: LiveSubscriptionOptions): () => void;
  exportTrace(runId: string, format?: 'json' | 'text'): Promise<string>;
  defineGlobalPolicy(policy: Policy): void;
  stopRun(runId: string): Promise<void>;
  approveAction(approvalId: string, approvedBy: string, reason?: string): void;
  rejectAction(approvalId: string, rejectedBy: string, reason?: string): void;
  getPendingApprovals(runId?: string): Array<{
    id: string;
    runId: string;
    agentId: string;
    intention: unknown;
    policyId: string;
    requestedAt: number;
  }>;
  getBudgetUsage(limit: {
    agentId?: string;
    toolName?: string;
    period: 'hour' | 'day' | 'week' | 'month' | 'all';
  }): Promise<{
    agentId?: string;
    toolName?: string;
    period: string;
    periodStart: number;
    periodEnd: number;
    tokensUsed: number;
    toolCallsCount: number;
    /** USD spent by model calls with a price; unpriced and unmetered calls have none. */
    costUsd: number;
    unpricedCalls: number;
    unmeteredCalls: number;
    lastUpdated: number;
  }>;
  getPolicyAuditTrail(runId: string): Array<{
    id: string;
    runId: string;
    agentId: string;
    timestamp: number;
    policyId: string;
    policyType: string;
    intention: unknown;
    conditionEvaluated?: { condition: unknown; result: boolean };
    validationResult: { allowed: boolean; reason?: string; violatedPolicies?: string[] };
    applied: boolean;
    reason?: string;
  }>;
  getReasoningGraph(runId: string): Promise<ReasoningGraph>;
  exportReasoningGraph(runId: string, format?: 'json' | 'graphviz'): Promise<string>;
  getAlternatives(runId: string): Promise<AlternativesAnalysis>;
  getDecisionPatterns(options?: {
    agentId?: string;
    userId?: string;
    sessionId?: string;
    since?: number;
    until?: number;
    minFrequency?: number;
  }): Promise<DecisionPatternAnalysis>;
  getTraceVisualization(runId: string): Promise<TraceVisualization>;
  /** Keeps a run as a reference, with the name of the governed agent that ran it. */
  createGoldenTrace(runId: string, config: GoldenTraceConfig): Promise<GoldenTrace>;
  /** Golden traces, newest first; with `agent` (an id or a name), only that agent's. */
  getGoldenTraces(agent?: string): Promise<GoldenTrace[]>;
  getGoldenTrace(goldenTraceId: string): Promise<GoldenTrace>;
  deleteGoldenTrace(goldenTraceId: string): Promise<void>;
  exportGoldenTrace(goldenTraceId: string, format?: 'json' | 'yaml'): Promise<string>;
  /**
   * Compares a run with a golden trace, event by event, by what the events mean: type, order,
   * tool, parameters, results. Event ids, clock readings and token counts are never compared.
   */
  validateAgainstGoldenTrace(
    runId: string,
    goldenTraceId: string,
    options?: ValidationOptions
  ): Promise<ValidationResult>;
  /**
   * Replays a run, then validates the replay. A replay calls no model, so it records no
   * `intention.generated`: compare it with `validateAspects: ['tools', 'policies']`.
   */
  replayAndValidate(
    runId: string,
    goldenTraceId: string,
    options?: ValidationOptions
  ): Promise<ValidationResult>;
  /** `validateAgainstGoldenTrace`, with each difference classified by severity and impact. */
  detectRegressions(
    newRunId: string,
    goldenTraceId: string,
    options?: import('./types/regression.js').RegressionDetectionOptions
  ): Promise<import('./types/regression.js').RegressionReport>;

  // Regression suites. An agent is given by its id or its name: ids are new in every process,
  // so a suite also records the agent's name and runs, elsewhere, with the agent of that name.
  // In one SDK, an agent's id is its own: two agents with the same name (two versions) keep
  // their own suites, assertions and golden traces; a name designates all of them. Every agent
  // created with createAgent stays in the SDK: create each agent once, or pass ids.

  /**
   * Saves a suite of golden traces whose inputs run again with `agent` (an agent of this SDK,
   * by id or by name). Each golden trace must exist; a test's `input` defaults to the one the
   * golden run received. Throws a `ValidationError` for an unknown or ambiguous agent or a
   * bad test.
   */
  createRegressionTestSuite(
    agent: string,
    config: RegressionTestSuiteConfig
  ): Promise<RegressionTestSuite>;
  /** Saved suites, newest first; with `agent` (id or name), only that agent's. */
  getRegressionTestSuites(agent?: string): Promise<RegressionTestSuite[]>;
  /**
   * Runs every suite of `agent` (an agent of this SDK, by id or name), oldest first, with that
   * agent: each test runs the golden trace's input and compares the run with the trace
   * (`detectRegressions`). Throws when the agent has no suite.
   */
  runRegressionTests(
    agent: string,
    options?: RegressionTestOptions
  ): Promise<RegressionTestRunResult>;
  /** Runs one suite with its agent: the one with the suite's agent id here, else its name. */
  runRegressionTestSuite(
    suiteId: string,
    options?: RegressionTestOptions
  ): Promise<RegressionTestSuiteResult>;
  /**
   * Formats results as JUnit XML (one `<testsuite>` per suite; tests that could not run are
   * `<error>`s), JSON or a JSON summary; `outputPath` also writes the text to that file.
   */
  exportTestResults(
    results: RegressionTestSuiteResult | RegressionTestRunResult,
    format: 'junit' | 'json' | 'json-summary',
    options?: Omit<TestResultsExportOptions, 'format'>
  ): Promise<string>;
  /**
   * `runRegressionTests` and the process exit code for CI: 0 every test passed, 1 a test
   * found a regression, 2 a test could not run (error or timeout). `exitCode: false` gives 0.
   */
  runRegressionTestsForCI(
    agent: string,
    options?: RegressionTestOptions & { exitCode?: boolean }
  ): Promise<{ results: RegressionTestRunResult; exitCode: number }>;

  // Assertions: checks on a run's events.

  /**
   * Defines an assertion, for every run or for one agent's runs (`agentId`, `agentName`).
   * Saved in `assertionsDir`, except `custom` ones: their function cannot be written to a
   * file, so they last as long as this SDK instance. A condition that could not be evaluated
   * is refused with a `ValidationError`.
   */
  defineAssertion(
    name: string,
    condition: AssertionCondition,
    options?: AssertionOptions
  ): Promise<Assertion>;
  /**
   * Assertions, newest first; with `agent` (id or name), only that agent's; with `tags`, those
   * with at least one of them.
   */
  getAssertions(agent?: string, tags?: string[]): Promise<Assertion[]>;
  /**
   * Evaluates the assertions given by id (unknown ids throw), or else the assertions for every
   * run plus those of the run's agent (by id, or by name from another process).
   */
  evaluateAssertions(runId: string, assertionIds?: string[]): Promise<AssertionEvaluationReport>;
  deleteAssertion(assertionId: string): Promise<void>;

  // Comparisons across runs.

  /** What differs between two runs, event by event, aligned by meaning (never by event id). */
  compareRuns(runId1: string, runId2: string, options?: ComparisonOptions): Promise<RunComparison>;
  /** A comparison as text, JSON or an HTML page. */
  getComparisonReport(
    comparison: RunComparison,
    format?: 'json' | 'html' | 'text'
  ): Promise<string>;
  /**
   * Compares two groups of runs (before and after a change): duration, cost in USD, quality,
   * success rate and behavior changes. Saved in `impactAnalysesDir`.
   */
  analyzeImpact(
    beforeRunIds: string[],
    afterRunIds: string[],
    options?: ImpactAnalysisOptions
  ): Promise<ImpactAnalysis>;
  getImpactAnalysis(analysisId: string): Promise<ImpactAnalysis>;
  /**
   * `analyzeImpact` on the runs of every governed agent with a name (given, or the name of the
   * agent of this SDK whose id is given) recorded with each version: a `version` of its
   * configuration or a `configHash`. Replays are left out. Two equal versions, or two that
   * select the same runs, are refused with a `ValidationError`.
   */
  compareVersions(
    agent: string,
    version1: string,
    version2: string,
    options?: ImpactAnalysisOptions
  ): Promise<ImpactAnalysis>;

  // Queries across runs, on any event store.

  /**
   * Events of one run (`runId`) or of every run, in time order (ties by event id), that match
   * the conditions (see `AdvancedEventFilter`). Without `runId`, the file store reads each run
   * file once; a SQL store lets the database narrow the events when every condition must hold,
   * and returns every event in scope with `or` or `not`.
   */
  queryEventsAdvanced(filter: AdvancedEventFilter): Promise<AdvancedEventQueryResult>;
  /** Number of matching events (`limit` does not apply). */
  countEventsAdvanced(filter: AdvancedEventFilter): Promise<number>;
  /** Matching events counted by type and by agent id. */
  getEventStatistics(filter: AdvancedEventFilter): Promise<EventStatistics>;
  /** Creates an agent that reasons explicitly (hypotheses, simulation, critique) before answering. */
  createCognitiveAgent(config: CognitiveAgentConfig): CognitiveAgent;
  /** Rebuilds the mental state of a cognitive run from its events. */
  getMentalState(runId: string): Promise<MentalState>;
  /** Exports cognitive runs as JSON Lines (state → chosen operation) to train a controller. */
  exportControllerDataset(runIds?: string[]): Promise<string>;
  /** Extracts a thinker profile from topics explained in someone's own words. */
  distillThinkerProfile(input: DistillProfileInput): Promise<ThinkerProfile>;
  /** Typed decisions (Jev): context injection, single/multiple choice, checks, ratings. */
  readonly decisions: DecisionService;
  /**
   * Token usage and cost of a run, per model: every model call the vendor answered, failed
   * steps included. Calls whose cost is unknown (a model without a price, no token counts)
   * are counted apart, and the report is then not `complete`.
   */
  getRunCost(runId: string): Promise<RunCostReport>;
  /** Incidents raised during a run. */
  getIncidents(runId: string): Promise<Incident[]>;
  /** Every registered tool (used to expose them over MCP). */
  listTools(): Tool[];
  /**
   * Executes a tool through the governed pipeline (policies, approvals, budgets, events).
   * `signal` cancels a pending approval and reaches the tool handler when the caller gives up.
   */
  executeTool(
    name: string,
    parameters: Record<string, unknown>,
    options?: ExecuteToolOptions
  ): Promise<unknown>;
  /**
   * Reads a resource (e.g. a document served over MCP) as its own run: `run.started`,
   * `resource.read` with the URI, size and SHA-256 of the content, then `run.completed` —
   * or `run.failed` with the error.
   */
  traceResourceRead(
    uri: string,
    read: () => Promise<ResourceContent>,
    options?: { agentId?: string }
  ): Promise<ResourceContent>;
}

export interface ExecuteToolOptions {
  agentId?: string;
  /** Records the call inside an existing run instead of its own run. */
  runId?: string;
  /** Tools this caller may use; any other tool is denied before execution. */
  allowedTools?: string[];
  /** Aborted when the caller gives up: cancels a pending approval, reaches the handler. */
  signal?: AbortSignal;
  /** Longest wait for a human approval; past it the approval is cancelled and the call refused. */
  approvalTimeoutMs?: number;
  /**
   * Called with every event of the call's run (of the run given as `runId`, while the call
   * lasts), and of the runs the tool starts for it (agent tools, one level; not when the agent
   * was built by hand on a store without live events), one at a time and in order. The call
   * resolves or rejects once the listener has settled on every event, unless `signal` aborts:
   * the listener is then unsubscribed, and what it had not received yet is dropped.
   */
  onEvent?: LiveEventListener;
}

export class SDKImpl implements SDK {
  private eventStore: IEventStore;
  /** Delivers live events; `eventStore` wraps it when incidents are on. */
  private liveEvents: ObservedEventStore;
  private toolRegistry: ToolRegistry;
  private capabilityRegistry: CapabilityRegistry;
  private policyEngine: PolicyEngine;
  private approvalManager: ApprovalManager;
  private budgetTracker: BudgetTracker;
  private provider: LLMProvider; // Provider shared (stateless)
  private actionEngine: ActionEngine;
  private replayEngine: ReplayEngine;
  private agents: Map<string, Agent> = new Map();
  private activeAgentInstances: Map<string, AgentImpl> = new Map();
  private cognitiveAgents: Map<string, CognitiveAgent> = new Map();
  private goldenTraceManager: GoldenTraceManager;
  private regressionTestManager: RegressionTestManager;
  private assertionManager: AssertionManager;
  private impactAnalysisManager: ImpactAnalysisManager;

  private pricing: PricingTable;
  private decisionClient?: TypedDecisionClient;
  private decisionService?: DecisionService;

  constructor(config: SDKConfig) {
    // Before the event store (a FileEventStore creates its folder and a flush timer).
    for (const policy of config.defaultPolicies ?? []) assertCheckableLimits(policy);
    const baseStore = config.eventStore || new FileEventStore();
    const { liveEvents, store } = observedStore(baseStore);
    this.liveEvents = liveEvents;
    // With `incidents`, the monitor is outside: its `incident.reported` events are delivered too.
    this.eventStore = config.incidents ? new MonitoredEventStore(store, config.incidents) : store;
    this.pricing = { ...DEFAULT_PRICING, ...config.pricing };
    this.toolRegistry = new ToolRegistry();
    this.capabilityRegistry = new CapabilityRegistry();
    this.policyEngine = new PolicyEngine();
    this.approvalManager = new ApprovalManager();
    this.budgetTracker = new BudgetTracker(this.eventStore);

    // Connect BudgetTracker and EventStore to PolicyEngine
    this.policyEngine.setBudgetTracker(this.budgetTracker);
    this.policyEngine.setPricing(this.pricing);
    this.policyEngine.setEventStore(this.eventStore);

    // Create provider once (shared, stateless)
    const retryPolicy =
      config.retry === false ? undefined : { ...DEFAULT_RETRY_POLICY, ...config.retry };
    const onRetry = (info: ProviderRetryInfo) => this.recordProviderRetry(info);
    if (config.llmProvider) {
      // Injected providers are used as given unless `retry` is set explicitly. A fallback
      // chain is never wrapped: it has to stay visible to the reasoning engine.
      const wrap = config.retry && retryPolicy && !(config.llmProvider instanceof FallbackProvider);
      this.provider = wrap
        ? new RetryingLLMProvider(config.llmProvider, retryPolicy, onRetry)
        : config.llmProvider;
    } else {
      this.provider = createLLMProvider(config, retryPolicy ? { retryPolicy, onRetry } : {});
    }

    this.decisionClient =
      config.decisionClient ??
      (config.jev
        ? new JevClient({
            ...(retryPolicy
              ? { maxRetries: retryPolicy.maxRetries, retryBaseDelayMs: retryPolicy.initialDelayMs }
              : {}),
            ...config.jev,
          })
        : undefined);
    this.decisionService = this.decisionClient
      ? new DecisionService(this.decisionClient, this.eventStore, this.policyEngine)
      : undefined;

    // ActionEngine and ReplayEngine are shared (stateless)
    // ApprovalManager is passed to ActionEngine for approval workflow
    this.actionEngine = new ActionEngine(
      this.policyEngine,
      this.toolRegistry,
      this.eventStore,
      this.approvalManager,
      this.budgetTracker
    );
    this.replayEngine = new ReplayEngine(this.eventStore, this.actionEngine);
    this.goldenTraceManager = new GoldenTraceManager(config.goldenTracesDir);
    this.regressionTestManager = new RegressionTestManager(config.regressionTestSuitesDir);
    this.assertionManager = new AssertionManager(config.assertionsDir);
    this.impactAnalysisManager = new ImpactAnalysisManager(config.impactAnalysesDir);

    if (config.defaultPolicies) {
      for (const policy of config.defaultPolicies) {
        this.policyEngine.applyGlobalPolicy(policy);
      }
    }
  }

  createCognitiveAgent(config: CognitiveAgentConfig): CognitiveAgent {
    for (const policy of config.policies ?? []) assertCheckableLimits(policy);
    const agentId = uuidv4();
    for (const tool of config.tools ?? []) {
      if (!this.toolRegistry.getTool(tool.name)) {
        this.toolRegistry.registerTool(tool);
      }
    }
    for (const policy of config.policies ?? []) {
      this.policyEngine.applyAgentPolicy(agentId, policy);
    }
    const agent = assembleCognitiveAgent(config, {
      agentId,
      provider: this.provider,
      eventStore: this.eventStore,
      actionEngine: this.actionEngine,
      policyEngine: this.policyEngine,
      ...(this.decisionClient ? { decisionClient: this.decisionClient } : {}),
    });
    this.cognitiveAgents.set(agentId, agent);
    return agent;
  }

  async getMentalState(runId: string): Promise<MentalState> {
    return rebuildMentalState(await this.eventStore.getEvents(runId));
  }

  async exportControllerDataset(runIds?: string[]): Promise<string> {
    const ids = runIds ?? (await this.eventStore.getRunIds());
    const examples: ControllerTrainingExample[] = [];
    for (const runId of ids) {
      try {
        const events = await this.eventStore.getEvents(runId);
        if (!events.some((event) => event.type === 'cognition.started')) continue;
        examples.push(...buildControllerDataset(runId, events));
      } catch (error) {
        // One damaged run must not block the export of all the others.
        console.warn(
          `Skipping run ${runId} in the controller dataset:`,
          error instanceof Error ? error.message : error
        );
      }
    }
    return toJsonLines(examples);
  }

  distillThinkerProfile(input: DistillProfileInput): Promise<ThinkerProfile> {
    return distillThinkerProfile(this.provider, input);
  }

  get decisions(): DecisionService {
    if (!this.decisionService) {
      throw new ValidationError(
        'decisions',
        'configure `jev` or `decisionClient` to use typed decisions'
      );
    }
    return this.decisionService;
  }

  async getRunCost(runId: string): Promise<RunCostReport> {
    return computeRunCost(runId, await this.eventStore.getEvents(runId), this.pricing);
  }

  async getIncidents(runId: string): Promise<Incident[]> {
    const events = await this.eventStore.getEvents(runId, { type: 'incident.reported' });
    return events.flatMap((event) => {
      const parsed = incidentSchema.safeParse(event.data.incident);
      return parsed.success ? [parsed.data] : [];
    });
  }

  listTools(): Tool[] {
    return this.toolRegistry.getAllTools();
  }

  async executeTool(
    name: string,
    parameters: Record<string, unknown>,
    options: ExecuteToolOptions = {}
  ): Promise<unknown> {
    const runId = options.runId ?? `tool_${uuidv4()}`;
    // Watched before anything is recorded. The runs the tool starts for the call are forwarded
    // to it, when their store can deliver live events (best effort for agents built by hand).
    const watch = watchRun(this.liveEvents, runId, options.onEvent);
    const forward = watch && forwardingListener((event) => watch.forward(event));
    try {
      return await this.executeToolAs(runId, name, parameters, options, forward);
    } finally {
      // Waits for the listener, unless the caller gives up.
      await finishWatch(watch, [options.signal]);
    }
  }

  private async executeToolAs(
    runId: string,
    name: string,
    parameters: Record<string, unknown>,
    options: ExecuteToolOptions,
    forward: LiveEventListener | undefined
  ): Promise<unknown> {
    const agentId = options.agentId ?? 'external';
    const log = (type: Event['type'], data: Record<string, unknown>) =>
      this.eventStore.append(runId, {
        id: uuidv4(),
        runId,
        type,
        timestamp: Date.now(),
        data,
        metadata: { agentId },
      });

    if (!options.runId) {
      await log('run.started', {
        input: { message: `tool ${name}`, context: { parameters } },
        mode: 'tool',
      });
    }
    try {
      const result = await this.actionEngine.executeIntention(
        { type: 'tool_call', toolName: name, parameters },
        {
          runId,
          agentId,
          ...(options.allowedTools ? { allowedTools: options.allowedTools } : {}),
          ...(options.signal ? { abortSignal: options.signal } : {}),
          ...(options.approvalTimeoutMs !== undefined
            ? { approvalTimeoutMs: options.approvalTimeoutMs }
            : {}),
          ...(forward ? { onEvent: forward } : {}),
        }
      );
      if (!options.runId) {
        await log('run.completed', { output: result.result });
      }
      return result.result;
    } catch (error) {
      if (!options.runId) {
        await log('run.failed', { error: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  }

  async traceResourceRead(
    uri: string,
    read: () => Promise<ResourceContent>,
    options: { agentId?: string } = {}
  ): Promise<ResourceContent> {
    const runId = `resource_${uuidv4()}`;
    const log = (type: Event['type'], data: Record<string, unknown>) =>
      this.eventStore.append(runId, {
        id: uuidv4(),
        runId,
        type,
        timestamp: Date.now(),
        data,
        metadata: { agentId: options.agentId ?? 'external' },
      });

    await log('run.started', { input: { message: `resource ${uri}` }, mode: 'resource' });
    try {
      const content = await read();
      const bytes = Buffer.byteLength(content.text, 'utf8');
      const sha256 = createHash('sha256').update(content.text).digest('hex');
      await log('resource.read', {
        uri: content.uri,
        ...(content.mimeType ? { mimeType: content.mimeType } : {}),
        bytes,
        sha256,
      });
      await log('run.completed', { output: { uri: content.uri, bytes } });
      return content;
    } catch (error) {
      await log('run.failed', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async recordProviderRetry(info: ProviderRetryInfo): Promise<void> {
    if (!info.runId) {
      return;
    }
    await this.eventStore.append(info.runId, {
      id: uuidv4(),
      runId: info.runId,
      type: 'provider.retry',
      timestamp: Date.now(),
      data: {
        provider: info.provider,
        model: info.model,
        retry: info.retry,
        delayMs: info.delayMs,
        error: describeRetryError(info.error),
      },
    });
  }

  createAgent(config: AgentConfig): AgentImpl {
    // Before anything is registered: a policy that cannot be checked creates no agent.
    for (const policy of config.policies ?? []) assertCheckableLimits(policy);
    const now = Date.now();
    const agent: Agent = {
      id: uuidv4(),
      name: config.name,
      model: config.model,
      tools: config.tools || [],
      policies: config.policies || [],
      config,
      version: config.version || '1.0.0',
      capabilities: config.capabilities || [],
      createdAt: now,
      updatedAt: now,
    };

    if (config.capabilities) {
      for (const capabilityName of config.capabilities) {
        const capability = this.capabilityRegistry.getCapability(capabilityName);
        if (capability) {
          for (const toolName of capability.tools) {
            const tool = this.toolRegistry.getTool(toolName);
            if (tool && !agent.tools.some((t) => t.name === tool.name)) {
              agent.tools.push(tool);
            } else if (!tool) {
              console.warn(
                `Tool "${toolName}" from capability "${capabilityName}" not found in registry. Make sure to register it first with defineTool().`
              );
            }
          }
        }
      }
    }

    for (const tool of agent.tools) {
      if (!this.toolRegistry.getTool(tool.name)) {
        this.toolRegistry.registerTool(tool);
      }
    }
    // With the tools its capabilities brought: what the agent will actually use.
    agent.configHash = computeConfigHash(agent);

    for (const policy of agent.policies) {
      this.policyEngine.applyAgentPolicy(agent.id, policy);
    }

    this.agents.set(agent.id, agent);

    // Create ReasoningEngine per agent for better isolation
    // Each agent can have its own default model, even though provider is shared
    const reasoningEngine = new ReasoningEngine(this.provider, config.model);

    const agentImpl = new AgentImpl(
      agent,
      reasoningEngine,
      this.actionEngine,
      this.policyEngine,
      this.eventStore
    );

    this.activeAgentInstances.set(agent.id, agentImpl);
    return agentImpl;
  }

  defineTool<Schema extends z.ZodSchema>(definition: ToolDefinition<Schema>): Tool {
    return this.toolRegistry.registerTool(definition);
  }

  defineCapability(definition: {
    name: string;
    description: string;
    tools: string[] | Tool[];
    version?: string;
    metadata?: Record<string, unknown>;
  }): Capability {
    const toolNames: string[] = [];
    const toolsToRegister: Tool[] = [];

    for (const tool of definition.tools) {
      if (typeof tool === 'string') {
        toolNames.push(tool);
      } else {
        const registeredTool = this.toolRegistry.registerTool(tool);
        toolNames.push(registeredTool.name);
        toolsToRegister.push(registeredTool);
      }
    }

    return this.capabilityRegistry.registerCapability({
      ...definition,
      tools: toolNames,
    });
  }

  async replay(
    runId: string,
    modifications?: ReplayModifications,
    options?: ReplayOptions
  ): Promise<RunResult> {
    return await this.replayEngine.replay(runId, modifications, options);
  }

  subscribe(listener: LiveEventListener, options?: LiveSubscriptionOptions): () => void {
    const subscription = this.liveEvents.subscribe(listener, options);
    return () => subscription.unsubscribe();
  }

  async getTrace(runId: string): Promise<Trace> {
    const events = await this.eventStore.getEvents(runId);
    if (events.length === 0) {
      throw new Error(`No trace found for runId: ${runId}`);
    }

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    return {
      runId,
      agentId: (firstEvent.metadata?.agentId as string) || '',
      status: this.getStatusFromEvents(events),
      events,
      timeline: this.buildTimeline(events),
      summary: this.buildSummary(events, firstEvent, lastEvent),
    };
  }

  private buildTimeline(events: Event[]) {
    return events.map((event) => ({
      timestamp: event.timestamp,
      type: event.type,
      description: this.getEventDescription(event),
    }));
  }

  private buildSummary(events: Event[], firstEvent: Event, lastEvent: Event) {
    return {
      totalEvents: events.length,
      duration: lastEvent.timestamp - firstEvent.timestamp,
      intentionsGenerated: this.countEvents(events, 'intention.generated'),
      actionsExecuted: this.countEvents(events, 'action.executed'),
      policiesChecked: this.countEvents(events, 'policy.checked'),
      toolsCalled: this.countEvents(events, 'tool.called'),
    };
  }

  private countEvents(events: Event[], type: Event['type']): number {
    return events.filter((e) => e.type === type).length;
  }

  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    return await this.eventStore.getEvents(runId, filters);
  }

  async exportTrace(runId: string, format: 'json' | 'text' = 'json'): Promise<string> {
    const trace = await this.getTrace(runId);

    if (format === 'json') {
      return JSON.stringify(trace, null, 2);
    }

    return this.formatTraceAsText(trace);
  }

  async getReasoningGraph(runId: string): Promise<ReasoningGraph> {
    const events = await this.eventStore.getEvents(runId);
    if (events.length === 0) {
      throw new Error(`No events found for runId: ${runId}`);
    }

    return ReasoningGraphBuilder.buildFromEvents(runId, events);
  }

  async exportReasoningGraph(runId: string, format: 'json' | 'graphviz' = 'json'): Promise<string> {
    const graph = await this.getReasoningGraph(runId);

    if (format === 'json') {
      return ReasoningGraphExporter.toJSON(graph, true);
    }

    return ReasoningGraphExporter.toGraphviz(graph);
  }

  async getAlternatives(runId: string): Promise<AlternativesAnalysis> {
    const events = await this.eventStore.getEvents(runId);
    if (events.length === 0) {
      throw new Error(`No events found for runId: ${runId}`);
    }

    return AlternativesExtractor.extractFromEvents(runId, events);
  }

  async getDecisionPatterns(
    options: {
      agentId?: string;
      userId?: string;
      sessionId?: string;
      since?: number;
      until?: number;
      minFrequency?: number;
    } = {}
  ): Promise<DecisionPatternAnalysis> {
    // Get run IDs based on filters
    const runIds = await this.eventStore.getRunIds({
      since: options.since,
      until: options.until,
    });

    if (runIds.length === 0) {
      return PatternAnalyzer.analyzePatterns([], options);
    }

    // Get events for each run
    const runs: Array<{ runId: string; events: Event[] }> = [];

    for (const runId of runIds) {
      const events = await this.eventStore.getEvents(runId, {
        agentId: options.agentId,
        userId: options.userId,
        sessionId: options.sessionId,
      });

      // Filter by time range if specified
      const filteredEvents =
        options.since || options.until
          ? events.filter((e) => {
              if (options.since && e.timestamp < options.since) return false;
              if (options.until && e.timestamp > options.until) return false;
              return true;
            })
          : events;

      if (filteredEvents.length > 0) {
        runs.push({ runId, events: filteredEvents });
      }
    }

    return PatternAnalyzer.analyzePatterns(runs, options);
  }

  async getTraceVisualization(runId: string): Promise<TraceVisualization> {
    const trace = await this.getTrace(runId);
    return TraceVisualizer.visualize({
      runId: trace.runId,
      agentId: trace.agentId,
      status: trace.status,
      events: trace.events,
    });
  }

  async createGoldenTrace(runId: string, config: GoldenTraceConfig): Promise<GoldenTrace> {
    const trace = await this.getTrace(runId);
    return this.goldenTraceManager.createGoldenTrace(runId, trace, config);
  }

  async getGoldenTraces(agent?: string): Promise<GoldenTrace[]> {
    const traces = await this.goldenTraceManager.getGoldenTraces();
    if (agent === undefined) return traces;
    const ref = this.agentRef(agent);
    return traces.filter((trace) => this.belongsTo(trace, ref));
  }

  async getGoldenTrace(goldenTraceId: string): Promise<GoldenTrace> {
    const goldenTrace = await this.goldenTraceManager.getGoldenTrace(goldenTraceId);
    if (!goldenTrace) {
      throw new Error(`Golden trace ${goldenTraceId} not found`);
    }
    return goldenTrace;
  }

  async deleteGoldenTrace(goldenTraceId: string): Promise<void> {
    const deleted = await this.goldenTraceManager.deleteGoldenTrace(goldenTraceId);
    if (!deleted) {
      throw new Error(`Golden trace ${goldenTraceId} not found`);
    }
  }

  async exportGoldenTrace(
    goldenTraceId: string,
    format: 'json' | 'yaml' = 'json'
  ): Promise<string> {
    return this.goldenTraceManager.exportGoldenTrace(goldenTraceId, format);
  }

  async validateAgainstGoldenTrace(
    runId: string,
    goldenTraceId: string,
    options?: ValidationOptions
  ): Promise<ValidationResult> {
    const goldenTrace = await this.getGoldenTrace(goldenTraceId);
    const actualTrace = await this.getTrace(runId);

    return TraceValidator.validate(actualTrace, goldenTrace.trace, goldenTraceId, options || {});
  }

  async replayAndValidate(
    runId: string,
    goldenTraceId: string,
    options?: ValidationOptions
  ): Promise<ValidationResult> {
    const replayedResult = await this.replay(runId);
    return this.validateAgainstGoldenTrace(replayedResult.runId, goldenTraceId, options);
  }

  async detectRegressions(
    newRunId: string,
    goldenTraceId: string,
    options?: RegressionDetectionOptions
  ): Promise<RegressionReport> {
    const goldenTrace = await this.getGoldenTrace(goldenTraceId);
    const actualTrace = await this.getTrace(newRunId);

    return RegressionDetector.detect(actualTrace, goldenTrace.trace, goldenTraceId, options || {});
  }

  async createRegressionTestSuite(
    agent: string,
    config: RegressionTestSuiteConfig
  ): Promise<RegressionTestSuite> {
    const target = this.resolveAgent(agent);
    if (typeof config?.name !== 'string' || config.name.trim() === '') {
      throw new ValidationError('name', 'must be a non-empty string');
    }
    if (!Array.isArray(config.goldenTraces) || config.goldenTraces.length === 0) {
      throw new ValidationError('goldenTraces', 'list at least one golden trace');
    }

    const goldenTraces: RegressionTestSuite['goldenTraces'] = [];
    for (const [index, test] of config.goldenTraces.entries()) {
      const field = `goldenTraces[${index}]`;
      const golden = await this.goldenTraceManager.getGoldenTrace(String(test?.goldenTraceId));
      if (!golden) {
        throw new ValidationError(
          `${field}.goldenTraceId`,
          `no golden trace "${String(test?.goldenTraceId).slice(0, 80)}"`
        );
      }
      if (typeof test.name !== 'string' || test.name.trim() === '') {
        throw new ValidationError(`${field}.name`, 'must be a non-empty string');
      }
      const input =
        test.input ?? golden.trace.events.find((event) => event.type === 'run.started')?.data.input;
      if (!isRunInput(input)) {
        throw new ValidationError(
          `${field}.input`,
          test.input === undefined
            ? 'the golden trace records no run input: give one ({ message })'
            : 'must be a run input with a string `message`'
        );
      }
      goldenTraces.push({
        goldenTraceId: golden.id,
        name: test.name,
        input,
        ...(test.tags ? { tags: test.tags } : {}),
      });
    }

    return this.regressionTestManager.createTestSuite(
      { id: target.id, name: target.name },
      { name: config.name, goldenTraces }
    );
  }

  async getRegressionTestSuites(agent?: string): Promise<RegressionTestSuite[]> {
    if (agent === undefined) return this.regressionTestManager.getTestSuites();
    const ref = this.agentRef(agent);
    return this.regressionTestManager.getTestSuites((suite) => this.belongsTo(suite, ref));
  }

  async runRegressionTests(
    agent: string,
    options: RegressionTestOptions = {}
  ): Promise<RegressionTestRunResult> {
    checkRegressionTestOptions(options);
    const target = this.resolveAgent(agent);
    const ref = this.agentRef(target.id);
    const suites = (
      await this.regressionTestManager.getTestSuites((suite) => this.belongsTo(suite, ref))
    ).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    if (suites.length === 0) {
      throw new Error(`No regression test suites found for agent ${agent}`);
    }

    const startTime = Date.now();
    const results: RegressionTestSuiteResult[] = [];
    for (const suite of suites) {
      const result = await this.runSuiteWith(suite, target, options);
      results.push(result);
      // A test that failed, errored or timed out stops the next suites too.
      if (
        options.stopOnFirstFailure &&
        !options.parallel &&
        result.passedTests < result.totalTests
      ) {
        break;
      }
    }
    return RegressionTestRunner.combine({ id: target.id, name: target.name }, results, startTime);
  }

  async runRegressionTestSuite(
    suiteId: string,
    options: RegressionTestOptions = {}
  ): Promise<RegressionTestSuiteResult> {
    checkRegressionTestOptions(options);
    const suite = await this.regressionTestManager.getTestSuite(suiteId);
    if (!suite) {
      throw new Error(`Regression test suite ${suiteId} not found`);
    }
    return this.runSuiteWith(suite, this.agentOfSuite(suite), options);
  }

  private runSuiteWith(
    suite: RegressionTestSuite,
    agent: AgentImpl,
    options: RegressionTestOptions
  ): Promise<RegressionTestSuiteResult> {
    return RegressionTestRunner.runTestSuite(
      suite,
      agent,
      (runId, goldenTraceId) => this.detectRegressions(runId, goldenTraceId, options.detection),
      options
    );
  }

  /** The agent a suite runs with: the one with its id in this SDK, else the one with its name. */
  private agentOfSuite(suite: RegressionTestSuite): AgentImpl {
    const byId = this.activeAgentInstances.get(suite.agentId);
    if (byId) return byId;
    if (suite.agentName === undefined) {
      throw new Error(
        `Agent ${suite.agentId} of suite "${suite.name}" is not in this SDK, and the suite records no agent name (saved by an older version): create the suite again`
      );
    }
    const named = this.agentsNamed(suite.agentName);
    if (named.length === 1 && named[0]) return named[0];
    throw new Error(
      named.length === 0
        ? `No agent named "${suite.agentName}" in this SDK: create it before running suite "${suite.name}"`
        : `${named.length} agents are named "${suite.agentName}" in this SDK: run the suite with runRegressionTests(<agent id>)`
    );
  }

  async exportTestResults(
    results: RegressionTestSuiteResult | RegressionTestRunResult,
    format: 'junit' | 'json' | 'json-summary',
    options?: Omit<TestResultsExportOptions, 'format'>
  ): Promise<string> {
    return TestResultsExporter.export(results, format, options || {});
  }

  async runRegressionTestsForCI(
    agent: string,
    options?: RegressionTestOptions & { exitCode?: boolean }
  ): Promise<{ results: RegressionTestRunResult; exitCode: number }> {
    const results = await this.runRegressionTests(agent, options);
    const exitCode = TestResultsExporter.calculateExitCode(results);

    return {
      results,
      exitCode: options?.exitCode !== false ? exitCode : 0,
    };
  }

  async defineAssertion(
    name: string,
    condition: AssertionCondition,
    options: AssertionOptions = {}
  ): Promise<Assertion> {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ValidationError('name', 'must be a non-empty string');
    }
    const problem = AssertionEvaluator.problemWith(condition);
    if (problem) {
      throw new ValidationError('condition', problem);
    }
    // An agent of this SDK also gives its name: the assertion then applies in other processes.
    const agentName =
      options.agentName ??
      (options.agentId ? this.activeAgentInstances.get(options.agentId)?.name : undefined);
    return this.assertionManager.createAssertion(name, condition, {
      ...options,
      ...(agentName !== undefined ? { agentName } : {}),
    });
  }

  async getAssertions(agent?: string, tags?: string[]): Promise<Assertion[]> {
    const ref = agent === undefined ? undefined : this.agentRef(agent);
    return this.assertionManager.getAssertions(
      ref ? (assertion) => this.belongsTo(assertion, ref) : undefined,
      tags
    );
  }

  async evaluateAssertions(
    runId: string,
    assertionIds?: string[]
  ): Promise<AssertionEvaluationReport> {
    let assertions: Assertion[] | undefined;
    if (assertionIds && assertionIds.length > 0) {
      const found = await Promise.all(
        assertionIds.map((id) => this.assertionManager.getAssertion(id))
      );
      const unknown = assertionIds.filter((_, index) => !found[index]);
      if (unknown.length > 0) {
        throw new ValidationError('assertionIds', `Unknown assertion id(s): ${unknown.join(', ')}`);
      }
      assertions = found.filter((assertion): assertion is Assertion => assertion !== null);
    }

    const events = await this.getEvents(runId);
    if (events.length === 0) {
      throw new Error(`No events found for runId: ${runId}`);
    }
    if (!assertions) {
      // The assertions for every run, and those of the run's agent.
      const runAgent = this.agentOfRun(events);
      assertions = await this.assertionManager.getAssertions(
        (assertion) =>
          (assertion.agentId === undefined && assertion.agentName === undefined) ||
          (runAgent !== undefined && this.belongsTo(assertion, runAgent))
      );
    }

    const results = assertions.map((assertion) => AssertionEvaluator.evaluate(assertion, events));

    const passedAssertions = results.filter((r) => r.status === 'pass').length;
    const failedAssertions = results.filter((r) => r.status === 'fail').length;
    const errorAssertions = results.filter((r) => r.status === 'error').length;

    return {
      runId,
      evaluatedAt: Date.now(),
      totalAssertions: assertions.length,
      passedAssertions,
      failedAssertions,
      errorAssertions,
      results,
    };
  }

  async deleteAssertion(assertionId: string): Promise<void> {
    const deleted = await this.assertionManager.deleteAssertion(assertionId);
    if (!deleted) {
      throw new Error(`Assertion ${assertionId} not found`);
    }
  }

  async compareRuns(
    runId1: string,
    runId2: string,
    options?: ComparisonOptions
  ): Promise<RunComparison> {
    const [trace1, trace2] = await Promise.all([this.getTrace(runId1), this.getTrace(runId2)]);

    return RunComparator.compare(trace1, trace2, options || {});
  }

  async getComparisonReport(
    comparison: RunComparison,
    format: 'json' | 'html' | 'text' = 'text'
  ): Promise<string> {
    return ComparisonReportGenerator.generate(comparison, format);
  }

  async analyzeImpact(
    beforeRunIds: string[],
    afterRunIds: string[],
    options?: ImpactAnalysisOptions
  ): Promise<ImpactAnalysis> {
    for (const [field, runIds] of [
      ['beforeRunIds', beforeRunIds],
      ['afterRunIds', afterRunIds],
    ] as const) {
      if (!Array.isArray(runIds) || runIds.length === 0) {
        throw new ValidationError(field, 'give at least one run id');
      }
    }
    const [beforeTraces, afterTraces] = await Promise.all([
      Promise.all(beforeRunIds.map((id) => this.getTrace(id))),
      Promise.all(afterRunIds.map((id) => this.getTrace(id))),
    ]);

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces, options || {}, this.pricing);
    await this.impactAnalysisManager.saveAnalysis(analysis);

    return analysis;
  }

  async getImpactAnalysis(analysisId: string): Promise<ImpactAnalysis> {
    const analysis = await this.impactAnalysisManager.getAnalysis(analysisId);
    if (!analysis) {
      throw new Error(`Impact analysis ${analysisId} not found`);
    }
    return analysis;
  }

  async compareVersions(
    agent: string,
    version1: string,
    version2: string,
    options?: ImpactAnalysisOptions
  ): Promise<ImpactAnalysis> {
    if (version1 === version2) {
      throw new ValidationError('version2', `must differ from version1 ("${version1}")`);
    }
    // Versions of one agent are different agents of the same name (ids differ even in one
    // process): every agent with this name counts, and the id for runs that record no name.
    const name = this.activeAgentInstances.get(agent)?.name ?? agent;
    const { events } = await this.matchingEvents({ type: 'run.started' });
    // A replay re-executes a run's tools without its model: left out.
    const starts = events.filter(
      (event) =>
        event.data.replayOf === undefined &&
        (event.metadata?.agentName !== undefined
          ? event.metadata.agentName === name
          : event.metadata?.agentId === agent)
    );
    const runsOf = (version: string) => [
      ...new Set(
        starts
          .filter(
            (event) =>
              event.metadata?.agentVersion === version || event.metadata?.configHash === version
          )
          .map((event) => event.runId)
      ),
    ];

    const before = runsOf(version1);
    const after = runsOf(version2);
    for (const [field, version, runIds] of [
      ['version1', version1, before],
      ['version2', version2, after],
    ] as const) {
      if (runIds.length === 0) {
        const recorded = [
          ...new Set(
            starts.map((event) => {
              const declared = event.metadata?.agentVersion ?? 'no version';
              return event.metadata?.configHash
                ? `${declared} (config ${event.metadata.configHash})`
                : declared;
            })
          ),
        ];
        throw new ValidationError(
          field,
          `no run of agent "${agent}" has version or config hash "${version}" (recorded: ${recorded.join(', ') || 'none'})`
        );
      }
    }
    // A declared version and a config hash can select the same runs (every agent is 1.0.0 by
    // default): a run on both sides would compare the agent with itself.
    const shared = before.filter((runId) => after.includes(runId));
    if (shared.length > 0) {
      throw new ValidationError(
        'version2',
        `"${version1}" and "${version2}" both select ${shared.length} run(s): compare two declared versions, or two config hashes`
      );
    }

    return this.analyzeImpact(before, after, options);
  }

  async queryEventsAdvanced(filter: AdvancedEventFilter): Promise<AdvancedEventQueryResult> {
    const startTime = Date.now();
    const { events, filtered, total } = await this.matchingEvents(filter, { countScope: true });
    return {
      events,
      total: total ?? filtered,
      filtered,
      filters: filter,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * The events matching a filter, in time order (ties by event id), at most `limit`; with
   * `countScope`, also the number of events in scope, which may cost the store a second query.
   */
  private async matchingEvents(
    filter: AdvancedEventFilter,
    { countScope = false }: { countScope?: boolean } = {}
  ): Promise<{ events: Event[]; filtered: number; total?: number }> {
    const limit = filter.limit;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new ValidationError('limit', 'must be a whole number >= 0');
    }
    const { candidates, total } = await this.eventsInScope(filter, countScope);
    const matching = candidates.filter((event) =>
      AdvancedEventFilterEvaluator.matchesConditions(event, filter)
    );
    return {
      events: limit === undefined ? matching : matching.slice(0, limit),
      filtered: matching.length,
      ...(total !== undefined ? { total } : {}),
    };
  }

  /**
   * The events in the filter's scope (`runId`, `since`, `until`), in time order: one run, or
   * every run through the store's `queryEvents` (the file store reads each run file once), or
   * by reading each run (a store without `queryEvents`). When every condition must hold, the
   * store narrows them by type and ids itself; with `or` or `not`, it returns every event in
   * scope and the conditions are checked here. `total` is set when known or asked for.
   */
  private async eventsInScope(
    filter: AdvancedEventFilter,
    countScope: boolean
  ): Promise<{ candidates: Event[]; total?: number }> {
    const inScope = (event: Event) => AdvancedEventFilterEvaluator.inScope(event, filter);
    const store = this.eventStore;
    if (filter.runId !== undefined) {
      const events = (await store.getEvents(filter.runId)).filter(inScope);
      return { candidates: events, total: events.length };
    }

    const scope: EventFilters = {
      ...(filter.since !== undefined ? { since: filter.since } : {}),
      ...(filter.until !== undefined ? { until: filter.until } : {}),
    };
    if (store.queryEvents) {
      const narrowed: EventFilters = {
        ...scope,
        ...(filter.type !== undefined && [filter.type].flat().length > 0
          ? { type: filter.type }
          : {}),
        ...(filter.agentId ? { agentId: filter.agentId } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
      };
      const narrows =
        Object.keys(narrowed).length > Object.keys(scope).length &&
        AdvancedEventFilterEvaluator.canNarrowInStore(filter) &&
        (!countScope || store.countEvents !== undefined);
      if (narrows) {
        const [result, total] = await Promise.all([
          store.queryEvents(narrowed),
          countScope ? store.countEvents?.(scope) : undefined,
        ]);
        return {
          candidates: inTimeOrder(result.events.filter(inScope)),
          ...(total !== undefined ? { total } : {}),
        };
      }
      const events = inTimeOrder((await store.queryEvents(scope)).events.filter(inScope));
      return { candidates: events, total: events.length };
    }

    const found: Event[] = [];
    for (const runId of await store.getRunIds()) {
      found.push(...(await store.getEvents(runId)).filter(inScope));
    }
    return { candidates: inTimeOrder(found), total: found.length };
  }

  async countEventsAdvanced(filter: AdvancedEventFilter): Promise<number> {
    return (await this.matchingEvents(filter)).filtered;
  }

  async getEventStatistics(filter: AdvancedEventFilter): Promise<EventStatistics> {
    const { events, filtered } = await this.matchingEvents({ ...filter, limit: undefined });

    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const event of events) {
      byType[event.type] = (byType[event.type] || 0) + 1;

      const agentId = event.metadata?.agentId as string | undefined;
      if (agentId) {
        byAgent[agentId] = (byAgent[agentId] || 0) + 1;
      }
    }

    return {
      total: filtered,
      byType,
      byAgent,
    };
  }

  /** The governed agent of this SDK with this id, or the only one with this name. */
  private resolveAgent(agent: string): AgentImpl {
    const byId = this.activeAgentInstances.get(agent);
    if (byId) return byId;
    const named = this.agentsNamed(agent);
    if (named.length === 1 && named[0]) return named[0];
    throw new ValidationError(
      'agent',
      named.length === 0
        ? `no agent of this SDK has the id or name "${String(agent).slice(0, 80)}": create it with createAgent first`
        : `${named.length} agents are named "${agent}" in this SDK (every agent created with createAgent stays in it): pass the id of the one to use, or create each agent once and reuse it`
    );
  }

  private agentsNamed(name: string): AgentImpl[] {
    return [...this.activeAgentInstances.values()].filter((agent) => agent.name === name);
  }

  /**
   * Whom `agent` designates among saved suites, assertions, golden traces and recorded runs:
   * the id of an agent of this SDK designates that agent (and, from another process, the
   * agent of the same name); anything else is taken as an id or a name.
   */
  private agentRef(agent: string): AgentRef {
    const active = this.activeAgentInstances.get(agent);
    return active
      ? { id: active.id, name: active.name, inThisSdk: true }
      : { id: agent, name: agent, inThisSdk: false };
  }

  /**
   * Whether something saved or recorded for `stored` belongs to the agent `ref`: the same id,
   * or the same name when the stored id is not another agent of this SDK. Two agents of one SDK
   * with the same name (two versions, say) each keep their own suites and assertions; an agent
   * of another process, whose id is unknown here, is found by its name.
   */
  private belongsTo(stored: { agentId?: string; agentName?: string }, ref: AgentRef): boolean {
    if (stored.agentId !== undefined && stored.agentId === ref.id) return true;
    if (
      ref.inThisSdk &&
      stored.agentId !== undefined &&
      this.activeAgentInstances.has(stored.agentId)
    ) {
      return false;
    }
    return stored.agentName !== undefined && stored.agentName === ref.name;
  }

  /** The agent that ran a run, as its events record it (its `run.started` first). */
  private agentOfRun(events: Event[]): AgentRef | undefined {
    const recorded =
      events.find((event) => event.type === 'run.started' && event.metadata?.agentId) ??
      events.find((event) => event.metadata?.agentId);
    const agentId = recorded?.metadata?.agentId;
    if (!agentId) return undefined;
    return {
      id: agentId,
      ...(recorded.metadata?.agentName ? { name: recorded.metadata.agentName } : {}),
      inThisSdk: this.activeAgentInstances.has(agentId),
    };
  }

  defineGlobalPolicy(policy: Policy): void {
    this.policyEngine.applyGlobalPolicy(policy);
  }

  async stopRun(runId: string): Promise<void> {
    const events = await this.eventStore.getEvents(runId);
    if (events.length === 0) {
      return;
    }

    const firstEvent = events[0];
    const agentId = firstEvent.metadata?.agentId as string | undefined;

    if (agentId) {
      const agentImpl = this.activeAgentInstances.get(agentId);
      if (agentImpl) {
        await agentImpl.stopRun(runId);
      }
      await this.cognitiveAgents.get(agentId)?.stop(runId);
    }
    // Cancel any pending approvals for this run
    this.approvalManager.cancelAllForRun(runId);
  }

  approveAction(approvalId: string, approvedBy: string, reason?: string): void {
    this.approvalManager.approve(approvalId, approvedBy, reason);
  }

  rejectAction(approvalId: string, rejectedBy: string, reason?: string): void {
    this.approvalManager.reject(approvalId, rejectedBy, reason);
  }

  getPendingApprovals(runId?: string): Array<{
    id: string;
    runId: string;
    agentId: string;
    intention: unknown;
    policyId: string;
    requestedAt: number;
  }> {
    if (runId) {
      return this.approvalManager.getPendingApprovalsForRun(runId).map((approval) => ({
        id: approval.id,
        runId: approval.runId,
        agentId: approval.agentId,
        intention: approval.intention,
        policyId: approval.policyId,
        requestedAt: approval.requestedAt,
      }));
    }
    return this.approvalManager.getAllPendingApprovals().map((approval) => ({
      id: approval.id,
      runId: approval.runId,
      agentId: approval.agentId,
      intention: approval.intention,
      policyId: approval.policyId,
      requestedAt: approval.requestedAt,
    }));
  }

  async getBudgetUsage(limit: {
    agentId?: string;
    toolName?: string;
    period: 'hour' | 'day' | 'week' | 'month' | 'all';
  }): Promise<{
    agentId?: string;
    toolName?: string;
    period: string;
    periodStart: number;
    periodEnd: number;
    tokensUsed: number;
    toolCallsCount: number;
    /** USD spent by model calls with a price; unpriced and unmetered calls have none. */
    costUsd: number;
    unpricedCalls: number;
    unmeteredCalls: number;
    lastUpdated: number;
  }> {
    const usage = await this.budgetTracker.getUsage(limit);
    return {
      agentId: usage.agentId,
      toolName: usage.toolName,
      period: usage.period,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      tokensUsed: usage.tokensUsed,
      toolCallsCount: usage.toolCallsCount,
      costUsd: usage.costUsd,
      unpricedCalls: usage.unpricedCalls,
      unmeteredCalls: usage.unmeteredCalls,
      lastUpdated: usage.lastUpdated,
    };
  }

  getPolicyAuditTrail(runId: string): Array<{
    id: string;
    runId: string;
    agentId: string;
    timestamp: number;
    policyId: string;
    policyType: string;
    intention: unknown;
    conditionEvaluated?: { condition: unknown; result: boolean };
    validationResult: { allowed: boolean; reason?: string; violatedPolicies?: string[] };
    applied: boolean;
    reason?: string;
  }> {
    const entries = this.policyEngine.getAuditTrail(runId);
    return entries.map((entry) => ({
      id: entry.id,
      runId: entry.runId,
      agentId: entry.agentId,
      timestamp: entry.timestamp,
      policyId: entry.policyId,
      policyType: entry.policyType,
      intention: entry.intention,
      conditionEvaluated: entry.conditionEvaluated,
      validationResult: {
        allowed: entry.validationResult.allowed,
        reason: entry.validationResult.reason,
        violatedPolicies: entry.validationResult.violatedPolicies,
      },
      applied: entry.applied,
      reason: entry.reason,
    }));
  }

  private getEventDescription(event: Event): string {
    const descriptions: Record<string, (event: Event) => string> = {
      'run.started': () => 'Run started',
      'run.completed': () => 'Run completed',
      'run.failed': (e) => `Run failed: ${(e.data?.error as string) || 'Unknown error'}`,
      'run.cancelled': () => 'Run cancelled',
      'run.stopped': () => 'Run stopped',
      'intention.generated': (e) => {
        const intention = e.data?.intention as { type?: string } | undefined;
        return `Intention generated: ${intention?.type || 'unknown'}`;
      },
      'intention.rejected': (e) =>
        `Intention rejected: ${(e.data?.reason as string) || 'Unknown reason'}`,
      'action.executing': (e) => `Action executing: ${(e.data?.toolName as string) || 'unknown'}`,
      'action.executed': (e) => `Action executed: ${(e.data?.toolName as string) || 'unknown'}`,
      'action.failed': (e) => `Action failed: ${(e.data?.toolName as string) || 'unknown'}`,
      'policy.checked': () => 'Policy checked',
      'policy.violated': (e) =>
        `Policy violated: ${(e.data?.reason as string) || 'Unknown reason'}`,
      'tool.called': (e) => `Tool called: ${(e.data?.toolName as string) || 'unknown'}`,
      'tool.failed': (e) => `Tool failed: ${(e.data?.toolName as string) || 'unknown'}`,
      'error.occurred': (e) => `Error occurred: ${(e.data?.error as string) || 'Unknown error'}`,
    };

    return descriptions[event.type]?.(event) || event.type;
  }

  private getStatusFromEvents(events: Event[]): string {
    return deriveRunStatus(events);
  }

  private formatTraceAsText(trace: Trace): string {
    const header = this.buildTraceHeader(trace);
    const timeline = this.buildTraceTimeline(trace.timeline);
    return `${header}\n${timeline}`;
  }

  private buildTraceHeader(trace: Trace): string {
    return [
      `Trace for runId: ${trace.runId}`,
      `Agent: ${trace.agentId}`,
      `Status: ${trace.status}`,
      `Duration: ${trace.summary.duration}ms`,
      `Total Events: ${trace.summary.totalEvents}`,
      '',
    ].join('\n');
  }

  private buildTraceTimeline(timeline: Trace['timeline']): string {
    const lines = timeline.map(
      (entry) =>
        `  [${new Date(entry.timestamp).toISOString()}] ${entry.type}: ${entry.description}`
    );
    return `Timeline:\n${lines.join('\n')}`;
  }
}

export function createSDK(config: SDKConfig): SDK {
  return new SDKImpl(config);
}

/** An agent as saved artifacts and recorded runs name it: its id in one process, its name in all. */
interface AgentRef {
  id?: string;
  name?: string;
  /** `id` is an agent of this SDK: another agent of this SDK is never it, even by name. */
  inThisSdk: boolean;
}

/** The longest delay a Node.js timer holds; longer ones would fire at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

function checkRegressionTestOptions(options: RegressionTestOptions): void {
  const timeout = options.timeout;
  if (timeout !== undefined && !(Number.isFinite(timeout) && timeout > 0)) {
    throw new ValidationError('timeout', 'must be a positive number of milliseconds');
  }
  if (timeout !== undefined && timeout > MAX_TIMEOUT_MS) {
    throw new ValidationError('timeout', `must be at most ${MAX_TIMEOUT_MS} ms (about 24.8 days)`);
  }
}

/**
 * Builds a tool without registering it anywhere. The SDK registers it when an agent that
 * uses it is created (`sdk.createAgent({ tools })`), so the same definition can be shared by
 * several SDK instances. Use `sdk.defineTool` to register a tool immediately.
 */
export function defineTool<Schema extends z.ZodSchema>(definition: ToolDefinition<Schema>): Tool {
  return {
    id: uuidv4(),
    name: definition.name,
    description: definition.description,
    schema: definition.schema,
    handler: definition.handler,
    version: definition.version || '1.0.0',
    ...(definition.capability ? { capability: definition.capability } : {}),
    ...(definition.metadata ? { metadata: definition.metadata } : {}),
    ...(definition.inputJsonSchema ? { inputJsonSchema: definition.inputJsonSchema } : {}),
    ...(definition.retry ? { retry: definition.retry } : {}),
  };
}

/**
 * The store the SDK appends to, and the layer that delivers its live events. An
 * `ObservedEventStore` given as `eventStore` is used as is, also inside a `MonitoredEventStore`
 * built by hand (the incident reports it appends are then delivered too). Any other store is
 * wrapped in a new one; a `MonitoredEventStore` built on a plain store appends its incident
 * reports beneath it, where they are recorded but not delivered live: use `incidents`.
 */
function observedStore(store: IEventStore): { liveEvents: ObservedEventStore; store: IEventStore } {
  if (store instanceof ObservedEventStore) return { liveEvents: store, store };
  if (store instanceof MonitoredEventStore && store.inner instanceof ObservedEventStore) {
    return { liveEvents: store.inner, store };
  }
  const liveEvents = new ObservedEventStore(store);
  return { liveEvents, store: liveEvents };
}

/** The vendor's message, not the generic "LLM provider error" of the wrapper. */
function describeRetryError(error: unknown): string {
  if (error instanceof LLMProviderError) {
    return `${error.provider}: ${error.originalError.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
