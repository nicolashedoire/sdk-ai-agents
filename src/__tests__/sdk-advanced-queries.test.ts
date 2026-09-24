import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentImpl } from '../agent.js';
import { ValidationError } from '../errors/index.js';
import type { IEventStore } from '../stores/event-store.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { type PostgreSQLPool, PostgreSQLEventStore } from '../stores/postgresql-event-store.js';
import { SQLiteEventStore } from '../stores/sqlite-event-store.js';
import { defineTool } from '../sdk.js';
import type { Event, EventFilters } from '../types/events.js';
import { loadNodeSqlite } from './support/node-sqlite.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, lookupMetricDefinition, type TestSDK } from './support/test-sdk.js';

interface Recorded {
  env: TestSDK;
  analyst: AgentImpl;
  greeter: AgentImpl;
  /** Every event of every run, read run by run: what the queries must agree with. */
  events: Event[];
}

/**
 * Two analyst runs (one tool call each) and one greeter run, recorded in `eventStore`. Each
 * model call takes a moment, so the runs never share a millisecond.
 */
async function record(eventStore?: IEventStore): Promise<Recorded> {
  const env = createTestSDK(
    eventStore ? { eventStore } : {},
    new ScriptedLLMProvider({ delayMs: 2 })
  );
  const analyst = env.sdk.createAgent({
    name: 'analyst',
    model: 'test-model',
    tools: [defineTool(lookupMetricDefinition)],
  });
  const greeter = env.sdk.createAgent({ name: 'greeter', model: 'test-model' });
  const runIds: string[] = [];
  for (const metric of ['churn', 'revenue']) {
    env.provider.enqueue(
      'tool-selection',
      { toolCall: { name: 'lookup_metric', arguments: { metric } } },
      { content: `${metric} looked up` }
    );
    runIds.push((await analyst.run({ message: `What is our ${metric}?` })).runId);
  }
  env.provider.enqueue('default', { content: 'Hello!' });
  runIds.push((await greeter.run({ message: 'Hi' })).runId);
  const events = (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat();
  return { env, analyst, greeter, events };
}

/** The same questions, asked of any store. */
function describeQueries(storeName: string, createStore: () => IEventStore | undefined): void {
  describe(`advanced queries on ${storeName}`, () => {
    let recorded: Recorded | undefined;

    afterEach(async () => {
      await recorded?.env.dispose();
      recorded = undefined;
    });

    it('finds events across every run when no run is given', async () => {
      recorded = await record(createStore());
      const { env, events } = recorded;

      const result = await env.sdk.queryEventsAdvanced({ type: 'tool.called' });

      // Before, the file store threw: "requires queryEvents support in event store".
      expect(result.events.map((event) => event.data.parameters)).toEqual([
        { metric: 'churn' },
        { metric: 'revenue' },
      ]);
      expect(result).toMatchObject({ total: events.length, filtered: 2 });
    });

    it('negates the conditions with `not`, within the scope', async () => {
      recorded = await record(createStore());
      const { env, events, analyst } = recorded;
      const runId = events.find((event) => event.metadata?.agentId === analyst.id)?.runId ?? '';

      const notStarted = await env.sdk.countEventsAdvanced({ type: 'run.started', not: true });
      const notToolInRun = await env.sdk.queryEventsAdvanced({
        runId,
        type: 'tool.called',
        not: true,
      });

      // Before, SQLite counted 0: the store kept only run.started events, then `not` removed them.
      expect(notStarted).toBe(events.filter((event) => event.type !== 'run.started').length);
      const inRun = events.filter((event) => event.runId === runId);
      expect(notToolInRun).toMatchObject({
        total: inRun.length,
        filtered: inRun.length - 1,
      });
    });

    it('matches any condition with `or`', async () => {
      recorded = await record(createStore());
      const { env, events, greeter } = recorded;

      const count = await env.sdk.countEventsAdvanced({
        logic: 'or',
        type: 'tool.called',
        agentId: greeter.id,
        dataFilters: [{ path: 'output', operator: 'contains', value: 'revenue' }],
      });

      expect(count).toBe(
        events.filter(
          (event) =>
            event.type === 'tool.called' ||
            event.metadata?.agentId === greeter.id ||
            String(event.data.output ?? '').includes('revenue')
        ).length
      );
      expect(count).toBe(2 + 3 + 1);
    });

    it('counts the matching events by type and by agent', async () => {
      recorded = await record(createStore());
      const { env, events, analyst } = recorded;

      const statistics = await env.sdk.getEventStatistics({ agentId: analyst.id });

      const ofAnalyst = events.filter((event) => event.metadata?.agentId === analyst.id);
      const byType: Record<string, number> = {};
      for (const event of ofAnalyst) byType[event.type] = (byType[event.type] ?? 0) + 1;
      expect(statistics).toEqual({
        total: ofAnalyst.length,
        byType,
        byAgent: { [analyst.id]: ofAnalyst.length },
      });
    });

    it('keeps the first `limit` matching events, in time order', async () => {
      recorded = await record(createStore());
      const { env, events } = recorded;

      const result = await env.sdk.queryEventsAdvanced({ type: 'run.started', limit: 2 });

      expect(result.filtered).toBe(3);
      expect(result.events.map((event) => event.data.input)).toEqual([
        { message: 'What is our churn?' },
        { message: 'What is our revenue?' },
      ]);
      expect(result.total).toBe(events.length);
      await expect(env.sdk.queryEventsAdvanced({ limit: -1 })).rejects.toThrow(/limit/);
    });
  });
}

describeQueries('the file store (the default)', () => undefined);

const nodeSqlite = loadNodeSqlite();
if (nodeSqlite) {
  describeQueries(
    'SQLite (node:sqlite)',
    () => new SQLiteEventStore({ db: new nodeSqlite.DatabaseSync(':memory:') })
  );
} else {
  describe.skip('advanced queries on SQLite — skipped: this Node.js has no node:sqlite', () => {
    it('needs node:sqlite', () => undefined);
  });
}

/**
 * A pg pool double: it records every statement and answers as node-postgres does, with JSONB
 * columns already parsed and BIGINT values as strings.
 */
class RecordingPostgreSQLPool implements PostgreSQLPool {
  readonly statements: Array<{ sql: string; params: unknown[] }> = [];

  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/^\s*SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: String(this.rows.length) }] };
    if (/^\s*SELECT \*/.test(sql)) return { rows: this.rows };
    return { rows: [] };
  }

  async end(): Promise<void> {}
}

