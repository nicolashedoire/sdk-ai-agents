import { z } from 'zod';
import { extractJsonObject } from '../cognition/llm-thought-generator.js';
import { claimStatus, type PassageSpec, resultIds, type StudyCollection } from './passages.js';
import { studyReason } from './study-labels.js';
import type {
  StudyAmendmentVerdict,
  StudyClaimStatus,
  StudyPassage,
  StudyPriorArt,
  StudyReason,
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
  reason: StudyReason;
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
}

const text = z.string().trim().min(1);

const claimSchema = z.object({
  statement: text,
  status: claimStatus,
  sources: resultIds,
  servesObjective: text,
});

/** What a passage's reply is read against. */
export interface PassageReplyContext {
  leads: readonly string[];
  /** Leads that already have a verdict: a reopened passage does not judge them again. */
  judgedLeads?: readonly string[];
  /** Breakthroughs the charter names, to deconstruct in `changes`. */
  analogues: readonly string[];
  reopenable: StudyPassage[];
  /** Items a collection needs in this study, when it differs from the passage's own. */
  minimums?: Partial<Record<StudyCollection, number>>;
  /**
   * A passage reopened on one unknown adds only what that unknown needs: it has no minimum,
   * owes no verdict on the leads and no breakthrough.
   */
  reopened?: boolean;
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
  const judged = new Set((context.judgedLeads ?? []).map(leadKey));
  for (const collection of spec.collections) {
    const entries = json[collection.key] ?? [];
    if (!Array.isArray(entries)) {
      return { ok: false, error: `"${collection.key}" must be a list` };
    }
    const before = items.length;
    for (const entry of entries) {
      const read = readItem(collection.key, collection.fields, entry, context, judged);
      if ('reason' in read) refused.push(read);
      else items.push(read);
    }
    const valid = items.length - before;
    const min = context.reopened ? 0 : (context.minimums?.[collection.key] ?? collection.min);
    if (valid < min) {
      const why = refused
        .filter((item) => item.collection === collection.key)
        .slice(0, 3)
        .map((item) => item.reason.message);
      return {
        ok: false,
        error: `"${collection.key}" needs at least ${min} valid item(s), got ${valid}${why.length > 0 ? ` (${why.join('; ')})` : ''}`,
      };
    }
  }

  if (spec.passage === 'changes' && !context.final && !context.reopened) {
    const missing = context.leads.filter((lead) => !judged.has(leadKey(lead)));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `"leadVerdicts" must judge every one of the user's leads; missing: ${missing.join(', ')}`,
      };
    }
    const analogues = items.filter((item) => item.collection === 'analogues');
    const undone = context.analogues.filter(
      (named, index) => !analogues.some((item) => deconstructsNamed(item.fields, named, index))
    );
    if (undone.length > 0) {
      return {
        ok: false,
        error: `"analogues" must deconstruct every breakthrough the charter names; missing: ${undone.join(', ')}`,
      };
    }
  }

  const reopen = readReopen(json.reopen, context.reopenable);
  return { ok: true, value: { items, refused, ...(reopen ? { reopen } : {}) } };
}

function readItem(
  collection: StudyCollection,
  fields: PassageSpec['collections'][number]['fields'],
  entry: unknown,
  context: PassageReplyContext,
  judgedLeads: Set<string>
): ProposedItem | RefusedItem {
  const shown = isRecord(entry)
    ? {
        ...(typeof entry.statement === 'string' ? { statement: entry.statement } : {}),
        ...(typeof entry.servesObjective === 'string'
          ? { servesObjective: entry.servesObjective }
          : {}),
      }
    : {};
  if (!isRecord(entry)) return { collection, item: shown, reason: studyReason('notAnObject') };
  const claim = claimSchema.safeParse(entry);
  if (!claim.success) return { collection, item: shown, reason: issueOf(claim.error) };
  const own = fields.safeParse(entry);
  if (!own.success) return { collection, item: shown, reason: issueOf(own.error) };

  const itemFields = own.data;
  if (collection === 'leadVerdicts') {
    // A verdict names one of the user's leads, by its number or its text, and the study
    // writes it back as the charter does; a lead gets one verdict.
    const lead = leadOf(String(itemFields.lead), context.leads);
    if (!lead) {
      return {
        collection,
        item: shown,
        reason: studyReason('notAUserLead', { lead: String(itemFields.lead) }),
      };
    }
    if (judgedLeads.has(leadKey(lead))) {
      return { collection, item: shown, reason: studyReason('leadAlreadyJudged', { lead }) };
    }
    judgedLeads.add(leadKey(lead));
    itemFields.lead = lead;
  }
  if (collection === 'analogues' && typeof itemFields.named === 'number') {
    // A number that names no breakthrough of the charter names none.
    if (!context.analogues[itemFields.named - 1]) itemFields.named = undefined;
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

/** The charter's lead a verdict names: its number (from 1), or its text. */
function leadOf(named: string, leads: readonly string[]): string | undefined {
  const number = /^\d+$/.test(named.trim()) ? Number(named) : undefined;
  if (number !== undefined) return leads[number - 1];
  return leads.find((lead) => leadKey(lead) === leadKey(named));
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
  /** Why an architecture is, or is not, a new capability. */
  capabilityReason?: string;
}

/**
 * Reads the guardian's verdicts: only a verdict with the id of an item shown and a boolean
 * `onObjective` counts. Before the last attempt every item must have one; after it, an item
 * without a valid verdict is left out of the map, and stays unchecked (never taken as judged).
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
    const capabilityReason =
      typeof entry.capabilityReason === 'string' ? entry.capabilityReason.trim() : '';
    verdicts.set(id, {
      onObjective,
      reason: reason || (onObjective ? 'on the objective' : 'judged off the objective'),
      ...(newCapability !== undefined ? { newCapability } : {}),
      ...(capabilityReason ? { capabilityReason } : {}),
    });
  }
  const missing = ids.filter((id) => !verdicts.has(id));
  if (missing.length > 0 && !final) {
    return {
      ok: false,
      error: `give a valid verdict (a boolean "onObjective") for every item; missing: ${missing.join(', ')}`,
    };
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

/**
 * Whether an analogue deconstructs the charter's breakthrough `named` (at `index`): by its
 * number, which holds in any language, or by its name.
 */
export function deconstructsNamed(
  analogue: { breakthrough?: unknown; named?: unknown },
  named: string,
  index: number
): boolean {
  if (analogue.named === index + 1) return true;
  return typeof analogue.breakthrough === 'string' && deconstructs(analogue.breakthrough, named);
}

/** How leads are matched: case, accents and spacing aside. */
function leadKey(lead: string): string {
  return lead.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function issueOf(error: z.ZodError): StudyReason {
  const issue = error.issues[0];
  if (issue?.path[0] === 'servesObjective') return studyReason('noServesObjective');
  const detail = issue ? `${issue.path.join('.') || 'item'}: ${issue.message}` : 'item';
  return studyReason('invalidItem', { detail });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
