import { PASSAGES, type StudyCollection, type StudyCollections } from './passages.js';
import { deconstructsNamed } from './study-replies.js';
import type {
  StudyAmendment,
  StudyArchitecture,
  StudyCharter,
  StudyClaim,
  StudyDriftEntry,
  StudyNotice,
  StudyNoticeCode,
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
  /**
   * It asked to reopen an earlier passage: it runs again once that passage has, so it is not
   * complete until then (nor is its prior-art search run).
   */
  awaitingLoop?: boolean;
  /** Attempts of its last generation: 2 when the guardian made it redo. */
  attempts: number;
  /** The attempt whose items it kept, when the redo was worse than the first. */
  keptAttempt?: number;
  /** The redo discarded for a better first attempt, and the items the guardian kept of it. */
  discarded?: { attempt: number; items: number };
  /**
   * The guardian judged items late in a passage it reads, after it ran: it runs again (a
   * loop), or the report says it is outdated.
   */
  outdated?: boolean;
  /**
   * The generation in progress, until the passage ends: its attempt, the items it produced and
   * those rejected, its results and the reopening it asked, so that a resumed run applies the
   * redo rules as the stopped one would have.
   */
  generation?: {
    attempt: number;
    produced: number;
    rejected: StudyDriftEntry[];
    results: string[];
    reopen?: { passage: StudyPassage; focus: string; reason: string };
  };
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
  /** Amendments classified, and the model calls the vendor answered for them. */
  amendmentTotals: { count: number; modelCalls: number };
  /** Runs of `run()` since the last restart. */
  runIds: readonly string[];
  /** Items a collection needs in this study, when it differs from the passage's own. */
  minimums: Partial<Record<StudyCollection, number>>;
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
  const analogues = items('analogues');
  const undeconstructedAnalogues = state.charter.analogues.filter(
    (named, index) => !analogues.some((analogue) => deconstructsNamed(analogue, named, index))
  );
  // A new capability comes first, then a capability whose assembly already exists, then an
  // improvement, only faster or cheaper.
  const architectures = items('architectures');
  const exists = (architecture: StudyArchitecture) => architecture.priorArt?.verdict === 'exists';
  const ranked = [
    ...architectures.filter((one) => one.kind === 'capability' && !exists(one)),
    ...architectures.filter((one) => one.kind === 'capability' && exists(one)),
    ...architectures.filter((one) => one.kind !== 'capability'),
  ];
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
    notices: noticesOf(state, passages, stats, {
      unverifiedLeads,
      undeconstructedAnalogues,
      architectures: ranked,
    }),
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
    analogues,
    undeconstructedAnalogues,
    constraints: items('constraints'),
    revisableDecisions: items('revisableDecisions'),
    combinations: items('combinations'),
    capabilities: items('capabilities'),
    architectures: ranked,
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
      ...(record.keptAttempt ? { keptAttempt: record.keptAttempt } : {}),
      ...(record.discarded ? { discarded: { ...record.discarded } } : {}),
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
    amendments: { ...state.amendmentTotals },
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

/** A notice, its English message built from the same parameters the dossier renders. */
function notice(
  code: StudyNoticeCode,
  message: string,
  extra: { params?: Record<string, string>; details?: string[] } = {}
): StudyNotice {
  return {
    code,
    ...(extra.params ? { params: extra.params } : {}),
    ...(extra.details ? { details: extra.details } : {}),
    message,
  };
}

function noticesOf(
  state: StudyState,
  passages: StudyPassageState[],
  stats: StudyStats,
  found: {
    unverifiedLeads: string[];
    undeconstructedAnalogues: string[];
    architectures: StudyArchitecture[];
  }
): StudyNotice[] {
  const notices: StudyNotice[] = [];
  if (!state.hasSources) {
    notices.push(
      notice(
        'noSources',
        'The study had no search source: no claim could be established, and no novelty checked against prior art.'
      )
    );
  }
  const last = state.last;
  if (last && last.status !== 'completed') {
    const params = {
      ...(last.stoppedBy ? { limit: last.stoppedBy } : {}),
      ...(last.error ? { error: last.error } : {}),
    };
    const stopped = last.status === 'stopped';
    notices.push(
      notice(
        last.status,
        `The last run ${stopped ? `was stopped (${last.stoppedBy})` : last.status}${last.error ? `: ${last.error}` : ''}. The report keeps what was done.`,
        { params, ...(last.stoppedBy ? { details: [last.stoppedBy] } : {}) }
      )
    );
  }
  const notRun = passages.filter((passage) => passage.state === 'notRun');
  if (last && notRun.length > 0) {
    const names = notRun.map((passage) => passage.passage);
    notices.push(
      notice('passagesNotRun', `Passages not run: ${names.join(', ')}.`, { details: names })
    );
  }
  const unchecked = passages.filter((passage) => passage.state === 'unchecked');
  if (unchecked.length > 0) {
    const names = unchecked.map((passage) => passage.passage);
    notices.push(
      notice(
        'uncheckedItems',
        `Items the guardian has not judged, kept apart from every later prompt, in: ${names.join(', ')}.`,
        { details: names }
      )
    );
  }
  if (stats.searchesSkipped > 0 || state.unsearched.length > 0) {
    const names = [...state.unsearched];
    notices.push(
      notice(
        'searchesSkipped',
        `The search budget (maxSearches) ran out: ${names.join(', ') || `${stats.searchesSkipped} search(es) skipped`}.`,
        { params: { count: String(stats.searchesSkipped) }, details: names }
      )
    );
  }
  // The leads and breakthroughs are owed by the passage on changes: only once it ran.
  if (state.records.has('changes')) {
    if (found.unverifiedLeads.length > 0) {
      notices.push(
        notice(
          'leadsNotVerified',
          `Leads without a verdict: ${found.unverifiedLeads.join(', ')}.`,
          {
            details: found.unverifiedLeads,
          }
        )
      );
    }
    if (found.undeconstructedAnalogues.length > 0) {
      notices.push(
        notice(
          'analoguesNotDeconstructed',
          `Breakthroughs not deconstructed: ${found.undeconstructedAnalogues.join(', ')}.`,
          { details: found.undeconstructedAnalogues }
        )
      );
    }
  }
  const design = state.records.get('design');
  const judged = found.architectures.filter((architecture) => !architecture.unchecked);
  if (design && judged.length === 0) {
    notices.push(notice('noDesign', 'The design passage kept no architecture.'));
  } else if (
    judged.length > 0 &&
    judged.every((architecture) => architecture.kind !== 'capability')
  ) {
    notices.push(
      notice(
        'noCapability',
        'No architecture aims at a new capability: the design offers only improvements.'
      )
    );
  }
  const unmet = unmetMinimums(state);
  if (unmet.length > 0) {
    notices.push(
      notice(
        'minimumsNotMet',
        `Fewer items than required once the guardian judged them, in: ${unmet.join(', ')}.`,
        { details: unmet }
      )
    );
  }
  const untraced = judged
    .filter(
      (architecture) =>
        architecture.components.some((component) => component.untraced) ||
        architecture.assembly.some((link) => link.untraced)
    )
    .map((architecture) => architecture.id);
  if (untraced.length > 0) {
    notices.push(
      notice(
        'untracedAssembly',
        `Parts of the design cite no record of the investigation, in: ${untraced.join(', ')}.`,
        { details: untraced }
      )
    );
  }
  const outdated = PASSAGES.filter((spec) => state.records.get(spec.passage)?.outdated).map(
    (spec) => spec.passage
  );
  if (outdated.length > 0) {
    notices.push(
      notice(
        'passagesOutdated',
        `Passages written before items the guardian judged late, not yet written again: ${outdated.join(', ')}.`,
        { details: outdated }
      )
    );
  }
  const existing = judged
    .filter(
      (architecture) =>
        architecture.kind === 'capability' && architecture.priorArt?.verdict === 'exists'
    )
    .map((architecture) => architecture.id);
  if (existing.length > 0) {
    notices.push(
      notice(
        'capabilitiesExist',
        `Capabilities whose assembly already exists, ranked after the others: ${existing.join(', ')}.`,
        { details: existing }
      )
    );
  }
  const unverified = judged
    .filter((architecture) => architecture.kind === 'capability' && architecture.toVerify)
    .map((architecture) => architecture.id);
  if (unverified.length > 0) {
    notices.push(
      notice(
        'capabilitiesToVerify',
        `Capabilities whose assembly was not checked against prior art: ${unverified.join(', ')}.`,
        { details: unverified }
      )
    );
  }
  if (stats.noveltiesToVerify > 0) {
    notices.push(
      notice(
        'noveltiesToVerify',
        `${stats.noveltiesToVerify} claimed novelty(ies) still to verify against prior art.`,
        { params: { count: String(stats.noveltiesToVerify) } }
      )
    );
  }
  return notices;
}

/**
 * The collections of passages that ran with fewer judged items than they need (`passage.key`):
 * the guardian may have removed what the reply held.
 */
function unmetMinimums(state: StudyState): string[] {
  const unmet: string[] = [];
  for (const spec of PASSAGES) {
    const record = state.records.get(spec.passage);
    // A passage with items the guardian has not judged is reported as such (`uncheckedItems`).
    if (!record || record.items.some((item) => item.claim.unchecked)) continue;
    for (const collection of spec.collections) {
      const min = state.minimums[collection.key] ?? collection.min;
      if (min === 0) continue;
      const judged = record.items.filter(
        (item) => item.collection === collection.key && !item.claim.unchecked
      ).length;
      if (judged < min) unmet.push(`${spec.passage}.${collection.key}`);
    }
  }
  return unmet;
}
