import { PASSAGES, type StudyCollection, type StudyCollections } from './passages.js';
import type {
  StudyAmendment,
  StudyCharter,
  StudyClaim,
  StudyDriftEntry,
  StudyNotice,
  StudyPassage,
  StudyPassageState,
  StudyPieceStates,
  StudyReport,
  StudySearch,
  StudySearchResult,
  StudyStats,
  StudyStatus,
  StudyStopReason,
  StudyThreeState,
} from './study-types.js';

/** An item of a passage, with the collection it belongs to. */
export interface StoredItem {
  collection: StudyCollection;
  claim: StudyClaim;
}

/** What a passage has produced so far. */
export interface PassageRecord {
  passage: StudyPassage;
  items: StoredItem[];
  /** It ran to its end: guardian, redo and, for design, the prior-art search. */
  complete: boolean;
  attempts: number;
  reopenedBy: StudyPassage[];
  runId: string;
}

/** Everything a study holds, from which its report is built. */
export interface StudyState {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  hasSources: boolean;
  amendments: readonly StudyAmendment[];
  last?: { status: StudyStatus; stoppedBy?: StudyStopReason; error?: string };
  records: ReadonlyMap<StudyPassage, PassageRecord>;
  results: StudySearchResult[];
  searches: readonly StudySearch[];
  driftLog: readonly StudyDriftEntry[];
  /** Passages that could not search: `maxSearches` was spent. */
  unsearched: readonly StudyPassage[];
  totals: { modelCalls: number; redos: number; loops: number };
  runIds: readonly string[];
}

/**
 * The report of a study as it stands: a copy, which later runs and recorded results do not
 * change.
 */
export function buildStudyReport(state: StudyState): StudyReport {
  const items = <Key extends StudyCollection>(key: Key): StudyCollections[Key][] =>
    PASSAGES.flatMap((spec) =>
      (state.records.get(spec.passage)?.items ?? [])
        .filter((item) => item.collection === key)
        .map((item) => structuredClone(item.claim) as StudyCollections[Key])
    );
  const judgedLeads = new Set(items('leadVerdicts').map((verdict) => verdict.lead));
  const unverifiedLeads = state.charter.leads.filter((lead) => !judgedLeads.has(lead));
  const all = PASSAGES.flatMap((spec) =>
    (state.records.get(spec.passage)?.items ?? []).map((item) => item.claim)
  );
  const passages = passageStates(state);
  const stats = statsOf(state, all);

  return {
    studyId: state.studyId,
    name: state.name,
    language: state.language,
    charter: structuredClone(state.charter),
    charterHash: state.charterHash,
    amendments: structuredClone([...state.amendments]),
    status: state.last?.status ?? 'notRun',
    ...(state.last?.stoppedBy ? { stoppedBy: state.last.stoppedBy } : {}),
    ...(state.last?.error ? { error: state.last.error } : {}),
    notices: noticesOf(state, passages, unverifiedLeads, stats),
    passages,
    observations: items('observations'),
    pieces: items('pieces'),
    chain: items('chain'),
    threeStates: byPiece(items('threeStates')),
    historicalChoices: items('historicalChoices'),
    advances: items('advances'),
    leadVerdicts: items('leadVerdicts'),
    unverifiedLeads,
    independentLeads: items('independentLeads'),
    references: items('references'),
    constraints: items('constraints'),
    revisableDecisions: items('revisableDecisions'),
    combinations: items('combinations'),
    architectures: items('architectures'),
    noveltyClaims: items('noveltyClaims'),
    experiments: items('experiments'),
    cards: items('cards'),
    results: structuredClone(state.results),
    searches: structuredClone([...state.searches]),
    driftLog: structuredClone([...state.driftLog]),
    stats,
    runIds: [...state.runIds],
  };
}

