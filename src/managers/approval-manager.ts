import type { Intention } from '../types/run.js';

export interface ApprovalRequest {
  id: string;
  runId: string;
  agentId: string;
  intention: Intention;
  policyId: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  rejectedBy?: string;
  approvedAt?: number;
  rejectedAt?: number;
  reason?: string;
}

export class ApprovalManager {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalPromises: Map<
    string,
    {
      resolve: (approved: boolean) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  /**
   * Creates a new approval request and returns its ID.
   * Returns a promise that resolves when the approval is decided.
   */
  async requestApproval(
    runId: string,
    agentId: string,
    intention: Intention,
    policyId: string
  ): Promise<{ approvalId: string; waitForApproval: Promise<boolean> }> {
    const approvalId = `${runId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const approvalRequest: ApprovalRequest = {
      id: approvalId,
      runId,
      agentId,
      intention,
      policyId,
      requestedAt: Date.now(),
      status: 'pending',
    };

    this.pendingApprovals.set(approvalId, approvalRequest);

    // Create promise that will be resolved when approval is decided
    let resolveApproval!: (approved: boolean) => void;
    let rejectApproval!: (error: Error) => void;

    const approvalPromise = new Promise<boolean>((resolve, reject) => {
      resolveApproval = resolve;
      rejectApproval = reject;
    });

    this.approvalPromises.set(approvalId, {
      resolve: resolveApproval,
      reject: rejectApproval,
    });

    return {
      approvalId,
      waitForApproval: approvalPromise,
    };
  }

  /**
   * Approves a pending approval request.
   */
  approve(approvalId: string, approvedBy: string, reason?: string): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval request ${approvalId} is already ${approval.status}`);
    }

    approval.status = 'approved';
    approval.approvedBy = approvedBy;
    approval.approvedAt = Date.now();
    approval.reason = reason;

    const promiseHandlers = this.approvalPromises.get(approvalId);
    if (promiseHandlers) {
      promiseHandlers.resolve(true);
      this.approvalPromises.delete(approvalId);
    }
  }

  /**
   * Rejects a pending approval request.
   */
  reject(approvalId: string, rejectedBy: string, reason?: string): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Approval request ${approvalId} is already ${approval.status}`);
    }

    approval.status = 'rejected';
    approval.rejectedBy = rejectedBy;
    approval.rejectedAt = Date.now();
    approval.reason = reason;

    const promiseHandlers = this.approvalPromises.get(approvalId);
    if (promiseHandlers) {
      promiseHandlers.resolve(false);
      this.approvalPromises.delete(approvalId);
    }
  }

  /**
   * Gets a pending approval request by ID.
   */
  getApproval(approvalId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  /**
   * Gets all pending approval requests for a run.
   */
  getPendingApprovalsForRun(runId: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (approval) => approval.runId === runId && approval.status === 'pending'
    );
  }

  /**
   * Gets all pending approval requests.
   */
  getAllPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (approval) => approval.status === 'pending'
    );
  }

  /**
   * Cancels a pending approval request (e.g., when run is cancelled).
   */
  cancel(approvalId: string): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval && approval.status === 'pending') {
      approval.status = 'rejected';
      approval.rejectedAt = Date.now();
      approval.reason = 'Cancelled';

      const promiseHandlers = this.approvalPromises.get(approvalId);
      if (promiseHandlers) {
        promiseHandlers.reject(new Error('Approval request cancelled'));
        this.approvalPromises.delete(approvalId);
      }
    }
  }

  /**
   * Cancels all pending approvals for a run.
   */
  cancelAllForRun(runId: string): void {
    const approvals = this.getPendingApprovalsForRun(runId);
    for (const approval of approvals) {
      this.cancel(approval.id);
    }
  }
}
