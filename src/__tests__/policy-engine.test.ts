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
    function budget(rules: Policy['rules'], enabled = true): Policy {
      return { id: 'limits', type: 'budget', rules, scope: 'global', enabled }
    }

    it('refuses a run limit that is not a count above 0', () => {
      // NaN, 0 or a missing value used to turn the limit off; a string was compared as text.
      const cases: [string, unknown, string][] = [
        ['maxSteps', Number.NaN, 'NaN'],
        ['maxSteps', 0, '0'],
        ['maxTokens', '1000', '"1000"'],
        ['maxDuration', -1, '-1'],
        ['maxDuration', undefined, 'undefined'],
      ]
      for (const [condition, value, shown] of cases) {
        const rule = { condition, action: 'deny' as const, metadata: { value } }
        expect(() => engine.applyGlobalPolicy(budget([rule]))).toThrow(
          `Validation failed: policy 'limits' rules[0].metadata.value - ${condition} must be a finite number > 0, got ${shown}`
        )
        expect(() => engine.applyAgentPolicy('agent-1', budget([rule]))).toThrow(ValidationError)
      }
      expect(engine.getActivePolicies('agent-1')).toEqual([])
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
        const rule = { condition: 'budgetLimit', action: 'deny' as const, metadata: { budgetLimit } }
        expect(() => engine.applyGlobalPolicy(budget([rule]))).toThrow(
          `Validation failed: policy 'limits' rules[0].metadata.budgetLimit${message}`
        )
      }
    })

    it('names the rule at fault and accepts caps of 0', () => {
      const valid = { condition: 'maxSteps', action: 'deny' as const, metadata: { value: 5 } }
      const nothingAllowed = {
        condition: 'budgetLimit',
        action: 'deny' as const,
        metadata: { budgetLimit: { period: 'all', maxToolCalls: 0, maxCost: 0 } },
      }
      engine.applyGlobalPolicy(budget([valid, nothingAllowed]))
      expect(engine.getActivePolicies('agent-1')).toHaveLength(1)

      const broken = { condition: 'maxDuration', action: 'deny' as const, metadata: { value: '30s' } }
      expect(() => engine.applyGlobalPolicy(budget([valid, broken]))).toThrow('rules[1].metadata.value')
    })

    it('does not check a disabled policy, which is never applied', () => {
      const rule = { condition: 'maxSteps', action: 'deny' as const, metadata: { value: 'ten' } }
      expect(() => engine.applyGlobalPolicy(budget([rule], false))).not.toThrow()
      expect(engine.getActivePolicies('agent-1')).toEqual([])
    })
  })
})
