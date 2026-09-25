import { ensureOk, jsonBody } from '../guarded-http.js';
import { htmlToLine, quoteUntrusted } from '../html-entities.js';
import { siteHost } from '../results.js';
import {
  configuredOrigin,
  type SearchHit,
  type SearchProvider,
  trimBase,
} from '../search-provider.js';
import { retryAfterOf } from '../throttle.js';
import { SearchThrottledError, WebHttpError } from '../web-errors.js';
import { listOf, text, valuesOf } from '../json-fields.js';

export interface SearxngOptions {
  /** Your SearXNG instance, e.g. `http://localhost:8888`. Its settings must enable `formats: [json]`. */
  baseUrl: string;
  /** Engines to ask (`google`, `bing`, `wikipedia`…). Default: the instance's own. */
  engines?: string[];
  /** Categories to search (`general`, `science`, `it`…). Default: the instance's own. */
  categories?: string[];
  /** Least time between two searches. Default 0. */
  minIntervalMs?: number;
}

/**
 * A SearXNG instance you run (its JSON API). Each result names the engine that found it
 * (`searxng:bing`) and keeps its `publishedDate`.
 */
export function searxng(options: SearxngOptions): SearchProvider {
  const base = trimBase(options.baseUrl);
  return {
    name: 'searxng',
    ...configuredOrigin(options.baseUrl),
    async search(request, web) {
      const url = new URL(`${base}/search`);
      const query = request.site
        ? `${request.query} site:${siteHost(request.site)}`
        : request.query;
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('pageno', '1');
      if (request.language) url.searchParams.set('language', request.language);
      if (request.freshness) url.searchParams.set('time_range', request.freshness);
      if (options.engines?.length) url.searchParams.set('engines', options.engines.join(','));
      if (options.categories?.length) {
        url.searchParams.set('categories', options.categories.join(','));
      }
      const response = await web.request(url.toString(), {
        headers: { accept: 'application/json' },
        minIntervalMs: options.minIntervalMs ?? 0,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      if (response.status === 429)
        throw new SearchThrottledError(
          'SearXNG is rate limited (HTTP 429)',
          retryAfterOf(response)
        );
      if (response.status === 403) {
        throw new WebHttpError(
          'SearXNG refused the JSON format (HTTP 403): enable `formats: [html, json]` in its settings.yml',
          403
        );
      }
      ensureOk(response, 'SearXNG');
      const body = jsonBody(response, 'SearXNG');
      const results = listOf(body, 'results').flatMap((entry): SearchHit[] => {
        const url = text(entry.url);
        if (!url) return [];
        const engine =
          text(entry.engine) ?? (Array.isArray(entry.engines) ? text(entry.engines[0]) : undefined);
        const date = text(entry.publishedDate) ?? text(entry.pubdate);
        return [
          {
            title: htmlToLine(text(entry.title) ?? ''),
            url,
            excerpt: htmlToLine(text(entry.content) ?? ''),
            ...(date ? { date } : {}),
            source: engine ? `searxng:${engine}` : 'searxng',
          },
        ];
      });
      if (results.length === 0) {
        // Nothing found because its engines failed is not an answer: let the next provider try.
        const failed = valuesOf(body, 'unresponsive_engines')
          .map((entry) => (Array.isArray(entry) ? entry.map(String).join(' ') : String(entry)))
          .filter(Boolean);
        if (failed.length > 0) {
          throw new SearchThrottledError(
            `SearXNG's engines did not answer ${quoteUntrusted(failed.join(', '))}`,
            retryAfterOf(response)
          );
        }
      }
      return results;
    },
  };
}
