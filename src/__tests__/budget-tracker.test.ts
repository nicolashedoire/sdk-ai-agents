import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetTracker } from '../managers/budget-tracker.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { BudgetLimit } from '../types/policy.js';

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;
  let eventStore: FileEventStore;

  beforeEach(() => {
    eventStore = new FileEventStore();
    tracker = new BudgetTracker(eventStore);
    tracker.clearCache();
  });

  describe('recordToolCall', () => {
    it('should record tool call usage', async () => {
      await tracker.recordToolCall('agent-1', 'tool-1', Date.now());

      const usage = await tracker.getUsage({
        agentId: 'agent-1',
        toolName: 'tool-1',
        period: 'all',
      });

      expect(usage.toolCallsCount).toBe(1);
      expect(usage.tokensUsed).toBe(0);
    });

    it('should track tool calls per period', async () => {
      const now = Date.now();
      await tracker.recordToolCall('agent-1', 'tool-1', now);
      await tracker.recordToolCall('agent-1', 'tool-1', now);

      const usage = await tracker.getUsage({
        agentId: 'agent-1',
        toolName: 'tool-1',
        period: 'all',
      });

      expect(usage.toolCallsCount).toBe(2);
    });

    it('should track tool calls separately per tool', async () => {
      const now = Date.now();
      await tracker.recordToolCall('agent-1', 'tool-1', now);
      await tracker.recordToolCall('agent-1', 'tool-2', now);

      const usage1 = await tracker.getUsage({
        agentId: 'agent-1',
        toolName: 'tool-1',
        period: 'all',
      });

      const usage2 = await tracker.getUsage({
        agentId: 'agent-1',
        toolName: 'tool-2',
        period: 'all',
      });

      expect(usage1.toolCallsCount).toBe(1);
      expect(usage2.toolCallsCount).toBe(1);
    });
  });

  describe('recordUsage', () => {
    it('should record token usage', async () => {
      await tracker.recordUsage('agent-1', 100);

      const usage = await tracker.getUsage({
        agentId: 'agent-1',
        period: 'all',
      });

      expect(usage.tokensUsed).toBe(100);
      expect(usage.toolCallsCount).toBe(0);
    });

    it('should accumulate token usage', async () => {
      await tracker.recordUsage('agent-1', 50);
      await tracker.recordUsage('agent-1', 75);

      const usage = await tracker.getUsage({
        agentId: 'agent-1',
        period: 'all',
      });

      expect(usage.tokensUsed).toBe(125);
    });

    it('should track tokens per agent', async () => {
      await tracker.recordUsage('agent-1', 100);
      await tracker.recordUsage('agent-2', 200);

      const usage1 = await tracker.getUsage({
        agentId: 'agent-1',
        period: 'all',
      });

      const usage2 = await tracker.getUsage({
        agentId: 'agent-2',
        period: 'all',
      });

      expect(usage1.tokensUsed).toBe(100);
      expect(usage2.tokensUsed).toBe(200);
    });
  });

  describe('checkBudget', () => {
    it('should allow action if budget not exceeded', async () => {
      await tracker.recordUsage('agent-1', 50);

      const limit: BudgetLimit = {
        agentId: 'agent-1',
        period: 'all',
        maxTokens: 100,
      };

      const result = await tracker.checkBudget(limit, 25);

      expect(result.allowed).toBe(true);
      expect(result.wouldExceed).toBe(false);
    });

    it('should reject action if token budget would be exceeded', async () => {
      await tracker.recordUsage('agent-1', 50);

      const limit: BudgetLimit = {
        agentId: 'agent-1',
        period: 'all',
        maxTokens: 100,
      };

      const result = await tracker.checkBudget(limit, 60);

      expect(result.allowed).toBe(false);
      expect(result.wouldExceed).toBe(true);
      expect(result.reason).toContain('Token budget exceeded');
    });

    it('should reject action if tool call budget would be exceeded', async () => {
      await tracker.recordToolCall('agent-1', 'tool-1');

      const limit: BudgetLimit = {
        agentId: 'agent-1',
        toolName: 'tool-1',
        period: 'all',
        maxToolCalls: 2,
      };

      const result = await tracker.checkBudget(limit, 0, 2);

      expect(result.allowed).toBe(false);
      expect(result.wouldExceed).toBe(true);
      expect(result.reason).toContain('Tool call budget exceeded');
    });

    it('should check budget for specific tool', async () => {
      await tracker.recordToolCall('agent-1', 'tool-1');
      await tracker.recordToolCall('agent-1', 'tool-2');

      const limit: BudgetLimit = {
        agentId: 'agent-1',
        toolName: 'tool-1',
        period: 'all',
        maxToolCalls: 1,
      };

      const result = await tracker.checkBudget(limit, 0, 1);

      expect(result.allowed).toBe(false);
      expect(result.wouldExceed).toBe(true);
    });
  });

  describe('getUsage', () => {
    it('should return usage for all period', async () => {
      await tracker.recordUsage('agent-1', 100);

      const usage = await tracker.getUsage({
        agentId: 'agent-1',
        period: 'all',
      });

      expect(usage.period).toBe('all');
      expect(usage.tokensUsed).toBe(100);
    });

    it('should return usage for hour period', async () => {
      await tracker.recordUsage('agent-1', 50);

      const usage = await tracker.getUsage({
        agentId: 'agent-1',
        period: 'hour',
      });

      expect(usage.period).toBe('hour');
      expect(usage.periodStart).toBeLessThanOrEqual(Date.now());
      expect(usage.periodEnd).toBeGreaterThan(Date.now());
    });

    it('should return zero usage for new agent', async () => {
      const usage = await tracker.getUsage({
        agentId: 'new-agent',
        period: 'all',
      });

      expect(usage.tokensUsed).toBe(0);
      expect(usage.toolCallsCount).toBe(0);
    });
  });

  describe('getAllUsage', () => {
    it('should return all tracked usage', async () => {
      await tracker.recordUsage('agent-1', 100);
      await tracker.recordToolCall('agent-1', 'tool-1');

      const allUsage = tracker.getAllUsage();

      expect(allUsage.length).toBeGreaterThan(0);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached usage', async () => {
      await tracker.recordUsage('agent-1', 100);
      tracker.clearCache();

      const allUsage = tracker.getAllUsage();
      expect(allUsage.length).toBe(0);
    });
  });
});


