import { describe, it, expect, beforeEach } from 'vitest';
import { ConditionEvaluator } from '../evaluators/condition-evaluator.js';
import type { PolicyContext } from '../types/policy.js';
import type { Intention } from '../types/run.js';

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  describe('evaluate - Simple Conditions', () => {
    it('should evaluate equality condition', () => {
      const condition = {
        field: 'intention.toolName',
        operator: 'eq' as const,
        value: 'test-tool',
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });

    it('should evaluate inequality condition', () => {
      const condition = {
        field: 'intention.toolName',
        operator: 'ne' as const,
        value: 'other-tool',
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });

    it('should evaluate greater than condition', () => {
      const condition = {
        field: 'context.currentStep',
        operator: 'gt' as const,
        value: 5,
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 10,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });

    it('should evaluate less than condition', () => {
      const condition = {
        field: 'context.tokensUsed',
        operator: 'lt' as const,
        value: 100,
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 50,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });

    it('should evaluate "in" condition', () => {
      const condition = {
        field: 'intention.toolName',
        operator: 'in' as const,
        value: ['tool-1', 'tool-2', 'tool-3'],
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'tool-2',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });

    it('should evaluate "exists" condition', () => {
      const condition = {
        field: 'intention.toolName',
        operator: 'exists' as const,
        value: true,
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });
  });

  describe('evaluate - Complex Expressions', () => {
    it('should evaluate AND expression', () => {
      const expression = {
        type: 'and' as const,
        expressions: [
          {
            type: 'condition' as const,
            conditions: [
              {
                field: 'intention.toolName',
                operator: 'eq' as const,
                value: 'test-tool',
              },
            ],
          },
          {
            type: 'condition' as const,
            conditions: [
              {
                field: 'context.currentStep',
                operator: 'lt' as const,
                value: 10,
              },
            ],
          },
        ],
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 5,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(expression, intention, context)).toBe(true);
    });

    it('should evaluate OR expression', () => {
      const expression = {
        type: 'or' as const,
        expressions: [
          {
            type: 'condition' as const,
            conditions: [
              {
                field: 'intention.toolName',
                operator: 'eq' as const,
                value: 'tool-1',
              },
            ],
          },
          {
            type: 'condition' as const,
            conditions: [
              {
                field: 'intention.toolName',
                operator: 'eq' as const,
                value: 'tool-2',
              },
            ],
          },
        ],
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'tool-2',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(expression, intention, context)).toBe(true);
    });

    it('should evaluate NOT expression', () => {
      const expression = {
        type: 'not' as const,
        expressions: [
          {
            type: 'condition' as const,
            conditions: [
              {
                field: 'intention.toolName',
                operator: 'eq' as const,
                value: 'forbidden-tool',
              },
            ],
          },
        ],
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'allowed-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(expression, intention, context)).toBe(true);
    });
  });

  describe('evaluate - String Conditions (Backward Compatibility)', () => {
    it('should evaluate simple equality string condition', () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate("toolName == 'test-tool'", intention, context)).toBe(true);
    });

    it('should evaluate simple inequality string condition', () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate("toolName != 'other-tool'", intention, context)).toBe(true);
    });

    it('should evaluate greater than string condition', () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 10,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate('context.currentStep > 5', intention, context)).toBe(true);
    });
  });

  describe('evaluate - Time-based Conditions', () => {
    it('should evaluate hour condition', () => {
      const condition = {
        field: 'time.hour',
        operator: 'gte' as const,
        value: 9,
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      const currentHour = new Date().getHours();
      expect(evaluator.evaluate(condition, intention, context)).toBe(currentHour >= 9);
    });

    it('should evaluate day condition', () => {
      const condition = {
        field: 'time.day',
        operator: 'eq' as const,
        value: 1, // Monday
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      const currentDay = new Date().getDay();
      expect(evaluator.evaluate(condition, intention, context)).toBe(currentDay === 1);
    });
  });

  describe('evaluate - Context Fields', () => {
    it('should access context.agentId', () => {
      const condition = {
        field: 'context.agentId',
        operator: 'eq' as const,
        value: 'agent-1',
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime: Date.now(),
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });

    it('should access context.elapsedTime', () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const condition = {
        field: 'context.elapsedTime',
        operator: 'gte' as const,
        value: 4000,
      };

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
      };

      const context: PolicyContext = {
        runId: 'run-1',
        agentId: 'agent-1',
        currentStep: 0,
        tokensUsed: 0,
        startTime,
      };

      expect(evaluator.evaluate(condition, intention, context)).toBe(true);
    });
  });
});

