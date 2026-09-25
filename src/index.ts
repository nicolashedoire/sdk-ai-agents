export * from './types/index.js';
export * from './errors/index.js';
export * from './stores/event-store.js';
export * from './stores/file-event-store.js';
export {
  DEFAULT_MAX_QUEUED_EVENTS,
  ObservedEventStore,
} from './stores/observed-event-store.js';
export type {
  LiveSubscription,
  ObservedEventStoreOptions,
} from './stores/observed-event-store.js';
export * from './stores/sql-event-store.js';
export * from './stores/sqlite-event-store.js';
export * from './stores/postgresql-event-store.js';
export * from './registry/tool-registry.js';
export * from './registry/capability-registry.js';
export * from './engines/policy-engine.js';
export * from './engines/reasoning-engine.js';
export * from './engines/action-engine.js';
export * from './engines/replay-engine.js';
export * from './sdk.js';
export * from './agent.js';

// Cognitive layer: explicit reasoning with a persistent mental state
export { CognitiveAgent } from './cognition/cognitive-agent.js';
export { learnFromRun, summarizeReasoning } from './cognition/profile-learning.js';
export type { ProfileLesson } from './cognition/profile-learning.js';
export type {
  CognitiveAgentDependencies,
  CognitiveRunResult,
  ThinkInput,
} from './cognition/cognitive-agent.js';
export { assembleCognitiveAgent } from './cognition/create-cognitive-agent.js';
export type {
  CognitiveAgentConfig,
  CognitiveAgentEnvironment,
} from './cognition/create-cognitive-agent.js';
export { HeuristicController } from './cognition/cognitive-controller.js';
export type {
  CognitiveController,
  ControllerDecision,
  ControllerInput,
  DecisionEvaluationRecord,
} from './cognition/cognitive-controller.js';
export {
  COGNITIVE_OPERATIONS,
  OPERATION_DESCRIPTIONS,
  availableOperations,
  isCognitiveOperation,
} from './cognition/cognitive-operations.js';
export type { CognitiveOperation } from './cognition/cognitive-operations.js';
export { TypedDecisionController } from './cognition/typed-decision-controller.js';
export type { TypedDecisionControllerOptions } from './cognition/typed-decision-controller.js';
export { TypedHypothesisAssessor } from './cognition/hypothesis-assessor.js';
export type { HypothesisAssessment, HypothesisAssessor } from './cognition/hypothesis-assessor.js';
export {
  LLMThoughtGenerator,
  extractJsonObject,
  parseThought,
} from './cognition/llm-thought-generator.js';
export type {
  GeneratedThought,
  ThoughtGenerator,
  ThoughtRequest,
} from './cognition/llm-thought-generator.js';
export { applyThought } from './cognition/mental-state-reducer.js';
export {
  activeHypotheses,
  createMentalState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_COMMIT_RULES,
} from './cognition/mental-state.js';
export type {
  CommitRules,
  Contradiction,
  Fact,
  Hypothesis,
  MentalState,
  Observation,
  ObservationComparison,
  Prediction,
  PredictionEvaluation,
  RememberedKnowledge,
  SchemaVersion,
} from './cognition/mental-state.js';
export { describeMentalState } from './cognition/mental-state-view.js';
export { recalledKnowledgeSchema, thoughtPatchSchema } from './cognition/thought-patch.js';
export type {
  Decision,
  DecisionStatus,
  HypothesisKind,
  InferenceKind,
  ObservationRecord,
  OutcomeVerdict,
  RecalledKnowledgeRecord,
  ThoughtPatch,
  ThoughtPatchInput,
} from './cognition/thought-patch.js';
export {
  knowledgeEntrySchema,
  knowledgeFindingSchema,
  knowledgeItemId,
  projectKnowledge,
  rankKnowledge,
  toRecalledKnowledge,
} from './cognition/knowledge-records.js';
export type {
  KnowledgeEntry,
  KnowledgeEvidence,
  KnowledgeFinding,
  KnowledgeItem,
  KnowledgeStatus,
} from './cognition/knowledge-records.js';
export { knowledgeFindings } from './cognition/knowledge-findings.js';
export { InMemoryKnowledgeStore } from './cognition/knowledge-store.js';
export type { KnowledgeStore } from './cognition/knowledge-store.js';
export { FileKnowledgeStore } from './cognition/file-knowledge-store.js';
export {
  abstention,
  assessReadiness,
  describeBlocker,
  missingForCommitment,
  rankHypotheses,
  readyHypothesis,
  settleDecision,
} from './cognition/decision-readiness.js';
export type {
  DecisionBlocker,
  DecisionReadiness,
  DecisionSettlement,
} from './cognition/decision-readiness.js';
export { PredictionTester, outcomeReportSchema } from './cognition/outcome-evaluator.js';
export type { OutcomeEvaluator, OutcomeReport } from './cognition/outcome-evaluator.js';
export {
  fingerprint,
  observationFromInput,
  observationFromTest,
  observationFromTool,
  observationInputSchema,
} from './cognition/observation-records.js';
export type { ObservationInput } from './cognition/observation-records.js';
export {
  admitProposal,
  assembleThought,
  unassessedHypotheses,
} from './cognition/patch-admission.js';
export type { AdmittedProposal, AssembledThought } from './cognition/patch-admission.js';
export type {
  EngineRecord,
  OperationOutcome,
  ProposedThought,
} from './cognition/operation-outcome.js';
export type { GeneratedOperation } from './cognition/thought-fields.js';
export type { ToolObservation } from './cognition/thought-prompts.js';
export {
  buildControllerDataset,
  rebuildMentalState,
  toJsonLines,
} from './cognition/mental-state-replay.js';
export type { ControllerTrainingExample } from './cognition/mental-state-replay.js';
export { DEFAULT_COGNITIVE_LIMITS } from './cognition/operation-selector.js';
export type { CognitiveLimits } from './cognition/operation-selector.js';
export { distillThinkerProfile } from './cognition/profile-distiller.js';
export type { DistillProfileInput, ThinkingSample } from './cognition/profile-distiller.js';
export {
  DEFAULT_THINKER_PROFILE,
  defineThinkerProfile,
  reasoningFeedbackSchema,
  refineProfile,
  renderProfile,
  thinkerProfileSchema,
} from './cognition/thinker-profile.js';
export type {
  ReasoningFeedback,
  ThinkerProfile,
  ThinkerProfileInput,
} from './cognition/thinker-profile.js';

