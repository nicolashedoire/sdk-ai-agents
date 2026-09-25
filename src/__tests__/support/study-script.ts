import { z } from 'zod';
import type { LLMRequest } from '../../providers/llm-provider.js';
import type { SDK } from '../../sdk.js';
import type { StudyConfig } from '../../study/study-types.js';
import { json, type ScriptedLLMProvider, type ScriptedReply } from './scripted-llm-provider.js';

export const OBJECTIVE = 'A browser design whose every choice follows from the investigation';

/** Written in every scripted reply, outside the schema: it must never reach a later prompt. */
export const TRANSCRIPT_MARKER = 'TRANSCRIPT-MARKER-7f3a';

/** Items whose statement holds it are judged off the objective by the scripted guardian. */
export const OFF_OBJECTIVE = 'OFF-OBJECTIVE';

/** Architectures whose statement holds it are judged only faster, not a new capability. */
export const FASTER_ONLY = 'FASTER-ONLY';

export function studyConfig(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    name: 'browser',
    object: 'The Web browser, from 1990 to 2026',
    objective: OBJECTIVE,
    needs: ['interactions', 'accessibility'],
    leads: ['vectorisation', 'weights', 'ReLU'],
    scope: { exclude: ['mobile operating systems'] },
    sources: ['search_web'],
    model: 'test-model',
    ...overrides,
  };
}

/** An item of a reply: a hypothesis unless told otherwise, saying what it serves. */
export function item(statement: string, fields: Record<string, unknown> = {}) {
  return {
    statement,
    status: 'hypothesis',
    sources: [],
    servesObjective: 'Grounds the redesign in how the browser really works',
    ...fields,
  };
}

/**
 * A passage's reply. Its items and the reply itself carry a field outside the schema, as a
 * model's prose around its answer: the study must drop it, so it never reaches a prompt.
 */
export function passage(collections: Record<string, unknown>): ScriptedReply {
  const marked = Object.fromEntries(
    Object.entries(collections).map(([key, items]) => [
      key,
      Array.isArray(items)
        ? items.map((entry) => ({ ...(entry as object), aside: TRANSCRIPT_MARKER }))
        : items,
    ])
  );
  return json({ ...marked, chatter: TRANSCRIPT_MARKER });
}

