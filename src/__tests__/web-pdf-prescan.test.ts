import zlib from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { prescanPdf } from '../tools/web/pdf-prescan.js';

const MB = 1_048_576;
const BUDGET = 16 * MB;
const TOO_LARGE = { ok: false, reason: 'its streams inflate to more than 16 MB', kind: 'too-large' };
const unreadable = (reason: string) => ({ ok: false, reason, kind: 'unreadable' });

/** An indirect object: a dictionary, and stream data when given. */
function object(number: number, dictionary: string, data?: Buffer, keyword = 'stream\n'): Buffer {
  if (!data) return Buffer.from(`${number} 0 obj\n${dictionary}\nendobj\n`, 'latin1');
  return Buffer.concat([
    Buffer.from(`${number} 0 obj\n${dictionary}\n${keyword}`, 'latin1'),
    data,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
}

/** A PDF-like file of these objects. */
function file(...objects: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.7\n', 'latin1'),
    ...objects,
    Buffer.from('trailer\n<< /Size 20 /Root 1 0 R >>\n%%EOF\n', 'latin1'),
  ]);
}

const scan = (pdf: Buffer) => prescanPdf(pdf, zlib, BUDGET);

/** ASCII85 of some bytes, as a PDF filter reads it. */
function ascii85(bytes: Buffer): Buffer {
  let out = '';
  for (let index = 0; index < bytes.length; index += 4) {
    const chunk = [0, 1, 2, 3].map((offset) => bytes[index + offset] ?? 0);
    let number = ((chunk[0] ?? 0) * 16_777_216 + ((chunk[1] ?? 0) << 16) + ((chunk[2] ?? 0) << 8) + (chunk[3] ?? 0)) >>> 0;
    const digits: string[] = [];
    for (let digit = 0; digit < 5; digit++) {
      digits.unshift(String.fromCharCode(33 + (number % 85)));
      number = Math.floor(number / 85);
    }
    out += digits.slice(0, Math.min(5, bytes.length - index + 1)).join('');
  }
  return Buffer.from(`${out}~>`, 'latin1');
}

