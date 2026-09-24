/**
 * Checks that every translation of the documentation matches the English source, so a
 * reader never lands on a missing page, a broken link or code that differs from English.
 *
 *   npx tsx docs/.vitepress/check-translations.ts          every language
 *   npx tsx docs/.vitepress/check-translations.ts fr de    only these languages
 *
 * For each page: the file exists; code blocks are identical (diagrams excepted, which must
 * stay valid Mermaid); headings keep the English anchor with `{#id}`; links, tables and
 * callout boxes are the same; the text is actually translated. Interface texts: every key
 * of `i18n/en.ts` exists and most of them are translated.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { text as english } from './i18n/en';
import { LANGUAGES } from './i18n/structure';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..');
const codes = LANGUAGES.map((language) => language.code) as readonly string[];

function markdownFiles(folder: string, root = folder): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name.startsWith('.') || name === 'public' || (folder === docs && codes.includes(name))) return [];
    if (statSync(path).isDirectory()) return markdownFiles(path, root);
    return name.endsWith('.md') ? [relative(root, path)] : [];
  });
}

interface Page {
  frontMatterLinks: string[];
  code: Array<{ info: string; body: string }>;
  headings: Array<{ level: number; text: string; id?: string }>;
  links: string[];
  tableLines: number;
  containers: string[];
  prose: string[];
}

function parse(source: string): Page {
  const page: Page = { frontMatterLinks: [], code: [], headings: [], links: [], tableLines: 0, containers: [], prose: [] };
  let text = source;
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (front?.[1]) {
    page.frontMatterLinks = [...front[1].matchAll(/^\s*link:\s*(\S+)\s*$/gm)].map((match) => match[1] ?? '');
    text = source.slice(front[0].length);
  }
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[2] ?? '```';
      const body: string[] = [];
      index++;
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith(marker)) {
        body.push(lines[index] ?? '');
        index++;
      }
      page.code.push({ info: (fence[3] ?? '').trim(), body: body.join('\n') });
      continue;
    }
    const heading = /^(#{2,4})\s+(.*?)\s*(?:\{#([^}]+)\})?\s*$/.exec(line);
    if (heading) {
      page.headings.push({ level: heading[1]?.length ?? 0, text: heading[2] ?? '', ...(heading[3] ? { id: heading[3] } : {}) });
      continue;
    }
    if (/^\s*\|/.test(line)) page.tableLines++;
    const container = /^:::\s*(\w+)?/.exec(line);
    if (container) page.containers.push(container[1] ?? 'end');
    for (const match of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) page.links.push(match[1] ?? '');
    for (const match of line.matchAll(/\b(?:src|href)="([^"]+)"/g)) page.links.push(match[1] ?? '');
    const prose = line.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']').trim();
    if (prose.length > 20 && !/^[|<!:#-]/.test(prose)) page.prose.push(prose);
  }
  return page;
}

/** The anchor VitePress gives a heading (same rules as its `slugify`). */
function slugify(heading: string): string {
  const plain = heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*]/g, '');
  return plain
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

function anchors(page: Page): string[] {
  const seen = new Map<string, number>();
  return page.headings.map((heading) => {
    const base = heading.id ?? slugify(heading.text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  });
}

const mermaid = (await import('mermaid/dist/mermaid.core.mjs')).default;

/** Mermaid needs a browser to render; in Node, only a syntax error means the diagram is broken. */
async function mermaidError(diagram: string): Promise<string | undefined> {
  try {
    await mermaid.parse(diagram);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /parse error|lexical error|syntax error|no diagram type|expecting/i.test(message) ? message.split('\n')[0] : undefined;
  }
}

function localLink(link: string, code: string): string {
  return link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/images/') && !link.startsWith('/logo')
    ? `/${code}${link}`
    : link;
}

function sameMultiset(left: string[], right: string[]): string[] {
  const counts = new Map<string, number>();
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of right) counts.set(item, (counts.get(item) ?? 0) - 1);
  return [...counts.entries()].filter(([, count]) => count !== 0).map(([item, count]) => `${count > 0 ? 'missing' : 'extra'} ${item}`);
}

function flatten(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => flatten(entry, prefix ? `${prefix}.${key}` : key));
  }
  return [];
}

const requested = process.argv.slice(2);
const languages = requested.length > 0 ? requested : [...codes];
const problems: string[] = [];
const sources = markdownFiles(docs);

