import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { duckDuckGo, webTools } from '../index.js';
import { json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { scriptStudy, studyConfig } from './support/study-script.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';
import { type Route, reply, WebServer } from './support/web-server.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/web/${name}`, import.meta.url), 'utf8');

// A study searches with the web tools as its sources: DuckDuckGo and arXiv are a local server
// speaking their formats; the model is scripted; everything else is the SDK's own code.
describe('a study with webTools() as its sources', () => {
  let server: WebServer;
  let env: TestSDK | undefined;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
    server.on('/html/', reply(fixture('duckduckgo-results.html')));
    server.on('/api/query', reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' }));
  });

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
    await server.stop();
  });

  it('numbers the results of web_search and arxiv_search as citable sources, with URL and date', async () => {
    const provider = new ScriptedLLMProvider();
    const query = (source: string, text: string) => ({
      source,
      query: text,
      servesObjective: 'Documents how layout works',
    });
    provider
      .enqueue(
        'study-queries:historicalChoices',
        json({
          queries: [
            query('web_search', 'LayoutNG immutable fragments'),
            query('arxiv_search', 'attention transformer'),
          ],
        })
      )
      // The same pages found again keep their numbers.
      .enqueue('study-queries:changes', json({ queries: [query('web_search', 'layout fragments')] }));
    env = createTestSDK({}, scriptStudy(provider));
    for (const tool of webTools({
      include: ['web_search', 'arxiv_search'],
      search: duckDuckGo({ baseUrl: server.url, minIntervalMs: 0 }),
      arxiv: { baseUrl: server.url, minIntervalMs: 0 },
    })) {
      env.sdk.defineTool(tool);
    }
    const study = env.sdk.createStudy(studyConfig({ sources: ['web_search', 'arxiv_search'] }));

    const result = await study.run();

    expect(result.status).toBe('completed');
    const { results } = result.report;
    expect(results.map(({ id, title, locator, date, tool }) => ({ id, title, locator, date, tool }))).toEqual([
      {
        id: 'S1',
        title: 'RenderingNG deep-dive: LayoutNG | Chromium & Chrome Developers',
        locator: 'https://developer.chrome.com/docs/chromium/layoutng',
        date: '2021-04-06',
        tool: 'web_search',
      },
      {
        id: 'S2',
        title: 'CSS Fragmentation Module Level 3',
        locator: 'https://www.w3.org/TR/css-break-3/?lang=en',
        date: undefined,
        tool: 'web_search',
      },
      {
        id: 'S3',
        title: 'Browser engine - Wikipedia',
        locator: 'https://en.wikipedia.org/wiki/Browser_engine',
        date: undefined,
        tool: 'web_search',
      },
      {
        id: 'S4',
        title: 'Attention Is All You Need',
        locator: 'https://arxiv.org/abs/1706.03762',
        date: '2017-06-12',
        tool: 'arxiv_search',
      },
      {
        id: 'S5',
        title: 'An old-style identifier',
        locator: 'https://arxiv.org/abs/hep-th/9901001',
        date: '1999-01-04',
        tool: 'arxiv_search',
      },
    ]);
    expect(results[3]?.excerpt).toMatch(/^The dominant sequence transduction models/);
    const changes = result.report.searches.find((search) => search.passage === 'changes');
    expect(changes).toMatchObject({ tool: 'web_search', resultIds: ['S1', 'S2', 'S3'] });
    // The results reach the model as data between untrusted-data marks.
    const prompt = provider.requests
      .map((request) => request.messages.at(-1)?.content ?? '')
      .find((content) => content.includes('Attention Is All You Need'));
    expect(prompt).toMatch(/<<<UNTRUSTED-DATA-\w+\n[^]*Attention Is All You Need[^]*\nUNTRUSTED-DATA-\w+>>>/);
    // The dossier links each source.
    expect(result.markdown).toContain('https://arxiv.org/abs/1706.03762');
  });
});

describe('a study whose prior-art searches are throttled', () => {
  let server: WebServer;
  let env: TestSDK | undefined;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
  });

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
    await server.stop();
  });

  /** DuckDuckGo that answers prior-art queries with `priorArt` for `forMs` after the first one. */
  function duckDuckGoServer(priorArt: Route, forMs: number) {
    let since: number | undefined;
    server.on('/html/', (request, response) => {
      const query = new URLSearchParams(request.body).get('q') ?? '';
      if (query.startsWith('prior art')) {
        since ??= Date.now();
        if (Date.now() - since < forMs) return priorArt(request, response);
      }
      return reply(fixture('duckduckgo-results.html'))(request, response);
    });
  }

  async function runStudy() {
    const provider = scriptStudy(new ScriptedLLMProvider());
    env = createTestSDK({}, provider);
    for (const tool of webTools({
      include: ['web_search'],
      search: duckDuckGo({ baseUrl: server.url, minIntervalMs: 0 }),
      throttleWaitMs: 20,
      circuitBreaker: { cooldownMs: 200 },
      cache: false,
    })) {
      env.sdk.defineTool({ ...tool, name: 'search_web' });
    }
    return env.sdk.createStudy(studyConfig()).run();
  }

  it('tries them once more, later, and checks the novelties (a real study lost them all)', async () => {
    // Throttled for 2 s: the tool's own two tries fail; the study's second try, later, works.
    duckDuckGoServer(reply(fixture('duckduckgo-captcha.html')), 2_000);

    const { report } = await runStudy();

    const priorArt = report.searches.filter((search) => search.purpose === 'priorArt');
    expect(priorArt.filter((search) => search.throttled && search.error).length).toBeGreaterThan(0);
    const retried = priorArt.filter((search) => search.retry);
    expect(retried.length).toBeGreaterThan(0);
    expect(retried.every((search) => !search.error && search.resultIds.length > 0)).toBe(true);
    expect(report.noveltyClaims[0]?.priorArt).toMatchObject({ verdict: 'partlyNovel' });
    expect(report.noveltyClaims[0]?.statusReason).toBeUndefined();
  }, 60_000);

  it('keeps the honest marking when the second try is throttled too', async () => {
    duckDuckGoServer(reply(fixture('duckduckgo-captcha.html')), 600_000);

    const { report } = await runStudy();

    const retried = report.searches.filter((search) => search.retry);
    expect(retried.length).toBeGreaterThan(0);
    expect(retried.every((search) => search.throttled)).toBe(true);
    expect(report.noveltyClaims[0]).toMatchObject({
      toVerify: true,
      statusReason: { code: 'priorArtSearchFailed' },
    });
  }, 60_000);

  it('does not try again a search that failed for another reason', async () => {
    duckDuckGoServer(reply('down', { status: 500, type: 'text/plain' }), 600_000);

    const { report } = await runStudy();

    const priorArt = report.searches.filter((search) => search.purpose === 'priorArt');
    expect(priorArt.every((search) => search.error && !search.throttled && !search.retry)).toBe(true);
    expect(report.noveltyClaims[0]).toMatchObject({ statusReason: { code: 'priorArtSearchFailed' } });
  }, 60_000);
});
