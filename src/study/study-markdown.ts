import { PASSAGES } from './passages.js';
import { fillLabel, type StudyLabels, studyLabels } from './study-labels.js';
import type {
  MechanismCard,
  StudyClaim,
  StudyNotice,
  StudyPassage,
  StudyReason,
  StudyReport,
  StudyStopReason,
  StudyTrace,
} from './study-types.js';

/**
 * The report as a readable dossier, in the study's language, in the order of the method:
 * the charter, the principle, the passages, the three states, the combinations, the design
 * leads, the experiments and the mechanism cards, then the drift log and the sources. Every
 * claim shows its status and the results it cites; a status the study lowered says why.
 */
export function renderStudyMarkdown(report: StudyReport): string {
  const l = studyLabels(report.language);
  const out = new Writer(l);
  const { charter } = report;

  out.line(`# ${l.study}${l.sep}${inline(charter.object)}`, '');
  out.line(`## ${l.charter}`, '');
  out.field(l.object, charter.object);
  out.field(l.question, charter.question);
  out.field(l.objective, charter.objective);
  if (charter.needs.length > 0) out.field(l.needs, charter.needs.join(l.list));
  if (charter.leads.length > 0) {
    out.field(`${l.leads} (${l.leadsNote})`, charter.leads.join(l.list));
  }
  if (charter.scope.exclude.length > 0) {
    out.field(l.outOfScope, charter.scope.exclude.join(l.list));
  }
  out.field(l.capabilityAimed, charter.capability ?? l.noCapabilityNamed);
  if (charter.analogues.length > 0) out.field(l.analoguesNamed, charter.analogues.join(l.list));
  out.line(`- **${l.charterHash}**${l.sep}\`${report.charterHash}\``, '');
  if (report.amendments.length > 0) {
    out.line(`### ${l.amendments}`, '');
    for (const amendment of report.amendments) {
      const verdict = l.amendmentVerdicts[amendment.verdict];
      out.line(
        amendment.accepted
          ? `${amendment.number}. ${inline(amendment.text)} — _${verdict}_`
          : `- ~~${inline(amendment.text)}~~ — _${l.refused}, ${verdict}_${l.sep}${inline(reasonText(amendment.reason, l))}${amendment.verdict === 'changesObjective' ? ` ${inline(l.newObjectiveNewStudy)}` : ''}`
      );
    }
    out.line('');
  }

  if (report.notices.length > 0) {
    out.line(`## ${l.notices}`, '');
    for (const notice of report.notices) out.line(`> - ${noticeText(notice, l)}`);
    out.line('');
  }

  out.line(`## ${l.principle}`, '', inline(l.principleText), '');

  out.line(`## ${l.passages}`, '');
  out.line(`| # | ${l.passage} | ${l.state} |`, '| --- | --- | --- |');
  for (const state of report.passages) {
    const spec = PASSAGES.find((candidate) => candidate.passage === state.passage);
    out.line(
      `| ${spec?.number ?? ''} | ${l.passageNames[state.passage]} | ${l.passageStates[state.state]} |`
    );
  }
  out.line('');
  passagesSection(out, report, l);
  threeStatesSection(out, report, l);
  combinationsSection(out, report, l);
  analoguesSection(out, report, l);
  designSection(out, report, l);
  experimentsSection(out, report, l);
  cardsSection(out, report, l);
  driftSection(out, report, l);
  sourcesSection(out, report, l);
  statsSection(out, report, l);
  return out.text();
}

/** Lines of the dossier, and the ways a claim is written. */
class Writer {
  private readonly lines: string[] = [];

  constructor(private readonly l: StudyLabels) {}

  line(...lines: string[]): void {
    this.lines.push(...lines);
  }

  field(label: string, value: string, indent = ''): void {
    this.lines.push(`${indent}- **${label}**${this.l.sep}${inline(value)}`);
  }

  /** A claim as a list item: its title, statement and status, then why its status changed. */
  claim(claim: StudyClaim, title?: string): void {
    const head = title ? `**${inline(title)}** — ` : '';
    this.lines.push(`- ${head}${inline(claim.statement)} ${this.status(claim)}`);
    this.notes(claim, '  ');
  }

