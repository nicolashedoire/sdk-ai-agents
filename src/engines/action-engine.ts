import { PolicyViolationError, ToolExecutionError, ValidationError } from '../errors/index.js';
import type { ApprovalManager } from '../managers/approval-manager.js';
import type { BudgetTracker } from '../managers/budget-tracker.js';
import type { ToolRegistry } from '../registry/tool-registry.js';
import type { IEventStore } from '../stores/event-store.js';
import type { ActionContext, ActionResult, Intention } from '../types/run.js';
import type { Event } from '../types/events.js';
import type { ToolResult } from '../types/tool.js';
import { withRetry } from '../resilience/retry.js';
import { generateEventId } from '../utils/id.js';
import { type ApprovalGateDependencies, awaitApproval } from './approval-gate.js';
import type { PolicyEngine } from './policy-engine.js';

/** Policy id recorded for approvals required by a tool's own `metadata.requiresApproval`. */
export const TOOL_APPROVAL_POLICY = 'tool-requires-approval';

export class ActionEngine {
  constructor(
    private policyEngine: PolicyEngine,
    private toolRegistry: ToolRegistry,
    private eventStore: IEventStore,
    private approvalManager?: ApprovalManager,
    private budgetTracker?: BudgetTracker
  ) {}

  async executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult> {
    await this.logEvent(context, 'action.executing', { intention });

    if (intention.type === 'tool_call' && intention.toolName) {
      return await this.executeToolCall(intention, context);
    }

    if (intention.type === 'final_answer') {
      await this.logEvent(context, 'action.executed', {
        intention,
        result: intention.reasoning,
      });
      return {
        success: true,
        result: intention.reasoning,
        events: [],
      };
    }

    await this.logEvent(context, 'action.executed', { intention });
    return {
      success: true,
      result: null,
      events: [],
    };
  }

