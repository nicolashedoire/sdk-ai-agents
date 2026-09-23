import { v4 as uuidv4 } from 'uuid';
import { TraceValidator } from './trace-validator.js';
import type { Trace } from '../types/sdk.js';
import type { Event, EventType } from '../types/events.js';
import type { ValidationDifference } from '../types/validation.js';
import type {
  RegressionDetectionOptions,
  Regression,
  RegressionReport,
} from '../types/regression.js';

export class RegressionDetector {
  static detect(
    actualTrace: Trace,
    expectedTrace: Trace,
    goldenTraceId: string,
    options: RegressionDetectionOptions = {}
  ): RegressionReport {
    const validationOptions = {
      ignoreEventTypes: options.tolerance?.ignoreEventTypes,
      ignoreTimestampDiff: false,
      compareStructureOnly: false,
    };

    const validationResult = TraceValidator.validate(
      actualTrace,
      expectedTrace,
      goldenTraceId,
      validationOptions
    );

    const regressions = RegressionDetector.classifyDifferences(
      validationResult.differences,
      expectedTrace,
      actualTrace,
      options
    );

    const filteredRegressions = RegressionDetector.applyTolerance(regressions, options);

    const metrics = RegressionDetector.calculateMetrics(expectedTrace, actualTrace);
    const status = RegressionDetector.determineStatus(filteredRegressions, metrics, options);
    const summary = RegressionDetector.calculateSummary(filteredRegressions);

    return {
      runId: actualTrace.runId,
      goldenTraceId,
      detectedAt: Date.now(),
      status,
      regressions: filteredRegressions,
      summary,
      metrics,
    };
  }

  private static classifyDifferences(
    differences: ValidationDifference[],
    expectedTrace: Trace,
    actualTrace: Trace,
    options: RegressionDetectionOptions
  ): Regression[] {
    const regressions: Regression[] = [];

    for (const diff of differences) {
      const regression = RegressionDetector.classifyDifference(
        diff,
        expectedTrace,
        actualTrace,
        options
      );
      if (regression) {
        regressions.push(regression);
      }
    }

    const performanceRegression = RegressionDetector.detectPerformanceRegression(
      expectedTrace,
      actualTrace,
      options
    );
    if (performanceRegression) {
      regressions.push(performanceRegression);
    }

    return regressions;
  }

  private static classifyDifference(
    diff: ValidationDifference,
    _expectedTrace: Trace,
    _actualTrace: Trace,
    options: RegressionDetectionOptions
  ): Regression | null {
    const id = uuidv4();
    let type: Regression['type'] = 'structural';
    let severity: Regression['severity'] = 'low';
    let impact: Regression['impact'] = 'process';

    if (diff.type === 'event_removed' || diff.type === 'event_added') {
      type = 'behavioral';
      const eventType = diff.eventType || diff.expected?.type || diff.actual?.type;

      if (RegressionDetector.isCriticalEventType(eventType, options)) {
        severity = 'critical';
        impact = 'result';
      } else if (RegressionDetector.isResultAffectingEvent(eventType)) {
        severity = 'high';
        impact = 'result';
      } else {
        severity = 'medium';
        impact = 'process';
      }
    } else if (diff.type === 'event_modified') {
      type = 'behavioral';
      const eventType = diff.eventType || diff.expected?.type;
      // An event that became a failure (e.g. action.executed → action.failed) is critical.
      const actualType = diff.actual?.type;

      if (
        RegressionDetector.isCriticalEventType(eventType, options) ||
        RegressionDetector.isCriticalEventType(actualType, options)
      ) {
        severity = 'critical';
        impact = 'result';
      } else if (RegressionDetector.isResultAffectingEvent(eventType)) {
        severity = 'high';
        impact = 'result';
      } else {
        severity = 'medium';
        impact = 'process';
      }
    } else if (diff.type === 'event_order_changed') {
      type = 'structural';
      severity = 'medium';
      impact = 'process';
    }

    return {
      id,
      type,
      severity,
      description: diff.details,
      expected: diff.expected,
      actual: diff.actual,
      impact,
      location: {
        eventId: diff.eventId,
        eventType: diff.eventType,
        timestamp: diff.expected?.timestamp || diff.actual?.timestamp,
      },
    };
  }

  private static detectPerformanceRegression(
    expectedTrace: Trace,
    actualTrace: Trace,
    options: RegressionDetectionOptions
  ): Regression | null {
    const durationDiff = actualTrace.summary.duration - expectedTrace.summary.duration;
    const maxDurationDiff = options.tolerance?.maxDurationDiff || 0;

    if (Math.abs(durationDiff) <= maxDurationDiff) {
      return null;
    }

    const severity = RegressionDetector.determinePerformanceSeverity(durationDiff, options);
    if (severity === null) {
      return null;
    }

    return {
      id: uuidv4(),
      type: 'performance',
      severity,
      description: `Duration changed by ${durationDiff}ms (expected: ${expectedTrace.summary.duration}ms, actual: ${actualTrace.summary.duration}ms)`,
      expected: expectedTrace.summary.duration,
      actual: actualTrace.summary.duration,
      impact: durationDiff > 0 ? 'process' : 'result',
      location: {
        timestamp: actualTrace.events[0]?.timestamp,
      },
    };
  }