  status(claim: Pick<StudyClaim, 'status' | 'sources' | 'toVerify' | 'unlistedSources'>): string {
    const l = this.l;
    const status =
      claim.status === 'novelty' && claim.toVerify ? l.noveltyToVerify : l.statuses[claim.status];
    const sources = claim.sources.length > 0 ? ` · ${claim.sources.join(', ')}` : '';
    // A citation the prompt did not list supports nothing, but the reader sees it.
    const unlisted = claim.unlistedSources?.length
      ? ` · ${l.unlisted}${l.sep}${claim.unlistedSources.map((id) => inline(id)).join(', ')}`
      : '';
    return `_(${status}${sources}${unlisted})_`;
  }

  notes(claim: Pick<StudyClaim, 'statusReason' | 'priorArt' | 'unchecked'>, indent: string): void {
    const l = this.l;
    // The reason names the declared status itself ("Declared established, but…").
    if (claim.statusReason) {
      this.lines.push(`${indent}- _${inline(reasonText(claim.statusReason, l))}_`);
    }
    if (claim.priorArt) {
      const { priorArt } = claim;
      const sources = priorArt.sources.length > 0 ? ` · ${priorArt.sources.join(', ')}` : '';
      this.lines.push(
        `${indent}- **${l.priorArt}** (${l.priorArtVerdicts[priorArt.verdict]}${sources})${l.sep}${inline(priorArt.closest)}`
      );
    }
    if (claim.unchecked) this.lines.push(`${indent}- _${l.unchecked}_`);
  }

  /** Where a part of a design comes from, or that it comes from nothing listed. */
  trace(part: StudyTrace, indent: string): void {
    const l = this.l;
    if (part.from.length > 0) {
      this.lines.push(`${indent}- _${l.traceFrom}${l.sep}${part.from.join(', ')}_`);
    }
    if (part.unknownFrom?.length) {
      const ids = part.unknownFrom.map((id) => inline(id)).join(', ');
      this.lines.push(`${indent}- _${l.unknownFrom}${l.sep}${ids}_`);
    }
    if (part.untraced) this.lines.push(`${indent}- **${l.untraced}**`);
  }

  heading(level: number, text: string): void {
    this.lines.push(`${'#'.repeat(level)} ${text}`, '');
  }

  text(): string {
    return `${this.lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`;
  }
}

function passagesSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  const title = (passage: StudyPassage) => {
    const spec = PASSAGES.find((candidate) => candidate.passage === passage);
    return `${spec?.number}. ${l.passageNames[passage]}`;
  };

  out.heading(3, title('observe'));
  for (const item of report.observations) {
    out.claim(item, l.kinds[item.kind]);
    out.field(l.conditions, item.era ? `${item.conditions} (${item.era})` : item.conditions, '  ');
  }
  out.line('');

  out.heading(3, title('decompose'));
  out.heading(4, l.collections.pieces);
  for (const piece of report.pieces) {
    out.claim(piece, piece.name);
    out.field(l.function, piece.function, '  ');
    if (piece.parent) out.field(l.parent, piece.parent, '  ');
    if (piece.inputs.length > 0) out.field(l.inputs, piece.inputs.join(l.list), '  ');
    if (piece.outputs.length > 0) out.field(l.outputs, piece.outputs.join(l.list), '  ');
    if (piece.relations.length > 0) out.field(l.relations, piece.relations.join(l.list), '  ');
    if (piece.unknowns.length > 0) out.field(l.unknowns, piece.unknowns.join(l.list), '  ');
  }
  out.line('');
  out.heading(4, l.collections.chain);
  for (const stage of report.chain) {
    out.claim(stage, stage.stage);
    if (stage.pieces.length > 0) out.field(l.pieces, stage.pieces.join(l.list), '  ');
  }
  out.line('');

  out.heading(3, title('historicalChoices'));
  for (const choice of report.historicalChoices) {
    out.claim(choice, choice.choice);
    const factors = choice.factors.map((factor) => l.factorNames[factor]).join(l.list);
    if (factors) out.field(l.factors, choice.era ? `${factors} (${choice.era})` : factors, '  ');
  }
  out.line('');

  out.heading(3, title('changes'));
  out.heading(4, l.collections.advances);
  for (const advance of report.advances) {
    const when = advance.date ? ` (${advance.date})` : '';
    out.claim(advance, `${advance.mechanism}${when}`);
    if (advance.domain === 'other') {
      out.line(`  - _${l.otherDomain}${advance.field ? `${l.sep}${inline(advance.field)}` : ''}_`);
    }
    out.field(l.evidence, advance.evidence, '  ');
    out.field(l.conditions, advance.conditions, '  ');
    out.field(l.availability, advance.availability, '  ');
  }
  out.line('');
  out.heading(4, l.collections.leadVerdicts);
  for (const verdict of report.leadVerdicts) {
    out.claim(verdict, `${verdict.lead}${l.sep}${l.verdicts[verdict.verdict]}`);
    out.line(`  - ${inline(verdict.reasons)}`);
  }
  for (const lead of report.unverifiedLeads) {
    out.line(`- **${inline(lead)}**${l.sep}_${l.unverifiedLead}_`);
  }
  out.line('');
  out.heading(4, l.collections.independentLeads);
  for (const lead of report.independentLeads) {
    out.claim(lead, `${lead.tool} (${l.toolKinds[lead.kind]})`);
  }
  out.line('');
  out.heading(4, l.collections.references);
  for (const reference of report.references) {
    out.claim(reference, reference.date ? `${reference.name} (${reference.date})` : reference.name);
  }
  out.line('');

  out.heading(3, title('cross'));
  out.heading(4, l.collections.constraints);
  for (const state of ['remains', 'weakened', 'newRequirement'] as const) {
    const constraints = report.constraints.filter((constraint) => constraint.state === state);
    if (constraints.length === 0) continue;
    out.line(`**${l.constraintStates[state]}**`, '');
    for (const constraint of constraints) out.claim(constraint, constraint.constraint);
    out.line('');
  }
  out.heading(4, l.collections.revisableDecisions);
  for (const decision of report.revisableDecisions) {
    out.claim(decision, decision.decision);
    out.field(l.because, decision.because, '  ');
    out.field(l.opens, decision.opens, '  ');
  }
  out.line('');
  if (report.capabilities.length > 0) {
    out.heading(4, l.collections.capabilities);
    for (const candidate of report.capabilities) {
      out.claim(candidate, candidate.capability);
      out.field(l.forWhom, candidate.forWhom, '  ');
      out.field(l.hardToday, candidate.hardToday, '  ');
      if (candidate.principle)
        out.field(l.principleChange, l.principles[candidate.principle], '  ');
    }
    out.line('');
  }
}

function analoguesSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.collections.analogues);
  for (const analogue of report.analogues) {
    out.claim(
      analogue,
      analogue.date ? `${analogue.breakthrough} (${analogue.date})` : analogue.breakthrough
    );
    const components = analogue.components.map((component) =>
      component.date ? `${component.name} (${component.date})` : component.name
    );
    out.field(l.components, components.join(l.list), '  ');
    out.field(l.liftedConstraint, analogue.liftedConstraint, '  ');
    out.field(l.capabilityOpened, analogue.capability, '  ');
    out.field(l.pattern, analogue.pattern, '  ');
    if (analogue.domain) out.field(l.domain, analogue.domain, '  ');
  }
  out.line('');
}

function threeStatesSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.collections.threeStates);
  for (const piece of report.threeStates) {
    out.heading(3, inline(piece.piece));
    for (const state of ['atItsTime', 'currentBest', 'proposal'] as const) {
      for (const item of piece[state]) {
        const architecture = item.architecture ? ` (${item.architecture})` : '';
        out.claim(item, `${l.states[state]}${architecture}`);
      }
    }
    out.line('');
  }
}

function combinationsSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.collections.combinations);
  for (const combination of report.combinations) {
    out.claim(combination, `${combination.a} + ${combination.b}`);
    out.field(l.enables, combination.enables, '  ');
    out.field(l.exchange, combination.exchange, '  ');
    out.field(l.cost, combination.cost, '  ');
    if (combination.changes.length > 0) {
      const changes = combination.changes.map((change) => l.changeKinds[change]);
      out.field(l.changes, changes.join(l.list), '  ');
    }
  }
  out.line('');
}

function designSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.designLeads);
  for (const architecture of report.architectures) {
    out.heading(
      3,
      `${architecture.id}. ${inline(architecture.name)} ${out.status(architecture)} — **${l.architectureKinds[architecture.kind]}**`
    );
    out.line(inline(architecture.statement), '');
    out.notes(architecture, '');
    if (architecture.declaredKind) {
      const why = architecture.kindReason ? inline(reasonText(architecture.kindReason, l)) : '';
      out.line(
        `- _${l.declared} ${l.architectureKinds[architecture.declaredKind]}${l.sep}${fillLabel(l.judgedImprovement, { reason: why })}_`
      );
    }
    const { capability } = architecture;
    out.field(architecture.kind === 'capability' ? l.newCapability : l.improves, capability.what);
    out.field(l.forWhom, capability.forWhom, '  ');
    out.field(l.liftedConstraint, capability.liftedConstraint, '  ');
    if (architecture.principleChange) {
      const { principle, change } = architecture.principleChange;
      out.line(`- **${l.principleChange}** (${l.principles[principle]})${l.sep}${inline(change)}`);
    }
    out.field(l.mechanism, architecture.mechanism);
    // The path: known components, their assembly (new or not), the capability it produces.
    out.line(`- **${l.componentsAssembly}**`);
    for (const component of architecture.components) {
      const date = component.date ? ` (${inline(component.date)})` : '';
      out.line(
        `  - **${inline(component.name)}**${date} — ${inline(component.statement)} ${out.status(component)}`
      );
      out.notes(component, '    ');
      out.trace(component, '    ');
    }
    for (const link of architecture.assembly) {
      out.line(
        `  - ${inline(link.component)} ${l.arrow} ${l.gives}${l.sep}${inline(link.gives)}${l.list}${l.exchange}${l.sep}${inline(link.exchanges)}${l.list}${l.cost}${l.sep}${inline(link.cost)}`
      );
      out.trace(link, '    ');
    }
    const names = architecture.components.map((component) => inline(component.name));
    out.line(
      `  - ${names.join(' + ')} ${l.arrow} ${l.assembly} ${out.status(architecture)} ${l.arrow} ${inline(capability.what)}`
    );
    out.field(l.conditions, architecture.conditions);
    out.field(l.benefit, architecture.benefit);
    out.field(l.addedCost, architecture.addedCost);
    out.field(l.counterexample, architecture.counterexample);
    out.line(`- **${l.chainCoverage}**`);
    for (const stage of architecture.chain) {
      out.line(`  - ${inline(stage.stage)}${l.sep}${inline(stage.how)}`);
    }
    if (architecture.uncoveredStages.length > 0) {
      out.field(l.uncovered, architecture.uncoveredStages.join(l.list));
    }
    out.line(`- **${l.predictions}**`);
    for (const prediction of architecture.predictions) out.line(`  - ${inline(prediction)}`);
    out.line('');
  }
  out.heading(3, l.collections.noveltyClaims);
  for (const claim of report.noveltyClaims) out.claim(claim, claim.architecture);
  out.line('');
}

function experimentsSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.collections.experiments);
  for (const experiment of report.experiments) {
    out.heading(3, `${experiment.id}. ${inline(experiment.name)} ${out.status(experiment)}`);
    out.line(inline(experiment.statement), '');
    out.notes(experiment, '');
    if (experiment.architectures.length > 0) {
      out.field(l.decides, experiment.architectures.join(l.list));
    }
    out.field(l.protocol, experiment.protocol);
    out.field(l.measures, experiment.measures.join(l.list));
    out.field(l.criteria, experiment.criteria.join(l.list));
    if (experiment.expected.length > 0) {
      out.line(`- **${l.expected}**`);
      for (const expected of experiment.expected) {
        out.line(`  - ${inline(expected.architecture)}${l.sep}${inline(expected.result)}`);
      }
    }
    out.field(l.wholeChain, experiment.wholeChain ? l.yes : l.no);
    out.line('');
  }
}

function cardsSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.collections.cards);
  for (const card of report.cards) {
    out.heading(3, `${card.id}. ${inline(card.statement)} ${out.status(card)}`);
    out.notes(card, '');
    const fields: Array<keyof MechanismCard> = [
      'observation',
      'mechanism',
      'unknown',
      'historicalChoice',
      'evolution',
      'newPossibility',
      'proposedCombination',
      'prediction',
      'experiment',
    ];
    fields.forEach((field, index) => {
      out.line(`${index + 1}. **${l.cardFields[index]}**${l.sep}${inline(String(card[field]))}`);
    });
    const result = card.resultAndError
      ? `${inline(card.resultAndError.result)}${card.resultAndError.error ? ` — ${l.error}${l.sep}${inline(card.resultAndError.error)}` : ''}`
      : `_${l.toFill}_`;
    out.line(`10. **${l.cardFields[9]}**${l.sep}${result}`);
    const conclusion = card.conclusionAndMemory
      ? inline(card.conclusionAndMemory)
      : `_${l.toFill}_`;
    out.line(`11. **${l.cardFields[10]}**${l.sep}${conclusion}`, '');
  }
}

function driftSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.driftLog);
  if (report.driftLog.length === 0) out.line(l.noDrift);
  for (const entry of report.driftLog) {
    const id = entry.item.id ? `${entry.item.id} ` : '';
    const statement = entry.item.statement ? `“${inline(entry.item.statement)}”` : '';
    out.line(
      `- **${l.passageNames[entry.passage]}** · ${id}${statement} — _${l.driftBy[entry.by]}_${l.sep}${inline(reasonText(entry.reason, l))}`
    );
  }
  out.line('');
}

function sourcesSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.sources);
  if (report.results.length === 0) out.line(l.noResults);
  for (const result of report.results) {
    const href = safeLink(result.locator);
    const title = href
      ? `[${inline(result.title)}](<${href}>)`
      : `${inline(result.title)} — ${inline(result.locator)}`;
    const date = result.date ? ` (${inline(result.date)})` : '';
    out.line(
      `- **${result.id}** ${title}${date} — _${l.via} ${inline(result.tool)}${l.sep}“${inline(result.query)}”_`
    );
  }
  out.line('');
}

function statsSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.statistics);
  const { stats } = report;
  for (const key of Object.keys(l.stats) as Array<keyof StudyLabels['stats']>) {
    out.line(`- ${l.stats[key]}${l.sep}${stats[key]}`);
  }
  out.line(
    `- ${l.amendments}${l.sep}${stats.amendments.count} (${l.stats.modelCalls}${l.sep}${stats.amendments.modelCalls})`
  );
  const statuses = (['established', 'hypothesis', 'novelty'] as const)
    .map((status) => `${l.statuses[status]} ${stats.byStatus[status]}`)
    .join(' · ');
  out.line(`- ${statuses}`);
}

/**
 * A notice in the dossier's language, from its code, parameters and details alone: passages,
 * limits and collections in the words of the dossier.
 */
function noticeText(notice: StudyNotice, l: StudyLabels): string {
  const details = notice.details ?? [];
  const passages = () =>
    details.map((passage) => l.passageNames[passage as StudyPassage] ?? inline(passage));
  let detail: string;
  switch (notice.code) {
    case 'stopped': {
      const limit = notice.params?.limit as StudyStopReason | undefined;
      detail = limit ? (l.stopReasons[limit] ?? inline(limit)) : '';
      break;
    }
    case 'failed':
      detail = inline(notice.params?.error ?? '');
      break;
    case 'passagesNotRun':
    case 'uncheckedItems':
      detail = passages().join(l.list);
      break;
    case 'searchesSkipped':
      detail = passages().join(l.list) || (notice.params?.count ?? '');
      break;
    case 'minimumsNotMet':
      detail = details
        .map((entry) => {
          const [passage, collection] = entry.split('.');
          const passageName = l.passageNames[passage as StudyPassage] ?? passage;
          const collectionName =
            l.collections[collection as keyof StudyLabels['collections']] ?? collection;
          return `${passageName} (${collectionName})`;
        })
        .join(l.list);
      break;
    case 'leadsNotVerified':
    case 'analoguesNotDeconstructed':
    case 'untracedAssembly':
      detail = inline(details.join(l.list));
      break;
    case 'noveltiesToVerify':
      detail = notice.params?.count ?? '';
      break;
    default:
      detail = '';
  }
  return fillLabel(l.noticeTexts[notice.code], { detail });
}

/** A reason in the dossier's language, its parameters as the study recorded them. */
function reasonText(reason: StudyReason, l: StudyLabels): string {
  return fillLabel(l.reasons[reason.code] ?? reason.message, reason.params);
}

/**
 * A locator as a link target, only for an http(s) URL, written so that Markdown cannot end
 * the link early (no space, parenthesis or angle bracket left raw).
 */
function safeLink(locator: string): string | undefined {
  let url: URL;
  try {
    url = new URL(locator);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  return url.href.replace(/[()<>\s]/g, (character) => LINK_ESCAPES[character] ?? '%20');
}

const LINK_ESCAPES: Record<string, string> = { '(': '%28', ')': '%29', '<': '%3C', '>': '%3E' };

/** Text from the model or the user, kept from breaking the dossier's Markdown. */
function inline(text: string): string {
  return text.replace(/\r?\n+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1');
}
