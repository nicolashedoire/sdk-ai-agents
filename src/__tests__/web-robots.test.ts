import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseRobots, robotsVerdict } from '../tools/web/robots.js';
import type { WebFetchOutput } from '../tools/web/web-fetch.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { redirect, reply, WebServer } from './support/web-server.js';

const allowedFor = (robots: string, path: string, token = 'sdk-ai-agents') =>
  robotsVerdict(parseRobots(robots), token, path).allowed;

describe('robots.txt', () => {
  describe('matching in linear time', () => {
    it('matches a pattern of many wildcards without backtracking (it took 8.5 s)', () => {
      const pattern = `/${'*a'.repeat(10)}*b`;
      const started = Date.now();

      expect(allowedFor(`User-agent: *\nDisallow: ${pattern}\n`, `/${'a'.repeat(40)}`)).toBe(true);
      expect(allowedFor(`User-agent: *\nDisallow: ${pattern}\n`, `/${'a'.repeat(40)}b`)).toBe(false);
      expect(Date.now() - started).toBeLessThan(50);
    });

    it('stays fast on a hostile file: thousands of wildcard rules against a long path', () => {
      const rules = Array.from({ length: 5_000 }, () => `Disallow: /${'*a'.repeat(50)}*b`).join('\n');
      const groups = parseRobots(`User-agent: *\n${rules}\n`);
      const started = Date.now();

      expect(robotsVerdict(groups, 'sdk-ai-agents', `/${'a'.repeat(4_000)}`).allowed).toBe(true);
      expect(Date.now() - started).toBeLessThan(1_000);
    });

    it('keeps the meaning of *, ** and $', () => {
      const robots = 'User-agent: *\nDisallow: /a**b\nDisallow: /*.pdf$\nDisallow: /x*y$\n';
      expect(allowedFor(robots, '/axxb')).toBe(false);
      expect(allowedFor(robots, '/ab/more')).toBe(false);
      expect(allowedFor(robots, '/a')).toBe(true);
      expect(allowedFor(robots, '/doc.pdf')).toBe(false);
      expect(allowedFor(robots, '/doc.pdf?x=1')).toBe(true);
      expect(allowedFor(robots, '/xay')).toBe(false);
      expect(allowedFor(robots, '/xayz')).toBe(true);
      // The earliest place of each part is taken, and the end anchor still finds the last one.
      expect(allowedFor(robots, '/x-y-y')).toBe(false);
    });

    it('ignores rules longer than 2,048 characters', () => {
      expect(allowedFor(`User-agent: *\nDisallow: /${'a'.repeat(2_048)}\n`, `/${'a'.repeat(3_000)}`)).toBe(true);
    });
  });

  describe('RFC 9309', () => {
    it('compares paths with unreserved escapes decoded and other escapes kept (§2.2.2)', () => {
      const robots = 'User-agent: *\nDisallow: /private-area\nDisallow: /%7Euser\nDisallow: /a%2fb\n';
      expect(allowedFor(robots, '/private%2Darea')).toBe(false);
      expect(allowedFor(robots, '/private-area')).toBe(false);
      expect(allowedFor(robots, '/~user/page')).toBe(false);
      expect(allowedFor(robots, '/%7euser')).toBe(false);
      // %2F is a reserved character: it is not a slash.
      expect(allowedFor(robots, '/a%2Fb')).toBe(false);
      expect(allowedFor(robots, '/a/b')).toBe(true);
    });

    it('does not end a group at a sitemap line between its user-agent lines', () => {
      const robots = 'User-agent: other\nSitemap: https://x.example/s.xml\nUser-agent: sdk-ai-agents\nDisallow: /\n';
      expect(allowedFor(robots, '/page')).toBe(false);
    });

    it('matches the fixed token sdk-ai-agents, not the first word of the user agent', async () => {
      const server = new WebServer();
      await server.start();
      try {
        server.on('/robots.txt', reply('User-agent: mozilla\nDisallow: /\n\nUser-agent: sdk-ai-agents\nDisallow: /private\n', { type: 'text/plain' }));
        server.on('/page', reply('<p>Page</p>'));
        server.on('/private', reply('<p>Private</p>'));
        const [tool] = webTools({
          include: ['web_fetch'],
          userAgent: 'Mozilla/5.0 (compatible; ResearchBot/1.0)',
          allowPrivateNetwork: [server.host],
          hostIntervalMs: 0,
          cache: false,
        });
        if (!tool) throw new Error('no web_fetch');

        await expect(tool.handler(tool.schema.parse({ url: `${server.url}/page` }))).resolves.toMatchObject({ content: 'Page' });
        await expect(tool.handler(tool.schema.parse({ url: `${server.url}/private` }))).rejects.toThrow(
          'does not allow sdk-ai-agents to read /private'
        );
        expect(server.hits('/robots.txt')[0]?.headers['user-agent']).toBe('Mozilla/5.0 (compatible; ResearchBot/1.0)');
      } finally {
        await server.stop();
      }
    });
  });

  describe('with web_fetch', () => {
    let server: WebServer;

    beforeEach(async () => {
      server = new WebServer();
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    function fetchTool(options: WebToolsOptions = {}): ToolDefinition {
      const [tool] = webTools({ include: ['web_fetch'], allowPrivateNetwork: [server.host], cache: false, ...options });
      if (!tool) throw new Error('no web_fetch');
      return tool;
    }

    const fetchUrl = (tool: ToolDefinition, url: string, signal?: AbortSignal) =>
      tool.handler(tool.schema.parse({ url }), { runId: 'r', agentId: 'a', ...(signal ? { signal } : {}) }) as Promise<WebFetchOutput>;

    it('checks a redirect chain of long paths against a hostile pattern quickly', async () => {
      server.on('/robots.txt', reply(`User-agent: *\nDisallow: /${'*a'.repeat(12)}*b\n`, { type: 'text/plain' }));
      const long = `/${'a'.repeat(60)}`;
      server.on('/start', redirect(long));
      server.on(long, reply('<p>Reached</p>'));
      const started = Date.now();

      await expect(fetchUrl(fetchTool({ hostIntervalMs: 0 }), `${server.url}/start`)).resolves.toMatchObject({ content: 'Reached' });
      expect(Date.now() - started).toBeLessThan(1_000);
    });

    it('does not delay the first page on its own robots.txt request, even with a Crawl-delay', async () => {
      server.on('/robots.txt', reply('User-agent: *\nCrawl-delay: 40\n', { type: 'text/plain' }));
      server.on('/page', reply('<p>Page</p>'));
      const tool = fetchTool({ hostIntervalMs: 1_000 });
      const started = Date.now();

      await expect(fetchUrl(tool, `${server.url}/page`)).resolves.toMatchObject({ content: 'Page' });
      expect(Date.now() - started).toBeLessThan(500);
      // The next page waits for the Crawl-delay: 40 s is more than a call may wait.
      await expect(fetchUrl(tool, `${server.url}/page?again`)).rejects.toThrow('asks for 40 s between requests');
    });

    it('lets one caller give up without failing the others waiting for the same robots.txt', async () => {
      server.on('/robots.txt', (_request, response) => {
        setTimeout(() => response.writeHead(404).end(), 300);
      });
      server.on('/a', reply('<p>A</p>'));
      server.on('/b', reply('<p>B</p>'));
      const tool = fetchTool({ hostIntervalMs: 0 });
      const giveUp = new AbortController();
      setTimeout(() => giveUp.abort(new Error('caller A gave up')), 50);

      const [a, b] = await Promise.allSettled([
        fetchUrl(tool, `${server.url}/a`, giveUp.signal),
        fetchUrl(tool, `${server.url}/b`),
      ]);

      expect(a).toMatchObject({ status: 'rejected', reason: { message: 'caller A gave up' } });
      expect(b).toMatchObject({ status: 'fulfilled', value: { content: 'B' } });
      expect(server.hits('/robots.txt')).toHaveLength(1);
    });
  });
});
