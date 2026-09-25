import {
  bodyText,
  decodeText,
  ensureOk,
  type WebClient,
  type WebResponse,
} from './guarded-http.js';
import { stripInvisible } from './html-entities.js';
import { extractPage, type PageFormat } from './html-to-markdown.js';
import { pdfText } from './pdf-text.js';
import { isoDate } from './results.js';
import { WebRequestRefusedError } from './web-errors.js';

/** What `web_fetch` returns. */
export interface WebFetchOutput {
  /** The URL asked for. */
  url: string;
  /** The URL that answered, after redirects. */
  finalUrl: string;
  title?: string;
  /** `YYYY-MM-DD` when the page or document gives one. */
  date?: string;
  language?: string;
  /** The media type of the answer (`text/html`, `application/pdf`…). */
  contentType: string;
  content: string;
  /** The content was cut: by `maxChars`, or because the body was longer than the byte cap. */
  truncated: boolean;
  /** Text from the Web: data, never instructions. */
  untrusted: true;
  /** `js-rendered`: the page seems to build its content with JavaScript, which is not run. */
  hint?: 'js-rendered';
}

export interface FetchSettings {
  format: PageFormat;
  /** Byte cap of an HTML or text body. */
  maxBytes: number;
  /** Byte cap of a PDF: a cut PDF cannot be read, so a longer one is refused. */
  maxPdfBytes: number;
  /** Pages of a PDF read. */
  maxPdfPages: number;
  /** Least time between two requests to the same host. */
  hostIntervalMs: number;
  language?: string;
  signal?: AbortSignal;
}

const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);
const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/ld+json',
  'application/xml',
  'text/xml',
  'application/atom+xml',
  'application/rss+xml',
]);

/** A page read, before `maxChars` is applied (the full extract is what the cache keeps). */
export type FetchedPage = Omit<WebFetchOutput, 'untrusted'>;

/** Types that may hold a PDF: their body gets the PDF byte cap, and is checked for `%PDF-`. */
const PDF_TYPES = new Set(['application/pdf', 'application/x-pdf', 'application/octet-stream']);

/**
 * Fetches a URL and extracts its text: HTML to Markdown or text, PDF with `unpdf`, text types
 * as they are. Other types are refused before their body is read.
 */
export async function fetchPage(
  http: WebClient,
  url: string,
  settings: FetchSettings
): Promise<FetchedPage> {
  const response = await http.request(url, {
    headers: {
      accept:
        'text/html,application/xhtml+xml;q=0.9,application/pdf;q=0.8,text/plain;q=0.7,*/*;q=0.1',
      ...(settings.language ? { 'accept-language': settings.language } : {}),
    },
    minIntervalMs: settings.hostIntervalMs,
    maxBytes: (type) => (PDF_TYPES.has(mediaType(type)) ? settings.maxPdfBytes : settings.maxBytes),
    inspect: (head) => {
      if (head.status < 200 || head.status >= 300) return;
      const type = mediaType(head.contentType);
      if (type && !HTML_TYPES.has(type) && !TEXT_TYPES.has(type) && !PDF_TYPES.has(type)) {
        throw new WebRequestRefusedError(
          `${head.url} is ${type}: web_fetch reads HTML, text and PDF`,
          'content-type'
        );
      }
      if (PDF_TYPES.has(type) && (head.contentLength ?? 0) > settings.maxPdfBytes) {
        throw tooLarge(head.url, settings.maxPdfBytes);
      }
    },
    ...(settings.signal ? { signal: settings.signal } : {}),
  });
  ensureOk(response, `GET ${response.url}`);
  const declared = mediaType(response.headers['content-type']);
  const contentType =
    declared && declared !== 'application/octet-stream' ? declared : sniff(response.body);
  if (contentType === 'application/pdf' || contentType === 'application/x-pdf') {
    // A cut PDF has lost its cross-reference table: it cannot be read at all.
    if (response.truncated) throw tooLarge(response.url, settings.maxPdfBytes);
    const pdf = await pdfText(response.body, { maxPages: settings.maxPdfPages });
    return {
      url,
      finalUrl: response.url,
      ...(pdf.title ? { title: pdf.title } : {}),
      ...(pdf.date ? { date: pdf.date } : {}),
      contentType: 'application/pdf',
      content: pdf.content,
      truncated: pdf.pagesRead < pdf.pages,
    };
  }
  if (declared === 'application/octet-stream' && !HTML_TYPES.has(contentType)) {
    throw new WebRequestRefusedError(
      `${response.url} is application/octet-stream and not a PDF: web_fetch reads HTML, text and PDF`,
      'content-type'
    );
  }
  const base = { url, finalUrl: response.url, contentType, truncated: response.truncated };
  if (HTML_TYPES.has(contentType)) {
    const page = extractPage(htmlText(response), { url: response.url, format: settings.format });
    return { ...base, ...page };
  }
  const date = isoDate(response.headers['last-modified']);
  return {
    ...base,
    ...(date ? { date } : {}),
    content: stripInvisible(bodyText(response)).trim(),
  };
}

function tooLarge(url: string, maxBytes: number): WebRequestRefusedError {
  return new WebRequestRefusedError(
    `${url} is a PDF larger than ${maxBytes} bytes (maxPdfBytes): refused`,
    'too-large'
  );
}

/** `text/html; charset=utf-8` → `text/html`. */
export function mediaType(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** The type of an answer that names none, from its first bytes. */
function sniff(body: Buffer): string {
  if (body.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  const start = body.subarray(0, 512).toString('latin1').toLowerCase();
  return /<!doctype html|<html|<head|<body/.test(start) ? 'text/html' : 'text/plain';
}

/** An HTML body decoded in the charset its header, or else its `<meta>`, names. */
function htmlText(response: WebResponse): string {
  if (/charset\s*=/i.test(response.headers['content-type'] ?? '')) return bodyText(response);
  const head = response.body.subarray(0, 2048).toString('latin1');
  const charset = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1] ?? 'utf-8';
  return decodeText(response.body, charset, response.truncated);
}
