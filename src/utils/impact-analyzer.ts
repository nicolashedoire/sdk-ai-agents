import { v4 as uuidv4 } from 'uuid';
import type { Trace } from '../types/sdk.js';
import type {
  ImpactAnalysisOptions,
  ImpactAnalysis,
  ImpactMetric,
} from '../types/impact-analysis.js';

export class ImpactAnalyzer {
  static analyze(
    beforeTraces: Trace[],
    afterTraces: Trace[],
    options: ImpactAnalysisOptions = {}
  ): ImpactAnalysis {
    const metrics = ImpactAnalyzer.calculateMetrics(beforeTraces, afterTraces, options);
    const behaviorChanges = ImpactAnalyzer.identifyBehaviorChanges(beforeTraces, afterTraces);
    const impact = ImpactAnalyzer.assessImpact(metrics, behaviorChanges);
    const recommendations = options.includeRecommendations
      ? ImpactAnalyzer.generateRecommendations(metrics, behaviorChanges, impact)
      : undefined;

    return {
      id: uuidv4(),
      beforeRunIds: beforeTraces.map((t) => t.runId),
      afterRunIds: afterTraces.map((t) => t.runId),
      analyzedAt: Date.now(),
      metrics,
      behaviorChanges,
      impact,
      recommendations,
    };
  }

  private static calculateMetrics(
    beforeTraces: Trace[],
    afterTraces: Trace[],
    options: ImpactAnalysisOptions
  ): ImpactMetric[] {
    const requestedMetrics = options.metrics || ['duration', 'cost', 'quality', 'success_rate'];
    const metrics: ImpactMetric[] = [];

    if (requestedMetrics.includes('duration')) {
      metrics.push(ImpactAnalyzer.calculateDurationMetric(beforeTraces, afterTraces));
    }

    if (requestedMetrics.includes('cost')) {
      metrics.push(ImpactAnalyzer.calculateCostMetric(beforeTraces, afterTraces));
    }

    if (requestedMetrics.includes('quality')) {
      metrics.push(ImpactAnalyzer.calculateQualityMetric(beforeTraces, afterTraces));
    }

    if (requestedMetrics.includes('success_rate')) {
      metrics.push(ImpactAnalyzer.calculateSuccessRateMetric(beforeTraces, afterTraces));
    }

    return metrics;
  }

  private static calculateDurationMetric(
    beforeTraces: Trace[],
    afterTraces: Trace[]
  ): ImpactMetric {
    const beforeValues = beforeTraces.map((t) => t.summary.duration);
    const afterValues = afterTraces.map((t) => t.summary.duration);

    return ImpactAnalyzer.createMetric('duration', beforeValues, afterValues, 'ms');
  }

  private static calculateCostMetric(beforeTraces: Trace[], afterTraces: Trace[]): ImpactMetric {
    const beforeValues = beforeTraces.map((t) => t.summary.toolsCalled * 0.01);
    const afterValues = afterTraces.map((t) => t.summary.toolsCalled * 0.01);

    return ImpactAnalyzer.createMetric('cost', beforeValues, afterValues, 'tokens');
  }

  private static calculateQualityMetric(beforeTraces: Trace[], afterTraces: Trace[]): ImpactMetric {
    const beforeValues = beforeTraces.map((t) => {
      const failed = t.events.filter(
        (e) => e.type === 'action.failed' || e.type === 'tool.failed'
      ).length;
      return 1 - failed / Math.max(t.summary.totalEvents, 1);
    });
    const afterValues = afterTraces.map((t) => {
      const failed = t.events.filter(
        (e) => e.type === 'action.failed' || e.type === 'tool.failed'
      ).length;
      return 1 - failed / Math.max(t.summary.totalEvents, 1);
    });

    return ImpactAnalyzer.createMetric('quality', beforeValues, afterValues, 'score');
  }

  private static calculateSuccessRateMetric(
    beforeTraces: Trace[],
    afterTraces: Trace[]
  ): ImpactMetric {
    const beforeValues = beforeTraces.map((t) => (t.status === 'completed' ? 1 : 0));
    const afterValues = afterTraces.map((t) => (t.status === 'completed' ? 1 : 0));

    return ImpactAnalyzer.createMetric('success_rate', beforeValues, afterValues, 'rate');
  }

  private static createMetric(
    name: string,
    beforeValues: number[],
    afterValues: number[],
    unit: string
  ): ImpactMetric {
    const beforeAvg = ImpactAnalyzer.average(beforeValues);
    const afterAvg = ImpactAnalyzer.average(afterValues);
    const absoluteChange = afterAvg - beforeAvg;
    const percentageChange = beforeAvg !== 0 ? (absoluteChange / beforeAvg) * 100 : 0;

    let direction: 'improvement' | 'degradation' | 'neutral';
    if (Math.abs(percentageChange) < 1) {
      direction = 'neutral';
    } else if (name === 'duration' || name === 'cost') {
      direction = absoluteChange < 0 ? 'improvement' : 'degradation';
    } else {
      direction = absoluteChange > 0 ? 'improvement' : 'degradation';
    }

    return {
      name: `${name} (${unit})`,
      before: {
        average: beforeAvg,
        min: Math.min(...beforeValues),
        max: Math.max(...beforeValues),
        count: beforeValues.length,
      },
      after: {
        average: afterAvg,
        min: Math.min(...afterValues),
        max: Math.max(...afterValues),
        count: afterValues.length,
      },
      change: {
        absolute: absoluteChange,
        percentage: percentageChange,
        direction,
      },
    };
  }

