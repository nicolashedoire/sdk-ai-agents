import { type ModelUsage, ThoughtGenerationError } from '../errors/index.js';
import { FallbackProvider } from '../providers/fallback-provider.js';
import type {
  DiscardedAnswer,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  OpenAIReasoningEffort,
} from '../providers/llm-provider.js';
import { tokensOfCall } from '../utils/usage-tokens.js';
import type { MentalState } from './mental-state.js';
import { unassessedHypotheses } from './patch-admission.js';
import type { ThinkerProfile } from './thinker-profile.js';
import { ALLOWED_FIELDS, type GeneratedOperation, REQUIRED_FIELD } from './thought-fields.js';
import { type ThoughtPatch, thoughtPatchSchema } from './thought-patch.js';
import {
  type ToolObservation,
  buildOperationPrompt,
  buildSystemPrompt,
} from './thought-prompts.js';

export interface ThoughtRequest {
  /** Run the thought belongs to (traces retries and costs). */
  runId?: string;
  operation: GeneratedOperation;
  state: MentalState;
  profile: ThinkerProfile;
  observation?: ToolObservation;
  abortSignal?: AbortSignal;
}

export interface GeneratedThought {
  patch: ThoughtPatch;
  /** Fields present in the reply but not allowed for this operation. */
  ignoredFields: string[];
  model?: string;
  /** Model name requested, which may differ from the versioned id the provider returns. */
  requestedModel?: string;
  /** Calls whose answer was used or read, repairs included (not the discarded ones). */
  usage?: ModelUsage;
  /**
   * Answers a provider discarded after the vendor billed them (an empty answer before a
   * failover), each with its own provider, model and usage: the engine records them as
   * `provider.answer_discarded` events, so each is priced at the model that gave it.
   */
  discarded?: DiscardedAnswer[];
}

/** Produces the thought for one operation. The default implementation uses an LLM. */
export interface ThoughtGenerator {
  generate(request: ThoughtRequest): Promise<GeneratedThought>;
}

export interface LLMThoughtGeneratorOptions {
  model: string;
  /** Defaults to 0.4: analytical rather than creative. */
  temperature?: number;
  maxTokens?: number;
  /** Reasoning effort of an OpenAI reasoning model (the provider's when omitted). */
  reasoningEffort?: OpenAIReasoningEffort;
  /** Extra instructions appended to the system prompt. */
  systemPrompt?: string;
  /** Extra attempts after an invalid reply, with the validation error fed back. Defaults to 1. */
  maxRepairAttempts?: number;
  /** Upper bound on hypotheses proposed per `hypothesize` operation. Defaults to 2. */
  maxNewHypotheses?: number;
}

export type ParsedThought =
  | { ok: true; patch: ThoughtPatch; ignoredFields: string[] }
  | { ok: false; error: string };

export class LLMThoughtGenerator implements ThoughtGenerator {
  constructor(
    private readonly provider: LLMProvider,
    private readonly options: LLMThoughtGeneratorOptions
  ) {}

  async generate(request: ThoughtRequest): Promise<GeneratedThought> {
    const messages: LLMRequest['messages'] = [
      { role: 'system', content: buildSystemPrompt(request.profile, this.options.systemPrompt) },
      {
        role: 'user',
        content: buildOperationPrompt({
          operation: request.operation,
          state: request.state,
          ...(request.observation ? { observation: request.observation } : {}),
          maxNewHypotheses: this.options.maxNewHypotheses ?? 2,
        }),
      },
    ];
    // Every answered attempt, with the names it is priced on: a fallback may have answered a
    // repair with another model, or its own default model.
    const attempts: AnsweredAttempt[] = [];
    // Kept apart from the thought's usage: their model may not be the one that answered.
    const discarded: DiscardedAnswer[] = [];
    const onDiscardedAnswer = (answer: DiscardedAnswer) => {
      discarded.push(answer);
    };
    const maxAttempts = 1 + Math.max(0, this.options.maxRepairAttempts ?? 1);
    let lastError = 'no reply';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response: LLMResponse;
      try {
        const answered = await this.complete({
          ...(request.runId ? { runId: request.runId } : {}),
          model: this.options.model,
          messages: [...messages],
          temperature: this.options.temperature ?? 0.4,
          ...(this.options.maxTokens ? { maxTokens: this.options.maxTokens } : {}),
          ...(this.options.reasoningEffort
            ? { reasoningEffort: this.options.reasoningEffort }
            : {}),
          ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
          onDiscardedAnswer,
        });
        response = answered.response;
        attempts.push(answered);
      } catch (error) {
        // Keep the tokens of earlier attempts: they were billed even if this call failed.
        if (attempts.length === 0 && discarded.length === 0) throw error;
        const settled = settleAttempts(attempts, discarded);
        throw new ThoughtGenerationError(
          request.operation,
          error instanceof Error ? error.message : String(error),
          {
            originalError: error instanceof Error ? error : new Error(String(error)),
            ...(settled.usage.calls > 0 ? { usage: settled.usage } : {}),
            ...(settled.discarded.length > 0 ? { discarded: settled.discarded } : {}),
            ...(settled.requestedModel ? { requestedModel: settled.requestedModel } : {}),
            ...(settled.model ? { model: settled.model } : {}),
          }
        );
      }

      const content = response.content ?? '';
      const parsed = checkCompleteness(request, parseThought(request.operation, content));
      if (parsed.ok) {
        const settled = settleAttempts(attempts, discarded);
        return {
          patch: parsed.patch,
          ignoredFields: parsed.ignoredFields,
          model: response.model,
          ...(settled.requestedModel ? { requestedModel: settled.requestedModel } : {}),
          usage: settled.usage,
          ...(settled.discarded.length > 0 ? { discarded: settled.discarded } : {}),
        };
      }
      lastError = parsed.error;
      messages.push(
        { role: 'assistant', content },
        {
          role: 'user',
          content: `Your reply could not be used: ${parsed.error}. Reply again with only the JSON object described above.`,
        }
      );
    }

