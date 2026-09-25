import { stripInvisible } from './html-entities.js';
import { descendants, type HtmlElement, type HtmlNode, parseHtml, textOf } from './html-parser.js';
import { isoDate, oneLine } from './results.js';

/** What `web_fetch` keeps of an HTML page. */
export interface PageExtract {
  title?: string;
  /** `YYYY-MM-DD`, from the page's metadata, JSON-LD or `<time>`. */
  date?: string;
  /** BCP 47 tag from `<html lang>` or the metadata. */
  language?: string;
  /** The main content as Markdown or plain text. */
  content: string;
  /** The page seems to build its content with JavaScript, which `web_fetch` does not run. */
  hint?: 'js-rendered';
}

export type PageFormat = 'markdown' | 'text';

/** Never content: code, styles, embedded objects, forms, navigation and page furniture. */
const DROPPED = new Set([
  'head',
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'canvas',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'optgroup',
  'datalist',
  'output',
  'nav',
  'footer',
  'aside',
  'dialog',
  'menu',
  'link',
  'meta',
  'audio',
  'video',
  'picture',
  'source',
  'track',
  'map',
  'area',
  'img',
]);
/** ARIA roles of page furniture. */
const DROPPED_ROLES = new Set([
  'navigation',
  'contentinfo',
  'search',
  'complementary',
  'menu',
  'menubar',
  'dialog',
  'alertdialog',
]);

/** Meta names and properties that date a page, best first. */
const PUBLISHED_META = [
  'article:published_time',
  'datepublished',
  'citation_publication_date',
  'citation_date',
  'dc.date.issued',
  'dcterms.issued',
  'dc.date',
  'dcterms.date',
  'dcterms.created',
  'date',
  'pubdate',
  'publishdate',
  'publish-date',
  'publish_date',
  'published_time',
  'article.published',
  'sailthru.date',
  'parsely-pub-date',
];
const MODIFIED_META = ['article:modified_time', 'og:updated_time', 'datemodified', 'last-modified'];

/**
 * Extracts what a reader (or a model) needs from an HTML page, with no dependency: its title,
 * date and language, and its main content as Markdown or plain text — headings, paragraphs,
 * lists, links, tables and code kept; scripts, styles, navigation, footers, forms and hidden
 * elements (`hidden`, `aria-hidden`, `display:none`, `visibility:hidden`, zero font size or
 * opacity) dropped, invisible characters removed.
 */
export function extractPage(
  html: string,
  options: { url: string; format: PageFormat }
): PageExtract {
  const root = parseHtml(html);
  const metadata = readMetadata(root);
  const base = baseUrl(root, options.url);
  prune(root, false);
  const main = mainContent(root);
  const content = render(main, { markdown: options.format === 'markdown', base, blocks: [] });
  const title = metadata.title ?? firstHeading(main);
  const date = metadata.published ?? timeDate(main) ?? metadata.modified;
  const hint =
    content.replace(/\s+/g, '').length < 200 &&
    /id=["'](?:__next|root|app|__nuxt)["']|data-reactroot|ng-app|__NUXT__|<noscript[^>]*>[^<]*(?:enable|activate|turn on)\s+javascript/i.test(
      html
    )
      ? ('js-rendered' as const)
      : undefined;
  return {
    ...(title ? { title } : {}),
    ...(date ? { date } : {}),
    ...(metadata.language ? { language: metadata.language } : {}),
    content,
    ...(hint ? { hint } : {}),
  };
}

interface Metadata {
  title?: string;
  published?: string;
  modified?: string;
  language?: string;
}

