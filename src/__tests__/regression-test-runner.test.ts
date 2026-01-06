import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegressionTestRunner } from '../utils/regression-test-runner.js';
import type { RegressionTestSuite, RegressionTestOptions } from '../types/regression-test.js';
import type { Agent } from '../types/agent.js';
import type { RegressionReport } from '../types/regression.js';

describe('RegressionTestRunner', () => {
  let mockAgent: Agent;
  let mockDetectRegressions: (runId: string, goldenTraceId: string) => Promise<RegressionReport>;

  beforeEach(() => {
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      run: vi.fn(),
    } as unknown as AgentImpl;

    mockDetectRegressions = vi.fn();
  });

  const createTestSuite = (goldenTraces: Array<{ goldenTraceId: string; name: string; input: unknown; tags?: string[] }>): RegressionTestSuite => ({
    id: 'suite-1',
    name: 'Test Suite',
    agentId: 'test-agent',
    goldenTraces,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it('should run tests sequentially by default', async () => {
    const suite = createTestSuite([
      { goldenTraceId: 'gt-1', name: 'Test 1', input: { message: 'Hello' } },
      { goldenTraceId: 'gt-2', name: 'Test 2', input: { message: 'World' } },
    ]);

    (mockAgent.run as ReturnType<typeof vi.fn>).mockResolvedValue({ runId: 'run-1' });
    mockDetectRegressions = vi.fn().mockResolvedValue({
      status: 'no_regression',
      regressions: [],
      summary: { totalRegressions: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    } as RegressionReport);

    const result = await RegressionTestRunner.runTestSuite(
      suite,
      mockAgent,
      mockDetectRegressions,
      {}
    );

    expect(result.totalTests).toBe(2);
    expect(result.passedTests).toBe(2);
    expect(mockAgent.run).toHaveBeenCalledTimes(2);
  });

  it('should run tests in parallel when option is set', async () => {
    const suite = createTestSuite([
      { goldenTraceId: 'gt-1', name: 'Test 1', input: { message: 'Hello' } },
      { goldenTraceId: 'gt-2', name: 'Test 2', input: { message: 'World' } },
    ]);

    (mockAgent.run as ReturnType<typeof vi.fn>).mockResolvedValue({ runId: 'run-1' });
    mockDetectRegressions = vi.fn().mockResolvedValue({
      status: 'no_regression',
      regressions: [],
      summary: { totalRegressions: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    } as RegressionReport);

    const options: RegressionTestOptions = {
      parallel: true,
    };

    const result = await RegressionTestRunner.runTestSuite(
      suite,
      mockAgent,
      mockDetectRegressions,
      options
    );

    expect(result.totalTests).toBe(2);
    expect(result.passedTests).toBe(2);
  });

  it('should stop on first failure when option is set', async () => {
    const suite = createTestSuite([
      { goldenTraceId: 'gt-1', name: 'Test 1', input: { message: 'Hello' } },
      { goldenTraceId: 'gt-2', name: 'Test 2', input: { message: 'World' } },
    ]);

    (mockAgent.run as ReturnType<typeof vi.fn>).mockResolvedValue({ runId: 'run-1' });
    let callCount = 0;
    mockDetectRegressions = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 'regressions_detected',
          regressions: [],
          summary: { totalRegressions: 1, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
        } as RegressionReport);
      }
      return Promise.resolve({
        status: 'no_regression',
        regressions: [],
        summary: { totalRegressions: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
      } as RegressionReport);
    });

    const options: RegressionTestOptions = {
      stopOnFirstFailure: true,
    };

    const result = await RegressionTestRunner.runTestSuite(
      suite,
      mockAgent,
      mockDetectRegressions,
      options
    );

    expect(result.failedTests).toBeGreaterThan(0);
  });

  it('should filter tests by tags', async () => {
    const suite = createTestSuite([
      { goldenTraceId: 'gt-1', name: 'Test 1', input: { message: 'Hello' }, tags: ['smoke'] },
      { goldenTraceId: 'gt-2', name: 'Test 2', input: { message: 'World' }, tags: ['integration'] },
    ]);

    (mockAgent.run as ReturnType<typeof vi.fn>).mockResolvedValue({ runId: 'run-1' });
    mockDetectRegressions = vi.fn().mockResolvedValue({
      status: 'no_regression',
      regressions: [],
      summary: { totalRegressions: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    } as RegressionReport);

    const options: RegressionTestOptions = {
      filterTags: ['smoke'],
    };

    const result = await RegressionTestRunner.runTestSuite(
      suite,
      mockAgent,
      mockDetectRegressions,
      options
    );

    expect(result.totalTests).toBe(1);
  });

  it('should calculate summary correctly', async () => {
    const suite = createTestSuite([
      { goldenTraceId: 'gt-1', name: 'Test 1', input: { message: 'Hello' } },
    ]);

    (mockAgent.run as ReturnType<typeof vi.fn>).mockResolvedValue({ runId: 'run-1' });
    mockDetectRegressions = vi.fn().mockResolvedValue({
      status: 'no_regression',
      regressions: [],
      summary: { totalRegressions: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
    } as RegressionReport);

    const result = await RegressionTestRunner.runTestSuite(
      suite,
      mockAgent,
      mockDetectRegressions,
      {}
    );

    expect(result.summary.passRate).toBe(1);
    expect(result.summary.averageDuration).toBeGreaterThanOrEqual(0);
    expect(result.summary.criticalRegressions).toBe(0);
  });
});