// Studies: understand an object, then redesign it with today's means
// `Study` is created by `sdk.createStudy`; the environment it is built with is internal.
export { MAX_AMENDMENTS, MAX_AMENDMENT_LENGTH, Study } from './study/study.js';
export { DEFAULT_STUDY_LIMITS, DEFAULT_DRIFT_THRESHOLD } from './study/study-config.js';
export { renderStudyMarkdown } from './study/study-markdown.js';
export { studyLabels } from './study/study-labels.js';
export type { StudyLabelLanguage, StudyLabels } from './study/study-labels.js';
export type {
  MechanismCard,
  StudyAdvance,
  StudyAmendment,
  StudyAmendmentVerdict,
  StudyAmendOptions,
  StudyAnalogue,
  StudyArchitecture,
  StudyAssemblyLink,
  StudyCapability,
  StudyCapabilityTarget,
  StudyChainStage,
  StudyCharter,
  StudyChoiceFactor,
  StudyChangeKind,
  StudyClaim,
  StudyClaimStatus,
  StudyCombination,
  StudyComponent,
  StudyConfig,
  StudyConstraint,
  StudyDriftEntry,
  StudyExperiment,
  StudyExperimentOutcome,
  StudyHistoricalChoice,
  StudyIndependentLead,
  StudyLeadVerdict,
  StudyLimits,
  StudyNotice,
  StudyNoticeCode,
  StudyNoveltyClaim,
  StudyObservation,
  StudyPassage,
  StudyPassageState,
  StudyPiece,
  StudyPieceStates,
  StudyPrinciple,
  StudyPriorArt,
  StudyReason,
  StudyReasonCode,
  StudyReference,
  StudyReport,
  StudyResult,
  StudyRevisableDecision,
  StudyRunOptions,
  StudySearch,
  StudySearchResult,
  StudyStats,
  StudyStatus,
  StudyStopReason,
  StudyThreeState,
  StudyTrace,
} from './study/study-types.js';

