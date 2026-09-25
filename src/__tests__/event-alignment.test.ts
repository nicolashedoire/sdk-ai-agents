import { describe, expect, it } from 'vitest';
import type { Event } from '../types/events.js';
import type { AdvancedEventFilter } from '../types/advanced-event-filter.js';
import type { Trace } from '../types/sdk.js';
import { AdvancedEventFilterEvaluator } from '../utils/advanced-event-filter.js';
import { alignEvents, longestCommonSubsequence } from '../utils/event-alignment.js';
import { RegressionDetector } from '../utils/regression-detector.js';
import { RunComparator } from '../utils/run-comparator.js';
import { TraceValidator } from '../utils/trace-validator.js';

type Step = [Event['type'], Record<string, unknown>?];

/** A run as the SDK records it: every event gets an id of its own run, one ms apart. */
function run(runId: string, steps: Step[], start = 1_000): Event[] {
  return steps.map(([type, data = {}], index) => ({
    id: `evt_${runId}_${index}`,
    runId,
    type,
    timestamp: start + index,
    data,
    metadata: { agentId: `agent_of_${runId}` },
  }));
}

function trace(events: Event[]): Trace {
  const count = (type: Event['type']) => events.filter((event) => event.type === type).length;
  return {
    runId: events[0]?.runId ?? 'run',
    agentId: 'agent',
    status: 'completed',
    events,
    timeline: [],
    summary: {
      totalEvents: events.length,
      duration: (events.at(-1)?.timestamp ?? 0) - (events[0]?.timestamp ?? 0),
      intentionsGenerated: count('intention.generated'),
      actionsExecuted: count('action.executed'),
      policiesChecked: count('policy.checked'),
      toolsCalled: count('tool.called'),
    },
  };
}

const call = (metric: string, args = `{"metric":"${metric}"}`): Step[] => [
  ['intention.generated', { toolCalls: [{ function: { name: 'lookup', arguments: args } }] }],
  ['tool.called', { toolName: 'lookup', parameters: { metric } }],
  ['action.executed', { toolName: 'lookup', parameters: { metric }, result: '4%', duration: 12 }],
];

const reference: Step[] = [
  ['run.started', { input: { message: 'churn?' } }],
  ...call('churn'),
  ['intention.generated', { message: 'Churn is 4%' }],
  ['run.completed', { output: 'Churn is 4%' }],
];

