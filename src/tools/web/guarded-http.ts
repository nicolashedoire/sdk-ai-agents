import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { nonPublicKind } from './ip-ranges.js';
import type { HostPacer } from './politeness.js';
import { WebHttpError, WebRequestRefusedError, WebTimeoutError } from './web-errors.js';

/** What a request through the web tools' HTTP client got back. */
export interface WebResponse {
  status: number;
  /** The URL that answered, after redirects. */
  url: string;
  /** Header names in lower case; repeated headers joined with `, `. */
  headers: Record<string, string>;
  /** The decoded body (after gzip, deflate or brotli), at most the byte cap. */
  body: Buffer;
  /** The body was longer than the cap and was cut: the rest was never downloaded. */
  truncated: boolean;
}

/** What the client knows of an answer before it reads its body. */
export interface ResponseHead {
  status: number;
  url: string;
  contentType: string;
  contentLength?: number;
}

export interface WebRequestInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Least time between the start of two requests to this host. Default 0. */
  minIntervalMs?: number;
  /** Aborts the request (the tool call was cancelled). */
  signal?: AbortSignal;
  /**
   * The URL's origin comes from your configuration (a provider's `baseUrl`), not from the
   * model: it may be on this machine or the local network. Redirects elsewhere are checked
   * as usual.
   */
  configuredEndpoint?: boolean;
  /** Largest decoded body read, or a cap chosen from the content type. */
  maxBytes?: number | ((contentType: string) => number);
  /** Sees the answer before its body is read; throw to refuse it (nothing more is read). */
  inspect?: (head: ResponseHead) => void;
  /**
   * Called before each hop, redirects included: throw to refuse the URL (robots.txt), or
   * return a longer pacing interval for its host (a `Crawl-delay`).
   */
  admit?: (url: URL) => Promise<{ minIntervalMs?: number } | undefined>;
}

/** The HTTP port the providers and sources use. */
export interface WebClient {
  request(url: string, init?: WebRequestInit): Promise<WebResponse>;
}

