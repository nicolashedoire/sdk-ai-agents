import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { stripInvisible } from './html-entities.js';
import { prescanPdf } from './pdf-prescan.js';
import { oneLine } from './results.js';
import { WebConfigurationError, WebRequestRefusedError, WebTimeoutError } from './web-errors.js';

/** The text of a PDF, page by page up to a limit. */
export interface PdfText {
  title?: string;
  /** `YYYY-MM-DD`, from the document's creation date. */
  date?: string;
  content: string;
  /** Pages in the document. */
  pages: number;
  /** Pages read (at most the limit). */
  pagesRead: number;
}

/** Thrown when `unpdf`, an optional peer dependency, is not installed. */
export const UNPDF_MISSING =
  'Reading PDFs needs the optional package "unpdf" (Node.js 22 or later): npm install unpdf';

/**
 * How much a PDF's streams may inflate to, in all, by default: measured in the worker before
 * pdf.js reads the PDF, whatever the rest of the process does.
 */
export const PDF_DECODED_MB = 256;
/**
 * How much the process may grow while a PDF is read, by default: a second line behind the
 * measure of the streams, watched from the main thread.
 */
export const PDF_MEMORY_MB = 1_024;
/** How long reading one PDF may take, by default (less when the call has less time left). */
export const PDF_TIMEOUT_MS = 20_000;

export interface PdfTextOptions {
  maxPages: number;
  /** Most the PDF's streams may inflate to, in all, in MB. Default 256. */
  maxDecodedMb?: number;
  /** Most the process may grow, in MB, while the PDF is read. Default 1 024. */
  maxMemoryMb?: number;
  /** Most time the reading may take once it starts, in ms. Default 20 000. */
  timeoutMs?: number;
  /** When the call must be over (`Date.now()` time): bounds the wait for the reader too. */
  deadline?: number;
  /** Stops the reading, or the wait for it (the call was cancelled or ran out of time). */
  signal?: AbortSignal;
  /** The module to load; `unpdf` unless a test names another. */
  module?: string;
}

/** What the worker sends back. */
type WorkerAnswer =
  | {
      ok: true;
      pages: string[];
      numPages: number;
      pagesRead: number;
      title?: string;
      creationDate?: string;
      modDate?: string;
    }
  | { ok: false; message: string; refused?: boolean };

/**
 * Runs in the worker: loads `unpdf` (pdf.js) and reads the text of the first pages. Plain
 * JavaScript, evaluated as CommonJS, so it needs no file of its own next to the build.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const zlib = require('node:zlib');
// Bundlers that keep function names wrap them in __name(…): harmless here.
var __name = (target) => target;
const prescan = ${prescanPdf.toString()};
(async () => {
  // Measured before pdf.js reads anything: a bomb is refused here, event loops or not.
  const verdict = prescan(new Uint8Array(workerData.bytes), zlib, workerData.maxDecodedBytes);
  if (!verdict.ok) {
    parentPort.postMessage({ ok: false, refused: true, message: verdict.reason });
    return;
  }
  const loaded = await import(workerData.moduleUrl);
  const unpdf = typeof loaded.getDocumentProxy === 'function' ? loaded : loaded.default;
  const document = await unpdf.getDocumentProxy(new Uint8Array(workerData.bytes));
  const pagesRead = Math.min(document.numPages, Math.max(1, workerData.maxPages));
  const pages = [];
  for (let number = 1; number <= pagesRead; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => (typeof item.str === 'string' ? item.str : '') + (item.hasEOL ? '\\n' : '')).join(''));
    if (typeof page.cleanup === 'function') page.cleanup();
  }
  let info = {};
  if (typeof unpdf.getMeta === 'function') info = ((await unpdf.getMeta(document)) || {}).info || {};
  const text = (value) => (typeof value === 'string' ? value : undefined);
  parentPort.postMessage({ ok: true, pages, numPages: document.numPages, pagesRead, title: text(info.Title), creationDate: text(info.CreationDate), modDate: text(info.ModDate) });
})().catch((error) => parentPort.postMessage({ ok: false, message: String((error && error.message) || error) }));
`;

/**
 * Extracts the text of a PDF with `unpdf` (pdf.js), loaded only when a PDF is read: the SDK
 * does not depend on it. At most `maxPages` pages are read.
 *
 * The PDF is read in a worker thread, one PDF at a time in the process, so that a hostile PDF
 * cannot block the process and what it costs is its own:
 * - before pdf.js reads it, the worker inflates its streams (every filter chain, Flate and the
 *   other decoders that expand) within `maxDecodedMb` in all, and refuses it past that;
 * - the worker is stopped when the process grows by more than `maxMemoryMb`, when `timeoutMs`
 *   has passed, or when `signal` aborts. Waiting for the reader counts against `deadline` and
 *   `signal`.
 */