describe('alignEvents', () => {
  it('pairs the events of two runs that did the same thing, whatever their ids', () => {
    const aligned = alignEvents(run('a', reference), run('b', reference, 9_000));

    expect(aligned.map((step) => step.kind)).toEqual(reference.map(() => 'same'));
  });

  it('leaves out the values the SDK writes that change between runs, at their place only', () => {
    const volatile: Step[] = reference.map(([type, data]) => [
      type,
      type === 'action.executed'
        ? { ...data, duration: 999 }
        : type === 'intention.generated'
          ? { ...data, usage: { promptTokens: 7 } }
          : data,
    ]);
    const spaced = [
      reference[0] as Step,
      ...call('churn', '{ "metric": "churn" }'),
      ...reference.slice(4),
    ];
    const changed = [reference[0] as Step, ...call('revenue'), ...reference.slice(4)];

    expect(
      alignEvents(run('a', reference), run('b', volatile)).every((s) => s.kind === 'same')
    ).toBe(true);
    // The model's JSON arguments are compared parsed.
    expect(alignEvents(run('a', reference), run('b', spaced)).every((s) => s.kind === 'same')).toBe(
      true
    );
    expect(
      alignEvents(run('a', reference), run('b', changed))
        .filter((step) => step.kind === 'changed')
        .map((step) => (step.kind === 'changed' ? step.detail : ''))
    ).toEqual([
      'toolCalls[0].function.arguments.metric: "churn" → "revenue"',
      'parameters.metric: "churn" → "revenue"',
      'parameters.metric: "churn" → "revenue"',
    ]);
  });

  it("compares a tool's own keys whatever their names (duration, usage, agentId…)", () => {
    const meeting = (duration: number): Step[] => [
      ['tool.called', { toolName: 'schedule', parameters: { title: 'Sync', duration } }],
      [
        'action.executed',
        {
          toolName: 'schedule',
          parameters: { title: 'Sync', duration },
          result: { usage: duration, agentId: 'room-1', eventId: 'e1' },
          duration: 3,
        },
      ],
    ];

    const changes = alignEvents(run('a', meeting(30)), run('b', meeting(60))).filter(
      (step) => step.kind !== 'same'
    );

    // Before, `duration` (and `usage`, `agentId`…) were dropped at every depth: no change seen.
    expect(changes.map((step) => (step.kind === 'changed' ? step.detail : step.kind))).toEqual([
      'parameters.duration: 30 → 60',
      'parameters.duration: 30 → 60',
    ]);
    const result: Step[] = [
      ['action.executed', { toolName: 'schedule', result: { usage: 1, agentId: 'a' } }],
    ];
    const otherResult: Step[] = [
      ['action.executed', { toolName: 'schedule', result: { usage: 2, agentId: 'b' } }],
    ];
    expect(alignEvents(run('a', result), run('b', otherResult))).toMatchObject([
      { kind: 'changed', detail: 'result.agentId: "a" → "b"' },
    ]);
  });

  it('compares the text a model writes next to a tool call only in its intention', () => {
    const withText = (text: string): Step[] => [
      [
        'intention.generated',
        { message: text, toolCalls: [{ function: { name: 'lookup', arguments: '{}' } }] },
      ],
      [
        'action.executing',
        { intention: { type: 'tool_call', toolName: 'lookup', parameters: {}, reasoning: text } },
      ],
      [
        'policy.checked',
        {
          intention: { type: 'tool_call', toolName: 'lookup', parameters: {}, reasoning: text },
          validation: { allowed: true },
        },
      ],
    ];

    const changes = alignEvents(
      run('a', withText('Let me look.')),
      run('b', withText('Checking now.'))
    ).filter((step) => step.kind !== 'same');

    // Before, the same call with another preamble also changed action.executing and policy.checked.
    expect(changes).toMatchObject([{ kind: 'changed', expected: { type: 'intention.generated' } }]);
  });

  it('reports an event added in the middle once, without shifting the others', () => {
    const retried: Step[] = [
      ...reference.slice(0, 3),
      ['tool.retry', { toolName: 'lookup', retry: 1, delayMs: 100 }],
      ...reference.slice(3),
    ];

    const aligned = alignEvents(run('a', reference), run('b', retried));

    expect(aligned.filter((step) => step.kind !== 'same')).toMatchObject([
      { kind: 'added', actualIndex: 3, actual: { type: 'tool.retry' } },
    ]);
    // Listed where it happened: after the tool call, before the tool's result.
    expect(aligned.map((step) => step.kind)).toEqual([
      'same',
      'same',
      'same',
      'added',
      'same',
      'same',
      'same',
    ]);
  });

  it('pairs an event whose type changed for the same tool', () => {
    const failed: Step[] = [
      ...reference.slice(0, 3),
      ['action.failed', { toolName: 'lookup', parameters: { metric: 'churn' }, error: 'down' }],
      ['run.failed', { error: 'down' }],
    ];

    const changes = alignEvents(run('a', reference), run('b', failed)).filter(
      (step) => step.kind !== 'same'
    );

    expect(changes).toMatchObject([
      { kind: 'changed', typeChanged: true, detail: 'action.executed → action.failed' },
      { kind: 'removed', expected: { type: 'intention.generated' } },
      { kind: 'changed', typeChanged: true, detail: 'run.completed → run.failed' },
    ]);
  });

  it('reports a call inserted before an identical one as added, not as a changed call', () => {
    const search = (query: string): Step[] => [
      [
        'intention.generated',
        { toolCalls: [{ function: { name: 'search', arguments: `{"q":"${query}"}` } }] },
      ],
      [
        'action.executing',
        { intention: { type: 'tool_call', toolName: 'search', parameters: { q: query } } },
      ],
      [
        'policy.checked',
        { intention: { type: 'tool_call', toolName: 'search', parameters: { q: query } } },
      ],
      ['tool.called', { toolName: 'search', parameters: { q: query } }],
      ['action.executed', { toolName: 'search', parameters: { q: query }, result: query }],
    ];
    const golden: Step[] = [['run.started', {}], ...search('a'), ['run.completed', {}]];
    const extra: Step[] = [
      ['run.started', {}],
      ...search('b'),
      ...search('a'),
      ['run.completed', {}],
    ];

    const changes = alignEvents(run('a', golden), run('b', extra)).filter(
      (step) => step.kind !== 'same'
    );

    // Before: search(b) was paired with the golden search(a) (5 changes), and search(a) added.
    expect(changes.map((step) => step.kind)).toEqual(['added', 'added', 'added', 'added', 'added']);
    expect(changes.map((step) => (step.kind === 'added' ? step.actualIndex : -1))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('leaves out the token usage of discarded answers and failed operations', () => {
    const discarded = (tokens: number, reason: string): Step[] => [
      [
        'provider.answer_discarded',
        { provider: 'openai', model: 'm', usage: { promptTokens: tokens }, reason },
      ],
      [
        'cognition.operation_failed',
        { step: 1, operation: 'simulate', error: 'bad reply', usage: { promptTokens: tokens } },
      ],
    ];

    expect(
      alignEvents(
        run('a', discarded(10, 'invalid JSON')),
        run('b', discarded(99, 'invalid JSON'))
      ).map((step) => step.kind)
    ).toEqual(['same', 'same']);
    // The reason is compared: the answer was discarded for something else.
    expect(
      alignEvents(run('a', discarded(10, 'invalid JSON')), run('b', discarded(10, 'refused'))).map(
        (step) => (step.kind === 'changed' ? step.detail : step.kind)
      )
    ).toEqual(['reason: "invalid JSON" → "refused"', 'same']);
  });

  it('pairs a policy check that became a violation for the same tool as one change', () => {
    const intention = { type: 'tool_call', toolName: 'refund', parameters: { amount: 90 } };
    const allowed: Step[] = [['policy.checked', { intention, validation: { allowed: true } }]];
    const denied: Step[] = [
      ['policy.violated', { intention, reason: 'over the limit', violatedPolicies: ['caps'] }],
    ];

    expect(alignEvents(run('a', allowed), run('b', denied))).toMatchObject([
      { kind: 'changed', typeChanged: true, detail: 'policy.checked → policy.violated' },
    ]);
  });

  it('reports an identical event found at another position as moved', () => {
    const steps: Step[] = [
      ['run.started', {}],
      ['policy.checked', { policyId: 'budget' }],
      ['policy.checked', { policyId: 'allowlist' }],
      ['run.completed', {}],
    ];
    const swapped = [steps[0], steps[2], steps[1], steps[3]] as Step[];

    const changes = alignEvents(run('a', steps), run('b', swapped)).filter(
      (step) => step.kind !== 'same'
    );

    expect(changes).toMatchObject([{ kind: 'moved', expectedIndex: 1, actualIndex: 2 }]);
  });
});

describe('longestCommonSubsequence', () => {
  /** Deterministic pseudo-random keys from a small alphabet (many ties). */
  function keys(seed: number, length: number): string[] {
    let state = seed;
    return Array.from({ length }, () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return String.fromCharCode(97 + (state % 5));
    });
  }

  function assertCommonSubsequence(a: string[], b: string[], pairs: Array<[number, number]>): void {
    pairs.forEach(([i, j], index) => {
      expect(a[i]).toBe(b[j]);
      const previous = pairs[index - 1];
      if (previous) {
        expect(i).toBeGreaterThan(previous[0]);
        expect(j).toBeGreaterThan(previous[1]);
      }
    });
  }

  it('finds a longest common subsequence in linear memory as well as with a full table', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = keys(seed, 40 + seed);
      const b = keys(seed * 7, 35 + 2 * seed);
      const dense = longestCommonSubsequence(a, b);
      // A limit of 16 cells forces the split in halves on every sub-problem.
      const split = longestCommonSubsequence(a, b, 16);

      assertCommonSubsequence(a, b, dense);
      assertCommonSubsequence(a, b, split);
      expect(split).toHaveLength(dense.length);
    }
  });

  it('aligns long runs that differ all along, beyond the size of a full table', () => {
    // 1 500 × 1 500 events after the common start: more cells than the default dense limit.
    const a = Array.from({ length: 1_500 }, (_, index) => `event-${index % 40}`);
    const b = a.map((key, index) => (index % 10 === 5 ? 'retry' : key));

    const pairs = longestCommonSubsequence(a, b);

    // At least every event left unchanged.
    expect(pairs.length).toBeGreaterThanOrEqual(1_350);
    assertCommonSubsequence(a, b, pairs);
  });
});