/** Resolves a host name to its addresses. Default: the system resolver (`dns.lookup`). */
export type WebLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface GuardedHttpOptions {
  userAgent: string;
  /** Per request (one hop): connection, headers and body. */
  timeoutMs: number;
  maxRedirects: number;
  /** Default byte cap of a body. */
  maxBytes: number;
  pacer: HostPacer;
  /**
   * Reach addresses that are not the public Internet: `true` for all of them, or a list of
   * hosts (`intranet.example`, `127.0.0.1:8080`). Off by default.
   */
  allowPrivateNetwork?: boolean | string[];
  /** DNS resolution; every address it gives is checked when the connection opens. */
  lookup?: WebLookup;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
/** Headers kept when a redirect leaves the origin: never credentials. */
const CROSS_ORIGIN_HEADERS = new Set(['accept', 'accept-language', 'user-agent']);

/**
 * `node:http`/`node:https` requests with the web tools' rules:
 *
 * - http(s) only; redirects followed by hand, at most `maxRedirects`, each hop checked again,
 *   https never downgraded to http, credentials never sent to another origin;
 * - no address outside the public Internet (loopback, private, link-local and cloud metadata,
 *   CGNAT, multicast, IPv4 inside IPv6…): IP literals are checked before connecting, and host
 *   names by the `lookup` the connection itself uses, so every address a name resolves to is
 *   checked when the connection opens (a DNS answer that changes in between cannot slip
 *   through). `allowPrivateNetwork` lifts this; a provider's configured endpoint is exempt on
 *   its own origin only;
 * - a timeout per request, a byte cap on the decoded body (the rest is never downloaded),
 *   pacing per host, TLS certificates always verified.
 */
export class GuardedHttpClient implements WebClient {
  private readonly resolve: WebLookup;

  constructor(private readonly options: GuardedHttpOptions) {
    this.resolve =
      options.lookup ?? ((hostname) => dns.lookup(hostname, { all: true, verbatim: true }));
  }

  request(rawUrl: string, init: WebRequestInit = {}): Promise<WebResponse> {
    return this.perform(rawUrl, init, true);
  }

  /**
   * A client whose requests neither wait for the host's pacing nor count as its last request:
   * for robots.txt, which must not delay the page it is read for.
   */
  unpaced(): WebClient {
    return { request: (url, init) => this.perform(url, init ?? {}, false) };
  }

  private async perform(
    rawUrl: string,
    init: WebRequestInit,
    paced: boolean
  ): Promise<WebResponse> {
    let url = httpUrl(rawUrl);
    const configuredOrigin = init.configuredEndpoint ? url.origin : undefined;
    let method = init.method ?? 'GET';
    let body = init.body;
    let headers: Record<string, string> = lowerKeys(init.headers ?? {});
    for (let hop = 0; ; hop++) {
      const privateAllowed = url.origin === configuredOrigin || this.allowsPrivate(url);
      checkLiteralAddress(url, privateAllowed);
      const admitted = await init.admit?.(url);
      const interval = Math.max(init.minIntervalMs ?? 0, admitted?.minIntervalMs ?? 0);
      if (paced) await this.options.pacer.wait(url.host, interval, init.signal);
      const answer = await this.send(url, method, headers, body, init, privateAllowed);
      if (answer.location === undefined) return answer.response;
      if (hop >= this.options.maxRedirects) {
        throw new WebRequestRefusedError(
          `${rawUrl}: more than ${this.options.maxRedirects} redirects`,
          'redirects'
        );
      }
      const next = redirectTarget(url, answer.location, answer.response.status);
      if (next.origin !== url.origin) {
        headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => CROSS_ORIGIN_HEADERS.has(name))
        );
      }
      const status = answer.response.status;
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
        headers = Object.fromEntries(
          Object.entries(headers).filter(([name]) => name !== 'content-type')
        );
      }
      url = next;
    }
  }

  /** `allowPrivateNetwork` is on, or names this host (with or without its port). */
  private allowsPrivate(url: URL): boolean {
    const allow = this.options.allowPrivateNetwork;
    if (allow === true) return true;
    if (!Array.isArray(allow)) return false;
    const host = url.host.toLowerCase();
    const name = url.hostname.toLowerCase();
    const bare = name.replace(/^\[|\]$/g, '');
    return allow.some((entry) => {
      const wanted = entry.trim().toLowerCase();
      return wanted === host || wanted === name || wanted === bare;
    });
  }

  /**
   * The connection's own DNS lookup: every address the name resolves to must be public, or
   * the connection is refused before it opens.
   */
  private lookupFor(privateAllowed: boolean): LookupFunction {
    return (hostname, options, callback) => {
      this.resolve(hostname)
        .then((found) => {
          // Node gives the family as 4, 6, 0, or 'IPv4' / 'IPv6'.
          const requested: unknown = options.family;
          const family =
            requested === 4 || requested === 'IPv4'
              ? 4
              : requested === 6 || requested === 'IPv6'
                ? 6
                : 0;
          const addresses = found.filter((entry) => family === 0 || entry.family === family);
          if (addresses.length === 0) {
            throw Object.assign(new Error(`${hostname} has no address`), { code: 'ENOTFOUND' });
          }
          if (!privateAllowed) {
            for (const { address } of addresses) {
              const kind = nonPublicKind(address);
              if (kind) {
                throw new WebRequestRefusedError(
                  `${hostname} resolves to ${address}, a ${kind} address: refused (allowPrivateNetwork is off)`,
                  'private-address'
                );
              }
            }
          }
          const [first] = addresses as [{ address: string; family: number }];
          if (options.all) callback(null, addresses);
          else callback(null, first.address, first.family);
        })
        .catch((error: unknown) => {
          callback(error as NodeJS.ErrnoException, '', 0);
        });
    };
  }

  /** One hop: the answer, or where it redirects to. */
  private send(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    init: WebRequestInit,
    privateAllowed: boolean
  ): Promise<{ response: WebResponse; location?: string }> {
    const label = `${method} ${url.origin}${url.pathname}`;
    const hop = new AbortController();
    const cancel = () => hop.abort(init.signal?.reason ?? new Error('The request was cancelled'));
    if (init.signal?.aborted) cancel();
    init.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(
      () => hop.abort(new WebTimeoutError(`${label} timed out after ${this.options.timeoutMs} ms`)),
      this.options.timeoutMs
    );
    const done = () => {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', cancel);
    };
    return new Promise<{ response: WebResponse; location?: string }>((resolve, reject) => {
      const fail = (error: unknown) => {
        const reason: unknown = hop.signal.aborted ? hop.signal.reason : error;
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(url, {
        method,
        headers: {
          'user-agent': this.options.userAgent,
          'accept-encoding': 'gzip, deflate, br',
          ...headers,
          ...(body !== undefined ? { 'content-length': String(Buffer.byteLength(body)) } : {}),
        },
        // A new connection each time: a pooled socket would skip the checks made when a
        // connection opens.
        agent: false,
        lookup: this.lookupFor(privateAllowed),
        signal: hop.signal,
      });
      request.on('error', fail);
      request.on('response', (response) => {
        const status = response.statusCode ?? 0;
        const responseHeaders = flatHeaders(response.headers);
        const location = responseHeaders.location;
        const head: WebResponse = {
          status,
          url: url.toString(),
          headers: responseHeaders,
          body: Buffer.alloc(0),
          truncated: false,
        };
        if (REDIRECTS.has(status) && location) {
          response.destroy();
          resolve({ response: head, location });
          return;
        }
        const contentType = responseHeaders['content-type'] ?? '';
        const length = Number(responseHeaders['content-length']);
        try {
          init.inspect?.({
            status,
            url: head.url,
            contentType,
            ...(Number.isFinite(length) && responseHeaders['content-length'] !== undefined
              ? { contentLength: length }
              : {}),
          });
        } catch (error) {
          response.destroy();
          reject(error);
          return;
        }
        const cap =
          typeof init.maxBytes === 'function'
            ? init.maxBytes(contentType)
            : (init.maxBytes ?? this.options.maxBytes);
        readBody(response, responseHeaders['content-encoding'], cap, hop.signal).then(
          ({ bytes, truncated }) => resolve({ response: { ...head, body: bytes, truncated } }),
          fail
        );
      });
      request.end(body);
    }).finally(done);
  }
}

