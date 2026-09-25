/** What `prescanPdf` needs of `node:zlib` (passed in: the function runs in the PDF worker). */
export interface PrescanZlib {
  inflateRawSync(
    data: Uint8Array,
    options: { maxOutputLength: number; finishFlush: number }
  ): Uint8Array;
  brotliDecompressSync(data: Uint8Array, options: { maxOutputLength: number }): Uint8Array;
  constants: { Z_SYNC_FLUSH: number };
}

export type PrescanVerdict =
  | { ok: true; decodedBytes: number; streams: number; encrypted: boolean }
  | { ok: false; reason: string; kind: 'too-large' | 'unreadable' };

/** A PDF object as the pre-scan reads it. */
type PdfValue =
  | { k: 'num'; v: number; int: boolean }
  | { k: 'name'; v: string }
  | { k: 'str' }
  | { k: 'arr'; v: PdfValue[] }
  | { k: 'dict'; v: Record<string, PdfValue> }
  | { k: 'ref'; key: string }
  | { k: 'kw'; v: string };

/**
 * Measures, before pdf.js sees a PDF, how much its streams inflate to, and refuses it past
 * `maxDecodedBytes` in all. Fail closed: what it cannot read, it refuses.
 *
 * - A real PDF lexer reads every object (`N G obj`), wherever it starts, so no string,
 *   comment or odd spacing can hide one: dictionaries and arrays nested, literal strings with
 *   nested parentheses and escapes, hex strings, comments, names with `#xx` escapes. A stream
 *   whose dictionary cannot be read refuses the PDF.
 * - Filters are read as pdf.js reads them: `/F` or `/Filter`, `/DP` or `/DecodeParms`,
 *   references resolved (in object streams too). A filter or a length that cannot be resolved
 *   refuses the PDF.
 * - A stream's data starts after the line that follows `stream`, as in pdf.js, and runs for
 *   its declared `/Length` or to the first `endstream`, whichever is longer.
 * - Every filter of a chain is applied in order: FlateDecode (zlib, raw, with
 *   `maxOutputLength`, a header pdf.js would refuse meaning no data), BrotliDecode,
 *   LZWDecode and RunLengthDecode (bounded the same way), ASCIIHexDecode, ASCII85Decode and
 *   Crypt (which do not expand). The output of every expanding stage counts. An image filter
 *   (DCT, JPX, JBIG2, CCITTFax) is allowed only last, on an image; any other filter, or damaged
 *   compressed data, refuses the PDF.
 * - An encrypted PDF (`/Encrypt` in a trailer or an XRef stream) cannot be measured: its
 *   streams are ciphertext. It is let through, marked `encrypted`.
 *
 * Self-contained, without imports or outside names: the PDF worker runs its source text.
 */
