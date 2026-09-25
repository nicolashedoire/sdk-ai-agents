import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arxivQuery } from '../tools/web/sources/arxiv.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { reply, replyJson, WebServer } from './support/web-server.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/web/${name}`, import.meta.url), 'utf8');

// arXiv, Wikipedia and GitHub are local servers speaking their real formats.
describe('arxiv_search, wikipedia_search, github_search', () => {
  let server: WebServer;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  function tool(name: string, options: WebToolsOptions = {}): ToolDefinition {
    const found = webTools({ cache: false, ...options }).find((candidate) => candidate.name === name);
    if (!found) throw new Error(`no ${name} tool`);
    return found;
  }

  async function call(name: string, args: Record<string, unknown>, options: WebToolsOptions = {}) {
    const definition = tool(name, options);
    return definition.handler(definition.schema.parse(args));
  }

  describe('arxiv_search', () => {
    const arxiv = () => ({ arxiv: { baseUrl: server.url, minIntervalMs: 0 } });

    it('reads the Atom feed: title, authors, dates, abstract, abstract and PDF links', async () => {
      server.on('/api/query', reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' }));

      const output = await call('arxiv_search', { query: 'attention in the transformer', maxResults: 2 }, arxiv());

      expect(output).toEqual({
        query: 'attention in the transformer',
        results: [
          {
            id: 'arxiv:1706.03762',
            title: 'Attention Is All You Need',
            url: 'https://arxiv.org/abs/1706.03762',
            pdfUrl: 'https://arxiv.org/pdf/1706.03762v7',
            date: '2017-06-12',
            updated: '2023-08-02',
            authors: ['Ashish Vaswani', 'Noam Shazeer'],
            excerpt:
              'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms & dispensing with recurrence and convolutions entirely.',
            category: 'cs.CL',
            source: 'arxiv',
          },
          {
            id: 'arxiv:hep-th/9901001',
            title: 'An old-style identifier',
            url: 'https://arxiv.org/abs/hep-th/9901001',
            pdfUrl: 'https://arxiv.org/pdf/hep-th/9901001v2',
            date: '1999-01-04',
            updated: '1999-02-10',
            authors: ['A. Physicist'],
            excerpt: 'Papers before 2007 are named by archive and number.',
            category: 'hep-th',
            source: 'arxiv',
          },
        ],
        untrusted: true,
      });
      const query = server.hits('/api/query')[0]?.query;
      expect(Object.fromEntries(query ?? [])).toEqual({
        search_query: 'all:"attention in the transformer" OR all:attention OR all:transformer',
        start: '0',
        max_results: '2',
        sortBy: 'relevance',
        sortOrder: 'descending',
      });
    });

    it("searches the words as a phrase or one by one, and passes arXiv's own syntax as it is", () => {
      expect(arxivQuery('ti:transformer AND cat:cs.LG')).toBe('ti:transformer AND cat:cs.LG');
      expect(arxivQuery('transformers')).toBe('all:transformers');
      // Operators are never terms: `all:AND` is a syntax error for arXiv.
      expect(arxivQuery('layout AND not paint')).toBe('all:"layout AND not paint" OR all:layout OR all:paint');
      expect(arxivQuery('the of')).toBe('all:"the of"');
    });

    it('throws the message of an error feed', async () => {
      server.on('/api/query', reply(fixture('arxiv-error.xml'), { type: 'application/atom+xml' }));

      await expect(call('arxiv_search', { query: 'x' }, arxiv())).rejects.toThrow(
        'arXiv refused the query (its answer, untrusted: "max_results must be non-negative")'
      );
    });

    it('explains a refusal of its rate limit (arXiv answers 406 or 503)', async () => {
      server.on('/api/query', reply('Not Acceptable', { status: 406, type: 'text/plain' }));

      await expect(call('arxiv_search', { query: 'x' }, arxiv())).rejects.toThrow(
        'arXiv refused the request (HTTP 406): it allows one request every 3 s; try again later'
      );
    });

    it('waits 3 s between requests by default, as the arXiv API asks', async () => {
      const started: number[] = [];
      server.on('/api/query', (request, response) => {
        started.push(Date.now());
        reply(fixture('arxiv-feed.xml'), { type: 'application/atom+xml' })(request, response);
      });
      const search = tool('arxiv_search', { arxiv: { baseUrl: server.url } });

      await Promise.all([
        search.handler(search.schema.parse({ query: 'a' })),
        search.handler(search.schema.parse({ query: 'b' })),
      ]);

      expect((started[1] ?? 0) - (started[0] ?? 0)).toBeGreaterThanOrEqual(2_950);
    }, 10_000);
  });

  describe('wikipedia_search', () => {
    const page = {
      batchcomplete: true,
      continue: { sroffset: 2, continue: '-||' },
      query: {
        searchinfo: { totalhits: 120 },
        search: [
          {
            ns: 0,
            title: 'Browser engine',
            pageid: 7266,
            snippet: 'A <span class="searchmatch">browser</span> <span class="searchmatch">engine</span> is a core software component &amp; more',
            timestamp: '2026-08-30T12:14:08Z',
          },
          {
            ns: 0,
            title: 'AC/DC: Live',
            pageid: 99,
            snippet: 'A live album',
            timestamp: '2025-01-02T00:00:00Z',
          },
        ],
      },
    };

    it('asks the MediaWiki API and returns title, URL, excerpt and last-edit date', async () => {
      server.on('/w/api.php', replyJson(page));

      const output = await call(
        'wikipedia_search',
        { query: 'browser engine', language: 'fr', maxResults: 2 },
        { wikipedia: { baseUrl: server.url } }
      );

      expect(output).toEqual({
        query: 'browser engine',
        language: 'fr',
        results: [
          {
            id: 'wikipedia:fr:7266',
            title: 'Browser engine',
            url: `${server.url}/wiki/Browser_engine`,
            date: '2026-08-30',
            excerpt: 'A browser engine is a core software component & more',
            source: 'wikipedia',
          },
          {
            id: 'wikipedia:fr:99',
            title: 'AC/DC: Live',
            url: `${server.url}/wiki/AC/DC:_Live`,
            date: '2025-01-02',
            excerpt: 'A live album',
            source: 'wikipedia',
          },
        ],
        untrusted: true,
      });
      const query = server.hits('/w/api.php')[0]?.query;
      expect(Object.fromEntries(query ?? [])).toEqual({
        action: 'query',
        list: 'search',
        srsearch: 'browser engine',
        srlimit: '2',
        srprop: 'snippet|timestamp',
        format: 'json',
        formatversion: '2',
        utf8: '1',
      });
    });

    it("puts the language in the wiki's address, from the tools' language by default", async () => {
      server.on('/de/w/api.php', replyJson(page));

      const output = (await call(
        'wikipedia_search',
        { query: 'Browser' },
        { language: 'de-CH', wikipedia: { baseUrl: `${server.url}/{language}` } }
      )) as { language: string; results: Array<{ url: string }> };

      expect(output.language).toBe('de');
      expect(output.results[0]?.url).toBe(`${server.url}/de/wiki/Browser_engine`);
    });

    it('throws the error the API answers', async () => {
      server.on('/w/api.php', replyJson({ error: { code: 'nosrsearch', info: 'The "srsearch" parameter must be set.' } }));

      await expect(call('wikipedia_search', { query: 'x' }, { wikipedia: { baseUrl: server.url } })).rejects.toThrow(
        'Wikipedia refused the search (its answer, untrusted: "The \\"srsearch\\" parameter must be set.")'
      );
    });
  });

  describe('github_search', () => {
    const github = (token?: string) => ({ github: { baseUrl: server.url, ...(token ? { token } : {}) } });

    it('searches repositories: name, URL, last push, description, stars', async () => {
      server.on(
        '/search/repositories',
        replyJson({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              id: 1,
              full_name: 'servo/servo',
              html_url: 'https://github.com/servo/servo',
              description: 'Servo, the embeddable, independent, memory-safe, modular, parallel web rendering engine',
              stargazers_count: 28000,
              language: 'Rust',
              pushed_at: '2026-09-24T18:00:00Z',
              updated_at: '2026-09-24T19:00:00Z',
            },
          ],
        })
      );

      const output = await call('github_search', { query: 'browser engine language:rust', maxResults: 5 }, github());

      expect(output).toEqual({
        query: 'browser engine language:rust',
        kind: 'repositories',
        results: [
          {
            id: 'github:servo/servo',
            title: 'servo/servo',
            url: 'https://github.com/servo/servo',
            date: '2026-09-24',
            excerpt: 'Servo, the embeddable, independent, memory-safe, modular, parallel web rendering engine',
            stars: 28000,
            language: 'Rust',
            source: 'github',
          },
        ],
        untrusted: true,
      });
      const [request] = server.hits('/search/repositories');
      expect(Object.fromEntries(request?.query ?? [])).toEqual({ q: 'browser engine language:rust', per_page: '5' });
      expect(request?.headers.accept).toBe('application/vnd.github+json');
      expect(request?.headers['x-github-api-version']).toBe('2022-11-28');
      expect(request?.headers.authorization).toBeUndefined();
    });

    it('searches issues and pull requests', async () => {
      server.on(
        '/search/issues',
        replyJson({
          total_count: 2,
          items: [
            {
              title: 'Layout thrashing on scroll',
              html_url: 'https://github.com/servo/servo/issues/42',
              repository_url: 'https://api.github.com/repos/servo/servo',
              number: 42,
              state: 'open',
              created_at: '2025-03-04T10:00:00Z',
              body: 'Steps:\n1. Scroll\n2. See relayouts',
            },
            {
              title: 'Reuse fragments',
              html_url: 'https://github.com/servo/servo/pull/43',
              repository_url: 'https://api.github.com/repos/servo/servo',
              number: 43,
              state: 'closed',
              created_at: '2025-03-05T10:00:00Z',
              body: null,
              pull_request: { url: 'https://api.github.com/repos/servo/servo/pulls/43' },
            },
          ],
        })
      );

      const output = (await call('github_search', { query: 'relayout', kind: 'issues' }, github())) as {
        results: unknown[];
      };

      expect(output.results).toEqual([
        {
          id: 'github:servo/servo#42',
          title: 'Layout thrashing on scroll',
          url: 'https://github.com/servo/servo/issues/42',
          date: '2025-03-04',
          excerpt: 'Steps: 1. Scroll 2. See relayouts',
          state: 'open',
          type: 'issue',
          source: 'github',
        },
        {
          id: 'github:servo/servo#43',
          title: 'Reuse fragments',
          url: 'https://github.com/servo/servo/pull/43',
          date: '2025-03-05',
          excerpt: '',
          state: 'closed',
          type: 'pull request',
          source: 'github',
        },
      ]);
    });

    it('searches code with a token, and its matching fragments', async () => {
      server.on(
        '/search/code',
        replyJson({
          items: [
            {
              name: 'fragment.rs',
              path: 'components/layout/fragment.rs',
              html_url: 'https://github.com/servo/servo/blob/main/components/layout/fragment.rs',
              repository: { full_name: 'servo/servo' },
              text_matches: [{ fragment: 'pub struct Fragment {' }, { fragment: 'impl Fragment' }],
            },
          ],
        })
      );

      const output = (await call('github_search', { query: 'Fragment', kind: 'code' }, github('ghp_secret'))) as {
        results: unknown[];
      };

      expect(output.results).toEqual([
        {
          id: 'github:servo/servo/components/layout/fragment.rs',
          title: 'servo/servo: components/layout/fragment.rs',
          url: 'https://github.com/servo/servo/blob/main/components/layout/fragment.rs',
          excerpt: 'pub struct Fragment { … impl Fragment',
          source: 'github',
        },
      ]);
      const [request] = server.hits('/search/code');
      expect(request?.headers.authorization).toBe('Bearer ghp_secret');
      expect(request?.headers.accept).toBe('application/vnd.github.text-match+json');
    });

    it('needs a token to search code, and says so without calling GitHub', async () => {
      await expect(call('github_search', { query: 'x', kind: 'code' }, github())).rejects.toThrow(
        'GitHub searches code only with a token: webTools({ github: { token } })'
      );
      expect(server.requests).toHaveLength(0);
    });

    it('explains a rate limit', async () => {
      server.on('/search/repositories', (_request, response) => {
        response.writeHead(403, {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1790000000',
        });
        response.end(JSON.stringify({ message: 'API rate limit exceeded' }));
      });

      await expect(call('github_search', { query: 'x' }, github())).rejects.toThrow(
        "GitHub's search rate limit is reached until 2026-09-21T14:13:20.000Z: a token raises it"
      );
    });
  });

  it('builds the five tools by default, the search ones read-only and low risk', () => {
    const tools = webTools();
    expect(tools.map((definition) => [definition.name, definition.metadata?.riskLevel])).toEqual([
      ['web_search', 'low'],
      ['web_fetch', 'medium'],
      ['arxiv_search', 'low'],
      ['wikipedia_search', 'low'],
      ['github_search', 'low'],
    ]);
    expect(tools.every((definition) => definition.metadata?.readOnly === true)).toBe(true);
  });
});
