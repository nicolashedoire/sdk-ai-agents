import type { WebClient } from './guarded-http.js';

/** How recent the results must be. */
export type Freshness = 'day' | 'week' | 'month' | 'year';

/** What `web_search` asks a provider. */
export interface SearchRequest {
  query: string;
  maxResults: number;
  /** Only results on this host (or its subdomains). */
  site?: string;
  freshness?: Freshness;
  /** BCP 47 language tag (`fr`, `en-GB`). */
  language?: string;
  signal?: AbortSignal;
}

/** A result as a provider found it. `web_search` normalises its URL and gives it an id. */
export interface SearchHit {
  title: string;
  url: string;
  excerpt: string;
  /** Any date the provider gives (ISO, `2024-01-05`, `3 days ago`…). */
  date?: string;
  /** Who found it, when it is not the provider itself (`searxng:bing`). */
  source?: string;
}

/**
 * A search backend for `web_search`. Throw `SearchThrottledError` when the backend refuses to
 * answer now (captcha, 429): `web_search` moves on to the next provider and leaves this one
 * alone for a while. Send every request through `web`: it applies the timeouts, byte caps,
 * pacing and address checks.
 */
export interface SearchProvider {
  readonly name: string;
  search(request: SearchRequest, web: WebClient): Promise<SearchHit[]>;
}

/** An API base URL without its trailing slashes. */
export function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

/** The primary language subtag of a BCP 47 tag, lower case (`en-GB` → `en`). */
export function primaryLanguage(language: string | undefined): string | undefined {
  const primary = language?.trim().toLowerCase().split(/[-_]/)[0];
  return primary && /^[a-z]{2,3}$/.test(primary) ? primary : undefined;
}

/** The region subtag of a BCP 47 tag, lower case (`en-GB` → `gb`). */
export function languageRegion(language: string | undefined): string | undefined {
  const region = language?.trim().toLowerCase().split(/[-_]/)[1];
  return region && /^[a-z]{2}$/.test(region) ? region : undefined;
}
