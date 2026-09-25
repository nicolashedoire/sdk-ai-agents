import { bodyText, ensureOk, type WebClient } from '../guarded-http.js';
import { decodeEntities, stripInvisible } from '../html-entities.js';
import { isoDate, oneLine } from '../results.js';
import { trimBase } from '../search-provider.js';
import { WebHttpError } from '../web-errors.js';

export interface ArxivOptions {
  /** Default `https://export.arxiv.org`. */
  baseUrl?: string;
  /** Least time between two requests. Default 3 000 ms, as the arXiv API asks. */
  minIntervalMs?: number;
}

/** A paper found on arXiv. */
export interface ArxivResult {
  /** `arxiv:2401.11817`, without the version. */
  id: string;
  title: string;
  /** The abstract page, `https://arxiv.org/abs/<id>`. */
  url: string;
  pdfUrl?: string;
  /** First submission, `YYYY-MM-DD`. */
  date?: string;
  /** Last version, `YYYY-MM-DD`. */
  updated?: string;
  authors: string[];
  /** The start of the abstract, on one line. */
  excerpt: string;
  category?: string;
  source: 'arxiv';
}

/** Words too common to narrow an arXiv search, and the operators of its syntax. */
const STOP_WORDS = new Set(
  'a an and andnot are as at be by for from how in into is it not of on or that the this to with without what which why'.split(
    ' '
  )
);
/** arXiv's own query syntax: the query is passed as it is. */
const ARXIV_SYNTAX = /\b(?:ti|au|abs|co|jr|cat|rn|id|all):/;

/**
 * Searches arXiv's API (Atom): title, authors, dates, abstract and links of each paper,
 * best matches first. Plain words are searched as a phrase and one by one (stop words
 * dropped), so a paper matching the phrase or more of the words ranks higher; a query written
 * in arXiv's syntax (`ti:`, `au:`, `cat:`…) is sent as it is.
 */
export async function searchArxiv(
  web: WebClient,
  options: ArxivOptions,
  request: { query: string; maxResults: number; signal?: AbortSignal }
): Promise<ArxivResult[]> {
  const url = new URL(`${trimBase(options.baseUrl ?? 'https://export.arxiv.org')}/api/query`);
  url.searchParams.set('search_query', arxivQuery(request.query));
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(request.maxResults));
  url.searchParams.set('sortBy', 'relevance');
  url.searchParams.set('sortOrder', 'descending');
  const response = await web.request(url.toString(), {
    headers: { accept: 'application/atom+xml' },
    minIntervalMs: options.minIntervalMs ?? 3_000,
    ...(request.signal ? { signal: request.signal } : {}),
  });
  if ([403, 406, 429, 503].includes(response.status)) {
    // arXiv's API refuses clients that go faster than one request every 3 s, sometimes with a
    // 406 from its CDN.
    throw new WebHttpError(
      `arXiv refused the request (HTTP ${response.status}): it allows one request every 3 s; try again later`,
      response.status
    );
  }
  ensureOk(response, 'arXiv');
  return parseArxivFeed(bodyText(response));
}

/**
 * The `search_query` of a query: its words as a phrase, or any of its significant words
 * (`all:"a b c" OR all:a OR all:c`). Requiring every word finds nothing too often.
 */
export function arxivQuery(query: string): string {
  if (ARXIV_SYNTAX.test(query)) return query;
  const words = query.match(/[\p{L}\p{N}][\p{L}\p{N}.+-]*/gu) ?? [];
  const significant = [
    ...new Set(words.filter((word) => !STOP_WORDS.has(word.toLowerCase()))),
  ].slice(0, 6);
  if (significant.length === 0) return `all:"${words.join(' ')}"`;
  const terms = significant.map((word) => `all:${word}`);
  const phrase = words.slice(0, 12).join(' ');
  return words.length > 1 ? [`all:"${phrase}"`, ...terms].join(' OR ') : (terms[0] as string);
}

/** Reads the entries of an arXiv Atom feed; an error feed throws its message. */
export function parseArxivFeed(xml: string): ArxivResult[] {
  const results: ArxivResult[] = [];
  for (const [, entry = ''] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const idUrl = field(entry, 'id');
    if (/\/api\/errors/.test(idUrl)) {
      throw new Error(
        `arXiv refused the query: ${field(entry, 'summary') || field(entry, 'title')}`
      );
    }
    const arxivId = /arxiv\.org\/abs\/(.+?)(?:v\d+)?$/.exec(idUrl)?.[1];
    if (!arxivId) continue;
    const authors = [...entry.matchAll(/<author\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map(
      (match) => clean(match[1] ?? '')
    );
    const pdfUrl =
      /<link\b[^>]*\btitle="pdf"[^>]*\bhref="([^"]+)"/.exec(entry)?.[1] ??
      /<link\b[^>]*\bhref="([^"]+)"[^>]*\btitle="pdf"/.exec(entry)?.[1];
    const category = /<arxiv:primary_category\b[^>]*\bterm="([^"]+)"/.exec(entry)?.[1];
    const date = isoDate(field(entry, 'published'));
    const updated = isoDate(field(entry, 'updated'));
    results.push({
      id: `arxiv:${arxivId}`,
      title: clean(field(entry, 'title')),
      url: `https://arxiv.org/abs/${arxivId}`,
      ...(pdfUrl ? { pdfUrl: decodeEntities(pdfUrl).replace(/^http:/, 'https:') } : {}),
      ...(date ? { date } : {}),
      ...(updated ? { updated } : {}),
      authors,
      excerpt: oneLine(clean(field(entry, 'summary')), 600),
      ...(category ? { category } : {}),
      source: 'arxiv',
    });
  }
  return results;
}

function field(entry: string, name: string): string {
  return new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(entry)?.[1] ?? '';
}

function clean(text: string): string {
  const unwrapped = text.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1');
  return oneLine(stripInvisible(decodeEntities(unwrapped)), 1_000);
}
