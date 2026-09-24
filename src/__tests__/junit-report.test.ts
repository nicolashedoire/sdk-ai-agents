import { describe, expect, it } from 'vitest';
import type { RegressionTestSuiteResult } from '../types/regression-test.js';
import { TestResultsExporter } from '../utils/test-results-exporter.js';
import { elementsNamed, parseStrictXml } from './support/strict-xml.js';

/** A suite with one test per outcome, whose messages hold what logs often do. */
function suiteResult(): RegressionTestSuiteResult {
  const test = (name: string, status: 'pass' | 'fail' | 'error' | 'timeout', error?: string) => ({
    goldenTraceId: `gt-${name}`,
    name,
    runId: `run-${name}`,
    status,
    duration: 10,
    ...(error ? { error } : {}),
  });
  return {
    suiteId: 'suite-1',
    suiteName: 'refunds',
    agentId: 'agent-1',
    agentName: 'support',
    executedAt: 0,
    totalTests: 3,
    passedTests: 1,
    failedTests: 0,
    errorTests: 1,
    timeoutTests: 1,
    duration: 30,
    results: [
      test('passes', 'pass'),
      // A colored log line (ANSI escapes), a NUL and a lone surrogate from a cut emoji.
      test('crashes', 'error', '\u001b[31mTool crashed\u001b[0m\u0000 at step 2 \ud83d'),
      test('hangs', 'timeout', 'Test timeout after 30 ms'),
    ],
    summary: { passRate: 1 / 3, averageDuration: 10, criticalRegressions: 0 },
  };
}

describe('JUnit export', () => {
  it('writes XML that a strict parser reads, whatever the error messages hold', async () => {
    const xml = await TestResultsExporter.export(suiteResult(), 'junit');

    // Before, the escape character and the NUL made the document invalid XML 1.0.
    const root = parseStrictXml(xml);
    const [suite] = elementsNamed(root, 'testsuite');
    expect(suite?.attributes).toMatchObject({ tests: '3', failures: '0', errors: '2' });
    const [crashes] = elementsNamed(root, 'error');
    expect(crashes?.attributes.message).toBe('[31mTool crashed[0m at step 2 ');
  });

  it('writes the tests that could not run as errors, not failures', async () => {
    const root = parseStrictXml(await TestResultsExporter.export(suiteResult(), 'junit'));

    // Before, they were counted in errors="2" but written as <failure>.
    expect(elementsNamed(root, 'failure')).toEqual([]);
    expect(elementsNamed(root, 'error').map((element) => element.attributes.type)).toEqual([
      'error',
      'timeout',
    ]);
    const cases = elementsNamed(root, 'testcase');
    expect(cases.map((testCase) => [testCase.attributes.name, testCase.children.length])).toEqual([
      ['passes', 0],
      ['crashes', 1],
      ['hangs', 1],
    ]);
  });
});

describe('the strict XML checker used above', () => {
  it('refuses what a conforming parser refuses', () => {
    expect(() => parseStrictXml('<a>\u001b</a>')).toThrow(/U\+001b/);
    expect(() => parseStrictXml('<a>\ud83d</a>')).toThrow(/unpaired surrogate/);
    expect(() => parseStrictXml('<a>x & y</a>')).toThrow(/unescaped "&"/);
    expect(() => parseStrictXml('<a b="1" b="2"/>')).toThrow(/duplicated attribute/);
    expect(() => parseStrictXml('<a><b></a></b>')).toThrow(/closes/);
    expect(parseStrictXml('<a b="&lt;&#x41;">&amp;</a>')).toEqual({
      name: 'a',
      attributes: { b: '<A' },
      children: [],
      text: '&',
    });
  });
});