describe('TraceValidator and RegressionDetector without event ids', () => {
  it('passes a run that did the same thing later', () => {
    const validation = TraceValidator.validate(
      trace(run('b', reference, 50_000)),
      trace(run('a', reference)),
      'golden'
    );

    expect(validation).toMatchObject({ status: 'pass', differences: [] });
  });

  it('compares timing relative to the start of each run, only with a tolerance', () => {
    const late = run('b', reference, 50_000).map((event, index) =>
      index === 4 ? { ...event, timestamp: event.timestamp + 40 } : event
    );

    const lenient = TraceValidator.validate(trace(late), trace(run('a', reference)), 'g', {
      tolerance: { timestampMs: 50 },
    });
    const strict = TraceValidator.validate(trace(late), trace(run('a', reference)), 'g', {
      tolerance: { timestampMs: 10 },
    });

    expect(lenient.status).toBe('pass');
    expect(strict.differences).toMatchObject([
      {
        type: 'event_modified',
        expectedIndex: 4,
        details:
          'intention.generated (answer) happened 44 ms after the start instead of 4 ms (tolerance: 10 ms)',
      },
    ]);
  });

  it('checks duration only when asked, and never flags a faster run', () => {
    const slow = trace(run('b', reference));
    slow.summary.duration += 500;
    const fast = trace(run('c', reference));
    fast.summary.duration = 0;
    const golden = trace(run('a', reference));

    expect(RegressionDetector.detect(slow, golden, 'g').status).toBe('no_regression');
    expect(
      RegressionDetector.detect(fast, golden, 'g', { tolerance: { maxDurationDiff: 0 } }).status
    ).toBe('no_regression');
    expect(
      RegressionDetector.detect(slow, golden, 'g', { severityThresholds: { high: 400 } })
        .regressions
    ).toMatchObject([{ type: 'performance', severity: 'high' }]);
  });

  it('tolerates a few added process events, never a change of the result', () => {
    const retried: Step[] = [
      ...reference.slice(0, 2),
      ['tool.retry', { toolName: 'lookup', retry: 1 }],
      ...reference.slice(2),
    ];
    const golden = trace(run('a', reference));

    const tolerated = RegressionDetector.detect(trace(run('b', retried)), golden, 'g', {
      tolerance: { maxEventCountDiff: 1 },
    });
    const strict = RegressionDetector.detect(trace(run('b', retried)), golden, 'g');
    const answered: Step[] = [...reference.slice(0, -1), ['run.completed', { output: 'No idea' }]];
    const other = RegressionDetector.detect(trace(run('c', answered)), golden, 'g', {
      tolerance: { maxEventCountDiff: 5 },
    });
    const ignored = RegressionDetector.detect(trace(run('c', answered)), golden, 'g', {
      tolerance: { ignoreDataFields: ['output'] },
    });

    expect(tolerated.status).toBe('no_regression');
    expect(strict.regressions).toMatchObject([{ severity: 'medium', impact: 'process' }]);
    expect(other.regressions).toMatchObject([
      { severity: 'high', impact: 'result', location: { eventType: 'run.completed' } },
    ]);
    expect(ignored.status).toBe('no_regression');
  });
});

