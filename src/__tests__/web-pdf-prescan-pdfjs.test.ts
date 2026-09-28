import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { prescanPdf } from '../tools/web/pdf-prescan.js';
import { pdfText } from '../tools/web/pdf-text.js';
import {
  buildPdf,
  drawing,
  type PdfPart,
  pageParts,
  type Security,
} from './support/encrypted-pdf.js';

const MB = 1_048_576;
const BUDGET = 16 * MB;
const TOO_LARGE = {
  ok: false,
  reason: 'its streams inflate to more than 16 MB',
  kind: 'too-large',
};
const scan = (pdf: Buffer) => prescanPdf(pdf, zlib, BUDGET, crypto);
/** What pdf.js reads of the first page, through the PDF worker (pre-scan, then pdf.js). */
const read = async (pdf: Buffer) => (await pdfText(pdf, { maxPages: 1, maxDecodedMb: 16 })).content;

const SECURITIES: Array<[string, Security]> = [
  ['RC4 40-bit (revision 2)', { v: 1, r: 2, bits: 40 }],
  ['RC4 128-bit (revision 3)', { v: 2, r: 3, bits: 128 }],
  ['RC4 crypt filters (revision 4)', { v: 4, cfm: 'V2' }],
  ['AES-128 (revision 4)', { v: 4, cfm: 'AESV2' }],
  ['AES-256 (revision 5)', { v: 5, r: 5 }],
  ['AES-256 (revision 6)', { v: 5, r: 6 }],
];

