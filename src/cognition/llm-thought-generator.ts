import { ThoughtGenerationError, type ModelUsage } from '../errors/index.js';
import type {
  DiscardedAnswer,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  OpenAIReasoningEffort,
} from '../providers/llm-provider.js';
import type { MentalState } from './mental-state.js';
import { unassessedHypotheses } from './patch-admission.js';
import type { ThinkerProfile } from './thinker-profile.js';
import { ALLOWED_FIELDS, REQUIRED_FIELD, type GeneratedOperation } from './thought-fields.js';
import { thoughtPatchSchema, type ThoughtPatch } from './thought-patch.js';
import {
  buildOperationPrompt,
  buildSystemPrompt,
  type ToolObservation,
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
    const usage: ModelUsage = { promptTokens: 0, completionTokens: 0, calls: 0 };
    let model: string | undefined;
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
        response = await this.provider.generateCompletion({
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
      } catch (error) {
        // Keep the tokens of earlier attempts: they were billed even if this call failed.
        if (usage.calls === 0 && discarded.length === 0) throw error;
        throw new ThoughtGenerationError(
          request.operation,
          error instanceof Error ? error.message : String(error),
          {
            originalError: error instanceof Error ? error : new Error(String(error)),
            ...(usage.calls > 0 ? { usage } : {}),
            ...(discarded.length > 0 ? { discarded } : {}),
            requestedModel: this.options.model,
            ...(model ? { model } : {}),
          }
        );
      }
      addUsage(usage, response.usage);
      model = response.model;

      const content = response.content ?? '';
      const parsed = checkCompleteness(request, parseThought(request.operation, content));
      if (parsed.ok) {
        return {
          patch: parsed.patch,
          ignoredFields: parsed.ignoredFields,
          model: response.model,
          requestedModel: this.options.model,
          usage,
          ...(discarded.length > 0 ? { discarded } : {}),
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

    throw new ThoughtGenerationError(request.operation, lastError, {
      usage,
      ...(discarded.length > 0 ? { discarded } : {}),
      model: model ?? this.options.model,
      requestedModel: this.options.model,
    });
  }
}

/**
 * Adds one call to the usage. A call that reported no input/output token counts is counted
 * as unmetered: its cost is unknown, not zero.
 */
function addUsage(usage: ModelUsage, reported: LLMResponse['usage']): void {
  usage.calls += 1;
  if (reported?.promptTokens === undefined && reported?.completionTokens === undefined) {
    usage.unmeteredCalls = (usage.unmeteredCalls ?? 0) + 1;
    return;
  }
  usage.promptTokens += reported.promptTokens ?? 0;
  usage.completionTokens += reported.completionTokens ?? 0;
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
