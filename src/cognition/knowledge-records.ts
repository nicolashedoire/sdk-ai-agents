import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeStatement } from './mental-state.js';
import type { RecalledKnowledgeRecord } from './thought-patch.js';

/**
 * Memory across runs. A run records what real tests established about its rules and
 * explanations (findings); a knowledge store keeps these entries in a journal and folds
 * them into items. Nothing the model merely believed is recorded: only predictions an
 * outcome evaluator confirmed or refuted.
 */

const requiredText = z.string().trim().min(1);

/**
 * Lowercase letters, digits, dot, dash and underscore: a scope is also a file name, and
 * file systems that ignore case must not let two scopes share one file.
 */
export const knowledgeScopeSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]{0,99}$/,
    'use lowercase letters, digits, ".", "-" or "_" (at most 100)'
  );

/** One test of a rule or explanation, as run by an outcome evaluator. */
export const knowledgeEvidenceSchema = z.object({
  runId: requiredText,
  predictionId: requiredText,
  verdict: z.enum(['confirmed', 'refuted']),
  expected: requiredText,
  /** What the evaluator observed (the observation summary, or its reason). */
  observed: requiredText,
  context: z.string().optional(),
  evaluatorId: requiredText,
  evaluatorVersion: requiredText,
});

/** What one run established about one rule or explanation. */
export const knowledgeFindingSchema = z.object({
  statement: requiredText,
  kind: z.enum(['rule', 'explanation']),
  scope: z.string().optional(),
  /** Statement of the hypothesis it revises, when it is a variant. */
  revises: z.string().optional(),
  difference: z.string().optional(),
  evidence: z.array(knowledgeEvidenceSchema).min(1),
});

/** One line of a knowledge journal: the findings of one run. */
export const knowledgeEntrySchema = z.object({
  scope: knowledgeScopeSchema,
  runId: requiredText,
  recordedAt: z.number(),
  findings: z.array(knowledgeFindingSchema).min(1),
});

export type KnowledgeEvidence = z.output<typeof knowledgeEvidenceSchema>;
export type KnowledgeFinding = z.output<typeof knowledgeFindingSchema>;
export type KnowledgeEntry = z.output<typeof knowledgeEntrySchema>;

export type KnowledgeStatus = RecalledKnowledgeRecord['status'];

/** A rule or explanation with every test recorded about it, across runs. */
export interface KnowledgeItem {
  /** Stable id derived from the statement and the scope. */
  id: string;
  statement: string;
  kind: KnowledgeFinding['kind'];
  scope?: string;
  revises?: string;
  difference?: string;
  status: KnowledgeStatus;
  /** Every test recorded about it, in the order the runs recorded them. */
  tests: KnowledgeEvidence[];
  confirmations: number;
  refutations: number;
  /** Runs that recorded it, oldest first. */
  runIds: string[];
  firstRecordedAt: number;
  lastRecordedAt: number;
  /** Number of runs whose findings were merged into it. */
  version: number;
}

/** Stable item id: the same statement in the same scope is the same piece of knowledge. */
export function knowledgeItemId(statement: string, scope: string | undefined): string {
  const key = `${normalizeStatement(statement)}|${normalizeStatement(scope ?? '')}`;
  return `k_${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

/**
 * Folds journal entries into items, in order. Tests are deduplicated by run and prediction,
 * so recording the same run twice adds nothing, and entries appended by concurrent runs
 * never overwrite each other.
 */
export function projectKnowledge(entries: KnowledgeEntry[]): KnowledgeItem[] {
  const items = new Map<string, KnowledgeItem>();
  for (const entry of entries) {
    for (const finding of entry.findings) {
      const id = knowledgeItemId(finding.statement, finding.scope);
      const item = items.get(id) ?? {
        id,
        statement: finding.statement,
        kind: finding.kind,
        status: 'verified',
        tests: [],
        confirmations: 0,
        refutations: 0,
        runIds: [],
        firstRecordedAt: entry.recordedAt,
        lastRecordedAt: entry.recordedAt,
        version: 0,
      };
      if (!item.runIds.includes(entry.runId)) {
        item.runIds.push(entry.runId);
        item.version++;
      }
      item.statement = finding.statement;
      item.kind = finding.kind;
      if (finding.scope) item.scope = finding.scope;
      if (finding.revises) item.revises = finding.revises;
      if (finding.difference) item.difference = finding.difference;
      item.lastRecordedAt = Math.max(item.lastRecordedAt, entry.recordedAt);
      for (const evidence of finding.evidence) {
        const known = item.tests.some(
          (existing) =>
            existing.runId === evidence.runId && existing.predictionId === evidence.predictionId
        );
        if (known) continue;
        item.tests.push(evidence);
        if (evidence.verdict === 'confirmed') item.confirmations++;
        else item.refutations++;
      }
      item.status = statusOf(item);
      items.set(id, item);
    }
  }
  return [...items.values()];
}

function statusOf(item: KnowledgeItem): KnowledgeStatus {
  if (item.refutations === 0) return 'verified';
  return item.confirmations === 0 ? 'refuted' : 'contested';
}

/**
 * The items most relevant to a goal, at most `limit`: most words shared with the goal first,
 * then the most tested, then the most recent. Deterministic, so a run can be explained.
 */
export function rankKnowledge(
  items: KnowledgeItem[],
  goal: string,
  limit: number
): KnowledgeItem[] {
  const goalWords = significantWords(goal);
  return items
    .map((item) => ({
      item,
      overlap: countShared(goalWords, significantWords(`${item.statement} ${item.scope ?? ''}`)),
      tests: item.tests.length,
    }))
    .sort(
      (left, right) =>
        right.overlap - left.overlap ||
        right.tests - left.tests ||
        right.item.lastRecordedAt - left.item.lastRecordedAt ||
        left.item.id.localeCompare(right.item.id)
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.item);
}

function significantWords(text: string): Set<string> {
  return new Set(
    normalizeStatement(text)
      .split(' ')
      .filter((word) => word.length >= 4)
  );
}

function countShared(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared;
}

const EVIDENCE_LINES = 3;

/** Compact form shown to the model and recorded in `cognition.started`. */
export function toRecalledKnowledge(item: KnowledgeItem): RecalledKnowledgeRecord {
  const tests = item.tests.slice(-EVIDENCE_LINES);
  return {
    itemId: item.id,
    statement: item.statement,
    kind: item.kind,
    ...(item.scope ? { scope: item.scope } : {}),
    status: item.status,
    confirmations: item.confirmations,
    refutations: item.refutations,
    evidence: tests.map(
      (test) => `${test.verdict}: expected "${test.expected}", observed "${test.observed}"`
    ),
  };
}
