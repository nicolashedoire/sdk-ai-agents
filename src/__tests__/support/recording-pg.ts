import type { PgClientLike, PgPoolLike } from '../../tools/postgres-read-only.js';

/** One statement received by the in-memory PostgreSQL client. */
export interface PgStatement {
  text: string;
  values?: unknown[];
}

export type PgReply = { rows: unknown[]; fields?: Array<{ name: string }> } | Error;

/**
 * In-memory implementation of the pg client port: it records every statement in order (the
 * journal) and answers with `respond`, which may be slow to let calls overlap.
 */
export class RecordingPgClient implements PgClientLike {
  readonly journal: PgStatement[] = [];

  constructor(
    private readonly respond: (statement: PgStatement) => PgReply = () => ({ rows: [] }),
    private readonly delayMs = 0
  ) {}

  async query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: unknown[]; fields?: Array<{ name: string }> }> {
    const statement: PgStatement = values === undefined ? { text } : { text, values };
    this.journal.push(statement);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const reply = this.respond(statement);
    if (reply instanceof Error) throw reply;
    return reply;
  }
}

/** Pool handing out one recording client per connection, and recording how each was released. */
export class RecordingPgPool implements PgPoolLike {
  readonly clients: RecordingPgClient[] = [];
  readonly releases: Array<boolean | Error | undefined> = [];

  constructor(private readonly respond: (statement: PgStatement) => PgReply) {}

  async connect(): Promise<RecordingPgClient & { release(destroy?: boolean | Error): void }> {
    const client = new RecordingPgClient(this.respond);
    this.clients.push(client);
    return Object.assign(client, {
      release: (destroy?: boolean | Error) => {
        this.releases.push(destroy);
      },
    });
  }
}
