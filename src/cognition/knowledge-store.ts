import { ValidationError } from '../errors/index.js';
import {
  knowledgeEntrySchema,
  knowledgeScopeSchema,
  projectKnowledge,
  rankKnowledge,
  type KnowledgeEntry,
  type KnowledgeFinding,
  type KnowledgeItem,
} from './knowledge-records.js';

/**
 * Where cognitive agents keep what their tests established, across runs. A store keeps
 * an append-only journal per scope and folds it into items: recording never overwrites
 * evidence, and the items can always be rebuilt from the journal.
 */
export interface KnowledgeStore {
  /** The items most relevant to a goal, at most `limit`. */
  recall(query: { scope: string; goal: string; limit: number }): Promise<KnowledgeItem[]>;
  /** Appends the findings of one run. Recording the same run twice adds nothing. */
  record(entry: {
    scope: string;
    runId: string;
    recordedAt: number;
    findings: KnowledgeFinding[];
  }): Promise<void>;
  /** Every item of a scope, in the order they were first recorded. */
  list(scope: string): Promise<KnowledgeItem[]>;
}

/** Validates an entry before it is written; stores share it so they accept the same data. */
export function parseKnowledgeEntry(entry: unknown): KnowledgeEntry {
  const parsed = knowledgeEntrySchema.safeParse(entry);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(
      `knowledge.${issue?.path.join('.') ?? ''}`,
      issue?.message ?? 'invalid knowledge entry'
    );
  }
  return parsed.data;
}

export function parseKnowledgeScope(scope: string): string {
  const parsed = knowledgeScopeSchema.safeParse(scope);
  if (!parsed.success) {
    throw new ValidationError(
      'knowledge.scope',
      parsed.error.issues[0]?.message ?? 'invalid scope'
    );
  }
  return parsed.data;
}

/** Keeps the journal in memory: for tests, prototypes and short-lived processes. */
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly journals = new Map<string, KnowledgeEntry[]>();

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
    const journal = this.journals.get(parsed.scope) ?? [];
    journal.push(structuredClone(parsed));
    this.journals.set(parsed.scope, journal);
  }

  async list(scope: string): Promise<KnowledgeItem[]> {
    return projectKnowledge(structuredClone(this.journals.get(parseKnowledgeScope(scope)) ?? []));
  }
}
