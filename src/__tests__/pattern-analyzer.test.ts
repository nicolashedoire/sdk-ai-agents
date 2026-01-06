import { describe, it, expect } from 'vitest';
import { PatternAnalyzer } from '../utils/pattern-analyzer.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

describe('PatternAnalyzer', () => {
  it('should analyze patterns across multiple runs', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'run.started',
            timestamp: 1000,
            data: {},
            metadata: { agentId: 'agent-1' },
          },
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'tool.called',
            timestamp: 2000,
            data: { toolName: 'tool_a' },
            metadata: { agentId: 'agent-1' },
          },
        ],
      },
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'run.started',
            timestamp: 3000,
            data: {},
            metadata: { agentId: 'agent-1' },
          },
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'tool.called',
            timestamp: 4000,
            data: { toolName: 'tool_a' },
            metadata: { agentId: 'agent-1' },
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs, { agentId: 'agent-1' });

    expect(analysis.runsAnalyzed).toBe(2);
    expect(analysis.patterns.length).toBeGreaterThan(0);
    expect(analysis.summary.totalPatterns).toBeGreaterThan(0);
  });

  it('should identify tool choice patterns', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'tool.called',
            timestamp: 1000,
            data: { toolName: 'search_tool' },
          },
        ],
      },
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'tool.called',
            timestamp: 2000,
            data: { toolName: 'search_tool' },
          },
        ],
      },
      {
        runId: 'run-3',
        events: [
          {
            id: generateEventId(),
            runId: 'run-3',
            type: 'tool.called',
            timestamp: 3000,
            data: { toolName: 'search_tool' },
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs);

    const toolPattern = analysis.patterns.find((p) => p.type === 'tool_choice' && p.metadata?.toolName === 'search_tool');
    expect(toolPattern).toBeDefined();
    expect(toolPattern?.frequency).toBe(3);
    expect(toolPattern?.percentage).toBe(100);
  });

  it('should identify policy violation patterns', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'policy.checked',
            timestamp: 1000,
            data: {
              rule: 'block_sensitive',
              allowed: false,
            },
          },
        ],
      },
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'policy.checked',
            timestamp: 2000,
            data: {
              rule: 'block_sensitive',
              allowed: false,
            },
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs);

    const policyPattern = analysis.patterns.find(
      (p) => p.type === 'policy_violation' && p.metadata?.policyId === 'block_sensitive'
    );
    expect(policyPattern).toBeDefined();
    expect(policyPattern?.frequency).toBe(2);
  });

  it('should identify approval request patterns', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'approval.requested',
            timestamp: 1000,
            data: {},
          },
        ],
      },
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'approval.requested',
            timestamp: 2000,
            data: {},
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs);

    const approvalPattern = analysis.patterns.find((p) => p.type === 'approval_request');
    expect(approvalPattern).toBeDefined();
    expect(approvalPattern?.frequency).toBe(2);
  });

  it('should calculate trends', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      // First half - tool_a used once
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'tool.called',
            timestamp: 1000,
            data: { toolName: 'tool_a' },
          },
        ],
      },
      // Second half - tool_a used twice
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'tool.called',
            timestamp: 2000,
            data: { toolName: 'tool_a' },
          },
        ],
      },
      {
        runId: 'run-3',
        events: [
          {
            id: generateEventId(),
            runId: 'run-3',
            type: 'tool.called',
            timestamp: 3000,
            data: { toolName: 'tool_a' },
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs);

    const toolPattern = analysis.patterns.find(
      (p) => p.type === 'tool_choice' && p.metadata?.toolName === 'tool_a'
    );
    expect(toolPattern?.trend).toBeDefined();
  });

  it('should generate insights', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'policy.checked',
            timestamp: 1000,
            data: {
              rule: 'block_sensitive',
              allowed: false,
            },
          },
        ],
      },
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'policy.checked',
            timestamp: 2000,
            data: {
              rule: 'block_sensitive',
              allowed: false,
            },
          },
        ],
      },
      {
        runId: 'run-3',
        events: [
          {
            id: generateEventId(),
            runId: 'run-3',
            type: 'policy.checked',
            timestamp: 3000,
            data: {
              rule: 'block_sensitive',
              allowed: false,
            },
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs);

    expect(analysis.insights.length).toBeGreaterThan(0);
    const criticalInsight = analysis.insights.find((i) => i.severity === 'critical');
    expect(criticalInsight).toBeDefined();
  });

  it('should filter by minimum frequency', () => {
    const runs: Array<{ runId: string; events: Event[] }> = [
      {
        runId: 'run-1',
        events: [
          {
            id: generateEventId(),
            runId: 'run-1',
            type: 'tool.called',
            timestamp: 1000,
            data: { toolName: 'tool_a' },
          },
        ],
      },
      {
        runId: 'run-2',
        events: [
          {
            id: generateEventId(),
            runId: 'run-2',
            type: 'tool.called',
            timestamp: 2000,
            data: { toolName: 'tool_b' },
          },
        ],
      },
    ];

    const analysis = PatternAnalyzer.analyzePatterns(runs, { minFrequency: 2 });

    // Both tools appear only once, so they should be filtered out
    expect(analysis.patterns.length).toBe(0);
  });

  it('should handle empty runs', () => {
    const analysis = PatternAnalyzer.analyzePatterns([]);

    expect(analysis.runsAnalyzed).toBe(0);
    expect(analysis.patterns.length).toBe(0);
    expect(analysis.insights.length).toBe(0);
  });
});

