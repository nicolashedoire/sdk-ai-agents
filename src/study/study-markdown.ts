import { PASSAGES } from './passages.js';
import { type StudyLabels, studyLabels } from './study-labels.js';
import type {
  MechanismCard,
  StudyClaim,
  StudyNotice,
  StudyPassage,
  StudyReport,
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
  out.line(`- **${l.charterHash}**${l.sep}\`${report.charterHash}\``, '');
  if (report.amendments.length > 0) {
    out.line(`### ${l.amendments}`, '');
    for (const amendment of report.amendments) {
      const verdict = l.amendmentVerdicts[amendment.verdict];
      out.line(
        amendment.accepted
          ? `${amendment.number}. ${inline(amendment.text)} — _${verdict}_`
          : `- ~~${inline(amendment.text)}~~ — _${l.refused}, ${verdict}_${l.sep}${inline(amendment.reason)}`
      );
    }
    out.line('');
  }

  if (report.notices.length > 0) {
    out.line(`## ${l.notices}`, '');
    for (const notice of report.notices) out.line(`> - ${noticeText(notice, report, l)}`);
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

  status(claim: StudyClaim): string {
    const l = this.l;
    const status =
      claim.status === 'novelty' && claim.toVerify ? l.noveltyToVerify : l.statuses[claim.status];
    const sources = claim.sources.length > 0 ? ` · ${claim.sources.join(', ')}` : '';
    return `_(${status}${sources})_`;
  }

  notes(claim: StudyClaim, indent: string): void {
    const l = this.l;
    if (claim.statusReason) {
      const declared = claim.declaredStatus
        ? `${l.declared} ${l.statuses[claim.declaredStatus]}${l.sep}`
        : '';
      this.lines.push(`${indent}- _${declared}${inline(claim.statusReason)}_`);
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
    out.heading(3, `${architecture.id}. ${inline(architecture.name)} ${out.status(architecture)}`);
    out.line(inline(architecture.statement), '');
    out.notes(architecture, '');
    out.field(l.mechanism, architecture.mechanism);
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
      `- **${l.passageNames[entry.passage]}** · ${id}${statement} — _${l.driftBy[entry.by]}_${l.sep}${inline(entry.reason)}`
    );
  }
  out.line('');
}

function sourcesSection(out: Writer, report: StudyReport, l: StudyLabels): void {
  out.heading(2, l.sources);
  if (report.results.length === 0) out.line(l.noResults);
  for (const result of report.results) {
    const title = /^https?:\/\//.test(result.locator)
      ? `[${inline(result.title)}](${result.locator})`
      : `${inline(result.title)} — ${inline(result.locator)}`;
    const date = result.date ? ` (${inline(result.date)})` : '';
    out.line(
      `- **${result.id}** ${title}${date} — _${l.via} ${result.tool}${l.sep}“${inline(result.query)}”_`
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
  const statuses = (['established', 'hypothesis', 'novelty'] as const)
    .map((status) => `${l.statuses[status]} ${stats.byStatus[status]}`)
    .join(' · ');
  out.line(`- ${statuses}`);
}

/** A notice in the dossier's language, its detail in the words of the dossier. */
function noticeText(notice: StudyNotice, report: StudyReport, l: StudyLabels): string {
  const passageNames = (details: string[] | undefined) =>
    (details ?? []).map((passage) => l.passageNames[passage as StudyPassage] ?? passage);
  let detail: string;
  switch (notice.code) {
    case 'stopped':
      detail = report.stoppedBy ? l.stopReasons[report.stoppedBy] : '';
      break;
    case 'failed':
      detail = inline(report.error ?? '');
      break;
    case 'passagesNotRun':
    case 'uncheckedItems':
      detail = passageNames(notice.details).join(l.list);
      break;
    case 'searchesSkipped':
      detail = passageNames(notice.details).join(l.list) || String(report.stats.searchesSkipped);
      break;
    case 'leadsNotVerified':
      detail = inline((notice.details ?? []).join(l.list));
      break;
    case 'noveltiesToVerify':
      detail = String(report.stats.noveltiesToVerify);
      break;
    default:
      detail = '';
  }
  return l.noticeTexts[notice.code].replace('{detail}', detail);
}

/** Text from the model or the user, kept from breaking the dossier's Markdown. */
function inline(text: string): string {
  return text.replace(/\r?\n+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1');
}
