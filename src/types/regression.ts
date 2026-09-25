import type { EventType } from './events.js';

export interface RegressionDetectionOptions {
  tolerance?: {
    /**
     * A run slower than the golden one by at most this many ms is not a regression. Duration
     * is only checked when this or `severityThresholds` is set; a faster run never regresses.
     */
    maxDurationDiff?: number;
    /**
     * Up to this many events added or removed are tolerated when none of them is critical or
     * affects the result (policy checks, retries, approvals…); beyond it, all are reported.
     */
    maxEventCountDiff?: number;
    /** Event types whose appearance, loss or change is critical (default: every failure type). */
    criticalEventTypes?: EventType[];
    /** Event types left out of the comparison. */
    ignoreEventTypes?: EventType[];
    /** Keys of event data left out of the comparison, at any depth (e.g. `output`). */
    ignoreDataFields?: string[];
  };
  /** A slowdown of at least this many ms has this severity (below `medium`: low). */
  severityThresholds?: {
    critical?: number;
    high?: number;
    medium?: number;
  };
}

export interface Regression {
  id: string;
  type: 'behavioral' | 'performance' | 'structural';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  expected: unknown;
  actual: unknown;
  impact: 'result' | 'process';
  location?: {
    eventId?: string;
    eventType?: EventType;
    timestamp?: number;
  };
}

export interface RegressionReport {
  runId: string;
  goldenTraceId: string;
  detectedAt: number;
  status: 'no_regression' | 'regressions_detected' | 'error';
  regressions: Regression[];
  summary: {
    totalRegressions: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  metrics: {
    /** Run duration minus the golden one, in ms. */
    durationDiff: number;
    /** Number of compared events minus the golden one's. */
    eventCountDiff: number;
    /** Share of the compared events found unchanged, in order (1: the same run). */
    similarityScore: number;
  };
}
