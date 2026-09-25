import { v4 as uuidv4 } from 'uuid';
import { TraceValidator } from './trace-validator.js';
import type { Trace } from '../types/sdk.js';
import type { EventType } from '../types/events.js';
import type { ValidationDifference } from '../types/validation.js';
import type {
  RegressionDetectionOptions,
  Regression,
  RegressionReport,
} from '../types/regression.js';

const DEFAULT_CRITICAL_TYPES: EventType[] = [
  'run.failed',
  'action.failed',
  'tool.failed',
  'policy.violated',
];

const RESULT_AFFECTING_TYPES: EventType[] = [
  'action.executed',
  'tool.called',
  'intention.generated',
  'run.completed',
];

/**
 * Compares a run with a golden trace (by what the events mean, see `TraceValidator`) and
 * classifies each difference as a regression. The run regresses when any regression is left
 * after the tolerances.
 */
export class RegressionDetector {
  static detect(
    actualTrace: Trace,
    expectedTrace: Trace,
    goldenTraceId: string,
    options: RegressionDetectionOptions = {}
  ): RegressionReport {
    const comparison = TraceValidator.compare(actualTrace, expectedTrace, {
      ...(options.tolerance?.ignoreEventTypes
        ? { ignoreEventTypes: options.tolerance.ignoreEventTypes }
        : {}),
      ...(options.tolerance?.ignoreDataFields
        ? { tolerance: { dataFields: options.tolerance.ignoreDataFields } }
        : {}),
    });

    const behavioral = comparison.differences.map((difference) =>
      RegressionDetector.classifyDifference(difference, options)
    );
    const regressions = RegressionDetector.applyEventCountTolerance(behavioral, options);
    const performance = RegressionDetector.detectPerformanceRegression(
      expectedTrace,
      actualTrace,
      options
    );
    if (performance) regressions.push(performance);

    const largest = Math.max(comparison.expectedCount, comparison.actualCount);
    return {
      runId: actualTrace.runId,
      goldenTraceId,
      detectedAt: Date.now(),
      status: regressions.length === 0 ? 'no_regression' : 'regressions_detected',
      regressions,
      summary: RegressionDetector.calculateSummary(regressions),
      metrics: {
        durationDiff: actualTrace.summary.duration - expectedTrace.summary.duration,
        eventCountDiff: comparison.actualCount - comparison.expectedCount,
        similarityScore: largest === 0 ? 1 : comparison.unchanged / largest,
      },
    };
  }

  private static classifyDifference(
    diff: ValidationDifference,
    options: RegressionDetectionOptions
  ): Regression {
    const eventType = diff.eventType ?? diff.expected?.type ?? diff.actual?.type;
    let type: Regression['type'] = 'behavioral';
    let severity: Regression['severity'];
    let impact: Regression['impact'];

    if (diff.type === 'event_order_changed') {
      type = 'structural';
      severity = 'medium';
      impact = 'process';
    } else if (
      RegressionDetector.isCriticalEventType(eventType, options) ||
      // An event that became a failure (e.g. action.executed → action.failed) is critical.
      RegressionDetector.isCriticalEventType(diff.actual?.type, options)
    ) {
      severity = 'critical';
      impact = 'result';
    } else if (eventType && RESULT_AFFECTING_TYPES.includes(eventType)) {
      severity = 'high';
      impact = 'result';
    } else {
      severity = 'medium';
      impact = 'process';
    }

    return {
      id: uuidv4(),
      type,
      severity,
      description: diff.details,
      expected: diff.expected,
      actual: diff.actual,
      impact,
      location: {
        eventId: diff.eventId,
        eventType,
        timestamp: diff.expected?.timestamp ?? diff.actual?.timestamp,
      },
    };
  }

  /** Drops added or removed process events when there are no more than `maxEventCountDiff`. */
  private static applyEventCountTolerance(
    regressions: Regression[],
    options: RegressionDetectionOptions
  ): Regression[] {
    const tolerated = options.tolerance?.maxEventCountDiff;
    if (tolerated === undefined) return regressions;
    const isProcessEvent = (regression: Regression) =>
      regression.type === 'behavioral' &&
      regression.impact === 'process' &&
      (regression.expected === undefined || regression.actual === undefined);
    const processEvents = regressions.filter(isProcessEvent);
    return processEvents.length <= tolerated
      ? regressions.filter((regression) => !isProcessEvent(regression))
      : regressions;
  }

  /**
   * A run slower than the golden one. Checked only when `tolerance.maxDurationDiff` or
   * `severityThresholds` is given: durations always vary a little between runs.
   */
  private static detectPerformanceRegression(
    expectedTrace: Trace,
    actualTrace: Trace,
    options: RegressionDetectionOptions
  ): Regression | null {
    const maxDurationDiff = options.tolerance?.maxDurationDiff;
    if (maxDurationDiff === undefined && !options.severityThresholds) return null;
    const durationDiff = actualTrace.summary.duration - expectedTrace.summary.duration;
    if (durationDiff <= (maxDurationDiff ?? 0)) return null;

    return {
      id: uuidv4(),
      type: 'performance',
      severity: RegressionDetector.determinePerformanceSeverity(durationDiff, options),
      description: `Duration changed by ${durationDiff}ms (expected: ${expectedTrace.summary.duration}ms, actual: ${actualTrace.summary.duration}ms)`,
      expected: expectedTrace.summary.duration,
      actual: actualTrace.summary.duration,
      impact: 'process',
      location: {
        timestamp: actualTrace.events[0]?.timestamp,
      },
    };
  }

  private static determinePerformanceSeverity(
    durationDiff: number,
    options: RegressionDetectionOptions
  ): Regression['severity'] {
    const thresholds = options.severityThresholds || {};
    if (thresholds.critical !== undefined && durationDiff >= thresholds.critical) return 'critical';
    if (thresholds.high !== undefined && durationDiff >= thresholds.high) return 'high';
    if (thresholds.medium !== undefined && durationDiff >= thresholds.medium) return 'medium';
    return 'low';
  }

  private static isCriticalEventType(
    eventType: EventType | undefined,
    options: RegressionDetectionOptions
  ): boolean {
    if (!eventType) return false;
    return (options.tolerance?.criticalEventTypes ?? DEFAULT_CRITICAL_TYPES).includes(eventType);
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