  private static determinePerformanceSeverity(
    durationDiff: number,
    options: RegressionDetectionOptions
  ): Regression['severity'] | null {
    const absDiff = Math.abs(durationDiff);
    const thresholds = options.severityThresholds || {};

    if (thresholds.critical && absDiff >= thresholds.critical) {
      return 'critical';
    }
    if (thresholds.high && absDiff >= thresholds.high) {
      return 'high';
    }
    if (thresholds.medium && absDiff >= thresholds.medium) {
      return 'medium';
    }

    if (absDiff > 0) {
      return 'low';
    }

    return null;
  }

  private static isCriticalEventType(
    eventType: EventType | undefined,
    options: RegressionDetectionOptions
  ): boolean {
    if (!eventType) {
      return false;
    }

    const criticalTypes = options.tolerance?.criticalEventTypes || [
      'run.failed',
      'action.failed',
      'tool.failed',
      'policy.violated',
    ];

    return criticalTypes.includes(eventType);
  }

  private static isResultAffectingEvent(eventType: EventType | undefined): boolean {
    if (!eventType) {
      return false;
    }

    const resultAffectingTypes: EventType[] = [
      'action.executed',
      'tool.called',
      'intention.generated',
      'run.completed',
    ];

    return resultAffectingTypes.includes(eventType);
  }

  private static applyTolerance(
    regressions: Regression[],
    options: RegressionDetectionOptions
  ): Regression[] {
    const tolerance = options.tolerance || {};

    return regressions.filter((regression) => {
      if (regression.type === 'performance') {
        const durationDiff = Math.abs(
          (regression.actual as number) - (regression.expected as number)
        );
        if (tolerance.maxDurationDiff && durationDiff <= tolerance.maxDurationDiff) {
          return false;
        }
      }

      if (regression.type === 'structural') {
        const eventCountDiff = Math.abs(
          (regression.actual as number) - (regression.expected as number)
        );
        if (tolerance.maxEventCountDiff && eventCountDiff <= tolerance.maxEventCountDiff) {
          return false;
        }
      }

      return true;
    });
  }

  private static calculateMetrics(expectedTrace: Trace, actualTrace: Trace) {
    const durationDiff = actualTrace.summary.duration - expectedTrace.summary.duration;
    const eventCountDiff = actualTrace.summary.totalEvents - expectedTrace.summary.totalEvents;

    const totalEvents = Math.max(expectedTrace.events.length, actualTrace.events.length);
    const commonEvents = RegressionDetector.countCommonEvents(
      expectedTrace.events,
      actualTrace.events
    );
    const similarityScore = totalEvents > 0 ? commonEvents / totalEvents : 1;

    return {
      durationDiff,
      eventCountDiff,
      similarityScore,
    };
  }

  private static countCommonEvents(expected: Event[], actual: Event[]): number {
    const expectedIds = new Set(expected.map((e) => e.id));
    const actualIds = new Set(actual.map((e) => e.id));

    let common = 0;
    for (const id of expectedIds) {
      if (actualIds.has(id)) {
        common++;
      }
    }

    return common;
  }

  private static determineStatus(
    regressions: Regression[],
    metrics: RegressionReport['metrics'],
    options: RegressionDetectionOptions
  ): RegressionReport['status'] {
    if (regressions.length === 0) {
      return 'no_regression';
    }

    const criticalRegressions = regressions.filter((r) => r.severity === 'critical');
    if (criticalRegressions.length > 0) {
      return 'regressions_detected';
    }

    const tolerance = options.tolerance || {};
    if (
      tolerance.maxDurationDiff &&
      Math.abs(metrics.durationDiff) <= tolerance.maxDurationDiff &&
      tolerance.maxEventCountDiff &&
      Math.abs(metrics.eventCountDiff) <= tolerance.maxEventCountDiff
    ) {
      return 'no_regression';
    }

    return 'regressions_detected';
  }

  private static calculateSummary(regressions: Regression[]) {
    return {
      totalRegressions: regressions.length,
      criticalCount: regressions.filter((r) => r.severity === 'critical').length,
      highCount: regressions.filter((r) => r.severity === 'high').length,
      mediumCount: regressions.filter((r) => r.severity === 'medium').length,
      lowCount: regressions.filter((r) => r.severity === 'low').length,
    };
  }
}
