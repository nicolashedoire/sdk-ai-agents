import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { brave } from '../tools/web/providers/brave.js';
import { duckDuckGo } from '../tools/web/providers/duckduckgo.js';
import { SearchUnavailableError } from '../tools/web/web-errors.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { type Route, reply, replyJson, WebServer } from './support/web-server.js';

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
