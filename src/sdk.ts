import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AgentImpl } from './agent.js';
import { ActionEngine } from './engines/action-engine.js';
import { PolicyEngine } from './engines/policy-engine.js';
import { ReasoningEngine } from './engines/reasoning-engine.js';
import { ReplayEngine } from './engines/replay-engine.js';
import { ApprovalManager } from './managers/approval-manager.js';
import { BudgetTracker } from './managers/budget-tracker.js';
import { FallbackProvider } from './providers/fallback-provider.js';
import { ProviderFactory } from './providers/provider-factory.js';
import type { LLMProvider } from './providers/llm-provider.js';
import { CapabilityRegistry } from './registry/capability-registry.js';
import { ToolRegistry } from './registry/tool-registry.js';
import type { IEventStore } from './stores/event-store.js';
import { FileEventStore } from './stores/file-event-store.js';
import type { Agent, AgentConfig } from './types/agent.js';
import type { Event, EventFilters } from './types/events.js';
import type { Policy } from './types/policy.js';
import type { ReplayModifications, RunResult } from './types/run.js';
import type { SDKConfig, Trace } from './types/sdk.js';
import type { Capability, Tool, ToolDefinition } from './types/tool.js';
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
import { RegressionTestRunner } from './utils/regression-test-runner.js';
import { TestResultsExporter } from './utils/test-results-exporter.js';
import { AssertionManager } from './managers/assertion-manager.js';
import { AssertionEvaluator } from './utils/assertion-evaluator.js';
import { RunComparator } from './utils/run-comparator.js';
import { ComparisonReportGenerator } from './utils/comparison-report-generator.js';
import { ImpactAnalyzer } from './utils/impact-analyzer.js';
import { ImpactAnalysisManager } from './managers/impact-analysis-manager.js';
import { AdvancedEventFilterEvaluator } from './utils/advanced-event-filter.js';
import type { RegressionTestSuite, RegressionTestOptions, RegressionTestSuiteResult } from './types/regression-test.js';
import type { TestResultsExportOptions } from './types/test-results-export.js';
import type { Assertion, AssertionCondition, AssertionEvaluationReport } from './types/assertion.js';
import type { ComparisonOptions, RunComparison } from './types/comparison.js';
import type { ImpactAnalysisOptions, ImpactAnalysis } from './types/impact-analysis.js';
import type { AdvancedEventFilter, AdvancedEventQueryResult, EventStatistics } from './types/advanced-event-filter.js';

export interface SDK {
  createAgent(config: AgentConfig): AgentImpl;
  defineTool(definition: ToolDefinition): Tool;
  defineCapability(definition: {
    name: string;
    description: string;
    tools: string[] | Tool[];
    version?: string;
    metadata?: Record<string, unknown>;
  }): Capability;
  replay(runId: string, modifications?: ReplayModifications): Promise<RunResult>;
  getTrace(runId: string): Promise<Trace>;
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>;
  exportTrace(runId: string, format?: 'json' | 'text'): Promise<string>;
  defineGlobalPolicy(policy: Policy): void;
  stopRun(runId: string): Promise<void>;
  approveAction(approvalId: string, approvedBy: string, reason?: string): void;
  rejectAction(approvalId: string, rejectedBy: string, reason?: string): void;
  getPendingApprovals(runId?: string): Array<{ id: string; runId: string; agentId: string; intention: unknown; policyId: string; requestedAt: number }>;
  getBudgetUsage(limit: { agentId?: string; toolName?: string; period: 'hour' | 'day' | 'week' | 'month' | 'all' }): Promise<{ agentId?: string; toolName?: string; period: string; periodStart: number; periodEnd: number; tokensUsed: number; toolCallsCount: number; lastUpdated: number }>;
  getPolicyAuditTrail(runId: string): Array<{ id: string; runId: string; agentId: string; timestamp: number; policyId: string; policyType: string; intention: unknown; conditionEvaluated?: { condition: unknown; result: boolean }; validationResult: { allowed: boolean; reason?: string; violatedPolicies?: string[] }; applied: boolean; reason?: string }>;
  getReasoningGraph(runId: string): Promise<ReasoningGraph>;
  exportReasoningGraph(runId: string, format?: 'json' | 'graphviz'): Promise<string>;
  getAlternatives(runId: string): Promise<AlternativesAnalysis>;
  getDecisionPatterns(options?: { agentId?: string; userId?: string; sessionId?: string; since?: number; until?: number; minFrequency?: number }): Promise<DecisionPatternAnalysis>;
  getTraceVisualization(runId: string): Promise<TraceVisualization>;
  createGoldenTrace(runId: string, config: GoldenTraceConfig): Promise<GoldenTrace>;
  getGoldenTraces(agentId?: string): Promise<GoldenTrace[]>;
  getGoldenTrace(goldenTraceId: string): Promise<GoldenTrace>;
  deleteGoldenTrace(goldenTraceId: string): Promise<void>;
  exportGoldenTrace(goldenTraceId: string, format?: 'json' | 'yaml'): Promise<string>;
  validateAgainstGoldenTrace(runId: string, goldenTraceId: string, options?: ValidationOptions): Promise<ValidationResult>;
  replayAndValidate(runId: string, goldenTraceId: string, options?: ValidationOptions): Promise<ValidationResult>;
  detectRegressions(newRunId: string, goldenTraceId: string, options?: import('./types/regression.js').RegressionDetectionOptions): Promise<import('./types/regression.js').RegressionReport>;
}