describe('TraceValidator statuses', () => {
  const changedAnswer: Step[] = [
    ...reference.slice(0, -1),
    ['run.completed', { output: 'No idea' }],
  ];

  it('fails on a data difference even when timing is ignored', () => {
    const validation = TraceValidator.validate(
      trace(run('b', changedAnswer)),
      trace(run('a', reference)),
      'g',
      { ignoreTimestampDiff: true }
    );

    // Before, ignoreTimestampDiff turned every modification into `partial`.
    expect(validation.status).toBe('fail');
  });

  it('gives partial only for data differences in a structure-only comparison', () => {
    const failed: Step[] = [
      ...reference.slice(0, 3),
      ['action.failed', { toolName: 'lookup', parameters: { metric: 'churn' }, error: 'down' }],
      ...reference.slice(4),
    ];
    const golden = trace(run('a', reference));

    const data = TraceValidator.validate(trace(run('b', changedAnswer)), golden, 'g', {
      compareStructureOnly: true,
    });
    const type = TraceValidator.validate(trace(run('c', failed)), golden, 'g', {
      compareStructureOnly: true,
    });

    expect(data.status).toBe('partial');
    expect(type.differences).toMatchObject([{ type: 'event_modified' }]);
    expect(type.status).toBe('fail');
  });
});

