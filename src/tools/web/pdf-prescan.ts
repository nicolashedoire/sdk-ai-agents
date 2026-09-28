/** What `prescanPdf` needs of `node:zlib` (passed in: the function runs in the PDF worker). */
export interface PrescanZlib {
  inflateRawSync(
    data: Uint8Array,
    options: { maxOutputLength: number; finishFlush: number }
  ): Uint8Array;
  brotliDecompressSync(data: Uint8Array, options: { maxOutputLength: number }): Uint8Array;
  constants: { Z_SYNC_FLUSH: number };
}

/**
 * What `prescanPdf` needs of `node:crypto` to measure an encrypted PDF (passed in, like zlib):
 * MD5 and SHA-2, and AES in CBC mode. RC4, which OpenSSL 3 no longer offers, is its own.
 */
export interface PrescanCrypto {
  createHash(algorithm: string): { update(data: Uint8Array): unknown; digest(): Uint8Array };
  createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): PrescanCipher;
  createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): PrescanCipher;
}

export interface PrescanCipher {
  setAutoPadding(autoPadding: boolean): unknown;
  update(data: Uint8Array): Uint8Array;
  final(): Uint8Array;
}

export type PrescanVerdict =
  | { ok: true; decodedBytes: number; streams: number; encrypted: boolean }
  | { ok: false; reason: string; kind: 'too-large' | 'unreadable' };

/** A PDF object as the pre-scan reads it: pdf.js's, strings as latin1 text. */
type PdfValue =
  | { k: 'num'; v: number }
  | { k: 'name'; v: string }
  | { k: 'str'; v: string }
  | { k: 'arr'; v: PdfValue[] }
  | { k: 'dict'; v: Record<string, PdfValue> }
  | { k: 'ref'; key: string }
  /** `true`, `false`, `null`, or any other keyword pdf.js keeps as a value. */
  | { k: 'kw'; v: string };

/** A token of pdf.js's lexer. */
type Token =
  | { t: 'eof' }
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'name'; v: string }
  | { t: 'cmd'; v: string };

/**
 * Measures, before pdf.js sees a PDF, how much its streams inflate to, and refuses it past
 * `maxDecodedBytes` in all. Fail closed: what it cannot read, it refuses.
 *
 * - It reads objects with pdf.js's own lexer and parser, token for token: whitespace and
 *   comments anywhere between tokens, numbers of any length, strings, names with `#xx`
 *   escapes, a dictionary key that is not a name skipped. So a stream pdf.js can read is read
 *   here, and a stream dictionary pdf.js cannot read is not read by pdf.js either.
 * - pdf.js reads an object wherever the cross-reference points at `N G obj`: every `obj` token
 *   of the file starts an object here, even inside another object's data. A stream anywhere but
 *   at the top of an object, and an inline image (`BI`) in an object, are refused: pdf.js would
 *   read them, and no real PDF has them.
 * - Filters are read as pdf.js reads them: `/F` or `/Filter`, `/DP` or `/DecodeParms`,
 *   references resolved (in object streams too). A filter or a length that cannot be resolved
 *   refuses the PDF.
 * - A stream's data starts after the line that follows `stream`, as in pdf.js, and runs for
 *   its declared `/Length` or to the first `endstream`, whichever is longer.
 * - Every filter of a chain is applied in order: FlateDecode (zlib, raw, with
 *   `maxOutputLength`, a header pdf.js would refuse meaning no data), BrotliDecode,
 *   LZWDecode and RunLengthDecode (bounded the same way), the PNG and TIFF predictors (a row of
 *   `/Columns` is written even when the data runs short), ASCIIHexDecode and ASCII85Decode
 *   (which do not expand). The output of every expanding stage counts. An image filter (DCT,
 *   JPX, JBIG2, CCITTFax) is allowed only last, on an image; any other filter, or damaged
 *   compressed data, refuses the PDF.
 * - Every stream whose `/N` and `/First` are integers is read as an object stream, as pdf.js
 *   accepts any: an object it holds that is a stream is refused.
 * - An encrypted PDF is decrypted as pdf.js decrypts it: the standard security handler with an
 *   empty user password (RC4, AES-128, AES-256 of revisions 2 to 6, crypt filters). Its
 *   streams are then measured like any. One protected by a password, or by another handler,
 *   is refused: pdf.js cannot open it either. The object number that keys a stream's
 *   decryption is read from its `N G obj`; since the cross-reference may point inside that
 *   number (at `23 0 obj` in `123 0 obj`), the stream is also measured under every such
 *   shorter number, where damaged data counts for what inflates before the damage.
 *
 * Self-contained, without imports or outside names: the PDF worker runs its source text.
 */