/** Title, dates and language from `<meta>`, `<title>`, `<html lang>` and JSON-LD. */
function readMetadata(root: HtmlElement): Metadata {
  const metas = new Map<string, string>();
  const jsonLd: unknown[] = [];
  let title: string | undefined;
  let htmlLang: string | undefined;
  let itemDate: string | undefined;
  for (const element of descendants(root)) {
    const { tag, attributes } = element;
    if (tag === 'meta') {
      const key = (
        attributes.property ??
        attributes.name ??
        attributes.itemprop ??
        attributes['http-equiv']
      )
        ?.trim()
        .toLowerCase();
      const content = attributes.content?.trim();
      if (key && content && !metas.has(key)) metas.set(key, content);
    } else if (tag === 'title') {
      title ??= textOf(element);
    } else if (tag === 'html') {
      htmlLang ??= attributes.lang ?? attributes['xml:lang'];
    } else if (tag === 'script' && /ld\+json/i.test(attributes.type ?? '')) {
      try {
        jsonLd.push(JSON.parse(textOf(element)));
      } catch {
        // Broken JSON-LD is common: the page still has its other metadata.
      }
    } else if (attributes.itemprop?.toLowerCase() === 'datepublished') {
      itemDate ??= attributes.content ?? attributes.datetime ?? textOf(element);
    }
  }
  const clean = (value: string | undefined, max: number) =>
    value ? oneLine(stripInvisible(value), max) || undefined : undefined;
  const firstDate = (keys: string[]) =>
    keys.map((key) => isoDate(metas.get(key))).find((date) => date !== undefined);
  const published =
    firstDate(PUBLISHED_META) ??
    isoDate(findJsonLd(jsonLd, 'datePublished')) ??
    isoDate(itemDate) ??
    isoDate(findJsonLd(jsonLd, 'dateCreated'));
  const modified = firstDate(MODIFIED_META) ?? isoDate(findJsonLd(jsonLd, 'dateModified'));
  const language = [
    htmlLang,
    metas.get('content-language'),
    metas.get('og:locale')?.replace('_', '-'),
    findJsonLd(jsonLd, 'inLanguage'),
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : undefined))
    .find((value) => value !== undefined && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value));
  const pageTitle =
    clean(metas.get('og:title'), 300) ??
    clean(metas.get('twitter:title'), 300) ??
    clean(title, 300) ??
    clean(stringOf(findJsonLd(jsonLd, 'headline')), 300);
  return {
    ...(pageTitle ? { title: pageTitle } : {}),
    ...(published ? { published } : {}),
    ...(modified ? { modified } : {}),
    ...(language ? { language } : {}),
  };
}

