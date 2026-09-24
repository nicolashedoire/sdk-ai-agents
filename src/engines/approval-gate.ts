import { PolicyViolationError } from '../errors/index.js';
import type { ApprovalManager } from '../managers/approval-manager.js';
import type { Event } from '../types/events.js';
import type { ActionContext, Intention } from '../types/run.js';

export interface ApprovalGateDependencies {
  manager?: ApprovalManager;
  /** Records an event of the call's run. */
  log: (type: Event['type'], data: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Waits for a human decision on an intention. Fails closed: without an approval manager,
 * on rejection, or when the caller gives up (abort signal), the action is refused.
 */
export async function awaitApproval(
  deps: ApprovalGateDependencies,
  intention: Intention,
  context: ActionContext,
  policyId: string,
  reason: string | undefined
): Promise<void> {
  if (!deps.manager) {
    await deps.log('policy.violated', {
      intention,
      reason: 'approval required but no approval manager is configured',
      violatedPolicies: [policyId],
    });
    throw new PolicyViolationError(policyId, intention, 'approval required');
  }
  const manager = deps.manager;
  const { approvalId, waitForApproval } = await manager.requestApproval(
    context.runId,
    context.agentId,
    intention,
    policyId
  );
  await deps.log('approval.requested', {
    approvalId,
    intention,
    policyId,
    reason,
  });

  // Nobody may approve an action whose caller is gone: the approval is cancelled when the
  // caller aborts, and after `approvalTimeoutMs` without a decision.
  const signal = context.abortSignal;
  let cancelled: string | undefined;
  const cancel = (why: string) => {
    cancelled ??= why;
    manager.cancel(approvalId);
  };
  const cancelOnAbort = () => cancel('cancelled before a decision');
  signal?.addEventListener('abort', cancelOnAbort, { once: true });
  if (signal?.aborted) {
    cancelOnAbort();
  }
  const timeoutMs = context.approvalTimeoutMs;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => cancel(`no decision within ${timeoutMs} ms`), timeoutMs);
  let approved: boolean;
  try {
    approved = await waitForApproval;
  } catch {
    // Cancelled here, or by `stopRun` (the run was stopped).
    approved = false;
    cancelled ??= 'cancelled before a decision';
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort);
    clearTimeout(timer);
  }

  if (approved) {
    await deps.log('approval.approved', { approvalId, intention, policyId });
    return;
  }
  await deps.log('approval.rejected', {
    approvalId,
    intention,
    policyId,
    ...(cancelled ? { reason: cancelled } : {}),
  });
  throw new PolicyViolationError(
    policyId,
    intention,
    cancelled ? `Approval ${cancelled}` : reason || 'Approval rejected'
  );
}
