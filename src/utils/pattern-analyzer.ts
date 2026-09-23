import type { Event } from '../types/events.js';
import type {
  DecisionPatternAnalysis,
  DecisionPattern,
  PatternInsight,
} from '../types/decision-patterns.js';
import { AlternativesExtractor } from './alternatives-extractor.js';

export interface PatternAnalysisOptions {
  agentId?: string;
  userId?: string;
  sessionId?: string;
  since?: number;
  until?: number;
  minFrequency?: number;
}

export class PatternAnalyzer {
  /**
   * Analyzes decision patterns across multiple runs.
   */
  static analyzePatterns(
    runs: Array<{ runId: string; events: Event[] }>,
    options: PatternAnalysisOptions = {}
  ): DecisionPatternAnalysis {
    if (runs.length === 0) {
      return PatternAnalyzer.createEmptyAnalysis(options);
    }

    const patterns: DecisionPattern[] = [];
    const patternMap = new Map<string, DecisionPattern>();
    const allTimestamps: number[] = [];

    // Analyze each run
    for (const { runId, events } of runs) {
      if (events.length === 0) continue;

      const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
      const firstTimestamp = sortedEvents[0].timestamp;
      const lastTimestamp = sortedEvents[sortedEvents.length - 1].timestamp;
      allTimestamps.push(firstTimestamp, lastTimestamp);

      // Extract alternatives for this run
      const alternativesAnalysis = AlternativesExtractor.extractFromEvents(runId, events);

      // Analyze tool choices
      PatternAnalyzer.analyzeToolChoices(runId, events, patternMap, firstTimestamp, lastTimestamp);

      // Analyze policy violations
      PatternAnalyzer.analyzePolicyViolations(
        runId,
        events,
        patternMap,
        firstTimestamp,
        lastTimestamp
      );

      // Analyze approval requests
      PatternAnalyzer.analyzeApprovalRequests(
        runId,
        events,
        patternMap,
        firstTimestamp,
        lastTimestamp
      );

      // Analyze intention types
      PatternAnalyzer.analyzeIntentionTypes(
        runId,
        events,
        patternMap,
        firstTimestamp,
        lastTimestamp
      );

      // Analyze rejection reasons
      PatternAnalyzer.analyzeRejectionReasons(
        runId,
        alternativesAnalysis,
        patternMap,
        firstTimestamp,
        lastTimestamp
      );
    }

    // Convert map to array and calculate percentages
    patterns.push(...Array.from(patternMap.values()));
    const totalRuns = runs.length;

    for (const pattern of patterns) {
      pattern.percentage = (pattern.frequency / totalRuns) * 100;
    }

    // Filter by minimum frequency if specified
    const minFreq = options.minFrequency;
    const filteredPatterns =
      minFreq !== undefined ? patterns.filter((p) => p.frequency >= minFreq) : patterns;

    // Calculate trends
    PatternAnalyzer.calculateTrends(filteredPatterns, runs);

    // Generate insights
    const insights = PatternAnalyzer.generateInsights(filteredPatterns);

    // Calculate summary
    const summary = PatternAnalyzer.calculateSummary(filteredPatterns);

    const timeRange = {
      start: Math.min(...allTimestamps),
      end: Math.max(...allTimestamps),
    };

    return {
      agentId: options.agentId,
      userId: options.userId,
      sessionId: options.sessionId,
      timeRange,
      runsAnalyzed: totalRuns,
      patterns: filteredPatterns.sort((a, b) => b.frequency - a.frequency),
      insights,
      summary,
    };
  }

  private static analyzeToolChoices(
    runId: string,
    events: Event[],
    patternMap: Map<string, DecisionPattern>,
    firstTimestamp: number,
    lastTimestamp: number
  ): void {
    const toolCalls = events.filter(
      (e) => e.type === 'tool.called' || e.type === 'action.executed'
    );

    for (const event of toolCalls) {
      const toolName =
        (event.data.toolName as string) ||
        (event.data.intention as { toolName?: string })?.toolName;

      if (toolName) {
        const patternKey = `tool_choice:${toolName}`;
        PatternAnalyzer.updatePattern(
          patternMap,
          patternKey,
          {
            type: 'tool_choice',
            pattern: `Tool choice: ${toolName}`,
            description: `Agent frequently chooses tool "${toolName}"`,
            metadata: { toolName },
          },
          runId,
          firstTimestamp,
          lastTimestamp
        );
      }
    }
  }

