import { decodeEntities } from './html-entities.js';
import { WebTimeoutError } from './web-errors.js';

/** An element of a parsed page. Tag and attribute names are in lower case. */
export interface HtmlElement {
  type: 'element';
  tag: string;
  attributes: Record<string, string>;
  children: HtmlNode[];
}

export interface HtmlText {
  type: 'text';
  /** Entities already decoded. */
  text: string;
}

export type HtmlNode = HtmlElement | HtmlText;

/** A parsed page: its root, and whether the parser stopped before the end. */
export interface HtmlDocument extends HtmlElement {
  /** More than `maxElements` elements: the rest of the page was left out. */
  truncated: boolean;
}

/**
 * A time budget for synchronous work: nothing else runs while it goes on, so it checks the
 * clock itself, every few hundred steps, and throws a `WebTimeoutError` once past its end.
 */
export class CpuBudget {
  private steps = 0;

  constructor(
    private readonly deadline: number,
    private readonly what: string
  ) {}

  static of(ms: number, what: string): CpuBudget {
    return new CpuBudget(Date.now() + ms, what);
  }

  /** Counts a step; every 256 steps, throws if the budget is spent. */
  step(): void {
    if ((++this.steps & 255) === 0) this.check();
  }

  check(): void {
    if (Date.now() > this.deadline) {
      throw new WebTimeoutError(`${this.what} took too long: the page is too large or too complex`);
    }
  }
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Elements whose content is text up to their end tag, never markup, as a browser that runs
 * scripts reads them. `<noscript>` is not among them: `web_fetch` runs no script, so its
 * content is markup, the page as a browser without JavaScript shows it.
 */
const RAW_TEXT = new Set([
  'script',
  'style',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'textarea',
  'title',
  'plaintext',
]);

/** Elements whose start closes an open `<p>`, as in browsers. */
const CLOSES_PARAGRAPH = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

/** Start tags that close an open element of the same family, up to a boundary. */
const IMPLIED_ENDS: Record<string, { closes: string[]; boundary: string[] }> = {
  li: { closes: ['li'], boundary: ['ul', 'ol', 'menu'] },
  dt: { closes: ['dt', 'dd'], boundary: ['dl'] },
  dd: { closes: ['dt', 'dd'], boundary: ['dl'] },
  tr: { closes: ['tr', 'td', 'th'], boundary: ['table', 'thead', 'tbody', 'tfoot'] },
  td: { closes: ['td', 'th'], boundary: ['tr', 'table'] },
  th: { closes: ['td', 'th'], boundary: ['tr', 'table'] },
  thead: { closes: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], boundary: ['table'] },
  tbody: { closes: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], boundary: ['table'] },
  tfoot: { closes: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], boundary: ['table'] },
  option: { closes: ['option'], boundary: ['select', 'datalist', 'optgroup'] },
};

/** Deeper elements are kept as siblings: the tree, and every walk over it, stays shallow. */
export const MAX_HTML_DEPTH = 128;
/** Elements past this many are left out (`truncated`): a page of 2 MB rarely holds 50,000. */
export const MAX_HTML_ELEMENTS = 100_000;
/** Steps back up the open elements when an end tag looks for its start. */
const MAX_CLOSE_SEARCH = MAX_HTML_DEPTH;

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/**
 * Parses HTML the tolerant way: unclosed and misnested tags are closed as a browser would
 * close the common cases (`<p>`, `<li>`, table cells…), comments and doctypes are dropped,
 * and the content of `<script>`, `<style>` and other raw-text elements is kept as text. In
 * a tag, a quote opens a value only right after `=`, as in a browser's tokenizer. Returns a
 * root element holding the whole page, at most `MAX_HTML_DEPTH` deep and `MAX_HTML_ELEMENTS`
 * elements; `budget` bounds the time it takes.
 */
