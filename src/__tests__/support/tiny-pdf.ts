import { once } from 'node:events';
import { createDeflate } from 'node:zlib';

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
export async function flateBombPdf(megabytes: number): Promise<Buffer> {
  const deflate = createDeflate({ level: 9 });
  const chunks: Buffer[] = [];
  deflate.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    deflate.on('end', resolve);
    deflate.on('error', reject);
  });
  const block = Buffer.alloc(1_048_576, 0x20);
  for (let index = 0; index < megabytes; index++) {
    if (!deflate.write(block)) await once(deflate, 'drain');
  }
  deflate.end();
  await ended;
  const stream = Buffer.concat(chunks);
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
    Buffer.from(`5 0 obj\n<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`, 'latin1')
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
