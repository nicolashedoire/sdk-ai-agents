import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pdfText, UNPDF_MISSING } from '../tools/web/pdf-text.js';
import { WebRequestRefusedError, WebTimeoutError } from '../tools/web/web-errors.js';
import type { WebFetchOutput } from '../tools/web/web-fetch.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import { flateBombPdf, tinyPdf } from './support/tiny-pdf.js';
import { reply, WebServer } from './support/web-server.js';

const PAPER = tinyPdf(['Fragments make layout immutable.', 'Results are reused across frames.'], {
  title: 'A tiny paper',
  creationDate: 'D:20240105120000Z',
});

// PDFs are read with unpdf (an optional peer dependency, a dev dependency here), from a real
// PDF served by a local server.
describe('web_fetch on a PDF', () => {
  let server: WebServer;

  beforeEach(async () => {
    server = new WebServer();
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  async function fetchPdf(url: string, options: WebToolsOptions = {}): Promise<WebFetchOutput> {
    const [tool] = webTools({
      include: ['web_fetch'],
      hostIntervalMs: 0,
      allowPrivateNetwork: [server.host],
      ...options,
    });
    if (!tool) throw new Error('no web_fetch tool');
    return (await tool.handler(tool.schema.parse({ url }))) as WebFetchOutput;
  }

  it('reads its text, title and date', async () => {
    server.on('/paper.pdf', reply(PAPER, { type: 'application/pdf' }));

    expect(await fetchPdf(`${server.url}/paper.pdf`)).toEqual({
      url: `${server.url}/paper.pdf`,
      finalUrl: `${server.url}/paper.pdf`,
      title: 'A tiny paper',
      date: '2024-01-05',
      contentType: 'application/pdf',
      content: 'Fragments make layout immutable.\n\nResults are reused across frames.',
      truncated: false,
      untrusted: true,
    });
  });

  it('reads at most maxPdfPages pages, and says the rest was left out', async () => {
    server.on('/paper.pdf', reply(PAPER, { type: 'application/pdf' }));

    expect(await fetchPdf(`${server.url}/paper.pdf`, { maxPdfPages: 1 })).toMatchObject({
      content: 'Fragments make layout immutable.',
      truncated: true,
    });
  });

  it('recognises a PDF served as application/octet-stream', async () => {
    server.on('/download', reply(PAPER, { type: 'application/octet-stream' }));

    expect(await fetchPdf(`${server.url}/download`)).toMatchObject({
      contentType: 'application/pdf',
      title: 'A tiny paper',
    });
  });

  it('refuses a PDF larger than maxPdfBytes by its Content-Length, before reading its body', async () => {
    let bodyStarted = false;
    server.on('/big.pdf', (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/pdf', 'content-length': '50000000' });
      response.flushHeaders();
      // The body would come a second later: a client that waits for it has not refused early.
      setTimeout(() => {
        if (response.destroyed) return;
        bodyStarted = true;
        response.end(Buffer.alloc(1_000));
      }, 1_000);
    });
    const started = Date.now();

    await expect(fetchPdf(`${server.url}/big.pdf`, { maxPdfBytes: 100 })).rejects.toThrow(
      `${server.url}/big.pdf is a PDF larger than 100 bytes (maxPdfBytes): refused`
    );
    expect(Date.now() - started).toBeLessThan(500);
    expect(bodyStarted).toBe(false);
  });

  it('stops reading a PDF streamed past maxPdfBytes (no Content-Length), and refuses it', async () => {
    let written = 0;
    server.on('/endless.pdf', (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      response.write('%PDF-1.4\n');
      // Never ends: only a client that stops reading gets an answer.
      const timer = setInterval(() => {
        if (response.destroyed) {
          clearInterval(timer);
          return;
        }
        written += 16_384;
        response.write(Buffer.alloc(16_384, 0x20));
      }, 1);
    });

    await expect(fetchPdf(`${server.url}/endless.pdf`, { maxPdfBytes: 50_000 })).rejects.toThrow(
      'is a PDF larger than 50000 bytes'
    );
    expect(written).toBeLessThan(2_000_000);
  });

  it('refuses application/octet-stream that is not a PDF', async () => {
    server.on('/blob', reply(Buffer.from('binary junk'), { type: 'application/octet-stream' }));

    await expect(fetchPdf(`${server.url}/blob`)).rejects.toThrow(
      'is application/octet-stream and not a PDF'
    );
  });

  describe('a Flate bomb: a small PDF that inflates to hundreds of MB', () => {
    let bomb: Buffer;
    beforeAll(async () => {
      bomb = await flateBombPdf(400);
    }, 30_000);

    it('is read in a worker stopped past its memory limit, the process never blocked', async () => {
      let ticks = 0;
      const ticker = setInterval(() => ticks++, 10);
      const started = Date.now();
      let error: unknown;
      try {
        await pdfText(bomb, { maxPages: 30, maxMemoryMb: 64 });
      } catch (caught) {
        error = caught;
      }
      clearInterval(ticker);
      const elapsed = Date.now() - started;

      expect(error).toBeInstanceOf(WebRequestRefusedError);
      expect((error as Error).message).toBe('The PDF needs more than 64 MB of memory to read: refused');
      expect(elapsed).toBeLessThan(10_000);
      // The main thread kept running while the worker decoded: timers fired all along.
      expect(ticks).toBeGreaterThan(elapsed / 10 / 3);
    }, 20_000);

    it('is stopped at its time limit', async () => {
      const started = Date.now();

      await expect(pdfText(bomb, { maxPages: 30, timeoutMs: 150 })).rejects.toThrow(
        new WebTimeoutError('Reading the PDF took more than 150 ms')
      );
      expect(Date.now() - started).toBeLessThan(1_500);
    });

    it('is stopped when the call is cancelled', async () => {
      const cancel = new AbortController();
      setTimeout(() => cancel.abort(new Error('caller gave up')), 100);

      await expect(pdfText(bomb, { maxPages: 30, signal: cancel.signal })).rejects.toThrow('caller gave up');
    });
  });

  it('says how to install unpdf when it is missing', async () => {
    await expect(pdfText(PAPER, { maxPages: 1, module: 'unpdf-not-installed' })).rejects.toThrow(
      UNPDF_MISSING
    );
  });
});
