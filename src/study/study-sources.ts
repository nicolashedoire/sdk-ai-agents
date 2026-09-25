import { ValidationError } from '../errors/index.js';
import type { Tool } from '../types/tool.js';
import { truncate } from '../utils/truncate.js';
import { zodSchemaToJsonSchema } from '../utils/zod-to-json-schema.js';
import type { StudySearchResult } from './study-types.js';

/** A tool the study searches with, and the parameter its query goes in. */
export interface SearchSource {
  name: string;
  description: string;
  queryParameter: string;
}

/** Names a search tool commonly gives its query, in order of preference. */
const QUERY_PARAMETERS = [
  'query',
  'q',
  'search',
  'searchQuery',
  'search_query',
  'searchTerm',
  'search_term',
  'keywords',
  'terms',
  'term',
  'question',
  'text',
  'prompt',
  'input',
];

/**
 * The study's sources, each an SDK tool already defined (an MCP search server's tools once
 * given to `sdk.defineTool`, or your own). Throws a `ValidationError` for an unknown tool or
 * one that takes no text query.
 */
export function resolveSources(
  names: string[],
  findTool: (name: string) => Tool | undefined
): SearchSource[] {
  return names.map((name, index) => {
    const tool = findTool(name);
    if (!tool) {
      throw new ValidationError(
        `sources[${index}]`,
        `no tool "${name}": define it first (sdk.defineTool, for instance with the tools of connectMcpServer)`
      );
    }
    const queryParameter = queryParameterOf(tool);
    if (!queryParameter) {
      throw new ValidationError(
        `sources[${index}]`,
        `tool "${name}" takes no text query: a source needs a string parameter such as "query"`
      );
    }
    // The tool's own text, as data: on one line, like a result.
    return { name, description: oneLine(tool.description, 300), queryParameter };
  });
}

/**
 * The parameter a search tool takes its query in: a known name (`query`, `q`…), else its only
 * required text parameter, else its first text parameter. A tool whose schema names no
 * parameter (an MCP tool without an input schema) gets `query`.
 */
export function queryParameterOf(tool: Tool): string | undefined {
  const schema = tool.inputJsonSchema ?? zodSchemaToJsonSchema(tool.schema);
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const names = Object.keys(properties);
  if (names.length === 0) return 'query';
  const textual = names.filter((name) => {
    const property = properties[name];
    return isRecord(property) && (property.type === 'string' || property.type === undefined);
  });
  const known = QUERY_PARAMETERS.find((name) => textual.includes(name));
  if (known) return known;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const requiredText = textual.filter((name) => required.includes(name));
  if (requiredText.length === 1) return requiredText[0];
  return textual[0];
}

/** A result as a source returned it, before the study numbers it. */
export interface FoundResult {
  title: string;
  locator?: string;
  date?: string;
  excerpt: string;
}

const LIST_KEYS = [
  'results',
  'items',
  'hits',
  'documents',
  'organic',
  'organic_results',
  'web',
  'papers',
  'entries',
  'articles',
  'data',
  'value',
];
const TITLE_KEYS = ['title', 'name', 'headline'];
const LOCATOR_KEYS = ['url', 'link', 'href', 'uri', 'locator', 'doi', 'permalink', 'path', 'id'];
const DATE_KEYS = [
  'date',
  'published',
  'publishedDate',
  'published_date',
  'publishedAt',
  'published_at',
  'publication_date',
  'year',
  'updated',
  'age',
];
const EXCERPT_KEYS = [
  'excerpt',
  'snippet',
  'summary',
  'abstract',
  'description',
  'content',
  'text',
  'body',
];

/**
 * The results in what a search tool returned, whatever its shape: a list of results, an object
 * holding one (`results`, `items`, `web.results`…), JSON text, MCP text parts, text in blocks
 * of `Title:`, `Description:` and `URL:` lines (one result per block, as MCP search servers
 * write them), or plain text (one result). Each keeps a title, a URL or other locator, a date
 * when given, and an excerpt, on one line each: a result is data, never layout.
 */
export function readResults(output: unknown, depth = 0): FoundResult[] {
  if (depth > 4) return [];
  if (typeof output === 'string') {
    const parsed = parseJson(output);
    if (parsed !== undefined) return readResults(parsed, depth + 1);
    const blocks = labelledBlocks(output);
    if (blocks.length > 0) return blocks.flatMap((block) => readRecord(block, depth));
    const content = output.trim();
    // "No results found" is an answer, not a result anyone could cite.
    if (!content || NO_RESULT.test(content)) return [];
    return [{ title: oneLine(firstLine(content), 200), excerpt: excerptOf(content) }];
  }
  if (Array.isArray(output)) {
    return output.flatMap((entry) =>
      typeof entry === 'string' || Array.isArray(entry)
        ? readResults(entry, depth + 1)
        : isRecord(entry)
          ? readRecord(entry, depth)
          : []
    );
  }
  return isRecord(output) ? readRecord(output, depth) : [];
}

