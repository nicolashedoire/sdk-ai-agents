import { PolicyViolationError, ToolExecutionError } from '../errors/index.js';
import type { ApprovalManager } from '../managers/approval-manager.js';
import type { BudgetTracker } from '../managers/budget-tracker.js';
import type { ToolRegistry } from '../registry/tool-registry.js';
import type { IEventStore } from '../stores/event-store.js';
import type { ActionContext, ActionResult, Intention } from '../types/run.js';
import type { Event } from '../types/events.js';
import type { ToolResult } from '../types/tool.js';
import { withRetry } from '../resilience/retry.js';
import { generateEventId } from '../utils/id.js';
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
    await this.validatePolicy(intention, context);

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

      // Record tool call usage in budget tracker
      if (this.budgetTracker && intention.toolName) {
        await this.budgetTracker.recordToolCall(context.agentId, intention.toolName, Date.now());
      }

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
        retryOn: (error) => error instanceof ToolExecutionError,
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
        await this.awaitApproval(
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
    const tool = intention.toolName ? this.toolRegistry.getTool(intention.toolName) : null;
    if (tool?.metadata?.requiresApproval) {
      await this.awaitApproval(
        intention,
        context,
        TOOL_APPROVAL_POLICY,
        `Tool "${tool.name}" requires approval`
      );
    }
  }

  /**
   * Waits for a human decision on an intention. Fails closed: without an approval manager,
   * on rejection, or when the caller gives up (abort signal), the action is refused.
   */
  private async awaitApproval(
    intention: Intention,
    context: ActionContext,
    policyId: string,
    reason: string | undefined
  ): Promise<void> {
    if (!this.approvalManager) {
      await this.logEvent(context, 'policy.violated', {
        intention,
        reason: 'approval required but no approval manager is configured',
        violatedPolicies: [policyId],
      });
      throw new PolicyViolationError(policyId, intention, 'approval required');
    }
    const manager = this.approvalManager;
    const { approvalId, waitForApproval } = await manager.requestApproval(
      context.runId,
      context.agentId,
      intention,
      policyId
    );
    await this.logEvent(context, 'approval.requested', {
      approvalId,
      intention,
      policyId,
      reason,
    });

    const signal = context.abortSignal;
    const cancelOnAbort = () => manager.cancel(approvalId);
    signal?.addEventListener('abort', cancelOnAbort, { once: true });
    if (signal?.aborted) {
      cancelOnAbort();
    }
    let approved: boolean;
    try {
      approved = await waitForApproval;
    } catch {
      // Cancelled: the run was stopped or the caller (e.g. an MCP client) gave up waiting.
      approved = false;
    } finally {
      signal?.removeEventListener('abort', cancelOnAbort);
    }

    if (approved) {
      await this.logEvent(context, 'approval.approved', { approvalId, intention, policyId });
      return;
    }
    const cancelled = manager.getApproval(approvalId)?.reason === 'Cancelled';
    await this.logEvent(context, 'approval.rejected', {
      approvalId,
      intention,
      policyId,
      ...(cancelled ? { reason: 'cancelled before a decision' } : {}),
    });
    throw new PolicyViolationError(
      policyId,
      intention,
      cancelled ? 'Approval cancelled before a decision' : reason || 'Approval rejected'
    );
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
