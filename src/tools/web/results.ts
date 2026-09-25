import { createHash } from 'node:crypto';
import { stripInvisible } from './html-entities.js';

/** A search result, shaped to be cited: a study numbers it by its `url`. */
export interface WebResult {
  /** Stable: the same page gets the same id, whoever found it (`web:3f2a…`, `arxiv:2401.11817`…). */
  id: string;
  title: string;
  /** As found, without tracking parameters (`utm_*`, `fbclid`…) or fragment. */
  url: string;
  /** `YYYY-MM-DD` (or the full ISO time) when the provider or the page gives one. */
  date?: string;
  /** One line of text, from the provider. */
  excerpt: string;
  /** Who found it: `duckduckgo`, `searxng:bing`, `brave`, `arxiv`… */
  source: string;
}

/** Query parameters that only track the visitor: they split one page into many URLs. */
const TRACKING_PREFIXES = ['utm_'];
const TRACKING_NAMES = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'yclid',
  '_hsenc',
  '_hsmi',
  'igshid',
  'ref_src',
]);

/**
 * The URL a result is cited by: the one found, without its fragment, credentials and tracking
 * parameters (`utm_*`, `fbclid`, `gclid`…); its path is kept as it is, so the link still
 * works. Undefined for anything that is not an http(s) URL.
 */
export function citableUrl(raw: string): string | undefined {
  return cleaned(raw, false);
}

/**
 * The URL a page is known by, for its id and to merge duplicates: the citable URL, scheme and
 * host lowercased, and the trailing slash of its path removed. Undefined for anything that is
 * not an http(s) URL.
 */
export function normalizeUrl(raw: string): string | undefined {
  return cleaned(raw, true);
}

function cleaned(raw: string, trimSlash: boolean): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  url.hash = '';
  url.username = '';
  url.password = '';
  for (const name of [...url.searchParams.keys()]) {
    const lower = name.toLowerCase();
    if (TRACKING_NAMES.has(lower) || TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      url.searchParams.delete(name);
    }
  }
  if (trimSlash && url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }
  const text = url.toString();
  // `new URL` keeps a lone `?` once every parameter is gone.
  return text.endsWith('?') ? text.slice(0, -1) : text;
}

/** `web:` and the first 16 hex digits of the SHA-256 of the normalised URL. */
export function webResultId(normalizedUrl: string): string {
  return `web:${createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 16)}`;
}

/** Text on one line, whitespace collapsed, at most `max` characters. */
export function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A date as `YYYY-MM-DD` when it is one, else undefined. Relative ages ("3 days ago") too. */
export function isoDate(value: unknown, now: number = Date.now()): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (day) return `${day[1]}-${day[2]}-${day[3]}`;
  const relative =
    /^(\d+|an?|one)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(text) ?? undefined;
  if (relative) {
    const count = /^\d+$/.test(relative[1] ?? '') ? Number(relative[1]) : 1;
    const unit = (relative[2] ?? 'day').toLowerCase();
    const ms: Record<string, number> = {
      second: 1_000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_629_800_000,
      year: 31_557_600_000,
    };
    return new Date(now - count * (ms[unit] ?? 0)).toISOString().slice(0, 10);
  }
  if (/^\d{4}$/.test(text)) return text;
  // Only texts that name a year: `Date.parse('3')` is a date too.
  if (!/\b\d{4}\b/.test(text)) return undefined;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return undefined;
  const date = new Date(parsed);
  // "Jan 5, 2024" is read as local midnight: its calendar day is the local one. A text that
  // names its zone (GMT, Z, +02:00) is dated in UTC.
  if (/\b(?:GMT|UTC|Z)\b|[+-]\d{2}:?\d{2}\s*$/i.test(text)) return date.toISOString().slice(0, 10);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** What a provider found, before normalisation and ids. */
export interface FoundHit {
  title: string;
  url: string;
  excerpt: string;
  date?: string;
  source?: string;
}

/**
 * Results ready to cite: http(s) URLs only, cited as found (tracking parameters and fragment
 * removed), without duplicates within the answer (by normalised URL; the first one found
 * wins), within `site` when given, at most `max`.
 */
export function toWebResults(
  hits: FoundHit[],
  options: { source: string; max: number; site?: string }
): WebResult[] {
  const seen = new Set<string>();
  const results: WebResult[] = [];
  for (const hit of hits) {
    const key = normalizeUrl(hit.url);
    const url = citableUrl(hit.url);
    if (!key || !url || seen.has(key)) continue;
    if (options.site && !withinSite(url, options.site)) continue;
    seen.add(key);
    const date = hit.date ? isoDate(hit.date) : undefined;
    results.push({
      id: webResultId(key),
      title: oneLine(stripInvisible(hit.title), 300) || url,
      url,
      ...(date ? { date } : {}),
      excerpt: oneLine(stripInvisible(hit.excerpt), 600),
      source: hit.source ?? options.source,
    });
    if (results.length >= options.max) break;
  }
  return results;
}

/** The URL is on the site's host or one of its subdomains. */
export function withinSite(url: string, site: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  const wanted = siteHost(site);
  return host === wanted || host.endsWith(`.${wanted}`);
}

/** A `site` given as a host, a URL or `*.host`: its bare host name. */
export function siteHost(site: string): string {
  const trimmed = site.trim().toLowerCase().replace(/^\*\./, '');
  try {
    return new URL(/^[a-z]+:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`).hostname;
  } catch {
    return trimmed;
  }
}
