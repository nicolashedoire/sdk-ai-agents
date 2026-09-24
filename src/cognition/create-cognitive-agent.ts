import type { ActionEngine } from '../engines/action-engine.js';
import { ReasoningEngine } from '../engines/reasoning-engine.js';
import { ValidationError } from '../errors/index.js';
import type { TypedDecisionClient } from '../decisions/typed-decisions.js';
import type { LLMProvider, OpenAIReasoningEffort } from '../providers/llm-provider.js';
import type { IEventStore } from '../stores/event-store.js';
import type { OpenAIProviderSettings, ProviderSettings } from '../types/agent.js';
import type { Policy } from '../types/policy.js';
import type { Tool } from '../types/tool.js';
import { CognitiveAgent } from './cognitive-agent.js';
import { HeuristicController, type CognitiveController } from './cognitive-controller.js';
import { TypedHypothesisAssessor, type HypothesisAssessor } from './hypothesis-assessor.js';
import { InformationSeeker } from './information-seeker.js';
import { parseKnowledgeScope, type KnowledgeStore } from './knowledge-store.js';
import { LLMThoughtGenerator, type ThoughtGenerator } from './llm-thought-generator.js';
import {
  DEFAULT_COGNITIVE_LIMITS,
  cognitiveLimitsSchema,
  type CognitiveLimits,
} from './operation-selector.js';
import type { OutcomeEvaluator } from './outcome-evaluator.js';
import type { KnowledgeSettings } from './run-knowledge.js';
import {
  DEFAULT_THINKER_PROFILE,
  defineThinkerProfile,
  type ThinkerProfileInput,
} from './thinker-profile.js';
import {
  TypedDecisionController,
  type TypedDecisionControllerOptions,
} from './typed-decision-controller.js';

export interface CognitiveAgentConfig {
  name: string;
  /** Model used for thoughts and tool selection (e.g. `gpt-4o`, `claude-sonnet-5`). */
  model: string;
  /** How the agent should think. Defaults to a neutral evidence-first profile. */
  profile?: ThinkerProfileInput;
  tools?: Tool[];
  policies?: Policy[];
  /** Extra instructions added to every thought and tool-selection prompt. */
  systemPrompt?: string;
  version?: string;
  limits?: Partial<CognitiveLimits>;
  /**
   * Who picks the next operation:
   * - `auto` (default): the typed-decision client (Jev) when configured, else `heuristic`;
   * - `heuristic`: deterministic order of attention, no model call;
   * - `typed`: the typed-decision client, required;
   * - or your own `CognitiveController`.
   */
  controller?: 'auto' | 'heuristic' | 'typed' | CognitiveController;
  controllerOptions?: TypedDecisionControllerOptions;
  /**
   * Who judges hypotheses during `compare`: `auto` (default) uses the typed-decision client
   * when configured, else the LLM; or your own `HypothesisAssessor`.
   */
  assessment?: 'auto' | 'llm' | 'typed' | HypothesisAssessor;
  /**
   * Produces the thoughts, observation comparisons included. Defaults to an LLM generator on
   * `model`; whatever it returns still goes through the engine's admission rules.
   */
  generator?: ThoughtGenerator;
  /**
   * Confronts predictions with real tests (a simulator, a measurement, a test suite). Enables
   * the `test_prediction` operation; without it, predictions are recorded but stay untested.
   */
  evaluator?: OutcomeEvaluator;
  /**
   * Memory across runs. At the start of a run, recalls what earlier runs of the same scope
   * established with real tests; at the end, records what this run's tests established.
   */
  knowledge?: {
    store: KnowledgeStore;
    /** What the knowledge is about (lowercase letters, digits, ".", "-", "_"), e.g. `inclined-plane`. */
    scope: string;
    /** Items recalled at the start of a run, 0 to 50. Defaults to 10. */
    recallLimit?: number;
    /** Whether runs record what their tests established. Defaults to true. */
    record?: boolean;
  };
  temperature?: number;
  maxTokens?: number;
  /**
   * Reasoning effort of the thoughts on an OpenAI reasoning model (the provider's when omitted).
   * Tool selection takes `providerSettings.openai.reasoningEffort` instead: on GPT-5.4 and later
   * it needs `none` to call tools, while thoughts, which offer no tools, can reason more.
   */
  reasoningEffort?: OpenAIReasoningEffort;
  /** Settings of tool selection (the native reasoning engine), not of the thoughts. */
  providerSettings?: {
    openai?: OpenAIProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings;
  };
}

