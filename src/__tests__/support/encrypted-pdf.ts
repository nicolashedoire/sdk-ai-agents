import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';

/**
 * How a test PDF is encrypted: the standard security handler (ISO 32000), the user password
 * empty unless `userPassword` says otherwise. Written apart from the pre-scan, from the
 * specification, so that the two check each other; pdf.js reading these files checks both.
 */
export type Security =
  | { v: 1 | 2; r: 2 | 3; bits: number }
  | { v: 4; cfm: 'V2' | 'AESV2' }
  | { v: 5; r: 5 | 6 };

/** One indirect object of a test PDF. */
export interface PdfPart {
  /** Its number, as references and the cross-reference table know it. */
  num: number;
  /** A dictionary (a stream's gets its /Length), or any other value. */
  body: string;
  /** Stream data, before encryption. */
  data?: Buffer;
  /** Its `N G obj` (by default `${num} 0 obj`): another form pdf.js reads, say. */
  header?: string;
  /** Where the cross-reference points, from the start of the header (default 0). */
  xrefShift?: number;
  /** Stream data written as it is, even in an encrypted PDF. */
  clear?: boolean;
}

export interface PdfOptions {
  security?: Security;
  /** The user password (empty by default: pdf.js opens the file without asking). */
  userPassword?: string;
  /** Written after the trailer, before `%%EOF`: another trailer, say. */
  appendix?: string;
}

const PADDING = Buffer.from(
  '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
  'hex'
);

const md5 = (...parts: Buffer[]) => createHash('md5').update(Buffer.concat(parts)).digest();
const sha = (bits: 256 | 384 | 512, data: Buffer) => createHash(`sha${bits}`).update(data).digest();
const hex = (data: Buffer) => `<${data.toString('hex')}>`;

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + (s[i] ?? 0) + (key[i % key.length] ?? 0)) % 256;
    [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let index = 0; index < data.length; index++) {
    i = (i + 1) % 256;
    j = (j + (s[i] ?? 0)) % 256;
    [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0];
    out[index] = (data[index] ?? 0) ^ (s[((s[i] ?? 0) + (s[j] ?? 0)) % 256] ?? 0);
  }
  return out;
}

function aes(
  bits: 128 | 256,
  key: Buffer,
  iv: Buffer | null,
  data: Buffer,
  padding: boolean
): Buffer {
  const cipher = createCipheriv(iv ? `aes-${bits}-cbc` : `aes-${bits}-ecb`, key, iv);
  cipher.setAutoPadding(padding);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** The hash of revision 6 (ISO 32000-2, algorithm 2.B). */
function hash2B(password: Buffer, salt: Buffer, userKey: Buffer): Buffer {
  let k = sha(256, Buffer.concat([password, salt, userKey]));
  for (let round = 0; ; round++) {
    const k1 = Buffer.concat(
      Array.from({ length: 64 }, () => Buffer.concat([password, k, userKey]))
    );
    const e = aes(128, k.subarray(0, 16), k.subarray(16, 32), k1, false);
    let sum = 0;
    for (let index = 0; index < 16; index++) sum += e[index] ?? 0;
    k = [sha(256, e), sha(384, e), sha(512, e)][sum % 3] ?? k;
    if (round >= 63 && (e[e.length - 1] ?? 0) <= round - 31) break;
  }
  return k.subarray(0, 32);
}

interface Encryptor {
  dictionary: string;
  encrypt(data: Buffer, num: number, gen: number): Buffer;
}

function encryptor(security: Security, id: Buffer, userPassword: string): Encryptor {
  const password = Buffer.from(userPassword, 'latin1');
  if (security.v === 5) {
    const fileKey = randomBytes(32);
    const hash = (input: Buffer, salt: Buffer, userKey: Buffer) =>
      security.r === 6
        ? hash2B(input, salt, userKey)
        : sha(256, Buffer.concat([input, salt, userKey]));
    const [userCheck, userKey, ownerCheck, ownerKey] = [
      randomBytes(8),
      randomBytes(8),
      randomBytes(8),
      randomBytes(8),
    ];
    const u = Buffer.concat([hash(password, userCheck, Buffer.alloc(0)), userCheck, userKey]);
    const ue = aes(256, hash(password, userKey, Buffer.alloc(0)), Buffer.alloc(16), fileKey, false);
    const owner = Buffer.from('owner');
    const o = Buffer.concat([hash(owner, ownerCheck, u), ownerCheck, ownerKey]);
    const oe = aes(256, hash(owner, ownerKey, u), Buffer.alloc(16), fileKey, false);
    const perms = aes(
      256,
      fileKey,
      null,
      Buffer.from([
        0xfc, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x54, 0x61, 0x64, 0x62, 0, 0, 0, 0,
      ]),
      false
    );
    return {
      dictionary: `<< /Filter /Standard /V 5 /R ${security.r} /Length 256 /CF << /StdCF << /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> /StmF /StdCF /StrF /StdCF /O ${hex(o)} /U ${hex(u)} /OE ${hex(oe)} /UE ${hex(ue)} /Perms ${hex(perms)} /P -4 >>`,
      encrypt: (data) => {
        const iv = randomBytes(16);
        return Buffer.concat([iv, aes(256, fileKey, iv, data, true)]);
      },
    };
  }
  const revision = security.v === 4 ? 4 : security.r;
  const bits = security.v === 4 ? 128 : security.bits;
  const n = bits / 8;
  // Any owner entry will do: the key comes from the user password and from it.
  const o = sha(256, Buffer.from('owner'));
  const p = Buffer.alloc(4);
  p.writeInt32LE(-4);
  let digest = md5(Buffer.concat([password, PADDING]).subarray(0, 32), o, p, id);
  if (revision >= 3) for (let round = 0; round < 50; round++) digest = md5(digest.subarray(0, n));
  const key = digest.subarray(0, n);
  let u: Buffer;
  if (revision >= 3) {
    let check = rc4(key, md5(PADDING, id));
    for (let round = 1; round <= 19; round++)
      check = rc4(Buffer.from(key.map((byte) => byte ^ round)), check);
    u = Buffer.concat([check, Buffer.alloc(16)]);
  } else u = rc4(key, PADDING);
  const aesV2 = security.v === 4 && security.cfm === 'AESV2';
  const objectKey = (num: number, gen: number) => {
    const salt = aesV2 ? Buffer.from('sAlT', 'latin1') : Buffer.alloc(0);
    const input = Buffer.concat([
      key,
      Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]),
      salt,
    ]);
    return md5(input).subarray(0, Math.min(n + 5, 16));
  };
  const filters =
    security.v === 4
      ? ` /CF << /StdCF << /CFM /${security.cfm} /AuthEvent /DocOpen /Length 16 >> >> /StmF /StdCF /StrF /StdCF`
      : '';
  return {
    dictionary: `<< /Filter /Standard /V ${security.v} /R ${revision} /Length ${bits}${filters} /O ${hex(o)} /U ${hex(u)} /P -4 >>`,
    encrypt: (data, num, gen) => {
      if (!aesV2) return rc4(objectKey(num, gen), data);
      const iv = randomBytes(16);
      return Buffer.concat([iv, aes(128, objectKey(num, gen), iv, data, true)]);
    },
  };
}