/** The replies of every passage of a complete study of the browser. */
export const REPLIES = {
  observe: passage({
    observations: [
      item('Pages render progressively while they load', {
        kind: 'behaviour',
        conditions: 'Slow networks, 1995',
      }),
      item('Heavy pages freeze the interface', {
        kind: 'failure',
        conditions: 'Single-threaded engines, 2005',
      }),
    ],
  }),
  decompose: passage({
    pieces: [
      item('Parses HTML into a tree', {
        name: 'Parser',
        function: 'Builds the document tree',
        inputs: ['bytes'],
        outputs: ['DOM'],
        relations: ['feeds Layout'],
        unknowns: ['How much of parsing can be parallel'],
      }),
      item('Computes boxes from the tree and styles', {
        name: 'Layout',
        function: 'Places every box',
        inputs: ['DOM', 'styles'],
        outputs: ['fragments'],
        relations: ['feeds Paint'],
        unknowns: [],
      }),
    ],
    chain: [
      item('Bytes arrive from the network', { stage: 'receive', pieces: [] }),
      item('The document is parsed and styled', { stage: 'understand', pieces: ['Parser'] }),
      item('Boxes are painted on screen', { stage: 'display', pieces: ['Layout'] }),
    ],
  }),
  historicalChoicesQueries: json({
    queries: [
      {
        source: 'search_web',
        query: 'WorldWideWeb NeXT text editor',
        servesObjective: 'Documents the first choices',
      },
    ],
  }),
  historicalChoices: passage({
    historicalChoices: [
      item('The first browser reused the NeXT text editing component', {
        choice: 'Build on an existing text editor',
        factors: ['tools'],
        status: 'established',
        sources: ['S1'],
      }),
    ],
  }),
  changesQueries: json({
    queries: [
      {
        source: 'search_web',
        query: 'LayoutNG immutable fragments',
        servesObjective: 'Finds how layout changed',
      },
      {
        source: 'search_web',
        query: 'ReLU in rendering',
        servesObjective: 'Verifies the lead ReLU',
      },
    ],
  }),
  changes: passage({
    advances: [
      item('Layout produces immutable fragments', {
        mechanism: 'Immutable fragment trees',
        date: '2021',
        evidence: 'Chromium engineering notes',
        conditions: 'An engine that separates inputs from results',
        availability: 'In Blink',
        status: 'established',
        sources: ['S2'],
      }),
    ],
    leadVerdicts: [
      item('Vector graphics are already central to rendering', {
        lead: 'vectorisation',
        verdict: 'relevant',
        reasons: 'Paint works on vector primitives',
      }),
      item('Weights make sense only for learned components', {
        lead: 'weights',
        verdict: 'partlyRelevant',
        reasons: 'Only where a model predicts',
      }),
      item('An activation function has no place in layout', {
        lead: 'ReLU',
        verdict: 'notRelevant',
        reasons: 'Layout is not a neural network',
        sources: ['S3'],
      }),
    ],
    independentLeads: [
      item('Incremental computation reuses results', {
        tool: 'Incremental computation',
        kind: 'mathematical',
      }),
    ],
    references: [item('Blink with LayoutNG', { name: 'Blink' })],
    analogues: [
      item('Bitcoin assembled prior techniques into a ledger without a trusted third party', {
        breakthrough: 'Bitcoin',
        date: '2008',
        domain: 'money',
        components: [
          { name: 'Public-key signatures', date: '1976' },
          { name: 'Hash chains and timestamping', date: '1991' },
          { name: 'Hashcash proof of work', date: '1997' },
          { name: 'Merkle trees', date: '1979' },
          { name: 'Peer-to-peer networks', date: '1999' },
        ],
        liftedConstraint: 'A shared ledger needed a trusted third party',
        capability: 'A shared ledger without a trusted third party',
        pattern: 'Replace a trusted party by verifiable work and signatures replicated by peers',
      }),
    ],
  }),
  cross: passage({
    constraints: [
      item('Compatibility with the existing Web remains', {
        constraint: 'Web compatibility',
        state: 'remains',
      }),
    ],
    revisableDecisions: [
      item('Mutable layout objects can be revised', {
        decision: 'Mutable layout objects',
        because: 'Memory is cheap enough for immutable results',
        opens: 'Reusing results across frames',
      }),
    ],
    combinations: [
      item('Immutable fragments let the GPU batch draws', {
        a: 'Immutable fragments',
        b: 'GPU batching',
        enables: 'Stable draw lists',
        exchange: 'Fragment ids',
        cost: 'A conversion per frame',
        changes: ['representation'],
      }),
    ],
    capabilities: [
      item('Rendering results shared across devices', {
        capability: 'Reuse rendering results across devices and users',
        forWhom: 'People on weak devices',
        hardToday: 'Every client renders everything alone',
        principle: 'distribution',
      }),
    ],
  }),
  design: passage({
    architectures: [
      item('One explicit representation of rendering results', {
        name: 'Shared results',
        kind: 'capability',
        capability: {
          what: 'Pages whose rendering results are reused across tabs and devices',
          forWhom: 'People on weak devices',
          liftedConstraint: 'Every client recomputes everything alone',
        },
        principleChange: {
          principle: 'distribution',
          change: 'Rendering results become shared data instead of private state of a tab',
        },
        components: [
          {
            name: 'Immutable fragments',
            statement: 'Layout produces immutable fragments',
            date: '2021',
            status: 'established',
            sources: ['S2'],
          },
          { name: 'Content addressing', statement: 'A hash names a content', status: 'hypothesis' },
        ],
        assembly: [
          {
            component: 'Immutable fragments',
            gives: 'Results that never change once computed',
            exchanges: 'Fragment trees',
            cost: 'Memory for versions',
          },
          {
            component: 'Content addressing',
            gives: 'A name to find a result again',
            exchanges: 'Hashes',
            cost: 'Hashing each fragment',
          },
        ],
        mechanism: 'Every stage reads and writes immutable results',
        conditions: 'Memory for several versions',
        benefit: 'Reuse and fewer conversions',
        addedCost: 'Memory',
        counterexample: 'Pages that change every frame',
        chain: [
          { stage: 'receive', how: 'Streams bytes into the parser' },
          { stage: 'understand', how: 'Parses into immutable trees' },
          { stage: 'display', how: 'Paints from fragments' },
        ],
        predictions: ['Fewer relayouts on scroll'],
      }),
      item('An existing engine as a library', {
        name: 'Reused engine',
        kind: 'improvement',
        capability: {
          what: 'A working browser sooner',
          forWhom: 'The team',
          liftedConstraint: 'Building an engine takes years',
        },
        components: [
          { name: 'Servo', statement: 'Servo is published as a library', status: 'hypothesis' },
        ],
        mechanism: 'Embed Servo and redesign around it',
        conditions: 'A stable embedding API',
        benefit: 'Less to build',
        addedCost: 'Less control over the engine',
        counterexample: 'A change deep in layout',
        chain: [
          { stage: 'receive', how: 'The engine’s network stack' },
          { stage: 'understand', how: 'The engine’s parser' },
        ],
        predictions: ['Faster to a working browser'],
      }),
    ],
    threeStates: [
      item('Mutable layout objects mixing inputs and results', {
        piece: 'Layout',
        state: 'atItsTime',
      }),
      item('LayoutNG fragments', { piece: 'Layout', state: 'currentBest' }),
      item('Fragments shared with paint', {
        piece: 'Layout',
        state: 'proposal',
        architecture: 'Shared results',
      }),
    ],
    noveltyClaims: [
      item('Fragments as the common currency of every stage', { status: 'novelty' }),
      item('Reusing an engine is not new', { status: 'hypothesis' }),
    ],
  }),
  // Both follow the novelties the prompt shows, whatever their ids.
  priorArtQueries: {
    respond: (request) =>
      json({
        queries: claimsShown(request).map((claim) => ({
          claim: claim.id,
          source: firstSource(request),
          query: `prior art of ${claim.statement}`,
          servesObjective: 'Checks whether the idea exists',
        })),
      }),
  } satisfies ScriptedReply,
  priorArtCheck: {
    respond: (request) =>
      json({
        checks: claimsShown(request).map((claim) => ({
          claim: claim.id,
          closest: 'WebRender batches display lists, not layout fragments',
          // Every result listed: the study keeps those of the claim's own searches.
          sources: [...(request.messages.at(-1)?.content ?? '').matchAll(/"id":"(S\d+)"/g)].map(
            (match) => match[1]
          ),
          verdict: 'partlyNovel',
        })),
      }),
  } satisfies ScriptedReply,
  confront: passage({
    experiments: [
      item('Decides between shared results and a reused engine', {
        name: 'Scroll benchmark',
        architectures: ['Shared results', 'Reused engine'],
        protocol: 'Scroll 100 heavy pages',
        measures: ['frame time', 'memory'],
        criteria: ['p95 frame time under 16 ms'],
        expected: [
          { architecture: 'Shared results', result: 'Fewer relayouts' },
          { architecture: 'Reused engine', result: 'Unchanged' },
        ],
        wholeChain: true,
      }),
    ],
    cards: [
      item('Layout as immutable fragments', {
        observation: 'Heavy pages freeze',
        mechanism: 'Relayout of mutable objects',
        unknown: 'Cost of versions',
        historicalChoice: 'Mutable objects were cheaper in memory',
        evolution: 'LayoutNG, 2021 (S2)',
        newPossibility: 'Reuse across frames',
        proposedCombination: 'Fragments + GPU batching',
        prediction: 'Fewer relayouts on scroll',
        experiment: 'Scroll benchmark',
        resultAndError: { result: 'written by the model, to drop' },
      }),
    ],
  }),
};

