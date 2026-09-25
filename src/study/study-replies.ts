import { z } from 'zod';
import { extractJsonObject } from '../cognition/llm-thought-generator.js';
import { claimStatus, type PassageSpec, resultIds, type StudyCollection } from './passages.js';
import type {
  StudyAmendmentVerdict,
  StudyClaimStatus,
  StudyPassage,
  StudyPriorArt,
} from './study-types.js';

/** A reply read, or why it cannot be used (the model is then asked once to repair it). */
export type Parsed<Value> = { ok: true; value: Value } | { ok: false; error: string };

/** An item a reply proposed that passed the schema, before the study gives it an id. */
export interface ProposedItem {
  collection: StudyCollection;
  statement: string;
  declaredStatus?: StudyClaimStatus;
  sources: string[];
  servesObjective: string;
  fields: Record<string, unknown>;
}

/** An item the schema refused, and why. */
export interface RefusedItem {
  collection: StudyCollection;
  item: { statement?: string; servesObjective?: string };
  reason: string;
}

export interface ReopenRequest {
  passage: StudyPassage;
  focus: string;
  reason: string;
}

export interface PassageReply {
  items: ProposedItem[];
  refused: RefusedItem[];
  reopen?: ReopenRequest;
  /** The user's leads the reply gave no verdict on (accepted on the last attempt only). */
  leadsWithoutVerdict: string[];
}

const text = z.string().trim().min(1);

const claimSchema = z.object({
  statement: text,
  status: claimStatus,
  sources: resultIds,
  servesObjective: z
    .string({
      required_error: 'no "servesObjective": the item does not say what it serves in the objective',
      invalid_type_error: '"servesObjective" must say in one sentence what the item serves',
    })
    .trim()
    .min(1, '"servesObjective" is empty: the item does not say what it serves in the objective'),
});

/** What a passage's reply is read against. */
export interface PassageReplyContext {
  leads: readonly string[];
  /** Breakthroughs the charter names, to deconstruct in `changes`. */
  analogues: readonly string[];
  reopenable: StudyPassage[];
  /** Items a collection needs in this study, when it differs from the passage's own. */
  minimums?: Partial<Record<StudyCollection, number>>;
  final: boolean;
}

/**
 * Reads a passage's reply. Each item is checked on its own: an item the schema refuses (no
 * `servesObjective`, a missing field) is dropped and reported, the others are kept. The reply
 * itself is refused when a collection is not a list, or holds fewer valid items than the
 * passage needs; and, before the last attempt, when a user lead has no verdict or a named
 * breakthrough was not deconstructed.
 */
export function parsePassageReply(
  spec: PassageSpec,
  reply: string,
  context: PassageReplyContext
): Parsed<PassageReply> {
  const json = extractJsonObject(reply);
  if (!isRecord(json)) return { ok: false, error: 'the reply does not contain a JSON object' };

  const items: ProposedItem[] = [];
  const refused: RefusedItem[] = [];
  for (const collection of spec.collections) {
    const entries = json[collection.key] ?? [];
    if (!Array.isArray(entries)) {
      return { ok: false, error: `"${collection.key}" must be a list` };
    }
    const before = items.length;
    for (const entry of entries) {
      const read = readItem(collection.key, collection.fields, entry, context.leads);
      if ('reason' in read) refused.push(read);
      else items.push(read);
    }
    const valid = items.length - before;
    const min = context.minimums?.[collection.key] ?? collection.min;
    if (valid < min) {
      const why = refused
        .filter((item) => item.collection === collection.key)
        .slice(0, 3)
        .map((item) => item.reason);
      return {
        ok: false,
        error: `"${collection.key}" needs at least ${min} valid item(s), got ${valid}${why.length > 0 ? ` (${why.join('; ')})` : ''}`,
      };
    }
  }

  const judged = new Set(
    items
      .filter((item) => item.collection === 'leadVerdicts')
      .map((item) => leadKey(String(item.fields.lead)))
  );
  const leadsWithoutVerdict =
    spec.passage === 'changes' ? context.leads.filter((lead) => !judged.has(leadKey(lead))) : [];
  if (leadsWithoutVerdict.length > 0 && !context.final) {
    return {
      ok: false,
      error: `"leadVerdicts" must judge every one of the user's leads; missing: ${leadsWithoutVerdict.join(', ')}`,
    };
  }

  if (spec.passage === 'changes' && !context.final) {
    const deconstructed = items
      .filter((item) => item.collection === 'analogues')
      .map((item) => String(item.fields.breakthrough));
    const missing = context.analogues.filter(
      (named) => !deconstructed.some((breakthrough) => deconstructs(breakthrough, named))
    );
    if (missing.length > 0) {
      return {
        ok: false,
        error: `"analogues" must deconstruct every breakthrough the charter names; missing: ${missing.join(', ')}`,
      };
    }
  }

  const reopen = readReopen(json.reopen, context.reopenable);
  return {
    ok: true,
    value: { items, refused, leadsWithoutVerdict, ...(reopen ? { reopen } : {}) },
  };
}

