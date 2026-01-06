import { describe, it, expect } from 'vitest';
import { TestResultsExporter } from '../utils/test-results-exporter.js';
import type { RegressionTestSuiteResult } from '../types/regression-test.js';
import type { RegressionReport } from '../types/regression.js';

describe('TestResultsExporter', () => {
  const createTestResult = (): RegressionTestSuiteResult => ({
    suiteId: 'suite-1',
    agentId: 'agent-1',
    executedAt: Date.now(),
    totalTests: 3,
    passedTests: 2,
    failedTests: 1,
    errorTests: 0,
    timeoutTests: 0,
    duration: 1500,
    results: [
      {
        goldenTraceId: 'gt-1',
        runId: 'run-1',
        status: 'pass',
        duration: 500,
      },
      {
        goldenTraceId: 'gt-2',
        runId: 'run-2',
        status: 'pass',
        duration: 400,
      },
      {
        goldenTraceId: 'gt-3',
        runId: 'run-3',
        status: 'fail',
        duration: 600,
        regressionReport: {
          runId: 'run-3',
          goldenTraceId: 'gt-3',
          detectedAt: Date.now(),
          status: 'regressions_detected',
          regressions: [
            {
              type: 'behavioral',
              severity: 'critical',
              impact: 'high',
              description: 'Result differs from expected',
              differences: [],
            },
          ],
          summary: {
            totalRegressions: 1,
            criticalCount: 1,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
          },
          metrics: {
            similarityScore: 0.85,
            eventCountDiff: 2,
            durationDiff: 100,
          },
        } as RegressionReport,
      },
    ],
    summary: {
      passRate: 2 / 3,
      averageDuration: 500,
      criticalRegressions: 1,
    },
  });

  it('should export JUnit XML format', async () => {
    const results = createTestResult();
    const xml = await TestResultsExporter.export(results, 'junit');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites>');
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('errors="0"');
    expect(xml).toContain('<testcase');
    expect(xml).toContain('name="gt-1"');
    expect(xml).toContain('name="gt-3"');
    expect(xml).toContain('<failure');
  });

  it('should export JSON format with details', async () => {
    const results = createTestResult();
    const json = await TestResultsExporter.export(results, 'json', { includeDetails: true });

    const parsed = JSON.parse(json);
    expect(parsed.suiteId).toBe('suite-1');
    expect(parsed.agentId).toBe('agent-1');
    expect(parsed.summary.totalTests).toBe(3);
    expect(parsed.summary.passedTests).toBe(2);
    expect(parsed.summary.failedTests).toBe(1);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[2].regressionReport).toBeDefined();
  });

  it('should export JSON summary format', async () => {
    const results = createTestResult();
    const json = await TestResultsExporter.export(results, 'json-summary');

    const parsed = JSON.parse(json);
    expect(parsed.suiteId).toBe('suite-1');
    expect(parsed.agentId).toBe('agent-1');
    expect(parsed.summary).toBeDefined();
    expect(parsed.results).toBeUndefined();
  });

  it('should calculate exit code correctly', () => {
    const results = createTestResult();
    const exitCode = TestResultsExporter.calculateExitCode(results);

    expect(exitCode).toBe(1);
  });

  it('should return exit code 0 for all passing tests', () => {
    const results: RegressionTestSuiteResult = {
      suiteId: 'suite-1',
      agentId: 'agent-1',
      executedAt: Date.now(),
      totalTests: 2,
      passedTests: 2,
      failedTests: 0,
      errorTests: 0,
      timeoutTests: 0,
      duration: 1000,
      results: [
        {
          goldenTraceId: 'gt-1',
          runId: 'run-1',
          status: 'pass',
          duration: 500,
        },
        {
          goldenTraceId: 'gt-2',
          runId: 'run-2',
          status: 'pass',
          duration: 500,
        },
      ],
      summary: {
        passRate: 1,
        averageDuration: 500,
        criticalRegressions: 0,
      },
    };

    const exitCode = TestResultsExporter.calculateExitCode(results);
    expect(exitCode).toBe(0);
  });

  it('should return exit code 2 for error tests', () => {
    const results: RegressionTestSuiteResult = {
      suiteId: 'suite-1',
      agentId: 'agent-1',
      executedAt: Date.now(),
      totalTests: 1,
      passedTests: 0,
      failedTests: 0,
      errorTests: 1,
      timeoutTests: 0,
      duration: 1000,
      results: [
        {
          goldenTraceId: 'gt-1',
          runId: 'run-1',
          status: 'error',
          duration: 500,
          error: 'Test error',
        },
      ],
      summary: {
        passRate: 0,
        averageDuration: 500,
        criticalRegressions: 0,
      },
    };

    const exitCode = TestResultsExporter.calculateExitCode(results);
    expect(exitCode).toBe(2);
  });

  it('should escape XML special characters', async () => {
    const results: RegressionTestSuiteResult = {
      suiteId: 'suite-1',
      agentId: 'agent-1',
      executedAt: Date.now(),
      totalTests: 1,
      passedTests: 0,
      failedTests: 1,
      errorTests: 0,
      timeoutTests: 0,
      duration: 1000,
      results: [
        {
          goldenTraceId: 'gt-1',
          runId: 'run-1',
          status: 'fail',
          duration: 500,
          regressionReport: {
            runId: 'run-1',
            goldenTraceId: 'gt-1',
            detectedAt: Date.now(),
            status: 'regressions_detected',
            regressions: [
              {
                type: 'behavioral',
                severity: 'critical',
                impact: 'high',
                description: 'Error with <special> & "characters"',
                differences: [],
              },
            ],
            summary: {
              totalRegressions: 1,
              criticalCount: 1,
              highCount: 0,
              mediumCount: 0,
              lowCount: 0,
            },
            metrics: {
              similarityScore: 0.85,
              eventCountDiff: 2,
              durationDiff: 100,
            },
          } as RegressionReport,
        },
      ],
      summary: {
        passRate: 0,
        averageDuration: 500,
        criticalRegressions: 1,
      },
    };

    const xml = await TestResultsExporter.export(results, 'junit');
    expect(xml).toContain('&lt;special&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;characters&quot;');
  });
});

