import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pdfText, UNPDF_MISSING } from '../tools/web/pdf-text.js';
import type { WebFetchOutput } from '../tools/web/web-fetch.js';
import { type WebToolsOptions, webTools } from '../tools/web/web-tools.js';
import { tinyPdf } from './support/tiny-pdf.js';
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
    const [tool] = webTools({ include: ['web_fetch'], hostIntervalMs: 0, ...options });
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

  it('refuses a PDF larger than maxPdfBytes before downloading it', async () => {
    server.on('/big.pdf', reply(PAPER, { type: 'application/pdf' }));

    await expect(fetchPdf(`${server.url}/big.pdf`, { maxPdfBytes: 100 })).rejects.toThrow(
      `${server.url}/big.pdf is a PDF larger than 100 bytes (maxPdfBytes): refused`
    );
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

  it('says how to install unpdf when it is missing', async () => {
    await expect(pdfText(PAPER, { maxPages: 1, module: 'unpdf-not-installed' })).rejects.toThrow(
      UNPDF_MISSING
    );
  });
});
