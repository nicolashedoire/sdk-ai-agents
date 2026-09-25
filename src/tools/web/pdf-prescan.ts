/** What `prescanPdf` needs of `node:zlib` (passed in: the function runs in the PDF worker). */
export interface PrescanZlib {
  inflateSync(
    data: Uint8Array,
    options: { maxOutputLength: number; finishFlush: number }
  ): Uint8Array;
  constants: { Z_SYNC_FLUSH: number };
}

export type PrescanVerdict =
  | { ok: true; decodedBytes: number; streams: number }
  | { ok: false; reason: string };

/**
 * Measures, before pdf.js sees a PDF, how much its streams inflate to, and refuses it past
 * `maxDecodedBytes` in all. Every stream's filters are applied in order — FlateDecode (with
 * zlib's `maxOutputLength`, so no output is ever larger than the budget left), LZWDecode and
 * RunLengthDecode (bounded the same way), ASCIIHexDecode and ASCII85Decode (which only
 * shrink) — and the output of every expanding stage counts. A chain such as
 * `[/FlateDecode /FlateDecode]` is measured to the end. Robust by design: an unknown filter
 * (images, encryption…) ends the measure of its stream, and a malformed stream is left to
 * pdf.js.
 *
 * Self-contained, without imports or outside names: the PDF worker runs its source text.
 */
export function prescanPdf(
  bytes: Uint8Array,
  zlib: PrescanZlib,
  maxDecodedBytes: number
): PrescanVerdict {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  let total = 0;
  let streams = 0;
  let refused: string | undefined;
  const tooMuch = () =>
    `its streams inflate to more than ${Math.round(maxDecodedBytes / 1_048_576)} MB`;

  /** The dictionary that ends right before `at` (`<< … >>`), nested ones included. */
  const dictionaryBefore = (at: number): string | undefined => {
    let end = at;
    while (end > 0 && /\s/.test(text.charAt(end - 1))) end--;
    if (text.slice(end - 2, end) !== '>>') return undefined;
    let depth = 0;
    const lowest = Math.max(0, end - 65_536);
    for (let index = end - 2; index >= lowest; index--) {
      const pair = text.slice(index, index + 2);
      if (pair === '>>') {
        depth++;
        index--;
      } else if (pair === '<<') {
        depth--;
        if (depth === 0) return text.slice(index, end);
        index--;
      }
    }
    return undefined;
  };

  const flate = (data: Uint8Array, room: number): Uint8Array | 'too-much' | undefined => {
    try {
      // Z_SYNC_FLUSH: a truncated stream gives what it holds, as pdf.js reads it.
      return zlib.inflateSync(data, {
        maxOutputLength: room + 1,
        finishFlush: zlib.constants.Z_SYNC_FLUSH,
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : '';
      if (code === 'ERR_BUFFER_TOO_LARGE') return 'too-much';
      return undefined;
    }
  };

  /** A byte buffer that grows as needed, never past `room`: `reserve` is false past it. */
  const output = (room: number) => {
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
  };

  /** LZWDecode, with prefix and suffix tables: a string is written by walking its codes back. */
  const lzw = (data: Uint8Array, room: number, earlyChange: number): Uint8Array | 'too-much' => {
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
      const bytes = out.bytes();
      let current = code;
      for (let index = length - 1; index >= 0; index--) {
        bytes[at + index] = suffix[current] ?? 0;
        current = prefix[current] ?? -1;
      }
      return bytes[at] ?? 0;
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
  };

  const runLength = (data: Uint8Array, room: number): Uint8Array | 'too-much' => {
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
  };

  const hex = (data: Uint8Array): Uint8Array => {
    const digits = Buffer.from(data)
      .toString('latin1')
      .replace(/>[\s\S]*$/, '')
      .replace(/[^0-9a-fA-F]/g, '');
    return Buffer.from(digits.length % 2 ? `${digits}0` : digits, 'hex');
  };

  /** ASCII85Decode: 5 characters give 4 bytes, `z` gives 4 zero bytes. */
  const ascii85 = (data: Uint8Array): Uint8Array => {
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
  };

  const keyword = /stream(?:\r\n|\n|\r)/g;
  for (let match = keyword.exec(text); match && !refused; match = keyword.exec(text)) {
    if (text.slice(match.index - 3, match.index) === 'end') continue;
    const dictionary = dictionaryBefore(match.index);
    if (!dictionary) continue;
    const start = match.index + match[0].length;
    let end = -1;
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dictionary)?.[1];
    if (length !== undefined) {
      const candidate = start + Number(length);
      if (/^\s*endstream/.test(text.slice(candidate, candidate + 20))) end = candidate;
    }
    if (end === -1) end = text.indexOf('endstream', start);
    if (end === -1) end = text.length;
    const array = /\/Filter\s*\[([^\]]*)\]/.exec(dictionary)?.[1];
    const single = /\/Filter\s*\/([A-Za-z0-9]+)/.exec(dictionary)?.[1];
    const filters = array
      ? [...array.matchAll(/\/([A-Za-z0-9]+)/g)].map((name) => name[1] ?? '')
      : single
        ? [single]
        : [];
    if (filters.length === 0) continue;
    streams++;
    const earlyChange = /\/EarlyChange\s+0\b/.test(dictionary) ? 0 : 1;
    let data: Uint8Array = bytes.subarray(start, end);
    for (const filter of filters) {
      let next: Uint8Array | 'too-much' | undefined;
      const room = maxDecodedBytes - total;
      if (filter === 'FlateDecode' || filter === 'Fl') next = flate(data, room);
      else if (filter === 'LZWDecode' || filter === 'LZW') next = lzw(data, room, earlyChange);
      else if (filter === 'RunLengthDecode' || filter === 'RL') next = runLength(data, room);
      else if (filter === 'ASCIIHexDecode' || filter === 'AHx') {
        data = hex(data);
        continue;
      } else if (filter === 'ASCII85Decode' || filter === 'A85') {
        data = ascii85(data);
        continue;
      } else break;
      if (next === 'too-much') {
        refused = tooMuch();
        break;
      }
      if (next === undefined) break;
      total += next.length;
      if (total > maxDecodedBytes) {
        refused = tooMuch();
        break;
      }
      data = next;
    }
  }
  return refused ? { ok: false, reason: refused } : { ok: true, decodedBytes: total, streams };
}
