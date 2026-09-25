import { ensureOk, jsonBody, type WebClient } from '../guarded-http.js';
import { htmlToLine } from '../html-entities.js';
import { isRecord, listOf, text } from '../json-fields.js';
import { isoDate, oneLine } from '../results.js';
import { trimBase } from '../search-provider.js';

export interface WikipediaOptions {
  /**
   * The wiki's origin; `{language}` is replaced by the search language. Default
   * `https://{language}.wikipedia.org`.
   */
  baseUrl?: string;
  /** Language of searches that name none. Default `en`. */
  language?: string;
  /** Least time between two requests. Default 0. */
  minIntervalMs?: number;
}

/** An article found on Wikipedia. */
export interface WikipediaResult {
  /** `wikipedia:<language>:<page id>`. */
  id: string;
  title: string;
  url: string;
  /** Last edit, `YYYY-MM-DD`. */
  date?: string;
  excerpt: string;
  source: 'wikipedia';
}

/** A Wikipedia subdomain: `en`, `fr`, `simple`, `zh-min-nan`… */
export const WIKI_LANGUAGE = /^[a-z][a-z-]{1,15}$/;

/**
 * Searches Wikipedia with the MediaWiki action API (`list=search`): title, link, the matching
 * snippet and the date of the last edit of each article.
 */
export async function searchWikipedia(
  web: WebClient,
  options: WikipediaOptions,
  request: { query: string; maxResults: number; language?: string; signal?: AbortSignal }
): Promise<{ language: string; results: WikipediaResult[] }> {
  const language = (request.language ?? options.language ?? 'en').toLowerCase();
  if (!WIKI_LANGUAGE.test(language)) {
    throw new Error(`"${language}" is not a Wikipedia language code (en, fr, de…)`);
  }
  const origin = trimBase(
    (options.baseUrl ?? 'https://{language}.wikipedia.org').replace('{language}', language)
  );
  const url = new URL(`${origin}/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', request.query);
  url.searchParams.set('srlimit', String(request.maxResults));
  url.searchParams.set('srprop', 'snippet|timestamp');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('utf8', '1');
  const response = await web.request(url.toString(), {
    headers: { accept: 'application/json' },
    minIntervalMs: options.minIntervalMs ?? 0,
    ...(request.signal ? { signal: request.signal } : {}),
  });
  ensureOk(response, 'Wikipedia');
  const body = jsonBody(response, 'Wikipedia');
  if (isRecord(body) && isRecord(body.error)) {
    throw new Error(
      `Wikipedia refused the search: ${text(body.error.info) ?? text(body.error.code) ?? 'error'}`
    );
  }
  const query = isRecord(body) ? body.query : undefined;
  const results = listOf(query, 'search').flatMap((page): WikipediaResult[] => {
    const title = text(page.title);
    if (!title) return [];
    const date = isoDate(page.timestamp);
    return [
      {
        id: `wikipedia:${language}:${text(page.pageid) ?? title}`,
        title: oneLine(title, 300),
        url: `${origin}/wiki/${articlePath(title)}`,
        ...(date ? { date } : {}),
        excerpt: oneLine(htmlToLine(text(page.snippet) ?? ''), 600),
        source: 'wikipedia',
      },
    ];
  });
  return { language, results };
}

/** An article title as it appears in its URL: underscores, readable separators. */
function articlePath(title: string): string {
  return encodeURIComponent(title.replace(/ /g, '_'))
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%2C/g, ',');
}
