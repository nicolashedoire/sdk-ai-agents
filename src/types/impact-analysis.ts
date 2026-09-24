export interface ImpactAnalysisOptions {
  /** @deprecated Has no effect. */
  groupBy?: 'version' | 'configuration' | 'time' | 'user' | 'session';
  /**
   * Metrics to compute (default: all). `duration` (ms per run), `cost` (USD of the priced model
   * calls, as `getRunCost`), `quality` (share of a run's events that are not failed actions),
   * `success_rate` (share of completed runs).
   */
  metrics?: ('duration' | 'cost' | 'quality' | 'success_rate')[];
  includeRecommendations?: boolean;
}

export interface ImpactMetric {
  name: string;
  before: {
    average: number;
    min: number;
    max: number;
    count: number;
  };
  after: {
    average: number;
    min: number;
    max: number;
    count: number;
  };
  change: {
    absolute: number;
    percentage: number;
    direction: 'improvement' | 'degradation' | 'neutral';
  };
}

export interface ImpactAnalysis {
  id: string;
  beforeRunIds: string[];
  afterRunIds: string[];
  analyzedAt: number;
  metrics: ImpactMetric[];
  behaviorChanges: Array<{
    type: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    beforeValue: unknown;
    afterValue: unknown;
  }>;
  impact: {
    overall: 'positive' | 'negative' | 'neutral';
    confidence: number;
    summary: string;
  };
  recommendations?: Array<{
    type: 'rollback' | 'monitor' | 'optimize' | 'investigate';
    priority: 'high' | 'medium' | 'low';
    description: string;
  }>;
}