function passageStates(state: StudyState): StudyPassageState[] {
  return PASSAGES.map(({ passage }) => {
    const record = state.records.get(passage);
    if (!record) return { passage, state: 'notRun', attempts: 0, reopenedBy: [] };
    const unchecked = record.items.some((item) => item.claim.unchecked);
    return {
      passage,
      state: unchecked ? 'unchecked' : record.complete ? 'complete' : 'partial',
      attempts: record.attempts,
      reopenedBy: [...record.reopenedBy],
      runId: record.runId,
    };
  });
}

/** For each piece, its three states, the pieces in the order the design named them. */
function byPiece(states: StudyThreeState[]): StudyPieceStates[] {
  const pieces = new Map<string, StudyPieceStates>();
  for (const state of states) {
    const key = state.piece.trim().toLowerCase();
    const entry = pieces.get(key) ?? {
      piece: state.piece,
      atItsTime: [],
      currentBest: [],
      proposal: [],
    };
    entry[state.state].push(state);
    pieces.set(key, entry);
  }
  return [...pieces.values()];
}

function statsOf(state: StudyState, all: StudyClaim[]): StudyStats {
  const byStatus = { established: 0, hypothesis: 0, novelty: 0 };
  for (const claim of all) byStatus[claim.status]++;
  const ran = state.searches.filter((search) => !search.skipped);
  return {
    runs: state.runIds.length,
    modelCalls: state.totals.modelCalls,
    searches: ran.length,
    searchesSkipped: state.searches.length - ran.length,
    results: state.results.length,
    items: all.length,
    rejected: state.driftLog.length,
    byStatus,
    downgraded: all.filter((claim) => claim.declaredStatus !== undefined).length,
    noveltiesToVerify: all.filter((claim) => claim.status === 'novelty' && claim.toVerify).length,
    redos: state.totals.redos,
    loops: state.totals.loops,
  };
}

function noticesOf(
  state: StudyState,
  passages: StudyPassageState[],
  unverifiedLeads: string[],
  stats: StudyStats
): StudyNotice[] {
  const notices: StudyNotice[] = [];
  if (!state.hasSources) {
    notices.push({
      code: 'noSources',
      message:
        'The study had no search source: no claim could be established, and no novelty checked against prior art.',
    });
  }
  const last = state.last;
  if (last && last.status !== 'completed') {
    const stopped = last.status === 'stopped';
    notices.push({
      code: last.status,
      message: `The last run ${stopped ? `was stopped (${last.stoppedBy})` : last.status}${last.error ? `: ${last.error}` : ''}. The report keeps what was done.`,
      ...(last.stoppedBy ? { details: [last.stoppedBy] } : {}),
    });
  }
  const notRun = passages.filter((passage) => passage.state === 'notRun');
  if (last && notRun.length > 0) {
    notices.push({
      code: 'passagesNotRun',
      message: `Passages not run: ${notRun.map((passage) => passage.passage).join(', ')}.`,
      details: notRun.map((passage) => passage.passage),
    });
  }
  const unchecked = passages.filter((passage) => passage.state === 'unchecked');
  if (unchecked.length > 0) {
    notices.push({
      code: 'uncheckedItems',
      message: `Items the guardian did not judge, the run having stopped first, in: ${unchecked.map((passage) => passage.passage).join(', ')}.`,
      details: unchecked.map((passage) => passage.passage),
    });
  }
  if (stats.searchesSkipped > 0 || state.unsearched.length > 0) {
    notices.push({
      code: 'searchesSkipped',
      message: `The search budget (maxSearches) ran out: ${[...state.unsearched].join(', ') || `${stats.searchesSkipped} search(es) skipped`}.`,
      details: [...state.unsearched],
    });
  }
  const changesRan = state.records.has('changes');
  if (unverifiedLeads.length > 0 && (changesRan || last)) {
    notices.push({
      code: 'leadsNotVerified',
      message: `Leads without a verdict: ${unverifiedLeads.join(', ')}.`,
      details: unverifiedLeads,
    });
  }
  if (stats.noveltiesToVerify > 0) {
    notices.push({
      code: 'noveltiesToVerify',
      message: `${stats.noveltiesToVerify} claimed novelty(ies) still to verify against prior art.`,
    });
  }
  return notices;
}
