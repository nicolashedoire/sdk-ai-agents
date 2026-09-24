/**
 * Cuts a text to `max` characters, marking the cut with an ellipsis. The kept part is a
 * copy: a plain `slice` would keep the whole original string alive in memory (V8 "sliced
 * strings"), however short the result.
 */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const kept = Buffer.from(text.slice(0, Math.max(0, max - 1)), 'utf8').toString('utf8');
  return `${kept}…`;
}

/** The part of a web `ReadableStream` needed to read a body chunk by chunk. */
export interface ByteStream {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    cancel(reason?: unknown): Promise<void>;
  };
}

export interface BoundedText {
  text: string;
  /** True when the body was longer than the limit and was cut. */
  truncated: boolean;
}

/**
 * Reads at most `maxBytes` of a response body. With a stream, the rest is never downloaded;
 * without one, the whole text is read and cut.
 */
export async function readBoundedText(
  response: { body?: ByteStream | null; text(): Promise<string> },
  maxBytes: number
): Promise<BoundedText> {
  if (!response.body) {
    const text = await response.text();
    const bytes = Buffer.from(text, 'utf8');
    return bytes.length <= maxBytes
      ? { text, truncated: false }
      : { text: decodeUtf8Prefix(bytes.subarray(0, maxBytes)), truncated: true };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const body = Buffer.concat(chunks);
  return { text: decodeUtf8Prefix(body.subarray(0, maxBytes)), truncated };
}

/** Decodes UTF-8 bytes that may end in the middle of a character, dropping that half. */
export function decodeUtf8Prefix(bytes: Uint8Array): string {
  // In streaming mode an incomplete trailing sequence is held back instead of replaced.
  return new TextDecoder('utf-8').decode(bytes, { stream: true });
}
