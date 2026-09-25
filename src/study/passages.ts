import { z } from 'zod';
import type {
  MechanismCard,
  StudyAdvance,
  StudyAnalogue,
  StudyArchitecture,
  StudyCapability,
  StudyChainStage,
  StudyClaim,
  StudyClaimStatus,
  StudyCombination,
  StudyConstraint,
  StudyExperiment,
  StudyHistoricalChoice,
  StudyIndependentLead,
  StudyLeadVerdict,
  StudyNoveltyClaim,
  StudyObservation,
  StudyPassage,
  StudyPiece,
  StudyReference,
  StudyRevisableDecision,
  StudyThreeState,
} from './study-types.js';

/** The items each collection holds. */
export interface StudyCollections {
  analogues: StudyAnalogue;
  capabilities: StudyCapability;
  observations: StudyObservation;
  pieces: StudyPiece;
  chain: StudyChainStage;
  historicalChoices: StudyHistoricalChoice;
  advances: StudyAdvance;
  leadVerdicts: StudyLeadVerdict;
  independentLeads: StudyIndependentLead;
  references: StudyReference;
  constraints: StudyConstraint;
  revisableDecisions: StudyRevisableDecision;
  combinations: StudyCombination;
  architectures: StudyArchitecture;
  threeStates: StudyThreeState;
  noveltyClaims: StudyNoveltyClaim;
  experiments: StudyExperiment;
  cards: MechanismCard;
}

export type StudyCollection = keyof StudyCollections;

export interface CollectionSpec {
  key: StudyCollection;
  /** Letter of its item ids (`O1`, `P2`…). */
  prefix: string;
  /** The item's own fields as the model writes them, besides the claim's (for the prompt). */
  shape: string;
  /** Checks those fields. */
  fields: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>;
  /** Items a reply must hold, once the schema has refused the malformed ones. */
  min: number;
}

export interface PassageSpec {
  passage: StudyPassage;
  /** Its place in the method, from 1. */
  number: number;
  /** The method's work for this passage. */
  task: string;
  /** What it must produce: repeated in the reminder at the end of every prompt. */
  produces: string;
  collections: CollectionSpec[];
  /** It searches the sources before it writes. */
  researches: boolean;
  /** The records of earlier passages it is given (compact JSON, never a transcript). */
  needs: StudyCollection[];
}

const text = z.string().trim().min(1);
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  text.optional()
);
const texts = z.array(text).default([]);

const STATUSES: readonly StudyClaimStatus[] = ['established', 'hypothesis', 'novelty'];

/**
 * A claim's status as the model wrote it. One the study cannot read counts as none: the claim
 * is then a hypothesis, the weakest, never a stronger one.
 */
export const claimStatus = z.preprocess((value) => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : undefined;
  return STATUSES.find((known) => known === status);
}, z.enum(['established', 'hypothesis', 'novelty']).optional());

/** Result ids as the model may write them: `S1`, `[S1]`, `s1`, or "S1, S2" in one string. */
export const resultIds = z.preprocess((value) => {
  const list = typeof value === 'string' ? value.split(/[,;\s]+/) : value;
  if (!Array.isArray(list)) return list;
  return list
    .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
    .map((entry) =>
      String(entry)
        .replace(/[[\]\s]/g, '')
        .toUpperCase()
    )
    .filter((entry) => entry !== '');
}, z.array(z.string()).default([]));

/** An enum that accepts other spellings and cases (`partly relevant`, `behavior`). */
function looseEnum<const Values extends readonly [string, ...string[]]>(
  values: Values,
  aliases: Record<string, Values[number]> = {}
) {
  const byKey = new Map<string, Values[number]>();
  for (const value of values) byKey.set(enumKey(value), value);
  for (const [alias, value] of Object.entries(aliases)) byKey.set(enumKey(alias), value);
  return z.preprocess(
    (value) => (typeof value === 'string' ? (byKey.get(enumKey(value)) ?? value) : value),
    z.enum(values)
  );
}

function enumKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/** The fields an item has besides the claim's: what the model writes for that kind. */
type Fields<Item extends StudyClaim, Computed extends keyof Item = never> = Omit<
  Item,
  keyof StudyClaim | Computed
>;

type FieldsSchema<Item extends StudyClaim, Computed extends keyof Item = never> = z.ZodType<
  Fields<Item, Computed>,
  z.ZodTypeDef,
  unknown
>;