describe('advanced queries on PostgreSQL', () => {
  const row = (id: string, type: string, timestamp: number, agentId: string) => ({
    id,
    run_id: 'run_1',
    type,
    timestamp: String(timestamp),
    data: { toolName: 'lookup_metric' },
    metadata: { agentId },
  });

  it('sends one value per placeholder and reads JSONB and BIGINT columns', async () => {
    const pool = new RecordingPostgreSQLPool([
      row('evt_1', 'tool.called', 1000, 'agent-1'),
      row('evt_2', 'tool.called', 2000, 'agent-2'),
    ]);
    const store = new PostgreSQLEventStore({ pool });
    const env = createTestSDK({ eventStore: store });
    try {
      const result = await env.sdk.queryEventsAdvanced({
        type: 'tool.called',
        agentId: 'agent-1',
        since: 500,
      });

      // Before, the values were sent twice ("bind message supplies 6 parameters") and the
      // JSONB objects went through JSON.parse.
      const reads = pool.statements.filter((statement) => statement.sql.startsWith('SELECT'));
      expect(reads).toEqual([
        {
          sql: "SELECT * FROM events WHERE 1=1 AND type = $1 AND timestamp >= $2 AND metadata->>'agentId' = $3 ORDER BY timestamp ASC, id ASC",
          params: ['tool.called', 500, 'agent-1'],
        },
        {
          sql: 'SELECT COUNT(*) as count FROM events WHERE 1=1 AND timestamp >= $1',
          params: [500],
        },
      ]);
      expect(result.events).toEqual([
        {
          id: 'evt_1',
          runId: 'run_1',
          type: 'tool.called',
          timestamp: 1000,
          data: { toolName: 'lookup_metric' },
          metadata: { agentId: 'agent-1' },
        },
      ]);
      expect(result).toMatchObject({ total: 2, filtered: 1 });
      expect(await store.countEvents({ type: 'tool.called' })).toBe(2);
    } finally {
      await env.dispose();
    }
  });

  it('counts without asking the database for the events in scope', async () => {
    const pool = new RecordingPostgreSQLPool([row('evt_1', 'tool.called', 1000, 'agent-1')]);
    const env = createTestSDK({ eventStore: new PostgreSQLEventStore({ pool }) });
    try {
      const count = await env.sdk.countEventsAdvanced({ type: 'tool.called' });
      await env.sdk.getEventStatistics({ type: 'tool.called' });

      expect(count).toBe(1);
      // Before, each call also ran SELECT COUNT(*) for a total nobody read.
      expect(pool.statements.filter((statement) => statement.sql.startsWith('SELECT'))).toEqual([
        {
          sql: 'SELECT * FROM events WHERE 1=1 AND type = $1 ORDER BY timestamp ASC, id ASC',
          params: ['tool.called'],
        },
        {
          sql: 'SELECT * FROM events WHERE 1=1 AND type = $1 ORDER BY timestamp ASC, id ASC',
          params: ['tool.called'],
        },
      ]);
    } finally {
      await env.dispose();
    }
  });

  it('binds field paths and values, and compares them by JSON type', async () => {
    const pool = new RecordingPostgreSQLPool([]);
    const store = new PostgreSQLEventStore({ pool });
    try {
      for (const [dataQuery, metadataQuery] of [
        [
          { field: 'parameters.metric', operator: 'eq', value: 'churn' },
          { field: 'agentVersion', operator: 'ne', value: '1.0.0' },
        ],
        [
          { field: 'duration', operator: 'gte', value: 30 },
          { field: 'tier', operator: 'contains', value: 'gold' },
        ],
        [{ field: 'result', operator: 'exists' }, undefined],
      ] as const) {
        await store.queryEvents({ dataQuery, ...(metadataQuery ? { metadataQuery } : {}) });
      }

      // Before: data->>'${field}' written into the SQL, JSON.stringify("churn") compared with
      // the text '"churn"' (never equal), gt/contains and metadataQuery silently ignored.
      expect(pool.statements.filter((statement) => statement.sql.startsWith('SELECT'))).toEqual([
        {
          sql: 'SELECT * FROM events WHERE 1=1 AND (data #> $1::text[]) = $2::jsonb AND ((metadata #> $3::text[]) = $4::jsonb) IS NOT TRUE ORDER BY timestamp ASC, id ASC',
          params: [['parameters', 'metric'], '"churn"', ['agentVersion'], '"1.0.0"'],
        },
        {
          sql: "SELECT * FROM events WHERE 1=1 AND (CASE WHEN jsonb_typeof((data #> $1::text[])) = 'number' THEN (data #>> $1::text[])::numeric END) >= $2 AND jsonb_typeof((metadata #> $3::text[])) = 'string' AND strpos((metadata #>> $3::text[]), $4) > 0 ORDER BY timestamp ASC, id ASC",
          params: [['duration'], 30, ['tier'], 'gold'],
        },
        {
          sql: "SELECT * FROM events WHERE 1=1 AND COALESCE(jsonb_typeof((data #> $1::text[])), 'null') <> 'null' ORDER BY timestamp ASC, id ASC",
          params: [['result']],
        },
      ]);
      await expect(
        store.queryEvents({
          dataQuery: { field: "x') OR 1=1 --", operator: 'eq', value: 1 },
        })
      ).rejects.toThrow(ValidationError);
    } finally {
      await store.close();
    }
  });

  it('reads every event in scope when a condition cannot be sent to the database', async () => {
    const pool = new RecordingPostgreSQLPool([
      row('evt_1', 'tool.called', 1000, 'agent-1'),
      row('evt_2', 'run.started', 2000, 'agent-1'),
    ]);
    const env = createTestSDK({ eventStore: new PostgreSQLEventStore({ pool }) });
    try {
      const count = await env.sdk.countEventsAdvanced({
        type: 'tool.called',
        not: true,
        limit: 10,
      });

      expect(count).toBe(1);
      expect(pool.statements.filter((statement) => statement.sql.startsWith('SELECT'))).toEqual([
        { sql: 'SELECT * FROM events WHERE 1=1 ORDER BY timestamp ASC, id ASC', params: [] },
      ]);
    } finally {
      await env.dispose();
    }
  });
});

