import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Keeps the connection open this long before answering. */
  delayMs?: number;
}

/**
 * Real HTTP server on an ephemeral local port. Replies are consumed in order; the last one
 * repeats. Used to test HTTP adapters end to end without touching real services.
 */
export class LocalHttpServer {
  readonly requests: RecordedRequest[] = [];
  private replies: Reply[] = [];
  private server?: Server;

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
        this.requests.push({
          method: request.method ?? '',
          url: request.url ?? '',
          headers: request.headers,
          body,
        });
        const reply = this.replies.length > 1 ? this.replies.shift() : this.replies[0];
        const send = () => {
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
