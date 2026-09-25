import type { Event, EventType } from '../types/events.js';
import { stableJson } from './stable-json.js';

/** A path inside event data; `*` stands for every element of an array. */
type DataPath = readonly string[];

/**
 * Where the SDK itself writes values that differ between two runs doing the same thing: clock
 * readings, token counts, random ids. Only these paths are left out of comparisons: a tool's
 * parameters, result or input are always compared, whatever their keys.
 */
export const VOLATILE_DATA_PATHS: Readonly<Partial<Record<EventType, readonly DataPath[]>>> = {
  'run.started': [['replayOf']],
  'run.completed': [['replayOf']],
  'run.failed': [['replayOf']],
  'run.stopped': [['agentId']],
  'intention.generated': [['usage']],
  'action.executed': [['duration']],
  'action.failed': [['duration']],
  'tool.retry': [['delayMs']],
  'provider.retry': [['delayMs']],
  'approval.requested': [['approvalId']],
  'approval.approved': [['approvalId']],
  'approval.rejected': [['approvalId']],
  'provider.answer_discarded': [['usage']],
  'decision.evaluated': [['usage']],
  'cognition.evaluated': [['durationMs']],
  'cognition.operation_failed': [['usage']],
  'study.model_called': [['usage']],
  // Each piece of evidence names the run that recorded it: the run's own, new id.
  'cognition.knowledge_recorded': [['findings', '*', 'evidence', '*', 'runId']],
  'cognition.started': [
    ['observations', '*', 'observedAt'],
    ['observations', '*', 'sourceEventId'],
  ],
  'cognition.thought': [
    ['usage'],
    ['patch', 'observations', '*', 'observedAt'],
    ['patch', 'observations', '*', 'sourceEventId'],
    ['patch', 'evaluations', '*', 'observation', 'observedAt'],
    ['patch', 'evaluations', '*', 'observation', 'sourceEventId'],
  ],
};

/** Metadata fields that change from one process to the next. */
export const VOLATILE_METADATA_FIELDS: readonly string[] = ['agentId'];

/**
 * Event types never compared. An `incident.reported` event records deliveries and throttling,
 * which depend on the process; the event that raised the incident is compared itself.
 */
export const UNCOMPARED_EVENT_TYPES: readonly EventType[] = ['incident.reported'];

/** The events of a run that comparisons look at. */
export function comparedEvents(events: readonly Event[]): Event[] {
  return events.filter((event) => !UNCOMPARED_EVENT_TYPES.includes(event.type));
}

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

/** A pair found by one of the passes: 0 identical, 1 same type and subject, 2 type changed. */
interface Pair {
  expectedIndex: number;
  actualIndex: number;
  pass: 0 | 1 | 2;
}

/**
 * Aligns the events of two runs by what they mean, never by their ids (every run has new
 * ones). An event is known by its type, its subject (the tool, the operation, the answer) and
 * its comparable data. Three passes pair them in order, each inside the gaps the previous one
 * left: identical events first (a longest common subsequence), then events of the same type
 * and subject whose data changed, then events of the same family and subject whose type
 * changed (`action.executed` → `action.failed` for one tool). An identical event found at
 * another position is `moved`; the rest is `removed` (only in `expected`) or `added` (only in
 * `actual`).
 */