/** A URL the web tools may request: http or https, nothing else. */
export function httpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebRequestRefusedError(`${JSON.stringify(raw)} is not a URL`, 'scheme');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebRequestRefusedError(
      `${url.protocol} URLs are refused: only http and https`,
      'scheme'
    );
  }
  return url;
}

/**
 * An IP written in the URL is not looked up, so it is checked here, before connecting:
 * `127.0.0.1`, `[::1]`, `169.254.169.254`, `[::ffff:10.0.0.1]`…
 */
function checkLiteralAddress(url: URL, privateAllowed: boolean): void {
  if (privateAllowed) return;
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (!isIP(literal)) return;
  const kind = nonPublicKind(literal);
  if (kind) {
    throw new WebRequestRefusedError(
      `${url.host} is a ${kind} address: refused (allowPrivateNetwork is off)`,
      'private-address'
    );
  }
}

/** Where a redirect leads, if the web tools may follow it. */
export function redirectTarget(from: URL, location: string, status: number): URL {
  let next: URL;
  try {
    next = new URL(location, from);
  } catch {
    throw new WebHttpError(`${from.toString()} redirects to an invalid URL`, status);
  }
  if (next.protocol !== 'http:' && next.protocol !== 'https:') {
    throw new WebRequestRefusedError(
      `${from.toString()} redirects to a ${next.protocol} URL: only http and https`,
      'scheme'
    );
  }
  if (from.protocol === 'https:' && next.protocol === 'http:') {
    throw new WebRequestRefusedError(
      `${from.toString()} redirects from https to http (${next.toString()}): refused`,
      'downgrade'
    );
  }
  return next;
}

/** Reads a body, decoded, up to `cap` bytes; past it, the connection is closed. */
function readBody(
  response: http.IncomingMessage,
  encoding: string | undefined,
  cap: number,
  signal: AbortSignal
): Promise<{ bytes: Buffer; truncated: boolean }> {
  const decoder = decoderFor(encoding);
  const stream: Readable = decoder ? response.pipe(decoder) : response;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const stop = () => {
      response.destroy();
      if (decoder) decoder.destroy();
    };
    const finish = (truncated: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve({ bytes: Buffer.concat(chunks, size), truncated });
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      stop();
      reject(error);
    };
    const onAbort = () => fail(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      const room = cap - size;
      if (chunk.length > room) {
        chunks.push(Buffer.from(chunk.subarray(0, room)));
        size += room;
        stop();
        finish(true);
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    stream.on('end', () => finish(false));
    stream.on('error', fail);
    if (decoder) response.on('error', fail);
    stream.on('close', () => fail(new Error('The connection closed before the end of the body')));
  });
}

function decoderFor(
  encoding: string | undefined
): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | undefined {
  const name = (encoding ?? '').trim().toLowerCase();
  if (name === 'gzip' || name === 'x-gzip') return zlib.createGunzip();
  if (name === 'deflate') return zlib.createInflate();
  if (name === 'br') return zlib.createBrotliDecompress();
  return undefined;
}

function flatHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    flat[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return flat;
}

function lowerKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
}

/** The body as text, in the charset the answer names (UTF-8 by default). */
export function bodyText(response: WebResponse, fallbackCharset = 'utf-8'): string {
  const declared = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(
    response.headers['content-type'] ?? ''
  )?.[1];
  return decodeText(response.body, declared ?? fallbackCharset, response.truncated);
}

/** Decodes bytes in a charset; an unknown charset reads as UTF-8. A cut last character is dropped. */
export function decodeText(bytes: Uint8Array, charset: string, truncated: boolean): string {
  let label = charset.toLowerCase();
  try {
    new TextDecoder(label);
  } catch {
    label = 'utf-8';
  }
  return new TextDecoder(label).decode(bytes, { stream: truncated });
}

/** Throws a `WebHttpError` for a non-2xx answer, with the start of its body. */
export function ensureOk(response: WebResponse, label: string): void {
  if (response.status >= 200 && response.status < 300) return;
  const detail = bodyText(response).replace(/\s+/g, ' ').trim().slice(0, 200);
  throw new WebHttpError(
    `${label} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    response.status
  );
}

/** The body parsed as JSON; a clear error when it is not JSON. */
export function jsonBody(response: WebResponse, label: string): unknown {
  const text = bodyText(response);
  if (response.truncated) {
    throw new Error(`${label} answered more than the byte cap allows: the answer was cut`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not answer JSON`);
  }
}