  private static identifyBehaviorChanges(
    beforeTraces: Trace[],
    afterTraces: Trace[]
  ): ImpactAnalysis['behaviorChanges'] {
    const changes: ImpactAnalysis['behaviorChanges'] = [];

    const beforeAvgIntentions = ImpactAnalyzer.average(
      beforeTraces.map((t) => t.summary.intentionsGenerated)
    );
    const afterAvgIntentions = ImpactAnalyzer.average(
      afterTraces.map((t) => t.summary.intentionsGenerated)
    );
    if (Math.abs(afterAvgIntentions - beforeAvgIntentions) > 0.5) {
      changes.push({
        type: 'intentions',
        description: `Average intentions changed from ${beforeAvgIntentions.toFixed(2)} to ${afterAvgIntentions.toFixed(2)}`,
        severity: Math.abs(afterAvgIntentions - beforeAvgIntentions) > 2 ? 'high' : 'medium',
        beforeValue: beforeAvgIntentions,
        afterValue: afterAvgIntentions,
      });
    }

    const beforeAvgActions = ImpactAnalyzer.average(
      beforeTraces.map((t) => t.summary.actionsExecuted)
    );
    const afterAvgActions = ImpactAnalyzer.average(
      afterTraces.map((t) => t.summary.actionsExecuted)
    );
    if (Math.abs(afterAvgActions - beforeAvgActions) > 0.5) {
      changes.push({
        type: 'actions',
        description: `Average actions changed from ${beforeAvgActions.toFixed(2)} to ${afterAvgActions.toFixed(2)}`,
        severity: Math.abs(afterAvgActions - beforeAvgActions) > 2 ? 'high' : 'medium',
        beforeValue: beforeAvgActions,
        afterValue: afterAvgActions,
      });
    }

    const beforeFailures = beforeTraces.filter((t) => t.status === 'failed').length;
    const afterFailures = afterTraces.filter((t) => t.status === 'failed').length;
    if (beforeFailures !== afterFailures) {
      changes.push({
        type: 'failures',
        description: `Number of failures changed from ${beforeFailures} to ${afterFailures}`,
        severity: afterFailures > beforeFailures ? 'high' : 'medium',
        beforeValue: beforeFailures,
        afterValue: afterFailures,
      });
    }

    return changes;
  }

  private static assessImpact(
    metrics: ImpactMetric[],
    behaviorChanges: ImpactAnalysis['behaviorChanges']
  ): ImpactAnalysis['impact'] {
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    for (const metric of metrics) {
      if (metric.change.direction === 'improvement') {
        positiveCount++;
      } else if (metric.change.direction === 'degradation') {
        negativeCount++;
      } else {
        neutralCount++;
      }
    }

    const highSeverityChanges = behaviorChanges.filter((c) => c.severity === 'high').length;
    if (highSeverityChanges > 0 && negativeCount > positiveCount) {
      negativeCount += highSeverityChanges;
    }

    let overall: 'positive' | 'negative' | 'neutral';
    if (positiveCount > negativeCount && positiveCount > 0) {
      overall = 'positive';
    } else if (negativeCount > positiveCount && negativeCount > 0) {
      overall = 'negative';
    } else {
      overall = 'neutral';
    }

    const total = positiveCount + negativeCount + neutralCount;
    const confidence = total > 0 ? Math.max(positiveCount, negativeCount) / total : 0.5;

    const summary = ImpactAnalyzer.generateImpactSummary(metrics, behaviorChanges, overall);

    return {
      overall,
      confidence,
      summary,
    };
  }

  private static generateImpactSummary(
    metrics: ImpactMetric[],
    behaviorChanges: ImpactAnalysis['behaviorChanges'],
    overall: 'positive' | 'negative' | 'neutral'
  ): string {
    const significantMetrics = metrics.filter((m) => Math.abs(m.change.percentage) > 5);

    if (significantMetrics.length === 0 && behaviorChanges.length === 0) {
      return 'No significant changes detected.';
    }

    const metricSummary = significantMetrics
      .map(
        (m) => `${m.name}: ${m.change.percentage > 0 ? '+' : ''}${m.change.percentage.toFixed(1)}%`
      )
      .join(', ');

    const changeSummary =
      behaviorChanges.length > 0 ? ` ${behaviorChanges.length} behavior change(s) detected.` : '';

    return `Overall impact is ${overall}. Key changes: ${metricSummary}.${changeSummary}`;
  }

  private static generateRecommendations(
    metrics: ImpactMetric[],
    behaviorChanges: ImpactAnalysis['behaviorChanges'],
    impact: ImpactAnalysis['impact']
  ): ImpactAnalysis['recommendations'] {
    const recommendations: ImpactAnalysis['recommendations'] = [];

    if (impact.overall === 'negative' && impact.confidence > 0.7) {
      recommendations.push({
        type: 'rollback',
        priority: 'high',
        description: 'Consider rolling back due to significant negative impact',
      });
    }

    const highSeverityChanges = behaviorChanges.filter((c) => c.severity === 'high');
    if (highSeverityChanges.length > 0) {
      recommendations.push({
        type: 'investigate',
        priority: 'high',
        description: `Investigate ${highSeverityChanges.length} high-severity behavior change(s)`,
      });
    }

    const degradedMetrics = metrics.filter((m) => m.change.direction === 'degradation');
    if (degradedMetrics.length > 0 && impact.overall !== 'negative') {
      recommendations.push({
        type: 'monitor',
        priority: 'medium',
        description: `Monitor ${degradedMetrics.length} metric(s) showing degradation`,
      });
    }

    const improvedMetrics = metrics.filter((m) => m.change.direction === 'improvement');
    if (improvedMetrics.length > 0) {
      recommendations.push({
        type: 'optimize',
        priority: 'low',
        description: `Consider optimizing further based on ${improvedMetrics.length} improved metric(s)`,
      });
    }

    return recommendations.length > 0 ? recommendations : undefined;
  }

  private static average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}