function readItem(
  collection: StudyCollection,
  fields: PassageSpec['collections'][number]['fields'],
  entry: unknown,
  leads: readonly string[]
): ProposedItem | RefusedItem {
  const shown = isRecord(entry)
    ? {
        ...(typeof entry.statement === 'string' ? { statement: entry.statement } : {}),
        ...(typeof entry.servesObjective === 'string'
          ? { servesObjective: entry.servesObjective }
          : {}),
      }
    : {};
  if (!isRecord(entry)) return { collection, item: shown, reason: 'not a JSON object' };
  const claim = claimSchema.safeParse(entry);
  if (!claim.success) return { collection, item: shown, reason: issueOf(claim.error) };
  const own = fields.safeParse(entry);
  if (!own.success) return { collection, item: shown, reason: issueOf(own.error) };

  const itemFields = own.data;
  if (collection === 'leadVerdicts') {
    // A verdict names one of the user's leads as the charter writes it.
    const lead = leads.find((candidate) => leadKey(candidate) === leadKey(String(itemFields.lead)));
    if (!lead) {
      return {
        collection,
        item: shown,
        reason: `"${String(itemFields.lead)}" is not one of the user's leads (a tool found beyond them is an independent lead)`,
      };
    }
    itemFields.lead = lead;
  }
  return {
    collection,
    statement: claim.data.statement,
    ...(claim.data.status ? { declaredStatus: claim.data.status } : {}),
    sources: [...new Set(claim.data.sources)],
    servesObjective: claim.data.servesObjective,
    fields: itemFields,
  };
}

function readReopen(value: unknown, reopenable: StudyPassage[]): ReopenRequest | undefined {
  if (!isRecord(value)) return undefined;
  const { passage, focus, reason } = value;
  if (typeof passage !== 'string' || !reopenable.includes(passage as StudyPassage)) {
    return undefined;
  }
  if (typeof focus !== 'string' || focus.trim() === '') return undefined;
  return {
    passage: passage as StudyPassage,
    focus: focus.trim(),
    reason: typeof reason === 'string' ? reason.trim() : '',
  };
}

export interface GuardianVerdict {
  onObjective: boolean;
  reason: string;
  /** For an architecture: it makes possible something difficult today, not only faster. */
  newCapability?: boolean;
}

/**
 * Reads the guardian's verdicts. Before the last attempt, every item must have one; after it,
 * an item without a verdict is kept.
 */
export function parseGuardianReply(
  reply: string,
  ids: string[],
  final: boolean
): Parsed<Map<string, GuardianVerdict>> {
  const json = extractJsonObject(reply);
  if (!isRecord(json) || !Array.isArray(json.verdicts)) {
    return { ok: false, error: 'the reply must be a JSON object with a "verdicts" list' };
  }
  const verdicts = new Map<string, GuardianVerdict>();
  for (const entry of json.verdicts) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const id = entry.id.trim().toUpperCase();
    if (!ids.includes(id)) continue;
    const onObjective = readBoolean(entry.onObjective);
    if (onObjective === undefined) continue;
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    const newCapability = readBoolean(entry.newCapability);
    verdicts.set(id, {
      onObjective,
      reason: reason || (onObjective ? 'on the objective' : 'judged off the objective'),
      ...(newCapability !== undefined ? { newCapability } : {}),
    });
  }
  const missing = ids.filter((id) => !verdicts.has(id));
  if (missing.length > 0 && !final) {
    return { ok: false, error: `give a verdict for every item; missing: ${missing.join(', ')}` };
  }
  return { ok: true, value: verdicts };
}