    const settled = settleAttempts(attempts, discarded);
    throw new ThoughtGenerationError(request.operation, lastError, {
      usage: settled.usage,
      ...(settled.discarded.length > 0 ? { discarded: settled.discarded } : {}),
      model: settled.model ?? this.options.model,
      ...(settled.requestedModel ? { requestedModel: settled.requestedModel } : {}),
    });
  }

  /**
   * One call to the provider, and the model it asked for. A fallback chain may send a fallback
   * its own default model instead of this generator's: that is what the answer is priced on.
   */
  private async complete(request: LLMRequest): Promise<AnsweredAttempt> {
    if (this.provider instanceof FallbackProvider) {
      const result = await this.provider.generateCompletionWithFallback(request);
      return {
        response: result.response,
        provider: result.usedProvider,
        ...(result.requestedModel ? { requestedModel: result.requestedModel } : {}),
      };
    }
    const response = await this.provider.generateCompletion(request);
    return {
      response,
      provider: this.provider.getProviderName(),
      ...(request.model ? { requestedModel: request.model } : {}),
    };
  }
}

/** An attempt a provider answered, and the names its tokens are priced on. */
interface AnsweredAttempt {
  response: LLMResponse;
  provider: string;
  requestedModel?: string;
}

/**
 * The usage of a thought's attempts, priced on the names of the last one. An earlier attempt
 * answered under other names (a repair a fallback answered) is not added to it: it is
 * reported with the discarded answers, priced on its own names, as its reply was not used.
 */
function settleAttempts(
  attempts: AnsweredAttempt[],
  discarded: DiscardedAnswer[]
): {
  usage: ModelUsage;
  discarded: DiscardedAnswer[];
  model?: string;
  requestedModel?: string;
} {
  const last = attempts.at(-1);
  const usage: ModelUsage = { promptTokens: 0, completionTokens: 0, calls: 0 };
  const apart: DiscardedAnswer[] = [];
  for (const attempt of attempts) {
    const { model, usage: reported } = attempt.response;
    const sameNames =
      model === last?.response.model && attempt.requestedModel === last?.requestedModel;
    if (!sameNames && reported) {
      apart.push({
        provider: attempt.provider,
        model,
        ...(attempt.requestedModel ? { requestedModel: attempt.requestedModel } : {}),
        usage: reported,
        reason: 'Its reply could not be used, and another model answered the repair',
      });
    } else {
      addUsage(usage, reported);
    }
  }
  return {
    usage,
    discarded: [...discarded, ...apart],
    ...(last?.response.model ? { model: last.response.model } : {}),
    ...(last?.requestedModel ? { requestedModel: last.requestedModel } : {}),
  };
}

/**
 * Adds one call to the usage. A call that did not report both its input and output token
 * counts is counted as unmetered: its cost is unknown, not zero (see `tokensOfCall`).
 */
function addUsage(usage: ModelUsage, reported: LLMResponse['usage']): void {
  usage.calls += 1;
  const tokens = tokensOfCall(reported);
  if (!tokens.metered) {
    usage.unmeteredCalls = (usage.unmeteredCalls ?? 0) + 1;
    // Its tokens still count (see `tokensOfUsage`), not as a cost.
    if (tokens.unmeteredTokens > 0) {
      usage.unmeteredTokens = (usage.unmeteredTokens ?? 0) + tokens.unmeteredTokens;
    }
    return;
  }
  usage.promptTokens += tokens.inputTokens;
  usage.completionTokens += tokens.outputTokens;
}

/**
 * Extracts, validates and restricts a model reply for one operation.
 * Exported so custom generators (and tests) share the exact same contract.
 */
export function parseThought(operation: GeneratedOperation, text: string): ParsedThought {
  const json = extractJsonObject(text);
  if (json === undefined) {
    return { ok: false, error: 'the reply does not contain a JSON object' };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, error: 'the reply must be a JSON object' };
  }

  const allowed = new Set<string>(['summary', ...ALLOWED_FIELDS[operation]]);
  const restricted: Record<string, unknown> = {};
  const ignoredFields: string[] = [];
  for (const [key, value] of Object.entries(json)) {
    if (allowed.has(key)) {
      restricted[key] = value;
    } else {
      ignoredFields.push(key);
    }
  }

  const result = thoughtPatchSchema.safeParse(restricted);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') || 'reply';
    return { ok: false, error: `${path}: ${issue?.message ?? 'invalid value'}` };
  }

  const required = REQUIRED_FIELD[operation];
  if (required) {
    const value = result.data[required];
    const missing = value === undefined || (Array.isArray(value) && value.length === 0);
    if (missing) {
      return { ok: false, error: `"${required}" is required for the ${operation} operation` };
    }
  }

  return { ok: true, patch: result.data, ignoredFields };
}

/** A comparison must judge every hypothesis in play; the model is asked to repair it otherwise. */
function checkCompleteness(request: ThoughtRequest, parsed: ParsedThought): ParsedThought {
  if (!parsed.ok || request.operation !== 'compare' || request.state.schemaVersion < 2) {
    return parsed;
  }
  const skipped = unassessedHypotheses(request.state, parsed.patch);
  return skipped.length === 0
    ? parsed
    : {
        ok: false,
        error: `"hypothesisUpdates" must give a support to every active hypothesis (missing: ${skipped.join(', ')})`,
      };
}

/** Parses the first JSON object in a reply, tolerating Markdown fences and surrounding prose. */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return undefined;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
