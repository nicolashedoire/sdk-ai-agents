import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PostgreSQLPool, PostgreSQLEventStore } from '../stores/postgresql-event-store.js';
import type { Event, EventFilters } from '../types/events.js';
import { generateEventId } from '../utils/id.js';
import { createTestSDK } from './support/test-sdk.js';

/**
 * The PostgreSQL event store against a real server, when `SDK_TEST_POSTGRES_URL` names one
 * (`postgres://user@host:5432/database`). It works in a schema of its own, dropped at the end.
 * CI does not set the variable: there the suite is reported as skipped.
 */
const url = process.env.SDK_TEST_POSTGRES_URL;

interface PgModule {
  Client: new (config: { connectionString: string }) => {
    connect(): Promise<void>;
    query(sql: string): Promise<unknown>;
    end(): Promise<void>;
  };
  Pool: new (config: { connectionString: string; options: string }) => PostgreSQLPool;
}

describe.skipIf(!url)(
  `PostgreSQL event store on a real server${url ? '' : ' — skipped: set SDK_TEST_POSTGRES_URL to run it'}`,
  () => {
    const schema = `sdk_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    let pg: PgModule;
    let store: PostgreSQLEventStore;

    async function admin(sql: string): Promise<void> {
      const client = new pg.Client({ connectionString: url ?? '' });
      await client.connect();
      try {
        await client.query(sql);
      } finally {
        await client.end();
      }
    }

    /** A store whose tables (its events and `runs`) live in the test's schema. */
    function openStore(tableName?: string): PostgreSQLEventStore {
      const pool = new pg.Pool({
        connectionString: url ?? '',
        options: `-c search_path=${schema}`,
      });
      return new PostgreSQLEventStore({ pool, ...(tableName ? { tableName } : {}) });
    }

    beforeAll(async () => {
      pg = ((await import('pg')) as unknown as { default: PgModule }).default;
      await admin(`CREATE SCHEMA ${schema}`);
      store = openStore();
    });

    afterAll(async () => {
      await store?.close();
      if (pg) await admin(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    });

    const at = (id: string, data: Record<string, unknown>, metadata = {}): Event => ({
      id,
      runId: 'run_fields',
      type: 'tool.called',
      timestamp: Number(id.slice(1)),
      data,
      metadata,
    });

    it('answers field queries as the other stores do', async () => {
      for (const event of [
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
      ]) {
        await store.append(event.runId, event);
      }
      const ids = async (filters: EventFilters) =>
        (await store.queryEvents(filters)).events.map((event) => event.id);
      const q = (field: string, operator: string, value?: unknown): EventFilters => ({
        dataQuery: { field, operator, value } as EventFilters['dataQuery'],
      });

      expect(await ids(q('parameters.metric', 'eq', 'churn'))).toEqual(['e1']);
      expect(await ids(q('parameters.duration', 'eq', 30))).toEqual(['e1']);
      expect(await ids(q('parameters.metric', 'eq', 30))).toEqual([]);
      expect(await ids(q('ok', 'eq', false))).toEqual(['e2']);
      expect(await ids(q('note', 'eq', null))).toEqual(['e1']);
      expect(await ids(q('ok', 'ne', true))).toEqual(['e2', 'e3']);
      expect(await ids(q('parameters.duration', 'gt', 30))).toEqual(['e2']);
      expect(await ids(q('parameters.metric', 'contains', 'enu'))).toEqual(['e2']);
      expect(await ids(q('note', 'exists'))).toEqual([]);
      expect(await ids(q('ok', 'exists'))).toEqual(['e1', 'e2']);
      expect(
        await ids({ metadataQuery: { field: 'tier', operator: 'contains', value: 'gold' } })
      ).toEqual(['e2']);
      expect(await store.countEvents(q('ok', 'exists'))).toBe(2);
      const [first] = await store.getEvents('run_fields');
      expect(typeof first?.timestamp).toBe('number');
    });

    it('keeps the order events of one millisecond were appended in', async () => {
      const events = Array.from({ length: 20 }, (_, step) => ({
        id: generateEventId(),
        runId: 'run_order',
        type: 'tool.called' as const,
        timestamp: 5_000,
        data: { step },
        metadata: { agentId: 'orderly' },
      }));
      for (const event of events) await store.append(event.runId, event);
      const env = createTestSDK({ eventStore: store });
      try {
        const inRun = await store.getEvents('run_order');
        const queried = await env.sdk.queryEventsAdvanced({ agentId: 'orderly' });

        expect(inRun.map((event) => event.data.step)).toEqual(events.map((_, step) => step));
        expect(queried.events.map((event) => event.data.step)).toEqual(
          events.map((_, step) => step)
        );
      } finally {
        await env.dispose();
      }
    });

    it('adds the sequence column to a table created by an earlier version', async () => {
      await admin(`CREATE TABLE ${schema}.legacy_events (
        id VARCHAR(255) PRIMARY KEY,
        run_id VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        timestamp BIGINT NOT NULL,
        data JSONB NOT NULL,
        metadata JSONB
      )`);
      await admin(
        `INSERT INTO ${schema}.legacy_events VALUES ('old_1', 'run_legacy', 'run.started', 1, '{}', NULL)`
      );
      const legacy = openStore('legacy_events');
      try {
        await legacy.append('run_legacy', {
          id: 'new_1',
          runId: 'run_legacy',
          type: 'run.completed',
          timestamp: 1,
          data: {},
        });

        expect((await legacy.getEvents('run_legacy')).map((event) => event.id)).toEqual([
          'old_1',
          'new_1',
        ]);
      } finally {
        await legacy.close();
      }
    });
  }
);