// The measure the PDF worker runs before pdf.js: it reads a PDF as pdf.js does, and what it
// cannot read, it refuses.
describe('prescanPdf', () => {
  let bomb: Buffer;
  beforeAll(() => {
    // 64 MB of zeros: four times the budget of these tests.
    bomb = zlib.deflateSync(Buffer.alloc(64 * MB), { level: 9 });
  });

  describe('decoders', () => {
    it('decodes LZW as the PDF specification does (its own example)', () => {
      const lzw = Buffer.from([0x80, 0x0b, 0x60, 0x50, 0x22, 0x0c, 0x0c, 0x85, 0x01]);
      // "-----A---B": 10 bytes.
      expect(scan(file(object(1, '<< /Filter /LZWDecode >>', lzw)))).toEqual({
        ok: true,
        decodedBytes: 10,
        streams: 1,
        encrypted: false,
      });
    });

    it('bounds Flate, Brotli, RunLength, and follows ASCII85 into what it wraps', () => {
      const run = Buffer.alloc(2 * 400_000);
      for (let index = 0; index < run.length; index += 2) {
        run[index] = 129;
        run[index + 1] = 0x41;
      }
      expect(scan(file(object(1, '<< /Filter /FlateDecode >>', bomb)))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter /BrotliDecode >>', zlib.brotliCompressSync(Buffer.alloc(64 * MB)))))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter /RunLengthDecode >>', run)))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter [/ASCII85Decode /FlateDecode] >>', ascii85(bomb))))).toEqual(TOO_LARGE);
    });

    it('counts every stream, so many small ones cannot add up past the budget', () => {
      const small = zlib.deflateSync(Buffer.alloc(3 * MB));
      const many = file(...Array.from({ length: 10 }, (_, index) => object(index + 1, '<< /Filter /FlateDecode >>', small)));
      expect(scan(many)).toEqual(TOO_LARGE);
      expect(prescanPdf(many, zlib, 64 * MB)).toEqual({ ok: true, decodedBytes: 30 * MB, streams: 10, encrypted: false });
    });

    it('refuses damaged compressed data, but not a header pdf.js itself refuses', () => {
      const damaged = Buffer.concat([Buffer.from([0x78, 0x9c]), Buffer.from([0xff, 0xff, 0xff, 0xff])]);
      const badHeader = Buffer.from('not zlib at all');
      expect(scan(file(object(1, '<< /Filter /FlateDecode >>', damaged)))).toEqual(unreadable('a compressed stream is damaged'));
      // pdf.js decodes nothing from a stream whose header it refuses: nothing to measure.
      expect(scan(file(object(1, '<< /Filter /FlateDecode >>', badHeader)))).toMatchObject({ ok: true, decodedBytes: 0 });
    });
  });

  describe('the bypasses of review 2, each closed', () => {
    it('1. reads /F as well as /Filter', () => {
      expect(scan(file(object(1, '<< /F /FlateDecode >>', bomb)))).toEqual(TOO_LARGE);
    });

    it('2. resolves a /Filter given by reference, and refuses one it cannot resolve', () => {
      const name = object(7, '/FlateDecode');
      expect(scan(file(object(1, '<< /Filter 7 0 R >>', bomb), name))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter [7 0 R] >>', bomb), name))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter 9 0 R >>', bomb)))).toEqual(unreadable("a stream's /Filter cannot be resolved"));
    });

    it('3. decodes #xx escapes in names', () => {
      expect(scan(file(object(1, '<< /Filter /Flate#44ecode >>', bomb)))).toEqual(TOO_LARGE);
    });

    it('4. parses dictionaries for real: strings, comments, size', () => {
      expect(scan(file(object(1, '<< /Title (>>) /Filter /FlateDecode >>', bomb)))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Title (a >> b << c \\) d) /Filter /FlateDecode >>', bomb)))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter /FlateDecode >> % a comment >>', bomb)))).toEqual(TOO_LARGE);
      const padding = `(${'x'.repeat(70_000)})`;
      expect(scan(file(object(1, `<< /Filter /FlateDecode /Padding ${padding} >>`, bomb)))).toEqual(TOO_LARGE);
      // A stream dictionary it cannot read refuses the PDF.
      expect(scan(file(object(1, '<< /Filter /FlateDecode ) >>', bomb)))).toEqual(unreadable('a stream dictionary cannot be read'));
    });

    it('5. accepts spaces and tabs after the stream keyword', () => {
      expect(scan(file(object(1, '<< /Filter /FlateDecode >>', bomb, 'stream  \t\r\n')))).toEqual(TOO_LARGE);
    });

    it('6. measures the declared /Length, resolved, and the longer region when it disagrees', () => {
      // A stored block that holds the word "endstream", then the bomb: [zlib header][stored][deflate].
      const word = Buffer.from('endstream', 'latin1');
      const stored = Buffer.concat([Buffer.from([0x00, word.length, 0x00, ~word.length & 0xff, 0xff]), word]);
      const tricky = Buffer.concat([Buffer.from([0x78, 0x9c]), stored, zlib.deflateRawSync(Buffer.alloc(64 * MB), { level: 9 })]);
      expect(scan(file(object(1, '<< /Filter /FlateDecode /Length 8 0 R >>', tricky), object(8, String(tricky.length))))).toEqual(TOO_LARGE);
      // A /Length shorter than the data: the region runs to the first endstream.
      expect(scan(file(object(1, '<< /Filter /FlateDecode /Length 20 >>', bomb)))).toEqual(TOO_LARGE);
      expect(scan(file(object(1, '<< /Filter /FlateDecode /Length 8 0 R >>', bomb)))).toEqual(unreadable("a stream's /Length cannot be resolved"));
    });

    it('7. allows an image filter only last, on an image, and no unknown filter', () => {
      const jpeg = Buffer.from('not decoded for text');
      expect(scan(file(object(1, '<< /Filter [/DCTDecode /FlateDecode] >>', bomb)))).toEqual(
        unreadable('an image filter (/DCTDecode) is followed by another filter')
      );
      expect(scan(file(object(1, '<< /Filter [/CCITTFaxDecode /FlateDecode] >>', bomb)))).toEqual(
        unreadable('an image filter (/CCITTFaxDecode) is followed by another filter')
      );
      expect(scan(file(object(1, '<< /Filter [/Foo /FlateDecode] >>', bomb)))).toEqual(
        unreadable('a stream uses a filter that cannot be measured (/Foo)')
      );
      expect(scan(file(object(1, '<< /Filter /DCTDecode >>', jpeg)))).toEqual(
        unreadable('an image filter (/DCTDecode) is used on a stream that is not an image')
      );
      expect(scan(file(object(1, '<< /Type /XObject /Subtype /Image /Filter /DCTDecode >>', jpeg)))).toMatchObject({ ok: true });
      expect(
        scan(file(object(1, '<< /Subtype /Image /Filter [/FlateDecode /JBIG2Decode] >>', zlib.deflateSync(jpeg))))
      ).toMatchObject({ ok: true, decodedBytes: jpeg.length });
    });
  });

  it('measures object streams like any stream, and resolves references to the objects they hold', () => {
    // Object 12 (a length) lives in the object stream 5.
    const content = Buffer.from('12 0 7', 'latin1');
    const header = `<< /Type /ObjStm /N 1 /First 5 /Filter /FlateDecode >>`;
    const objectStream = object(5, header, zlib.deflateSync(content));
    const small = zlib.deflateSync(Buffer.from('BT (hello) Tj ET'));
    const lengthInside = Buffer.concat([objectStream, object(1, '<< /Filter /FlateDecode /Length 12 0 R >>', small)]);
    expect(scan(file(lengthInside))).toMatchObject({ ok: true, decodedBytes: content.length + 16 });
    // A bomb in an object stream is refused like any other.
    expect(scan(file(object(5, '<< /Type /ObjStm /N 0 /First 0 /Filter /FlateDecode >>', bomb)))).toEqual(TOO_LARGE);
  });

  it('lets an encrypted PDF through unmeasured, and says so', () => {
    const encrypted = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'latin1'),
      object(1, '<< /Filter /FlateDecode >>', bomb),
      Buffer.from('trailer\n<< /Size 3 /Root 2 0 R /Encrypt 3 0 R >>\n%%EOF\n', 'latin1'),
    ]);
    expect(scan(encrypted)).toEqual({ ok: true, decodedBytes: 0, streams: 1, encrypted: true });
  });

  it('refuses a file built to make its reading slow, quickly', () => {
    const hostile = Buffer.from(`%PDF-1.7\n${'1 0 obj ('.repeat(200_000)}`, 'latin1');
    const started = Date.now();
    expect(scan(hostile)).toEqual(unreadable('its structure is too complex to measure'));
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
