import type { EventType } from './events.js';

export interface RegressionDetectionOptions {
  tolerance?: {
    maxDurationDiff?: number;
    maxEventCountDiff?: number;
    criticalEventTypes?: EventType[];
    ignoreEventTypes?: EventType[];
  };
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
    durationDiff: number;
    eventCountDiff: number;
    similarityScore: number;
  };
}