  private static analyzePolicyViolations(
    runId: string,
    events: Event[],
    patternMap: Map<string, DecisionPattern>,
    firstTimestamp: number,
    lastTimestamp: number
  ): void {
    const policyChecks = events.filter(
      (e) => e.type === 'policy.checked' || e.type === 'policy.violated'
    );

    for (const event of policyChecks) {
      const policyData = event.data as {
        rule?: string;
        allowed?: boolean;
        policyId?: string;
      };

      if (!policyData.allowed && policyData.rule) {
        const patternKey = `policy_violation:${policyData.rule}`;
        PatternAnalyzer.updatePattern(
          patternMap,
          patternKey,
          {
            type: 'policy_violation',
            pattern: `Policy violation: ${policyData.rule}`,
            description: `Policy "${policyData.rule}" is frequently violated`,
            metadata: { policyId: policyData.policyId || policyData.rule },
          },
          runId,
          firstTimestamp,
          lastTimestamp
        );
      }
    }
  }

  private static analyzeApprovalRequests(
    runId: string,
    events: Event[],
    patternMap: Map<string, DecisionPattern>,
    firstTimestamp: number,
    lastTimestamp: number
  ): void {
    const approvalRequests = events.filter((e) => e.type === 'approval.requested');

    if (approvalRequests.length > 0) {
      const patternKey = 'approval_request:general';
      PatternAnalyzer.updatePattern(
        patternMap,
        patternKey,
        {
          type: 'approval_request',
          pattern: 'Approval requests',
          description: 'Agent frequently requires human approval',
        },
        runId,
        firstTimestamp,
        lastTimestamp
      );
    }
  }

  private static analyzeIntentionTypes(
    runId: string,
    events: Event[],
    patternMap: Map<string, DecisionPattern>,
    firstTimestamp: number,
    lastTimestamp: number
  ): void {
    const intentions = events.filter((e) => e.type === 'intention.generated');

    for (const event of intentions) {
      const intentionData =
        (event.data.intention as { type?: string }) ||
        PatternAnalyzer.extractIntentionType(event.data);

      if (intentionData?.type) {
        const patternKey = `intention_type:${intentionData.type}`;
        PatternAnalyzer.updatePattern(
          patternMap,
          patternKey,
          {
            type: 'intention_type',
            pattern: `Intention type: ${intentionData.type}`,
            description: `Agent frequently generates "${intentionData.type}" intentions`,
            metadata: { intentionType: intentionData.type },
          },
          runId,
          firstTimestamp,
          lastTimestamp
        );
      }
    }
  }

  private static analyzeRejectionReasons(
    runId: string,
    alternativesAnalysis: ReturnType<typeof AlternativesExtractor.extractFromEvents>,
    patternMap: Map<string, DecisionPattern>,
    firstTimestamp: number,
    lastTimestamp: number
  ): void {
    for (const decisionPoint of alternativesAnalysis.decisionPoints) {
      for (const alternative of decisionPoint.alternatives) {
        if (alternative.status === 'rejected' && alternative.reason) {
          const patternKey = `rejection_reason:${alternative.reason}`;
          PatternAnalyzer.updatePattern(
            patternMap,
            patternKey,
            {
              type: 'rejection_reason',
              pattern: `Rejection reason: ${alternative.reason}`,
              description: `Alternative frequently rejected: ${alternative.reason}`,
              metadata: { rejectionReason: alternative.reason },
            },
            runId,
            firstTimestamp,
            lastTimestamp
          );
        }
      }
    }
  }

  private static updatePattern(
    patternMap: Map<string, DecisionPattern>,
    key: string,
    basePattern: {
      type: DecisionPattern['type'];
      pattern: string;
      description: string;
      metadata?: DecisionPattern['metadata'];
    },
    runId: string,
    firstTimestamp: number,
    lastTimestamp: number
  ): void {
    const existing = patternMap.get(key);

    if (existing) {
      existing.frequency += 1;
      if (!existing.runs.includes(runId)) {
        existing.runs.push(runId);
      }
      existing.lastSeen = Math.max(existing.lastSeen, lastTimestamp);
      existing.firstSeen = Math.min(existing.firstSeen, firstTimestamp);
    } else {
      patternMap.set(key, {
        id: key,
        ...basePattern,
        frequency: 1,
        percentage: 0,
        runs: [runId],
        firstSeen: firstTimestamp,
        lastSeen: lastTimestamp,
      });
    }
  }

  private static extractIntentionType(data: Event['data']): { type?: string } | null {
    if (data.intention) {
      return data.intention as { type?: string };
    }

    if (data.toolCalls && Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
      return { type: 'tool_call' };
    }

    if (data.message) {
      return { type: 'final_answer' };
    }

    return null;
  }

