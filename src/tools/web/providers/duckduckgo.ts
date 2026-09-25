import { bodyText, ensureOk } from '../guarded-http.js';
import { htmlToLine } from '../html-entities.js';
import { siteHost } from '../results.js';
import {
  configuredOrigin,
  languageRegion,
  primaryLanguage,
  type SearchHit,
  type SearchProvider,
  trimBase,
} from '../search-provider.js';
import { SearchThrottledError } from '../web-errors.js';
import { retryAfterOf } from '../throttle.js';

/** Default least time between two DuckDuckGo searches, from the end of the previous one. */
export const DUCKDUCKGO_INTERVAL_MS = 4_000;

export interface DuckDuckGoOptions {
  /** Default `https://html.duckduckgo.com`. */
  baseUrl?: string;
  /** DuckDuckGo region (`kl`), e.g. `fr-fr`, `us-en`. Default: from the search language. */
  region?: string;
  /**
   * Least time between the end of one search and the start of the next. Default 4 000 ms:
   * DuckDuckGo's HTML endpoint answers empty pages to callers much faster than that.
   */
  minIntervalMs?: number;
}

/** DuckDuckGo regions by language, for a search that names only its language. */
const REGIONS: Record<string, string> = {
  en: 'us-en',
  fr: 'fr-fr',
  de: 'de-de',
  es: 'es-es',
  it: 'it-it',
  pt: 'br-pt',
  nl: 'nl-nl',
  pl: 'pl-pl',
  sv: 'se-sv',
  tr: 'tr-tr',
  ru: 'ru-ru',
  ja: 'jp-jp',
  ko: 'kr-kr',
  zh: 'cn-zh',
  ar: 'xa-ar',
  hi: 'in-en',
};

/**
 * DuckDuckGo's HTML endpoint: no key, no setup. It gives titles, snippets and, for some
 * results, a date. A captcha or "unusual traffic" page, or an empty page where results were
 * expected (DuckDuckGo's way of throttling), throws `SearchThrottledError`: `web_search` waits
 * and tries once more, then moves on. Queries are spaced by 4 s by default, from the end of
 * the previous one: the HTML endpoint throttles callers that go faster.
 */
export function duckDuckGo(options: DuckDuckGoOptions = {}): SearchProvider {
  const endpoint = `${trimBase(options.baseUrl ?? 'https://html.duckduckgo.com')}/html/`;
  const minIntervalMs = options.minIntervalMs ?? DUCKDUCKGO_INTERVAL_MS;
  return {
    name: 'duckduckgo',
    ...configuredOrigin(options.baseUrl),
    async search(request, web) {
      const query = request.site
        ? `${request.query} site:${siteHost(request.site)}`
        : request.query;
      const form = new URLSearchParams({ q: query });
      const region = options.region ?? regionOf(request.language);
      if (region) form.set('kl', region);
      if (request.freshness) form.set('df', request.freshness.charAt(0));
      const response = await web.request(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'text/html',
          ...(request.language ? { 'accept-language': request.language } : {}),
        },
        body: form.toString(),
        minIntervalMs,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      if (response.status === 403 || response.status === 429) {
        throw new SearchThrottledError(
          `DuckDuckGo refused the search (HTTP ${response.status})`,
          retryAfterOf(response)
        );
      }
      ensureOk(response, 'DuckDuckGo');
      const page = parseDuckDuckGoPage(bodyText(response));
      if (page.results.length > 0) return page.results;
      // "No results." first: the page echoes the query, which may say "captcha".
      if (page.noResults) return [];
      if (page.blocked) {
        throw new SearchThrottledError('DuckDuckGo answered with a captcha page (unusual traffic)');
      }
      // An empty page where results were expected: DuckDuckGo's way of throttling.
      throw new SearchThrottledError('DuckDuckGo answered an empty page (throttled)');
    },
  };
}

function regionOf(language: string | undefined): string | undefined {
  const primary = primaryLanguage(language);
  if (!primary) return undefined;
  if (primary === 'en' && languageRegion(language) === 'gb') return 'uk-en';
  return REGIONS[primary];
}

/** What a DuckDuckGo HTML page holds. */
export interface DuckDuckGoPage {
  results: SearchHit[];
  /** A captcha or "unusual traffic" page, and no result. */
  blocked: boolean;
  /** DuckDuckGo says it found nothing. */
  noResults: boolean;
}

const RESULT_LINK = /<a\b[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
const SNIPPET = /\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td|span)>/i;
const DATE = /\b(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}/;
/**
 * The markup of DuckDuckGo's block page (its "anomaly" challenge), never words the page could
 * echo from the query. Looked for only when the page has no result (see `blocked`).
 */
const BLOCK_MARKUP = /\bclass="[^"]{0,100}\banomaly-modal|\/anomaly\.js|\bid="challenge-form"/i;

/**
 * Reads the results of a DuckDuckGo HTML page: title and link (`result__a`, a direct URL or a
 * `uddg=` redirect), snippet and date. Ads and DuckDuckGo's own links are skipped. A page is
 * blocked only when it has no result and holds the markup of DuckDuckGo's challenge: a result
 * page, or the query it echoes, can speak of a captcha.
 */
export function parseDuckDuckGoPage(html: string): DuckDuckGoPage {
  const links = [...html.matchAll(RESULT_LINK)];
  const results: SearchHit[] = [];
  links.forEach((link, index) => {
    const tag = /^<a\b[^>]*>/i.exec(link[0])?.[0] ?? '';
    const href = /\bhref="([^"]*)"/i.exec(tag)?.[1];
    const url = href ? resultUrl(href) : undefined;
    if (!url) return;
    const start = (link.index ?? 0) + link[0].length;
    const end = links[index + 1]?.index ?? html.length;
    const block = html.slice(start, end);
    const date = DATE.exec(block)?.[1];
    results.push({
      title: htmlToLine(link[1] ?? ''),
      url,
      excerpt: htmlToLine(SNIPPET.exec(block)?.[1] ?? ''),
      ...(date ? { date } : {}),
    });
  });
  return {
    results,
    blocked: results.length === 0 && BLOCK_MARKUP.test(html),
    noResults: /\bclass="[^"]*\bno-results\b/i.test(html) || />\s*No\s+results\.?\s*</i.test(html),
  };
}

/** The target of a result link: `uddg=` decoded; ads and DuckDuckGo's own links dropped. */
function resultUrl(href: string): string | undefined {
  const decoded = href.replace(/&amp;/g, '&');
  let url: URL;
  try {
    url = new URL(
      decoded.startsWith('//') ? `https:${decoded}` : decoded,
      'https://duckduckgo.com'
    );
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com')) {
    const target = url.searchParams.get('uddg');
    // `/y.js` links are ads; other DuckDuckGo links are its own pages.
    return target && url.pathname.startsWith('/l/') ? target : undefined;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
}
