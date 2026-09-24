/**
 * Started by `cognitive-budgets.test.ts`: two billed answers the event store cannot record —
 * an answer a provider discarded before it failed, and a typed decision whose answer was
 * rejected. The caller's error stays the provider's or the client's; the SDK says on stderr
 * what it could not record. Argument: a folder for the event store.
 */
import { DecisionService } from '../../decisions/decision-service.js';
import type {
  DecisionRequest,
  DecisionResponse,
  TypedDecisionClient,
  TypedQuestions,
} from '../../decisions/typed-decisions.js';
import { ReasoningEngine } from '../../engines/reasoning-engine.js';
import { DecisionClientError } from '../../errors/index.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../../providers/llm-provider.js';
import { FileEventStore } from '../../stores/file-event-store.js';
import type { Event } from '../../types/events.js';

const [folder] = process.argv.slice(2);
if (!folder) throw new Error('usage: unrecorded-billed-answers <folder>');

/** A store that cannot write the events of billed answers (a full disk, a failing database). */
class RefusingStore extends FileEventStore {
  override async append(runId: string, event: Event): Promise<void> {
    if (event.type === 'provider.answer_discarded' || event.type === 'decision.evaluated') {
      throw new Error(`cannot write ${event.type}`);
    }
    return super.append(runId, event);
  }
}

/** Reports an empty answer the vendor billed, then fails, as the OpenAI provider does. */
class DiscardingProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    request.onDiscardedAnswer?.({
      provider: 'test',
      model: 'test-model',
      usage: { promptTokens: 30, completionTokens: 0, totalTokens: 30 },
      reason: 'No response from LLM',
    });
    throw new Error('No response from LLM');
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'test';
  }
}

/** Answers, and bills, with an answer that does not match the questions. */
class RejectingClient implements TypedDecisionClient {
  readonly name = 'rejecting';

  async evaluate<Q extends TypedQuestions>(
    _request: DecisionRequest<Q>
  ): Promise<DecisionResponse<Q>> {
    throw new DecisionClientError('rejecting', 'answers do not match the questions', {
      retryable: false,
      billed: { model: 'jev-1.13.0', usage: { inputTokens: 10, outputTokens: 1 } },
    });
  }
}

const store = new RefusingStore(folder);
const engine = new ReasoningEngine(new DiscardingProvider(), 'test-model');
const step = engine.generateStep(
  {
    runId: 'run_discarded',
    agentId: 'agent',
    input: 'Hi',
    conversationHistory: [],
    availableTools: [],
  },
  store
);
await step.then(
  () => console.log('unexpected: the step succeeded'),
  (error: Error) => console.log(`step failed: ${error.message}`)
);
const decisions = new DecisionService(new RejectingClient(), store);
await decisions
  .check({ context: 'A refund', question: 'Is it a refund?', runId: 'run_rejected' })
  .then(
    () => console.log('unexpected: the decision succeeded'),
    (error: Error) => console.log(`decision failed: ${error.message}`)
  );
await store.destroy();
