export interface DecisionPattern {
  id: string;
  type: 'tool_choice' | 'policy_violation' | 'approval_request' | 'intention_type' | 'rejection_reason';
  pattern: string;
  description: string;
  frequency: number;
  percentage: number;
  runs: string[];
  firstSeen: number;
  lastSeen: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
  metadata?: {
    toolName?: string;
    policyId?: string;
    intentionType?: string;
    rejectionReason?: string;
  };
}

export interface PatternInsight {
  id: string;
  type: 'frequent_choice' | 'trending_up' | 'trending_down' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  patternId?: string;
  recommendation?: string;
}

export interface DecisionPatternAnalysis {
  agentId?: string;
  userId?: string;
  sessionId?: string;
  timeRange: {
    start: number;
    end: number;
  };
  runsAnalyzed: number;
  patterns: DecisionPattern[];
  insights: PatternInsight[];
  summary: {
    totalPatterns: number;
    mostFrequentPattern?: DecisionPattern;
    patternsByType: Record<string, number>;
    averagePatternFrequency: number;
  };
}