/** The novelties a prior-art prompt shows. */
export function claimsShown(request: LLMRequest): Array<{ id: string; statement: string }> {
  const task = request.messages.at(-1)?.content ?? '';
  const shown = /Claimed novelties \(JSON\):\n(.*)/.exec(task)?.[1];
  return shown ? (JSON.parse(shown) as Array<{ id: string; statement: string }>) : [];
}

/** The first search source a prompt lists. */
function firstSource(request: LLMRequest): string {
  return /Search sources:\n- ([^:]+):/.exec(request.messages.at(-1)?.content ?? '')?.[1] ?? '';
}

/** The items a guardian prompt shows: an architecture also shows its kind. */
export function checkedItems(
  request: LLMRequest
): Array<{ id: string; statement: string; kind?: string }> {
  const task = request.messages.at(-1)?.content ?? '';
  const shown = /Items to check \(JSON\):\n(.*)/.exec(task)?.[1];
  return shown ? (JSON.parse(shown) as Array<{ id: string; statement: string }>) : [];
}

/**
 * A guardian that judges off the objective exactly the items marked `OFF-OBJECTIVE`, and an
 * architecture a new capability unless it is an improvement or marked `FASTER-ONLY`.
 */
export const guardian: ScriptedReply = {
  respond: (request) =>
    json({
      verdicts: checkedItems(request).map((shown) => {
        const off = shown.statement.includes(OFF_OBJECTIVE);
        return {
          id: shown.id,
          onObjective: !off,
          reason: off ? 'It is about another subject' : 'It serves the objective',
          ...(shown.kind
            ? {
                newCapability:
                  shown.kind === 'capability' && !shown.statement.includes(FASTER_ONLY),
                ...(shown.statement.includes(FASTER_ONLY)
                  ? { capabilityReason: 'It only makes rendering faster' }
                  : {}),
              }
            : {}),
        };
      }),
    }),
};

