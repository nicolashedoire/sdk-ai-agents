import type { IEventStore } from '../stores/event-store.js';

export interface BudgetUsage {
  agentId?: string;
  toolName?: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'all';
  periodStart: number;
  periodEnd: number;
  tokensUsed: number;
  toolCallsCount: number;
  lastUpdated: number;
}

export interface BudgetLimit {
  agentId?: string;
  toolName?: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'all';
  maxTokens?: number;
  maxToolCalls?: number;
  maxCost?: number;
}

export class BudgetTracker {
  private usageCache: Map<string, BudgetUsage> = new Map();

  /** @param eventStore Kept for historical usage queries (see `getBudgetUsage`). */
  constructor(readonly eventStore?: IEventStore) {}

  /**
   * Gets a cache key for budget usage tracking.
   */
  private getCacheKey(
    agentId?: string,
    toolName?: string,
    period: BudgetLimit['period'] = 'all'
  ): string {
    const parts: string[] = [];
    if (agentId) parts.push(`agent:${agentId}`);
    if (toolName) parts.push(`tool:${toolName}`);
    parts.push(`period:${period}`);
    return parts.join('|');
  }

  /**
   * Calculates period boundaries for a given period type.
   */
  private getPeriodBoundaries(
    period: BudgetLimit['period'],
    timestamp: number
  ): { start: number; end: number } {
    const date = new Date(timestamp);
    let start: number;
    let end: number;

    switch (period) {
      case 'hour':
        date.setMinutes(0, 0, 0);
        start = date.getTime();
        date.setHours(date.getHours() + 1);
        end = date.getTime();
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        start = date.getTime();
        date.setDate(date.getDate() + 1);
        end = date.getTime();
        break;
      case 'week': {
        const dayOfWeek = date.getDay();
        date.setDate(date.getDate() - dayOfWeek);
        date.setHours(0, 0, 0, 0);
        start = date.getTime();
        date.setDate(date.getDate() + 7);
        end = date.getTime();
        break;
      }
      case 'month':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        start = date.getTime();
        date.setMonth(date.getMonth() + 1);
        end = date.getTime();
        break;
      default:
        start = 0;
        end = Number.MAX_SAFE_INTEGER;
        break;
    }

    return { start, end };
  }

  /**
   * Records token usage for a tool call or LLM call.
   */
  async recordUsage(
    agentId: string,
    tokensUsed: number,
    toolName?: string,
    timestamp: number = Date.now()
  ): Promise<void> {
    // Record for all relevant periods
    const periods: BudgetLimit['period'][] = ['hour', 'day', 'week', 'month', 'all'];

    for (const period of periods) {
      const boundaries = this.getPeriodBoundaries(period, timestamp);

      // Record for agent-level usage
      const agentKey = this.getCacheKey(agentId, undefined, period);
      await this.updateUsage(
        agentKey,
        agentId,
        undefined,
        period,
        boundaries.start,
        boundaries.end,
        tokensUsed,
        0,
        timestamp
      );

      // Record for tool-level usage if toolName provided
      if (toolName) {
        const toolKey = this.getCacheKey(agentId, toolName, period);
        await this.updateUsage(
          toolKey,
          agentId,
          toolName,
          period,
          boundaries.start,
          boundaries.end,
          0,
          1,
          timestamp
        );
      }
    }
  }

  /**
   * Records a tool call (for counting tool calls per period).
   */
  async recordToolCall(
    agentId: string,
    toolName: string,
    timestamp: number = Date.now()
  ): Promise<void> {
    const periods: BudgetLimit['period'][] = ['hour', 'day', 'week', 'month', 'all'];

    for (const period of periods) {
      const boundaries = this.getPeriodBoundaries(period, timestamp);
      const toolKey = this.getCacheKey(agentId, toolName, period);
      await this.updateUsage(
        toolKey,
        agentId,
        toolName,
        period,
        boundaries.start,
        boundaries.end,
        0,
        1,
        timestamp
      );
    }
  }