/** The first value of `key` in JSON-LD documents (their `@graph` included). */
function findJsonLd(documents: unknown[], key: string, depth = 0): unknown {
  if (depth > 6) return undefined;
  for (const document of documents) {
    if (Array.isArray(document)) {
      const found = findJsonLd(document, key, depth + 1);
      if (found !== undefined) return found;
    } else if (typeof document === 'object' && document !== null) {
      const record = document as Record<string, unknown>;
      if (record[key] !== undefined) return record[key];
      const nested = Object.values(record).filter((value) => typeof value === 'object');
      const found = findJsonLd(nested, key, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Links resolve against `<base href>` when the page sets one, else against its URL. */
function baseUrl(root: HtmlElement, url: string): URL | undefined {
  let base: URL | undefined;
  try {
    base = new URL(url);
  } catch {
    base = undefined;
  }
  for (const element of descendants(root)) {
    if (element.tag === 'base' && element.attributes.href) {
      try {
        return new URL(element.attributes.href, base);
      } catch {
        return base;
      }
    }
  }
  return base;
}

/** Drops what is not content, and every element a reader cannot see. */
function prune(node: HtmlElement, inContent: boolean): void {
  node.children = node.children.filter((child) => {
    if (child.type === 'text') return true;
    if (DROPPED.has(child.tag) || isHidden(child)) return false;
    const role = child.attributes.role?.trim().toLowerCase();
    if (role && DROPPED_ROLES.has(role)) return false;
    // A page's header is furniture; an article's header holds its title and byline.
    if ((child.tag === 'header' || role === 'banner') && !inContent) return false;
    prune(child, inContent || child.tag === 'article' || child.tag === 'main' || role === 'main');
    return true;
  });
}

/** Hidden by an attribute or an inline style: text a reader never sees can carry instructions. */
export function isHidden(element: HtmlElement): boolean {
  const { attributes } = element;
  if ('hidden' in attributes) return true;
  if (attributes['aria-hidden']?.trim().toLowerCase() === 'true') return true;
  if (element.tag === 'input' && attributes.type?.toLowerCase() === 'hidden') return true;
  const style = (attributes.style ?? '').toLowerCase().replace(/\s+/g, '');
  if (!style) return false;
  return (
    /(?:^|;)display:none(?:!important)?(?:;|$)/.test(style) ||
    /(?:^|;)visibility:(?:hidden|collapse)(?:!important)?(?:;|$)/.test(style) ||
    /(?:^|;)font-size:0(?:\.0*)?(?:px|pt|em|rem|%|vh|vw|ex|ch)?(?:!important)?(?:;|$)/.test(
      style
    ) ||
    /(?:^|;)opacity:0(?:\.0*)?(?:!important)?(?:;|$)/.test(style)
  );
}

/** `<main>`, else the longest `<article>`, else `<body>` — when it holds real text. */
function mainContent(root: HtmlElement): HtmlElement {
  const elements = [...descendants(root)];
  const main = elements.find(
    (element) => element.tag === 'main' || element.attributes.role?.toLowerCase() === 'main'
  );
  if (main && textLength(main) >= 100) return main;
  const articles = elements
    .filter((element) => element.tag === 'article')
    .map((article) => ({ article, length: textLength(article) }))
    .sort((a, b) => b.length - a.length);
  const article = articles[0];
  if (article && article.length >= 100) return article.article;
  return elements.find((element) => element.tag === 'body') ?? root;
}

function textLength(node: HtmlNode): number {
  return textOf(node).replace(/\s+/g, '').length;
}

function firstHeading(node: HtmlElement): string | undefined {
  for (const element of descendants(node)) {
    if (element.tag === 'h1') {
      const text = oneLine(stripInvisible(textOf(element)), 300);
      if (text) return text;
    }
  }
  return undefined;
}

/** The date of a `<time datetime>` in the content, a publication one first. */
function timeDate(node: HtmlElement): string | undefined {
  const times = [...descendants(node)].filter(
    (element) => element.tag === 'time' && element.attributes.datetime
  );
  const published = times.find(
    (element) =>
      'pubdate' in element.attributes ||
      element.attributes.itemprop?.toLowerCase() === 'datepublished' ||
      /publish/i.test(element.attributes.class ?? '')
  );
  return isoDate((published ?? times[0])?.attributes.datetime);
}

// ---------------------------------------------------------------------------------------
// Rendering

interface RenderContext {
  markdown: boolean;
  base: URL | undefined;
  /** Preformatted blocks, kept apart so whitespace clean-up never touches them. */
  blocks: string[];
}

/** Indentation of nested list lines, kept apart from the spaces the clean-up trims. */
const INDENT = '\ue000';
const BLOCK_MARK = '\ue001';

const BLOCKS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'header',
  'figure',
  'figcaption',
  'address',
  'center',
  'details',
  'summary',
  'hgroup',
  'body',
  'html',
  'fieldset',
  'legend',
  'caption',
  'dd',
  'search',
]);

function render(node: HtmlElement, context: RenderContext): string {
  const text = tidy(renderChildren(node, context));
  return text
    .replaceAll(INDENT, ' ')
    .replace(
      new RegExp(`${BLOCK_MARK}(\\d+)${BLOCK_MARK}`, 'g'),
      (_, index: string) => context.blocks[Number(index)] ?? ''
    )
    .trim();
}

/** Trims the spaces around line breaks, collapses spaces and blank lines. */
function tidy(text: string): string {
  return text
    .replace(/ {2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function block(content: string): string {
  const trimmed = content.trim();
  return trimmed ? `\n\n${trimmed}\n\n` : '';
}

function renderChildren(node: HtmlElement, context: RenderContext): string {
  let out = '';
  for (const child of node.children) out += renderNode(child, context);
  return out;
}

/** Inline content on one line: headings, table cells, link texts. */
function inline(node: HtmlElement, context: RenderContext): string {
  return renderChildren(node, context).replace(/\s+/g, ' ').trim();
}

function renderNode(node: HtmlNode, context: RenderContext): string {
  if (node.type === 'text') {
    // Private-use characters are icon-font glyphs: nothing to read, and the renderer's marks.
    return stripInvisible(node.text)
      .replace(/[\ue000-\uf8ff]/g, '')
      .replace(/[\s\u00a0]+/g, ' ');
  }
  const { tag } = node;
  const md = context.markdown;
  const heading = /^h([1-6])$/.exec(tag);
  if (heading) {
    const text = inline(node, context);
    return text ? block(md ? `${'#'.repeat(Number(heading[1]))} ${text}` : text) : '';
  }
  switch (tag) {
    case 'br':
      return '\n';
    case 'wbr':
      return '';
    case 'hr':
      return md ? block('---') : '\n\n';
    case 'ul':
    case 'ol':
      return block(renderList(node, context, tag === 'ol'));
    case 'li':
      return block(`- ${tidy(renderChildren(node, context))}`);
    case 'pre':
      return block(preformatted(node, context));
    case 'blockquote': {
      const inner = tidy(renderChildren(node, context));
      if (!md) return block(inner);
      return block(
        inner
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n')
      );
    }
    case 'table':
      return block(renderTable(node, context));
    case 'dt': {
      const text = inline(node, context);
      return text ? block(md ? `**${text}**` : text) : '';
    }
    case 'a':
      return link(node, context);
    case 'strong':
    case 'b':
      return emphasis(node, context, md ? '**' : '');
    case 'em':
    case 'i':
      return emphasis(node, context, md ? '*' : '');
    case 'del':
    case 's':
    case 'strike':
      return emphasis(node, context, md ? '~~' : '');
    case 'code':
    case 'kbd':
    case 'samp':
    case 'tt': {
      const code = textOf(node).replace(/\s+/g, ' ').trim();
      if (!code || !md) return code;
      const fence = code.includes('`') ? '``' : '`';
      return `${fence}${fence.length > 1 ? ' ' : ''}${code}${fence.length > 1 ? ' ' : ''}${fence}`;
    }
    case 'q':
      return `“${inline(node, context)}”`;
    default:
      return BLOCKS.has(tag) ? block(renderChildren(node, context)) : renderChildren(node, context);
  }
}

/** Bold, italic, strike-through: the mark hugs the text, the spaces around it stay outside. */
function emphasis(node: HtmlElement, context: RenderContext, mark: string): string {
  const raw = renderChildren(node, context);
  const text = raw.trim();
  if (!text) return raw;
  if (!mark || text.includes('\n')) return raw;
  const before = /^\s/.test(raw) ? ' ' : '';
  const after = /\s$/.test(raw) ? ' ' : '';
  return `${before}${mark}${text}${mark}${after}`;
}

function link(node: HtmlElement, context: RenderContext): string {
  const raw = renderChildren(node, context);
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return raw.includes('\n') ? raw : '';
  const target = linkTarget(node.attributes.href, context.base);
  if (!context.markdown || !target || raw.includes('\n\n')) return raw;
  const before = /^\s/.test(raw) ? ' ' : '';
  const after = /\s$/.test(raw) ? ' ' : '';
  const label = text.replace(/([[\]])/g, '\\$1');
  const url = target.replace(/[()\s<>]/g, (char) => encodeURIComponent(char));
  return `${before}[${label}](${url})${after}`;
}

/** An http(s) or mailto link, absolute; `javascript:`, `data:` and in-page anchors are not links. */
function linkTarget(href: string | undefined, base: URL | undefined): string | undefined {
  const value = href?.trim();
  if (!value || value.startsWith('#')) return undefined;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function renderList(list: HtmlElement, context: RenderContext, ordered: boolean): string {
  const start = Number.parseInt(list.attributes.start ?? '1', 10);
  let number = Number.isFinite(start) ? start : 1;
  const items: string[] = [];
  for (const child of list.children) {
    if (child.type !== 'element') continue;
    const nested = child.tag === 'ul' || child.tag === 'ol';
    const body = tidy(
      nested ? renderList(child, context, child.tag === 'ol') : renderChildren(child, context)
    );
    if (!body) continue;
    const marker = nested ? '' : ordered ? `${number++}.` : '-';
    const indent = INDENT.repeat(nested ? 2 : marker.length + 1);
    const lines = body.split('\n').map((line, index) => {
      if (index === 0 && marker) return `${marker} ${line}`;
      return line ? `${indent}${line}` : '';
    });
    items.push(lines.join('\n'));
  }
  return items.join('\n');
}

function preformatted(node: HtmlElement, context: RenderContext): string {
  const code = stripInvisible(textOf(node)).replace(/^\n+|\s+$/g, '');
  if (!code) return '';
  let text = code;
  if (context.markdown) {
    const codeChild = node.children.find(
      (child): child is HtmlElement => child.type === 'element' && child.tag === 'code'
    );
    const classes = `${node.attributes.class ?? ''} ${codeChild?.attributes.class ?? ''}`;
    const language = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(classes)?.[1] ?? '';
    const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = '`'.repeat(longest + 1);
    text = `${fence}${language}\n${code}\n${fence}`;
  }
  context.blocks.push(text);
  return `${BLOCK_MARK}${context.blocks.length - 1}${BLOCK_MARK}`;
}

/** The rows of a table, not those of the tables nested in it. */
function tableRows(table: HtmlElement): HtmlElement[] {
  const rows: HtmlElement[] = [];
  const visit = (node: HtmlElement) => {
    for (const child of node.children) {
      if (child.type !== 'element' || child.tag === 'table') continue;
      if (child.tag === 'tr') rows.push(child);
      else visit(child);
    }
  };
  visit(table);
  return rows;
}

function cellsOf(row: HtmlElement): HtmlElement[] {
  return row.children.filter(
    (child): child is HtmlElement =>
      child.type === 'element' && (child.tag === 'td' || child.tag === 'th')
  );
}

/** A table used to lay a page out, not to hold data: its cells hold blocks. */
function isLayoutTable(table: HtmlElement, rows: HtmlElement[]): boolean {
  for (const element of descendants(table)) {
    if (
      ['table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'blockquote'].includes(
        element.tag
      )
    ) {
      return true;
    }
  }
  return rows.every((row) => cellsOf(row).length <= 1) && textLength(table) > 200;
}

function renderTable(table: HtmlElement, context: RenderContext): string {
  const rows = tableRows(table);
  if (isLayoutTable(table, rows)) {
    return rows
      .flatMap((row) => cellsOf(row).map((cell) => block(renderChildren(cell, context))))
      .join('');
  }
  const grid = rows
    .map((row) =>
      cellsOf(row).map((cell) => {
        const text = inline(cell, context);
        return context.markdown ? text.replace(/\|/g, '\\|') : text;
      })
    )
    .filter((cells) => cells.some((cell) => cell !== ''));
  if (grid.length === 0) return '';
  const caption = table.children.find(
    (child): child is HtmlElement => child.type === 'element' && child.tag === 'caption'
  );
  const title = caption ? inline(caption, context) : '';
  if (!context.markdown) {
    return [title, ...grid.map((cells) => cells.join(' | '))].filter(Boolean).join('\n');
  }
  const width = Math.max(...grid.map((cells) => cells.length));
  const line = (cells: string[]) =>
    `| ${[...cells, ...Array<string>(width - cells.length).fill('')].join(' | ')} |`;
  const [head = [], ...body] = grid;
  const lines = [
    line(head),
    `| ${Array<string>(width).fill('---').join(' | ')} |`,
    ...body.map(line),
  ];
  return `${title ? `${title}\n\n` : ''}${lines.join('\n')}`;
}