/** Scripts a complete study: every passage, its searches, the guardian and the prior art. */
export function scriptStudy(provider: ScriptedLLMProvider): ScriptedLLMProvider {
  provider
    .always('study:observe', REPLIES.observe)
    .always('study:decompose', REPLIES.decompose)
    .always('study-queries:historicalChoices', REPLIES.historicalChoicesQueries)
    .always('study:historicalChoices', REPLIES.historicalChoices)
    .always('study-queries:changes', REPLIES.changesQueries)
    .always('study:changes', REPLIES.changes)
    .always('study:cross', REPLIES.cross)
    .always('study:design', REPLIES.design)
    .always('study-prior-art-queries:design', REPLIES.priorArtQueries)
    .always('study-prior-art-check:design', REPLIES.priorArtCheck)
    .always('study:confront', REPLIES.confront);
  for (const passageName of [
    'observe',
    'decompose',
    'historicalChoices',
    'changes',
    'cross',
    'design',
    'confront',
  ]) {
    provider.always(`study-check:${passageName}`, guardian);
  }
  return provider;
}

/** The queries the search tool received, in order. */
export interface SearchLog {
  queries: string[];
}

/**
 * A search source the study uses as a real SDK tool: one result per query, whose URL is made
 * from the query, so a query asked again finds the same result.
 */
export function defineSearchTool(sdk: SDK, log: SearchLog = { queries: [] }): SearchLog {
  sdk.defineTool({
    name: 'search_web',
    description: 'Searches the web and returns results with a title, a URL, a date and a snippet',
    schema: z.object({ query: z.string() }),
    handler: async ({ query }) => {
      log.queries.push(query);
      return {
        results: [
          {
            title: `About ${query}`,
            url: `https://example.org/${encodeURIComponent(query)}`,
            date: '2021',
            snippet: `What is known about ${query}`,
          },
        ],
      };
    },
  });
  return log;
}
