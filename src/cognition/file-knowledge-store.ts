import { appendFile, mkdir, readFile } from 'node:fs/promises';
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
 * learned. Writes are serialized within a process; several processes writing the same
 * scope at once should use a database-backed store instead.
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
      await appendFile(this.journalPath(parsed.scope), `${JSON.stringify(parsed)}\n`, 'utf8');
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

  private async readJournal(scope: string): Promise<KnowledgeEntry[]> {
    let text: string;
    try {
      text = await readFile(this.journalPath(scope), 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    return text
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.trim() !== '')
      .map(({ line, number }) => {
        try {
          return parseKnowledgeEntry(JSON.parse(line));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new ValidationError(
            `knowledge.${scope}:${number}`,
            `unreadable journal line: ${reason}`
          );
        }
      });
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'ENOENT';
}
