import { decodeEntities } from './html-entities.js';

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

/** Elements whose content is text up to their end tag, never markup. */
const RAW_TEXT = new Set([
  'script',
  'style',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
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

/** Deeper elements are kept as siblings: the tree (and the recursion over it) stays bounded. */
const MAX_DEPTH = 256;

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Parses HTML the tolerant way: unclosed and misnested tags are closed as a browser would
 * close the common cases (`<p>`, `<li>`, table cells…), comments and doctypes are dropped,
 * and the content of `<script>`, `<style>` and other raw-text elements is kept as text.
 * Returns a root element holding the whole page.
 */
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { type: 'element', tag: '#root', attributes: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const current = () => stack[stack.length - 1] as HtmlElement;
  const addText = (text: string) => {
    if (text) current().children.push({ type: 'text', text: decodeEntities(text) });
  };
  const closeUpTo = (tags: string[], boundary: string[]) => {
    for (let index = stack.length - 1; index > 0; index--) {
      const tag = (stack[index] as HtmlElement).tag;
      if (boundary.includes(tag)) return;
      if (tags.includes(tag)) {
        stack.length = index;
        return;
      }
    }
  };

  let position = 0;
  while (position < html.length) {
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
      const match = /^<\/([a-zA-Z][\w:-]*)[^>]*>/.exec(html.slice(open, open + 200));
      if (!match) {
        addText('<');
        position = open + 1;
        continue;
      }
      const tag = (match[1] ?? '').toLowerCase();
      closeUpTo([tag], []);
      position = open + match[0].length;
      continue;
    }
    const tagMatch = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(open, open + 100));
    if (!tagMatch) {
      addText('<');
      position = open + 1;
      continue;
    }
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
      const close = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = html.slice(position);
      const found = close.exec(rest);
      const raw = found ? rest.slice(0, found.index) : rest;
      // Title and textarea hold text with entities; scripts and styles hold code.
      const text = tag === 'title' || tag === 'textarea' ? decodeEntities(raw) : raw;
      if (text) element.children.push({ type: 'text', text });
      position += found ? found.index + found[0].length : rest.length;
      continue;
    }
    if (!VOID.has(tag) && !selfClosing && stack.length < MAX_DEPTH) stack.push(element);
  }
  return root;
}

/** The index of the `>` that ends a start tag, skipping quoted attribute values. */
function findTagEnd(html: string, from: number): number {
  let quote = '';
  for (let index = from; index < html.length; index++) {
    const char = html.charAt(index);
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
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

/** Every element under `node` (depth first), `node` excluded. */
export function* descendants(node: HtmlElement): Generator<HtmlElement> {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    yield child;
    yield* descendants(child);
  }
}

/** The text under a node, whitespace as written. */
export function textOf(node: HtmlNode): string {
  if (node.type === 'text') return node.text;
  return node.children.map(textOf).join('');
}
