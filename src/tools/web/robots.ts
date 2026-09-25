import { bodyText, type WebClient } from './guarded-http.js';
import { TtlCache } from './web-cache.js';
import { WebRequestRefusedError } from './web-errors.js';

/** A rule of a robots.txt group. */
interface RobotsRule {
  allow: boolean;
  /** The path pattern, percent-encoding normalised; `*` and a final `$` are special. */
  pattern: string;
  matcher: RegExp;
}

/** A group: the user agents it names, its rules, its `Crawl-delay`. */
export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMs?: number;
}

/** What robots.txt says about one URL. */
export interface RobotsVerdict {
  allowed: boolean;
  /** The `Crawl-delay` of the group that applies. */
  crawlDelayMs?: number;
  /** Why, when the URL is disallowed. */
  reason?: string;
}

/**
 * Parses a robots.txt file (RFC 9309): groups start with `user-agent` lines, then hold
 * `allow` and `disallow` rules; `crawl-delay` (not in the RFC, but widely used) is read too.
 * Lines outside a group, unknown fields and comments are ignored.
 */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let inAgents = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const field = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!field) continue;
    const key = (field[1] ?? '').toLowerCase();
    const value = (field[2] ?? '').trim();
    if (key === 'user-agent') {
      // Consecutive user-agent lines share one group.
      if (!current || !inAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      // An empty `disallow` allows everything: it adds no rule.
      if (value === '') continue;
      const pattern = normalizePattern(value);
      current.rules.push({ allow: key === 'allow', pattern, matcher: patternMatcher(pattern) });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1_000;
    }
  }
  return groups;
}

/**
 * The verdict of robots.txt groups on a path (with its query): the groups naming the product
 * token (merged), else the `*` groups; the longest matching rule wins, and `allow` wins a tie.
 * `/robots.txt` itself is always allowed.
 */
export function robotsVerdict(
  groups: RobotsGroup[],
  productToken: string,
  path: string
): RobotsVerdict {
  const token = productToken.toLowerCase();
  const own = groups.filter((group) => group.agents.some((agent) => agentMatches(agent, token)));
  const applicable = own.length > 0 ? own : groups.filter((group) => group.agents.includes('*'));
  const delays = applicable
    .map((group) => group.crawlDelayMs)
    .filter((delay): delay is number => delay !== undefined);
  const crawlDelayMs = delays.length > 0 ? Math.max(...delays) : undefined;
  const target = normalizePath(path);
  let best: RobotsRule | undefined;
  if (target !== '/robots.txt') {
    for (const rule of applicable.flatMap((group) => group.rules)) {
      if (!rule.matcher.test(target)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
  }
  const allowed = !best || best.allow;
  return {
    allowed,
    ...(crawlDelayMs !== undefined ? { crawlDelayMs } : {}),
    ...(allowed ? {} : { reason: `disallowed by the rule "Disallow: ${best?.pattern}"` }),
  };
}

/** `sdk-ai-agents` matches `sdk-ai-agents` and `sdk-ai-agents/1.0`, whatever the case. */
function agentMatches(agent: string, token: string): boolean {
  return agent !== '*' && agent.split('/')[0]?.trim() === token;
}

/** Percent-encodes what a URL path would, and writes existing escapes in upper case. */
function normalizePattern(pattern: string): string {
  const withSlash = pattern.startsWith('/') || pattern.startsWith('*') ? pattern : `/${pattern}`;
  return normalizePath(withSlash);
}

function normalizePath(path: string): string {
  return path
    .replace(/%[0-9a-fA-F]{2}/g, (sequence) => sequence.toUpperCase())
    .replace(/[^\x21-\x7e]/g, (char) => encodeURIComponent(char));
}

/** A rule's pattern as a regular expression: a prefix, `*` any run, a final `$` the end. */
function patternMatcher(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * robots.txt per origin, read once and kept for a day (RFC 9309 asks for no more): 2xx is
 * parsed; 4xx means no rules (everything allowed); 5xx, 429 and a server that cannot be
 * reached mean everything is disallowed, and are asked again after a minute. Redirects the
 * client does not follow (more than it allows, to http, to another scheme) count as "no
 * robots.txt".
 */
export class RobotsPolicy {
  private readonly rules = new TtlCache<RobotsGroup[]>(86_400_000, 500);
  private readonly unreachable = new TtlCache<string>(60_000, 500);
  private readonly pending = new Map<string, Promise<RobotsGroup[] | string>>();

  constructor(
    private readonly client: WebClient,
    private readonly productToken: string
  ) {}

  async verdict(url: URL, signal?: AbortSignal): Promise<RobotsVerdict> {
    const groups = await this.groupsFor(url.origin, signal);
    if (typeof groups === 'string') {
      return {
        allowed: false,
        reason: `${url.origin}/robots.txt ${groups}: everything is disallowed`,
      };
    }
    return robotsVerdict(groups, this.productToken, `${url.pathname}${url.search}`);
  }

  /** Throws a `WebRequestRefusedError` for a URL robots.txt disallows; gives its crawl delay. */
  async admit(url: URL, signal?: AbortSignal): Promise<{ minIntervalMs?: number }> {
    const verdict = await this.verdict(url, signal);
    if (!verdict.allowed) {
      throw new WebRequestRefusedError(
        `robots.txt of ${url.origin} does not allow ${this.productToken} to read ${url.pathname}${url.search}: ${verdict.reason}`,
        'robots'
      );
    }
    return verdict.crawlDelayMs !== undefined ? { minIntervalMs: verdict.crawlDelayMs } : {};
  }

  private groupsFor(origin: string, signal?: AbortSignal): Promise<RobotsGroup[] | string> {
    const known = this.rules.get(origin) ?? this.unreachable.get(origin);
    if (known !== undefined) return Promise.resolve(known);
    let loading = this.pending.get(origin);
    if (!loading) {
      loading = this.load(origin, signal).finally(() => this.pending.delete(origin));
      this.pending.set(origin, loading);
    }
    return loading;
  }

  private async load(origin: string, signal?: AbortSignal): Promise<RobotsGroup[] | string> {
    let status: number;
    let text = '';
    try {
      const response = await this.client.request(`${origin}/robots.txt`, {
        headers: { accept: 'text/plain' },
        // RFC 9309: at least 500 KiB are parsed.
        maxBytes: 512_000,
        ...(signal ? { signal } : {}),
      });
      status = response.status;
      if (status >= 200 && status < 300) text = bodyText(response);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof WebRequestRefusedError) {
        // A private address is refused for the page too: say so, rather than blame robots.txt.
        if (error.reason === 'private-address') throw error;
        // Redirects the client will not follow (too many, to http, to another scheme): the
        // file is unavailable, as RFC 9309 treats too many redirects.
        this.rules.set(origin, []);
        return [];
      }
      // A name that does not resolve: the page cannot be read either, and that is the reason.
      const code =
        typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw error;
      const reason = `could not be read (${error instanceof Error ? error.message : String(error)})`;
      this.unreachable.set(origin, reason);
      return reason;
    }
    if (status >= 200 && status < 300) {
      const groups = parseRobots(text);
      this.rules.set(origin, groups);
      return groups;
    }
    if (status >= 400 && status < 500 && status !== 429) {
      this.rules.set(origin, []);
      return [];
    }
    const reason = `answered HTTP ${status}`;
    this.unreachable.set(origin, reason);
    return reason;
  }
}
