import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { prescanPdf } from '../tools/web/pdf-prescan.js';

const MB = 1_048_576;

/** A PDF-like file holding one stream with these filters and bytes. */
function withStream(filters: string, data: Buffer, extra = ''): Buffer {
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${data.length} /Filter ${filters}${extra} >>\nstream\n`, 'latin1'),
    data,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
}

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

// The measure the PDF worker runs before pdf.js: every expanding decoder is bounded.
describe('prescanPdf', () => {
  it('decodes LZW as the PDF specification does (its own example)', () => {
    const verdict = prescanPdf(withStream('/LZWDecode', Buffer.from([0x80, 0x0b, 0x60, 0x50, 0x22, 0x0c, 0x0c, 0x85, 0x01])), zlib, MB);
    // "-----A---B": 10 bytes.
    expect(verdict).toEqual({ ok: true, decodedBytes: 10, streams: 1 });
  });

  it('bounds RunLength: 64 times its size', () => {
    const run = Buffer.alloc(2 * 400_000);
    for (let index = 0; index < run.length; index += 2) {
      run[index] = 129;
      run[index + 1] = 0x41;
    }
    expect(prescanPdf(withStream('/RunLengthDecode', run), zlib, 16 * MB)).toEqual({
      ok: false,
      reason: 'its streams inflate to more than 16 MB',
    });
  });

  it('follows ASCII85 into the Flate bomb it wraps', () => {
    const bomb = zlib.deflateSync(Buffer.alloc(64 * MB), { level: 9 });
    expect(prescanPdf(withStream('[/ASCII85Decode /FlateDecode]', ascii85(bomb)), zlib, 16 * MB)).toEqual({
      ok: false,
      reason: 'its streams inflate to more than 16 MB',
    });
  });

  it('counts every stream, so many small ones cannot add up past the budget', () => {
    const one = withStream('/FlateDecode', zlib.deflateSync(Buffer.alloc(3 * MB)));
    const many = Buffer.concat(Array.from({ length: 10 }, () => one));
    expect(prescanPdf(many, zlib, 16 * MB)).toEqual({ ok: false, reason: 'its streams inflate to more than 16 MB' });
    expect(prescanPdf(many, zlib, 64 * MB)).toEqual({ ok: true, decodedBytes: 30 * MB, streams: 10 });
  });

  it('leaves unknown filters and malformed streams to pdf.js', () => {
    const jpeg = withStream('/DCTDecode', Buffer.from('not really a jpeg'));
    const broken = withStream('/FlateDecode', Buffer.from('not zlib at all'));
    const indirect = withStream('/FlateDecode', zlib.deflateSync(Buffer.from('text')), ' /DecodeParms << /Predictor 12 /Columns 4 >>');
    expect(prescanPdf(Buffer.concat([jpeg, broken, indirect]), zlib, MB)).toEqual({ ok: true, decodedBytes: 4, streams: 3 });
  });
});
