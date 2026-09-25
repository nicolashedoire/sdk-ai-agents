import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pdfText, UNPDF_MISSING } from '../tools/web/pdf-text.js';
import { WebRequestRefusedError, WebTimeoutError } from '../tools/web/web-errors.js';
import type { WebFetchOutput } from '../tools/web/web-fetch.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import { flateBombPdf, realisticPdf, tinyPdf } from './support/tiny-pdf.js';
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

  describe('bombs: small PDFs that inflate to hundreds of MB or more', () => {
    let bomb: Buffer;
    let chained: Buffer;
    beforeAll(async () => {
      bomb = await flateBombPdf(400);
      // 1 GB compressed twice: [/FlateDecode /FlateDecode], a few kilobytes.
      chained = await flateBombPdf(1_024, { unit: '\0', times: 2 });
    }, 60_000);

    it('refuses a bomb before pdf.js reads it, by measuring its streams in the worker', async () => {
      await expect(pdfText(bomb, { maxPages: 30 })).rejects.toThrow(
        new WebRequestRefusedError('The PDF is refused: its streams inflate to more than 256 MB', 'too-large')
      );
    });

    it('refuses a chained-Flate bomb while the main thread is blocked: no event loop needed', async () => {
      expect(chained.length).toBeLessThan(20_000);
      const before = process.memoryUsage.rss();
      const reading = pdfText(chained, { maxPages: 30 }).catch((error: Error) => error);
      // The main thread does nothing else for 2 s: a watchdog on it could not run.
      const end = Date.now() + 2_000;
      while (Date.now() < end) {
        // busy
      }
      const grown = process.memoryUsage.rss() - before;
      const error = await reading;

      expect(error).toBeInstanceOf(WebRequestRefusedError);
      expect((error as Error).message).toBe('The PDF is refused: its streams inflate to more than 256 MB');
      expect(grown).toBeLessThan(600 * 1_048_576);
    }, 20_000);

    it('keeps the memory watchdog as a second line', async () => {
      let ticks = 0;
      const ticker = setInterval(() => ticks++, 10);
      const started = Date.now();
      const error = await pdfText(bomb, { maxPages: 30, maxDecodedMb: 4_096, maxMemoryMb: 64 }).catch(
        (caught: Error) => caught
      );
      clearInterval(ticker);
      const elapsed = Date.now() - started;

      expect(error).toBeInstanceOf(WebRequestRefusedError);
      expect((error as Error).message).toBe('The PDF needs more than 64 MB of memory to read: refused');
      expect(ticks).toBeGreaterThan(elapsed / 10 / 3);
    }, 20_000);

    it('is stopped at its time limit', async () => {
      await expect(pdfText(bomb, { maxPages: 30, maxDecodedMb: 4_096, timeoutMs: 150 })).rejects.toThrow(
        new WebTimeoutError('Reading the PDF took more than 150 ms')
      );
    });

    it('is stopped when the call is cancelled', async () => {
      const cancel = new AbortController();
      setTimeout(() => cancel.abort(new Error('caller gave up')), 100);

      await expect(pdfText(bomb, { maxPages: 30, maxDecodedMb: 4_096, signal: cancel.signal })).rejects.toThrow(
        'caller gave up'
      );
    });
  });

  describe('one reader at a time', () => {
    it('reads 8 ordinary PDFs at once, every one of them (they were all refused)', async () => {
      const pdf = realisticPdf();
      expect(pdf.length).toBeGreaterThan(1_500_000);

      const read = await Promise.all(Array.from({ length: 8 }, () => pdfText(pdf, { maxPages: 30 })));

      expect(read.map((result) => result.pagesRead)).toEqual([15, 15, 15, 15, 15, 15, 15, 15]);
      expect(read[0]?.content.startsWith('Page 1, line 1: the fragment tree is immutable.')).toBe(true);
    }, 30_000);

    it('does not blame a PDF for what the rest of the process allocates', async () => {
      const slow = await flateBombPdf(8, { unit: 'BT /F1 12 Tf 72 700 Td (word) Tj ET\n' });
      const elsewhere: Buffer[] = [];
      // 300 MB taken by the rest of the process while the PDF is read, 10 MB at a time.
      const allocating = setInterval(() => {
        if (elsewhere.length < 30) elsewhere.push(Buffer.alloc(10 * 1_048_576, 1));
      }, 5);

      const read = await pdfText(slow, { maxPages: 1 });
      clearInterval(allocating);

      expect(read.content.startsWith('word')).toBe(true);
      expect(elsewhere.length).toBe(30);
    }, 30_000);

    it('gives up waiting for its turn with the caller, or at the deadline', async () => {
      const slow = await flateBombPdf(8, { unit: 'BT /F1 12 Tf 72 700 Td (word) Tj ET\n' });
      const holding = pdfText(slow, { maxPages: 1 });
      let heldOver = false;
      void holding.then(() => {
        heldOver = true;
      });
      const giveUp = new AbortController();
      setTimeout(() => giveUp.abort(new Error('caller gave up waiting')), 50);
      const started = Date.now();

      await expect(pdfText(PAPER, { maxPages: 1, signal: giveUp.signal })).rejects.toThrow('caller gave up waiting');
      await expect(pdfText(PAPER, { maxPages: 1, deadline: Date.now() + 100 })).rejects.toThrow(
        new WebTimeoutError('Waiting to read the PDF took until the deadline')
      );
      expect(Date.now() - started).toBeLessThan(400);
      expect(heldOver).toBe(false);
      // The next one waits its turn, then reads.
      await expect(pdfText(PAPER, { maxPages: 1 })).resolves.toMatchObject({ title: 'A tiny paper' });
      expect(heldOver).toBe(true);
    }, 20_000);
  });

  it('says how to install unpdf when it is missing', async () => {
    await expect(pdfText(PAPER, { maxPages: 1, module: 'unpdf-not-installed' })).rejects.toThrow(
      UNPDF_MISSING
    );
  });
});