// Issue #34: the streams pdf.js reads that the pre-scan did not measure. Each case is shown
// twice: pdf.js reads the harmless file (so the path is real), and the pre-scan refuses the
// same file with a bomb in it.
describe('the pre-scan measures what pdf.js reads (#34)', () => {
  let bomb: Buffer;
  beforeAll(() => {
    // 64 MB of zeros: four times the budget of these tests.
    bomb = zlib.deflateSync(Buffer.alloc(64 * MB), { level: 9 });
  });

  describe('encrypted PDFs, decrypted as pdf.js decrypts them', () => {
    it.each(SECURITIES)(
      '%s: read by pdf.js, measured by the pre-scan',
      async (_, security) => {
        const pdf = buildPdf(pageParts(drawing('Hello, secret world')), { security });

        expect(await read(pdf)).toBe('Hello, secret world');
        expect(scan(pdf)).toMatchObject({
          ok: true,
          encrypted: true,
          decodedBytes: 'BT /F1 18 Tf 72 720 Td (Hello, secret world) Tj ET'.length,
        });
        expect(scan(buildPdf(pageParts(bomb), { security }))).toEqual(TOO_LARGE);
      },
      30_000
    );

    it('refuses a bomb in an encrypted PDF before pdf.js reads it', async () => {
      const pdf = buildPdf(pageParts(bomb), { security: { v: 4, cfm: 'AESV2' } });

      await expect(read(pdf)).rejects.toThrow(
        'The PDF is refused: its streams inflate to more than 16 MB'
      );
    }, 30_000);

    it('refuses a PDF protected by a password, which pdf.js cannot open either', async () => {
      for (const security of [
        { v: 2, r: 3, bits: 128 },
        { v: 5, r: 6 },
      ] satisfies Security[]) {
        const pdf = buildPdf(pageParts(drawing('Locked')), { security, userPassword: 'secret' });

        expect(scan(pdf)).toEqual({
          ok: false,
          kind: 'unreadable',
          reason: 'it is protected by a password',
        });
        const opened = await pdfText(pdf, { maxPages: 1 }).catch((error: Error) => error);
        expect(String(opened)).toMatch(/refused: it is protected by a password/);
      }
      // pdf.js itself: without the pre-scan's refusal, it asks for the password.
      const { getDocumentProxy } = await import('unpdf');
      const locked = buildPdf(pageParts(drawing('Locked')), {
        security: { v: 5, r: 6 },
        userPassword: 'secret',
      });
      await expect(getDocumentProxy(new Uint8Array(locked))).rejects.toThrow(/password/i);
    }, 30_000);

    it('decrypts a stream under a shorter number the cross-reference points inside', async () => {
      // `123 0 obj`, and the cross-reference points at `23 0 obj` inside it: pdf.js reads object
      // 23 there, and decrypts it with 23's key.
      const inside: Partial<PdfPart> = { header: '123 0 obj', xrefShift: 1 };
      const security: Security = { v: 2, r: 3, bits: 128 };

      expect(
        await read(
          buildPdf(pageParts(drawing('Read inside another number'), 23, inside), { security })
        )
      ).toBe('Read inside another number');
      expect(scan(buildPdf(pageParts(bomb, 23, inside), { security }))).toEqual(TOO_LARGE);
    }, 30_000);

    it('counts, under a shorter number, what a damaged stream inflates to before the damage', () => {
      // 10 MB, then a block pdf.js cannot read: pdf.js has decoded the 10 MB when it fails.
      const damaged = Buffer.concat([
        zlib.deflateSync(Buffer.alloc(10 * MB), { finishFlush: zlib.constants.Z_FULL_FLUSH }),
        Buffer.from([0xff, 0xff]),
      ]);
      const whole = zlib.deflateSync(Buffer.alloc(10 * MB));
      const parts = [
        ...pageParts(damaged, 23, { header: '123 0 obj', xrefShift: 1 }),
        { num: 6, body: '<< /Filter /FlateDecode >>', data: whole },
      ];

      expect(scan(buildPdf(parts, { security: { v: 2, r: 3, bits: 128 } }))).toEqual(TOO_LARGE);
    });

    it('measures a stream of cross-references decrypted too, since a reference would get it so', () => {
      const parts = [
        ...pageParts(drawing('x')),
        { num: 9, body: '<< /Type /XRef /Filter /FlateDecode >>', data: bomb },
      ];

      expect(scan(buildPdf(parts, { security: { v: 2, r: 3, bits: 128 } }))).toEqual(TOO_LARGE);
    });

    it('measures the streams as they are too, when a trailer pdf.js may read names no encryption', () => {
      const parts = [
        ...pageParts(drawing('x')),
        { num: 9, body: '<< /Filter /FlateDecode >>', data: bomb, clear: true },
      ];
      const pdf = buildPdf(parts, {
        security: { v: 4, cfm: 'AESV2' },
        appendix: 'trailer\n<< /Size 11 /Root 1 0 R >>\n',
      });

      expect(scan(pdf)).toEqual(TOO_LARGE);
    });

    it('reads a stream a /Crypt filter leaves in clear (/Identity) as it is', async () => {
      const identity: Partial<PdfPart> = {
        body: '<< /Filter [/Crypt /FlateDecode] /DecodeParms [<< /Name /Identity >> null] >>',
        clear: true,
      };

      expect(
        await read(
          buildPdf(pageParts(drawing('Left in clear'), 5, identity), {
            security: { v: 4, cfm: 'AESV2' },
          })
        )
      ).toBe('Left in clear');
      expect(
        scan(buildPdf(pageParts(bomb, 5, identity), { security: { v: 4, cfm: 'AESV2' } }))
      ).toEqual(TOO_LARGE);
    }, 30_000);
  });

  describe('objects written in forms pdf.js reads', () => {
    const FORMS: Array<[string, string]> = [
      ['a comment between the numbers', '5 % a comment\n0 obj'],
      ['a number of eleven digits', '00000000005 0 obj'],
      ['no space before obj', '5 0obj'],
    ];

    it.each(FORMS)(
      '%s',
      async (_, header) => {
        const form: Partial<PdfPart> = { header };

        expect(await read(buildPdf(pageParts(drawing('Written oddly'), 5, form)))).toBe(
          'Written oddly'
        );
        expect(scan(buildPdf(pageParts(bomb, 5, form)))).toEqual(TOO_LARGE);
        // Encrypted, the stream is decrypted with the number read from that form.
        const security: Security = { v: 4, cfm: 'AESV2' };
        expect(
          await read(buildPdf(pageParts(drawing('Written oddly'), 5, form), { security }))
        ).toBe('Written oddly');
        expect(scan(buildPdf(pageParts(bomb, 5, form), { security }))).toEqual(TOO_LARGE);
      },
      30_000
    );

    it('a dictionary key that is not a name, which pdf.js skips, before a long string and an endobj in it', async () => {
      const body = `<< 1 /Title (endobj ${'x'.repeat(70_000)}) /Filter /FlateDecode >>`;

      expect(await read(buildPdf(pageParts(drawing('Skipped a key'), 5, { body })))).toBe(
        'Skipped a key'
      );
      expect(scan(buildPdf(pageParts(bomb, 5, { body })))).toEqual(TOO_LARGE);
    }, 30_000);

    it('refuses a stream inside another object, or an inline image in an object', () => {
      const nested = Buffer.concat([
        Buffer.from('%PDF-1.7\n1 0 obj\n[ << /Filter /FlateDecode >> stream\n', 'latin1'),
        bomb,
        Buffer.from('\nendstream ]\nendobj\n', 'latin1'),
      ]);
      expect(prescanPdf(nested, zlib, BUDGET, crypto)).toEqual({
        ok: false,
        kind: 'unreadable',
        reason: 'a stream is inside another object, where pdf.js would read it',
      });
      const image = Buffer.from('%PDF-1.7\n1 0 obj\nBI /W 1 /H 1 ID x EI\nendobj\n', 'latin1');
      expect(prescanPdf(image, zlib, BUDGET, crypto)).toMatchObject({
        ok: false,
        reason: 'an object holds an inline image, which pdf.js would read',
      });
    });
  });

  describe('object streams', () => {
    it('refuses one that holds a stream, with or without /Type /ObjStm', () => {
      for (const type of ['/Type /ObjStm ', '']) {
        const member = Buffer.concat([
          Buffer.from('<< /Filter /FlateDecode >> stream\n', 'latin1'),
          bomb,
          Buffer.from('\nendstream', 'latin1'),
        ]);
        const content = Buffer.concat([Buffer.from('7 0 ', 'latin1'), member]);
        const parts = [
          ...pageParts(drawing('x')),
          {
            num: 6,
            body: `<< ${type}/N 1 /First 4 /Filter /FlateDecode >>`,
            data: zlib.deflateSync(content),
          },
        ];

        expect(scan(buildPdf(parts))).toEqual({
          ok: false,
          kind: 'unreadable',
          reason: 'an object stream holds a stream, which pdf.js would read',
        });
      }
    });
  });

  describe('predictors', () => {
    it('counts the rows a predictor writes, which /Columns can make huge', () => {
      // Ten bytes that pdf.js turns into one row of 100 MB.
      const tiny = zlib.deflateSync(Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
      const parts = [
        ...pageParts(drawing('x')),
        {
          num: 6,
          body: '<< /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 100000000 >> >>',
          data: tiny,
        },
      ];

      expect(scan(buildPdf(parts))).toEqual(TOO_LARGE);
    });

    it('decodes a PNG predictor as pdf.js does, for an object stream behind one', () => {
      // Object 7 (the content's length) lives in an object stream written with the PNG "sub"
      // predictor: read wrong, the length could not be resolved.
      const text = zlib.deflateSync(Buffer.from('BT (hello) Tj ET', 'latin1'));
      const content = Buffer.from(`7 0 ${text.length}`, 'latin1');
      const sub = content.map(
        (byte, index) => (byte - (index > 0 ? (content[index - 1] ?? 0) : 0)) & 255
      );
      const objectStream = {
        num: 6,
        body: `<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns ${content.length} >> >>`,
        data: zlib.deflateSync(Buffer.concat([Buffer.from([1]), sub])),
      };
      const parts = [
        ...pageParts(text, 5, { body: '<< /Filter /FlateDecode /Length 7 0 R >>' }),
        objectStream,
      ];

      expect(scan(buildPdf(parts))).toEqual({
        ok: true,
        encrypted: false,
        streams: 2,
        decodedBytes: 1 + content.length + content.length + 16,
      });
    });
  });
});