export function prescanPdf(
  bytes: Uint8Array,
  zlib: PrescanZlib,
  maxDecodedBytes: number
): PrescanVerdict {
  class Refusal extends Error {
    constructor(
      message: string,
      readonly kind: 'too-large' | 'unreadable'
    ) {
      super(message);
    }
  }
  /** Thrown by the lexer on text it cannot read: a caller decides whether that refuses. */
  class Unparsable extends Error {}

  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  const unreadable = (why: string): never => {
    throw new Refusal(why, 'unreadable');
  };
  const tooMuch = (): never => {
    throw new Refusal(
      `its streams inflate to more than ${Math.round(maxDecodedBytes / 1_048_576)} MB`,
      'too-large'
    );
  };
  // The lexer's work is bounded: a file built to make it slow is refused, not endured.
  let work = 0;
  const workLimit = text.length * 32 + 20_000_000;
  const spend = (amount = 1) => {
    work += amount;
    if (work > workLimit) unreadable('its structure is too complex to measure');
  };

  const isSpace = (char: string | undefined) =>
    char === ' ' ||
    char === '\n' ||
    char === '\r' ||
    char === '\t' ||
    char === '\f' ||
    char === '\0';
  const isDelimiter = (char: string | undefined) =>
    char !== undefined && '()<>[]{}/%'.includes(char);
  const isRegular = (char: string | undefined) =>
    char !== undefined && !isSpace(char) && !isDelimiter(char);

  /** A lexer over one text: the file, or the decoded content of an object stream. */
  const lexer = (src: string) => {
    const skipSpace = (from: number): number => {
      let at = from;
      for (;;) {
        spend();
        const char = src[at];
        if (char === undefined) return at;
        if (isSpace(char)) at++;
        else if (char === '%') {
          while (at < src.length && src[at] !== '\n' && src[at] !== '\r') {
            spend();
            at++;
          }
        } else return at;
      }
    };
    const regularRun = (from: number): number => {
      let at = from;
      while (isRegular(src[at])) {
        spend();
        at++;
      }
      return at;
    };
    const parseName = (from: number): [PdfValue, number] => {
      const end = regularRun(from + 1);
      const raw = src.slice(from + 1, end);
      const name = raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      );
      return [{ k: 'name', v: name }, end];
    };
    const parseValue = (from: number, depth: number): [PdfValue, number] => {
      if (depth > 256) throw new Unparsable('nested too deeply');
      let at = skipSpace(from);
      const char = src[at];
      if (char === undefined) throw new Unparsable('ends inside an object');
      if (char === '<' && src[at + 1] === '<') {
        const entries: Record<string, PdfValue> = Object.create(null);
        at += 2;
        for (;;) {
          at = skipSpace(at);
          if (src[at] === '>' && src[at + 1] === '>') return [{ k: 'dict', v: entries }, at + 2];
          if (src[at] !== '/') throw new Unparsable('a dictionary key is not a name');
          const [key, afterKey] = parseName(at);
          const [value, afterValue] = parseValue(afterKey, depth + 1);
          entries[(key as { v: string }).v] = value;
          at = afterValue;
        }
      }
      if (char === '<') {
        at++;
        for (;;) {
          spend();
          const next = src[at];
          if (next === undefined) throw new Unparsable('a hex string does not end');
          if (next === '>') return [{ k: 'str' }, at + 1];
          if (!/[0-9a-fA-F]/.test(next) && !isSpace(next)) {
            throw new Unparsable('a hex string holds other characters');
          }
          at++;
        }
      }
      if (char === '(') {
        let open = 1;
        at++;
        while (open > 0) {
          spend();
          const next = src[at];
          if (next === undefined) throw new Unparsable('a string does not end');
          if (next === '\\') at += 2;
          else {
            if (next === '(') open++;
            else if (next === ')') open--;
            at++;
          }
        }
        return [{ k: 'str' }, at];
      }
      if (char === '[') {
        const items: PdfValue[] = [];
        at++;
        for (;;) {
          at = skipSpace(at);
          if (src[at] === ']') return [{ k: 'arr', v: items }, at + 1];
          const [item, after] = parseValue(at, depth + 1);
          items.push(item);
          at = after;
        }
      }
      if (char === '/') return parseName(at);
      if (/[+\-.0-9]/.test(char)) {
        const end = regularRun(at);
        const token = src.slice(at, end);
        const number = Number(token);
        if (!Number.isFinite(number)) throw new Unparsable('a number cannot be read');
        const int = /^[+-]?\d+$/.test(token);
        // `N G R`: a reference.
        if (int && number >= 0) {
          const second = skipSpace(end);
          const secondEnd = regularRun(second);
          if (/^\d+$/.test(src.slice(second, secondEnd))) {
            const third = skipSpace(secondEnd);
            if (src[third] === 'R' && !isRegular(src[third + 1])) {
              return [
                { k: 'ref', key: `${number} ${Number(src.slice(second, secondEnd))}` },
                third + 1,
              ];
            }
          }
        }
        return [{ k: 'num', v: number, int }, end];
      }
      if (isRegular(char)) {
        const end = regularRun(at);
        const word = src.slice(at, end);
        if (word === 'true' || word === 'false' || word === 'null') {
          return [{ k: 'kw', v: word }, end];
        }
        throw new Unparsable(`unexpected "${word.slice(0, 20)}"`);
      }
      throw new Unparsable(`unexpected "${char}"`);
    };
    return { skipSpace, parseValue };
  };

  const file = lexer(text);
  /** Every definition of each object, `N G` → values, in file order. */
  const objects = new Map<string, PdfValue[]>();
  const define = (key: string, value: PdfValue) => {
    const known = objects.get(key);
    if (known) known.push(value);
    else objects.set(key, [value]);
  };
  interface StreamRecord {
    dictionary: Record<string, PdfValue>;
    start: number;
    fallbackEnd: number;
  }
  const streams: StreamRecord[] = [];
  let encrypted = false;

  try {
    // Every place an object starts, even inside another object's data: nothing is skipped
    // over, so nothing can be hidden by a wrong skip.
    const header = /(?<![0-9])(\d{1,10})[\0\t\n\f\r ]+(\d{1,5})[\0\t\n\f\r ]+obj(?![A-Za-z0-9_])/g;
    for (let match = header.exec(text); match; match = header.exec(text)) {
      spend(match[0].length);
      const key = `${Number(match[1])} ${Number(match[2])}`;
      const bodyStart = match.index + match[0].length;
      let value: PdfValue;
      let after: number;
      try {
        [value, after] = file.parseValue(bodyStart, 0);
      } catch (error) {
        if (!(error instanceof Unparsable)) throw error;
        // Not an object we can read. If a stream follows before the object ends, its
        // dictionary could not be read: refuse rather than let pdf.js read it unmeasured.
        const rest = text.slice(bodyStart, bodyStart + 65_536);
        const streamAt = rest.search(/(?<![A-Za-z])stream(?![A-Za-z])/);
        const endAt = rest.search(
          /endobj|(?<![0-9])\d+[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+obj(?![A-Za-z])/
        );
        if (streamAt !== -1 && (endAt === -1 || streamAt < endAt)) {
          unreadable('a stream dictionary cannot be read');
        }
        continue;
      }
      const next = file.skipSpace(after);
      if (text.startsWith('stream', next) && !isRegular(text[next + 6])) {
        if (value.k !== 'dict') continue;
        // As pdf.js: the data starts after the end of the line that holds `stream`.
        let start = next + 6;
        while (start < text.length && text[start] !== '\r' && text[start] !== '\n') {
          spend();
          start++;
        }
        if (text[start] === '\r' && text[start + 1] === '\n') start += 2;
        else if (start < text.length) start++;
        const found = text.indexOf('endstream', start);
        streams.push({
          dictionary: value.v,
          start,
          fallbackEnd: found === -1 ? text.length : found,
        });
      } else {
        define(key, value);
      }
    }
    // A trailer that names an encryption dictionary.
    const trailer = /trailer/g;
    for (let match = trailer.exec(text); match; match = trailer.exec(text)) {
      try {
        const [value] = file.parseValue(match.index + 7, 0);
        if (value.k === 'dict' && value.v.Encrypt !== undefined) encrypted = true;
      } catch (error) {
        if (!(error instanceof Unparsable)) throw error;
      }
    }
    for (const stream of streams) {
      const type = stream.dictionary.Type;
      if (type?.k === 'name' && type.v === 'XRef' && stream.dictionary.Encrypt !== undefined) {
        encrypted = true;
      }
    }
    if (encrypted) return { ok: true, decodedBytes: 0, streams: streams.length, encrypted: true };

    /** Every value a reference may stand for (all its definitions), or the value itself. */
    const resolve = (value: PdfValue | undefined, hops = 0): PdfValue[] => {
      if (value === undefined) return [];
      if (value.k !== 'ref') return [value];
      if (hops > 8) return [];
      return (objects.get(value.key) ?? []).flatMap((target) => resolve(target, hops + 1));
    };
    const resolveNumber = (value: PdfValue | undefined, what: string): number | undefined => {
      if (value === undefined) return undefined;
      const numbers = resolve(value);
      if (numbers.length === 0 || numbers.some((item) => item.k !== 'num')) {
        return unreadable(`a stream's ${what} cannot be resolved`);
      }
      return Math.max(...numbers.map((item) => (item as { v: number }).v));
    };
    /** The filter chains a stream may have: several when a reference has several definitions. */
    const chainsOf = (dictionary: Record<string, PdfValue>): string[][] => {
      const raw = dictionary.F ?? dictionary.Filter;
      if (raw === undefined) return [[]];
      const chains: string[][] = [];
      for (const value of resolve(raw)) {
        if (value.k === 'name') chains.push([value.v]);
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
          chains.push(...partial);
        } else unreadable("a stream's /Filter is not a name or an array");
      }
      if (chains.length === 0) unreadable("a stream's /Filter cannot be resolved");
      return chains;
    };
    /** LZW's EarlyChange for the filter at `index` of the chain (1 unless the parameters say). */
    const earlyChangeOf = (
      dictionary: Record<string, PdfValue>,
      index: number,
      single: boolean
    ) => {
      const raw = dictionary.DP ?? dictionary.DecodeParms;
      if (raw === undefined) return 1;
      const candidates = resolve(raw);
      if (candidates.length === 0) return unreadable("a stream's /DecodeParms cannot be resolved");
      const values = new Set<number>();
      for (const candidate of candidates) {
        let params: PdfValue[] = [candidate];
        if (candidate.k === 'arr') params = single ? [] : resolve(candidate.v[index]);
        for (const param of params) {
          if (param.k === 'kw' && param.v === 'null') values.add(1);
          else if (param.k !== 'dict')
            return unreadable("a stream's /DecodeParms cannot be resolved");
          else {
            const early = param.v.EarlyChange;
            values.add(early === undefined ? 1 : (resolveNumber(early, '/EarlyChange') ?? 1));
          }
        }
      }
      if (values.size > 1) return unreadable("a stream's /DecodeParms has several definitions");
      return values.size === 0 ? 1 : ([...values][0] ?? 1);
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

    /** Decodes one stream's data through a chain; gives the last output fully decoded, if any. */
    const measure = (stream: StreamRecord, chain: string[]): Uint8Array | undefined => {
      const { dictionary } = stream;
      const declared = resolveNumber(dictionary.Length, '/Length');
      const declaredEnd =
        declared === undefined
          ? stream.fallbackEnd
          : Math.min(text.length, stream.start + Math.max(0, declared));
      const end = Math.max(declaredEnd, stream.fallbackEnd);
      let data: Uint8Array = bytes.subarray(stream.start, end);
      for (let index = 0; index < chain.length; index++) {
        const filter = chain[index] ?? '';
        const room = maxDecodedBytes - total;
        let next: Uint8Array | 'too-much' | 'damaged' | 'none';
        if (filter === 'FlateDecode' || filter === 'Fl') next = flate(data, room);
        else if (filter === 'BrotliDecode') next = brotli(data, room);
        else if (filter === 'LZWDecode' || filter === 'LZW') {
          next = lzw(data, room, earlyChangeOf(dictionary, index, chain.length === 1));
        } else if (filter === 'RunLengthDecode' || filter === 'RL') next = runLength(data, room);
        else if (filter === 'ASCIIHexDecode' || filter === 'AHx') {
          data = hex(data);
          continue;
        } else if (filter === 'ASCII85Decode' || filter === 'A85') {
          data = ascii85(data);
          continue;
        } else if (filter === 'Crypt') continue;
        else if (IMAGE_FILTERS.has(filter)) {
          if (index !== chain.length - 1)
            unreadable(`an image filter (/${filter}) is followed by another filter`);
          const subtype = resolve(dictionary.Subtype)[0];
          if (subtype?.k !== 'name' || subtype.v !== 'Image') {
            unreadable(`an image filter (/${filter}) is used on a stream that is not an image`);
          }
          // Text extraction never decodes image data.
          return undefined;
        } else
          return unreadable(
            `a stream uses a filter that cannot be measured (/${filter.slice(0, 40)})`
          );
        if (next === 'too-much') return tooMuch();
        if (next === 'damaged') return unreadable('a compressed stream is damaged');
        // A Flate header pdf.js refuses: pdf.js decodes nothing from this stream.
        if (next === 'none') return undefined;
        count(next.length);
        data = next;
      }
      return data;
    };

    const measureAll = (stream: StreamRecord): Uint8Array | undefined => {
      let last: Uint8Array | undefined;
      for (const chain of chainsOf(stream.dictionary)) {
        if (chain.length === 0) last = bytes.subarray(stream.start, stream.fallbackEnd);
        else last = measure(stream, chain);
      }
      return last;
    };

    /** Adds the objects an object stream holds, so references to them resolve. */
    const readObjectStream = (stream: StreamRecord, content: Uint8Array) => {
      const count = resolveNumber(stream.dictionary.N, '/N') ?? 0;
      const first = resolveNumber(stream.dictionary.First, '/First') ?? 0;
      const src = Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString(
        'latin1'
      );
      const inner = lexer(src);
      let at = 0;
      const pairs: Array<[number, number]> = [];
      for (let index = 0; index < count; index++) {
        try {
          const [number, afterNumber] = inner.parseValue(at, 0);
          const [offset, afterOffset] = inner.parseValue(afterNumber, 0);
          if (number.k !== 'num' || offset.k !== 'num') break;
          pairs.push([number.v, offset.v]);
          at = afterOffset;
        } catch (error) {
          if (!(error instanceof Unparsable)) throw error;
          break;
        }
      }
      for (const [number, offset] of pairs) {
        try {
          const [value] = inner.parseValue(first + offset, 0);
          define(`${number} 0`, value);
        } catch (error) {
          if (!(error instanceof Unparsable)) throw error;
        }
      }
    };

    const isObjectStream = (stream: StreamRecord) => {
      const type = stream.dictionary.Type;
      return type?.k === 'name' && type.v === 'ObjStm';
    };
    // Object streams first: their objects may be what other streams' references point to. One
    // whose own filter or length points into another object stream waits for it.
    let waiting = streams.filter(isObjectStream);
    while (waiting.length > 0) {
      const stillWaiting: StreamRecord[] = [];
      let lastError: unknown;
      for (const stream of waiting) {
        try {
          const content = measureAll(stream);
          if (content) readObjectStream(stream, content);
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
      if (!isObjectStream(stream)) measureAll(stream);
    }
    return { ok: true, decodedBytes: total, streams: streams.length, encrypted: false };
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
}
