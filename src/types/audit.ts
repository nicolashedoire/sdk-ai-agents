import type { Policy, PolicyValidationResult } from './policy.js';
import type { Intention } from './run.js';

export interface PolicyAuditEntry {
  id: string;
  runId: string;
  agentId: string;
  timestamp: number;
  policyId: string;
  policyType: Policy['type'];
  intention: Intention;
  conditionEvaluated?: {
    condition: string | unknown;
    result: boolean;
  };
  validationResult: PolicyValidationResult;
  applied: boolean;
  reason?: string;
}

export interface PolicyAuditTrail {
  runId: string;
  agentId: string;
  entries: PolicyAuditEntry[];
  summary: {
    totalEvaluations: number;
    policiesApplied: number;
    policiesViolated: number;
    approvalsRequired: number;
    policiesAllowed: number;
  };
}
