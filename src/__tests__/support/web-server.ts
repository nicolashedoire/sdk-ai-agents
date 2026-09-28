import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import type { TLSSocket } from 'node:tls';

export interface WebRequest {
  method: string;
  /** Path and query, as sent. */
  url: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: string;
  /** Over https: the protocol the client named in the TLS handshake (ALPN), or `false`. */
  alpn?: string | false;
}

/** Answers one request; it may write anything, stream, or never end. */
export type Route = (request: WebRequest, response: ServerResponse) => void | Promise<void>;

/**
 * A real HTTP server on an ephemeral local port that answers by path, for the web tools: the
 * pages, APIs, robots.txt files and redirects of a small Web. Requests are recorded. A path
 * without a route answers 404. With `tls` (a key and its certificate), it speaks https.
 */
export class WebServer {
  readonly requests: WebRequest[] = [];
  private readonly routes = new Map<string, Route>();
  private server?: Server;
  private base = '';

  constructor(private readonly tls?: { key: string; cert: string }) {}

  /** Sets what a path answers (the query string is ignored when matching). */
  on(path: string, route: Route): this {
    this.routes.set(path, route);
    return this;
  }

  get url(): string {
    return this.base;
  }

  /** `host:port` of the server, as `allowPrivateNetwork` names it. */
  get host(): string {
    return new URL(this.base).host;
  }

  async start(): Promise<string> {
    const handle = (request: IncomingMessage, response: ServerResponse) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const recorded: WebRequest = {
          method: request.method ?? '',
          url: request.url ?? '',
          path: url.pathname,
          query: url.searchParams,
          headers: request.headers,
          body,
          ...(this.tls ? { alpn: (request.socket as TLSSocket).alpnProtocol ?? false } : {}),
        };
        this.requests.push(recorded);
        const route = this.routes.get(url.pathname);
        if (!route) {
          response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
          return;
        }
        Promise.resolve(route(recorded, response)).catch((error: unknown) => {
          if (!response.headersSent) response.writeHead(500);
          response.end(String(error));
        });
      });
    };
    this.server = this.tls
      ? createTlsServer({ ...this.tls, ALPNProtocols: ['http/1.1'] }, handle)
      : createServer(handle);
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('the web server has no TCP address');
    this.base = `${this.tls ? 'https' : 'http'}://127.0.0.1:${address.port}`;
    return this.base;
  }

  /** Requests made to a path. */
  hits(path: string): WebRequest[] {
    return this.requests.filter((request) => request.path === path);
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A route answering `body` with a status and headers (HTML by default). */
export function reply(
  body: string | Buffer,
  {
    status = 200,
    type = 'text/html; charset=utf-8',
    headers = {},
  }: { status?: number; type?: string; headers?: Record<string, string> } = {}
): Route {
  return (_request, response) => {
    response.writeHead(status, { 'content-type': type, ...headers });
    response.end(body);
  };
}

/** A route answering JSON. */
export function replyJson(value: unknown, status = 200): Route {
  return reply(JSON.stringify(value), { status, type: 'application/json' });
}

/** A route redirecting to `location`. */
export function redirect(location: string, status = 302): Route {
  return (_request, response) => {
    response.writeHead(status, { location }).end();
  };
}