export interface RequestedSearch {
  source: string;
  query: string;
  servesObjective: string;
  /** The novelty whose prior art it looks for. */
  claim?: string;
}

/**
 * Reads the searches a reply asks for, at most `max`. A search needs one of the study's
 * sources (the only one, when there is one), a query and what it serves.
 */
export function parseQueriesReply(
  reply: string,
  context: { sources: string[]; max: number; claims?: string[]; final: boolean }
): Parsed<RequestedSearch[]> {
  const json = extractJsonObject(reply);
  if (!isRecord(json) || !Array.isArray(json.queries)) {
    return { ok: false, error: 'the reply must be a JSON object with a "queries" list' };
  }
  const searches: RequestedSearch[] = [];
  for (const entry of json.queries) {
    if (!isRecord(entry)) continue;
    const source =
      typeof entry.source === 'string'
        ? entry.source.trim()
        : context.sources.length === 1
          ? context.sources[0]
          : undefined;
    const query = typeof entry.query === 'string' ? entry.query.trim() : '';
    const serves = typeof entry.servesObjective === 'string' ? entry.servesObjective.trim() : '';
    if (!source || !context.sources.includes(source) || !query || !serves) continue;
    let claim: string | undefined;
    if (context.claims) {
      claim = typeof entry.claim === 'string' ? entry.claim.trim().toUpperCase() : undefined;
      if (!claim || !context.claims.includes(claim)) continue;
    }
    searches.push({ source, query, servesObjective: serves, ...(claim ? { claim } : {}) });
  }
  if (searches.length === 0 && json.queries.length > 0 && !context.final) {
    return {
      ok: false,
      error: `no usable search: each needs a "source" among ${context.sources.join(', ')}, a "query" and "servesObjective"${context.claims ? ', and the id of its "claim"' : ''}`,
    };
  }
  return { ok: true, value: searches.slice(0, context.max) };
}

export interface PriorArtCheck extends StudyPriorArt {
  claim: string;
}

export function parsePriorArtReply(reply: string, claims: string[]): Parsed<PriorArtCheck[]> {
  const json = extractJsonObject(reply);
  if (!isRecord(json) || !Array.isArray(json.checks)) {
    return { ok: false, error: 'the reply must be a JSON object with a "checks" list' };
  }
  const checks: PriorArtCheck[] = [];
  for (const entry of json.checks) {
    const parsed = priorArtSchema.safeParse(entry);
    if (!parsed.success || !claims.includes(parsed.data.claim)) continue;
    checks.push(parsed.data);
  }
  return { ok: true, value: checks };
}

const priorArtSchema = z.object({
  claim: z.string().trim().toUpperCase(),
  closest: text,
  sources: resultIds,
  verdict: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? ({ novel: 'novel', partlynovel: 'partlyNovel', partly: 'partlyNovel', exists: 'exists' }[
            value.toLowerCase().replace(/[^a-z]/g, '')
          ] ?? value)
        : value,
    z.enum(['novel', 'partlyNovel', 'exists'])
  ),
});

export function parseAmendmentReply(
  reply: string
): Parsed<{ verdict: Exclude<StudyAmendmentVerdict, 'unclassified'>; reason: string }> {
  const json = extractJsonObject(reply);
  const parsed = amendmentSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        'the reply must be { "verdict": "refines" | "conflicts" | "changesObjective", "reason": string }',
    };
  }
  return { ok: true, value: parsed.data };
}

const amendmentSchema = z.object({
  verdict: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? ({
            refines: 'refines',
            conflicts: 'conflicts',
            changesobjective: 'changesObjective',
          }[value.toLowerCase().replace(/[^a-z]/g, '')] ?? value)
        : value,
    z.enum(['refines', 'conflicts', 'changesObjective'])
  ),
  reason: text,
});

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  return undefined;
}

/** Whether an analogue deconstructs a breakthrough the charter names (`Bitcoin (2008)`). */
export function deconstructs(breakthrough: string, named: string): boolean {
  return leadKey(breakthrough).includes(leadKey(named));
}

/** How leads are matched: case, accents and spacing aside. */
function leadKey(lead: string): string {
  return lead.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function issueOf(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid item';
  // The message of a missing `servesObjective` already says what is wrong.
  if (issue.path[0] === 'servesObjective') return issue.message;
  return `${issue.path.join('.') || 'item'}: ${issue.message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
