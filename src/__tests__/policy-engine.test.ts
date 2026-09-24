import { describe, it, expect, beforeEach } from 'vitest'
import { PolicyEngine } from '../engines/policy-engine.js'
import { ValidationError } from '../errors/index.js'
import type { Policy, PolicyContext } from '../types/policy.js'
import type { Intention } from '../types/run.js'

describe('PolicyEngine', () => {
  let engine: PolicyEngine

  beforeEach(() => {
    engine = new PolicyEngine()
  })

  describe('applyGlobalPolicy', () => {
    it('should apply global policy', () => {
      const policy: Policy = {
        id: 'global-1',
        type: 'budget',
        rules: [],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)
      const policies = engine.getActivePolicies('agent-1')

      expect(policies).toHaveLength(1)
      expect(policies[0].id).toBe('global-1')
    })

    it('should not apply disabled policy', () => {
      const policy: Policy = {
        id: 'global-1',
        type: 'budget',
        rules: [],
        scope: 'global',
        enabled: false,
      }

      engine.applyGlobalPolicy(policy)
      const policies = engine.getActivePolicies('agent-1')

      expect(policies).toHaveLength(0)
    })
  })

  describe('applyAgentPolicy', () => {
    it('should apply agent-specific policy', () => {
      const policy: Policy = {
        id: 'agent-1',
        type: 'budget',
        rules: [],
        scope: 'agent',
        agentId: 'agent-1',
        enabled: true,
      }

      engine.applyAgentPolicy('agent-1', policy)
      const policies = engine.getActivePolicies('agent-1')

      expect(policies).toHaveLength(1)
      expect(policies[0].id).toBe('agent-1')
    })

    it('should not affect other agents', () => {
      const policy: Policy = {
        id: 'agent-1',
        type: 'budget',
        rules: [],
        scope: 'agent',
        agentId: 'agent-1',
        enabled: true,
      }

      engine.applyAgentPolicy('agent-1', policy)
      const policies = engine.getActivePolicies('agent-2')

      expect(policies).toHaveLength(0)
    })
  })

  describe('validate - Budget Policy', () => {
    it('should allow if within maxSteps', async () => {
      const policy: Policy = {
        id: 'budget-1',
        type: 'budget',
        rules: [
          {
            condition: 'maxSteps',
            action: 'deny',
            metadata: { value: 10 },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 5,
        tokensUsed: 0,
        startTime: Date.now(),
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(true)
    })

    it('should deny if maxSteps exceeded', async () => {
      const policy: Policy = {
        id: 'budget-1',
        type: 'budget',
        rules: [
          {
            condition: 'maxSteps',
            action: 'deny',
            metadata: { value: 10 },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 10,
        tokensUsed: 0,
        startTime: Date.now(),
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(false)
      expect(result.violatedPolicies).toContain('budget-1')
    })

    it('should deny if maxTokens exceeded', async () => {
      const policy: Policy = {
        id: 'budget-2',
        type: 'budget',
        rules: [
          {
            condition: 'maxTokens',
            action: 'deny',
            metadata: { value: 1000 },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 1000,
        startTime: Date.now(),
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(false)
    })
  })

  describe('validate - Timeout Policy', () => {
    it('should allow if within timeout', async () => {
      const policy: Policy = {
        id: 'timeout-1',
        type: 'timeout',
        rules: [
          {
            condition: 'maxDuration',
            action: 'deny',
            metadata: { value: 30000 },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now() - 1000,
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(true)
    })

    it('should deny if timeout exceeded', async () => {
      const policy: Policy = {
        id: 'timeout-1',
        type: 'timeout',
        rules: [
          {
            condition: 'maxDuration',
            action: 'deny',
            metadata: { value: 1000 },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now() - 2000,
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(false)
    })
  })

  describe('validate - Allowlist Policy', () => {
    it('should allow tool in allowlist', async () => {
      const policy: Policy = {
        id: 'allowlist-1',
        type: 'allowlist',
        rules: [
          {
            condition: 'allowedTools',
            action: 'deny',
            metadata: { tools: ['tool1', 'tool2'] },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'tool1',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(true)
    })

    it('should deny tool not in allowlist', async () => {
      const policy: Policy = {
        id: 'allowlist-1',
        type: 'allowlist',
        rules: [
          {
            condition: 'allowedTools',
            action: 'deny',
            metadata: { tools: ['tool1', 'tool2'] },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      }

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'tool3',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('not in allowlist')
    })

    it('should allow non-tool-call intentions', async () => {
      const policy: Policy = {
        id: 'allowlist-1',
        type: 'allowlist',
        rules: [
          {
            condition: 'allowedTools',
            action: 'deny',
            metadata: { tools: ['tool1'] },
          },
        ],
        scope: 'global',
        enabled: true,
      }

      engine.applyGlobalPolicy(policy)

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      }

      const intention: Intention = {
        type: 'final_answer',
        reasoning: 'Answer',
      }

      const result = await engine.validate(intention, context)

      expect(result.allowed).toBe(true)
    })
  })

  describe('getActivePolicies', () => {
    it('should return both global and agent policies', () => {
      const globalPolicy: Policy = {
        id: 'global-1',
        type: 'budget',
        rules: [],
        scope: 'global',
        enabled: true,
      }

      const agentPolicy: Policy = {
        id: 'agent-1',
        type: 'timeout',
        rules: [],
        scope: 'agent',
        agentId: 'agent-1',
        enabled: true,
      }

      engine.applyGlobalPolicy(globalPolicy)
      engine.applyAgentPolicy('agent-1', agentPolicy)

      const policies = engine.getActivePolicies('agent-1')

      expect(policies).toHaveLength(2)
      expect(policies.map((p) => p.id)).toContain('global-1')
      expect(policies.map((p) => p.id)).toContain('agent-1')
    })
  })

  describe('limits that cannot be checked', () => {
    function policyOf(type: Policy['type'], rules: unknown[], enabled = true): Policy {
      return { id: 'limits', type, rules: rules as Policy['rules'], scope: 'global', enabled }
    }

    const toolCall: Intention = { type: 'tool_call', toolName: 'test' }
    const context: PolicyContext = {
      runId: 'run-1',
      agentId: 'agent-1',
      currentStep: 5,
      tokensUsed: 0,
      startTime: Date.now(),
    }

    it('refuses a run limit that is not a finite number above 0', () => {
      // NaN, 0 or a missing value used to turn the limit off; a numeric string worked only by
      // coercion.
      const cases: [Policy['type'], string, unknown, string][] = [
        ['budget', 'maxSteps', Number.NaN, 'NaN'],
        ['budget', 'maxTokens', '1000', '"1000"'],
        ['timeout', 'maxDuration', -1, '-1'],
        ['timeout', 'maxDuration', undefined, 'undefined'],
      ]
      for (const [type, condition, value, shown] of cases) {
        const rule = { condition, action: 'deny', metadata: { value } }
        expect(() => engine.applyGlobalPolicy(policyOf(type, [rule]))).toThrow(
          `Validation failed: policy 'limits' rules[0].metadata.value - ${condition} must be a finite number > 0, got ${shown}`
        )
        expect(() => engine.applyAgentPolicy('agent-1', policyOf(type, [rule]))).toThrow(ValidationError)
      }
      expect(engine.getActivePolicies('agent-1')).toEqual([])
    })

    it('says how to turn a limit off when it is 0', () => {
      const rule = { condition: 'maxSteps', action: 'deny', metadata: { value: 0 } }
      expect(() => engine.applyGlobalPolicy(policyOf('budget', [rule]))).toThrow(
        'maxSteps must be a finite number > 0, got 0 (to turn the limit off, remove the rule or disable the policy)'
      )
    })

    it('refuses a limit in a policy type that does not read it', () => {
      const steps = { condition: 'maxSteps', action: 'deny', metadata: { value: 1 } }
      expect(() => engine.applyGlobalPolicy(policyOf('timeout', [steps]))).toThrow(
        "rules[0].condition - maxSteps is read only by a 'budget' policy, not a 'timeout' one"
      )
      const duration = { condition: 'maxDuration', action: 'deny', metadata: { value: 1 } }
      expect(() => engine.applyGlobalPolicy(policyOf('budget', [duration]))).toThrow(
        "rules[0].condition - maxDuration is read only by a 'timeout' policy, not a 'budget' one"
      )
    })

    it("leaves a custom policy's rules alone", () => {
      const own = { condition: 'maxSteps', action: 'deny', metadata: { validator: () => true } }
      engine.applyGlobalPolicy(policyOf('custom', [own]))
      expect(engine.getActivePolicies('agent-1')).toHaveLength(1)
    })

    it('refuses rules that are not a list of objects', () => {
      const broken = { ...policyOf('budget', []), rules: undefined } as unknown as Policy
      expect(() => engine.applyGlobalPolicy(broken)).toThrow(
        "Validation failed: policy 'limits' rules - must be an array, got undefined"
      )
      expect(() => engine.applyGlobalPolicy(policyOf('custom', [null]))).toThrow(
        "Validation failed: policy 'limits' rules[0] - must be an object, got null"
      )
    })

    it('refuses a budgetLimit that cannot be checked, naming the field', () => {
      const cases: [unknown, string][] = [
        [undefined, ' - must be an object, got undefined'],
        [{ period: 'year', maxTokens: 10 }, '.period - must be one of hour, day, week, month, all, got "year"'],
        [{ period: 'day' }, ' - sets no cap (maxTokens, maxToolCalls, maxCost)'],
        [{ period: 'day', maxToolCalls: Number.NaN }, '.maxToolCalls - must be a finite number >= 0, got NaN'],
        [{ period: 'day', maxTokens: '500' }, '.maxTokens - must be a finite number >= 0, got "500"'],
        [{ period: 'day', maxTokens: null }, '.maxTokens - must be a finite number >= 0, got null'],
        [{ period: 'day', maxCost: 1, agentId: 7 }, '.agentId - must be a string, got 7'],
      ]
      for (const [budgetLimit, message] of cases) {
        const rule = { condition: 'budgetLimit', action: 'deny', metadata: { budgetLimit } }
        expect(() => engine.applyGlobalPolicy(policyOf('budget', [rule]))).toThrow(
          `Validation failed: policy 'limits' rules[0].metadata.budgetLimit${message}`
        )
      }
    })

    it('names the rule at fault and accepts caps of 0', () => {
      const valid = { condition: 'maxSteps', action: 'deny', metadata: { value: 5 } }
      const nothingAllowed = {
        condition: 'budgetLimit',
        action: 'deny',
        metadata: { budgetLimit: { period: 'all', maxToolCalls: 0, maxCost: 0 } },
      }
      engine.applyGlobalPolicy(policyOf('budget', [valid, nothingAllowed]))
      expect(engine.getActivePolicies('agent-1')).toHaveLength(1)

      const broken = { condition: 'maxTokens', action: 'deny', metadata: { value: '30' } }
      expect(() => engine.applyGlobalPolicy(policyOf('budget', [valid, broken]))).toThrow(
        'rules[1].metadata.value'
      )
    })

    it('does not check a disabled policy, which is never applied', () => {
      const rule = { condition: 'maxSteps', action: 'deny', metadata: { value: 'ten' } }
      expect(() => engine.applyGlobalPolicy(policyOf('budget', [rule], false))).not.toThrow()
      expect(engine.getActivePolicies('agent-1')).toEqual([])
    })

    it('refuses a call when a run limit was changed after the policy was applied', async () => {
      const steps = { condition: 'maxSteps', action: 'deny' as const, metadata: { value: 10 } as Record<string, unknown> }
      const duration = { condition: 'maxDuration', action: 'deny' as const, metadata: { value: 60_000 } as Record<string, unknown> }
      engine.applyGlobalPolicy(policyOf('budget', [steps]))
      engine.applyAgentPolicy('agent-1', { ...policyOf('timeout', [duration]), id: 'timeout' })
      expect((await engine.validate(toolCall, context)).allowed).toBe(true)

      steps.metadata.value = Number.NaN
      const stepsResult = await engine.validate(toolCall, context)
      expect(stepsResult.allowed).toBe(false)
      expect(stepsResult.reason).toContain('Limit cannot be checked: maxSteps must be a finite number > 0, got NaN')

      steps.metadata.value = 10
      duration.metadata.value = '60000'
      const durationResult = await engine.validate(toolCall, context)
      expect(durationResult.allowed).toBe(false)
      expect(durationResult.reason).toContain('Limit cannot be checked: maxDuration must be a finite number > 0, got "60000"')
    })
  })
})