const observationFields: FieldsSchema<StudyObservation> = z.object({
  kind: looseEnum(['behaviour', 'use', 'variation', 'failure'], { behavior: 'behaviour' }),
  conditions: text,
  era: optionalText,
});

const pieceFields: FieldsSchema<StudyPiece> = z.object({
  name: text,
  function: text,
  inputs: texts,
  outputs: texts,
  relations: texts,
  unknowns: texts,
  parent: optionalText,
});

const chainFields: FieldsSchema<StudyChainStage> = z.object({ stage: text, pieces: texts });

const choiceFields: FieldsSchema<StudyHistoricalChoice> = z.object({
  choice: text,
  piece: optionalText,
  factors: z
    .array(
      looseEnum(['hardware', 'tools', 'uses', 'knowledge', 'costs', 'compatibility', 'other'], {
        cost: 'costs',
        use: 'uses',
        tool: 'tools',
      })
    )
    .default([]),
  era: optionalText,
});

const advanceFields: FieldsSchema<StudyAdvance> = z.object({
  mechanism: text,
  date: optionalText,
  domain: looseEnum(['object', 'other'], { same: 'object', otherDomain: 'other' }).default(
    'object'
  ),
  field: optionalText,
  evidence: text,
  conditions: text,
  availability: text,
  piece: optionalText,
});

const leadVerdictFields: FieldsSchema<StudyLeadVerdict> = z.object({
  lead: text,
  verdict: looseEnum(['relevant', 'partlyRelevant', 'notRelevant'], {
    partly: 'partlyRelevant',
    irrelevant: 'notRelevant',
  }),
  reasons: text,
});

const independentLeadFields: FieldsSchema<StudyIndependentLead> = z.object({
  tool: text,
  kind: looseEnum(['mathematical', 'technical', 'other'], { math: 'mathematical' }).default(
    'other'
  ),
  piece: optionalText,
});

const referenceFields: FieldsSchema<StudyReference> = z.object({
  name: text,
  piece: optionalText,
  date: optionalText,
});

const constraintFields: FieldsSchema<StudyConstraint> = z.object({
  constraint: text,
  state: looseEnum(['remains', 'weakened', 'newRequirement'], {
    remaining: 'remains',
    new: 'newRequirement',
  }),
  piece: optionalText,
});

const revisableFields: FieldsSchema<StudyRevisableDecision> = z.object({
  decision: text,
  because: text,
  opens: text,
});

const combinationFields: FieldsSchema<StudyCombination> = z.object({
  a: text,
  b: text,
  enables: text,
  exchange: text,
  cost: text,
  changes: z
    .array(looseEnum(['representation', 'distribution', 'responsibilities'], {}))
    .default([]),
});

const principle = looseEnum(
  ['representation', 'distribution', 'responsibility', 'trust', 'verification', 'other'],
  {
    responsibilities: 'responsibility',
    distributionOfWork: 'distribution',
    verified: 'verification',
  }
);

/** A prior technique of an assembly, as the model writes it: a claim of its own. */
export const componentSchema = z.object({
  name: text,
  statement: text,
  date: optionalText,
  status: claimStatus,
  sources: resultIds,
});

// Components are settled by the study (their statuses checked), so they are left out of the
// fields checked against the item's type.
const architectureFields: FieldsSchema<
  StudyArchitecture,
  'uncoveredStages' | 'declaredKind' | 'components'
> = z
  .object({
    name: text,
    // Only faster or cheaper unless it says otherwise: never a stronger claim than written.
    kind: looseEnum(['capability', 'improvement'], { newCapability: 'capability' }).default(
      'improvement'
    ),
    capability: z.object({ what: text, forWhom: text, liftedConstraint: text }),
    principleChange: z.object({ principle, change: text }).optional(),
    mechanism: text,
    components: z.array(componentSchema).min(1),
    assembly: z
      .array(z.object({ component: text, gives: text, exchanges: text, cost: text }))
      .default([]),
    conditions: text,
    benefit: text,
    addedCost: text,
    counterexample: text,
    chain: z.array(z.object({ stage: text, how: text })).min(1),
    predictions: z.array(text).min(1),
  })
  .superRefine((architecture, context) => {
    if (architecture.kind !== 'capability') return;
    if (!architecture.principleChange) {
      context.addIssue({
        code: 'custom',
        path: ['principleChange'],
        message: 'a capability states the principle it changes',
      });
    }
    if (architecture.assembly.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['assembly'],
        message: 'a capability says how its components are assembled',
      });
    }
  });

