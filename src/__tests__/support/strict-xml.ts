/** An element of a parsed XML document. */
export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * A strict parser for the XML the JUnit export writes (a declaration, elements, attributes,
 * text, the five predefined entities and numeric references). It throws where a conforming
 * XML 1.0 parser would: a character outside `Char` (control characters, U+FFFE, U+FFFF,
 * unpaired surrogates), an unescaped `<` or `&`, an unknown entity, mismatched tags, a
 * duplicated attribute, text outside the root element.
 */
export function parseStrictXml(xml: string): XmlElement {
  checkCharacters(xml);
  let position = 0;

  const fail = (message: string): never => {
    throw new Error(`${message} at offset ${position}`);
  };
  const skipSpace = () => {
    while (/\s/.test(xml[position] ?? '')) position++;
  };
  const decode = (raw: string): string =>
    raw.replace(/&([^;]*);/g, (_, entity: string) => {
      if (entity.startsWith('#x'))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      const value = ENTITIES[entity];
      if (value === undefined) fail(`unknown entity &${entity};`);
      return value as string;
    });
  const checkText = (raw: string) => {
    if (raw.includes('<')) fail('unescaped "<"');
    if (/&(?![A-Za-z]+;|#[0-9]+;|#x[0-9A-Fa-f]+;)/.test(raw)) fail('unescaped "&"');
  };

  const element = (): XmlElement => {
    if (xml[position] !== '<') fail('expected "<"');
    position++;
    const name = NAME.exec(xml.slice(position))?.[0] ?? fail('expected an element name');
    position += name.length;
    const attributes: Record<string, string> = {};
    for (;;) {
      skipSpace();
      if (xml.startsWith('/>', position)) {
        position += 2;
        return { name, attributes, children: [], text: '' };
      }
      if (xml[position] === '>') {
        position++;
        break;
      }
      const attribute = NAME.exec(xml.slice(position))?.[0] ?? fail('expected an attribute');
      position += attribute.length;
      if (xml[position] !== '=' || xml[position + 1] !== '"') fail('expected ="');
      position += 2;
      const end = xml.indexOf('"', position);
      if (end < 0) fail('unterminated attribute');
      const raw = xml.slice(position, end);
      checkText(raw);
      if (attribute in attributes) fail(`duplicated attribute ${attribute}`);
      attributes[attribute] = decode(raw);
      position = end + 1;
    }
    const children: XmlElement[] = [];
    let text = '';
    for (;;) {
      if (xml.startsWith('</', position)) {
        position += 2;
        const closing = NAME.exec(xml.slice(position))?.[0];
        if (closing !== name) fail(`</${closing}> closes <${name}>`);
        position += name.length;
        skipSpace();
        if (xml[position] !== '>') fail('expected ">"');
        position++;
        return { name, attributes, children, text };
      }
      if (xml[position] === '<') {
        children.push(element());
        continue;
      }
      const next = xml.indexOf('<', position);
      if (next < 0) fail(`unclosed <${name}>`);
      const raw = xml.slice(position, next);
      checkText(raw);
      text += decode(raw);
      position = next;
    }
  };

  if (xml.startsWith('<?xml')) {
    const end = xml.indexOf('?>');
    if (end < 0) fail('unterminated declaration');
    position = end + 2;
  }
  skipSpace();
  const root = element();
  skipSpace();
  if (position !== xml.length) fail('content after the root element');
  return root;
}

/** Every element named `name` in the tree, depth first. */
export function elementsNamed(root: XmlElement, name: string): XmlElement[] {
  return [
    ...(root.name === name ? [root] : []),
    ...root.children.flatMap((child) => elementsNamed(child, name)),
  ];
}

function checkCharacters(xml: string): void {
  for (let index = 0; index < xml.length; index++) {
    const code = xml.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = xml.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`unpaired surrogate at offset ${index}`);
      }
      index++;
      continue;
    }
    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code < 0xdc00) ||
      (code > 0xdfff && code < 0xfffe);
    if (!allowed) {
      throw new Error(`character U+${code.toString(16).padStart(4, '0')} at offset ${index}`);
    }
  }
}