export class SDKImpl implements SDK {
  private eventStore: IEventStore;
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
  private goldenTraceManager: GoldenTraceManager;
  private regressionTestManager: RegressionTestManager;
  private assertionManager: AssertionManager;
  private impactAnalysisManager: ImpactAnalysisManager;

  constructor(config: SDKConfig) {
    this.eventStore = config.eventStore || new FileEventStore();
    this.toolRegistry = new ToolRegistry();
    this.capabilityRegistry = new CapabilityRegistry();
    this.policyEngine = new PolicyEngine();
    this.approvalManager = new ApprovalManager();
    this.budgetTracker = new BudgetTracker(this.eventStore);
    
    // Connect BudgetTracker and EventStore to PolicyEngine
    this.policyEngine.setBudgetTracker(this.budgetTracker);
    this.policyEngine.setEventStore(this.eventStore);
    
    // Create provider once (shared, stateless)
    this.provider = this.createProvider(config);
    
    // ActionEngine and ReplayEngine are shared (stateless)
    // ApprovalManager is passed to ActionEngine for approval workflow
    this.actionEngine = new ActionEngine(this.policyEngine, this.toolRegistry, this.eventStore, this.approvalManager, this.budgetTracker);
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

  private createProvider(config: SDKConfig): LLMProvider {
    const provider = config.provider || 'openai';
    
    // Create primary provider
    let primaryProvider: LLMProvider;
    
    if (provider === 'anthropic') {
      const anthropicConfig = config.providerConfig?.anthropic;
      const apiKey = anthropicConfig?.apiKey || config.apiKey;
      const defaultModel = anthropicConfig?.defaultModel || 'claude-3-5-sonnet-20241022';
      primaryProvider = ProviderFactory.createProvider({
        provider: 'anthropic',
        apiKey,
        defaultModel,
      });
    } else {
      const openaiConfig = config.providerConfig?.openai;
      const apiKey = openaiConfig?.apiKey || config.apiKey;
      const defaultModel = openaiConfig?.defaultModel || 'gpt-4';
      primaryProvider = ProviderFactory.createProvider({
        provider: 'openai',
        apiKey,
        defaultModel,
      });
    }

    // Create fallback providers if configured
    if (config.fallbackProviders && config.fallbackProviders.length > 0) {
      const fallbackProviders = config.fallbackProviders.map((fallbackConfig) => {
        const fallbackApiKey = fallbackConfig.config?.apiKey || config.apiKey;
        const fallbackDefaultModel = fallbackConfig.config?.defaultModel;
        
        return ProviderFactory.createProvider({
          provider: fallbackConfig.provider,
          apiKey: fallbackApiKey,
          defaultModel: fallbackDefaultModel,
        });
      });

      return new FallbackProvider(primaryProvider, fallbackProviders);
    }

    return primaryProvider;
  }

  createAgent(config: AgentConfig): AgentImpl {
    const now = Date.now();
    const configHash = this.computeConfigHash(config);
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
      configHash,
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

  defineTool(definition: ToolDefinition): Tool {
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

  async replay(runId: string, modifications?: ReplayModifications): Promise<RunResult> {
    return await this.replayEngine.replay(runId, modifications);
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

  async getDecisionPatterns(options: {
    agentId?: string;
    userId?: string;
    sessionId?: string;
    since?: number;
    until?: number;
    minFrequency?: number;
  } = {}): Promise<DecisionPatternAnalysis> {
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
      const filteredEvents = options.since || options.until
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

  async getGoldenTraces(agentId?: string): Promise<GoldenTrace[]> {
    return this.goldenTraceManager.getGoldenTraces(agentId);
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

  async exportGoldenTrace(goldenTraceId: string, format: 'json' | 'yaml' = 'json'): Promise<string> {
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
    agentId: string,
    config: {
      name: string;
      goldenTraces: Array<{
        goldenTraceId: string;
        name: string;
        input: unknown;
        tags?: string[];
      }>;
    }
  ): Promise<RegressionTestSuite> {
    return this.regressionTestManager.createTestSuite(agentId, config);
  }

  async getRegressionTestSuites(agentId?: string): Promise<RegressionTestSuite[]> {
    return this.regressionTestManager.getTestSuites(agentId);
  }

  async runRegressionTests(
    agentId: string,
    options?: RegressionTestOptions
  ): Promise<RegressionTestSuiteResult> {
    const suites = await this.getRegressionTestSuites(agentId);
    if (suites.length === 0) {
      throw new Error(`No regression test suites found for agent ${agentId}`);
    }

    const agent = this.activeAgentInstances.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const suite = suites[0];
    return this.runRegressionTestSuite(suite.id, options);
  }

  async runRegressionTestSuite(
    suiteId: string,
    options?: RegressionTestOptions
  ): Promise<RegressionTestSuiteResult> {
    const suite = await this.regressionTestManager.getTestSuite(suiteId);
    if (!suite) {
      throw new Error(`Regression test suite ${suiteId} not found`);
    }

    const agent = this.activeAgentInstances.get(suite.agentId);
    if (!agent) {
      throw new Error(`Agent ${suite.agentId} not found`);
    }

    const detectRegressions = async (runId: string, goldenTraceId: string) => {
      return this.detectRegressions(runId, goldenTraceId);
    };

    return RegressionTestRunner.runTestSuite(suite, agent, detectRegressions, options || {});
  }

  async exportTestResults(
    results: RegressionTestSuiteResult,
    format: 'junit' | 'json' | 'json-summary',
    options?: Omit<TestResultsExportOptions, 'format'>
  ): Promise<string> {
    return TestResultsExporter.export(results, format, options || {});
  }

  async runRegressionTestsForCI(
    agentId: string,
    options?: RegressionTestOptions & { exitCode?: boolean }
  ): Promise<{ results: RegressionTestSuiteResult; exitCode: number }> {
    const results = await this.runRegressionTests(agentId, options);
    const exitCode = TestResultsExporter.calculateExitCode(results);

    return {
      results,
      exitCode: options?.exitCode !== false ? exitCode : 0,
    };
  }

  async defineAssertion(
    name: string,
    condition: AssertionCondition,
    options?: {
      description?: string;
      severity?: 'error' | 'warning';
      tags?: string[];
      agentId?: string;
    }
  ): Promise<Assertion> {
    return this.assertionManager.createAssertion(name, condition, options || {});
  }

  async getAssertions(agentId?: string, tags?: string[]): Promise<Assertion[]> {
    return this.assertionManager.getAssertions(agentId, tags);
  }

  async evaluateAssertions(
    runId: string,
    assertionIds?: string[]
  ): Promise<AssertionEvaluationReport> {
    const events = await this.getEvents(runId);
    let assertions: Assertion[];

    if (assertionIds && assertionIds.length > 0) {
      assertions = [];
      for (const id of assertionIds) {
        const assertion = await this.assertionManager.getAssertion(id);
        if (assertion) {
          assertions.push(assertion);
        }
      }
    } else {
      assertions = await this.getAssertions();
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
    const [trace1, trace2] = await Promise.all([
      this.getTrace(runId1),
      this.getTrace(runId2),
    ]);

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
    const [beforeTraces, afterTraces] = await Promise.all([
      Promise.all(beforeRunIds.map((id) => this.getTrace(id))),
      Promise.all(afterRunIds.map((id) => this.getTrace(id))),
    ]);

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces, options || {});
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
    agentId: string,
    version1: string,
    version2: string,
    options?: ImpactAnalysisOptions
  ): Promise<ImpactAnalysis> {
    if (!this.eventStore.queryEvents) {
      throw new Error('queryEvents is not supported by this event store');
    }

    const queryResult = await this.eventStore.queryEvents({
      agentId,
    });

    if (!queryResult || !queryResult.events) {
      throw new Error(`No events found for agent ${agentId}`);
    }

    const allEvents = queryResult.events;

    const beforeRunIds = Array.from(
      new Set(
        allEvents
          .filter((e: Event) => e.metadata?.agentVersion === version1)
          .map((e: Event) => e.runId as string)
      )
    ) as string[];

    const afterRunIds = Array.from(
      new Set(
        allEvents
          .filter((e: Event) => e.metadata?.agentVersion === version2)
          .map((e: Event) => e.runId as string)
      )
    ) as string[];

    if (beforeRunIds.length === 0 || afterRunIds.length === 0) {
      throw new Error(`No traces found for version ${version1} or ${version2}`);
    }

    return this.analyzeImpact(beforeRunIds, afterRunIds, options);
  }

  async queryEventsAdvanced(filter: AdvancedEventFilter): Promise<AdvancedEventQueryResult> {
    const startTime = Date.now();

    let allEvents: Event[] = [];

    if (filter.runId) {
      allEvents = await this.getEvents(filter.runId);
    } else if (this.eventStore.queryEvents) {
      const queryResult = await this.eventStore.queryEvents({
        type: filter.type,
        since: filter.since,
        until: filter.until,
        agentId: filter.agentId,
        userId: filter.userId,
        sessionId: filter.sessionId,
      });
      allEvents = queryResult?.events || [];
    } else {
      throw new Error('Advanced event filtering requires queryEvents support in event store');
    }

    const filteredEvents = allEvents.filter((e) => AdvancedEventFilterEvaluator.evaluate(e, filter));

    const limitedEvents = filter.limit ? filteredEvents.slice(0, filter.limit) : filteredEvents;

    return {
      events: limitedEvents,
      total: allEvents.length,
      filtered: filteredEvents.length,
      filters: filter,
      executionTime: Date.now() - startTime,
    };
  }

  async countEventsAdvanced(filter: AdvancedEventFilter): Promise<number> {
    const result = await this.queryEventsAdvanced(filter);
    return result.filtered;
  }

  async getEventStatistics(filter: AdvancedEventFilter): Promise<EventStatistics> {
    const result = await this.queryEventsAdvanced({ ...filter, limit: undefined });

    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const event of result.events) {
      byType[event.type] = (byType[event.type] || 0) + 1;

      const agentId = event.metadata?.agentId as string | undefined;
      if (agentId) {
        byAgent[agentId] = (byAgent[agentId] || 0) + 1;
      }
    }

    return {
      total: result.filtered,
      byType,
      byAgent,
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
      'run.failed': (e) => `Run failed: ${e.data?.error as string || 'Unknown error'}`,
      'run.cancelled': () => 'Run cancelled',
      'run.stopped': () => 'Run stopped',
      'intention.generated': (e) => {
        const intention = e.data?.intention as { type?: string } | undefined;
        return `Intention generated: ${intention?.type || 'unknown'}`;
      },
      'intention.rejected': (e) => `Intention rejected: ${e.data?.reason as string || 'Unknown reason'}`,
      'action.executing': (e) => `Action executing: ${e.data?.toolName as string || 'unknown'}`,
      'action.executed': (e) => `Action executed: ${e.data?.toolName as string || 'unknown'}`,
      'action.failed': (e) => `Action failed: ${e.data?.toolName as string || 'unknown'}`,
      'policy.checked': () => 'Policy checked',
      'policy.violated': (e) => `Policy violated: ${e.data?.reason as string || 'Unknown reason'}`,
      'tool.called': (e) => `Tool called: ${e.data?.toolName as string || 'unknown'}`,
      'tool.failed': (e) => `Tool failed: ${e.data?.toolName as string || 'unknown'}`,
      'error.occurred': (e) => `Error occurred: ${e.data?.error as string || 'Unknown error'}`,
    };

    return descriptions[event.type]?.(event) || event.type;
  }

  private getStatusFromEvents(events: Event[]): string {
    const lastEvent = events[events.length - 1];
    if (lastEvent.type === 'run.completed') return 'completed';
    if (lastEvent.type === 'run.failed') return 'failed';
    if (lastEvent.type === 'run.cancelled') return 'cancelled';
    if (events.some((e) => e.type === 'run.started')) return 'running';
    return 'pending';
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

  private computeConfigHash(config: AgentConfig): string {
    const configString = JSON.stringify({
      name: config.name,
      model: config.model,
      systemPrompt: config.systemPrompt,
      maxSteps: config.maxSteps,
      timeout: config.timeout,
      tools: config.tools?.map((t) => ({ name: t.name, version: t.version })),
      policies: config.policies?.map((p) => ({ id: p.id, type: p.type })),
      capabilities: config.capabilities,
      version: config.version,
    });
    return createHash('sha256').update(configString).digest('hex').substring(0, 16);
  }
}

export function createSDK(config: SDKConfig): SDK {
  return new SDKImpl(config);
}

// Module-level SDK instance for convenience functions
let moduleSDK: SDKImpl | null = null;

export function defineTool(definition: ToolDefinition): Tool {
  if (!moduleSDK) {
    // Create a temporary SDK instance for module-level functions
    // This is a convenience function, so we use a dummy key
    // The provider won't actually be used for defineTool
    moduleSDK = new SDKImpl({ apiKey: 'dummy-key-for-module-functions' });
  }
  return moduleSDK.defineTool(definition);
}
