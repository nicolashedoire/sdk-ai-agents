import type { ActionEngine } from '../engines/action-engine.js';
import { ReasoningEngine } from '../engines/reasoning-engine.js';
import { ValidationError } from '../errors/index.js';
import type { TypedDecisionClient } from '../decisions/typed-decisions.js';
import type { LLMProvider } from '../providers/llm-provider.js';
import type { IEventStore } from '../stores/event-store.js';
import type { ProviderSettings } from '../types/agent.js';
import type { Policy } from '../types/policy.js';
import type { Tool } from '../types/tool.js';
import { CognitiveAgent } from './cognitive-agent.js';
import { HeuristicController, type CognitiveController } from './cognitive-controller.js';
import { TypedHypothesisAssessor, type HypothesisAssessor } from './hypothesis-assessor.js';
import { InformationSeeker } from './information-seeker.js';
import { LLMThoughtGenerator } from './llm-thought-generator.js';
import {
  DEFAULT_COGNITIVE_LIMITS,
  cognitiveLimitsSchema,
  type CognitiveLimits,
} from './operation-selector.js';
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
  /** Who compares hypotheses: `auto` (default) uses the typed-decision client when configured. */
  assessment?: 'auto' | 'llm' | 'typed';
  temperature?: number;
  maxTokens?: number;
  providerSettings?: {
    openai?: ProviderSettings;
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
  const parsedLimits = cognitiveLimitsSchema.safeParse({
    ...DEFAULT_COGNITIVE_LIMITS,
    ...config.limits,
  });
  if (!parsedLimits.success) {
    const issue = parsedLimits.error.issues[0];
    throw new ValidationError(
      `limits.${issue?.path.join('.') ?? ''}`,
      issue?.message ?? 'invalid limits'
    );
  }
  const limits = parsedLimits.data;
  const generator = new LLMThoughtGenerator(environment.provider, {
    model: config.model,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
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
