import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { brave } from '../tools/web/providers/brave.js';
import { HostPacer, sleep } from '../tools/web/politeness.js';
import { duckDuckGo } from '../tools/web/providers/duckduckgo.js';
import {
  isRetryableWebError,
  SearchThrottledError,
  SearchUnavailableError,
  WebHttpError,
} from '../tools/web/web-errors.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { type Route, reply, replyJson, WebServer } from './support/web-server.js';
import { createTestSDK } from './support/test-sdk.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/web/${name}`, import.meta.url), 'utf8');

/** When each request to a route started and ended, and how many ran at once at most. */
function timed(route: Route, delayMs = 0) {
  const spans: Array<{ start: number; end: number }> = [];
  let running = 0;
  let most = 0;
  const handler: Route = (request, response) => {
    const span = { start: Date.now(), end: 0 };
    spans.push(span);
    running++;
    most = Math.max(most, running);
    setTimeout(() => {
      running--;
      span.end = Date.now();
      void route(request, response);
    }, delayMs);
  };
  return { handler, spans, most: () => most };
}

const gap = (spans: Array<{ start: number; end: number }>, index: number) =>
  (spans[index]?.start ?? 0) - (spans[index - 1]?.end ?? 0);

describe('pacing: one request at a time per host, spaced from the end of the previous one', () => {
  let server: WebServer;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  function tool(name: string, options: WebToolsOptions): ToolDefinition {
    const found = webTools({ cache: false, ...options }).find((candidate) => candidate.name === name);
    if (!found) throw new Error(`no ${name}`);
    return found;
  }
  const call = (definition: ToolDefinition, args: Record<string, unknown>) =>
    definition.handler(definition.schema.parse(args));

  it('spaces DuckDuckGo queries by 4 s by default (throttled at 1.5 s in a real study)', async () => {
    const { handler, spans } = timed(reply(fixture('duckduckgo-results.html')));
    server.on('/html/', handler);
    const search = tool('web_search', { search: duckDuckGo({ baseUrl: server.url }) });

    await call(search, { query: 'first' });
    await call(search, { query: 'second' });

    expect(gap(spans, 1)).toBeGreaterThanOrEqual(3_950);
  }, 20_000);

  it('counts the interval from the end of a slow answer, not from its start', async () => {
    const { handler, spans } = timed(reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' }), 400);
    server.on('/api/query', handler);
    const arxiv = tool('arxiv_search', { arxiv: { baseUrl: server.url, minIntervalMs: 300 } });

    await call(arxiv, { query: 'first' });
    await call(arxiv, { query: 'second' });

    expect(gap(spans, 1)).toBeGreaterThanOrEqual(290);
  });

  it('never sends two requests to one host at the same time', async () => {
    const timing = timed(reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' }), 400);
    server.on('/api/query', timing.handler);
    const arxiv = tool('arxiv_search', { arxiv: { baseUrl: server.url, minIntervalMs: 300 } });

    await Promise.all([call(arxiv, { query: 'a' }), call(arxiv, { query: 'b' }), call(arxiv, { query: 'c' })]);

    expect(timing.most()).toBe(1);
    expect(gap(timing.spans, 1)).toBeGreaterThanOrEqual(290);
    expect(gap(timing.spans, 2)).toBeGreaterThanOrEqual(290);
  });

  it('shares the pacing of a host between every webTools() of the process', async () => {
    const { handler, spans } = timed(reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' }));
    server.on('/api/query', handler);
    const options = { arxiv: { baseUrl: server.url, minIntervalMs: 300 } };
    const forAnAgent = tool('arxiv_search', options);
    const forAStudy = tool('arxiv_search', options);

    await call(forAnAgent, { query: 'a' });
    await call(forAStudy, { query: 'b' });

    expect(gap(spans, 1)).toBeGreaterThanOrEqual(290);
  });

  it('never forgets a host with a request in flight, however many hosts it has seen', async () => {
    const pacer = new HostPacer();
    const release = await pacer.acquire('busy.example', 50, 30_000);
    // Past 1 000 hosts, the pacer forgets the idle ones: never this one, still busy.
    for (let index = 0; index < 1_100; index++) {
      (await pacer.acquire(`host-${index}.example`, 50, 30_000))();
    }
    let turn = false;
    const next = pacer.acquire('busy.example', 50, 30_000).then((released) => {
      turn = true;
      return released;
    });

    await sleep(150);
    expect(turn).toBe(false);
    release();
    (await next)();
    expect(turn).toBe(true);
  });
});

describe('throttling: one more try after a wait, within the call deadline', () => {
  let server: WebServer;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  const braveAnswer = { web: { results: [{ title: 'Found', url: 'https://found.example/', description: 'x' }] } };

  it('waits as long as Retry-After asks, then tries again (a 429 opened the breaker)', async () => {
    let calls = 0;
    const { handler, spans } = timed((request, response) => {
      calls++;
      if (calls === 1) {
        response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' }).end('{}');
        return;
      }
      replyJson(braveAnswer)(request, response);
    });
    server.on('/res/v1/web/search', handler);
    const [search] = webTools({
      include: ['web_search'],
      search: brave({ apiKey: 'k', baseUrl: server.url, minIntervalMs: 0 }),
      cache: false,
    });
    if (!search) throw new Error('no web_search');

    const output = await search.handler(search.schema.parse({ query: 'x' }));

    expect(output).toMatchObject({ provider: 'brave', results: [{ title: 'Found' }] });
    expect(output).not.toHaveProperty('errors');
    expect(gap(spans, 1)).toBeGreaterThanOrEqual(950);
  });

  it('does not wait past the call deadline: it hands over, and says the search was throttled', async () => {
    server.on('/res/v1/web/search', (_request, response) => {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30' }).end('{}');
    });
    const [search] = webTools({
      include: ['web_search'],
      search: brave({ apiKey: 'k', baseUrl: server.url, minIntervalMs: 0 }),
      callTimeoutMs: 5_000,
      cache: false,
    });
    if (!search) throw new Error('no web_search');
    const started = Date.now();

    const error = await search.handler(search.schema.parse({ query: 'x' })).catch((caught: Error) => caught);

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(server.hits('/res/v1/web/search')).toHaveLength(1);
    expect(error).toBeInstanceOf(SearchUnavailableError);
    expect(error).toMatchObject({ throttled: true });
    expect((error as SearchUnavailableError).retryAfterMs).toBeGreaterThan(100_000);
  });

  it('never tries again sooner than asked: a Retry-After past 30 s fails at once, with that wait', async () => {
    server.on('/w/api.php', (_request, response) => {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' }).end('{}');
    });
    server.on('/res/v1/web/search', (_request, response) => {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '600' }).end('{}');
    });
    const tools = webTools({
      include: ['wikipedia_search', 'web_search'],
      wikipedia: { baseUrl: server.url, minIntervalMs: 0 },
      search: brave({ apiKey: 'k', baseUrl: server.url, minIntervalMs: 0 }),
      cache: false,
    });
    const run = (name: string) => {
      const found = tools.find((candidate) => candidate.name === name);
      if (!found) throw new Error(`no ${name}`);
      return found.handler(found.schema.parse({ query: 'x' })).catch((caught: Error) => caught);
    };
    const started = Date.now();

    const source = await run('wikipedia_search');
    const search = await run('web_search');
    const again = await run('web_search');

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(server.hits('/w/api.php')).toHaveLength(1);
    expect(source).toBeInstanceOf(SearchThrottledError);
    expect(source).toMatchObject({ throttled: true, retryAfterMs: 120_000 });
    // The provider is left alone as long as it asked, not only the breaker's 120 s.
    expect(server.hits('/res/v1/web/search')).toHaveLength(1);
    expect(search).toMatchObject({ name: 'SearchUnavailableError', throttled: true });
    expect((search as SearchUnavailableError).retryAfterMs).toBeGreaterThan(590_000);
    expect((again as SearchUnavailableError).retryAfterMs).toBeGreaterThan(590_000);
  });

  it('is not retried by a configured retry: the tool already gave the throttle its second try', async () => {
    server.on('/w/api.php', (_request, response) => {
      response.writeHead(429, { 'content-type': 'application/json' }).end('{}');
    });
    const env = createTestSDK();
    try {
      for (const tool of webTools({
        include: ['wikipedia_search'],
        wikipedia: { baseUrl: server.url, minIntervalMs: 0 },
        throttleWaitMs: 20,
        retry: { maxRetries: 2, initialDelayMs: 1 },
        cache: false,
      })) {
        env.sdk.defineTool(tool);
      }

      await expect(env.sdk.executeTool('wikipedia_search', { query: 'x' })).rejects.toThrow(
        'Tool execution failed'
      );
      // The tool's two tries, and no more.
      expect(server.hits('/w/api.php')).toHaveLength(2);
    } finally {
      await env.dispose();
    }
    expect(isRetryableWebError(new SearchThrottledError('captcha'))).toBe(false);
    expect(isRetryableWebError(new WebHttpError('rate limited', 429))).toBe(false);
    expect(isRetryableWebError(new WebHttpError('down', 503))).toBe(true);
  });

  it('says a search failed for another reason is not throttled', async () => {
    server.on('/html/', reply('down', { status: 503, type: 'text/plain' }));
    const [search] = webTools({
      include: ['web_search'],
      search: duckDuckGo({ baseUrl: server.url, minIntervalMs: 0 }),
      cache: false,
    });
    if (!search) throw new Error('no web_search');

    const error = await search.handler(search.schema.parse({ query: 'x' })).catch((caught: Error) => caught);

    expect(error).toMatchObject({ name: 'SearchUnavailableError', throttled: false });
  });

  it("tries arXiv again after its 406 (it refused two of a real study's queries)", async () => {
    let calls = 0;
    server.on('/api/query', (request, response) => {
      calls++;
      if (calls === 1) response.writeHead(406, { 'content-type': 'text/plain' }).end('Not Acceptable');
      else reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' })(request, response);
    });
    const [arxiv] = webTools({
      include: ['arxiv_search'],
      arxiv: { baseUrl: server.url, minIntervalMs: 0 },
      throttleWaitMs: 200,
      cache: false,
    });
    if (!arxiv) throw new Error('no arxiv_search');

    const output = (await arxiv.handler(arxiv.schema.parse({ query: 'attention' }))) as { results: unknown[] };

    expect(output.results).toHaveLength(2);
    expect(server.hits('/api/query')).toHaveLength(2);
  });
});
