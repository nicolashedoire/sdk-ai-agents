import type { ActionEngine } from '../engines/action-engine.js';
import type { ReasoningEngine } from '../engines/reasoning-engine.js';
import { PolicyViolationError, ToolExecutionError } from '../errors/index.js';
import type { IEventStore } from '../stores/event-store.js';
import type { ProviderSettings } from '../types/agent.js';
import type { Tool } from '../types/tool.js';
import { nextUnknownToInvestigate } from './cognitive-operations.js';
import type { ThoughtGenerator } from './llm-thought-generator.js';
import { thoughtPatchSchema, type MentalState } from './mental-state.js';
import { failureOutcome, toError, truncate, type OperationOutcome } from './operation-outcome.js';
import type { ThinkerProfile } from './thinker-profile.js';

export interface InformationSeekerDependencies {
  agentId: string;
  model: string;
  tools: Tool[];
  reasoningEngine: ReasoningEngine;
  actionEngine: ActionEngine;
  eventStore: IEventStore;
  generator: ThoughtGenerator;
  systemPrompt?: string;
  providerSettings?: {
    openai?: ProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings;
  };
}

/**
 * Performs `seek_information`: the native reasoning engine picks a tool for the next open
 * unknown, the governed ActionEngine executes it (policies, approvals and budgets apply)
 * and the thought generator integrates the observation into the mental state.
 */
export class InformationSeeker {
  constructor(private readonly deps: InformationSeekerDependencies) {}

  async investigate(input: {
    runId: string;
    state: MentalState;
    profile: ThinkerProfile;
    signal: AbortSignal;
  }): Promise<OperationOutcome> {
    const { runId, state, profile, signal } = input;
    const unknown = nextUnknownToInvestigate(state);
    if (!unknown) {
      return { failure: new Error('no open unknown to investigate') };
    }

    const intention = await this.deps.reasoningEngine.generateIntention(
      {
        runId,
        agentId: this.deps.agentId,
        input: `Find information that answers ${unknown.id}: ${unknown.question}`,
        conversationHistory: [],
        availableTools: this.deps.tools,
        model: this.deps.model,
        systemPrompt: [
          ...(this.deps.systemPrompt ? [this.deps.systemPrompt] : []),
          'You investigate one open question for a reasoning process. Call exactly one tool whose result helps answer it.',
          'If no tool can help, answer with one sentence explaining why instead of calling a tool.',
          `Overall goal: ${state.goal}`,
          `Known facts: ${state.facts.map((fact) => fact.statement).join(' | ') || 'none yet'}`,
        ].join('\n'),
        ...(this.deps.providerSettings ? { providerSettings: this.deps.providerSettings } : {}),
      },
      this.deps.eventStore,
      signal
    );

    if (intention.type !== 'tool_call' || !intention.toolName) {
      return {
        patch: thoughtPatchSchema.parse({
          summary: `No tool can answer ${unknown.id}`,
          addFailures: [
            {
              description: `No tool selected for ${unknown.id}: ${intention.reasoning ?? 'no explanation given'}`,
            },
          ],
          investigatedUnknownId: unknown.id,
        }),
      };
    }

    let result: unknown;
    try {
      const action = await this.deps.actionEngine.executeIntention(intention, {
        runId,
        agentId: this.deps.agentId,
        abortSignal: signal,
        allowedTools: this.deps.tools.map((tool) => tool.name),
      });
      result = action.result;
    } catch (error) {
      if (signal.aborted) throw error;
      return {
        // A denied call never ran, so it does not consume the tool budget.
        toolCalled: !(error instanceof PolicyViolationError),
        patch: thoughtPatchSchema.parse({
          summary: `Could not investigate ${unknown.id} with ${intention.toolName}`,
          addFailures: [{ description: describeActionError(error) }],
          investigatedUnknownId: unknown.id,
        }),
      };
    }

    try {
      const generated = await this.deps.generator.generate({
        runId,
        operation: 'integrate',
        state,
        profile,
        observation: {
          unknownId: unknown.id,
          toolName: intention.toolName,
          parameters: intention.parameters ?? {},
          result,
        },
        abortSignal: signal,
      });
      return {
        toolCalled: true,
        patch: { ...generated.patch, investigatedUnknownId: unknown.id },
        ignoredFields: generated.ignoredFields,
        ...(generated.model ? { model: generated.model } : {}),
        ...(generated.requestedModel ? { requestedModel: generated.requestedModel } : {}),
        ...(generated.usage ? { usage: generated.usage } : {}),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return { ...failureOutcome(error), toolCalled: true, investigatedUnknownId: unknown.id };
    }
  }
}

function describeActionError(error: unknown): string {
  if (error instanceof PolicyViolationError) {
    return truncate(`blocked by policy ${error.policyId}: ${error.reason}`);
  }
  if (error instanceof ToolExecutionError) {
    return truncate(`tool ${error.toolName} failed: ${error.originalError.message}`);
  }
  return truncate(toError(error).message);
}