export interface CognitiveAgentEnvironment {
  agentId: string;
  provider: LLMProvider;
  eventStore: IEventStore;
  actionEngine: ActionEngine;
  decisionClient?: TypedDecisionClient;
}

/** Assembles a cognitive agent from its configuration and the SDK's shared services. */
export function assembleCognitiveAgent(
  config: CognitiveAgentConfig,
  environment: CognitiveAgentEnvironment
): CognitiveAgent {
  const tools = config.tools ?? [];
  const requested = { ...DEFAULT_COGNITIVE_LIMITS, ...config.limits };
  // Lowering the decision threshold lowers the default proposal floor with it.
  const parsedLimits = cognitiveLimitsSchema.safeParse(
    config.limits?.minProposalSupport === undefined
      ? {
          ...requested,
          minProposalSupport: Math.min(
            DEFAULT_COGNITIVE_LIMITS.minProposalSupport,
            requested.decisionThreshold
          ),
        }
      : requested
  );
  if (!parsedLimits.success) {
    const issue = parsedLimits.error.issues[0];
    throw new ValidationError(
      `limits.${issue?.path.join('.') ?? ''}`,
      issue?.message ?? 'invalid limits'
    );
  }
  const limits = parsedLimits.data;
  const generator =
    config.generator ??
    new LLMThoughtGenerator(environment.provider, {
      model: config.model,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
      ...(config.reasoningEffort !== undefined ? { reasoningEffort: config.reasoningEffort } : {}),
      ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
    });

  return new CognitiveAgent({
    identity: {
      id: environment.agentId,
      name: config.name,
      version: config.version ?? '1.0.0',
      model: config.model,
      tools,
    },
    limits,
    profile: config.profile ? defineThinkerProfile(config.profile) : DEFAULT_THINKER_PROFILE,
    generator,
    controller: resolveController(config, environment.decisionClient),
    ...optionalAssessor(config, environment.decisionClient),
    ...(config.evaluator ? { evaluator: config.evaluator } : {}),
    ...(config.knowledge
      ? { knowledge: knowledgeSettings(config.knowledge, limits.timeoutMs) }
      : {}),
    seeker: new InformationSeeker({
      agentId: environment.agentId,
      model: config.model,
      tools,
      reasoningEngine: new ReasoningEngine(environment.provider, config.model),
      actionEngine: environment.actionEngine,
      eventStore: environment.eventStore,
      generator,
      ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      ...(config.providerSettings ? { providerSettings: config.providerSettings } : {}),
    }),
    eventStore: environment.eventStore,
  });
}

const MAX_RECALL = 50;

function knowledgeSettings(
  knowledge: NonNullable<CognitiveAgentConfig['knowledge']>,
  timeoutMs: number
): KnowledgeSettings {
  const recallLimit = knowledge.recallLimit ?? 10;
  if (!Number.isInteger(recallLimit) || recallLimit < 0 || recallLimit > MAX_RECALL) {
    throw new ValidationError(
      'knowledge.recallLimit',
      `must be an integer from 0 to ${MAX_RECALL}`
    );
  }
  return {
    store: knowledge.store,
    scope: parseKnowledgeScope(knowledge.scope),
    recallLimit,
    record: knowledge.record ?? true,
    timeoutMs,
  };
}

function resolveController(
  config: CognitiveAgentConfig,
  client: TypedDecisionClient | undefined
): CognitiveController {
  const choice = config.controller ?? 'auto';
  if (typeof choice === 'object') {
    return choice;
  }
  if (choice === 'heuristic' || (choice === 'auto' && !client)) {
    return new HeuristicController();
  }
  if (!client) {
    throw new ValidationError(
      'controller',
      'the typed controller needs `jev` or `decisionClient` in the SDK config'
    );
  }
  return new TypedDecisionController(client, config.controllerOptions);
}

function optionalAssessor(
  config: CognitiveAgentConfig,
  client: TypedDecisionClient | undefined
): { assessor?: HypothesisAssessor } {
  const mode = config.assessment ?? 'auto';
  if (typeof mode === 'object') {
    return { assessor: mode };
  }
  if (mode === 'llm') {
    return {};
  }
  if (!client) {
    if (mode === 'typed') {
      throw new ValidationError(
        'assessment',
        'typed assessment needs `jev` or `decisionClient` in the SDK config'
      );
    }
    return {};
  }
  return { assessor: new TypedHypothesisAssessor(client) };
}