  /**
   * Updates usage in cache and persists to event store.
   */
  private async updateUsage(
    key: string,
    agentId: string | undefined,
    toolName: string | undefined,
    period: BudgetLimit['period'],
    periodStart: number,
    periodEnd: number,
    tokensDelta: number,
    toolCallsDelta: number,
    timestamp: number
  ): Promise<void> {
    const existing = this.usageCache.get(key);

    const usage: BudgetUsage = {
      agentId,
      toolName,
      period,
      periodStart,
      periodEnd,
      tokensUsed: (existing?.tokensUsed || 0) + tokensDelta,
      toolCallsCount: (existing?.toolCallsCount || 0) + toolCallsDelta,
      lastUpdated: timestamp,
    };

    this.usageCache.set(key, usage);
  }

  /**
   * Gets current usage for a specific budget limit.
   */
  async getUsage(limit: BudgetLimit, timestamp: number = Date.now()): Promise<BudgetUsage> {
    const key = this.getCacheKey(limit.agentId, limit.toolName, limit.period);
    const cached = this.usageCache.get(key);

    if (cached) {
      const boundaries = this.getPeriodBoundaries(limit.period, timestamp);
      // Check if cached data is still valid for this period
      if (cached.periodStart === boundaries.start && cached.periodEnd === boundaries.end) {
        return cached;
      }
    }

    // If not cached or period changed, calculate from events
    return await this.calculateUsageFromEvents(limit, timestamp);
  }

  /**
   * Calculates usage from event store.
   */
  private async calculateUsageFromEvents(
    limit: BudgetLimit,
    timestamp: number
  ): Promise<BudgetUsage> {
    const boundaries = this.getPeriodBoundaries(limit.period, timestamp);

    // We need to query events, but eventStore doesn't have a method to query by time range across all runs
    // For now, we'll use the cache and update it periodically
    // In a real implementation, you'd want to add a method to eventStore to query events by time range

    const usage: BudgetUsage = {
      agentId: limit.agentId,
      toolName: limit.toolName,
      period: limit.period,
      periodStart: boundaries.start,
      periodEnd: boundaries.end,
      tokensUsed: 0,
      toolCallsCount: 0,
      lastUpdated: timestamp,
    };

    // Store in cache
    const key = this.getCacheKey(limit.agentId, limit.toolName, limit.period);
    this.usageCache.set(key, usage);

    return usage;
  }

  /**
   * Checks if a budget limit would be exceeded.
   */
  async checkBudget(
    limit: BudgetLimit,
    additionalTokens = 0,
    additionalToolCalls = 0
  ): Promise<{
    allowed: boolean;
    currentUsage: BudgetUsage;
    wouldExceed: boolean;
    reason?: string;
  }> {
    const currentUsage = await this.getUsage(limit);

    const wouldExceedTokens =
      limit.maxTokens !== undefined && currentUsage.tokensUsed + additionalTokens > limit.maxTokens;

    const wouldExceedToolCalls =
      limit.maxToolCalls !== undefined &&
      currentUsage.toolCallsCount + additionalToolCalls > limit.maxToolCalls;

    const wouldExceed = wouldExceedTokens || wouldExceedToolCalls;

    let reason: string | undefined;
    if (wouldExceedTokens) {
      reason = `Token budget exceeded: ${currentUsage.tokensUsed + additionalTokens} > ${limit.maxTokens}`;
    } else if (wouldExceedToolCalls) {
      reason = `Tool call budget exceeded: ${currentUsage.toolCallsCount + additionalToolCalls} > ${limit.maxToolCalls}`;
    }

    return {
      allowed: !wouldExceed,
      currentUsage,
      wouldExceed,
      reason,
    };
  }

  /**
   * Resets usage cache (useful for testing or manual resets).
   */
  clearCache(): void {
    this.usageCache.clear();
  }

  /**
   * Gets all tracked usage (for debugging/monitoring).
   */
  getAllUsage(): BudgetUsage[] {
    return Array.from(this.usageCache.values());
  }
}
