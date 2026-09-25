import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractPage } from '../tools/web/html-to-markdown.js';
import { WebTimeoutError } from '../tools/web/web-errors.js';
import type { WebFetchOutput } from '../tools/web/web-fetch.js';
import { webTools } from '../tools/web/web-tools.js';
import { reply, WebServer } from './support/web-server.js';

const extract = (html: string, format: 'markdown' | 'text' = 'text') =>
  extractPage(html, { url: 'https://x.example/', format });

/** Runs `work` and gives how long it blocked, in ms. */
function timed(work: () => unknown): number {
  const started = Date.now();
  work();
  return Date.now() - started;
}

// Hostile pages reach the extractor after the download: nothing can interrupt synchronous work,
// so its cost must be bounded by construction, and by a time budget.
describe('HTML extraction limits', () => {
  it('flags a JavaScript page without a quadratic scan (80,000 "<noscript" took 20 s)', () => {
    const page = `<html><body>${'<noscript'.repeat(80_000)}</body></html>`;
    expect(timed(() => extract(page))).toBeLessThan(1_000);
  });

  it('walks a deep tree without recursion per level (256 divs over 2 MB took 17 s)', () => {
    const page = `<html><body><main>${'<div>'.repeat(256)}${'<p>a'.repeat(500_000)}</main></body></html>`;
    expect(timed(() => extract(page))).toBeLessThan(2_000);
  });

  it('measures nested articles once, not once per level', () => {
    const page = `<html><body>${'<article>'.repeat(255)}${'word '.repeat(400_000)}</body></html>`;
    expect(timed(() => extract(page))).toBeLessThan(1_000);
  });

  it('stops at its time budget with a WebTimeoutError', () => {
    const page = `<html><body><main>${'<p>paragraph <b>bold</b> text</p>'.repeat(60_000)}</main></body></html>`;
    let error: unknown;
    try {
      extractPage(page, { url: 'https://x.example/', format: 'markdown', budgetMs: 1 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(WebTimeoutError);
    expect((error as Error).message).toBe('Extracting the page took too long: the page is too large or too complex');
  });

  it('leaves out the end of a page of more than 100,000 elements, and says so', () => {
    const page = `<html><body><main>${'<i>x</i> '.repeat(150_000)}</main></body></html>`;
    const extracted = extract(page);
    expect(extracted.truncated).toBe(true);
    expect(extracted.content.length).toBeLessThan(250_000);
  });
});

describe('HTML extraction keeps what a reader sees', () => {
  it('reads a quote inside an unquoted value as the tokenizer does (the page was lost)', () => {
    const page = '<body><div class=a"b>Before</div><p>The rest of the page is kept.</p></body>';
    expect(extract(page).content).toBe('Before\n\nThe rest of the page is kept.');
  });

  it("keeps a form's content, not its controls (a WebForms page came out empty)", () => {
    const page =
      '<body><form action="/Default.aspx" method="post"><input type="hidden" name="__VIEWSTATE" value="x"><div><h1>Annual report</h1><p>Revenue grew.</p></div><button>Go</button><select><option>One</option></select></form></body>';
    expect(extract(page, 'markdown').content).toBe('# Annual report\n\nRevenue grew.');
  });

  it('drops noframes, noembed and ruby fallback parentheses, which browsers never show', () => {
    const page =
      '<body><p>Kanji <ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby>.</p><noframes>HIDDEN-NOFRAMES</noframes><noembed>HIDDEN-NOEMBED</noembed></body>';
    expect(extract(page).content).toBe('Kanji 漢kan.');
  });

  it('keeps hidden="until-found" sections and the server-rendered copy inside <noscript>', () => {
    const page =
      '<body><div hidden="until-found">Found by search</div><div hidden>Gone</div><noscript><p>Server-rendered copy</p></noscript></body>';
    expect(extract(page).content).toBe('Found by search\n\nServer-rendered copy');
  });
});

describe('web_fetch on a hostile page', () => {
  let server: WebServer;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('answers quickly for a page that blocked the process for 33 s', async () => {
    server.on('/page', reply(`<html><body>${'<noscript'.repeat(100_000)}</body></html>`));
    const [tool] = webTools({
      include: ['web_fetch'],
      allowPrivateNetwork: [server.host],
      hostIntervalMs: 0,
      robots: false,
      cache: false,
    });
    if (!tool) throw new Error('no web_fetch');
    const started = Date.now();

    const page = (await tool.handler(tool.schema.parse({ url: `${server.url}/page` }))) as WebFetchOutput;

    expect(page.content).toBe('');
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
