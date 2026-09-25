import {
  type AnsweredAttempt,
  answerWithNames,
  settleAttempts,
} from '../cognition/llm-thought-generator.js';
import type { DiscardedAnswer, LLMMessage, LLMProvider } from '../providers/llm-provider.js';
import { truncate } from '../utils/truncate.js';
import type { Parsed } from './study-replies.js';
import type { StudyRun } from './study-run.js';
import type { StudyPassage } from './study-types.js';

/** What a model call of a study is for, as `study.model_called` records it. */
export type StudyCallPurpose =
  | 'passage'
  | 'queries'
  | 'check'
  | 'priorArtQueries'
  | 'priorArtCheck'
  | 'amendment';

export interface StudyCall<Value> {
  purpose: StudyCallPurpose;
  passage?: StudyPassage;
  temperature: number;
  /** Builds the prompt afresh; `rejection` says why the previous reply could not be used. */
  messages: (rejection?: string) => LLMMessage[];
  /** Reads a reply; `final` is the last attempt, where lesser gaps are accepted. */
  parse: (reply: string, final: boolean) => Parsed<Value>;
}

/** A reply that could not be used, even after a repair. */
export class StudyReplyError extends Error {
  constructor(call: { purpose: StudyCallPurpose; passage?: StudyPassage }, reason: string) {
    super(
      `The ${call.purpose} reply${call.passage ? ` of passage ${call.passage}` : ''} could not be used: ${reason}`
    );
    this.name = 'StudyReplyError';
  }
}

/** An attempt, then one repair. */
const MAX_ATTEMPTS = 2;

/** Calls the model for a study, every call built from nothing but its prompt. */
export class StudyModel {
  constructor(
    private readonly provider: LLMProvider,
    private readonly options: { model: string; maxTokens?: number }
  ) {}

  /**
   * Asks the model, and once more with the reason when the reply cannot be used. Each attempt
   * is admitted by the run first (`maxModelCalls`, timeout, cancellation). The attempts the
   * vendor answered are recorded as one `study.model_called` event, and the answers a
   * provider discarded as `provider.answer_discarded` events, whatever the outcome: every
   * billed call reaches the run's cost and budgets.
   */
  async ask<Value>(run: StudyRun, call: StudyCall<Value>): Promise<Value> {
    const attempts: AnsweredAttempt[] = [];
    const discarded: DiscardedAnswer[] = [];
    const onDiscardedAnswer = (answer: DiscardedAnswer) => {
      discarded.push(answer);
    };
    let rejection: string | undefined;
    let answer: { value: Value } | undefined;
    let failure: unknown;
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !answer; attempt++) {
        run.admitModelCall();
        const answered = await answerWithNames(this.provider, {
          runId: run.runId,
          model: this.options.model,
          messages: call.messages(rejection),
          temperature: call.temperature,
          ...(this.options.maxTokens ? { maxTokens: this.options.maxTokens } : {}),
          abortSignal: run.signal,
          onDiscardedAnswer,
        });
        attempts.push(answered);
        run.answered++;
        const parsed = call.parse(answered.response.content ?? '', attempt === MAX_ATTEMPTS - 1);
        if (parsed.ok) answer = { value: parsed.value };
        else rejection = parsed.error;
      }
    } catch (error) {
      failure = run.stopFor(error);
    }
    const unusable = failure === undefined ? rejection : describe(failure);
    await this.recordCall(run, call, attempts, discarded, answer ? undefined : unusable);
    if (answer) return answer.value;
    throw failure ?? new StudyReplyError(call, rejection ?? 'no reply');
  }

  private async recordCall(
    run: StudyRun,
    call: StudyCall<unknown>,
    attempts: AnsweredAttempt[],
    discarded: DiscardedAnswer[],
    failed: string | undefined
  ): Promise<void> {
    const settled = settleAttempts(attempts, discarded);
    for (const answer of settled.discarded) {
      await run.record('provider.answer_discarded', {
        provider: answer.provider,
        model: answer.model,
        ...(answer.requestedModel ? { requestedModel: answer.requestedModel } : {}),
        usage: answer.usage,
        reason: answer.reason,
      });
    }
    if (settled.usage.calls === 0) return;
    await run.record('study.model_called', {
      purpose: call.purpose,
      ...(call.passage ? { passage: call.passage } : {}),
      ...(settled.model ? { model: settled.model } : {}),
      ...(settled.requestedModel ? { requestedModel: settled.requestedModel } : {}),
      usage: settled.usage,
      ...(failed ? { failed: truncate(failed) } : {}),
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
