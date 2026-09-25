import { ensureOk, jsonBody } from '../guarded-http.js';
import { htmlToLine } from '../html-entities.js';
import { siteHost } from '../results.js';
import {
  configuredOrigin,
  primaryLanguage,
  type SearchHit,
  type SearchProvider,
  trimBase,
} from '../search-provider.js';
import { SearchThrottledError } from '../web-errors.js';
import { listOf, text } from '../json-fields.js';

export interface KeyedProviderOptions {
  apiKey: string;
  /** The API's base URL (for a proxy, or a local server in tests). */
  baseUrl?: string;
  /** Least time between two searches. */
  minIntervalMs?: number;
}

const FRESHNESS = { day: 'pd', week: 'pw', month: 'pm', year: 'py' } as const;
/** Brave's `search_lang` codes that are not the language's own subtag. */
const BRAVE_LANGUAGES: Record<string, string> = { ja: 'jp', zh: 'zh-hans', pt: 'pt-br' };

/**
 * The Brave Search API (`/res/v1/web/search`). Dates come from `page_age`, else `age`.
 * Default pacing 1 000 ms, the free plan's rate.
 */
export function brave(options: KeyedProviderOptions): SearchProvider {
  const base = trimBase(options.baseUrl ?? 'https://api.search.brave.com');
  requireKey(options.apiKey, 'brave');
  return {
    name: 'brave',
    ...configuredOrigin(options.baseUrl),
    async search(request, web) {
      const url = new URL(`${base}/res/v1/web/search`);
      const query = request.site
        ? `${request.query} site:${siteHost(request.site)}`
        : request.query;
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(Math.min(20, request.maxResults)));
      if (request.freshness) url.searchParams.set('freshness', FRESHNESS[request.freshness]);
      const language = primaryLanguage(request.language);
      if (language) url.searchParams.set('search_lang', BRAVE_LANGUAGES[language] ?? language);
      const response = await web.request(url.toString(), {
        headers: { accept: 'application/json', 'x-subscription-token': options.apiKey },
        minIntervalMs: options.minIntervalMs ?? 1_000,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      if (response.status === 429)
        throw new SearchThrottledError('Brave is rate limited (HTTP 429)');
      ensureOk(response, 'Brave');
      const body = jsonBody(response, 'Brave');
      const web_ = typeof body === 'object' && body !== null ? Reflect.get(body, 'web') : undefined;
      return listOf(web_, 'results').flatMap((entry): SearchHit[] => {
        const url = text(entry.url);
        if (!url) return [];
        const date = text(entry.page_age) ?? text(entry.age);
        return [
          {
            title: htmlToLine(text(entry.title) ?? ''),
            url,
            excerpt: htmlToLine(text(entry.description) ?? ''),
            ...(date ? { date } : {}),
          },
        ];
      });
    },
  };
}

export function requireKey(apiKey: string, provider: string): void {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error(`${provider}: apiKey is required`);
  }
}
