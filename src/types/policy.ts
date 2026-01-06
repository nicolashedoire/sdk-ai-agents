export type PolicyType = 'budget' | 'timeout' | 'allowlist' | 'custom';

export interface PolicyRule {
  condition: string | ConditionExpression;
  action: 'allow' | 'deny' | 'require_approval';
  metadata?: Record<string, unknown>;
}

export interface ConditionExpression {
  type: 'condition' | 'and' | 'or' | 'not';
  conditions?: Array<{
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'contains' | 'matches' | 'exists';
    value: unknown;
  }>;
  expressions?: ConditionExpression[];
}

export interface BudgetLimit {
  agentId?: string;
  toolName?: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'all';
  maxTokens?: number;
  maxToolCalls?: number;
  maxCost?: number;
}

export interface Policy {
  id: string;
  type: PolicyType;
  rules: PolicyRule[];
  scope: 'global' | 'agent';
  agentId?: string;
  enabled: boolean;
}

export interface PolicyContext {
  runId: string;
  agentId: string;
  currentStep: number;
  tokensUsed: number;
  startTime: number;
  intention?: {
    type: string;
    toolName?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface PolicyValidationResult {
  allowed: boolean;
  requiresApproval?: boolean;
  approvalId?: string;
  reason?: string;
  violatedPolicies?: string[];
}
