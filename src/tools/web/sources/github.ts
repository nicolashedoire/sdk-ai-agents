import { bodyText, jsonBody, type WebClient, type WebResponse } from '../guarded-http.js';
import { quoteUntrusted, stripInvisible } from '../html-entities.js';
import { isRecord, listOf, text } from '../json-fields.js';
import { isoDate, oneLine } from '../results.js';
import { trimBase } from '../search-provider.js';
import { retryAfterOf } from '../throttle.js';
import { SearchThrottledError, WebConfigurationError, WebHttpError } from '../web-errors.js';

export interface GithubOptions {
  /** Default `https://api.github.com` (GitHub Enterprise: `https://<host>/api/v3`). */
  baseUrl?: string;
  /**
   * A token raises the rate limit (10 searches a minute without one, 30 with one) and is
   * needed to search code. Sent only to `baseUrl`, never to the model.
   */
  token?: string;
  /** Least time between two requests. Default 0. */
  minIntervalMs?: number;
}

export type GithubSearchKind = 'repositories' | 'code' | 'issues';

/** A repository, a file or an issue found on GitHub. */
export interface GithubResult {
  /** `github:owner/repo`, `github:owner/repo/path/to/file`, `github:owner/repo#42`. */
  id: string;
  title: string;
  url: string;
  /** Repositories: last push; issues: creation. Files have none. */
  date?: string;
  excerpt: string;
  /** Repositories only. */
  stars?: number;
  /** Repositories: main language. */
  language?: string;
  /** Issues: `open` or `closed`. */
  state?: string;
  /** Issues: `issue` or `pull request`. */
  type?: 'issue' | 'pull request';
  source: 'github';
}

/**
 * Searches GitHub's REST search API: repositories (default), code (needs a token) or issues
 * and pull requests. The query takes GitHub's qualifiers (`language:rust`, `repo:owner/name`,
 * `is:pr`…).
 */
export async function searchGithub(
  web: WebClient,
  options: GithubOptions,
  request: { query: string; kind: GithubSearchKind; maxResults: number; signal?: AbortSignal }
): Promise<GithubResult[]> {
  if (request.kind === 'code' && !options.token) {
    throw new WebConfigurationError(
      'GitHub searches code only with a token: webTools({ github: { token } })'
    );
  }
  const url = new URL(
    `${trimBase(options.baseUrl ?? 'https://api.github.com')}/search/${request.kind}`
  );
  url.searchParams.set('q', request.query);
  url.searchParams.set('per_page', String(request.maxResults));
  const response = await web.request(url.toString(), {
    headers: {
      accept:
        request.kind === 'code'
          ? 'application/vnd.github.text-match+json'
          : 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    minIntervalMs: options.minIntervalMs ?? 0,
    ...(request.signal ? { signal: request.signal } : {}),
  });
  ensureGithubOk(response, Boolean(options.token));
  const items = listOf(jsonBody(response, 'GitHub'), 'items');
  if (request.kind === 'repositories') return items.flatMap(repository);
  if (request.kind === 'code') return items.flatMap(codeFile);
  return items.flatMap(issue);
}

function ensureGithubOk(response: WebResponse, withToken: boolean): void {
  if (response.status >= 200 && response.status < 300) return;
  let message = '';
  try {
    const body: unknown = JSON.parse(bodyText(response));
    message = isRecord(body) ? (text(body.message) ?? '') : '';
  } catch {
    message = bodyText(response).slice(0, 200);
  }
  const limited =
    response.status === 429 ||
    (response.status === 403 && response.headers['x-ratelimit-remaining'] === '0');
  if (limited) {
    const reset = Number(response.headers['x-ratelimit-reset']);
    const when =
      Number.isFinite(reset) && reset > 0 ? ` until ${new Date(reset * 1000).toISOString()}` : '';
    throw new SearchThrottledError(
      `GitHub's search rate limit is reached${when}${withToken ? '' : ': a token raises it (webTools({ github: { token } }))'}`,
      Number.isFinite(reset) && reset > 0
        ? Math.max(0, reset * 1000 - Date.now())
        : retryAfterOf(response)
    );
  }
  throw new WebHttpError(
    `GitHub returned HTTP ${response.status}${message ? ` ${quoteUntrusted(message)}` : ''}`,
    response.status
  );
}

function repository(item: Record<string, unknown>): GithubResult[] {
  const name = text(item.full_name);
  const url = text(item.html_url);
  if (!name || !url) return [];
  const date = isoDate(item.pushed_at) ?? isoDate(item.updated_at);
  const stars = typeof item.stargazers_count === 'number' ? item.stargazers_count : undefined;
  const language = text(item.language);
  return [
    {
      id: `github:${name}`,
      title: oneLine(stripInvisible(name), 300),
      url,
      ...(date ? { date } : {}),
      excerpt: line(text(item.description) ?? ''),
      ...(stars !== undefined ? { stars } : {}),
      ...(language ? { language } : {}),
      source: 'github',
    },
  ];
}

function codeFile(item: Record<string, unknown>): GithubResult[] {
  const path = text(item.path);
  const url = text(item.html_url);
  const repo = isRecord(item.repository) ? text(item.repository.full_name) : undefined;
  if (!path || !url || !repo) return [];
  const fragments = listOf(item, 'text_matches')
    .map((match) => text(match.fragment))
    .filter((fragment): fragment is string => fragment !== undefined);
  return [
    {
      id: `github:${repo}/${path}`,
      title: oneLine(stripInvisible(`${repo}: ${path}`), 300),
      url,
      excerpt: line(fragments.join(' … ')),
      source: 'github',
    },
  ];
}

function issue(item: Record<string, unknown>): GithubResult[] {
  const title = text(item.title);
  const url = text(item.html_url);
  if (!title || !url) return [];
  const repo = /\/repos\/([^/]+\/[^/]+)$/.exec(text(item.repository_url) ?? '')?.[1];
  const number = text(item.number);
  const date = isoDate(item.created_at);
  const state = text(item.state);
  return [
    {
      id: repo && number ? `github:${repo}#${number}` : `github:${url}`,
      title: oneLine(stripInvisible(title), 300),
      url,
      ...(date ? { date } : {}),
      excerpt: line(text(item.body) ?? ''),
      ...(state ? { state } : {}),
      type: isRecord(item.pull_request) ? 'pull request' : 'issue',
      source: 'github',
    },
  ];
}

function line(value: string): string {
  return oneLine(stripInvisible(value), 600);
}