const capabilityFields: FieldsSchema<StudyCapability> = z.object({
  capability: text,
  forWhom: text,
  hardToday: text,
  principle: principle.optional(),
});

const analogueFields: FieldsSchema<StudyAnalogue> = z.object({
  breakthrough: text,
  domain: optionalText,
  date: optionalText,
  components: z.array(z.object({ name: text, date: optionalText })).min(2),
  liftedConstraint: text,
  capability: text,
  pattern: text,
});

const threeStateFields: FieldsSchema<StudyThreeState> = z.object({
  piece: text,
  state: looseEnum(['atItsTime', 'currentBest', 'proposal'], {
    past: 'atItsTime',
    current: 'currentBest',
    ours: 'proposal',
  }),
  architecture: optionalText,
});

const noveltyFields: FieldsSchema<StudyNoveltyClaim> = z.object({ architecture: optionalText });

const experimentFields: FieldsSchema<StudyExperiment> = z.object({
  name: text,
  architectures: texts,
  protocol: text,
  measures: z.array(text).min(1),
  criteria: z.array(text).min(1),
  expected: z.array(z.object({ architecture: text, result: text })).default([]),
  wholeChain: z.boolean().default(false),
});

// Fields 10 and 11 are the user's (`recordResult`): what a reply writes there is dropped.
const cardFields: FieldsSchema<MechanismCard> = z.object({
  observation: text,
  mechanism: text,
  unknown: text,
  historicalChoice: text,
  evolution: text,
  newPossibility: text,
  proposedCombination: text,
  prediction: text,
  experiment: text,
});

function collection(
  key: StudyCollection,
  prefix: string,
  shape: string,
  fields: CollectionSpec['fields'],
  min = 0
): CollectionSpec {
  return { key, prefix, shape, fields, min };
}