  private static calculateTrends(
    patterns: DecisionPattern[],
    runs: Array<{ runId: string; events: Event[] }>
  ): void {
    // Group runs by time periods (e.g., first half vs second half)
    const sortedRuns = [...runs].sort((a, b) => {
      const aTime = a.events[0]?.timestamp || 0;
      const bTime = b.events[0]?.timestamp || 0;
      return aTime - bTime;
    });

    const midPoint = Math.floor(sortedRuns.length / 2);
    const firstHalf = sortedRuns.slice(0, midPoint);
    const secondHalf = sortedRuns.slice(midPoint);

    for (const pattern of patterns) {
      const firstHalfCount = firstHalf.filter((r) => pattern.runs.includes(r.runId)).length;
      const secondHalfCount = secondHalf.filter((r) => pattern.runs.includes(r.runId)).length;

      if (secondHalfCount > firstHalfCount * 1.1) {
        pattern.trend = 'increasing';
      } else if (secondHalfCount < firstHalfCount * 0.9) {
        pattern.trend = 'decreasing';
      } else {
        pattern.trend = 'stable';
      }
    }
  }

  private static generateInsights(patterns: DecisionPattern[]): PatternInsight[] {
    const insights: PatternInsight[] = [];

    // Most frequent pattern
    if (patterns.length > 0) {
      const mostFrequent = patterns[0];
      if (mostFrequent.percentage > 50) {
        insights.push({
          id: 'insight-most-frequent',
          type: 'frequent_choice',
          title: 'Most Common Pattern',
          description: `${mostFrequent.pattern} occurs in ${mostFrequent.percentage.toFixed(1)}% of runs`,
          severity: 'info',
          patternId: mostFrequent.id,
        });
      }
    }

    // Trending patterns
    const trendingUp = patterns.filter((p) => p.trend === 'increasing' && p.frequency >= 3);
    for (const pattern of trendingUp) {
      insights.push({
        id: `insight-trending-up-${pattern.id}`,
        type: 'trending_up',
        title: 'Trending Up',
        description: `${pattern.pattern} is becoming more frequent`,
        severity: 'warning',
        patternId: pattern.id,
      });
    }

    const trendingDown = patterns.filter((p) => p.trend === 'decreasing' && p.frequency >= 3);
    for (const pattern of trendingDown) {
      insights.push({
        id: `insight-trending-down-${pattern.id}`,
        type: 'trending_down',
        title: 'Trending Down',
        description: `${pattern.pattern} is becoming less frequent`,
        severity: 'info',
        patternId: pattern.id,
      });
    }

    // High frequency policy violations
    const policyViolations = patterns.filter(
      (p) => p.type === 'policy_violation' && p.percentage > 20
    );
    for (const pattern of policyViolations) {
      insights.push({
        id: `insight-policy-violation-${pattern.id}`,
        type: 'anomaly',
        title: 'Frequent Policy Violations',
        description: `${pattern.pattern} occurs in ${pattern.percentage.toFixed(1)}% of runs`,
        severity: 'critical',
        patternId: pattern.id,
        recommendation: 'Consider reviewing agent configuration or policy rules',
      });
    }

    // High frequency approval requests
    const approvalRequests = patterns.filter(
      (p) => p.type === 'approval_request' && p.percentage > 30
    );
    for (const pattern of approvalRequests) {
      insights.push({
        id: `insight-approval-requests-${pattern.id}`,
        type: 'recommendation',
        title: 'Frequent Approval Requests',
        description: `Agent requires approval in ${pattern.percentage.toFixed(1)}% of runs`,
        severity: 'warning',
        patternId: pattern.id,
        recommendation: 'Consider adjusting policies to reduce approval requirements',
      });
    }

    return insights;
  }

  private static calculateSummary(patterns: DecisionPattern[]): DecisionPatternAnalysis['summary'] {
    const patternsByType: Record<string, number> = {};
    let totalFrequency = 0;

    for (const pattern of patterns) {
      patternsByType[pattern.type] = (patternsByType[pattern.type] || 0) + 1;
      totalFrequency += pattern.frequency;
    }

    return {
      totalPatterns: patterns.length,
      mostFrequentPattern: patterns.length > 0 ? patterns[0] : undefined,
      patternsByType,
      averagePatternFrequency: patterns.length > 0 ? totalFrequency / patterns.length : 0,
    };
  }

  private static createEmptyAnalysis(options: PatternAnalysisOptions): DecisionPatternAnalysis {
    return {
      agentId: options.agentId,
      userId: options.userId,
      sessionId: options.sessionId,
      timeRange: {
        start: options.since || Date.now(),
        end: options.until || Date.now(),
      },
      runsAnalyzed: 0,
      patterns: [],
      insights: [],
      summary: {
        totalPatterns: 0,
        patternsByType: {},
        averagePatternFrequency: 0,
      },
    };
  }
}
