import type { IEventStore } from '../stores/event-store.js';

export interface BudgetUsage {
  agentId?: string;
  toolName?: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'all';
  periodStart: number;
  periodEnd: number;
  tokensUsed: number;
  toolCallsCount: number;
  /** USD spent by model calls whose model has a price. */
  costUsd: number;
  /** Model calls of a model without a price: their cost is unknown, maxCost cannot be checked. */
  unpricedCalls: number;
  /** Model calls that reported no input/output token counts: their cost is unknown too. */
  unmeteredCalls: number;
  lastUpdated: number;
}

/** A model call as budgets count it: its tokens, and its cost or why it has none. */
export type ModelCallUsage =
  | { tokens: number; costUsd: number }
  | { tokens: number; uncosted: 'no-price' | 'no-usage' };

/** What one operation adds to a scope's usage. */
interface UsageDelta {
  tokens?: number;
  toolCalls?: number;
  costUsd?: number;
  unpricedCalls?: number;
  unmeteredCalls?: number;
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

      // Record for agent-level usage, and for limits that name no agent
      this.addUsage(agentId, undefined, period, boundaries, { tokens: tokensUsed }, timestamp);
      this.addUsage(undefined, undefined, period, boundaries, { tokens: tokensUsed }, timestamp);

      // Record for tool-level usage if toolName provided
      if (toolName) {
        this.addUsage(agentId, toolName, period, boundaries, { toolCalls: 1 }, timestamp);
      }
    }
  }

  /**
   * Records a model call: its tokens, and its cost, or why it has none (a model without a
   * price, a call without token counts), for which a `maxCost` limit cannot be checked.
   * Counted for the agent and for limits that name no agent.
   */
  async recordModelUsage(
    agentId: string,
    call: ModelCallUsage,
    timestamp: number = Date.now()
  ): Promise<void> {
    const delta: UsageDelta =
      'costUsd' in call
        ? { tokens: call.tokens, costUsd: call.costUsd }
        : call.uncosted === 'no-price'
          ? { tokens: call.tokens, unpricedCalls: 1 }
          : { tokens: call.tokens, unmeteredCalls: 1 };
    for (const period of ['hour', 'day', 'week', 'month', 'all'] as const) {
      const boundaries = this.getPeriodBoundaries(period, timestamp);
      this.addUsage(agentId, undefined, period, boundaries, delta, timestamp);
      this.addUsage(undefined, undefined, period, boundaries, delta, timestamp);
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
    this.countToolCall(agentId, toolName, timestamp);
  }

  /**
   * Admits one tool call: checks every limit and, if none would be exceeded, counts the call
   * — in one synchronous step, so concurrent calls cannot all pass the same check. The call
   * is counted when it starts, whatever its outcome. Returns the refusal, if any.
   */
  admitToolCall(
    agentId: string,
    toolName: string,
    limits: ReadonlyArray<{ policyId: string; limit: BudgetLimit }>,
    timestamp: number = Date.now()
  ): { policyId: string; reason: string } | undefined {
    for (const { policyId, limit } of limits) {
      if (limit.maxToolCalls === undefined) continue;
      const count = this.usageAt(limit, timestamp).toolCallsCount + 1;
      if (count > limit.maxToolCalls) {
        return { policyId, reason: `Tool call budget exceeded: ${count} > ${limit.maxToolCalls}` };
      }
    }
    this.countToolCall(agentId, toolName, timestamp);
    return undefined;
  }

  /** Counts a call for every scope a limit can name: agent and tool, agent, tool, all. */
  private countToolCall(agentId: string, toolName: string, timestamp: number): void {
    const periods: BudgetLimit['period'][] = ['hour', 'day', 'week', 'month', 'all'];
    const scopes: Array<[string | undefined, string | undefined]> = [
      [agentId, toolName],
      [agentId, undefined],
      [undefined, toolName],
      [undefined, undefined],
    ];
    for (const period of periods) {
      const boundaries = this.getPeriodBoundaries(period, timestamp);
      for (const [scopeAgent, scopeTool] of scopes) {
        this.addUsage(scopeAgent, scopeTool, period, boundaries, { toolCalls: 1 }, timestamp);
      }
    }
  }

  /** Adds to the usage of one scope; usage from an earlier period starts again from zero. */
  private addUsage(
    agentId: string | undefined,
    toolName: string | undefined,
    period: BudgetLimit['period'],
    boundaries: { start: number; end: number },
    delta: UsageDelta,
    timestamp: number
  ): void {
    const key = this.getCacheKey(agentId, toolName, period);
    const cached = this.usageCache.get(key);
    const existing = cached && cached.periodStart === boundaries.start ? cached : undefined;
    this.usageCache.set(key, {
      agentId,
      toolName,
      period,
      periodStart: boundaries.start,
      periodEnd: boundaries.end,
      tokensUsed: (existing?.tokensUsed ?? 0) + (delta.tokens ?? 0),
      toolCallsCount: (existing?.toolCallsCount ?? 0) + (delta.toolCalls ?? 0),
      costUsd: (existing?.costUsd ?? 0) + (delta.costUsd ?? 0),
      unpricedCalls: (existing?.unpricedCalls ?? 0) + (delta.unpricedCalls ?? 0),
      unmeteredCalls: (existing?.unmeteredCalls ?? 0) + (delta.unmeteredCalls ?? 0),
      lastUpdated: timestamp,
    });
  }

  /**
   * Gets current usage for a specific budget limit.
   */
  async getUsage(limit: BudgetLimit, timestamp: number = Date.now()): Promise<BudgetUsage> {
    return this.usageAt(limit, timestamp);
  }

  /**
   * Usage of the limit's scope in its current period. Usage is counted in memory, from the
   * start of this process: nothing is read back from the event store.
   */
  private usageAt(limit: BudgetLimit, timestamp: number): BudgetUsage {
    const boundaries = this.getPeriodBoundaries(limit.period, timestamp);
    const cached = this.usageCache.get(
      this.getCacheKey(limit.agentId, limit.toolName, limit.period)
    );
    if (cached && cached.periodStart === boundaries.start && cached.periodEnd === boundaries.end) {
      return cached;
    }
    return {
      agentId: limit.agentId,
      toolName: limit.toolName,
      period: limit.period,
      periodStart: boundaries.start,
      periodEnd: boundaries.end,
      tokensUsed: 0,
      toolCallsCount: 0,
      costUsd: 0,
      unpricedCalls: 0,
      unmeteredCalls: 0,
      lastUpdated: timestamp,
    };
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

    // Spend is not tracked per tool (a model call serves no single tool): a cost cap that names
    // a tool gates that tool on the spend of its agent, or of everyone.
    const spend =
      limit.maxCost !== undefined && limit.toolName !== undefined
        ? await this.getUsage(withoutTool(limit))
        : currentUsage;
    // A cost cap that cannot be checked (a model without a price, a call without token counts)
    // refuses like one that is exceeded: costs are never guessed.
    const costUnknown =
      limit.maxCost !== undefined && spend.unpricedCalls + spend.unmeteredCalls > 0;
    const wouldExceedCost =
      limit.maxCost !== undefined &&
      (costUnknown || spend.costUsd > limit.maxCost + COST_TOLERANCE_USD);

    const wouldExceed = wouldExceedTokens || wouldExceedToolCalls || wouldExceedCost;

    let reason: string | undefined;
    if (wouldExceedTokens) {
      reason = `Token budget exceeded: ${currentUsage.tokensUsed + additionalTokens} > ${limit.maxTokens}`;
    } else if (wouldExceedToolCalls) {
      reason = `Tool call budget exceeded: ${currentUsage.toolCallsCount + additionalToolCalls} > ${limit.maxToolCalls}`;
    } else if (costUnknown && spend.unpricedCalls > 0) {
      reason = `Cost budget cannot be checked: ${spend.unpricedCalls} model call(s) of a model without a price (add it to SDKConfig.pricing)`;
    } else if (costUnknown) {
      reason = `Cost budget cannot be checked: ${spend.unmeteredCalls} model call(s) reported no token counts`;
    } else if (wouldExceedCost) {
      reason = `Cost budget exceeded: $${usd(spend.costUsd)} > $${usd(limit.maxCost ?? 0)}`;
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

/** Rounding noise allowed when comparing sums of float costs with a cap. */
const COST_TOLERANCE_USD = 1e-9;

/** A dollar amount without float noise or needless zeros ($2.4, $0.000005). */
function usd(amount: number): string {
  return String(Number(amount.toFixed(6)));
}

function withoutTool(limit: BudgetLimit): BudgetLimit {
  const { toolName: _tool, ...scope } = limit;
  return scope;
}