export function alignEvents(
  expected: readonly Event[],
  actual: readonly Event[],
  options: AlignmentOptions = {}
): AlignedEvent[] {
  const ignored = options.ignoredFields ?? [];
  const expectedData = expected.map((event) => comparableData(event, ignored));
  const actualData = actual.map((event) => comparableData(event, ignored));
  const expectedSubjects = expected.map(eventSubject);
  const actualSubjects = actual.map(eventSubject);
  const keys = new Interner();
  const levels: Array<[string[], string[]]> = [
    [
      expected.map((event, i) =>
        keys.id(`${event.type}|${expectedSubjects[i]}|${stableJson(expectedData[i])}`)
      ),
      actual.map((event, i) =>
        keys.id(`${event.type}|${actualSubjects[i]}|${stableJson(actualData[i])}`)
      ),
    ],
    [
      expected.map((event, i) => keys.id(`${event.type}|${expectedSubjects[i]}`)),
      actual.map((event, i) => keys.id(`${event.type}|${actualSubjects[i]}`)),
    ],
    [
      expected.map((event, i) => keys.id(`${family(event)}.*|${expectedSubjects[i]}`)),
      actual.map((event, i) => keys.id(`${family(event)}.*|${actualSubjects[i]}`)),
    ],
  ];

  const pairs: Pair[] = [];
  pairWithin(levels, 0, 0, expected.length, 0, actual.length, pairs);
  const pairedExpected = new Set(pairs.map((pair) => pair.expectedIndex));
  const pairedActual = new Set(pairs.map((pair) => pair.actualIndex));

  // An identical event left over on both sides has moved.
  const [identicalExpected, identicalActual] = levels[0] as [string[], string[]];
  const unpairedByKey = new Map<string, number[]>();
  actual.forEach((_, actualIndex) => {
    if (pairedActual.has(actualIndex)) return;
    const key = identicalActual[actualIndex] as string;
    unpairedByKey.set(key, [...(unpairedByKey.get(key) ?? []), actualIndex]);
  });
  const moves: Array<[number, number]> = [];
  expected.forEach((_, expectedIndex) => {
    if (pairedExpected.has(expectedIndex)) return;
    const candidates = unpairedByKey.get(identicalExpected[expectedIndex] as string);
    const actualIndex = candidates?.shift();
    if (actualIndex === undefined) return;
    moves.push([expectedIndex, actualIndex]);
    pairedExpected.add(expectedIndex);
    pairedActual.add(actualIndex);
  });

  const steps: Array<{ order: number; tie: number; step: AlignedEvent }> = [];
  for (const { expectedIndex, actualIndex, pass } of pairs) {
    const expectedEvent = expected[expectedIndex] as Event;
    const actualEvent = actual[actualIndex] as Event;
    const both = { expected: expectedEvent, actual: actualEvent, expectedIndex, actualIndex };
    const step: AlignedEvent =
      pass === 0
        ? { kind: 'same', ...both }
        : pass === 1
          ? {
              kind: 'changed',
              ...both,
              typeChanged: false,
              detail:
                firstDifference(expectedData[expectedIndex], actualData[actualIndex]) ??
                'data differs',
            }
          : {
              kind: 'changed',
              ...both,
              typeChanged: true,
              detail: `${expectedEvent.type} → ${actualEvent.type}`,
            };
    steps.push({ order: expectedIndex, tie: 0, step });
  }
  for (const [expectedIndex, actualIndex] of moves) {
    steps.push({
      order: expectedIndex,
      tie: 0,
      step: {
        kind: 'moved',
        expected: expected[expectedIndex] as Event,
        actual: actual[actualIndex] as Event,
        expectedIndex,
        actualIndex,
      },
    });
  }
  expected.forEach((event, expectedIndex) => {
    if (!pairedExpected.has(expectedIndex)) {
      steps.push({
        order: expectedIndex,
        tie: 0,
        step: { kind: 'removed', expected: event, expectedIndex },
      });
    }
  });
  // An added event is listed before the next paired event, after what its gap removed.
  const expectedOfActual = new Map(pairs.map((pair) => [pair.actualIndex, pair.expectedIndex]));
  let next = expected.length;
  for (let actualIndex = actual.length - 1; actualIndex >= 0; actualIndex--) {
    const pairedWith = expectedOfActual.get(actualIndex);
    if (pairedWith !== undefined) {
      next = pairedWith;
    } else if (!pairedActual.has(actualIndex)) {
      steps.push({
        order: next - 0.5,
        tie: actualIndex,
        step: { kind: 'added', actual: actual[actualIndex] as Event, actualIndex },
      });
    }
  }

  return steps.sort((a, b) => a.order - b.order || a.tie - b.tie).map(({ step }) => step);
}