for (const code of languages) {
  if (!codes.includes(code)) {
    problems.push(`${code}: unknown language (see i18n/structure.ts)`);
    continue;
  }
  const folder = join(docs, code);
  const translated = existsSync(folder) ? markdownFiles(folder) : [];
  for (const file of sources.filter((path) => !translated.includes(path))) problems.push(`${code}: missing ${code}/${file}`);
  for (const file of translated.filter((path) => !sources.includes(path))) problems.push(`${code}: ${code}/${file} has no English source`);

  for (const file of sources.filter((path) => translated.includes(path))) {
    const where = `${code}/${file}`;
    const source = parse(readFileSync(join(docs, file), 'utf8'));
    const target = parse(readFileSync(join(folder, file), 'utf8'));

    const expectedFront = source.frontMatterLinks.map((link) => localLink(link, code));
    if (expectedFront.join('\n') !== target.frontMatterLinks.join('\n')) {
      problems.push(`${where}: front matter links should be ${JSON.stringify(expectedFront)}`);
    }

    if (source.code.length !== target.code.length) {
      problems.push(`${where}: ${target.code.length} code blocks, English has ${source.code.length}`);
    } else {
      for (const [index, block] of source.code.entries()) {
        const other = target.code[index];
        if (!other || other.info !== block.info) {
          problems.push(`${where}: code block ${index + 1} should be \`\`\`${block.info}`);
        } else if (block.info === 'mermaid') {
          const error = await mermaidError(other.body);
          if (error) problems.push(`${where}: diagram ${index + 1} is not valid Mermaid: ${error}`);
        } else if (block.body !== other.body) {
          problems.push(`${where}: code block ${index + 1} differs from English (code stays identical)`);
        }
      }
    }

    const expected = anchors(source);
    if (expected.length !== target.headings.length) {
      problems.push(`${where}: ${target.headings.length} headings, English has ${expected.length}`);
    } else {
      target.headings.forEach((heading, index) => {
        const english = source.headings[index];
        if (english && heading.level !== english.level) problems.push(`${where}: heading ${index + 1} should be level ${english.level}`);
        if (heading.id !== expected[index]) problems.push(`${where}: heading "${heading.text}" needs {#${expected[index]}}`);
      });
    }

    for (const difference of sameMultiset(source.links.map((link) => localLink(link, code)), target.links)) {
      problems.push(`${where}: link ${difference}`);
    }
    for (const link of target.links) {
      const relativeTarget = /^\.{1,2}\/([^#]*)/.exec(link)?.[0].split('#')[0];
      if (relativeTarget && !/\.(svg|png|jpe?g)$/.test(relativeTarget)) {
        const resolved = join(dirname(join(folder, file)), relativeTarget);
        if (!existsSync(`${resolved}.md`) && !existsSync(join(resolved, 'index.md'))) problems.push(`${where}: dead link ${link}`);
      }
    }
    if (source.tableLines !== target.tableLines) problems.push(`${where}: ${target.tableLines} table lines, English has ${source.tableLines}`);
    if (source.containers.join(',') !== target.containers.join(',')) problems.push(`${where}: callout boxes differ (${target.containers.join(',')})`);

    const englishProse = new Set(source.prose);
    const unchanged = target.prose.filter((line) => englishProse.has(line)).length;
    if (target.prose.length > 0 && unchanged / target.prose.length > 0.2) {
      problems.push(`${where}: ${unchanged} of ${target.prose.length} text lines are still in English`);
    }
  }

  const module = (await import(`./i18n/${code}.ts`)) as { text?: unknown };
  const englishTexts = flatten(english);
  const texts = new Map(flatten(module.text));
  let same = 0;
  for (const [key, value] of englishTexts) {
    const translation = texts.get(key);
    if (translation === undefined || translation.trim() === '') problems.push(`${code}: interface text "${key}" is missing`);
    else if (translation === value) same++;
  }
  if (same / englishTexts.length > 0.3) problems.push(`${code}: ${same} of ${englishTexts.length} interface texts are still in English (i18n/${code}.ts)`);
}

for (const file of sources) {
  const page = parse(readFileSync(join(docs, file), 'utf8'));
  for (const [index, block] of page.code.entries()) {
    if (block.info !== 'mermaid') continue;
    const error = await mermaidError(block.body);
    if (error) problems.push(`${file}: English diagram ${index + 1} is not valid Mermaid: ${error}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`Translations match the English source (${languages.join(', ')}; ${sources.length} pages each).`);
