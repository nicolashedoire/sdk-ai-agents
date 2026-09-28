import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';

/**
 * A self-signed certificate for `127.0.0.1` and `localhost`, made when the test runs (valid
 * one day either side of now): its own authority, trusted by a client given it as `ca`.
 */
export function selfSignedCertificate(): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ecdsaWithSha256 = seq(oid('1.2.840.10045.4.3.2'));
  const name = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from('127.0.0.1')))));
  const day = 86_400_000;
  const validity = seq(utcTime(new Date(Date.now() - day)), utcTime(new Date(Date.now() + day)));
  const altNames = seq(tlv(0x87, Buffer.from([127, 0, 0, 1])), tlv(0x82, Buffer.from('localhost')));
  const extensions = tlv(
    0xa3,
    seq(
      seq(oid('2.5.29.17'), tlv(0x04, altNames)),
      seq(
        oid('2.5.29.19'),
        tlv(0x01, Buffer.from([0xff])),
        tlv(0x04, seq(tlv(0x01, Buffer.from([0xff]))))
      )
    )
  );
  const serial = randomBytes(8);
  serial[0] = (serial[0] ?? 0) & 0x7f;
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, serial),
    ecdsaWithSha256,
    name,
    validity,
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    extensions
  );
  const signature = sign('sha256', tbs, privateKey);
  const certificate = seq(
    tbs,
    ecdsaWithSha256,
    tlv(0x03, Buffer.concat([Buffer.from([0]), signature]))
  );
  const body = certificate.toString('base64').replace(/.{1,64}/g, '$&\n');
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    cert: `-----BEGIN CERTIFICATE-----\n${body}-----END CERTIFICATE-----\n`,
  };
}

/** A DER element: its tag, its length, its content. */
function tlv(tag: number, content: Buffer): Buffer {
  const length = content.length;
  let head: number[];
  if (length < 0x80) head = [length];
  else {
    const bytes: number[] = [];
    for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
    head = [0x80 | bytes.length, ...bytes];
  }
  return Buffer.concat([Buffer.from([tag, ...head]), content]);
}

const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items));

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const bytes = [first * 40 + second];
  for (const arc of rest) {
    const digits = [arc & 0x7f];
    for (let value = arc >> 7; value > 0; value >>= 7) digits.unshift((value & 0x7f) | 0x80);
    bytes.push(...digits);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function utcTime(date: Date): Buffer {
  const two = (value: number) => String(value).padStart(2, '0');
  const text = `${two(date.getUTCFullYear() % 100)}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(text));
}