describe('RunComparator without event ids', () => {
  it('finds no difference between two runs that did the same thing', () => {
    const comparison = RunComparator.compare(
      trace(run('a', reference)),
      trace(run('b', reference, 7_000)),
      { includeMetadata: true }
    );

    // The agent id in the metadata is new in every process: not a difference.
    expect(comparison.differences).toEqual([]);
  });

  it('compares the metadata of changed events too, with includeMetadata', () => {
    const golden = run('a', reference);
    const other = run('b', [...reference.slice(0, -1), ['run.completed', { output: 'No idea' }]]);
    const last = other.at(-1) as Event;
    last.metadata = { ...last.metadata, agentVersion: '2.0.0' };

    const comparison = RunComparator.compare(trace(golden), trace(other), {
      includeMetadata: true,
    });

    // Before, the metadata of a pair whose data changed was not compared.
    expect(comparison.differences.map((difference) => difference.details)).toEqual([
      'run.completed data differs: output: "Churn is 4%" → "No idea"',
      'run.completed metadata differs: agentVersion: nothing → "2.0.0"',
    ]);
  });

  it('reports only structural changes with compareStructureOnly', () => {
    const changed = [reference[0] as Step, ...call('revenue'), ...reference.slice(4)];

    const full = RunComparator.compare(trace(run('a', reference)), trace(run('b', changed)));
    const structure = RunComparator.compare(trace(run('a', reference)), trace(run('b', changed)), {
      compareStructureOnly: true,
    });

    expect(full.differences.map((difference) => difference.type)).toEqual([
      'data_changed',
      'data_changed',
      'data_changed',
    ]);
    expect(structure.differences).toEqual([]);
  });
});

describe('AdvancedEventFilterEvaluator', () => {
  const [started, , called] = run('a', reference.slice(0, 3));
  const evaluate = (event: Event | undefined, filter: AdvancedEventFilter) =>
    AdvancedEventFilterEvaluator.evaluate(event as Event, filter);

  it('combines every condition with `or`, and negates only the conditions with `not`', () => {
    const toolOrStart: AdvancedEventFilter = {
      logic: 'or',
      type: 'tool.called',
      dataFilters: [{ path: 'input.message', operator: 'eq', value: 'churn?' }],
    };

    expect(evaluate(started, toolOrStart)).toBe(true);
    expect(evaluate(called, toolOrStart)).toBe(true);
    // `not` keeps the events in scope that do not match; the scope itself is not negated.
    expect(evaluate(started, { type: 'tool.called', not: true })).toBe(true);
    expect(evaluate(started, { runId: 'other', type: 'tool.called', not: true })).toBe(false);
    expect(evaluate(called, { since: 5_000, type: 'run.started', not: true })).toBe(false);
  });
});
