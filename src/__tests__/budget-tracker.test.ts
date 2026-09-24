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

  describe('recordModelUsage', () => {
    it('adds tokens and cost for the agent and for limits that name no agent', async () => {
      await tracker.recordModelUsage('agent-1', { tokens: 100, costUsd: 0.25 });
      await tracker.recordModelUsage('agent-2', { tokens: 50, costUsd: 0.5 });

      expect(await tracker.getUsage({ agentId: 'agent-1', period: 'all' })).toMatchObject({
        tokensUsed: 100,
        costUsd: 0.25,
      });
      expect(await tracker.getUsage({ period: 'all' })).toMatchObject({
        tokensUsed: 150,
        costUsd: 0.75,
      });
    });

    it('counts calls without a cost apart, by reason', async () => {
      await tracker.recordModelUsage('agent-1', { tokens: 10, uncosted: 'no-price' });
      await tracker.recordModelUsage('agent-1', { tokens: 10, uncosted: 'no-usage' });

      expect(await tracker.getUsage({ agentId: 'agent-1', period: 'all' })).toMatchObject({
        costUsd: 0,
        unpricedCalls: 1,
        unmeteredCalls: 1,
      });
    });

    it('starts a new period from zero', async () => {
      const hour = 60 * 60 * 1000;
      const start = Date.UTC(2026, 0, 1, 10);
      await tracker.recordModelUsage('agent-1', { tokens: 10, costUsd: 1 }, start);
      await tracker.recordModelUsage('agent-1', { tokens: 10, costUsd: 2 }, start + hour);

      const usage = await tracker.getUsage({ agentId: 'agent-1', period: 'hour' }, start + hour);
      expect(usage.costUsd).toBe(2);
    });

    it('keeps the cost when tool calls are counted', async () => {
      await tracker.recordModelUsage('agent-1', { tokens: 10, costUsd: 1 });
      await tracker.recordToolCall('agent-1', 'lookup');

      expect(await tracker.getUsage({ agentId: 'agent-1', period: 'all' })).toMatchObject({
        costUsd: 1,
        toolCallsCount: 1,
      });
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

    it('never shows a refused spend as equal to its cost cap', async () => {
      const cases = [
        { spend: 0.00000025, cap: 0, reason: 'Cost budget exceeded: $0.00000025 > $0' },
        {
          spend: 0.000000102,
          cap: 0.0000001,
          reason: 'Cost budget exceeded: $0.000000102 > $0.0000001',
        },
        { spend: 0.000002, cap: 0.0000004, reason: 'Cost budget exceeded: $0.000002 > $0.0000004' },
        { spend: 0.0100004, cap: 0.01, reason: 'Cost budget exceeded: $0.0100004 > $0.01' },
        { spend: 2.4, cap: 2, reason: 'Cost budget exceeded: $2.4 > $2' },
      ];
      for (const [index, { spend, cap, reason }] of cases.entries()) {
        const agentId = `agent-${index}`;
        await tracker.recordModelUsage(agentId, { tokens: 1, costUsd: spend });

        const result = await tracker.checkBudget({ agentId, period: 'all', maxCost: cap });

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe(reason);
      }
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

    it('admits calls again once a new period starts', () => {
      const limits = [
        {
          policyId: 'hourly',
          limit: { agentId: 'agent-1', period: 'hour' as const, maxToolCalls: 2 },
        },
      ];
      const start = new Date(2026, 8, 24, 10, 15).getTime();

      expect(tracker.admitToolCall('agent-1', 'tool-1', limits, start)).toBeUndefined();
      expect(tracker.admitToolCall('agent-1', 'tool-1', limits, start + 60_000)).toBeUndefined();
      expect(tracker.admitToolCall('agent-1', 'tool-1', limits, start + 120_000)).toMatchObject({
        policyId: 'hourly',
      });
      // The next hour starts from zero, whatever was counted before.
      const nextHour = start + 60 * 60_000;
      expect(tracker.admitToolCall('agent-1', 'tool-1', limits, nextHour)).toBeUndefined();
      expect(tracker.admitToolCall('agent-1', 'tool-1', limits, nextHour + 60_000)).toBeUndefined();
      expect(tracker.admitToolCall('agent-1', 'tool-1', limits, nextHour + 120_000)).toMatchObject({
        policyId: 'hourly',
      });
    });

    it('counts tool calls for limits that name only the agent, or only the tool', async () => {
      await tracker.recordToolCall('agent-1', 'tool-1');
      await tracker.recordToolCall('agent-1', 'tool-2');
      await tracker.recordToolCall('agent-2', 'tool-1');

      const perAgent = await tracker.checkBudget(
        { agentId: 'agent-1', period: 'day', maxToolCalls: 2 },
        0,
        1
      );
      const perTool = await tracker.checkBudget(
        { toolName: 'tool-1', period: 'day', maxToolCalls: 3 },
        0,
        1
      );
      const everything = await tracker.getUsage({ period: 'all' });

      expect(perAgent).toMatchObject({ wouldExceed: true, currentUsage: { toolCallsCount: 2 } });
      expect(perTool).toMatchObject({ wouldExceed: false, currentUsage: { toolCallsCount: 2 } });
      expect(everything.toolCallsCount).toBe(3);
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