export function parseHtml(html: string, budget?: CpuBudget): HtmlDocument {
  const root: HtmlDocument = {
    type: 'element',
    tag: '#root',
    attributes: {},
    children: [],
    truncated: false,
  };
  const stack: HtmlElement[] = [root];
  const current = () => stack[stack.length - 1] as HtmlElement;
  const addText = (text: string) => {
    if (text) current().children.push({ type: 'text', text: decodeEntities(text) });
  };
  const closeUpTo = (tags: string[], boundary: string[]) => {
    const lowest = Math.max(1, stack.length - MAX_CLOSE_SEARCH);
    for (let index = stack.length - 1; index >= lowest; index--) {
      const tag = (stack[index] as HtmlElement).tag;
      if (boundary.includes(tag)) return;
      if (tags.includes(tag)) {
        stack.length = index;
        return;
      }
    }
  };

  let elements = 0;
  let position = 0;
  while (position < html.length) {
    budget?.step();
    const open = html.indexOf('<', position);
    if (open === -1) {
      addText(html.slice(position));
      break;
    }
    addText(html.slice(position, open));
    const next = html.charAt(open + 1);
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      position = end === -1 ? html.length : end + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', open);
      position = end === -1 ? html.length : end + 1;
      continue;
    }
    if (next === '/') {
      const match = /^<\/([a-zA-Z][\w:-]{0,63})[^>]{0,256}>/.exec(html.slice(open, open + 330));
      if (!match) {
        addText('<');
        position = open + 1;
        continue;
      }
      closeUpTo([(match[1] ?? '').toLowerCase()], []);
      position = open + match[0].length;
      continue;
    }
    const tagMatch = /^<([a-zA-Z][\w:-]{0,63})/.exec(html.slice(open, open + 66));
    if (!tagMatch) {
      addText('<');
      position = open + 1;
      continue;
    }
    if (elements >= MAX_HTML_ELEMENTS) {
      root.truncated = true;
      break;
    }
    elements++;
    const end = findTagEnd(html, open + tagMatch[0].length);
    const tag = (tagMatch[1] ?? '').toLowerCase();
    const inside = html.slice(open + tagMatch[0].length, end);
    const selfClosing = /\/\s*$/.test(inside);
    const element: HtmlElement = {
      type: 'element',
      tag,
      attributes: parseAttributes(inside),
      children: [],
    };
    position = end + 1;

    if (CLOSES_PARAGRAPH.has(tag)) closeUpTo(['p'], ['button', 'table', 'td', 'th']);
    const implied = IMPLIED_ENDS[tag];
    if (implied) closeUpTo(implied.closes, implied.boundary);
    current().children.push(element);

    if (RAW_TEXT.has(tag) && !selfClosing) {
      const close = rawTextEnd(html, tag, position);
      const raw = html.slice(position, close.start);
      // Title and textarea hold text with entities; scripts and styles hold code.
      const text = tag === 'title' || tag === 'textarea' ? decodeEntities(raw) : raw;
      if (text) element.children.push({ type: 'text', text });
      position = close.end;
      continue;
    }
    if (!VOID.has(tag) && !selfClosing && stack.length < MAX_HTML_DEPTH) stack.push(element);
  }
  return root;
}

/** Where a raw-text element ends: its end tag, found case-insensitively, else the page's end. */
function rawTextEnd(html: string, tag: string, from: number): { start: number; end: number } {
  const lower = `</${tag}`;
  let index = from;
  for (;;) {
    const found = html.indexOf('</', index);
    if (found === -1) return { start: html.length, end: html.length };
    if (html.slice(found, found + lower.length).toLowerCase() === lower) {
      const after = html.charAt(found + lower.length);
      if (after === '>' || after === '' || /\s|\//.test(after)) {
        const close = html.indexOf('>', found);
        return { start: found, end: close === -1 ? html.length : close + 1 };
      }
    }
    index = found + 2;
  }
}

/**
 * The index of the `>` that ends a start tag. A quote opens a value only right after `=`
 * (spaces allowed between), as in a browser's tokenizer: `<div class=a"b>` ends at its `>`.
 */
function findTagEnd(html: string, from: number): number {
  let index = from;
  while (index < html.length) {
    const char = html.charAt(index);
    if (char === '>') return index;
    if (char === '=') {
      index++;
      while (index < html.length && /\s/.test(html.charAt(index))) index++;
      const quote = html.charAt(index);
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, index + 1);
        if (close === -1) return html.length;
        index = close + 1;
      }
      continue;
    }
    index++;
  }
  return html.length;
}

function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of text.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? '').toLowerCase();
    if (!name || name in attributes) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Every element under `node`, depth first, `node` excluded. Iterative: no deep recursion. */
export function descendants(node: HtmlElement, budget?: CpuBudget): HtmlElement[] {
  const found: HtmlElement[] = [];
  const pending: HtmlNode[] = [...node.children].reverse();
  while (pending.length > 0) {
    budget?.step();
    const next = pending.pop() as HtmlNode;
    if (next.type !== 'element') continue;
    found.push(next);
    for (let index = next.children.length - 1; index >= 0; index--) {
      pending.push(next.children[index] as HtmlNode);
    }
  }
  return found;
}

/** The text under a node, whitespace as written. Iterative. */
export function textOf(node: HtmlNode): string {
  if (node.type === 'text') return node.text;
  const parts: string[] = [];
  const pending: HtmlNode[] = [node];
  while (pending.length > 0) {
    const next = pending.pop() as HtmlNode;
    if (next.type === 'text') {
      parts.push(next.text);
      continue;
    }
    for (let index = next.children.length - 1; index >= 0; index--) {
      pending.push(next.children[index] as HtmlNode);
    }
  }
  return parts.join('');
}