/** A file store that counts the run files it reads through getEvents. */
class CountingFileEventStore extends FileEventStore {
  reads = 0;

  override async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    this.reads++;
    return super.getEvents(runId, filters);
  }
}

describe('the file store', () => {
  it('reads each run file once for a query across runs', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-counting-'));
    const store = new CountingFileEventStore(join(directory, 'events'));
    const recorded = await record(store);
    try {
      store.reads = 0;

      const result = await recorded.env.sdk.queryEventsAdvanced({ type: 'tool.called' });

      expect(result.filtered).toBe(2);
      // Before, 6 reads for 3 runs: getRunIds read every file, then each run was read again.
      expect(store.reads).toBe(0);
    } finally {
      await recorded.env.dispose();
      await store.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/** Field queries give the same events on every store that can run them here. */
function describeFieldQueries(
  storeName: string,
  createStore: () => { store: IEventStore; dispose(): Promise<void> }
): void {
  describe(`field queries on ${storeName}`, () => {
    let opened: { store: IEventStore; dispose(): Promise<void> } | undefined;

    afterEach(async () => {
      await opened?.dispose();
      opened = undefined;
    });

    function open(): IEventStore {
      opened = createStore();
      return opened.store;
    }

    const at = (id: string, data: Record<string, unknown>, metadata = {}): Event => ({
      id,
      runId: 'run_fields',
      type: 'tool.called',
      timestamp: Number(id.slice(1)),
      data,
      metadata,
    });
    const events = [
      at(
        'e1',
        { parameters: { metric: 'churn', duration: 30 }, ok: true, note: null },
        { tier: 'Gold' }
      ),
      at(
        'e2',
        { parameters: { metric: 'revenue', duration: 60 }, ok: false },
        { tier: 'gold plus' }
      ),
      at('e3', { parameters: { metric: '30', duration: '30' } }),
    ];

    async function ids(store: IEventStore, filters: EventFilters): Promise<string[]> {
      const result = await store.queryEvents?.(filters);
      return (result?.events ?? []).map((event) => event.id);
    }

    it('compares values of the same JSON type, and bounds numbers only', async () => {
      const store = open();
      for (const event of events) await store.append(event.runId, event);

      const q = (field: string, operator: string, value?: unknown) => ({
        dataQuery: { field, operator, value } as EventFilters['dataQuery'],
      });
      expect(await ids(store, q('parameters.metric', 'eq', 'churn'))).toEqual(['e1']);
      // The string "30" is not the number 30.
      expect(await ids(store, q('parameters.duration', 'eq', 30))).toEqual(['e1']);
      expect(await ids(store, q('parameters.metric', 'eq', 30))).toEqual([]);
      expect(await ids(store, q('ok', 'eq', false))).toEqual(['e2']);
      expect(await ids(store, q('note', 'eq', null))).toEqual(['e1']);
      // A missing field is different from any value.
      expect(await ids(store, q('ok', 'ne', true))).toEqual(['e2', 'e3']);
      expect(await ids(store, q('parameters.duration', 'gt', 30))).toEqual(['e2']);
      expect(await ids(store, q('parameters.metric', 'contains', 'enu'))).toEqual(['e2']);
      expect(await ids(store, q('note', 'exists'))).toEqual([]);
      expect(await ids(store, q('ok', 'exists'))).toEqual(['e1', 'e2']);
      // contains is case-sensitive.
      expect(
        await ids(store, { metadataQuery: { field: 'tier', operator: 'contains', value: 'gold' } })
      ).toEqual(['e2']);
    });

    it('refuses a field path or an operator that is not one', async () => {
      const store = open();
      await store.append('run_fields', events[0] as Event);

      for (const filters of [
        { dataQuery: { field: "x') OR 1=1 --", operator: 'eq', value: 1 } },
        { metadataQuery: { field: 'a..b', operator: 'exists' } },
        { dataQuery: { field: 'ok', operator: 'like', value: 'x' } },
        { dataQuery: { field: 'ok', operator: 'gt', value: 'ten' } },
        { dataQuery: { field: 'ok', operator: 'eq', value: { nested: true } } },
      ]) {
        await expect(store.queryEvents?.(filters as EventFilters)).rejects.toThrow(ValidationError);
      }
    });
  });
}

describeFieldQueries('the file store', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-fields-'));
  const store = new FileEventStore(join(directory, 'events'));
  return {
    store,
    dispose: async () => {
      await store.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
});

if (nodeSqlite) {
  describeFieldQueries('SQLite (node:sqlite)', () => {
    const store = new SQLiteEventStore({ db: new nodeSqlite.DatabaseSync(':memory:') });
    return { store, dispose: () => store.close() };
  });
}