/**
 * Pairs the events of `expected[fromExpected..toExpected)` and `actual[fromActual..toActual)`
 * with a longest common subsequence of the keys of one level, then each gap it leaves with the
 * next level. Pairs are in increasing order on both sides.
 */
function pairWithin(
  levels: Array<[string[], string[]]>,
  level: number,
  fromExpected: number,
  toExpected: number,
  fromActual: number,
  toActual: number,
  out: Pair[]
): void {
  const keys = levels[level];
  if (!keys || fromExpected >= toExpected || fromActual >= toActual) return;
  const found = longestCommonSubsequence(
    keys[0].slice(fromExpected, toExpected),
    keys[1].slice(fromActual, toActual)
  ).map(([e, a]): [number, number] => [e + fromExpected, a + fromActual]);
  let gapExpected = fromExpected;
  let gapActual = fromActual;
  for (const [expectedIndex, actualIndex] of found) {
    pairWithin(levels, level + 1, gapExpected, expectedIndex, gapActual, actualIndex, out);
    out.push({ expectedIndex, actualIndex, pass: level as Pair['pass'] });
    gapExpected = expectedIndex + 1;
    gapActual = actualIndex + 1;
  }
  pairWithin(levels, level + 1, gapExpected, toExpected, gapActual, toActual, out);
}

/** What an event is about, besides its type: the tool, the operation, the answer… */
export function eventSubject(event: Event): string {
  const data = event.data ?? {};
  switch (event.type) {
    case 'intention.generated':
      return firstToolCallName(data) ?? 'answer';
    case 'resource.read':
      return stringField(data, 'uri') ?? '';
    case 'provider.retry':
    case 'provider.answer_discarded':
      return stringField(data, 'provider') ?? '';
    case 'study.passage_started':
    case 'study.passage_completed':
    case 'study.search':
    case 'study.drift_rejected':
    case 'study.capability_demoted':
      return stringField(data, 'passage') ?? '';
    case 'study.model_called':
      return [stringField(data, 'purpose'), stringField(data, 'passage')].filter(Boolean).join(':');
    default:
      // Policy and approval events are about the call they check, like the action events.
      return toolNameOf(data) ?? stringField(data, 'operation') ?? '';
  }
}

/**
 * The data compared: the volatile values the SDK writes removed (`VOLATILE_DATA_PATHS`), the
 * keys the caller ignores removed at any depth, tool arguments parsed. The text a model writes
 * next to a tool call is compared once, in `intention.generated`: the copies other events carry
 * in their `intention.reasoning` are left out.
 */
export function comparableData(event: Event, ignoredFields: readonly string[] = []): unknown {
  let data: unknown = copy(event.data ?? {});
  for (const path of VOLATILE_DATA_PATHS[event.type] ?? []) {
    removePath(data, path);
  }
  if (isRecord(data)) {
    const intention = data.intention;
    if (isRecord(intention) && intention.type === 'tool_call') {
      intention.reasoning = undefined;
    }
  }
  if (ignoredFields.length > 0) {
    data = withoutFields(data, new Set(ignoredFields));
  }
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

/** Short ids for long keys, so the subsequence search compares short strings. */
class Interner {
  private readonly ids = new Map<string, string>();

  id(key: string): string {
    let id = this.ids.get(key);
    if (id === undefined) {
      id = String(this.ids.size);
      this.ids.set(key, id);
    }
    return id;
  }
}

function family(event: Event): string {
  return event.type.split('.')[0] ?? event.type;
}

/** A copy of the arrays and plain objects of a JSON value, which the caller may then edit. */
function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
}

/** Removes the value at `path` (`*` for each array element), wherever it exists. */
function removePath(value: unknown, path: DataPath): void {
  const [head, ...rest] = path;
  if (head === undefined) return;
  if (head === '*') {
    if (Array.isArray(value)) for (const item of value) removePath(item, rest);
    return;
  }
  if (!isRecord(value)) return;
  if (rest.length === 0) {
    value[head] = undefined;
  } else {
    removePath(value[head], rest);
  }
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