export function prescanPdf(
  bytes: Uint8Array,
  zlib: PrescanZlib,
  maxDecodedBytes: number,
  crypto?: PrescanCrypto
): PrescanVerdict {
  class Refusal extends Error {
    constructor(
      message: string,
      readonly kind: 'too-large' | 'unreadable'
    ) {
      super(message);
    }
  }
  /** Thrown where pdf.js's lexer or parser throws: pdf.js reads nothing there either. */
  class Unparsable extends Error {}
  /** The padding of passwords in the standard security handler (ISO 32000-1, algorithm 2). */
  const PADDING = new Uint8Array([
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
    0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
  ]);

  const latin1 = (data: Uint8Array) =>
    Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('latin1');
  const text = latin1(bytes);
  const unreadable = (why: string): never => {
    throw new Refusal(why, 'unreadable');
  };
  const tooMuch = (): never => {
    throw new Refusal(
      `its streams inflate to more than ${Math.round(maxDecodedBytes / 1_048_576)} MB`,
      'too-large'
    );
  };
  // The reading's work is bounded: a file built to make it slow is refused, not endured.
  let work = 0;
  const workLimit = text.length * 32 + 20_000_000;
  const spend = (amount = 1) => {
    work += amount;
    if (work > workLimit) unreadable('its structure is too complex to measure');
  };

  // pdf.js's character classes: 1 for whitespace, 2 for delimiters.
  const SPECIAL = new Uint8Array(256);
  for (const code of [0, 9, 10, 12, 13, 32]) SPECIAL[code] = 1;
  for (const char of '()<>[]{}/%') SPECIAL[char.charCodeAt(0)] = 2;
  const EOF: Token = { t: 'eof' };

  /** pdf.js's Lexer on src[from, end): one token at a time. */
  const lexer = (src: string, from: number, end: number) => {
    let pos = from;
    const code = (index: number) => (index < end ? src.charCodeAt(index) : -1);
    const hexDigit = (c: number) => {
      if (c >= 48 && c <= 57) return c - 48;
      const lower = c | 32;
      return lower >= 97 && lower <= 102 ? lower - 87 : -1;
    };
    const number = (): Token => {
      let c = code(pos);
      let sign = 1;
      let divideBy = 0;
      if (c === 45) {
        sign = -1;
        c = code(++pos);
        // pdf.js reads "--" as "-".
        if (c === 45) c = code(++pos);
      } else if (c === 43) c = code(++pos);
      while (c === 10 || c === 13) c = code(++pos);
      if (c === 46) {
        divideBy = 10;
        c = code(++pos);
      }
      if (c < 48 || c > 57) {
        // A lone sign or point before a space, `(`, `<` or the end: pdf.js reads 0.
        if (c === 32 || c === 9 || c === 13 || c === 10 || c === 40 || c === 60 || c === -1) {
          return { t: 'num', v: 0 };
        }
        throw new Unparsable('a number cannot be read');
      }
      let value = c - 48;
      for (;;) {
        spend();
        c = code(++pos);
        if (c < 0) break;
        if (c >= 48 && c <= 57) {
          if (divideBy !== 0) divideBy *= 10;
          value = value * 10 + (c - 48);
        } else if (c === 46) {
          if (divideBy === 0) divideBy = 1;
          else break;
          // A minus sign inside a number is skipped.
        } else if (c !== 45) break;
      }
      if (divideBy !== 0) value /= divideBy;
      return { t: 'num', v: sign * value };
    };
    const literal = (): Token => {
      const out: string[] = [];
      let depth = 1;
      let c = code(++pos);
      for (;;) {
        spend();
        let pending = false;
        if (c < 0) break;
        if (c === 40) {
          depth++;
          out.push('(');
        } else if (c === 41) {
          if (--depth === 0) {
            pos++;
            break;
          }
          out.push(')');
        } else if (c === 92) {
          c = code(++pos);
          if (c < 0) break;
          if (c === 110) out.push('\n');
          else if (c === 114) out.push('\r');
          else if (c === 116) out.push('\t');
          else if (c === 98) out.push('\b');
          else if (c === 102) out.push('\f');
          else if (c >= 48 && c <= 55) {
            let octal = c & 15;
            c = code(++pos);
            pending = true;
            if (c >= 48 && c <= 55) {
              octal = (octal << 3) + (c & 15);
              c = code(++pos);
              if (c >= 48 && c <= 55) {
                pending = false;
                octal = (octal << 3) + (c & 15);
              }
            }
            out.push(String.fromCharCode(octal & 255));
          } else if (c === 13) {
            if (code(pos + 1) === 10) pos++;
          } else if (c !== 10) out.push(String.fromCharCode(c));
        } else out.push(String.fromCharCode(c));
        if (!pending) c = code(++pos);
      }
      return { t: 'str', v: out.join('') };
    };
    const hex = (): Token => {
      const out: string[] = [];
      let first = -1;
      let c = code(pos);
      for (;;) {
        spend();
        if (c < 0) break;
        if (c === 62) {
          pos++;
          break;
        }
        // Whitespace, and any character that is not a hex digit, is skipped.
        const digit = SPECIAL[c] === 1 ? -1 : hexDigit(c);
        if (digit !== -1) {
          if (first === -1) first = digit;
          else {
            out.push(String.fromCharCode((first << 4) | digit));
            first = -1;
          }
        }
        c = code(++pos);
      }
      if (first !== -1) out.push(String.fromCharCode(first << 4));
      return { t: 'str', v: out.join('') };
    };
    const name = (): Token => {
      const out: string[] = [];
      for (;;) {
        spend();
        const c = code(++pos);
        if (c < 0 || SPECIAL[c]) break;
        if (c !== 35) {
          out.push(String.fromCharCode(c));
          continue;
        }
        const high = code(++pos);
        if (high >= 0 && SPECIAL[high]) {
          out.push('#');
          break;
        }
        const first = hexDigit(high);
        if (first === -1) {
          out.push('#', String.fromCharCode(high));
          continue;
        }
        const low = code(++pos);
        const second = hexDigit(low);
        if (second === -1) {
          out.push('#', String.fromCharCode(high));
          if (low < 0 || SPECIAL[low]) break;
          out.push(String.fromCharCode(low));
          continue;
        }
        out.push(String.fromCharCode((first << 4) | second));
      }
      return { t: 'name', v: out.join('') };
    };
    const next = (): Token => {
      let comment = false;
      let c = code(pos);
      for (;;) {
        if (c < 0) return EOF;
        if (comment) {
          if (c === 10 || c === 13) comment = false;
        } else if (c === 37) comment = true;
        else if (SPECIAL[c] !== 1) break;
        spend();
        c = code(++pos);
      }
      if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) return number();
      switch (c) {
        case 40:
          return literal();
        case 47:
          return name();
        case 91:
        case 93:
        case 123:
        case 125:
          pos++;
          return { t: 'cmd', v: String.fromCharCode(c) };
        case 60:
          pos++;
          if (code(pos) === 60) {
            pos++;
            return { t: 'cmd', v: '<<' };
          }
          return hex();
        case 62:
          pos++;
          if (code(pos) === 62) {
            pos++;
            return { t: 'cmd', v: '>>' };
          }
          return { t: 'cmd', v: '>' };
        case 41:
          throw new Unparsable('a ")" outside a string');
      }
      let word = String.fromCharCode(c);
      // A byte outside ASCII before an ASCII character is a keyword of its own.
      if (c < 32 || c > 127) {
        const following = code(pos + 1);
        if (following >= 32 && following <= 127) {
          pos++;
          return { t: 'cmd', v: word };
        }
      }
      for (;;) {
        const following = code(++pos);
        if (following < 0 || SPECIAL[following]) break;
        if (word.length === 128) throw new Unparsable('a keyword is too long');
        spend();
        word += String.fromCharCode(following);
      }
      return { t: 'cmd', v: word };
    };
    return { next, position: () => pos };
  };

  const isCmd = (token: Token, word: string) => token.t === 'cmd' && token.v === word;

  /**
   * pdf.js's Parser.getObj on src[from, end), as many times as values are wanted. A dictionary
   * followed by `stream` is a stream: at the top of a value its data follows (`stream()` says
   * where), and pdf.js reads nothing more of that object; inside another value it is refused,
   * as is an inline image (`BI`).
   */
  const parser = (src: string, from: number, end: number) => {
    const lex = lexer(src, from, end);
    let buf1 = lex.next();
    let buf2 = lex.next();
    // After `ID` (inline image data), pdf.js reads a null before the next token.
    const shift = () => {
      buf1 = buf2;
      buf2 = isCmd(buf1, 'ID') ? { t: 'cmd', v: 'null' } : lex.next();
    };
    let found: { dictionary: Record<string, PdfValue>; keywordEnd: number } | undefined;
    const getObj = (depth: number): PdfValue => {
      if (depth > 256) unreadable('its objects are nested too deeply');
      spend();
      const token = buf1;
      shift();
      if (token.t === 'num') {
        if (
          Number.isInteger(token.v) &&
          buf1.t === 'num' &&
          Number.isInteger(buf1.v) &&
          isCmd(buf2, 'R')
        ) {
          const key = `${token.v} ${buf1.v}`;
          shift();
          shift();
          return { k: 'ref', key };
        }
        return { k: 'num', v: token.v };
      }
      if (token.t === 'str') return { k: 'str', v: token.v };
      if (token.t === 'name') return { k: 'name', v: token.v };
      if (token.t === 'eof') return { k: 'kw', v: 'null' };
      if (token.v === 'BI') unreadable('an object holds an inline image, which pdf.js would read');
      if (token.v === '[') {
        const items: PdfValue[] = [];
        while (!isCmd(buf1, ']') && buf1.t !== 'eof') items.push(getObj(depth + 1));
        if (buf1.t === 'eof') throw new Unparsable('it ends inside an array');
        shift();
        return { k: 'arr', v: items };
      }
      if (token.v === '<<') {
        const entries: Record<string, PdfValue> = Object.create(null);
        while (!isCmd(buf1, '>>') && buf1.t !== 'eof') {
          // pdf.js skips a key that is not a name.
          if (buf1.t !== 'name') {
            shift();
            continue;
          }
          const key = buf1.v;
          shift();
          if ((buf1 as Token).t === 'eof') break;
          entries[key] = getObj(depth + 1);
        }
        if (buf1.t === 'eof') throw new Unparsable('it ends inside a dictionary');
        if (isCmd(buf2, 'stream')) {
          if (depth > 0)
            unreadable('a stream is inside another object, where pdf.js would read it');
          found = { dictionary: entries, keywordEnd: lex.position() };
          return { k: 'dict', v: entries };
        }
        shift();
        return { k: 'dict', v: entries };
      }
      return { k: 'kw', v: token.v };
    };
    return { getObj: () => getObj(0), stream: () => found };
  };

  /** The one value that starts at `from`, or undefined where pdf.js reads nothing. */
  const valueAt = (src: string, from: number, end: number) => {
    try {
      const reader = parser(src, from, end);
      const value = reader.getObj();
      return { value, stream: reader.stream() };
    } catch (error) {
      if (error instanceof Unparsable) return undefined;
      throw error;
    }
  };

  /** A non-negative integer written as exactly one number token, as pdf.js reads it. */
  const integerOf = (run: string): number | undefined => {
    try {
      const lex = lexer(run, 0, run.length);
      const token = lex.next();
      if (token.t !== 'num' || lex.position() !== run.length) return undefined;
      return Number.isInteger(token.v) && token.v >= 0 ? token.v : undefined;
    } catch (error) {
      if (error instanceof Unparsable) return undefined;
      throw error;
    }
  };

  /** Every definition of each object, `N G` → values. */
  const objects = new Map<string, PdfValue[]>();
  const define = (key: string, value: PdfValue) => {
    const known = objects.get(key);
    if (known) known.push(value);
    else objects.set(key, [value]);
  };
  /** The numbers of an object's `N G obj`: its own, and those of the shorter numbers in it. */
  interface Header {
    primary?: number;
    alternatives: number[];
    gen: number;
  }
  interface StreamRecord {
    dictionary: Record<string, PdfValue>;
    start: number;
    fallbackEnd: number;
    header?: Header;
  }
  const streams: StreamRecord[] = [];

  try {
    // `N G obj`, with whitespace or comments between the tokens: the numbers of each object.
    const SEP = '(?:[\\0\\t\\n\\f\\r ]|%[^\\r\\n]*(?:\\r\\n?|\\n))';
    const headerPattern = new RegExp(
      `(?<![0-9+\\-.])([0-9+\\-.]+)${SEP}+([0-9+\\-.]+)${SEP}*obj`,
      'g'
    );
    const headers = new Map<number, Header>();
    for (let match = headerPattern.exec(text); match; match = headerPattern.exec(text)) {
      spend(match[0].length);
      const gen = integerOf(match[2] ?? '');
      if (gen === undefined) continue;
      const run = match[1] ?? '';
      const primary = integerOf(run);
      const shorter = new Set<number>();
      for (let index = 1; index < run.length; index++) {
        const value = integerOf(run.slice(index));
        if (value !== undefined && value !== primary) shorter.add(value);
      }
      headers.set(match.index + match[0].length - 3, {
        ...(primary === undefined ? {} : { primary }),
        alternatives: [...shorter],
        gen,
      });
    }

    const boundaryBefore = (at: number) => {
      if (at === 0) return true;
      const c = text.charCodeAt(at - 1);
      // Whitespace, a delimiter, the end of a number, or a byte outside ASCII.
      return (
        SPECIAL[c] !== 0 ||
        (c >= 48 && c <= 57) ||
        c === 43 ||
        c === 45 ||
        c === 46 ||
        c < 32 ||
        c > 127
      );
    };
    const boundaryAfter = (at: number) => at >= text.length || SPECIAL[text.charCodeAt(at)] !== 0;

    // Every `obj` token starts an object: nothing is skipped over, so nothing can be hidden by a
    // wrong skip, and no form of `N G obj` pdf.js accepts is missed.
    const objPattern = /obj/g;
    for (let match = objPattern.exec(text); match; match = objPattern.exec(text)) {
      spend();
      const at = match.index;
      if (!boundaryBefore(at) || !boundaryAfter(at + 3)) continue;
      const read = valueAt(text, at + 3, text.length);
      if (!read) continue;
      const header = headers.get(at);
      if (read.stream) {
        // As pdf.js: the data starts after the end of the line that holds `stream`.
        let start = read.stream.keywordEnd;
        while (start < text.length) {
          spend();
          const c = text.charCodeAt(start++);
          if (c === 13) {
            if (text.charCodeAt(start) === 10) start++;
            break;
          }
          if (c === 10) break;
        }
        const found = text.indexOf('endstream', start);
        streams.push({
          dictionary: read.stream.dictionary,
          start,
          fallbackEnd: found === -1 ? text.length : found,
          ...(header ? { header } : {}),
        });
      } else if (header?.primary !== undefined) {
        define(`${header.primary} ${header.gen}`, read.value);
      }
    }

    /** Every value a reference may stand for (all its definitions), or the value itself. */
    const resolve = (value: PdfValue | undefined, hops = 0): PdfValue[] => {
      if (value === undefined) return [];
      if (value.k !== 'ref') return [value];
      if (hops > 8) return [];
      return (objects.get(value.key) ?? []).flatMap((target) => resolve(target, hops + 1));
    };
    const first = (value: PdfValue | undefined) => resolve(value)[0];
    const isName = (value: PdfValue | undefined, name: string) =>
      value?.k === 'name' && value.v === name;
    const isXRef = (stream: StreamRecord) =>
      resolve(stream.dictionary.Type).some((type) => isName(type, 'XRef'));

    // Trailers: after `trailer`, and the dictionaries of cross-reference streams.
    const trailers: Array<{ dictionary: Record<string, PdfValue>; top: boolean }> = [];
    const trailerPattern = /trailer/g;
    for (let match = trailerPattern.exec(text); match; match = trailerPattern.exec(text)) {
      spend();
      if (!boundaryBefore(match.index) || !boundaryAfter(match.index + 7)) continue;
      const read = valueAt(text, match.index + 7, text.length);
      const dictionary =
        read?.stream?.dictionary ?? (read?.value.k === 'dict' ? read.value.v : undefined);
      if (dictionary) trailers.push({ dictionary, top: true });
    }
    for (const stream of streams) {
      // A stream of cross-references pointed at by `/XRefStm` has no `/Root`: never the trailer.
      if (isXRef(stream))
        trailers.push({ dictionary: stream.dictionary, top: stream.dictionary.Root !== undefined });
    }

    const encryptionOf = (
      dictionary: Record<string, PdfValue>,
      fileId: string,
      node: PrescanCrypto
    ) => {
      const get = (name: string) => first(dictionary[name]);
      const numberOf = (value: PdfValue | undefined) => (value?.k === 'num' ? value.v : undefined);
      const bytesOf = (value: PdfValue | undefined) =>
        value?.k === 'str'
          ? Uint8Array.from(value.v, (char) => char.charCodeAt(0) & 255)
          : undefined;
      const concat = (...parts: ArrayLike<number>[]) => {
        const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
        let at = 0;
        for (const part of parts) {
          out.set(part, at);
          at += part.length;
        }
        return out;
      };
      const hash = (algorithm: string, data: Uint8Array) => {
        const digest = node.createHash(algorithm);
        digest.update(data);
        return new Uint8Array(digest.digest());
      };
      const aes = (encrypt: boolean, key: Uint8Array, iv: Uint8Array, data: Uint8Array) => {
        const algorithm = `aes-${key.length * 8}-cbc`;
        const cipher = encrypt
          ? node.createCipheriv(algorithm, key, iv)
          : node.createDecipheriv(algorithm, key, iv);
        cipher.setAutoPadding(false);
        return concat(
          cipher.update(data.subarray(0, data.length - (data.length % 16))),
          cipher.final()
        );
      };
      const same = (a: Uint8Array, b: Uint8Array) =>
        a.length === b.length && a.every((byte, index) => byte === b[index]);

      if (!isName(get('Filter'), 'Standard'))
        return unreadable('it is encrypted by a security handler pdf.js cannot open');
      const algorithm = numberOf(get('V'));
      if (algorithm !== 1 && algorithm !== 2 && algorithm !== 4 && algorithm !== 5) {
        return unreadable('it is encrypted by a method pdf.js cannot open');
      }
      const cf = get('CF');
      const filters = cf?.k === 'dict' ? cf.v : undefined;
      const identity: PdfValue = { k: 'name', v: 'Identity' };
      const stmf = algorithm >= 4 ? (get('StmF') ?? identity) : identity;
      const strf = algorithm >= 4 ? (get('StrF') ?? identity) : identity;
      const eff = algorithm >= 4 ? (get('EFF') ?? stmf) : stmf;
      let length = numberOf(get('Length'));
      if (!length) {
        if (algorithm <= 3) length = 40;
        else if (filters && stmf.k === 'name') {
          const entry = first(filters[stmf.v]);
          length = (entry?.k === 'dict' ? numberOf(first(entry.v.Length)) : undefined) || 128;
          if (length < 40) length <<= 3;
        }
      }
      if (length === undefined || !Number.isInteger(length) || length < 40 || length % 8 !== 0) {
        return unreadable('its encryption key length cannot be read');
      }
      const owner = bytesOf(get('O'));
      const user = bytesOf(get('U'));
      if (!owner || !user) return unreadable('its encryption dictionary cannot be read');
      const revision = numberOf(get('R')) ?? 0;
      const permissions = numberOf(get('P')) ?? 0;
      const metadataFlag = get('EncryptMetadata');
      const encryptMetadata =
        (algorithm === 4 || algorithm === 5) &&
        !(metadataFlag?.k === 'kw' && metadataFlag.v === 'false');

      let key: Uint8Array | null;
      if (algorithm !== 5) {
        // Algorithm 2 with the empty password, then the check of `/U` (algorithms 4 and 5).
        const bytesOfKey = length >> 3;
        const id = Uint8Array.from(fileId, (char) => char.charCodeAt(0) & 255);
        const p = permissions;
        let digest = hash(
          'md5',
          concat(
            PADDING,
            owner.subarray(0, 32),
            [p & 255, (p >> 8) & 255, (p >> 16) & 255, (p >>> 24) & 255],
            id,
            revision >= 4 && !encryptMetadata ? [255, 255, 255, 255] : []
          )
        );
        if (revision >= 3) {
          for (let round = 0; round < 50; round++) {
            const input = new Uint8Array(bytesOfKey);
            input.set(digest.subarray(0, bytesOfKey));
            digest = hash('md5', input);
          }
        }
        const candidate = digest.subarray(0, bytesOfKey);
        let check: Uint8Array;
        if (revision >= 3) {
          check = rc4(candidate, hash('md5', concat(PADDING, id)));
          for (let round = 1; round <= 19; round++) {
            check = rc4(
              candidate.map((byte) => byte ^ round),
              check
            );
          }
        } else check = rc4(candidate, PADDING);
        key = check.every((byte, index) => user[index] === byte) ? candidate : null;
      } else {
        // Revisions 5 and 6 (AES-256): the file key comes out of `/UE`.
        const password = new Uint8Array(0);
        const hashOf = (input: Uint8Array, userBytes: Uint8Array) => {
          if (revision !== 6) return hash('sha256', input);
          // Algorithm 2.B of ISO 32000-2.
          let k = hash('sha256', input).subarray(0, 32);
          let e = new Uint8Array([0]);
          for (let round = 0; round < 64 || (e[e.length - 1] ?? 0) > round - 32; round++) {
            const unit = concat(password, k, userBytes);
            const repeated = new Uint8Array(unit.length * 64);
            for (let copy = 0; copy < 64; copy++) repeated.set(unit, copy * unit.length);
            e = aes(true, k.subarray(0, 16), k.subarray(16, 32), repeated);
            let sum = 0;
            for (let index = 0; index < 16; index++) sum += e[index] ?? 0;
            k = hash(sum % 3 === 0 ? 'sha256' : sum % 3 === 1 ? 'sha384' : 'sha512', e);
          }
          return k.subarray(0, 32);
        };
        const ue = bytesOf(get('UE'));
        if (!ue) return unreadable('its encryption dictionary cannot be read');
        if (
          same(
            hashOf(concat(password, user.subarray(32, 40)), new Uint8Array(0)),
            user.subarray(0, 32)
          )
        ) {
          key = aes(
            false,
            hashOf(concat(password, user.subarray(40, 48)), new Uint8Array(0)),
            new Uint8Array(16),
            ue
          );
        } else key = null;
      }
      if (!key) {
        // pdf.js opens it without a key only when nothing but embedded files is encrypted.
        const embedded = filters && eff.k === 'name' ? first(filters[eff.v]) : undefined;
        const onlyEmbedded =
          algorithm >= 4 &&
          isName(stmf, 'Identity') &&
          isName(strf, 'Identity') &&
          embedded?.k === 'dict' &&
          isName(first(embedded.v.AuthEvent), 'EFOpen');
        if (!onlyEmbedded) return unreadable('it is protected by a password');
      } else if (algorithm === 4 && key.length < 16) {
        const padded = new Uint8Array(16);
        padded.set(key);
        key = padded;
      }
      const fileKey = key;

      const objectKey = (num: number, gen: number, salted: boolean) => {
        const base = fileKey ?? new Uint8Array(0);
        const input = concat(
          base,
          [num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255],
          salted ? [0x73, 0x41, 0x6c, 0x54] : []
        );
        return hash('md5', input).subarray(0, Math.min(base.length + 5, 16));
      };
      const aesStream = (streamKey: Uint8Array, data: Uint8Array) =>
        data.length < 16
          ? new Uint8Array(0)
          : aes(false, streamKey, data.subarray(0, 16), data.subarray(16));

      /**
       * A stream's data decrypted as pdf.js decrypts object `num gen` with the crypt filter
       * `filter`, or 'unread' when pdf.js would need a password to read it.
       */
      const decrypt = (
        data: Uint8Array,
        filter: PdfValue,
        num: number,
        gen: number
      ): Uint8Array | 'unread' => {
        if (algorithm < 4) return rc4(objectKey(num, gen, false), data);
        if (filter.k !== 'name')
          return unreadable('an encrypted stream names a crypt filter that cannot be read');
        if (!filters) return unreadable('its crypt filters cannot be read');
        const entry = first(filters[filter.v]);
        const method = entry?.k === 'dict' ? first(entry.v.CFM) : undefined;
        if (method === undefined || isName(method, 'None')) return data;
        if (!fileKey) return 'unread';
        if (algorithm === 5) return aesStream(fileKey, data);
        const name = method.k === 'name' ? method.v : '';
        if (name === 'V2') return rc4(objectKey(num, gen, false), data);
        if (name === 'AESV2') return aesStream(objectKey(num, gen, true), data);
        if (name === 'AESV3' && fileKey.length === 32) return aesStream(fileKey, data);
        return unreadable(
          `an encrypted stream uses a cipher pdf.js cannot read (/${name.slice(0, 40)})`
        );
      };
      /** The crypt filter of a stream's data: `/EFF` for an embedded file, `/StmF` for others. */
      const streamFilter = (dictionary: Record<string, PdfValue>) =>
        algorithm >= 4 && isName(first(dictionary.Type), 'EmbeddedFile') ? eff : stmf;
      return { decrypt, streamFilter };
    };
    const setUpEncryption = () => {
      const named = trailers.filter((trailer) => trailer.dictionary.Encrypt !== undefined);
      if (named.length === 0) return undefined;
      if (!crypto)
        return unreadable('it is encrypted, and it cannot be decrypted here to be measured');
      const dictionaries = new Map<string, Record<string, PdfValue>>();
      for (const trailer of named) {
        for (const value of resolve(trailer.dictionary.Encrypt)) {
          if (value.k === 'dict') dictionaries.set(JSON.stringify(value), value.v);
        }
      }
      if (dictionaries.size === 0) return unreadable('its encryption dictionary cannot be read');
      if (dictionaries.size > 1) return unreadable('it names several encryption dictionaries');
      // As pdf.js: the first string of `/ID`, or none.
      const ids = new Set(
        named.map((trailer) => {
          const id = first(trailer.dictionary.ID);
          const value = id?.k === 'arr' ? id.v[0] : undefined;
          return value?.k === 'str' ? value.v : '';
        })
      );
      if (ids.size > 1) return unreadable('its trailers disagree on its identifier');
      const [dictionary] = [...dictionaries.values()];
      return encryptionOf(dictionary ?? {}, [...ids][0] ?? '', crypto);
    };

    const encryption = setUpEncryption();
    // A trailer that could be the one pdf.js reads names no encryption: read the streams as
    // they are too.
    const alsoAsIs =
      encryption !== undefined &&
      trailers.some((trailer) => trailer.top && trailer.dictionary.Encrypt === undefined);

    const lengthOf = (value: PdfValue | undefined): number | undefined => {
      if (value === undefined) return undefined;
      const numbers = resolve(value);
      if (numbers.length === 0) return unreadable("a stream's /Length cannot be resolved");
      // pdf.js reads a /Length that is not an integer as 0: the data then runs to `endstream`.
      return Math.max(
        ...numbers.map((item) =>
          item.k === 'num' && Number.isInteger(item.v) ? Math.max(0, item.v) : 0
        )
      );
    };
    /** The filter chains a stream may have (several when a reference has several definitions). */
    const chainsOf = (dictionary: Record<string, PdfValue>) => {
      const raw = dictionary.F ?? dictionary.Filter;
      // `single`: /Filter is a name, so /DecodeParms applies whole to it.
      if (raw === undefined) return [{ filters: [] as string[], single: true }];
      const values = resolve(raw);
      if (values.length === 0) unreadable("a stream's /Filter cannot be resolved");
      const chains: Array<{ filters: string[]; single: boolean }> = [];
      for (const value of values) {
        if (value.k === 'name') chains.push({ filters: [value.v], single: true });
        else if (value.k === 'arr') {
          let partial: string[][] = [[]];
          for (const item of value.v) {
            const names = resolve(item);
            if (names.length === 0 || names.some((name) => name.k !== 'name')) {
              unreadable("a stream's /Filter cannot be resolved");
            }
            partial = partial.flatMap((chain) =>
              names.map((name) => [...chain, (name as { v: string }).v])
            );
            if (partial.length > 16) unreadable("a stream's /Filter has too many definitions");
          }
          chains.push(...partial.map((filters) => ({ filters, single: false })));
          // pdf.js reads a /Filter that is neither a name nor an array as no filter.
        } else chains.push({ filters: [], single: true });
      }
      return chains;
    };
    /** The parameters of the filter at `index`: its own entry of an array, or the whole value. */
    const paramsAt = (
      dictionary: Record<string, PdfValue>,
      index: number,
      single: boolean
    ): PdfValue[] => {
      const raw = dictionary.DP ?? dictionary.DecodeParms;
      if (raw === undefined) return [{ k: 'kw', v: 'null' }];
      const candidates = resolve(raw);
      if (candidates.length === 0) return unreadable("a stream's /DecodeParms cannot be resolved");
      return candidates.flatMap((candidate) => {
        if (single) return [candidate];
        if (candidate.k !== 'arr') return [{ k: 'kw', v: 'null' } as PdfValue];
        const entry = candidate.v[index];
        return entry === undefined ? [{ k: 'kw', v: 'null' } as PdfValue] : resolve(entry);
      });
    };
    interface Params {
      earlyChange: number;
      predictor: number;
      colors: number;
      bits: number;
      columns: number;
    }
    /** LZW's EarlyChange and the predictor, read as pdf.js reads them (`|| default`). */
    const paramsOf = (
      dictionary: Record<string, PdfValue>,
      index: number,
      single: boolean
    ): Params => {
      const sets = new Map<string, Params>();
      for (const param of paramsAt(dictionary, index, single)) {
        const entry = (name: string, fallback: number) => {
          if (param.k !== 'dict') return fallback;
          const value = first(param.v[name]);
          if (
            value === undefined ||
            (value.k === 'kw' && (value.v === 'null' || value.v === 'false'))
          )
            return fallback;
          return value.k === 'num' ? value.v || fallback : Number.NaN;
        };
        const earlyChange =
          param.k === 'dict' && param.v.EarlyChange !== undefined
            ? first(param.v.EarlyChange)
            : undefined;
        const params: Params = {
          earlyChange: earlyChange?.k === 'num' ? earlyChange.v : 1,
          predictor: entry('Predictor', 1),
          colors: entry('Colors', 1),
          bits:
            param.k === 'dict' && param.v.BPC !== undefined
              ? entry('BPC', 8)
              : entry('BitsPerComponent', 8),
          columns: entry('Columns', 1),
        };
        sets.set(JSON.stringify(params), params);
      }
      if (sets.size > 1) return unreadable("a stream's /DecodeParms has several definitions");
      return (
        [...sets.values()][0] ?? { earlyChange: 1, predictor: 1, colors: 1, bits: 8, columns: 1 }
      );
    };
    /** The crypt filter a `/Crypt` filter names (`/Name` of its parameters), `/Identity` if none. */
    const cryptFilterAt = (
      dictionary: Record<string, PdfValue>,
      index: number,
      single: boolean
    ): PdfValue => {
      const param = paramsAt(dictionary, index, single)[0];
      const name = param?.k === 'dict' ? first(param.v.Name) : undefined;
      return name?.k === 'name' ? name : { k: 'name', v: 'Identity' };
    };

    let total = 0;
    const count = (length: number) => {
      total += length;
      if (total > maxDecodedBytes) tooMuch();
    };
    const IMAGE_FILTERS = new Set([
      'DCTDecode',
      'DCT',
      'JPXDecode',
      'JBIG2Decode',
      'CCITTFaxDecode',
      'CCF',
    ]);

    /**
     * How a stream may be read. Unencrypted: as it is. Encrypted: decrypted as object `N G` of
     * its header, and, as alternatives, under every shorter number the cross-reference could
     * point at; a stream of cross-references as it is (pdf.js reads it so), with the decrypted
     * readings as alternatives, since an object that refers to it gets it decrypted.
     */
    interface Reading {
      key?: [number, number];
      alternative: boolean;
    }
    const readingsOf = (stream: StreamRecord): Reading[] => {
      if (!encryption) return [{ alternative: false }];
      const { header } = stream;
      const under = (nums: number[]): Reading[] =>
        header ? nums.map((num) => ({ key: [num, header.gen], alternative: true })) : [];
      if (isXRef(stream)) {
        return [
          { alternative: false },
          ...under([
            ...(header?.primary === undefined ? [] : [header.primary]),
            ...(header?.alternatives ?? []),
          ]),
        ];
      }
      if (header?.primary === undefined)
        return unreadable('an encrypted stream has no object number to decrypt it with');
      return [
        { key: [header.primary, header.gen], alternative: false },
        ...under(header.alternatives),
        ...(alsoAsIs ? [{ alternative: true }] : []),
      ];
    };

    /**
     * Decodes one stream's data through a chain, under one reading; gives the output fully
     * decoded when `wanted` (an object stream's content) and pdf.js decodes it all.
     */
    const measure = (
      stream: StreamRecord,
      chain: { filters: string[]; single: boolean },
      reading: Reading,
      wanted: boolean
    ): Uint8Array | undefined => {
      const { dictionary } = stream;
      const { filters, single } = chain;
      const declared = lengthOf(dictionary.Length);
      const declaredEnd =
        declared === undefined
          ? stream.fallbackEnd
          : Math.min(text.length, stream.start + declared);
      const end = Math.max(declaredEnd, stream.fallbackEnd);
      let data: Uint8Array = bytes.subarray(stream.start, end);
      const key = encryption ? reading.key : undefined;
      // As pdf.js: a stream with a /Crypt filter is decrypted by that filter only.
      if (encryption && key && !filters.includes('Crypt')) {
        const plain = encryption.decrypt(data, encryption.streamFilter(dictionary), key[0], key[1]);
        if (plain === 'unread') return undefined;
        data = plain;
      }
      for (let index = 0; index < filters.length; index++) {
        const filter = filters[index] ?? '';
        const room = maxDecodedBytes - total;
        let next: Uint8Array | 'too-much' | 'damaged' | 'none';
        const flateLike = filter === 'FlateDecode' || filter === 'Fl';
        const lzwLike = filter === 'LZWDecode' || filter === 'LZW';
        if (flateLike) next = flate(data, room);
        else if (filter === 'BrotliDecode') next = brotli(data, room);
        else if (lzwLike) next = lzw(data, room, paramsOf(dictionary, index, single).earlyChange);
        else if (filter === 'RunLengthDecode' || filter === 'RL') next = runLength(data, room);
        else if (filter === 'ASCIIHexDecode' || filter === 'AHx') {
          data = hex(data);
          continue;
        } else if (filter === 'ASCII85Decode' || filter === 'A85') {
          data = ascii85(data);
          continue;
        } else if (filter === 'Crypt') {
          if (encryption && key) {
            const plain = encryption.decrypt(
              data,
              cryptFilterAt(dictionary, index, single),
              key[0],
              key[1]
            );
            if (plain === 'unread') return undefined;
            data = plain;
          }
          continue;
        } else if (IMAGE_FILTERS.has(filter)) {
          if (index !== filters.length - 1)
            unreadable(`an image filter (/${filter}) is followed by another filter`);
          if (!isName(first(dictionary.Subtype), 'Image')) {
            unreadable(`an image filter (/${filter}) is used on a stream that is not an image`);
          }
          // Text extraction never decodes image data.
          return undefined;
        } else
          return unreadable(
            `a stream uses a filter that cannot be measured (/${filter.slice(0, 40)})`
          );
        if (next === 'too-much') return tooMuch();
        if (next === 'damaged') {
          if (!reading.alternative) return unreadable('a compressed stream is damaged');
          // A reading pdf.js may not use: what it would decode before the damage counts. pdf.js
          // decodes Brotli whole, so nothing of a damaged one.
          if (flateLike) {
            const before = partialFlate(data, room);
            if (before === 'too-much') return tooMuch();
            count(before);
          }
          return undefined;
        }
        // A Flate header pdf.js refuses: pdf.js decodes nothing from this stream.
        if (next === 'none') return undefined;
        count(next.length);
        data = next;
        if (flateLike || lzwLike) {
          const params = paramsOf(dictionary, index, single);
          const needed = wanted || index < filters.length - 1;
          const predicted = predict(data, params, maxDecodedBytes - total, needed);
          if (predicted === 'too-much') return tooMuch();
          if (predicted === 'none') return undefined;
          if (predicted !== data) {
            count(typeof predicted === 'number' ? predicted : predicted.length);
            if (typeof predicted === 'number') return undefined;
            data = predicted;
          }
        }
      }
      return data;
    };

    /** Every reading of every chain; the contents pdf.js may decode, when `wanted`. */
    const measureAll = (stream: StreamRecord, wanted: boolean) => {
      const contents: Array<{ content: Uint8Array; alternative: boolean }> = [];
      for (const reading of readingsOf(stream)) {
        for (const chain of chainsOf(stream.dictionary)) {
          const content = measure(stream, chain, reading, wanted);
          if (content && wanted) contents.push({ content, alternative: reading.alternative });
        }
      }
      return contents;
    };

    /** An object stream's `/N` and `/First`, when both are integers: pdf.js accepts any stream. */
    const objectStreamOf = (stream: StreamRecord) => {
      const { N, First } = stream.dictionary;
      if (N === undefined || First === undefined) return undefined;
      const counts = resolve(N);
      const firsts = resolve(First);
      if (counts.length === 0 || firsts.length === 0) {
        return unreadable("an object stream's /N or /First cannot be resolved");
      }
      const integers = (values: PdfValue[]) =>
        values.flatMap((value) =>
          value.k === 'num' && Number.isInteger(value.v) ? [value.v] : []
        );
      const pairs = integers(counts).flatMap((n) => integers(firsts).map((f) => ({ n, first: f })));
      return pairs.length > 0 ? pairs : undefined;
    };

    /**
     * Reads an object stream's content as pdf.js does: `N` pairs of number and offset, then each
     * object, up to the next one's offset. One that is a stream is refused; the others are
     * defined (from a reading pdf.js may not use, only checked).
     */
    const readObjectStream = (
      content: Uint8Array,
      n: number,
      firstOffset: number,
      defining: boolean
    ) => {
      const src = latin1(content);
      const pairs: Array<[number, number]> = [];
      try {
        const reader = parser(src, 0, src.length);
        for (let index = 0; index < n; index++) {
          const number = reader.getObj();
          const offset = reader.getObj();
          if (reader.stream()) return;
          if (
            number.k !== 'num' ||
            offset.k !== 'num' ||
            !Number.isInteger(number.v) ||
            !Number.isInteger(offset.v)
          )
            return;
          pairs.push([number.v, offset.v]);
        }
      } catch (error) {
        if (error instanceof Unparsable) return;
        throw error;
      }
      for (let index = 0; index < pairs.length; index++) {
        const [number, offset] = pairs[index] ?? [0, 0];
        const start = firstOffset + offset;
        const following = pairs[index + 1];
        const end = following ? firstOffset + following[1] : src.length;
        // pdf.js stops at an offset smaller than the one before it.
        if (end < start) break;
        if (start < 0 || start >= src.length) continue;
        const read = valueAt(src, start, Math.min(end, src.length));
        if (!read) continue;
        if (read.stream) unreadable('an object stream holds a stream, which pdf.js would read');
        if (defining) define(`${number} 0`, read.value);
      }
    };

    // Object streams first: their objects may be what other streams' references point to. One
    // whose own filter or length points into another object stream waits for it.
    let waiting = streams.filter((stream) => objectStreamOf(stream) !== undefined);
    while (waiting.length > 0) {
      const stillWaiting: StreamRecord[] = [];
      let lastError: unknown;
      for (const stream of waiting) {
        try {
          for (const { content, alternative } of measureAll(stream, true)) {
            for (const { n, first: firstOffset } of objectStreamOf(stream) ?? []) {
              readObjectStream(content, n, firstOffset, !alternative);
            }
          }
        } catch (error) {
          if (!(error instanceof Refusal) || error.kind !== 'unreadable') throw error;
          stillWaiting.push(stream);
          lastError = error;
        }
      }
      if (stillWaiting.length === waiting.length) throw lastError;
      waiting = stillWaiting;
    }
    for (const stream of streams) {
      if (objectStreamOf(stream) === undefined) measureAll(stream, false);
    }
    return {
      ok: true,
      decodedBytes: total,
      streams: streams.length,
      encrypted: encryption !== undefined,
    };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: error.message, kind: error.kind };
    throw error;
  }

  // ------------------------------------------------------------------------------------------
  // Decoders. Each stops at `room` bytes of output ('too-much').

  function flate(data: Uint8Array, room: number): Uint8Array | 'too-much' | 'damaged' | 'none' {
    const cmf = data[0];
    const flg = data[1];
    // The header checks pdf.js makes: when one fails, it decodes nothing.
    if (cmf === undefined || flg === undefined) return 'none';
    if ((cmf & 0x0f) !== 8 || ((cmf << 8) + flg) % 31 !== 0 || (flg & 0x20) !== 0) return 'none';
    try {
      // Raw: pdf.js does not check the checksum, so neither does the measure. Z_SYNC_FLUSH: a
      // truncated stream gives what it holds, as pdf.js reads it.
      return zlib.inflateRawSync(data.subarray(2), {
        maxOutputLength: outputCap(room),
        finishFlush: zlib.constants.Z_SYNC_FLUSH,
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : '';
      return code === 'ERR_BUFFER_TOO_LARGE' ? 'too-much' : 'damaged';
    }
  }

  /**
   * What a damaged Flate stream inflates to before the damage, as pdf.js decodes it block by
   * block: the output of the longest prefix of its data that inflates.
   */
  function partialFlate(data: Uint8Array, room: number): number | 'too-much' {
    let low = 0;
    let high = data.length;
    while (high - low > 1) {
      spend();
      const middle = (low + high) >>> 1;
      const result = flate(data.subarray(0, middle), room);
      if (result === 'too-much') return 'too-much';
      if (result === 'damaged') high = middle;
      else low = middle;
    }
    const result = flate(data.subarray(0, low), room);
    if (result === 'too-much') return 'too-much';
    return typeof result === 'string' ? 0 : result.length;
  }

  /**
   * The output limit zlib is given: one byte past `room`, never past 2 GiB. Node.js 20 refuses a
   * `maxOutputLength` above its largest buffer (4 GiB) with an error that would read as damaged
   * data; a stream that fills 2 GiB is past any budget the measure can hold anyway.
   */
  function outputCap(room: number): number {
    return Math.min(room + 1, 2 ** 31 - 1);
  }

  function brotli(data: Uint8Array, room: number): Uint8Array | 'too-much' | 'damaged' {
    try {
      return zlib.brotliDecompressSync(data, { maxOutputLength: outputCap(room) });
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : '';
      return code === 'ERR_BUFFER_TOO_LARGE' ? 'too-much' : 'damaged';
    }
  }

  /**
   * The PNG (10 to 15) or TIFF (2) predictor after Flate or LZW, as pdf.js applies it: every
   * row it reads is `rowBytes` long, even when the data runs short, so a huge `/Columns`
   * expands. Gives the size only when the bytes are not `needed`; 'none' where pdf.js decodes
   * nothing (an unknown predictor).
   */
  function predict(
    data: Uint8Array,
    params: { predictor: number; colors: number; bits: number; columns: number },
    room: number,
    needed: boolean
  ): Uint8Array | number | 'too-much' | 'none' {
    const { predictor, colors, bits, columns } = params;
    if (predictor <= 1) return data;
    if (predictor !== 2 && (predictor < 10 || predictor > 15)) return 'none';
    const tiff = predictor === 2;
    // As pdf.js computes them, 32-bit arithmetic included.
    const rowBytes = (columns * colors * bits + 7) >> 3;
    const pixBytes = (colors * bits + 7) >> 3;
    if (!(rowBytes > 0)) return new Uint8Array(0);
    let rows: number;
    if (tiff) rows = Math.ceil(data.length / rowBytes);
    else {
      // A row takes its filter byte, then up to rowBytes; one with no data after the filter
      // byte ends the stream.
      const whole = Math.floor(data.length / (rowBytes + 1));
      rows = whole + (data.length - whole * (rowBytes + 1) >= 2 ? 1 : 0);
    }
    const size = rows * rowBytes;
    if (size > room) return 'too-much';
    if (!needed) return size;
    const out = new Uint8Array(size);
    let input = 0;
    for (let row = 0; row < rows; row++) {
      spend(rowBytes);
      const base = row * rowBytes;
      if (tiff) {
        const raw = data.subarray(input, input + rowBytes);
        input += raw.length;
        tiffRow(out, base, raw, rowBytes, colors, bits, columns);
        continue;
      }
      const type = data[input++] ?? -1;
      const raw = data.subarray(input, input + rowBytes);
      input += raw.length;
      if (!pngRow(out, base, raw, rowBytes, pixBytes, type)) return out.subarray(0, base);
    }
    return out;
  }

  /** One PNG row, as pdf.js's readBlockPng; false for a filter type it refuses. */
  function pngRow(
    out: Uint8Array,
    base: number,
    raw: Uint8Array,
    rowBytes: number,
    pixBytes: number,
    type: number
  ): boolean {
    const above = (index: number) => (base >= rowBytes ? (out[base - rowBytes + index] ?? 0) : 0);
    const left = (index: number) => (index >= pixBytes ? (out[base + index - pixBytes] ?? 0) : 0);
    for (let index = 0; index < rowBytes; index++) {
      const value = raw[index] ?? 0;
      if (type === 0) out[base + index] = value;
      else if (type === 1) out[base + index] = left(index) + value;
      else if (type === 2) out[base + index] = above(index) + value;
      else if (type === 3) out[base + index] = ((above(index) + left(index)) >> 1) + value;
      else if (type === 4) {
        const up = above(index);
        const upLeft = index >= pixBytes ? above(index - pixBytes) : 0;
        const l = left(index);
        const p = l + up - upLeft;
        const pa = Math.abs(p - l);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        out[base + index] = (pa <= pb && pa <= pc ? l : pb <= pc ? up : upLeft) + value;
      } else return false;
    }
    return true;
  }

  /** One TIFF row, as pdf.js's readBlockTiff. */
  function tiffRow(
    out: Uint8Array,
    base: number,
    raw: Uint8Array,
    rowBytes: number,
    colors: number,
    bits: number,
    columns: number
  ): void {
    let at = base;
    if (bits === 1 && colors === 1) {
      let carry = 0;
      for (let index = 0; index < rowBytes; index++) {
        let value = (raw[index] ?? 0) ^ carry;
        value ^= value >> 1;
        value ^= value >> 2;
        value ^= value >> 4;
        carry = (value & 1) << 7;
        out[at++] = value;
      }
    } else if (bits === 8) {
      let index = 0;
      for (; index < colors; index++) out[at++] = raw[index] ?? 0;
      for (; index < rowBytes; index++, at++) out[at] = (out[at - colors] ?? 0) + (raw[index] ?? 0);
    } else if (bits === 16) {
      const bytesPerPixel = colors * 2;
      let index = 0;
      for (; index < bytesPerPixel; index++) out[at++] = raw[index] ?? 0;
      for (; index < rowBytes; index += 2) {
        const sum =
          (((raw[index] ?? 0) & 255) << 8) +
          ((raw[index + 1] ?? 0) & 255) +
          (((out[at - bytesPerPixel] ?? 0) & 255) << 8) +
          ((out[at - bytesPerPixel + 1] ?? 0) & 255);
        out[at++] = (sum >> 8) & 255;
        out[at++] = sum & 255;
      }
    } else {
      const components = new Uint8Array(colors + 1);
      const mask = (1 << bits) - 1;
      let inbuf = 0;
      let outbuf = 0;
      let inbits = 0;
      let outbits = 0;
      let input = 0;
      for (let column = 0; column < columns; column++) {
        for (let color = 0; color < colors; color++) {
          if (inbits < bits) {
            inbuf = (inbuf << 8) | ((raw[input++] ?? 0) & 255);
            inbits += 8;
          }
          components[color] = ((components[color] ?? 0) + (inbuf >> (inbits - bits))) & mask;
          inbits -= bits;
          outbuf = (outbuf << bits) | (components[color] ?? 0);
          outbits += bits;
          if (outbits >= 8) {
            out[at++] = (outbuf >> (outbits - 8)) & 255;
            outbits -= 8;
          }
        }
      }
      if (outbits > 0) out[at++] = (outbuf << (8 - outbits)) + (inbuf & ((1 << (8 - outbits)) - 1));
    }
  }

  /** A byte buffer that grows as needed, never past `room`: `reserve` is false past it. */
  function output(room: number) {
    let buffer = new Uint8Array(Math.max(16, Math.min(room, 65_536)));
    let size = 0;
    return {
      reserve(extra: number): boolean {
        if (size + extra > room) return false;
        if (size + extra > buffer.length) {
          let capacity = buffer.length * 2;
          while (capacity < size + extra) capacity *= 2;
          const grown = new Uint8Array(Math.min(capacity, Math.max(room, size + extra)));
          grown.set(buffer.subarray(0, size));
          buffer = grown;
        }
        return true;
      },
      put(value: number): void {
        buffer[size++] = value;
      },
      get size(): number {
        return size;
      },
      bytes(): Uint8Array {
        return buffer.subarray(0, size);
      },
    };
  }

  /** LZWDecode, with prefix and suffix tables: a string is written by walking its codes back. */
  function lzw(data: Uint8Array, room: number, earlyChange: number): Uint8Array | 'too-much' {
    const out = output(room);
    const prefix = new Int32Array(4096);
    const suffix = new Uint8Array(4096);
    const lengths = new Uint16Array(4096);
    for (let code = 0; code < 256; code++) {
      prefix[code] = -1;
      suffix[code] = code;
      lengths[code] = 1;
    }
    let next = 258;
    let width = 9;
    let previous = -1;
    let bitBuffer = 0;
    let bitCount = 0;
    const write = (code: number): number => {
      const length = lengths[code] ?? 0;
      if (!out.reserve(length)) return -1;
      const at = out.size;
      for (let index = 0; index < length; index++) out.put(0);
      const written = out.bytes();
      let current = code;
      for (let index = length - 1; index >= 0; index--) {
        written[at + index] = suffix[current] ?? 0;
        current = prefix[current] ?? -1;
      }
      return written[at] ?? 0;
    };
    for (let index = 0; index < data.length; index++) {
      bitBuffer = ((bitBuffer << 8) | (data[index] ?? 0)) & 0xffffff;
      bitCount += 8;
      while (bitCount >= width) {
        const code = (bitBuffer >>> (bitCount - width)) & ((1 << width) - 1);
        bitCount -= width;
        if (code === 256) {
          next = 258;
          width = 9;
          previous = -1;
          continue;
        }
        if (code === 257) return out.bytes();
        let first: number;
        if (code < next && (code < 256 || code > 257)) {
          first = write(code);
          if (first === -1) return 'too-much';
        } else if (code === next && previous !== -1) {
          first = write(previous);
          if (first === -1 || !out.reserve(1)) return 'too-much';
          out.put(first);
        } else {
          return out.bytes();
        }
        if (previous !== -1 && next < 4096) {
          prefix[next] = previous;
          suffix[next] = first;
          lengths[next] = (lengths[previous] ?? 0) + 1;
          next++;
        }
        previous = code;
        const upcoming = next + earlyChange;
        width = upcoming >= 2048 ? 12 : upcoming >= 1024 ? 11 : upcoming >= 512 ? 10 : 9;
      }
    }
    return out.bytes();
  }

  function runLength(data: Uint8Array, room: number): Uint8Array | 'too-much' {
    const out = output(room);
    let index = 0;
    while (index < data.length) {
      const length = data[index] ?? 128;
      if (length === 128) break;
      const count = length < 128 ? length + 1 : 257 - length;
      if (!out.reserve(count)) return 'too-much';
      for (let copy = 0; copy < count; copy++) {
        out.put(length < 128 ? (data[index + 1 + copy] ?? 0) : (data[index + 1] ?? 0));
      }
      index += length < 128 ? length + 2 : 2;
    }
    return out.bytes();
  }

  function hex(data: Uint8Array): Uint8Array {
    const digits = Buffer.from(data)
      .toString('latin1')
      .replace(/>[\s\S]*$/, '')
      .replace(/[^0-9a-fA-F]/g, '');
    return Buffer.from(digits.length % 2 ? `${digits}0` : digits, 'hex');
  }

  /** ASCII85Decode: 5 characters give 4 bytes, `z` gives 4 zero bytes. */
  function ascii85(data: Uint8Array): Uint8Array {
    const body = Buffer.from(data)
      .toString('latin1')
      .replace(/~>[\s\S]*$/, '')
      .replace(/^<~/, '')
      .replace(/\s+/g, '');
    const out = new Uint8Array(body.length * 4 + 4);
    let size = 0;
    let group: number[] = [];
    const flush = (kept: number) => {
      let number = 0;
      for (const digit of group) number = number * 85 + digit;
      const all = [
        (number >>> 24) & 255,
        (number >>> 16) & 255,
        (number >>> 8) & 255,
        number & 255,
      ];
      for (let index = 0; index < kept; index++) out[size++] = all[index] ?? 0;
      group = [];
    };
    for (const char of body) {
      if (char === 'z' && group.length === 0) {
        size += 4;
        continue;
      }
      const value = char.charCodeAt(0) - 33;
      if (value < 0 || value > 84) continue;
      group.push(value);
      if (group.length === 5) flush(4);
    }
    if (group.length > 1) {
      const kept = group.length - 1;
      while (group.length < 5) group.push(84);
      flush(kept);
    }
    return out.subarray(0, size);
  }

  /** RC4, as the standard security handler uses it (OpenSSL 3 no longer offers it). */
  function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
    const state = new Uint8Array(256);
    for (let index = 0; index < 256; index++) state[index] = index;
    for (let index = 0, j = 0; index < 256; index++) {
      const swap = state[index] ?? 0;
      j = (j + swap + (key[index % key.length] ?? 0)) & 255;
      state[index] = state[j] ?? 0;
      state[j] = swap;
    }
    const out = new Uint8Array(data.length);
    for (let index = 0, i = 0, j = 0; index < data.length; index++) {
      i = (i + 1) & 255;
      const a = state[i] ?? 0;
      j = (j + a) & 255;
      const b = state[j] ?? 0;
      state[i] = b;
      state[j] = a;
      out[index] = (data[index] ?? 0) ^ (state[(a + b) & 255] ?? 0);
    }
    return out;
  }
}