  private async executeToolCall(
    intention: Intention,
    context: ActionContext
  ): Promise<ActionResult> {
    await this.enforceAllowedTools(intention, context);
    // Arguments first: an invalid call is refused before any policy, approval or budget.
    await this.validateArguments(intention, context);
    await this.validatePolicy(intention, context);
    // The caller may have given up while a policy or an approval was pending.
    await this.refuseIfAborted(intention, context);
    await this.admitToBudget(intention, context);

    const startTime = Date.now();

    try {
      const called = await this.logEvent(context, 'tool.called', {
        toolName: intention.toolName,
        parameters: intention.parameters,
      });

      if (!intention.toolName) {
        throw new Error('Tool name is required for tool_call intention');
      }

      const result = await this.executeWithRetry(
        intention.toolName,
        intention.parameters || {},
        context
      );

      const duration = Date.now() - startTime;
      const executed = await this.logEvent(context, 'action.executed', {
        toolName: intention.toolName,
        parameters: intention.parameters,
        result: result.result,
        duration,
      });

      return {
        success: true,
        result: result.result,
        events: [called, executed],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logEvent(context, 'action.failed', {
        toolName: intention.toolName,
        parameters: intention.parameters,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      if (error instanceof PolicyViolationError) {
        throw error;
      }

      throw new ToolExecutionError(
        intention.toolName || 'unknown',
        error instanceof Error ? error : new Error(String(error)),
        intention.parameters
      );
    }
  }

  /** Refuses arguments that do not match the tool's schema, before anything else runs. */
  private async validateArguments(intention: Intention, context: ActionContext): Promise<void> {
    const name = intention.toolName ?? '';
    const invalid = this.toolRegistry.validateParameters(name, intention.parameters ?? {});
    if (!invalid) return;
    await this.logEvent(context, 'action.failed', {
      toolName: name,
      parameters: intention.parameters,
      error: invalid.message,
      duration: 0,
    });
    throw new ToolExecutionError(name, invalid, intention.parameters);
  }

  private async refuseIfAborted(intention: Intention, context: ActionContext): Promise<void> {
    if (!context.abortSignal?.aborted) return;
    const reason = 'the caller gave up before the tool ran';
    await this.logEvent(context, 'action.failed', {
      toolName: intention.toolName,
      parameters: intention.parameters,
      error: reason,
      duration: 0,
    });
    throw new ToolExecutionError(
      intention.toolName ?? 'unknown',
      new Error(reason),
      intention.parameters
    );
  }

  /**
   * Counts the call against every applicable call budget, and refuses it if one is spent —
   * checked and counted in one synchronous step, so concurrent calls cannot all get through.
   */
  private async admitToBudget(intention: Intention, context: ActionContext): Promise<void> {
    if (!this.budgetTracker || !intention.toolName) return;
    const refusal = this.budgetTracker.admitToolCall(
      context.agentId,
      intention.toolName,
      this.policyEngine.toolCallLimits(context.agentId, intention.toolName)
    );
    if (!refusal) return;
    await this.logEvent(context, 'policy.violated', {
      intention,
      reason: refusal.reason,
      violatedPolicies: [refusal.policyId],
    });
    throw new PolicyViolationError(refusal.policyId, intention, refusal.reason);
  }

  /** Denies tools outside the caller's allowlist, before any policy or execution. */
  private async enforceAllowedTools(intention: Intention, context: ActionContext): Promise<void> {
    if (!context.allowedTools || context.allowedTools.includes(intention.toolName ?? '')) {
      return;
    }
    const reason = `tool "${intention.toolName}" is not available to this caller`;
    await this.logEvent(context, 'policy.violated', {
      intention,
      reason,
      violatedPolicies: ['allowed-tools'],
    });
    throw new PolicyViolationError('allowed-tools', intention, reason);
  }

  /** Executes a tool, retrying tool errors when the tool declares a retry policy. */
  private async executeWithRetry(
    toolName: string,
    parameters: Record<string, unknown>,
    context: ActionContext
  ): Promise<ToolResult> {
    const execute = () =>
      this.toolRegistry.executeTool(toolName, parameters, undefined, {
        runId: context.runId,
        agentId: context.agentId,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
    const retry = this.toolRegistry.getTool(toolName)?.retry;
    if (!retry || retry.maxRetries <= 0) {
      return await execute();
    }
    return await withRetry(
      execute,
      {
        maxRetries: retry.maxRetries,
        initialDelayMs: retry.initialDelayMs ?? 200,
        maxDelayMs: retry.maxDelayMs ?? 5_000,
        // Invalid arguments never succeed on a second try; the tool may narrow the rest.
        retryOn: (error) =>
          error instanceof ToolExecutionError &&
          !(error.originalError instanceof ValidationError) &&
          (retry.retryOn ? retry.retryOn(error.originalError) : true),
      },
      {
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
        onRetry: async (info) => {
          await this.logEvent(context, 'tool.retry', {
            toolName,
            retry: info.retry,
            delayMs: info.delayMs,
            error: info.error instanceof Error ? info.error.message : String(info.error),
          });
        },
      }
    );
  }

  private async validatePolicy(intention: Intention, context: ActionContext): Promise<void> {
    const policyContext = {
      runId: context.runId,
      agentId: context.agentId,
      currentStep: 0,
      tokensUsed: 0,
      startTime: Date.now(),
      intention: {
        type: intention.type,
        toolName: intention.toolName,
        parameters: intention.parameters,
      },
    };

    const validation = await this.policyEngine.validate(intention, policyContext);

    await this.logEvent(context, 'policy.checked', {
      intention,
      validation,
    });

    if (!validation.allowed) {
      // Check if approval is required
      if (validation.requiresApproval && this.approvalManager) {
        await awaitApproval(
          this.approvalGate(context),
          intention,
          context,
          validation.violatedPolicies?.[0] || 'unknown',
          validation.reason
        );
        return;
      }

      // No approval manager or not requires approval - treat as violation
      await this.logEvent(context, 'policy.violated', {
        intention,
        reason: validation.reason,
        violatedPolicies: validation.violatedPolicies,
      });

      throw new PolicyViolationError(
        validation.violatedPolicies?.[0] || 'unknown',
        intention,
        validation.reason || 'Policy violation'
      );
    }

    // A tool marked `requiresApproval` waits for a human even when every policy allows it.
    // A replay does not ask again: whoever starts a replay decides to re-run its actions.
    const tool = intention.toolName ? this.toolRegistry.getTool(intention.toolName) : null;
    if (tool?.metadata?.requiresApproval && context.mode !== 'replay') {
      await awaitApproval(
        this.approvalGate(context),
        intention,
        context,
        TOOL_APPROVAL_POLICY,
        `Tool "${tool.name}" requires approval`
      );
    }
  }

  private approvalGate(context: ActionContext): ApprovalGateDependencies {
    return {
      ...(this.approvalManager ? { manager: this.approvalManager } : {}),
      log: (type, data) => this.logEvent(context, type, data),
    };
  }

  /** Appends an event and returns it, so callers can reference what was recorded. */
  private async logEvent(
    context: ActionContext,
    type: Event['type'],
    data: Record<string, unknown>
  ): Promise<Event> {
    const event: Event = {
      id: generateEventId(),
      runId: context.runId,
      type,
      timestamp: Date.now(),
      data,
      metadata: {
        agentId: context.agentId,
      },
    };
    await this.eventStore.append(context.runId, event);
    return event;
  }
}
