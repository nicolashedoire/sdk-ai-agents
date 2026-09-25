import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createDeflate, deflateSync } from 'node:zlib';

/**
 * A real, valid PDF: one page per text, in Helvetica, with a title and a creation date in its
 * document information. The cross-reference table holds the true byte offsets, so any PDF
 * reader opens it without repairing it.
 */
export function tinyPdf(
  pages: string[],
  info: { title?: string; creationDate?: string } = {}
): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  pages.forEach((text, index) => {
    const escaped = text.replace(/[\\()]/g, (char) => `\\${char}`);
    const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  });
  const fields = [
    info.title ? `/Title (${info.title})` : '',
    info.creationDate ? `/CreationDate (${info.creationDate})` : '',
  ].filter(Boolean);
  objects.push(`<< ${fields.join(' ')} >>`);
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * A valid one-page PDF whose content stream inflates to `megabytes` MB of spaces: a Flate
 * bomb, a few hundred kilobytes on the wire. Compressed as a stream, so building it never
 * holds the inflated data.
 */
export async function flateBombPdf(
  megabytes: number,
  options: { unit?: string; times?: number } = {}
): Promise<Buffer> {
  const deflate = createDeflate({ level: 9 });
  const chunks: Buffer[] = [];
  deflate.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    deflate.on('end', resolve);
    deflate.on('error', reject);
  });
  const block = Buffer.alloc(1_048_576, options.unit ?? ' ');
  for (let index = 0; index < megabytes; index++) {
    if (!deflate.write(block)) await once(deflate, 'drain');
  }
  deflate.end();
  await ended;
  // Compressed again, `times` times in all: a chained Flate filter.
  let stream = Buffer.concat(chunks);
  const times = options.times ?? 1;
  for (let round = 1; round < times; round++) stream = deflateSync(stream, { level: 9 });
  const filter = Array.from({ length: times }, () => '/FlateDecode').join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let length = parts[0]?.length ?? 0;
  const offsets: number[] = [];
  const add = (part: Buffer) => {
    parts.push(part);
    length += part.length;
  };
  objects.forEach((body, index) => {
    offsets.push(length);
    add(Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, 'latin1'));
  });
  offsets.push(length);
  add(
    Buffer.from(`5 0 obj\n<< /Length ${stream.length} /Filter [${filter}] >>\nstream\n`, 'latin1')
  );
  add(stream);
  add(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  const xref = length;
  let tail = 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) tail += `${String(offset).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  add(Buffer.from(tail, 'latin1'));
  return Buffer.concat(parts);
}

/**
 * A PDF as real ones are: pages of Flate-compressed text, a JPEG image drawn on each page (its
 * DCT data, which text extraction never decodes), and a large binary stream (as an embedded
 * font would be). About 1.6 MB for the default 15 pages. With `indirectLength`, every stream's
 * `/Length` is a reference to an object written after it, as pdfTeX writes them.
 */
export function realisticPdf(pages = 15, options: { indirectLength?: boolean } = {}): Buffer {
  const parts: Buffer[] = [];
  let length = 0;
  const offsets: number[] = [];
  const add = (part: Buffer) => {
    parts.push(part);
    length += part.length;
  };
  const firstLength = 6 + pages * 2;
  let nextLength = firstLength;
  const lengthObjects: Array<[number, number]> = [];
  const object = (number: number, dictionary: string, stream?: Buffer) => {
    offsets[number] = length;
    if (!stream) {
      add(Buffer.from(`${number} 0 obj\n${dictionary}\nendobj\n`, 'latin1'));
      return;
    }
    let lengthEntry = String(stream.length);
    if (options.indirectLength) {
      lengthEntry = `${nextLength} 0 R`;
      lengthObjects.push([nextLength++, stream.length]);
    }
    add(
      Buffer.from(`${number} 0 obj\n<< ${dictionary} /Length ${lengthEntry} >>\nstream\n`, 'latin1')
    );
    add(stream);
    add(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    // pdfTeX writes the length right after the stream.
    const written = lengthObjects.at(-1);
    if (options.indirectLength && written) object(written[0], String(written[1]));
  };
  add(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
  const pageNumbers = Array.from({ length: pages }, (_, index) => 6 + index * 2);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pages} >>`
  );
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  object(
    4,
    '/Type /XObject /Subtype /Image /Width 400 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
    randomBytes(40_000)
  );
  // A large binary stream, compressed as a font program would be: it barely shrinks.
  object(5, '/Filter /FlateDecode', deflateSync(randomBytes(1_600_000), { level: 1 }));
  pageNumbers.forEach((number, index) => {
    const lines = Array.from(
      { length: 60 },
      (_, line) =>
        `BT /F1 10 Tf 50 ${760 - line * 12} Td (Page ${index + 1}, line ${line + 1}: the fragment tree is immutable.) Tj ET`
    ).join('\n');
    const content = `q 200 0 0 150 300 20 cm /Im1 Do Q\n${lines}`;
    object(
      number,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents ${number + 1} 0 R >>`
    );
    object(number + 1, '/Filter /FlateDecode', deflateSync(content));
  });
  const count = nextLength;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let number = 1; number < count; number++) {
    table += `${String(offsets[number] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  table += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  add(Buffer.from(table, 'latin1'));
  return Buffer.concat(parts);
}
