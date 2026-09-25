import { stripInvisible } from './html-entities.js';
import { oneLine } from './results.js';

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

/** What is used of `unpdf`: its pdf.js document proxy. */
interface UnpdfModule {
  getDocumentProxy(data: Uint8Array): Promise<PdfDocument>;
  getMeta?(document: PdfDocument): Promise<{ info?: Record<string, unknown> }>;
}

interface PdfDocument {
  numPages: number;
  getPage(number: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str?: unknown; hasEOL?: unknown }> }>;
    cleanup?(): unknown;
  }>;
  destroy?(): Promise<void>;
}

/** Thrown when `unpdf`, an optional peer dependency, is not installed. */
export const UNPDF_MISSING =
  'Reading PDFs needs the optional package "unpdf" (Node.js 22 or later): npm install unpdf';

/**
 * Extracts the text of a PDF with `unpdf` (pdf.js), loaded only when a PDF is read: the SDK
 * does not depend on it. At most `maxPages` pages are read.
 */
export async function pdfText(
  bytes: Uint8Array,
  options: { maxPages: number; module?: string }
): Promise<PdfText> {
  const unpdf = await loadUnpdf(options.module ?? 'unpdf');
  // A copy: pdf.js may take over (detach) the buffer it is given.
  const document = await unpdf.getDocumentProxy(new Uint8Array(bytes));
  try {
    const pagesRead = Math.min(document.numPages, Math.max(1, options.maxPages));
    const pages: string[] = [];
    for (let number = 1; number <= pagesRead; number++) {
      const page = await document.getPage(number);
      const { items } = await page.getTextContent();
      pages.push(
        items
          .map(
            (item) => `${typeof item.str === 'string' ? item.str : ''}${item.hasEOL ? '\n' : ''}`
          )
          .join('')
      );
      page.cleanup?.();
    }
    const info = (await unpdf.getMeta?.(document))?.info ?? {};
    const title = typeof info.Title === 'string' ? oneLine(stripInvisible(info.Title), 300) : '';
    const date = pdfDate(info.CreationDate) ?? pdfDate(info.ModDate);
    return {
      ...(title ? { title } : {}),
      ...(date ? { date } : {}),
      content: pages
        .map((text) =>
          stripInvisible(text)
            .replace(/[ \t]+\n/g, '\n')
            .trim()
        )
        .filter(Boolean)
        .join('\n\n'),
      pages: document.numPages,
      pagesRead,
    };
  } finally {
    await document.destroy?.();
  }
}

async function loadUnpdf(specifier: string): Promise<UnpdfModule> {
  try {
    // A variable specifier: bundlers and TypeScript leave the optional package alone.
    return (await import(specifier)) as UnpdfModule;
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
    const message = error instanceof Error ? error.message : '';
    // Node says ERR_MODULE_NOT_FOUND, CommonJS bundles MODULE_NOT_FOUND, Vite "Failed to load url".
    if (
      code === 'ERR_MODULE_NOT_FOUND' ||
      code === 'MODULE_NOT_FOUND' ||
      code === 'ERR_LOAD_URL' ||
      /Cannot find (?:package|module)|Failed to load url/i.test(message)
    ) {
      throw new Error(UNPDF_MISSING, { cause: error });
    }
    throw error;
  }
}

/** A PDF date (`D:20240105120000Z`) as `YYYY-MM-DD`. */
function pdfDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?/.exec(value.trim());
  if (!match) return undefined;
  return [match[1], match[2], match[3]].filter(Boolean).join('-');
}
