import { ensureOk, jsonBody } from '../guarded-http.js';
import { siteHost } from '../results.js';
import { type SearchHit, type SearchProvider, trimBase } from '../search-provider.js';
import { SearchThrottledError } from '../web-errors.js';
import { type KeyedProviderOptions, requireKey } from './brave.js';
import { listOf, text } from '../json-fields.js';

/**
 * The Tavily search API (`POST /search`). `site` becomes `include_domains`; dates come from
 * `published_date` when Tavily gives one. Tavily takes no language.
 */
export function tavily(options: KeyedProviderOptions): SearchProvider {
  const base = trimBase(options.baseUrl ?? 'https://api.tavily.com');
  requireKey(options.apiKey, 'tavily');
  return {
    name: 'tavily',
    async search(request, web) {
      const body = {
        query: request.query,
        max_results: Math.min(20, request.maxResults),
        search_depth: 'basic',
        topic: 'general',
        ...(request.freshness ? { time_range: request.freshness } : {}),
        ...(request.site ? { include_domains: [siteHost(request.site)] } : {}),
      };
      const response = await web.request(`${base}/search`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        minIntervalMs: options.minIntervalMs ?? 0,
        configuredEndpoint: true,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      if (response.status === 429 || response.status === 432 || response.status === 433) {
        throw new SearchThrottledError(
          `Tavily refused the search (HTTP ${response.status}: rate or plan limit)`
        );
      }
      ensureOk(response, 'Tavily');
      return listOf(jsonBody(response, 'Tavily'), 'results').flatMap((entry): SearchHit[] => {
        const url = text(entry.url);
        if (!url) return [];
        const date = text(entry.published_date);
        return [
          {
            title: text(entry.title) ?? '',
            url,
            excerpt: text(entry.content) ?? '',
            ...(date ? { date } : {}),
          },
        ];
      });
    },
  };
}
