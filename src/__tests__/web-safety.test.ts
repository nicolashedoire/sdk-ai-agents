import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GuardedHttpClient, redirectTarget, type WebLookup } from '../tools/web/guarded-http.js';
import { isPublicAddress, nonPublicKind } from '../tools/web/ip-ranges.js';
import { HostPacer } from '../tools/web/politeness.js';
import { brave } from '../tools/web/providers/brave.js';
import { searxng } from '../tools/web/providers/searxng.js';
import { parseRobots, robotsVerdict } from '../tools/web/robots.js';
import { TtlCache } from '../tools/web/web-cache.js';
import type { WebFetchOutput } from '../tools/web/web-fetch.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { redirect, reply, replyJson, WebServer } from './support/web-server.js';

/** A resolver for made-up names; any other name is unknown. */
function fakeDns(records: Record<string, string[]>): WebLookup {
  return async (hostname) => {
    const addresses = records[hostname];
    if (!addresses) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
}

describe('web tools safety', () => {
  let server: WebServer;
  let other: WebServer;

  beforeEach(async () => {
    server = new WebServer();
    other = new WebServer();
    await Promise.all([server.start(), other.start()]);
  });

  afterEach(async () => {
    await Promise.all([server.stop(), other.stop()]);
  });

  function fetchTool(options: WebToolsOptions = {}): ToolDefinition {
    const [tool] = webTools({ include: ['web_fetch'], hostIntervalMs: 0, cache: false, ...options });
    if (!tool) throw new Error('no web_fetch tool');
    return tool;
  }

  async function fetchUrl(url: string, options: WebToolsOptions = {}): Promise<WebFetchOutput> {
    const tool = fetchTool(options);
    return (await tool.handler(tool.schema.parse({ url }))) as WebFetchOutput;
  }

  describe('SSRF: nothing outside the public Internet (allowPrivateNetwork off)', () => {
    it('refuses loopback, private, link-local and metadata addresses written in the URL, without connecting', async () => {
      server.on('/secret', reply('secret'));
      const port = new URL(server.url).port;
      const cases: Array<[string, RegExp]> = [
        [`http://127.0.0.1:${port}/secret`, /127\.0\.0\.1:\d+ is a loopback address/],
        [`http://[::1]:${port}/secret`, /\[::1\]:\d+ is a loopback address/],
        [`http://[::ffff:127.0.0.1]:${port}/secret`, /is a loopback, as 127\.0\.0\.1 inside an IPv6 address/],
        [`http://0.0.0.0:${port}/secret`, /is a unspecified/],
        ['http://10.0.0.1/admin', /10\.0\.0\.1 is a private address/],
        ['http://192.168.1.1/', /is a private address/],
        ['http://169.254.169.254/latest/meta-data/', /169\.254\.169\.254 is a link-local \(cloud metadata\) address/],
        ['http://100.64.0.1/', /shared \(carrier-grade NAT\)/],
        ['http://[fd00::1]/', /unique local \(private\)/],
        ['http://[64:ff9b::a9fe:a9fe]/', /link-local \(cloud metadata\), as 169\.254\.169\.254 inside an IPv6 address/],
        ['http://2130706433/', /127\.0\.0\.1 is a loopback address/],
      ];

      for (const [url, message] of cases) {
        await expect(fetchUrl(url), url).rejects.toThrow(message);
      }
      expect(server.requests).toHaveLength(0);
    });

    it('refuses localhost: the name resolves to a loopback address', async () => {
      server.on('/secret', reply('secret'));

      await expect(fetchUrl(`http://localhost:${new URL(server.url).port}/secret`)).rejects.toThrow(
        /localhost resolves to (?:127\.0\.0\.1|::1), a loopback address: refused/
      );
      expect(server.requests).toHaveLength(0);
    });

    it('refuses a name that resolves to a private address, even among public ones', async () => {
      const lookup = fakeDns({
        'intranet.example': ['10.1.2.3'],
        'mixed.example': ['93.184.216.34', '192.168.0.10'],
      });

      await expect(fetchUrl('http://intranet.example/', { lookup })).rejects.toThrow(
        'intranet.example resolves to 10.1.2.3, a private address: refused (allowPrivateNetwork is off)'
      );
      await expect(fetchUrl('http://mixed.example/', { lookup })).rejects.toThrow(
        'mixed.example resolves to 192.168.0.10, a private address'
      );
    });

    it('checks the addresses the connection itself uses: the lookup is the socket’s', async () => {
      server.on('/page', reply('<p>Reached through site.test</p>'));
      const lookup = fakeDns({ 'site.test': ['127.0.0.1'] });
      const url = `http://site.test:${new URL(server.url).port}/page`;

      // No system resolver knows site.test: only the connection's own lookup can reach the server.
      await expect(fetchUrl(url, { lookup })).rejects.toThrow('site.test resolves to 127.0.0.1');
      const page = await fetchUrl(url, { lookup, allowPrivateNetwork: ['site.test'] });

      expect(page.content).toBe('Reached through site.test');
      expect(server.hits('/page')[0]?.headers.host).toBe(`site.test:${new URL(server.url).port}`);
    });

    it('checks every redirect again: a public-looking page cannot redirect to a private one', async () => {
      other.on('/secret', reply('secret'));
      const otherPort = new URL(other.url).port;
      server.on('/metadata', redirect('http://169.254.169.254/latest/meta-data/iam/'));
      server.on('/loopback', redirect(`http://127.0.0.1:${otherPort}/secret`));
      server.on('/named', redirect(`http://localhost:${otherPort}/secret`));
      server.on('/intranet', redirect('http://intranet.example/'));
      // Only the first server is let through, by its host:port.
      const options: WebToolsOptions = {
        allowPrivateNetwork: [server.host],
        lookup: fakeDns({ 'intranet.example': ['10.0.0.7'], localhost: ['127.0.0.1', '::1'] }),
      };

      await expect(fetchUrl(`${server.url}/metadata`, options)).rejects.toThrow(
        '169.254.169.254 is a link-local (cloud metadata) address'
      );
      await expect(fetchUrl(`${server.url}/loopback`, options)).rejects.toThrow(
        `127.0.0.1:${otherPort} is a loopback address`
      );
      await expect(fetchUrl(`${server.url}/named`, options)).rejects.toThrow(/localhost resolves to/);
      await expect(fetchUrl(`${server.url}/intranet`, options)).rejects.toThrow(
        'intranet.example resolves to 10.0.0.7'
      );
      expect(other.requests).toHaveLength(0);
    });

    it("exempts a provider's configured endpoint on its own origin only", async () => {
      server.on('/search', replyJson({ results: [{ url: 'https://a.example/', title: 'A', content: 'a' }] }));
      const tools = webTools({ search: searxng({ baseUrl: server.url }), cache: false, hostIntervalMs: 0 });
      const [search, fetch] = tools;
      if (!search || !fetch) throw new Error('missing tools');

      const found = await search.handler(search.schema.parse({ query: 'a' }));
      expect(found).toMatchObject({ provider: 'searxng' });
      // The model cannot use that exemption to read the same server.
      await expect(fetch.handler(fetch.schema.parse({ url: `${server.url}/search` }))).rejects.toThrow(
        'is a loopback address'
      );
    });
  });

  describe('redirects, schemes and credentials', () => {
    it('refuses a redirect from https to http', () => {
      expect(() => redirectTarget(new URL('https://a.example/x'), 'http://a.example/y', 301)).toThrow(
        'redirects from https to http (http://a.example/y): refused'
      );
      expect(redirectTarget(new URL('http://a.example/x'), 'https://a.example/y', 301).href).toBe(
        'https://a.example/y'
      );
      expect(redirectTarget(new URL('https://a.example/x'), '/z', 302).href).toBe('https://a.example/z');
    });

    it('refuses schemes other than http(s), asked or redirected to', async () => {
      server.on('/file', redirect('file:///etc/passwd'));
      server.on('/gopher', redirect('gopher://a.example/'));
      const client = new GuardedHttpClient({
        userAgent: 'test',
        timeoutMs: 1_000,
        maxRedirects: 5,
        maxBytes: 1_000,
        pacer: new HostPacer(1_000),
        allowPrivateNetwork: true,
      });

      await expect(client.request('file:///etc/passwd')).rejects.toThrow('file: URLs are refused: only http and https');
      await expect(client.request(`${server.url}/file`)).rejects.toThrow('redirects to a file: URL');
      await expect(client.request(`${server.url}/gopher`)).rejects.toThrow('redirects to a gopher: URL');
    });

    it('follows at most maxRedirects redirects', async () => {
      server.on('/loop', (request, response) => {
        const hop = Number(request.query.get('n') ?? '0');
        redirect(`/loop?n=${hop + 1}`)(request, response);
      });

      await expect(fetchUrl(`${server.url}/loop`, { allowPrivateNetwork: [server.host], maxRedirects: 3 })).rejects.toThrow(
        'more than 3 redirects'
      );
      expect(server.hits('/loop')).toHaveLength(4);
    });

    it('never sends an API key to another origin a redirect points to', async () => {
      server.on('/res/v1/web/search', redirect('/res/v1/web/search2', 307));
      server.on('/res/v1/web/search2', redirect(`${other.url}/collect`, 307));
      other.on('/collect', replyJson({ web: { results: [] } }));
      const [search] = webTools({
        include: ['web_search'],
        search: brave({ apiKey: 'brave-secret', baseUrl: server.url, minIntervalMs: 0 }),
        allowPrivateNetwork: true,
        cache: false,
      });
      if (!search) throw new Error('no web_search');

      await search.handler(search.schema.parse({ query: 'x' }));

      // Kept on the same origin, dropped when leaving it.
      expect(server.hits('/res/v1/web/search2')[0]?.headers['x-subscription-token']).toBe('brave-secret');
      expect(other.hits('/collect')[0]?.headers['x-subscription-token']).toBeUndefined();
    });
  });

  describe('byte cap, timeouts, pacing', () => {
    it('stops reading a body past maxResponseBytes: the rest is never downloaded', async () => {
      let written = 0;
      server.on('/endless', (_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        const timer = setInterval(() => {
          if (response.destroyed) {
            clearInterval(timer);
            return;
          }
          written += 8_192;
          response.write('x'.repeat(8_192));
        }, 1);
      });

      const page = await fetchUrl(`${server.url}/endless`, {
        allowPrivateNetwork: [server.host],
        maxResponseBytes: 20_000,
        robots: false,
      });

      expect(page.truncated).toBe(true);
      expect(page.content.length).toBeLessThanOrEqual(12_000);
      expect(written).toBeLessThan(1_000_000);
    });

    it('gives up on a server that does not answer in time', async () => {
      server.on('/slow-headers', (_request, response) => {
        setTimeout(() => response.writeHead(200).end('late'), 2_000);
      });
      const started = Date.now();

      await expect(
        fetchUrl(`${server.url}/slow-headers`, { allowPrivateNetwork: [server.host], timeoutMs: 150, robots: false })
      ).rejects.toThrow(`GET ${server.url}/slow-headers timed out after 150 ms`);
      expect(Date.now() - started).toBeLessThan(1_500);
    });

    it('gives up on a body that never ends', async () => {
      server.on('/slow-body', (_request, response) => {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.write('<p>Start');
      });

      await expect(
        fetchUrl(`${server.url}/slow-body`, { allowPrivateNetwork: [server.host], timeoutMs: 150, robots: false })
      ).rejects.toThrow('timed out after 150 ms');
    });

    it('keeps a bounded cache: past maxEntries, the least recently used entry goes', () => {
      const cache = new TtlCache<number>(60_000, 2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a');
      cache.set('c', 3);

      expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([1, undefined, 3]);
      expect(cache.size).toBe(2);
    });

    it('spaces its requests to one host by hostIntervalMs', async () => {
      const started: number[] = [];
      server.on('/page', (request, response) => {
        started.push(Date.now());
        reply('<p>x</p>')(request, response);
      });
      const tool = fetchTool({ allowPrivateNetwork: [server.host], hostIntervalMs: 150, robots: false });

      await Promise.all([
        tool.handler(tool.schema.parse({ url: `${server.url}/page?a` })),
        tool.handler(tool.schema.parse({ url: `${server.url}/page?b` })),
      ]);

      expect((started[1] ?? 0) - (started[0] ?? 0)).toBeGreaterThanOrEqual(140);
    });
  });

  describe('the whole call has a deadline (callTimeoutMs)', () => {
    it('ends a slow redirect chain across origins, however fast each hop', async () => {
      const servers = [server, other, new WebServer(), new WebServer(), new WebServer(), new WebServer()];
      await Promise.all(servers.slice(2).map((extra) => extra.start()));
      try {
        servers.forEach((current, index) => {
          const next = servers[index + 1];
          current.on('/hop', (_request, response) => {
            // Each hop answers within timeoutMs; together they take 2.4 s.
            setTimeout(() => {
              if (next) response.writeHead(302, { location: `${next.url}/hop` }).end();
              else response.writeHead(200, { 'content-type': 'text/html' }).end('<p>End</p>');
            }, 400);
          });
        });
        const started = Date.now();

        await expect(
          fetchUrl(`${server.url}/hop`, {
            allowPrivateNetwork: true,
            robots: false,
            timeoutMs: 1_000,
            callTimeoutMs: 1_000,
          })
        ).rejects.toThrow('web_fetch did not finish within 1000 ms (callTimeoutMs)');
        expect(Date.now() - started).toBeLessThan(1_500);
      } finally {
        await Promise.all(servers.slice(2).map((extra) => extra.stop()));
      }
    });

    it('ends a wait for the pacing of a host', async () => {
      server.on('/page', reply('<p>x</p>'));
      const tool = fetchTool({ allowPrivateNetwork: [server.host], robots: false, hostIntervalMs: 5_000, callTimeoutMs: 300 });
      await tool.handler(tool.schema.parse({ url: `${server.url}/page?a` }));
      const started = Date.now();

      await expect(tool.handler(tool.schema.parse({ url: `${server.url}/page?b` }))).rejects.toThrow(
        'web_fetch did not finish within 300 ms'
      );
      expect(Date.now() - started).toBeLessThan(800);
    });

    it('ends a wait for a slow robots.txt', async () => {
      server.on('/robots.txt', (_request, response) => {
        setTimeout(() => response.writeHead(404).end(), 2_000);
      });
      server.on('/page', reply('<p>x</p>'));
      const started = Date.now();

      await expect(fetchUrl(`${server.url}/page`, { allowPrivateNetwork: [server.host], callTimeoutMs: 300 })).rejects.toThrow(
        'web_fetch did not finish within 300 ms'
      );
      expect(Date.now() - started).toBeLessThan(800);
    });

    it('bounds the searches too', async () => {
      server.on('/search', (_request, response) => {
        setTimeout(() => response.writeHead(200, { 'content-type': 'application/json' }).end('{"results":[]}'), 2_000);
      });
      const [search] = webTools({ include: ['web_search'], search: searxng({ baseUrl: server.url }), callTimeoutMs: 300, cache: false });
      if (!search) throw new Error('no web_search');

      await expect(search.handler(search.schema.parse({ query: 'x' }))).rejects.toThrow(
        'web_search did not finish within 300 ms'
      );
    });
  });

  describe('robots.txt (RFC 9309)', () => {
    const allowed = (): WebToolsOptions => ({ allowPrivateNetwork: [server.host] });

    it('never fetches what robots.txt disallows, and reads it once per site', async () => {
      server.on('/robots.txt', reply('User-agent: *\nDisallow: /private\n', { type: 'text/plain' }));
      server.on('/public/page', reply('<p>Public</p>'));
      server.on('/private/page', reply('<p>Private</p>'));
      const tool = fetchTool(allowed());

      await expect(tool.handler(tool.schema.parse({ url: `${server.url}/private/page` }))).rejects.toThrow(
        `robots.txt of ${server.url} does not allow sdk-ai-agents to read /private/page: disallowed by the rule "Disallow: /private"`
      );
      await expect(tool.handler(tool.schema.parse({ url: `${server.url}/public/page` }))).resolves.toMatchObject({
        content: 'Public',
      });
      expect(server.hits('/private/page')).toHaveLength(0);
      expect(server.hits('/robots.txt')).toHaveLength(1);
      expect(server.hits('/robots.txt')[0]?.headers['user-agent']).toBe(
        'sdk-ai-agents (+https://github.com/nicolashedoire/sdk-ai-agents)'
      );
    });

    it('follows the group of its own user agent rather than *', async () => {
      server.on(
        '/robots.txt',
        reply('User-agent: *\nDisallow: /\n\nUser-agent: other-bot\nUser-agent: SDK-AI-Agents\nDisallow: /drafts\n', {
          type: 'text/plain',
        })
      );
      server.on('/page', reply('<p>Allowed for us</p>'));
      server.on('/drafts/x', reply('<p>Draft</p>'));

      await expect(fetchUrl(`${server.url}/page`, allowed())).resolves.toMatchObject({ content: 'Allowed for us' });
      await expect(fetchUrl(`${server.url}/drafts/x`, allowed())).rejects.toThrow('"Disallow: /drafts"');
    });

    it('checks every redirect against robots.txt', async () => {
      server.on('/robots.txt', reply('User-agent: *\nDisallow: /private\n', { type: 'text/plain' }));
      server.on('/go', redirect('/private/page'));
      server.on('/private/page', reply('<p>Private</p>'));

      await expect(fetchUrl(`${server.url}/go`, allowed())).rejects.toThrow('does not allow sdk-ai-agents to read /private/page');
      expect(server.hits('/private/page')).toHaveLength(0);
    });

    it('treats a missing robots.txt (4xx) as no rules, and a failing one (5xx) as "disallow all"', async () => {
      server.on('/page', reply('<p>Page</p>'));
      other.on('/page', reply('<p>Page</p>'));
      other.on('/robots.txt', reply('Service unavailable', { status: 503, type: 'text/plain' }));

      await expect(fetchUrl(`${server.url}/page`, allowed())).resolves.toMatchObject({ content: 'Page' });
      await expect(fetchUrl(`${other.url}/page`, { allowPrivateNetwork: [other.host] })).rejects.toThrow(
        `${other.url}/robots.txt answered HTTP 503: everything is disallowed`
      );
      expect(other.hits('/page')).toHaveLength(0);
    });

    it('treats an unreachable robots.txt as "disallow all"', async () => {
      server.on('/robots.txt', (_request, response) => {
        response.socket?.destroy();
      });
      server.on('/page', reply('<p>Page</p>'));

      await expect(fetchUrl(`${server.url}/page`, allowed())).rejects.toThrow(/robots\.txt could not be read/);
      expect(server.hits('/page')).toHaveLength(0);
    });

    it('honours Crawl-delay between two requests to the site', async () => {
      server.on('/robots.txt', reply('User-agent: *\nCrawl-delay: 0.3\n', { type: 'text/plain' }));
      const started: number[] = [];
      server.on('/page', (request, response) => {
        started.push(Date.now());
        reply('<p>x</p>')(request, response);
      });
      const tool = fetchTool(allowed());

      await tool.handler(tool.schema.parse({ url: `${server.url}/page?a` }));
      await tool.handler(tool.schema.parse({ url: `${server.url}/page?b` }));

      expect((started[1] ?? 0) - (started[0] ?? 0)).toBeGreaterThanOrEqual(290);
    });

    it('can be turned off: robots: false', async () => {
      server.on('/robots.txt', reply('User-agent: *\nDisallow: /\n', { type: 'text/plain' }));
      server.on('/page', reply('<p>Read anyway</p>'));

      await expect(fetchUrl(`${server.url}/page`, { ...allowed(), robots: false })).resolves.toMatchObject({
        content: 'Read anyway',
      });
      expect(server.hits('/robots.txt')).toHaveLength(0);
    });

    it('matches the most specific rule, allow winning a tie, with * and $ patterns', () => {
      const groups = parseRobots(
        [
          '# comment',
          'User-agent: *',
          'Disallow: /docs',
          'Allow: /docs/public',
          'Disallow: /*.pdf$',
          'Disallow: /tie',
          'Allow: /tie',
          'Disallow: /caf%c3%a9',
          'Disallow:',
        ].join('\n')
      );
      const verdict = (path: string) => robotsVerdict(groups, 'sdk-ai-agents', path).allowed;

      expect(verdict('/docs/secret')).toBe(false);
      expect(verdict('/docs/public/page')).toBe(true);
      expect(verdict('/papers/a.pdf')).toBe(false);
      expect(verdict('/papers/a.pdf?download=1')).toBe(true);
      expect(verdict('/tie')).toBe(true);
      expect(verdict('/caf%C3%A9/menu')).toBe(false);
      expect(verdict('/robots.txt')).toBe(true);
      expect(verdict('/other')).toBe(true);
    });
  });

  describe('address classification', () => {
    it('tells public addresses from the others, IPv4 inside IPv6 included', () => {
      for (const address of ['8.8.8.8', '93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4007:80e::200e']) {
        expect(isPublicAddress(address), address).toBe(true);
      }
      const expected: Record<string, string> = {
        '127.0.0.1': 'loopback',
        '10.20.30.40': 'private',
        '172.31.255.255': 'private',
        '192.168.1.1': 'private',
        '169.254.169.254': 'link-local (cloud metadata)',
        '100.100.100.100': 'shared (carrier-grade NAT)',
        '0.0.0.0': 'unspecified ("this network")',
        '224.0.0.251': 'multicast',
        '255.255.255.255': 'reserved or broadcast',
        '198.18.0.1': 'benchmarking',
        '::1': 'loopback',
        '::': 'unspecified',
        'fe80::1%en0': 'link-local',
        'fd12:3456::1': 'unique local (private)',
        'ff02::1': 'multicast',
        '::ffff:10.0.0.1': 'private, as 10.0.0.1 inside an IPv6 address',
        '::ffff:a9fe:a9fe': 'link-local (cloud metadata), as 169.254.169.254 inside an IPv6 address',
        '64:ff9b::7f00:1': 'loopback, as 127.0.0.1 inside an IPv6 address',
        '2002:c0a8:0101::1': 'private, as 192.168.1.1 inside an IPv6 address',
        '::127.0.0.1': 'loopback, as 127.0.0.1 inside an IPv6 address',
        '2001:db8::1': 'documentation',
      };
      for (const [address, kind] of Object.entries(expected)) {
        expect(nonPublicKind(address), address).toBe(kind);
      }
      expect(isPublicAddress('not-an-ip')).toBe(false);
    });
  });
});