/**
 * A whole PDF of these objects, with a cross-reference table that points at each (as its part
 * says), encrypted as `options.security` says. Object 1 is the catalog.
 */
export function buildPdf(parts: PdfPart[], options: PdfOptions = {}): Buffer {
  const id = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const security = options.security && encryptor(options.security, id, options.userPassword ?? '');
  const encryptNum = Math.max(...parts.map((part) => part.num)) + 1;
  const chunks: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let length = chunks[0]?.length ?? 0;
  const add = (chunk: Buffer) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const offsets = new Map<number, number>();
  for (const part of parts) {
    offsets.set(part.num, length + (part.xrefShift ?? 0));
    const header = `${part.header ?? `${part.num} 0 obj`}\n`;
    if (!part.data) {
      add(Buffer.from(`${header}${part.body}\nendobj\n`, 'latin1'));
      continue;
    }
    const data = security && !part.clear ? security.encrypt(part.data, part.num, 0) : part.data;
    const dictionary = part.body.includes('/Length')
      ? part.body
      : part.body.replace(/>>\s*$/, `/Length ${data.length} >>`);
    add(
      Buffer.concat([
        Buffer.from(`${header}${dictionary}\nstream\n`, 'latin1'),
        data,
        Buffer.from('\nendstream\nendobj\n', 'latin1'),
      ])
    );
  }
  if (security) {
    offsets.set(encryptNum, length);
    add(Buffer.from(`${encryptNum} 0 obj\n${security.dictionary}\nendobj\n`, 'latin1'));
  }
  const size = Math.max(...offsets.keys()) + 1;
  const xref = length;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let num = 1; num < size; num++) {
    const offset = offsets.get(num);
    table +=
      offset === undefined
        ? '0000000000 00001 f \n'
        : `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  const encrypt = security ? ` /Encrypt ${encryptNum} 0 R /ID [${hex(id)} ${hex(id)}]` : '';
  table += `trailer\n<< /Size ${size} /Root 1 0 R${encrypt} >>\n${options.appendix ?? ''}startxref\n${xref}\n%%EOF\n`;
  add(Buffer.from(table, 'latin1'));
  return Buffer.concat(chunks);
}

/** A one-page document whose page draws `text` from content stream `contentNum`. */
export function pageParts(
  content: Buffer,
  contentNum = 5,
  contentPart: Partial<PdfPart> = {}
): PdfPart[] {
  return [
    { num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { num: 2, body: '<< /Type /Pages /Kids [4 0 R] /Count 1 >>' },
    { num: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
    {
      num: 4,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`,
    },
    { num: contentNum, body: '<< /Filter /FlateDecode >>', data: content, ...contentPart },
  ];
}

/** A content stream that draws `text`, Flate-compressed. */
export function drawing(text: string): Buffer {
  return deflateSync(Buffer.from(`BT /F1 18 Tf 72 720 Td (${text}) Tj ET`, 'latin1'));
}
