import type { Event } from '../types/events.js';

/**
 * Fields of event data that differ between two runs doing the same thing: random ids, clock
 * readings and token counts. They are never compared, at any depth.
 */
export const VOLATILE_EVENT_FIELDS: readonly string[] = [
  'agentId',
  'approvalId',
  'delayMs',
  'duration',
  'durationMs',
  'elapsedMs',
  'eventId',
  'observedAt',
  'recordedAt',
  'replayOf',
  'sourceEventId',
  'usage',
];

/** How two events recorded by different runs relate once aligned. */
export type AlignedEvent =
  | { kind: 'same'; expected: Event; actual: Event; expectedIndex: number; actualIndex: number }
  | {
      kind: 'changed';
      expected: Event;
      actual: Event;
      expectedIndex: number;
      actualIndex: number;
      /** The type changed (`action.executed` became `action.failed`), not only the data. */
      typeChanged: boolean;
      /** Where the data first differs (`parameters.metric: "churn" → "revenue"`). */
      detail: string;
    }
  | { kind: 'moved'; expected: Event; actual: Event; expectedIndex: number; actualIndex: number }
  | { kind: 'removed'; expected: Event; expectedIndex: number }
  | { kind: 'added'; actual: Event; actualIndex: number };

export interface AlignmentOptions {
  /** Keys of `data` also left out of the comparison, at any depth. */
  ignoredFields?: readonly string[];
}

/**
 * Aligns the events of two runs by what they mean, never by their ids (every run has new
 * ones): an event is identified by its type and its subject (the tool, the policy, the
 * operation, the answer), in order. The longest common sequence of those is paired first;
 * each pair is `same` or `changed` depending on its data. Between two pairs, an event whose
 * type changed for the same subject (`action.executed` → `action.failed` for one tool) is
 * `changed`; an identical event found at another position is `moved`; the rest is `removed`
 * (only in `expected`) or `added` (only in `actual`).
 */
export function alignEvents(
  expected: readonly Event[],
  actual: readonly Event[],
  options: AlignmentOptions = {}
): AlignedEvent[] {
  const ignored = new Set([...VOLATILE_EVENT_FIELDS, ...(options.ignoredFields ?? [])]);
  const expectedSubjects = expected.map(eventSubject);
  const actualSubjects = actual.map(eventSubject);
  const expectedKeys = expected.map((event, index) => keyOf(event, expectedSubjects[index]));
  const actualKeys = actual.map((event, index) => keyOf(event, actualSubjects[index]));
  const anchors = longestCommonSubsequence(expectedKeys, actualKeys);
  const actualData = new Map<number, unknown>();
  const dataOfActual = (index: number) => {
    if (!actualData.has(index)) {
      actualData.set(index, comparableData(actual[index] as Event, ignored));
    }
    return actualData.get(index);
  };

  const steps: Array<{ order: number; tie: number; step: AlignedEvent }> = [];
  const pairedExpected = new Set<number>();
  const pairedActual = new Set<number>();

  for (const [expectedIndex, actualIndex] of anchors) {
    pairedExpected.add(expectedIndex);
    pairedActual.add(actualIndex);
    const expectedEvent = expected[expectedIndex] as Event;
    const actualEvent = actual[actualIndex] as Event;
    const detail = firstDifference(
      comparableData(expectedEvent, ignored),
      dataOfActual(actualIndex)
    );
    steps.push({
      order: expectedIndex,
      tie: 0,
      step: detail
        ? {
            kind: 'changed',
            expected: expectedEvent,
            actual: actualEvent,
            expectedIndex,
            actualIndex,
            typeChanged: false,
            detail,
          }
        : {
            kind: 'same',
            expected: expectedEvent,
            actual: actualEvent,
            expectedIndex,
            actualIndex,
          },
    });
  }

  // Between two anchors: an event whose type changed for the same subject, in order.
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [expected.length, actual.length]];
  for (let gap = 0; gap + 1 < bounds.length; gap++) {
    const [fromExpected, fromActual] = bounds[gap] as [number, number];
    const [toExpected, toActual] = bounds[gap + 1] as [number, number];
    for (let expectedIndex = fromExpected + 1; expectedIndex < toExpected; expectedIndex++) {
      const expectedEvent = expected[expectedIndex] as Event;
      for (let actualIndex = fromActual + 1; actualIndex < toActual; actualIndex++) {
        const actualEvent = actual[actualIndex] as Event;
        // Same family (`action`, `run`, `tool`…) and subject, another type.
        if (
          pairedActual.has(actualIndex) ||
          family(expectedEvent) !== family(actualEvent) ||
          expectedSubjects[expectedIndex] !== actualSubjects[actualIndex]
        ) {
          continue;
        }
        pairedExpected.add(expectedIndex);
        pairedActual.add(actualIndex);
        steps.push({
          order: expectedIndex,
          tie: 0,
          step: {
            kind: 'changed',
            expected: expectedEvent,
            actual: actualEvent,
            expectedIndex,
            actualIndex,
            typeChanged: true,
            detail: `${expectedEvent.type} → ${actualEvent.type}`,
          },
        });
        break;
      }
    }
  }

  // An identical event at another position has moved.
  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex++) {
    if (pairedExpected.has(expectedIndex)) continue;
    const expectedEvent = expected[expectedIndex] as Event;
    const expectedData = comparableData(expectedEvent, ignored);
    for (let actualIndex = 0; actualIndex < actual.length; actualIndex++) {
      if (
        pairedActual.has(actualIndex) ||
        actualKeys[actualIndex] !== expectedKeys[expectedIndex]
      ) {
        continue;
      }
      const actualEvent = actual[actualIndex] as Event;
      if (firstDifference(expectedData, dataOfActual(actualIndex))) continue;
      pairedExpected.add(expectedIndex);
      pairedActual.add(actualIndex);
      steps.push({
        order: expectedIndex,
        tie: 0,
        step: {
          kind: 'moved',
          expected: expectedEvent,
          actual: actualEvent,
          expectedIndex,
          actualIndex,
        },
      });
      break;
    }
  }

  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex++) {
    if (pairedExpected.has(expectedIndex)) continue;
    steps.push({
      order: expectedIndex,
      tie: 0,
      step: { kind: 'removed', expected: expected[expectedIndex] as Event, expectedIndex },
    });
  }
  // An added event is listed before the next paired event, after what its gap removed.
  let anchor = 0;
  for (let actualIndex = 0; actualIndex < actual.length; actualIndex++) {
    while (anchor < anchors.length && (anchors[anchor] as [number, number])[1] < actualIndex) {
      anchor++;
    }
    if (pairedActual.has(actualIndex)) continue;
    const next =
      anchor < anchors.length ? (anchors[anchor] as [number, number])[0] : expected.length;
    steps.push({
      order: next - 0.5,
      tie: actualIndex,
      step: { kind: 'added', actual: actual[actualIndex] as Event, actualIndex },
    });
  }

  return steps.sort((a, b) => a.order - b.order || a.tie - b.tie).map(({ step }) => step);
}