function readRecord(record: Record<string, unknown>, depth: number): FoundResult[] {
  for (const key of LIST_KEYS) {
    const list = record[key];
    if (Array.isArray(list) || (isRecord(list) && key === 'web')) {
      return readResults(list, depth + 1);
    }
  }
  // MCP text parts: `{ content: [{ type: 'text', text }] }`.
  if (Array.isArray(record.content)) {
    const texts = record.content.flatMap((part) =>
      isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []
    );
    return texts.flatMap((part) => readResults(part, depth + 1));
  }
  const title = firstString(record, TITLE_KEYS);
  const locator = firstString(record, LOCATOR_KEYS);
  const date = firstString(record, DATE_KEYS);
  const excerpt = firstString(record, EXCERPT_KEYS);
  if (!title && !locator && !excerpt) return [];
  return [
    {
      title: oneLine(title ?? locator ?? firstLine(excerpt ?? ''), 200),
      ...(locator ? { locator: oneLine(locator, 500) } : {}),
      ...(date ? { date: oneLine(date, 40) } : {}),
      excerpt: excerptOf(excerpt ?? ''),
    },
  ];
}

/** What a search tool writes when it found nothing. */
const NO_RESULT =
  /^(?:no\s+(?:web\s+|search\s+)?(?:results?|matches|documents|hits)(?:\s+(?:were\s+)?found)?(?:\s+for\b.*)?|nothing\s+(?:was\s+)?found(?:\s+for\b.*)?|0\s+results?(?:\s+found)?(?:\s+for\b.*)?|not\s+found)[.!]?$/i;

/** A line like `Title: …` or `URL: …`: a known field name, then its value. */
const FIELD_LINE = /^\s*([A-Za-z][A-Za-z ]{0,20}?)\s*:\s*(.*)$/;
const FIELD_NAMES = new Map<string, string>([
  ...[...TITLE_KEYS, ...LOCATOR_KEYS, ...DATE_KEYS, ...EXCERPT_KEYS].map(
    (key) => [key.toLowerCase(), key] as [string, string]
  ),
  ['source', 'url'],
  ['published date', 'date'],
  ['page age', 'date'],
]);

/**
 * The results of a text written as blocks of labelled lines, as MCP search servers often return
 * them: a field seen again starts the next result, and unlabelled prose goes with the excerpt
 * of the result above it. None when the text is not so.
 */
function labelledBlocks(text: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  let current: Record<string, unknown> | undefined;
  let lastField: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    // A blank line does not end a block: the prose after it may still describe it.
    if (line.trim() === '') continue;
    const match = FIELD_LINE.exec(line);
    const field = match?.[1] ? FIELD_NAMES.get(match[1].trim().toLowerCase()) : undefined;
    if (!field) {
      // Prose under a block describes that result: it goes with its excerpt, never with its
      // title or locator.
      if (current) {
        const key =
          lastField && EXCERPT_KEYS.includes(lastField)
            ? lastField
            : (EXCERPT_KEYS.find((candidate) => current?.[candidate] !== undefined) ?? 'excerpt');
        const earlier = current[key];
        current[key] = earlier === undefined ? line.trim() : `${String(earlier)} ${line.trim()}`;
        lastField = key;
      }
      continue;
    }
    // A field seen again (a second `Title:`, `URL:`) starts the next result.
    if (!current || current[field] !== undefined) {
      current = {};
      blocks.push(current);
    }
    current[field] = match?.[2]?.trim() ?? '';
    lastField = field;
  }
  // Blocks that name a result: a title with a locator or an excerpt.
  const results = blocks.filter(
    (block) =>
      firstString(block, TITLE_KEYS) !== undefined &&
      (firstString(block, LOCATOR_KEYS) !== undefined ||
        firstString(block, EXCERPT_KEYS) !== undefined)
  );
  return results;
}

/**
 * Every result the study retrieved, numbered once (`S1`, `S2`…) for the whole study: the same
 * result found again, by its locator, keeps its id.
 */
export class ResultRegistry {
  private readonly byId = new Map<string, StudySearchResult>();
  private readonly byKey = new Map<string, StudySearchResult>();

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): StudySearchResult | undefined {
    return this.byId.get(id);
  }

  all(): StudySearchResult[] {
    return [...this.byId.values()];
  }

  /** Numbers a found result, or returns the one already numbered. */
  add(found: FoundResult, origin: { tool: string; query: string; runId: string }): string {
    const key = found.locator
      ? `locator:${found.locator}`
      : `text:${origin.tool}:${found.title}:${found.excerpt}`;
    const known = this.byKey.get(key);
    if (known) return known.id;
    const result: StudySearchResult = {
      id: `S${this.byId.size + 1}`,
      title: found.title,
      // Without a locator of its own, a result is found again by its source and query.
      locator: found.locator ?? `${origin.tool}: ${JSON.stringify(origin.query)}`,
      ...(found.date ? { date: found.date } : {}),
      excerpt: found.excerpt,
      tool: origin.tool,
      query: origin.query,
      runId: origin.runId,
    };
    this.byId.set(result.id, result);
    this.byKey.set(key, result);
    return result.id;
  }
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function excerptOf(text: string): string {
  return oneLine(text, 600);
}

/** Text on one line, whitespace collapsed, at most `max` characters. */
function oneLine(text: string, max: number): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max);
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0]?.trim() ?? '';
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
