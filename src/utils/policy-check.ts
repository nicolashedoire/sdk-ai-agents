/** What a `policy.checked` event says about the check it records. */
export interface PolicyCheckOutcome {
  /** The policy checked (or the rule, in events written by your own code). */
  rule: string;
  result: 'allowed' | 'denied' | 'requires_approval';
  reason?: string;
  /**
   * `policy` for the policy engine's event about one policy; `verdict` for a check as a whole
   * (the action engine's event about a tool call, or an event written by your own code).
   */
  level: 'policy' | 'verdict';
  /** Type of the intention checked, when recorded (`tool_call`, `continue` for a step). */
  intentionType?: string;
}

/**
 * Reads a `policy.checked` event, whichever wrote it:
 * - the policy engine, one event per policy it checks: `policyId`, `validationResult` and
 *   `applied`, true only when the policy applied and refused (a policy whose conditions do not
 *   hold did not refuse anything, whatever its `validationResult` says);
 * - the action engine, one event per tool call: `validation`, the verdict of every policy;
 * - your own code, in the flat shape the analyzers always read: `rule`, `allowed`,
 *   `requiresApproval`, `reason`.
 */
export function readPolicyCheck(data: Record<string, unknown>): PolicyCheckOutcome {
  const policyId = typeof data.policyId === 'string' ? data.policyId : undefined;
  const flatRule = typeof data.rule === 'string' ? data.rule : undefined;
  const reason = typeof data.reason === 'string' ? data.reason : undefined;
  const intentionType = record(data.intention)?.type;
  const intention = typeof intentionType === 'string' ? { intentionType } : {};

  if (typeof data.applied === 'boolean') {
    return {
      rule: flatRule ?? policyId ?? 'unknown',
      result: data.applied ? 'denied' : 'allowed',
      ...(data.applied && reason ? { reason } : {}),
      level: 'policy',
      ...intention,
    };
  }

  const validation = record(data.validation);
  if (validation) {
    const violated = Array.isArray(validation.violatedPolicies)
      ? validation.violatedPolicies.find((id): id is string => typeof id === 'string')
      : undefined;
    const why = typeof validation.reason === 'string' ? validation.reason : undefined;
    return {
      rule: flatRule ?? violated ?? 'unknown',
      result:
        validation.requiresApproval === true
          ? 'requires_approval'
          : validation.allowed === true
            ? 'allowed'
            : 'denied',
      ...(why ? { reason: why } : {}),
      level: 'verdict',
      ...intention,
    };
  }

  return {
    rule: flatRule ?? policyId ?? 'unknown',
    result: data.requiresApproval ? 'requires_approval' : data.allowed ? 'allowed' : 'denied',
    ...(reason ? { reason } : {}),
    level: 'verdict',
    ...intention,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
