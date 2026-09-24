import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
  /** The client closed the connection before the server ended (or cut) its answer. */
  clientClosed?: boolean;
}

/** One Server-Sent Event: `event: <event>` (when set), then `data: <data>`. */
export interface ServerSentEvent {
  event?: string;
  data: string;
}

export interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Keeps the connection open this long before answering. */
  delayMs?: number;
  /** Answers with these events (`text/event-stream`) instead of `body`, each written apart. */
  stream?: {
    events: ServerSentEvent[];
    /** Pause before each event, so the client reads them one at a time. Defaults to 1 ms. */
    intervalMs?: number;
    /**
     * After the last event: `end` the answer (default), `cut` the connection in the middle of
     * it, or `hang` with the connection open (until the client gives up or the server stops).
     */
    then?: 'end' | 'cut' | 'hang';
  };
}

/**
 * Real HTTP server on an ephemeral local port. Replies are consumed in order; the last one
 * repeats. Used to test HTTP adapters end to end without touching real services.
 */
export class LocalHttpServer {
  readonly requests: RecordedRequest[] = [];
  private replies: Reply[] = [];
  private server?: Server;
  /** Answers the server cut on purpose (`then: 'cut'`), not closed by the client. */
  private readonly cut = new WeakSet<ServerResponse>();

  reply(...replies: Reply[]): this {
    this.replies.push(...replies);
    return this;
  }

  async start(): Promise<string> {
    this.server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const recorded: RecordedRequest = {
          method: request.method ?? '',
          url: request.url ?? '',
          headers: request.headers,
          body,
        };
        this.requests.push(recorded);
        response.on('close', () => {
          if (!response.writableFinished && !this.cut.has(response)) recorded.clientClosed = true;
        });
        const reply = this.replies.length > 1 ? this.replies.shift() : this.replies[0];
        const send = () => {
          if (reply?.stream) {
            void this.writeEvents(response, reply);
            return;
          }
          const payload =
            reply?.body === undefined
              ? ''
              : typeof reply.body === 'string'
                ? reply.body
                : JSON.stringify(reply.body);
          response.writeHead(reply?.status ?? 500, {
            'Content-Type': 'application/json',
            ...reply?.headers,
          });
          response.end(payload);
        };
        if (reply?.delayMs) {
          setTimeout(send, reply.delayMs);
        } else {
          send();
        }
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('the local server has no TCP address');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  /** Writes the reply's events one by one, then ends, cuts or holds the answer. */
  private async writeEvents(response: ServerResponse, reply: Reply): Promise<void> {
    const { events, intervalMs = 1, then = 'end' } = reply.stream ?? { events: [] };
    response.writeHead(reply.status, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...reply.headers,
    });
    // Sent at once, as a streaming server does, even before the first event.
    response.flushHeaders();
    for (const { event, data } of events) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (response.destroyed) return;
      response.write(`${event ? `event: ${event}\n` : ''}data: ${data}\n\n`);
    }
    if (then === 'end') {
      response.end();
    } else if (then === 'cut') {
      // Past the events already sent: the client sees the connection drop mid-answer.
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      this.cut.add(response);
      response.socket?.destroy();
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Parsed JSON body of the n-th request. */
  jsonBody(index: number): unknown {
    const request = this.requests[index];
    return request ? JSON.parse(request.body) : undefined;
  }
}
