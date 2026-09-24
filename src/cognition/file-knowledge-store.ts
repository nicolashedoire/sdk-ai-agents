import { appendFile, mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ValidationError } from '../errors/index.js';
import {
  projectKnowledge,
  rankKnowledge,
  type KnowledgeEntry,
  type KnowledgeFinding,
  type KnowledgeItem,
} from './knowledge-records.js';
import {
  parseKnowledgeEntry,
  parseKnowledgeScope,
  type KnowledgeStore,
} from './knowledge-store.js';

/**
 * Keeps each scope's journal in `<directory>/<scope>.jsonl`, one line per run. Lines are
 * only appended, never rewritten, so the file is also a readable history of what was
 * learned. Writes through one instance are serialized: share one instance between the
 * agents of a process. Two instances or two processes writing the same scope are not
 * coordinated; use a database-backed store for that.
 */
export class FileKnowledgeStore implements KnowledgeStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {}

  async recall(query: { scope: string; goal: string; limit: number }): Promise<KnowledgeItem[]> {
    return rankKnowledge(await this.list(query.scope), query.goal, query.limit);
  }

  async record(entry: {
    scope: string;
    runId: string;
    recordedAt: number;
    findings: KnowledgeFinding[];
  }): Promise<void> {
    const parsed = parseKnowledgeEntry(entry);
    const write = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const path = this.journalPath(parsed.scope);
      // A write interrupted earlier may have left a line without its end: start a new one.
      const separator = (await endsWithNewline(path)) ? '' : '\n';
      await appendFile(path, `${separator}${JSON.stringify(parsed)}\n`, 'utf8');
    });
    // A failed write must not block the next ones; the caller still sees its own failure.
    this.pending = write.catch(() => undefined);
    return write;
  }

  async list(scope: string): Promise<KnowledgeItem[]> {
    return projectKnowledge(await this.readJournal(parseKnowledgeScope(scope)));
  }

  private journalPath(scope: string): string {
    return join(this.directory, `${scope}.jsonl`);
  }

  /**
   * Reads a journal. A line that is not JSON at all is the trace of an interrupted write: it
   * was never recorded, so it is skipped with a warning. A JSON line that is not a valid entry
   * means the file was altered: reading stops with the line number.
   */
  private async readJournal(scope: string): Promise<KnowledgeEntry[]> {
    let text: string;
    try {
      text = await readFile(this.journalPath(scope), 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    const entries: KnowledgeEntry[] = [];
    text.split('\n').forEach((line, index) => {
      if (line.trim() === '') return;
      const json = parseJson(line);
      if (!json.ok) {
        console.warn(`Knowledge journal ${scope}, line ${index + 1}: interrupted write skipped`);
        return;
      }
      let entry: KnowledgeEntry;
      try {
        entry = parseKnowledgeEntry(json.value);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new ValidationError(
          `knowledge.${scope}:${index + 1}`,
          `invalid journal entry: ${reason}`
        );
      }
      // A file is only ever read for its own scope.
      if (entry.scope === scope) entries.push(entry);
    });
    return entries;
  }
}

function parseJson(line: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch {
    return { ok: false };
  }
}

async function endsWithNewline(path: string): Promise<boolean> {
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(path, 'r');
  } catch (error) {
    if (isMissingFile(error)) return true;
    throw error;
  }
  try {
    const { size } = await file.stat();
    if (size === 0) return true;
    const last = Buffer.alloc(1);
    await file.read(last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    await file.close();
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'ENOENT';
}
