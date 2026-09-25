/** The named character references met in real pages; others stay as written. */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  shy: '\u00ad',
  zwnj: '\u200c',
  zwj: '\u200d',
  lrm: '\u200e',
  rlm: '\u200f',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  minus: '−',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  bull: '•',
  middot: '·',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  prime: '′',
  Prime: '″',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  curren: '¤',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  micro: 'µ',
  para: '¶',
  sect: '§',
  iexcl: '¡',
  iquest: '¿',
  ordf: 'ª',
  ordm: 'º',
  not: '¬',
  macr: '¯',
  acute: '´',
  cedil: '¸',
  uml: '¨',
  brvbar: '¦',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  rArr: '⇒',
  lArr: '⇐',
  hArr: '⇔',
  le: '≤',
  ge: '≥',
  ne: '≠',
  asymp: '≈',
  equiv: '≡',
  infin: '∞',
  sum: '∑',
  prod: '∏',
  radic: '√',
  part: '∂',
  nabla: '∇',
  isin: '∈',
  notin: '∉',
  cap: '∩',
  cup: '∪',
  sub: '⊂',
  sup: '⊃',
  and: '∧',
  or: '∨',
  forall: '∀',
  exist: '∃',
  empty: '∅',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Sigma: 'Σ',
  Omega: 'Ω',
  hearts: '♥',
  check: '✓',
  star: '☆',
  OElig: 'Œ',
  oelig: 'œ',
  Scaron: 'Š',
  scaron: 'š',
  Yuml: 'Ÿ',
  fnof: 'ƒ',
  circ: 'ˆ',
  tilde: '˜',
};

/** Latin-1 letters (U+00C0–U+00FF), by name. */
const LATIN1 = [
  'Agrave',
  'Aacute',
  'Acirc',
  'Atilde',
  'Auml',
  'Aring',
  'AElig',
  'Ccedil',
  'Egrave',
  'Eacute',
  'Ecirc',
  'Euml',
  'Igrave',
  'Iacute',
  'Icirc',
  'Iuml',
  'ETH',
  'Ntilde',
  'Ograve',
  'Oacute',
  'Ocirc',
  'Otilde',
  'Ouml',
  '',
  'Oslash',
  'Ugrave',
  'Uacute',
  'Ucirc',
  'Uuml',
  'Yacute',
  'THORN',
  'szlig',
  'agrave',
  'aacute',
  'acirc',
  'atilde',
  'auml',
  'aring',
  'aelig',
  'ccedil',
  'egrave',
  'eacute',
  'ecirc',
  'euml',
  'igrave',
  'iacute',
  'icirc',
  'iuml',
  'eth',
  'ntilde',
  'ograve',
  'oacute',
  'ocirc',
  'otilde',
  'ouml',
  '',
  'oslash',
  'ugrave',
  'uacute',
  'ucirc',
  'uuml',
  'yacute',
  'thorn',
  'yuml',
];
LATIN1.forEach((name, index) => {
  if (name) NAMED[name] = String.fromCodePoint(0xc0 + index);
});

/** Code points HTML maps from Windows-1252 when written as `&#128;`–`&#159;`. */
const WINDOWS_1252: Record<number, number> = {
  128: 0x20ac,
  130: 0x201a,
  131: 0x0192,
  132: 0x201e,
  133: 0x2026,
  134: 0x2020,
  135: 0x2021,
  136: 0x02c6,
  137: 0x2030,
  138: 0x0160,
  139: 0x2039,
  140: 0x0152,
  142: 0x017d,
  145: 0x2018,
  146: 0x2019,
  147: 0x201c,
  148: 0x201d,
  149: 0x2022,
  150: 0x2013,
  151: 0x2014,
  152: 0x02dc,
  153: 0x2122,
  154: 0x0161,
  155: 0x203a,
  156: 0x0153,
  158: 0x017e,
  159: 0x0178,
};

/** Decodes character references: `&amp;`, `&eacute;`, `&#233;`, `&#xE9;`. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,31});?/g,
    (whole, ref: string) => {
      if (ref.startsWith('#')) {
        const hex = ref[1] === 'x' || ref[1] === 'X';
        let code = Number.parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
        code = WINDOWS_1252[code] ?? code;
        if (
          !Number.isFinite(code) ||
          code === 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        ) {
          return '�';
        }
        return String.fromCodePoint(code);
      }
      const named = NAMED[ref];
      // A name without its `;` is decoded only for the legacy ones HTML allows so (`&amp`, `&nbsp`).
      if (named !== undefined && (whole.endsWith(';') || ref.length <= 6)) return named;
      return whole;
    }
  );
}

/**
 * Invisible characters that can hide text from a reader but not from a model: zero-width
 * spaces and joiners, bidirectional controls, the BOM, soft hyphens, and C0/C1 controls other
 * than tab and line feed.
 */
const INVISIBLE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes.
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/g;

/** Removes the invisible characters that could smuggle text past a human reader. */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, '');
}

/** HTML fragment (a search snippet) to one line of plain text. */
export function htmlToLine(html: string): string {
  // Inline tags join the letters around them (`<b>immutable</b>s`); other tags separate words.
  const text = html
    .replace(/<\/?(?:a|b|i|em|strong|span|mark|u|code|sup|sub|small|abbr)\b[^>]*>/gi, '')
    .replace(/<[^>]*>/g, ' ');
  return stripInvisible(decodeEntities(text)).replace(/\s+/g, ' ').trim();
}
