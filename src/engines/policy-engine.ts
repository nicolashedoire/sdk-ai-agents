import type {
  Policy,
  PolicyContext,
  PolicyValidationResult,
  PolicyRule,
  BudgetLimit,
  ConditionExpression,
} from '../types/policy.js';
import type { Intention } from '../types/run.js';
import type { BudgetTracker } from '../managers/budget-tracker.js';
import type { PolicyAuditEntry } from '../types/audit.js';
import type { IEventStore } from '../stores/event-store.js';
import { ConditionEvaluator } from '../evaluators/condition-evaluator.js';
import { generateEventId } from '../utils/id.js';

/**
 * Rule conditions that name a built-in check rather than a field to evaluate. They must not
 * go through the generic condition evaluator, which would read them as missing fields.
 */
const BUILT_IN_CONDITIONS = new Set([
  'maxSteps',
  'maxTokens',
  'budgetLimit',
  'maxDuration',
  'allowedTools',
]);

export class PolicyEngine {
  private globalPolicies: Map<string, Policy> = new Map();
  private agentPolicies: Map<string, Map<string, Policy>> = new Map();
  private budgetTracker?: BudgetTracker;
  private conditionEvaluator: ConditionEvaluator;
  private eventStore?: IEventStore;
  private auditEntries: Map<string, PolicyAuditEntry[]> = new Map();

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator();
  }

  setEventStore(eventStore: IEventStore): void {
    this.eventStore = eventStore;
  }

  setBudgetTracker(tracker: BudgetTracker): void {
    this.budgetTracker = tracker;
  }

  applyGlobalPolicy(policy: Policy): void {
    if (!policy.enabled) return;
    this.globalPolicies.set(policy.id, policy);
  }

  applyAgentPolicy(agentId: string, policy: Policy): void {
    if (!policy.enabled) return;

    if (!this.agentPolicies.has(agentId)) {
      this.agentPolicies.set(agentId, new Map());
    }

    this.agentPolicies.get(agentId)?.set(policy.id, policy);
  }

  getActivePolicies(agentId: string): Policy[] {
    const policies: Policy[] = [];

    for (const policy of this.globalPolicies.values()) {
      if (policy.enabled) {
        policies.push(policy);
      }
    }

    const agentPolicyMap = this.agentPolicies.get(agentId);
    if (agentPolicyMap) {
      for (const policy of agentPolicyMap.values()) {
        if (policy.enabled) {
          policies.push(policy);
        }
      }
    }

    return policies;
  }

  async validate(intention: Intention, context: PolicyContext): Promise<PolicyValidationResult> {
    const policies = this.getActivePolicies(context.agentId);
    const violatedPolicies: string[] = [];
    const approvalRequiredPolicies: Array<{ policyId: string; rule: PolicyRule }> = [];

    for (const policy of policies) {
      // Evaluate conditions and log audit entry
      const conditionResult = this.evaluatePolicyConditions(policy, intention, context);

      // Log audit entry for this policy evaluation
      await this.logPolicyAudit(policy, intention, context, conditionResult);

      // Skip policy if conditions not met
      if (!conditionResult.conditionsMet) {
        continue;
      }

      const result = await this.validatePolicy(policy, intention, context);
      if (!result.allowed) {
        violatedPolicies.push(policy.id);
      }

      // Check if any rule requires approval
      for (const rule of policy.rules) {
        if (
          rule.action === 'require_approval' &&
          this.ruleMatches(rule, policy, intention, context)
        ) {
          approvalRequiredPolicies.push({ policyId: policy.id, rule });
        }
      }
    }

    // If approval is required, return requiresApproval
    if (approvalRequiredPolicies.length > 0) {
      return {
        allowed: false,
        requiresApproval: true,
        violatedPolicies: [approvalRequiredPolicies[0].policyId],
        reason: `Approval required by policy: ${approvalRequiredPolicies[0].policyId}`,
      };
    }

    if (violatedPolicies.length === 0) {
      return { allowed: true };
    }

    return this.createViolationResult(intention, policies, violatedPolicies);
  }

  /**
   * Evaluates policy conditions and returns evaluation result.
   */
  private evaluatePolicyConditions(
    policy: Policy,
    intention: Intention,
    context: PolicyContext
  ): {
    conditionsMet: boolean;
    evaluatedConditions: Array<{ condition: unknown; result: boolean }>;
  } {
    const evaluatedConditions: Array<{ condition: unknown; result: boolean }> = [];

    for (const rule of policy.rules) {
      let conditionResult = true;

      if (typeof rule.condition !== 'string' || this.isConditionExpression(rule.condition)) {
        const conditionExpr =
          typeof rule.condition === 'string'
            ? this.parseConditionExpression(rule.condition)
            : (rule.condition as ConditionExpression);

        if (conditionExpr) {
          conditionResult = this.conditionEvaluator.evaluate(conditionExpr, intention, context);
          evaluatedConditions.push({ condition: conditionExpr, result: conditionResult });
        }
      } else if (!BUILT_IN_CONDITIONS.has(rule.condition)) {
        // Simple string condition (skip built-in conditions)
        conditionResult = this.conditionEvaluator.evaluate(rule.condition, intention, context);
        evaluatedConditions.push({ condition: rule.condition, result: conditionResult });
      }

      // If any condition fails, policy doesn't apply
      if (!conditionResult) {
        return { conditionsMet: false, evaluatedConditions };
      }
    }

    return { conditionsMet: true, evaluatedConditions };
  }

  /**
   * Logs a policy audit entry.
   */
  private async logPolicyAudit(
    policy: Policy,
    intention: Intention,
    context: PolicyContext,
    conditionResult: {
      conditionsMet: boolean;
      evaluatedConditions: Array<{ condition: unknown; result: boolean }>;
    }
  ): Promise<void> {
    const validationResult = await this.validatePolicy(policy, intention, context);

    const auditEntry: PolicyAuditEntry = {
      id: generateEventId(),
      runId: context.runId,
      agentId: context.agentId,
      timestamp: Date.now(),
      policyId: policy.id,
      policyType: policy.type,
      intention,
      conditionEvaluated:
        conditionResult.evaluatedConditions.length > 0
          ? {
              condition: conditionResult.evaluatedConditions[0].condition,
              result: conditionResult.evaluatedConditions[0].result,
            }
          : undefined,
      validationResult,
      applied: conditionResult.conditionsMet && !validationResult.allowed,
      reason: validationResult.reason,
    };

    // Store in memory
    const entries = this.auditEntries.get(context.runId) ?? [];
    entries.push(auditEntry);
    this.auditEntries.set(context.runId, entries);

    // Log to event store if available
    if (this.eventStore) {
      await this.eventStore.append(context.runId, {
        id: auditEntry.id,
        runId: context.runId,
        type: 'policy.checked',
        timestamp: auditEntry.timestamp,
        data: {
          policyId: policy.id,
          policyType: policy.type,
          intention,
          conditionEvaluated: auditEntry.conditionEvaluated,
          validationResult,
          applied: auditEntry.applied,
          reason: auditEntry.reason,
        },
        metadata: {
          agentId: context.agentId,
        },
      });
    }
  }

  /**
   * Gets the audit trail for a specific run.
   */
  getAuditTrail(runId: string): PolicyAuditEntry[] {
    return this.auditEntries.get(runId) || [];
  }

  /**
   * Clears audit entries for a run (useful for cleanup).
   */
  clearAuditTrail(runId: string): void {
    this.auditEntries.delete(runId);
  }

  /**
   * Checks if a rule matches the current intention and context.
   */
  private ruleMatches(
    rule: PolicyRule,
    policy: Policy,
    intention: Intention,
    context: PolicyContext
  ): boolean {
    // Evaluate condition expression if present
    if (typeof rule.condition !== 'string' || this.isConditionExpression(rule.condition)) {
      const conditionExpr =
        typeof rule.condition === 'string'
          ? this.parseConditionExpression(rule.condition)
          : (rule.condition as ConditionExpression);

      if (conditionExpr) {
        const matches = this.conditionEvaluator.evaluate(conditionExpr, intention, context);
        if (!matches) {
          return false;
        }
      }
    } else if (!BUILT_IN_CONDITIONS.has(rule.condition)) {
      // Simple string condition (built-in rules are checked by their policy type)
      if (!this.conditionEvaluator.evaluate(rule.condition, intention, context)) {
        return false;
      }
    }

    // For allowlist policies, check if tool is in the list
    if (policy.type === 'allowlist' && rule.condition === 'allowedTools') {
      const allowedTools = rule.metadata?.tools as string[] | undefined;
      if (allowedTools && intention.toolName) {
        return allowedTools.includes(intention.toolName);
      }
    }

    // For custom policies, use the validator
    if (policy.type === 'custom') {
      const validator = rule.metadata?.validator as
        | ((intention: Intention, context: PolicyContext) => boolean)
        | undefined;
      if (validator) {
        return validator(intention, context);
      }
    }

    // Default: rule matches if condition is met
    return true;
  }

  private createViolationResult(
    intention: Intention,
    policies: Policy[],
    violatedPolicies: string[]
  ): PolicyValidationResult {
    const firstPolicy = policies.find((p) => p.id === violatedPolicies[0]);
    const reason = this.getViolationReason(intention, firstPolicy, violatedPolicies);

    return {
      allowed: false,
      reason,
      violatedPolicies,
    };
  }

  private getViolationReason(
    intention: Intention,
    policy: Policy | undefined,
    violatedPolicies: string[]
  ): string {
    if (policy?.type === 'allowlist' && intention.type === 'tool_call' && intention.toolName) {
      return `Tool "${intention.toolName}" not in allowlist`;
    }

    return `Violated policies: ${violatedPolicies.join(', ')}`;
  }

  private async validatePolicy(
    policy: Policy,
    intention: Intention,
    context: PolicyContext
  ): Promise<PolicyValidationResult> {
    // Check if policy rules have conditions - evaluate them first
    const applicableRules = policy.rules.filter((rule) => {
      if (typeof rule.condition === 'string' && this.isConditionExpression(rule.condition)) {
        const conditionExpr = this.parseConditionExpression(rule.condition);
        if (conditionExpr) {
          return this.conditionEvaluator.evaluate(conditionExpr, intention, context);
        }
      } else if (typeof rule.condition !== 'string') {
        // ConditionExpression object
        return this.conditionEvaluator.evaluate(rule.condition, intention, context);
      } else if (BUILT_IN_CONDITIONS.has(rule.condition)) {
        // Built-in rules (maxSteps, allowedTools...) always apply; their policy type checks them.
        return true;
      } else {
        // Simple string condition
        return this.conditionEvaluator.evaluate(rule.condition, intention, context);
      }
      return true; // No condition or condition evaluation failed, apply rule by default
    });

    // If no rules are applicable due to conditions, allow the action
    if (applicableRules.length === 0 && policy.rules.length > 0) {
      return { allowed: true };
    }

    // Create a temporary policy with only applicable rules for validation
    const applicablePolicy: Policy = {
      ...policy,
      rules: applicableRules.length > 0 ? applicableRules : policy.rules,
    };

    switch (applicablePolicy.type) {
      case 'budget':
        return await this.validateBudgetPolicy(applicablePolicy, context);

      case 'timeout':
        return this.validateTimeoutPolicy(applicablePolicy, context);

      case 'allowlist':
        return this.validateAllowlistPolicy(applicablePolicy, intention);

      case 'custom':
        return this.validateCustomPolicy(applicablePolicy, intention, context);

      default:
        return { allowed: true };
    }
  }

  /**
   * Checks if a string is a condition expression (JSON format).
   */
  private isConditionExpression(condition: string): boolean {
    try {
      const parsed = JSON.parse(condition);
      return typeof parsed === 'object' && parsed !== null && 'type' in parsed;
    } catch {
      return false;
    }
  }

  /**
   * Parses a condition expression from string.
   */
  private parseConditionExpression(condition: string): ConditionExpression | null {
    try {
      return JSON.parse(condition) as ConditionExpression;
    } catch {
      return null;
    }
  }

  private async validateBudgetPolicy(
    policy: Policy,
    context: PolicyContext
  ): Promise<PolicyValidationResult> {
    // Check basic budget rules (maxSteps, maxTokens)
    for (const rule of policy.rules) {
      if (rule.condition === 'maxSteps') {
        const violation = this.checkMaxSteps(rule, context, policy.id);
        if (violation) return violation;
      }

      if (rule.condition === 'maxTokens') {
        const violation = this.checkMaxTokens(rule, context, policy.id);
        if (violation) return violation;
      }
    }

    // Check complex budget rules (per tool, per agent, per period)
    if (this.budgetTracker) {
      for (const rule of policy.rules) {
        if (rule.condition === 'budgetLimit') {
          const violation = await this.checkBudgetLimit(rule, context, policy.id);
          if (violation) return violation;
        }
      }
    }

    return { allowed: true };
  }

  private async checkBudgetLimit(
    rule: PolicyRule,
    context: PolicyContext,
    policyId: string
  ): Promise<PolicyValidationResult | null> {
    if (!this.budgetTracker) {
      return null;
    }

    const budgetLimit = rule.metadata?.budgetLimit as BudgetLimit | undefined;
    if (!budgetLimit) {
      return null;
    }

    // If agentId is specified in limit, it must match context
    if (budgetLimit.agentId && budgetLimit.agentId !== context.agentId) {
      return null; // This limit doesn't apply to this agent
    }

    // If toolName is specified in limit, check if it matches the intention
    if (budgetLimit.toolName && context.intention?.toolName !== budgetLimit.toolName) {
      return null; // This limit doesn't apply to this tool
    }

    // Calculate additional usage for this action
    const additionalTokens = context.tokensUsed || 0;
    const additionalToolCalls = context.intention?.toolName ? 1 : 0;

    const checkResult = await this.budgetTracker.checkBudget(
      budgetLimit,
      additionalTokens,
      additionalToolCalls
    );

    if (checkResult.wouldExceed) {
      return {
        allowed: false,
        reason: checkResult.reason || 'Budget limit exceeded',
        violatedPolicies: [policyId],
      };
    }

    return null;
  }

  private checkMaxSteps(
    rule: Policy['rules'][0],
    context: PolicyContext,
    policyId: string
  ): PolicyValidationResult | null {
    const maxSteps = rule.metadata?.value as number | undefined;
    if (maxSteps && context.currentStep >= maxSteps) {
      return {
        allowed: false,
        reason: `Max steps (${maxSteps}) exceeded`,
        violatedPolicies: [policyId],
      };
    }
    return null;
  }

  private checkMaxTokens(
    rule: Policy['rules'][0],
    context: PolicyContext,
    policyId: string
  ): PolicyValidationResult | null {
    const maxTokens = rule.metadata?.value as number | undefined;
    if (maxTokens && context.tokensUsed >= maxTokens) {
      return {
        allowed: false,
        reason: `Max tokens (${maxTokens}) exceeded`,
        violatedPolicies: [policyId],
      };
    }
    return null;
  }

  private validateTimeoutPolicy(policy: Policy, context: PolicyContext): PolicyValidationResult {
    for (const rule of policy.rules) {
      if (rule.condition === 'maxDuration') {
        const violation = this.checkMaxDuration(rule, context, policy.id);
        if (violation) return violation;
      }
    }

    return { allowed: true };
  }

  private checkMaxDuration(
    rule: Policy['rules'][0],
    context: PolicyContext,
    policyId: string
  ): PolicyValidationResult | null {
    const maxDuration = rule.metadata?.value as number | undefined;
    if (!maxDuration) return null;

    const elapsed = Date.now() - context.startTime;
    if (elapsed >= maxDuration) {
      return {
        allowed: false,
        reason: `Timeout (${maxDuration}ms) exceeded`,
        violatedPolicies: [policyId],
      };
    }

    return null;
  }

  private validateAllowlistPolicy(policy: Policy, intention: Intention): PolicyValidationResult {
    if (intention.type !== 'tool_call' || !intention.toolName) {
      return { allowed: true };
    }

    for (const rule of policy.rules) {
      if (rule.condition === 'allowedTools') {
        const violation = this.checkAllowedTools(rule, intention.toolName, policy.id);
        if (violation) return violation;
      }
    }

    return { allowed: true };
  }

  private checkAllowedTools(
    rule: Policy['rules'][0],
    toolName: string,
    policyId: string
  ): PolicyValidationResult | null {
    const allowedTools = rule.metadata?.tools as string[] | undefined;
    if (allowedTools && !allowedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" not in allowlist`,
        violatedPolicies: [policyId],
      };
    }
    return null;
  }

  private validateCustomPolicy(
    policy: Policy,
    intention: Intention,
    context: PolicyContext
  ): PolicyValidationResult {
    for (const rule of policy.rules) {
      const violation = this.checkCustomRule(rule, intention, context, policy.id);
      if (violation) return violation;
    }

    return { allowed: true };
  }

  private checkCustomRule(
    rule: Policy['rules'][0],
    intention: Intention,
    context: PolicyContext,
    policyId: string
  ): PolicyValidationResult | null {
    const validator = rule.metadata?.validator as
      | ((intention: Intention, context: PolicyContext) => boolean)
      | undefined;

    if (!validator) return null;

    const isValid = validator(intention, context);
    if (!isValid && rule.action === 'deny') {
      return {
        allowed: false,
        reason: (rule.metadata?.reason as string) || 'Custom policy violation',
        violatedPolicies: [policyId],
      };
    }

    return null;
  }

  clearGlobalPolicies(): void {
    this.globalPolicies.clear();
  }

  clearAgentPolicies(agentId: string): void {
    this.agentPolicies.delete(agentId);
  }
}
