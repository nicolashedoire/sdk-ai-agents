export type ReasoningNodeType = 'intention' | 'action' | 'tool' | 'policy' | 'decision' | 'start' | 'end';

export interface ReasoningNode {
  id: string;
  type: ReasoningNodeType;
  label: string;
  timestamp: number;
  data?: {
    intention?: {
      type: string;
      toolName?: string;
      reasoning?: string;
    };
    action?: {
      type: string;
      toolName?: string;
      result?: unknown;
    };
    tool?: {
      name: string;
      parameters?: Record<string, unknown>;
      result?: unknown;
    };
    policy?: {
      rule: string;
      result: 'allowed' | 'denied' | 'requires_approval';
      reason?: string;
    };
    decision?: {
      choice: string;
      alternatives?: string[];
      reasoning?: string;
    };
  };
  metadata?: Record<string, unknown>;
}

export interface ReasoningEdge {
  id: string;
  source: string;
  target: string;
  type: 'leads_to' | 'triggers' | 'validates' | 'rejects' | 'approves';
  label?: string;
  data?: Record<string, unknown>;
}

export interface ReasoningGraph {
  runId: string;
  agentId?: string;
  nodes: ReasoningNode[];
  edges: ReasoningEdge[];
  metadata?: {
    startedAt?: number;
    completedAt?: number;
    totalSteps?: number;
    totalTools?: number;
    totalPolicies?: number;
  };
}

