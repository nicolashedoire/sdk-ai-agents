import { bodyText, type WebClient } from './guarded-http.js';
import { TtlCache } from './web-cache.js';
import { WebRequestRefusedError } from './web-errors.js';

/**
 * The product token robots.txt rules are matched against, whatever user agent is sent: a site
 * writes its rules for `sdk-ai-agents`, and a browser-like user agent is never taken for
 * `Mozilla`.
 */
export const ROBOTS_PRODUCT_TOKEN = 'sdk-ai-agents';

/** Rules with a longer path are ignored: no real site needs them, and they cost time. */
export const MAX_ROBOTS_PATTERN_LENGTH = 2_048;
/** Rules past this many in one file are ignored. */
export const MAX_ROBOTS_RULES = 10_000;
/** A path is matched on its first characters only. */
const MAX_MATCHED_PATH_LENGTH = 4_096;

/** A rule of a robots.txt group. */
interface RobotsRule {
  allow: boolean;
  /** The path pattern, percent-encoding normalised; `*` and a final `$` are special. */
  pattern: string;
  /** The pattern cut at each `*` (a `**` gives an empty part), the final `$` removed. */
  parts: string[];
  /** The pattern ends with `$`: the path must end where the pattern does. */
  anchored: boolean;
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
 * Parses a robots.txt file (RFC 9309): a group starts with one or more `user-agent` lines
 * and holds the `allow` and `disallow` rules that follow; `crawl-delay` (not in the RFC, but
 * widely used) is read too. Other lines (`sitemap`, unknown fields, comments) belong to no
 * group and do not end one. Rules longer than 2,048 characters, and past 10,000 rules, are
 * ignored.
 */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let inAgents = false;
  let rules = 0;
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
    if (key !== 'allow' && key !== 'disallow' && key !== 'crawl-delay') continue;
    inAgents = false;
    if (!current) continue;
    if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1_000;
      continue;
    }
    // An empty `disallow` allows everything: it adds no rule.
    if (value === '' || value.length > MAX_ROBOTS_PATTERN_LENGTH || rules >= MAX_ROBOTS_RULES) {
      continue;
    }
    rules++;
    const pattern = normalizePath(
      value.startsWith('/') || value.startsWith('*') ? value : `/${value}`
    );
    const anchored = pattern.endsWith('$');
    current.rules.push({
      allow: key === 'allow',
      pattern,
      parts: (anchored ? pattern.slice(0, -1) : pattern).split('*'),
      anchored,
    });
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
  const target = normalizePath(path.slice(0, MAX_MATCHED_PATH_LENGTH));
  let best: RobotsRule | undefined;
  if (target !== '/robots.txt') {
    for (const group of applicable) {
      for (const rule of group.rules) {
        if (!ruleMatches(rule, target)) continue;
        if (
          !best ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
        ) {
          best = rule;
        }
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

/**
 * Whether a rule matches a path, in linear time: the part before the first `*` must start the
 * path, and each next part is found at its earliest place after the previous one (the earliest
 * place leaves the most room for the rest, so it is never wrong). A final `$` asks for the
 * last part at the very end. No backtracking: a pattern such as `/*a*a*a*a*b` costs one scan.
 */
function ruleMatches(rule: RobotsRule, path: string): boolean {
  const { parts, anchored } = rule;
  const first = parts[0] ?? '';
  if (!path.startsWith(first)) return false;
  if (parts.length === 1) return !anchored || path.length === first.length;
  let position = first.length;
  const last = parts.length - 1;
  for (let index = 1; index < last; index++) {
    const part = parts[index] ?? '';
    if (part === '') continue;
    const found = path.indexOf(part, position);
    if (found === -1) return false;
    position = found + part.length;
  }
  const tail = parts[last] ?? '';
  if (!anchored) return tail === '' || path.indexOf(tail, position) !== -1;
  return path.length - tail.length >= position && path.endsWith(tail);
}

/** `sdk-ai-agents` matches `sdk-ai-agents` and `sdk-ai-agents/1.0`, whatever the case. */
function agentMatches(agent: string, token: string): boolean {
  return agent !== '*' && agent.split('/')[0]?.trim() === token;
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * A path or a rule written as RFC 9309 (§2.2.2) compares them: an escape of an unreserved
 * character is decoded (`%2D` is `-`, `%7E` is `~`), other escapes are kept in upper case
 * (`%2f` is `%2F`, never `/`), and characters outside printable US-ASCII are percent-encoded
 * in UTF-8.
 */
export function normalizePath(path: string): string {
  return path.replace(/%([0-9a-fA-F]{2})|[^\x21-\x7e]/gu, (match, hex: string | undefined) => {
    if (hex !== undefined) {
      const char = String.fromCharCode(Number.parseInt(hex, 16));
      return UNRESERVED.test(char) ? char : `%${hex.toUpperCase()}`;
    }
    try {
      return encodeURIComponent(match);
    } catch {
      return '%EF%BF%BD';
    }
  });
}

/**
 * robots.txt per origin, read once and kept for a day (RFC 9309 asks for no more): 2xx is
 * parsed; 4xx means no rules (everything allowed); 5xx, 429 and a server that cannot be
 * reached mean everything is disallowed, and are asked again after a minute. Redirects the
 * client does not follow (more than it allows, to http, to another scheme) count as "no
 * robots.txt".
 *
 * The file is read with its own time limit, not with a caller's: one caller that gives up
 * does not fail the others waiting for the same file. It is read without pacing, so it never
 * delays the page it was read for.
 */
export class RobotsPolicy {
  private readonly rules = new TtlCache<RobotsGroup[]>(86_400_000, 500);
  private readonly unreachable = new TtlCache<string>(60_000, 500);
  private readonly pending = new Map<string, Promise<RobotsGroup[] | string>>();

  /**
   * @param client an unpaced client, whose requests do not count as the host's last one
   * @param loadTimeoutMs how long reading one robots.txt may take, redirects included
   */
  constructor(
    private readonly client: WebClient,
    private readonly loadTimeoutMs: number,
    private readonly productToken = ROBOTS_PRODUCT_TOKEN
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
      loading = this.load(origin).finally(() => this.pending.delete(origin));
      this.pending.set(origin, loading);
    }
    return untilAborted(loading, signal);
  }

  private async load(origin: string): Promise<RobotsGroup[] | string> {
    let status: number;
    let text = '';
    try {
      const response = await this.client.request(`${origin}/robots.txt`, {
        headers: { accept: 'text/plain' },
        // RFC 9309: at least 500 KiB are parsed.
        maxBytes: 512_000,
        signal: AbortSignal.timeout(this.loadTimeoutMs),
      });
      status = response.status;
      if (status >= 200 && status < 300) text = bodyText(response);
    } catch (error) {
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

/** The promise's outcome, or the signal's reason as soon as it aborts. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('The request was cancelled');
}