/** What an event is about, besides its type: the tool, the policy, the operation… */
export function eventSubject(event: Event): string {
  const data = event.data ?? {};
  const tool = toolNameOf(data);
  switch (event.type) {
    case 'intention.generated':
      return firstToolCallName(data) ?? 'answer';
    case 'policy.checked':
    case 'policy.violated':
    case 'approval.requested':
    case 'approval.approved':
    case 'approval.rejected':
      return `${policiesOf(data)}|${tool ?? ''}`;
    case 'resource.read':
      return stringField(data, 'uri') ?? '';
    default:
      return tool ?? stringField(data, 'operation') ?? '';
  }
}

/** The data compared: volatile and ignored fields removed, tool arguments parsed. */
export function comparableData(event: Event, ignored: ReadonlySet<string>): unknown {
  const data = withoutFields(event.data ?? {}, ignored);
  if (event.type !== 'intention.generated' || !isRecord(data) || !Array.isArray(data.toolCalls)) {
    return data;
  }
  // The model's JSON arguments: `{"a":1}` and `{ "a": 1 }` mean the same call.
  return {
    ...data,
    toolCalls: data.toolCalls.map((call) => {
      const fn = isRecord(call) ? call.function : undefined;
      if (!isRecord(fn) || typeof fn.arguments !== 'string') return call;
      try {
        return { ...call, function: { ...fn, arguments: JSON.parse(fn.arguments) } };
      } catch {
        return call;
      }
    }),
  };
}

/** The first place where two JSON values differ, as `path: expected → actual`; null if equal. */
export function firstDifference(expected: unknown, actual: unknown, path = ''): string | null {
  if (expected === actual || Object.is(expected, actual)) return null;
  const at = path ? `${path}: ` : '';
  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
      if (index >= expected.length) return `${at}${describe(actual[index])} added at [${index}]`;
      if (index >= actual.length) return `${at}${describe(expected[index])} missing at [${index}]`;
      const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const difference = firstDifference(expected[key], actual[key], path ? `${path}.${key}` : key);
      if (difference) return difference;
    }
    return null;
  }
  return `${at}${describe(expected)} → ${describe(actual)}`;
}

/** What aligns two events: their type and their subject. */
function keyOf(event: Event, subject: string | undefined): string {
  return `${event.type}\u0000${subject ?? ''}`;
}

function family(event: Event): string {
  return event.type.split('.')[0] ?? event.type;
}