// Typed decisions (TypeSafe Jev and compatible backends)
export { DecisionService } from './decisions/decision-service.js';
export type {
  ChooseResult,
  CheckResult,
  DecisionOptions,
  RateResult,
  SelectManyResult,
} from './decisions/decision-service.js';
export { JevClient, JEV_DEFAULT_BASE_URL, JEV_DEFAULT_MODEL } from './decisions/jev-client.js';
export type { JevClientConfig, JevModel } from './decisions/jev-client.js';
export {
  choice,
  noul,
  score,
  normalizeScore,
  parseAnswers,
  assertValidQuestions,
} from './decisions/typed-decisions.js';
export type {
  AnswerFor,
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionRequest,
  DecisionResponse,
  NoulAnswer,
  NoulQuestion,
  ScoreAnswer,
  ScoreQuestion,
  Structured,
  TypedAnswer,
  TypedDecisionClient,
  TypedQuestion,
  TypedQuestions,
} from './decisions/typed-decisions.js';

// Costs, resilience and incidents
export { DEFAULT_PRICING, costOf, findModelPrice } from './costs/pricing.js';
export type { ModelPrice, PricingTable } from './costs/pricing.js';
export { computeRunCost, collectUsage } from './costs/run-cost.js';
export type { ModelCostLine, RunCostReport } from './costs/run-cost.js';
export { DEFAULT_RETRY_POLICY, isTransientError, withRetry } from './resilience/retry.js';
export type { RetryAttemptInfo, RetryOptions, RetryPolicy } from './resilience/retry.js';
export { RetryingLLMProvider } from './resilience/retrying-provider.js';
export type { ProviderRetryInfo } from './resilience/retrying-provider.js';
export { DEFAULT_INCIDENT_RULES, incidentSchema, summarizeEvent } from './incidents/incident.js';
export type {
  Incident,
  IncidentNotifier,
  IncidentRule,
  IncidentSeverity,
} from './incidents/incident.js';
export {
  EmailIncidentNotifier,
  ResendEmailTransport,
  WebhookIncidentNotifier,
  renderIncidentHtml,
  renderIncidentText,
} from './incidents/incident-notifiers.js';
export type { EmailMessage, EmailTransport } from './incidents/incident-notifiers.js';
export { MonitoredEventStore } from './incidents/monitored-event-store.js';
export type { IncidentMonitorOptions } from './incidents/monitored-event-store.js';
export { parseRetryAfter } from './utils/http.js';
export type { FetchLike, HttpResponseLike } from './utils/http.js';
export { deriveRunStatus } from './utils/run-status.js';
// The built-in providers, to compose your own chain (e.g. a FallbackProvider given as llmProvider).
export { DEFAULT_OPENAI_MODEL, OpenAIProvider } from './providers/openai-provider.js';
export type {
  OpenAIProviderOptions,
  OpenAIRequestOptions,
} from './providers/openai-provider.js';
export { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic-provider.js';
export { FallbackProvider } from './providers/fallback-provider.js';
export type { FallbackResult } from './providers/fallback-provider.js';
export type {
  DiscardedAnswer,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  OpenAIReasoningEffort,
  VendorClientOptions,
} from './providers/llm-provider.js';

// Tool sources: a web API, a folder, a database or an agent as tools (and MCP servers)
export { openApiTools } from './tools/openapi-tools.js';
export type { OpenApiOperationInfo, OpenApiToolsOptions } from './tools/openapi-tools.js';
export type { OpenApiFetch, OpenApiSpecSource } from './tools/openapi-spec.js';
export type { OpenApiResult } from './tools/openapi-call.js';
export { folderResources, folderTools } from './tools/folder-tools.js';
export type { FolderToolsOptions } from './tools/folder-tools.js';
export { DEFAULT_TEXT_EXTENSIONS } from './tools/folder-options.js';
export type {
  FileContent,
  FolderEntry,
  FolderOptions,
  SearchMatch,
} from './tools/folder-options.js';
export { databaseTools } from './tools/database-tools.js';
export type {
  ColumnSummary,
  DatabaseToolsOptions,
  ReadOnlyDatabase,
  ReadOnlyQueryResult,
  TableSummary,
} from './tools/database-tools.js';
export { sqliteReadOnly } from './tools/sqlite-read-only.js';
export type { SqliteConnectionLike, SqliteStatementLike } from './tools/sqlite-read-only.js';
export { postgresReadOnly } from './tools/postgres-read-only.js';
export type {
  PgClientLike,
  PgPoolLike,
  PostgresReadOnlyOptions,
} from './tools/postgres-read-only.js';
export { assertSingleQuery } from './tools/sql-statement-guard.js';
export type { SqlDialect } from './tools/sql-statement-guard.js';
// Web research: search (DuckDuckGo by default, SearXNG, Brave, Tavily, Serper), fetch, arXiv,
// Wikipedia and GitHub
export { DEFAULT_USER_AGENT, webTools } from './tools/web/web-tools.js';
export type {
  SourceSearchOutput,
  WebSearchOutput,
  WebToolName,
  WebToolsOptions,
} from './tools/web/web-tools.js';
export type { WebFetchOutput } from './tools/web/web-fetch.js';
export type { ArxivOptions, ArxivResult } from './tools/web/sources/arxiv.js';
export type { WikipediaOptions, WikipediaResult } from './tools/web/sources/wikipedia.js';
export type { GithubOptions, GithubResult, GithubSearchKind } from './tools/web/sources/github.js';
export { duckDuckGo } from './tools/web/providers/duckduckgo.js';
export type { DuckDuckGoOptions } from './tools/web/providers/duckduckgo.js';
export { searxng } from './tools/web/providers/searxng.js';
export type { SearxngOptions } from './tools/web/providers/searxng.js';
export { brave } from './tools/web/providers/brave.js';
export type { KeyedProviderOptions } from './tools/web/providers/brave.js';
export { tavily } from './tools/web/providers/tavily.js';
export { serper } from './tools/web/providers/serper.js';
export type {
  Freshness,
  SearchHit,
  SearchProvider,
  SearchRequest,
} from './tools/web/search-provider.js';
export type { CircuitBreakerOptions, ProviderFailure } from './tools/web/search-chain.js';
export type {
  ResponseHead,
  WebClient,
  WebLookup,
  WebRequestInit,
  WebResponse,
} from './tools/web/guarded-http.js';
export { isPublicAddress } from './tools/web/ip-ranges.js';
export { normalizeUrl } from './tools/web/results.js';
export type { WebResult } from './tools/web/results.js';
export {
  SearchThrottledError,
  WebConfigurationError,
  WebHttpError,
  WebRequestRefusedError,
  WebTimeoutError,
} from './tools/web/web-errors.js';
export type { WebRefusalReason } from './tools/web/web-errors.js';
export { cognitiveAgentTool, governedAgentTool } from './tools/agent-tools.js';
export type {
  AgentToolOptions,
  CognitiveAgentToolResult,
  GovernedAgentToolResult,
} from './tools/agent-tools.js';
