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
      await this.logEvent(context, 'tool.called', {
        toolName: intention.toolName,
        parameters: intention.parameters,
      });

      if (!intention.toolName) {
        throw new Error('Tool name is required for tool_call intention');
      }

      const result = await this.executeWithRetry(intention.toolName, intention.parameters || {}, context);

      // Record tool call usage in budget tracker
      if (this.budgetTracker && intention.toolName) {
        await this.budgetTracker.recordToolCall(context.agentId, intention.toolName, Date.now());
      }

      const duration = Date.now() - startTime;
      await this.logEvent(context, 'action.executed', {
        toolName: intention.toolName,
        parameters: intention.parameters,
        result: result.result,
        duration,
      });

      return {
        success: true,
        result: result.result,
        events: [],
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
    const execute = () => this.toolRegistry.executeTool(toolName, parameters);
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
        onRetry: (info) =>
          this.logEvent(context, 'tool.retry', {
            toolName,
            retry: info.retry,
            delayMs: info.delayMs,
            error: info.error instanceof Error ? info.error.message : String(info.error),
          }),
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
        const { approvalId, waitForApproval } = await this.approvalManager.requestApproval(
          context.runId,
          context.agentId,
          intention,
          validation.violatedPolicies?.[0] || 'unknown'
        );

        await this.logEvent(context, 'approval.requested', {
          approvalId,
          intention,
          policyId: validation.violatedPolicies?.[0],
          reason: validation.reason,
        });

        // Wait for approval decision
        const approved = await waitForApproval;

        if (approved) {
          await this.logEvent(context, 'approval.approved', {
            approvalId,
            intention,
            policyId: validation.violatedPolicies?.[0],
          });
          // Approval granted, continue execution
          return;
        } else {
          await this.logEvent(context, 'approval.rejected', {
            approvalId,
            intention,
            policyId: validation.violatedPolicies?.[0],
          });
          // Approval rejected, throw error
          throw new PolicyViolationError(
            validation.violatedPolicies?.[0] || 'unknown',
            intention,
            validation.reason || 'Approval rejected'
          );
        }
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
  }

  private async logEvent(
    context: ActionContext,
    type: Event['type'],
    data: Record<string, unknown>
  ): Promise<void> {
    await this.eventStore.append(context.runId, {
      id: generateEventId(),
      runId: context.runId,
      type,
      timestamp: Date.now(),
      data,
      metadata: {
        agentId: context.agentId,
      },
    });
  }
}