export async function pdfText(bytes: Uint8Array, options: PdfTextOptions): Promise<PdfText> {
  const moduleUrl = resolveModule(options.module ?? 'unpdf');
  const release = await PDF_READERS.acquire(options.signal, options.deadline);
  let answer: WorkerAnswer;
  try {
    const left =
      options.deadline === undefined ? Number.POSITIVE_INFINITY : options.deadline - Date.now();
    const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? PDF_TIMEOUT_MS, left));
    answer = await runWorker(moduleUrl, bytes, { ...options, timeoutMs });
  } finally {
    release();
  }
  if (!answer.ok && answer.refused) {
    throw new WebRequestRefusedError(`The PDF is refused: ${answer.message}`, 'too-large');
  }
  if (!answer.ok) {
    if (/Cannot find (?:package|module)|ERR_MODULE_NOT_FOUND/i.test(answer.message)) {
      throw new WebConfigurationError(UNPDF_MISSING);
    }
    throw new Error(`The PDF could not be read: ${answer.message.slice(0, 200)}`);
  }
  const title = answer.title ? oneLine(stripInvisible(answer.title), 300) : '';
  const date = pdfDate(answer.creationDate) ?? pdfDate(answer.modDate);
  return {
    ...(title ? { title } : {}),
    ...(date ? { date } : {}),
    content: answer.pages
      .map((text) =>
        stripInvisible(text)
          .replace(/[ \t]+\n/g, '\n')
          .trim()
      )
      .filter(Boolean)
      .join('\n\n'),
    pages: answer.numPages,
    pagesRead: answer.pagesRead,
  };
}

/** The file URL of the module, resolved from here as `import` would; a clear error if absent. */
function resolveModule(specifier: string): string {
  try {
    const resolve = (import.meta as { resolve?: (specifier: string) => string }).resolve;
    if (typeof resolve === 'function') return resolve(specifier);
  } catch {
    // Not installed: try the CommonJS resolution, then give up with a clear message.
  }
  try {
    return pathToFileURL(createRequire(import.meta.url).resolve(specifier)).href;
  } catch {
    throw new WebConfigurationError(UNPDF_MISSING);
  }
}

function runWorker(
  moduleUrl: string,
  bytes: Uint8Array,
  options: PdfTextOptions
): Promise<WorkerAnswer> {
  const maxMemoryMb = options.maxMemoryMb ?? PDF_MEMORY_MB;
  const timeoutMs = options.timeoutMs ?? PDF_TIMEOUT_MS;
  // A copy the worker takes over: the response buffer may be shared.
  const copy = new Uint8Array(bytes).buffer;
  return new Promise<WorkerAnswer>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortReason(options.signal));
      return;
    }
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        moduleUrl,
        bytes: copy,
        maxPages: options.maxPages,
        maxDecodedBytes: (options.maxDecodedMb ?? PDF_DECODED_MB) * 1_048_576,
      },
      transferList: [copy],
      resourceLimits: {
        maxOldGenerationSizeMb: maxMemoryMb,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    const startRss = process.memoryUsage.rss();
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      clearTimeout(deadline);
      options.signal?.removeEventListener('abort', onAbort);
      void worker.terminate();
      outcome();
    };
    const tooBig = () =>
      new WebRequestRefusedError(
        `The PDF needs more than ${maxMemoryMb} MB of memory to read: refused`,
        'too-large'
      );
    // Decompressed streams live outside the JavaScript heap: the process's growth is watched.
    const watchdog = setInterval(() => {
      if (process.memoryUsage.rss() - startRss > maxMemoryMb * 1_048_576) {
        finish(() => reject(tooBig()));
      }
    }, 20);
    const deadline = setTimeout(
      () =>
        finish(() => reject(new WebTimeoutError(`Reading the PDF took more than ${timeoutMs} ms`))),
      timeoutMs
    );
    const onAbort = () => finish(() => reject(abortReason(options.signal)));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    worker.on('message', (answer: WorkerAnswer) => finish(() => resolve(answer)));
    worker.on('error', (error: Error & { code?: string }) =>
      finish(() => reject(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? tooBig() : error))
    );
    worker.on('exit', (code) =>
      finish(() => reject(new Error(`The PDF reader stopped unexpectedly (exit code ${code})`)))
    );
  });
}

/**
 * Turns to read PDFs, one at a time in the process: the growth the watchdog sees is then the
 * reader's own, and PDFs read together never add up. A wait gives up with the caller's
 * signal, or at its deadline.
 */
export class ReaderSlots {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly size: number) {}

  acquire(signal?: AbortSignal, deadline?: number): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (this.active < this.size) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        cleanup();
        this.active++;
        resolve(this.releaser());
      };
      const leave = (error: Error) => {
        const index = this.queue.indexOf(grant);
        if (index !== -1) this.queue.splice(index, 1);
        cleanup();
        reject(error);
      };
      const onAbort = () => leave(abortReason(signal));
      const timer =
        deadline === undefined
          ? undefined
          : setTimeout(
              () => leave(new WebTimeoutError('Waiting to read the PDF took until the deadline')),
              Math.max(0, deadline - Date.now())
            );
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(grant);
    });
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.queue.shift()?.();
    };
  }
}

/** The PDF readers of the process: one at a time. */
const PDF_READERS = new ReaderSlots(1);

function abortReason(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new Error('The request was cancelled');
}

/** A PDF date (`D:20240105120000Z`) as `YYYY-MM-DD`. */
function pdfDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?/.exec(value.trim());
  if (!match) return undefined;
  return [match[1], match[2], match[3]].filter(Boolean).join('-');
}