/** The seven passages of the method, in order. */
export const PASSAGES: readonly PassageSpec[] = [
  {
    passage: 'observe',
    number: 1,
    task: 'Observe the object: its behaviours, uses, variations and failures, across the period of the object. Each observation is situated: it states its conditions (when, where, for whom, with what). Describe what the object does; do not explain it yet.',
    produces:
      'situated observations of behaviours, uses, variations and failures, each with its conditions',
    collections: [
      collection(
        'observations',
        'O',
        '"statement": string, "kind": "behaviour" | "use" | "variation" | "failure", "conditions": string, "era"?: string',
        observationFields,
        1
      ),
    ],
    researches: false,
    needs: [],
  },
  {
    passage: 'decompose',
    number: 2,
    task: 'Decompose the object: its pieces, their function, inputs, outputs and relations. Go down into a piece (a piece whose "parent" is the piece it details) while its working stays opaque. Give the unknowns of each piece explicitly. Define also the whole chain of the object: its stages in order, from what comes in to what the user gets (for a browser: receive, understand, execute, display, interact), with the pieces of each stage.',
    produces: 'a map of the pieces with their unknowns, and the whole chain of the object in order',
    collections: [
      collection(
        'pieces',
        'P',
        '"statement": string (how it works), "name": string, "function": string, "inputs": [string], "outputs": [string], "relations": [string], "unknowns": [string], "parent"?: string',
        pieceFields,
        1
      ),
      collection(
        'chain',
        'C',
        '"statement": string, "stage": string, "pieces": [string]',
        chainFields,
        1
      ),
    ],
    researches: false,
    needs: ['observations'],
  },
  {
    passage: 'historicalChoices',
    number: 3,
    task: 'Understand the choices of their time: for the main pieces, find the documented reasons of their construction (hardware, tools, uses, knowledge, costs, compatibility). Link each choice to the conditions in which it was made. A plausible reason without a document stays a hypothesis.',
    produces:
      'the link between each choice and the conditions of its time, documented by a source or kept as a hypothesis',
    collections: [
      collection(
        'historicalChoices',
        'H',
        '"statement": string (the choice and its reason), "choice": string, "piece"?: string, "factors": ["hardware" | "tools" | "uses" | "knowledge" | "costs" | "compatibility" | "other"], "era"?: string',
        choiceFields,
        1
      ),
    ],
    researches: true,
    needs: ['pieces', 'chain'],
  },
  {
    passage: 'changes',
    number: 4,
    task: 'Examine what changed: research, realisations, libraries, hardware and methods that appeared or became usable since, in the object’s domain and in other domains. For each advance give its mechanism, date, evidence, conditions of use and availability. Verify each of the user’s leads, which are examples and not truths: relevant, partly relevant or not relevant, with reasons. Search independently for other mathematical and technical tools, beyond the user’s leads. List the best current realisations: they are the reference for "better". A technique introduced earlier and already in use is not new: say when it appeared. Look also, in any domain, for past breakthroughs that came from assembling earlier techniques rather than from a technique without precedent (Bitcoin assembled public-key signatures, hash chains and timestamping, proof of work, Merkle trees and a peer-to-peer network, all prior, into a shared ledger without a trusted third party): for each, the earlier techniques and their dates, the constraint it lifted, the capability that opened, and the assembly pattern. Deconstruct every breakthrough the charter names.',
    produces:
      'advances (mechanism, date, evidence, conditions, availability), a verdict on every user lead, independent leads, the best current realisations, and breakthroughs by assembly with their patterns',
    collections: [
      collection(
        'advances',
        'V',
        '"statement": string, "mechanism": string, "date"?: string, "domain": "object" | "other", "field"?: string, "evidence": string, "conditions": string, "availability": string, "piece"?: string',
        advanceFields,
        1
      ),
      collection(
        'leadVerdicts',
        'L',
        '"statement": string, "lead": string (one of the user’s leads, copied exactly), "verdict": "relevant" | "partlyRelevant" | "notRelevant", "reasons": string',
        leadVerdictFields
      ),
      collection(
        'independentLeads',
        'I',
        '"statement": string, "tool": string, "kind": "mathematical" | "technical" | "other", "piece"?: string',
        independentLeadFields
      ),
      collection(
        'references',
        'R',
        '"statement": string (what it does best), "name": string, "piece"?: string, "date"?: string',
        referenceFields
      ),
      collection(
        'analogues',
        'B',
        '"statement": string, "breakthrough": string, "domain"?: string, "date"?: string, "components": [{ "name": string, "date"?: string }] (the earlier techniques it assembled), "liftedConstraint": string, "capability": string (what opened), "pattern": string (the assembly pattern)',
        analogueFields
      ),
    ],
    researches: true,
    needs: ['pieces', 'chain', 'historicalChoices'],
  },
  {
    passage: 'cross',
    number: 5,
    task: 'Cross past and present: which constraints remain, which have weakened, which new requirements have appeared. Derive the decisions that became revisable and the possibilities they open. Propose combinations A + B: what A lets B do, what they must exchange, and what it costs (conversions, synchronisation); two pieces fast on their own can lose their time converting or synchronising once joined. Look for crossings that change the representation, the distribution of work or the responsibilities of the object, as the breakthroughs by assembly did. Then name the new capabilities they could open: what would become possible that is difficult or impossible today, not only faster or cheaper, for whom, why it is hard today (the constraint to lift) and which principle would change. When the charter names the capability aimed at, examine that one.',
    produces:
      'the constraints that remain, weakened or appeared, the decisions that became revisable, combinations with their exchanges and costs, and candidate new capabilities',
    collections: [
      collection(
        'constraints',
        'K',
        '"statement": string, "constraint": string, "state": "remains" | "weakened" | "newRequirement", "piece"?: string',
        constraintFields,
        1
      ),
      collection(
        'revisableDecisions',
        'D',
        '"statement": string, "decision": string, "because": string (the condition that changed), "opens": string (the possibility it opens)',
        revisableFields
      ),
      collection(
        'combinations',
        'X',
        '"statement": string, "a": string, "b": string, "enables": string (what A lets B do), "exchange": string, "cost": string, "changes": ["representation" | "distribution" | "responsibilities"]',
        combinationFields
      ),
      collection(
        'capabilities',
        'Y',
        '"statement": string, "capability": string (what would become possible), "forWhom": string, "hardToday": string (the constraint to lift), "principle"?: "representation" | "distribution" | "responsibility" | "trust" | "verification" | "other"',
        capabilityFields
      ),
    ],
    researches: false,
    needs: [
      'pieces',
      'historicalChoices',
      'advances',
      'leadVerdicts',
      'independentLeads',
      'references',
      'analogues',
    ],
  },
  {
    passage: 'design',
    number: 6,
    task: 'Design several organisations: at least two architectures. Aim at a new capability: a change of principle that makes possible something difficult or impossible today, not only something faster or cheaper. Replace, merge, split or remove pieces; change their representation, their interfaces, the distribution of work, who holds responsibility or trust, or what is verified. Each architecture gives its kind ("capability", or "improvement" when it is only faster or cheaper), the capability it opens (what, for whom, the constraint it lifts), the principle it changes, its mechanism (how the assembly produces the capability), its components (the prior techniques it assembles, each with its status and the results that document it) and its assembly (what each component gives the others, what they exchange, what it costs); then its necessary conditions, expected benefit, added cost, a possible counterexample, how it covers every stage of the whole chain, and its predictions. Use the patterns of the breakthroughs by assembly. The novelty lies in the assembly and the capability it produces, not in the components: an architecture whose assembly does not exist yet has the status "novelty" and will be checked against prior art as a combination. For each main piece, give its three states: the object at its time, the best relevant current realisations, and our proposal. Say what is novel and what is not.',
    produces:
      'at least two architectures, at least one aiming at a new capability, each with its components, assembly, mechanism and predictions, covering the whole chain; the three states of each main piece; what is novel and what is not',
    collections: [
      collection(
        'architectures',
        'A',
        '"statement": string, "name": string, "kind": "capability" | "improvement", "capability": { "what": string, "forWhom": string, "liftedConstraint": string }, "principleChange": { "principle": "representation" | "distribution" | "responsibility" | "trust" | "verification" | "other", "change": string } (required for a capability), "mechanism": string (how the assembly produces the capability), "components": [{ "name": string, "statement": string, "date"?: string, "status": "established" | "hypothesis", "sources": [string] }] (prior techniques), "assembly": [{ "component": string, "gives": string, "exchanges": string, "cost": string }], "conditions": string, "benefit": string, "addedCost": string, "counterexample": string, "chain": [{ "stage": string, "how": string }] (every stage of the whole chain), "predictions": [string]',
        architectureFields,
        2
      ),
      collection(
        'threeStates',
        'T',
        '"statement": string, "piece": string, "state": "atItsTime" | "currentBest" | "proposal", "architecture"?: string',
        threeStateFields
      ),
      collection(
        'noveltyClaims',
        'N',
        '"statement": string (what is novel, or what is not), "architecture"?: string',
        noveltyFields
      ),
    ],
    researches: false,
    needs: [
      'observations',
      'pieces',
      'chain',
      'historicalChoices',
      'advances',
      'references',
      'analogues',
      'constraints',
      'revisableDecisions',
      'combinations',
      'capabilities',
    ],
  },
  {
    passage: 'confront',
    number: 7,
    task: 'Confront: you build, run and measure nothing. Design the experiments that would decide between the architectures and test the whole chain: protocol, measures, criteria, and the expected result for each architecture. Then fill a mechanism card for each main mechanism, fields 1 to 9: observation, mechanism, unknown, historical choice with its evidence, evolution with sources and dates, new possibility, proposed combination, prediction, experiment. Fields 10 and 11 (result and error, conclusion and memory) stay empty for the user.',
    produces:
      'experiments that decide between the architectures and test the whole chain, and a mechanism card (fields 1 to 9) for each main mechanism',
    collections: [
      collection(
        'experiments',
        'E',
        '"statement": string (what it decides), "name": string, "architectures": [string], "protocol": string, "measures": [string], "criteria": [string], "expected": [{ "architecture": string, "result": string }], "wholeChain": boolean',
        experimentFields,
        1
      ),
      collection(
        'cards',
        'M',
        '"statement": string (the mechanism of the card), "observation": string, "mechanism": string, "unknown": string, "historicalChoice": string, "evolution": string, "newPossibility": string, "proposedCombination": string, "prediction": string, "experiment": string',
        cardFields,
        1
      ),
    ],
    researches: false,
    needs: [
      'observations',
      'pieces',
      'chain',
      'historicalChoices',
      'advances',
      'combinations',
      'architectures',
      'noveltyClaims',
    ],
  },
];

export function passageSpec(passage: StudyPassage): PassageSpec {
  const spec = PASSAGES.find((candidate) => candidate.passage === passage);
  if (!spec) throw new Error(`Unknown study passage: ${passage}`);
  return spec;
}

/** Every collection, in the order of the passages. */
export const COLLECTIONS: readonly CollectionSpec[] = PASSAGES.flatMap((spec) => spec.collections);
