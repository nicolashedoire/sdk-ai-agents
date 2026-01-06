export interface Alternative {
  id: string;
  type: 'intention' | 'tool_call' | 'action' | 'decision';
  description: string;
  timestamp: number;
  data?: {
    intention?: {
      type: string;
      toolName?: string;
      reasoning?: string;
    };
    toolCall?: {
      name: string;
      parameters?: Record<string, unknown>;
    };
    action?: {
      type: string;
      result?: unknown;
    };
    decision?: {
      choice: string;
      reasoning?: string;
    };
  };
  status: 'considered' | 'selected' | 'rejected' | 'not_executed';
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AlternativesAnalysis {
  runId: string;
  agentId?: string;
  decisionPoints: Array<{
    id: string;
    timestamp: number;
    context: string;
    alternatives: Alternative[];
    selectedAlternative?: Alternative;
    reasoning?: string;
  }>;
  summary: {
    totalAlternatives: number;
    selectedCount: number;
    rejectedCount: number;
    consideredCount: number;
    decisionPointsCount: number;
  };
}