/**
 * Pairs of indexes of a longest common subsequence of two key lists. The common start and end
 * are paired directly; the rest uses a dynamic program, split in halves (Hirschberg) when it
 * would not fit in `denseLimit` cells, so memory stays linear in the length of the runs.
 */
export function longestCommonSubsequence(
  a: readonly string[],
  b: readonly string[],
  denseLimit = 1 << 20
): Array<[number, number]> {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < start; index++) pairs.push([index, index]);
  split(a, start, endA, b, start, endB, denseLimit, pairs);
  for (let offset = 0; endA + offset < a.length; offset++) {
    pairs.push([endA + offset, endB + offset]);
  }
  return pairs;
}

function split(
  a: readonly string[],
  aStart: number,
  aEnd: number,
  b: readonly string[],
  bStart: number,
  bEnd: number,
  denseLimit: number,
  out: Array<[number, number]>
): void {
  const rows = aEnd - aStart;
  const columns = bEnd - bStart;
  if (rows === 0 || columns === 0) return;
  if ((rows + 1) * (columns + 1) <= denseLimit || rows === 1) {
    dense(a, aStart, aEnd, b, bStart, bEnd, out);
    return;
  }
  const middle = aStart + Math.floor(rows / 2);
  const forward = lengths(a, aStart, middle, b, bStart, bEnd, false);
  const backward = lengths(a, middle, aEnd, b, bStart, bEnd, true);
  let best = 0;
  let bestScore = -1;
  for (let column = 0; column <= columns; column++) {
    const score = (forward[column] ?? 0) + (backward[column] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = column;
    }
  }
  split(a, aStart, middle, b, bStart, bStart + best, denseLimit, out);
  split(a, middle, aEnd, b, bStart + best, bEnd, denseLimit, out);
}

/**
 * Longest common subsequence lengths of `a[aStart..aEnd)` with every prefix of `b[bStart..bEnd)`
 * (entry `j`: with `b[bStart..bStart+j)`), or, reversed, with every suffix (entry `j`: with
 * `b[bStart+j..bEnd)`). One row at a time.
 */
function lengths(
  a: readonly string[],
  aStart: number,
  aEnd: number,
  b: readonly string[],
  bStart: number,
  bEnd: number,
  reversed: boolean
): Uint32Array {
  const columns = bEnd - bStart;
  let previous = new Uint32Array(columns + 1);
  let current = new Uint32Array(columns + 1);
  for (let step = 0; step < aEnd - aStart; step++) {
    const key = a[reversed ? aEnd - 1 - step : aStart + step];
    current.fill(0);
    for (let offset = 1; offset <= columns; offset++) {
      const column = reversed ? columns - offset : offset;
      const other = b[reversed ? bStart + column : bStart + column - 1];
      const diagonal = reversed ? (previous[column + 1] ?? 0) : (previous[column - 1] ?? 0);
      const side = reversed ? (current[column + 1] ?? 0) : (current[column - 1] ?? 0);
      current[column] = key === other ? diagonal + 1 : Math.max(previous[column] ?? 0, side);
    }
    [previous, current] = [current, previous];
  }
  return previous;
}

function dense(
  a: readonly string[],
  aStart: number,
  aEnd: number,
  b: readonly string[],
  bStart: number,
  bEnd: number,
  out: Array<[number, number]>
): void {
  const rows = aEnd - aStart;
  const columns = bEnd - bStart;
  const width = columns + 1;
  // table[i * width + j]: length for a[aStart + i..aEnd) and b[bStart + j..bEnd).
  const table = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      table[i * width + j] =
        a[aStart + i] === b[bStart + j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (a[aStart + i] === b[bStart + j]) {
      out.push([aStart + i, bStart + j]);
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
}

function withoutFields(value: unknown, ignored: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutFields(item, ignored));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!ignored.has(key)) result[key] = withoutFields(item, ignored);
  }
  return result;
}

function toolNameOf(data: Record<string, unknown>): string | undefined {
  const intention = data.intention;
  return (
    stringField(data, 'toolName') ??
    (isRecord(intention) ? stringField(intention, 'toolName') : undefined)
  );
}

function firstToolCallName(data: Record<string, unknown>): string | undefined {
  const calls = data.toolCalls;
  const first: unknown = Array.isArray(calls) ? calls[0] : undefined;
  const fn = isRecord(first) ? first.function : undefined;
  return isRecord(fn) ? stringField(fn, 'name') : undefined;
}

function policiesOf(data: Record<string, unknown>): string {
  const violated = data.violatedPolicies;
  if (Array.isArray(violated)) return violated.filter((id) => typeof id === 'string').join(',');
  return stringField(data, 'policyId') ?? '';
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
