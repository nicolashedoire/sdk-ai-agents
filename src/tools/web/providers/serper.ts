import { ensureOk, jsonBody } from '../guarded-http.js';
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
import { type KeyedProviderOptions, requireKey } from './brave.js';
import { listOf, text } from '../json-fields.js';

/**
 * Serper, Google results as JSON (`POST /search`). Freshness becomes `tbs=qdr:d|w|m|y`, the
 * language `hl` (and its region `gl`); dates come from `organic[].date`.
 */
export function serper(options: KeyedProviderOptions): SearchProvider {
  const base = trimBase(options.baseUrl ?? 'https://google.serper.dev');
  requireKey(options.apiKey, 'serper');
  return {
    name: 'serper',
    ...configuredOrigin(options.baseUrl),
    async search(request, web) {
      const language = primaryLanguage(request.language);
      const region = languageRegion(request.language);
      const body = {
        q: request.site ? `${request.query} site:${siteHost(request.site)}` : request.query,
        num: Math.min(20, request.maxResults),
        ...(request.freshness ? { tbs: `qdr:${request.freshness.charAt(0)}` } : {}),
        ...(language ? { hl: language } : {}),
        ...(region ? { gl: region } : {}),
      };
      const response = await web.request(`${base}/search`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': options.apiKey,
        },
        body: JSON.stringify(body),
        minIntervalMs: options.minIntervalMs ?? 0,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      if (response.status === 429)
        throw new SearchThrottledError('Serper is rate limited (HTTP 429)');
      ensureOk(response, 'Serper');
      return listOf(jsonBody(response, 'Serper'), 'organic').flatMap((entry): SearchHit[] => {
        const url = text(entry.link);
        if (!url) return [];
        const date = text(entry.date);
        return [
          {
            title: text(entry.title) ?? '',
            url,
            excerpt: text(entry.snippet) ?? '',
            ...(date ? { date } : {}),
          },
        ];
      });
    },
  };
}
