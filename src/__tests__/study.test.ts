import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { LLMRequest } from '../providers/llm-provider.js';
import { renderStudyMarkdown } from '../study/study-markdown.js';
import type { StudyConfig, StudyReport } from '../study/study-types.js';
import { channelOf, json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  defineSearchTool,
  item,
  OBJECTIVE,
  OFF_OBJECTIVE,
  passage,
  REPLIES,
  scriptStudy,
  studyConfig,
  TRANSCRIPT_MARKER,
} from './support/study-script.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

// A study is a researcher: it understands an object, then proposes a redesign with today's
// means. The model is scripted per call (`study:observe`, `study-check:observe`…); searches go
// through a real SDK tool; everything else is the study's own code.
describe('sdk.createStudy', () => {
  let env: TestSDK | undefined;

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
  });

  function setup(config: Partial<StudyConfig> = {}, provider = new ScriptedLLMProvider()) {
    env = createTestSDK({}, scriptStudy(provider));
    const searches = defineSearchTool(env.sdk);
    const study = env.sdk.createStudy(studyConfig(config));
    return { env, study, provider, searches };
  }

  function requestsOf(provider: ScriptedLLMProvider, channel: string) {
    return provider.requests.filter((request) => channelOf(request) === channel);
  }

  const lastMessage = (request: LLMRequest | undefined) =>
    request?.messages.at(-1)?.content ?? '';

  describe('passages', () => {
    it('runs the seven passages in order and brings their items to the report', async () => {
      const { study, provider, env } = setup();

      const result = await study.run();

      expect(result.status).toBe('completed');
      expect(result.report.passages.map((state) => [state.passage, state.state])).toEqual([
        ['observe', 'complete'],
        ['decompose', 'complete'],
        ['historicalChoices', 'complete'],
        ['changes', 'complete'],
        ['cross', 'complete'],
        ['design', 'complete'],
        ['confront', 'complete'],
      ]);
      const passages = provider
        .channels()
        .filter((channel) => channel.startsWith('study:'))
        .map((channel) => channel.slice('study:'.length));
      expect(passages).toEqual([
        'observe',
        'decompose',
        'historicalChoices',
        'changes',
        'cross',
        'design',
        'confront',
      ]);
      const { report } = result;
      expect(report.observations.map(({ id, statement, kind }) => ({ id, statement, kind }))).toEqual([
        { id: 'O1', statement: 'Pages render progressively while they load', kind: 'behaviour' },
        { id: 'O2', statement: 'Heavy pages freeze the interface', kind: 'failure' },
      ]);
      expect(report.pieces.map((piece) => [piece.id, piece.name, piece.unknowns])).toEqual([
        ['P1', 'Parser', ['How much of parsing can be parallel']],
        ['P2', 'Layout', []],
      ]);
      expect(report.chain.map((stage) => stage.stage)).toEqual(['receive', 'understand', 'display']);
      expect(report.historicalChoices).toHaveLength(1);
      expect(report.advances.map((advance) => advance.mechanism)).toEqual([
        'Immutable fragment trees',
      ]);
      expect(report.leadVerdicts.map((verdict) => [verdict.lead, verdict.verdict])).toEqual([
        ['vectorisation', 'relevant'],
        ['weights', 'partlyRelevant'],
        ['ReLU', 'notRelevant'],
      ]);
      expect(report.independentLeads.map((lead) => lead.tool)).toEqual(['Incremental computation']);
      expect(report.references.map((reference) => reference.name)).toEqual(['Blink']);
      expect(report.constraints.map((constraint) => constraint.state)).toEqual(['remains']);
      expect(report.revisableDecisions).toHaveLength(1);
      expect(report.combinations.map((combination) => [combination.a, combination.b])).toEqual([
        ['Immutable fragments', 'GPU batching'],
      ]);
      expect(report.architectures.map((architecture) => architecture.name)).toEqual([
        'Shared results',
        'Reused engine',
      ]);
      expect(report.threeStates).toEqual([
        expect.objectContaining({
          piece: 'Layout',
          atItsTime: [expect.objectContaining({ id: 'T1' })],
          currentBest: [expect.objectContaining({ id: 'T2' })],
          proposal: [expect.objectContaining({ id: 'T3', architecture: 'Shared results' })],
        }),
      ]);
      expect(report.noveltyClaims.map((claim) => claim.id)).toEqual(['N1', 'N2']);
      expect(report.experiments.map((experiment) => experiment.name)).toEqual(['Scroll benchmark']);
      expect(report.cards.map((card) => card.id)).toEqual(['M1']);
      // Every item says what it serves, and which run produced it.
      for (const claim of [...report.observations, ...report.cards]) {
        expect(claim.servesObjective).toBe('Grounds the redesign in how the browser really works');
        expect(claim.runId).toBe(result.runId);
      }

      // Each passage records its items.
      const completed = await env.sdk.getEvents(result.runId, { type: 'study.passage_completed' });
      expect(completed.map((event) => event.data.passage)).toEqual(passages);
      expect(completed[0]?.data.items).toEqual([
        expect.objectContaining({ id: 'O1', collection: 'observations' }),
        expect.objectContaining({ id: 'O2', collection: 'observations' }),
      ]);
    });

    it('checks how each architecture covers the whole chain', async () => {
      const { study } = setup();

      const { report } = await study.run();

      expect(report.architectures.map((architecture) => architecture.uncoveredStages)).toEqual([
        [],
        ['display'],
      ]);
    });

    it('asks for a verdict on every user lead, and says which ones got none', async () => {
      const provider = new ScriptedLLMProvider();
      const withoutReLU = passage({
        advances: [
          item('Layout produces immutable fragments', {
            mechanism: 'Immutable fragment trees',
            evidence: 'Chromium notes',
            conditions: 'A separated engine',
            availability: 'In Blink',
          }),
        ],
        leadVerdicts: [
          item('Vector graphics are central', {
            lead: 'Vectorisation',
            verdict: 'relevant',
            reasons: 'Paint',
          }),
          item('Weights only for learned parts', {
            lead: 'weights',
            verdict: 'partly relevant',
            reasons: 'Models',
          }),
          item('A lead nobody gave', { lead: 'quantum', verdict: 'relevant', reasons: 'None' }),
        ],
      });
      provider.enqueue('study:changes', withoutReLU);
      provider.enqueue('study:changes:repair', withoutReLU);
      const { study } = setup({}, provider);

      const { report } = await study.run();

      const repair = requestsOf(provider, 'study:changes:repair');
      expect(repair).toHaveLength(1);
      expect(lastMessage(repair[0])).toContain('missing: ReLU');
      // The lead is matched as the charter writes it; one the user never gave is refused.
      expect(report.leadVerdicts.map((verdict) => [verdict.lead, verdict.verdict])).toEqual([
        ['vectorisation', 'relevant'],
        ['weights', 'partlyRelevant'],
      ]);
      expect(report.unverifiedLeads).toEqual(['ReLU']);
      expect(report.notices).toContainEqual(
        expect.objectContaining({ code: 'leadsNotVerified', details: ['ReLU'] })
      );
      expect(report.driftLog).toContainEqual(
        expect.objectContaining({
          passage: 'changes',
          by: 'schema',
          reason: expect.stringContaining('"quantum" is not one of the user\'s leads'),
        })
      );
    });

    it('asks again for a design with fewer than two architectures, and fails the run with what was done', async () => {
      const provider = new ScriptedLLMProvider();
      const single = passage({
        architectures: [
          item('One architecture only', {
            name: 'Alone',
            mechanism: 'm',
            conditions: 'c',
            benefit: 'b',
            addedCost: 'a',
            counterexample: 'x',
            chain: [{ stage: 'receive', how: 'h' }],
            predictions: ['p'],
          }),
        ],
      });
      provider.enqueue('study:design', single).enqueue('study:design:repair', single);
      const { study } = setup({}, provider);

      const result = await study.run();

      expect(lastMessage(requestsOf(provider, 'study:design:repair')[0])).toContain(
        '"architectures" needs at least 2 valid item(s), got 1'
      );
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('architectures');
      expect(result.report.passages.map((state) => state.state)).toEqual([
        'complete',
        'complete',
        'complete',
        'complete',
        'complete',
        'notRun',
        'notRun',
      ]);
      expect(result.report.combinations).toHaveLength(1);
    });

    it('lets a passage reopen an earlier one, within maxLoops', async () => {
      const provider = new ScriptedLLMProvider();
      const blocked = json({
        ...JSON.parse((REPLIES.design as { content: string }).content),
        reopen: {
          passage: 'decompose',
          focus: 'how Paint works',
          reason: 'the design cannot place painting without it',
        },
      });
      const paint = passage({
        pieces: [
          item('Turns fragments into draw commands', {
            name: 'Paint',
            function: 'Draws',
            inputs: ['fragments'],
            outputs: ['commands'],
            relations: [],
            unknowns: [],
          }),
        ],
        chain: [item('Pixels are composited', { stage: 'composite', pieces: ['Paint'] })],
      });
      // The design asks every time: only one loop is allowed.
      provider.enqueue('study:design', blocked, blocked);
      provider.enqueue('study:decompose', REPLIES.decompose, paint);
      const { study } = setup({}, provider);

      const result = await study.run();

      expect(result.status).toBe('completed');
      expect(requestsOf(provider, 'study:decompose')).toHaveLength(2);
      expect(requestsOf(provider, 'study:design')).toHaveLength(2);
      const reopened = requestsOf(provider, 'study:decompose')[1];
      expect(lastMessage(reopened)).toContain(
        'This passage is reopened by the passage "design" to examine: how Paint works'
      );
      // The reopened passage adds to its items; the design ran again with them.
      expect(result.report.pieces.map((piece) => piece.name)).toEqual(['Parser', 'Layout', 'Paint']);
      expect(lastMessage(requestsOf(provider, 'study:design')[1])).toContain(
        'Turns fragments into draw commands'
      );
      expect(result.report.passages.find((state) => state.passage === 'decompose')).toMatchObject(
        { state: 'complete', reopenedBy: ['design'] }
      );
      expect(result.report.stats.loops).toBe(1);
      // Once no loop is left, the design is no longer offered to reopen anything.
      expect(lastMessage(requestsOf(provider, 'study:design')[1])).not.toContain('"reopen"');
    });

    it('offers no reopening when maxLoops is 0', async () => {
      const { study, provider } = setup({ limits: { maxLoops: 0 } });

      await study.run();

      expect(lastMessage(requestsOf(provider, 'study:design')[0])).not.toContain('"reopen"');
      expect(lastMessage(requestsOf(provider, 'study:decompose')[0])).not.toContain(
        '"reopen"'
      );
    });
  });

  describe('claim statuses, checked in code', () => {
    it('keeps established only a claim citing a result this study retrieved', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study:historicalChoices',
        passage({
          historicalChoices: [
            item('Reused the NeXT editor', {
              choice: 'Reuse',
              status: 'established',
              sources: ['S1'],
            }),
            item('Chose SGML for its familiarity', {
              choice: 'SGML',
              status: 'established',
              sources: ['S1', 'S99'],
            }),
            item('Kept HTML small for slow machines', {
              choice: 'Small HTML',
              status: 'established',
              sources: ['S99'],
            }),
            item('Ignored styles at first', { choice: 'No styles', status: 'established' }),
          ],
        })
      );
      const { study, env, searches } = setup({}, provider);

      const result = await study.run();

      const [reused, sgml, small, styles] = result.report.historicalChoices;
      expect(reused).toMatchObject({ status: 'established', sources: ['S1'] });
      expect(reused?.declaredStatus).toBeUndefined();
      // One retrieved result is enough; the other citation supports nothing.
      expect(sgml).toMatchObject({
        status: 'established',
        sources: ['S1'],
        unretrievedSources: ['S99'],
      });
      expect(small).toMatchObject({
        status: 'hypothesis',
        declaredStatus: 'established',
        sources: [],
        unretrievedSources: ['S99'],
        statusReason: 'Declared established, but it cites S99, never retrieved in this study.',
      });
      expect(styles).toMatchObject({
        status: 'hypothesis',
        declaredStatus: 'established',
        statusReason: 'Declared established, but it cites no result retrieved in this study.',
      });
      expect(result.report.stats.downgraded).toBe(2);

      // The search ran through the SDK's governed tool execution, inside the study's run.
      expect(searches.queries[0]).toBe('WorldWideWeb NeXT text editor');
      const called = await env.sdk.getEvents(result.runId, { type: 'tool.called' });
      expect(called[0]).toMatchObject({
        data: { toolName: 'search_web', parameters: { query: 'WorldWideWeb NeXT text editor' } },
        metadata: { agentId: study.id },
      });
      const [search] = await env.sdk.getEvents(result.runId, { type: 'study.search' });
      expect(search?.data).toMatchObject({
        passage: 'historicalChoices',
        tool: 'search_web',
        query: 'WorldWideWeb NeXT text editor',
        resultIds: ['S1'],
        results: [
          {
            id: 'S1',
            title: 'About WorldWideWeb NeXT text editor',
            locator: 'https://example.org/WorldWideWeb%20NeXT%20text%20editor',
            date: '2021',
          },
        ],
      });
      expect(result.report.results[0]).toMatchObject({
        id: 'S1',
        excerpt: 'What is known about WorldWideWeb NeXT text editor',
        tool: 'search_web',
      });
    });

    it('gives a result found again the id it already had', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study-queries:changes',
        json({
          queries: [
            {
              source: 'search_web',
              query: 'WorldWideWeb NeXT text editor',
              servesObjective: 'Checks again',
            },
            { source: 'search_web', query: 'LayoutNG', servesObjective: 'Finds layout' },
          ],
        })
      );
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(report.searches.map((search) => search.resultIds)).toEqual([
        ['S1'],
        ['S1'],
        ['S2'],
        ['S3'],
      ]);
      expect(report.results.map((result) => result.id)).toEqual(['S1', 'S2', 'S3']);
    });

    it('establishes nothing without sources, and says so first', async () => {
      const { study, provider } = setup({ sources: [] });

      const result = await study.run();

      const claims = [
        ...result.report.historicalChoices,
        ...result.report.advances,
        ...result.report.observations,
      ];
      expect(claims.every((claim) => claim.status !== 'established')).toBe(true);
      expect(result.report.historicalChoices[0]).toMatchObject({
        status: 'hypothesis',
        declaredStatus: 'established',
        statusReason:
          'Declared established, but the study has no source: nothing can be established.',
      });
      expect(result.report.stats.byStatus.established).toBe(0);
      expect(result.report.notices[0]?.code).toBe('noSources');
      expect(result.markdown).toContain(
        'The study had no search source: no claim could be established'
      );
      // Nothing to search with: no query is asked.
      expect(provider.channels().some((channel) => channel.startsWith('study-queries'))).toBe(false);
      expect(lastMessage(requestsOf(provider, 'study:observe')[0])).toContain(
        'No search source is configured for this study: nothing can be established.'
      );
    });

    it('keeps a novelty to verify until its prior art has been searched', async () => {
      const { study } = setup({ sources: [] });

      const { report } = await study.run();

      expect(report.noveltyClaims[0]).toMatchObject({
        status: 'novelty',
        toVerify: true,
        statusReason: 'Novelty to verify: the study has no source to search its prior art.',
      });
      expect(report.noveltyClaims[0]?.priorArt).toBeUndefined();
      expect(report.stats.noveltiesToVerify).toBe(1);
      expect(report.notices).toContainEqual(expect.objectContaining({ code: 'noveltiesToVerify' }));
    });

    it('records the prior art a search found for a novelty', async () => {
      const { study, provider, searches } = setup();

      const { report } = await study.run();

      expect(searches.queries.at(-1)).toBe(
        'prior art of Fragments as the common currency of every stage'
      );
      expect(lastMessage(requestsOf(provider, 'study-prior-art-check:design')[0])).toContain(
        '[S4] About prior art of Fragments as the common currency of every stage'
      );
      expect(report.noveltyClaims[0]).toMatchObject({
        status: 'novelty',
        priorArt: {
          closest: 'WebRender batches display lists, not layout fragments',
          sources: ['S4'],
          verdict: 'partlyNovel',
        },
      });
      expect(report.noveltyClaims[0]?.toVerify).toBeUndefined();
      expect(report.searches.at(-1)).toMatchObject({ purpose: 'priorArt', claims: ['N1'] });
    });

    it('lowers to a hypothesis a novelty whose prior art already does it', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study-prior-art-check:design',
        json({
          checks: [
            { claim: 'N1', closest: 'Servo already shares fragments', sources: ['S4'], verdict: 'exists' },
          ],
        })
      );
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(report.noveltyClaims[0]).toMatchObject({
        status: 'hypothesis',
        declaredStatus: 'novelty',
        statusReason: 'Not a novelty: Servo already shares fragments',
      });
    });

    it('leaves a novelty to verify when the search budget ran out before its prior art', async () => {
      // One search for the historical choices, two for the changes: none left for prior art.
      const { study, provider } = setup({ limits: { maxSearches: 3 } });

      const result = await study.run();

      expect(result.status).toBe('completed');
      expect(provider.channels()).not.toContain('study-prior-art-queries:design');
      expect(result.report.noveltyClaims[0]).toMatchObject({
        status: 'novelty',
        toVerify: true,
        statusReason:
          'Novelty to verify: the search budget (maxSearches) ran out before its prior-art search.',
      });
      expect(result.report.notices).toContainEqual(
        expect.objectContaining({ code: 'searchesSkipped', details: ['design'] })
      );
    });

    it('leaves a novelty to verify when no prior-art search was run for it', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue('study-prior-art-queries:design', json({ queries: [] }));
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(report.noveltyClaims[0]).toMatchObject({
        toVerify: true,
        statusReason: 'Novelty to verify: no prior-art search was run for it.',
      });
      expect(provider.channels()).not.toContain('study-prior-art-check:design');
    });

    it('leaves to verify a novelty claimed after the design', async () => {
      const provider = new ScriptedLLMProvider();
      const confront = JSON.parse((REPLIES.confront as { content: string }).content);
      confront.cards[0].status = 'novelty';
      provider.enqueue('study:confront', json(confront));
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(report.cards[0]).toMatchObject({ status: 'novelty', toVerify: true });
    });
  });

  describe('staying on the objective', () => {
    it('starts every prompt with the charter, ends it with the reminder, and carries no transcript', async () => {
      const provider = new ScriptedLLMProvider();
      // A reply that cannot be used, then its repair.
      provider.enqueue('study:observe', { content: `No JSON here ${TRANSCRIPT_MARKER}` });
      provider.enqueue('study:observe:repair', REPLIES.observe);
      provider.enqueue(
        'study-amendment',
        json({ verdict: 'refines', reason: 'A need within the objective' })
      );
      const { study } = setup({}, provider);
      await study.amend('Examine memory safety too');

      await study.run();

      const channels = new Set(provider.channels());
      for (const expected of [
        'study:observe',
        'study:observe:repair',
        'study-check:observe',
        'study-queries:changes',
        'study-prior-art-queries:design',
        'study-prior-art-check:design',
        'study-amendment',
      ]) {
        expect(channels).toContain(expected);
      }
      for (const request of provider.requests) {
        expect(request.messages.map((message) => message.role)).toEqual(['system', 'user']);
        const [system, user] = request.messages.map((message) => message.content);
        expect(system?.startsWith('STUDY CHARTER (immutable, sha256 ')).toBe(true);
        expect(system).toContain(`Objective: ${OBJECTIVE}`);
        expect(system).toContain(study.charterHash.slice(0, 16));
        expect(user).toContain('REMINDER\nThis step must produce: ');
        expect(user?.endsWith(`Objective: ${OBJECTIVE}`)).toBe(true);
        // Nothing of an earlier reply reaches a prompt: no assistant turn, no stray text.
        expect(`${system}\n${user}`).not.toContain(TRANSCRIPT_MARKER);
      }
      // The repair says why the reply was refused, not what it was.
      const repair = requestsOf(provider, 'study:observe:repair')[0];
      expect(lastMessage(repair)).toContain(
        'Your previous reply could not be used: the reply does not contain a JSON object.'
      );
      // Later passages get the earlier ones as compact records, not as a conversation.
      expect(lastMessage(requestsOf(provider, 'study:decompose')[0])).toContain(
        'Records of earlier passages (JSON):\n{"observations":[{"kind":"behaviour","conditions":"Slow networks, 1995","id":"O1"'
      );
    });

    it('removes items off the objective, logs them, and redoes the passage once past the threshold', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study:observe',
        passage({
          observations: [
            item('Pages render progressively', { kind: 'behaviour', conditions: 'Slow networks' }),
            item(`The history of the typewriter ${OFF_OBJECTIVE}`, {
              kind: 'use',
              conditions: 'Offices',
            }),
            item(`Coffee machines in offices ${OFF_OBJECTIVE}`, {
              kind: 'use',
              conditions: 'Offices',
            }),
          ],
        }),
        passage({
          observations: [
            item('Heavy pages freeze the interface', { kind: 'failure', conditions: 'One thread' }),
            item('Tabs multiplied memory use', { kind: 'variation', conditions: '2010s' }),
            item(`Fountain pens ${OFF_OBJECTIVE}`, { kind: 'use', conditions: 'Desks' }),
          ],
        })
      );
      const { study, env } = setup({}, provider);

      const result = await study.run();

      // Two of three off the objective (> 1/3): redone once, never a third time.
      const attempts = requestsOf(provider, 'study:observe');
      expect(attempts).toHaveLength(2);
      expect(lastMessage(attempts[1])).toContain(
        `- "The history of the typewriter ${OFF_OBJECTIVE}": It is about another subject`
      );
      expect(result.report.observations.map((observation) => [observation.id, observation.statement])).toEqual([
        ['O4', 'Heavy pages freeze the interface'],
        ['O5', 'Tabs multiplied memory use'],
      ]);
      expect(result.report.driftLog).toEqual([
        expect.objectContaining({
          passage: 'observe',
          collection: 'observations',
          item: expect.objectContaining({ id: 'O2' }),
          reason: 'It is about another subject',
          by: 'guardian',
          attempt: 1,
        }),
        expect.objectContaining({ item: expect.objectContaining({ id: 'O3' }), attempt: 1 }),
        expect.objectContaining({ item: expect.objectContaining({ id: 'O6' }), attempt: 2 }),
      ]);
      const drift = await env.sdk.getEvents(result.runId, { type: 'study.drift_rejected' });
      expect(drift.map((event) => (event.data.item as { id: string }).id)).toEqual([
        'O2',
        'O3',
        'O6',
      ]);
      expect(result.report.passages[0]).toMatchObject({ passage: 'observe', attempts: 2 });
      expect(result.report.stats).toMatchObject({ redos: 1, rejected: 3 });
      // The next passage never sees what was removed.
      expect(lastMessage(requestsOf(provider, 'study:decompose')[0])).not.toContain(
        OFF_OBJECTIVE
      );
      expect(result.markdown).toContain('## Drift log');
      expect(result.markdown).toContain(
        `**Observe** · O2 “The history of the typewriter ${OFF_OBJECTIVE}” — _off the objective_: It is about another subject`
      );
    });

    it('keeps a passage whose rejections stay under the threshold, without redoing it', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study:observe',
        passage({
          observations: [
            item('A', { kind: 'behaviour', conditions: 'c' }),
            item('B', { kind: 'behaviour', conditions: 'c' }),
            item('C', { kind: 'behaviour', conditions: 'c' }),
            item(`D ${OFF_OBJECTIVE}`, { kind: 'use', conditions: 'c' }),
          ],
        })
      );
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(requestsOf(provider, 'study:observe')).toHaveLength(1);
      expect(report.observations.map((observation) => observation.statement)).toEqual([
        'A',
        'B',
        'C',
      ]);
      expect(report.driftLog.map((entry) => entry.item.id)).toEqual(['O4']);
    });

    it('refuses an item that does not say what it serves', async () => {
      const provider = new ScriptedLLMProvider();
      const { servesObjective: _serves, ...unanchored } = item('Browsers have tabs', {
        kind: 'use',
        conditions: 'Since 2001',
      });
      provider.enqueue(
        'study:observe',
        passage({
          observations: [
            item('Pages render progressively', { kind: 'behaviour', conditions: 'Slow networks' }),
            item('Heavy pages freeze', { kind: 'failure', conditions: 'One thread' }),
            item('Pages load images late', { kind: 'behaviour', conditions: 'Modems' }),
            unanchored,
          ],
        })
      );
      const { study, provider: used } = setup({}, provider);

      const { report } = await study.run();

      expect(report.observations.map((observation) => observation.statement)).not.toContain(
        'Browsers have tabs'
      );
      expect(report.driftLog).toEqual([
        expect.objectContaining({
          passage: 'observe',
          by: 'schema',
          item: { statement: 'Browsers have tabs' },
          reason: 'no "servesObjective": the item does not say what it serves in the objective',
        }),
      ]);
      // The guardian never sees it.
      expect(lastMessage(requestsOf(used, 'study-check:observe')[0])).not.toContain(
        'Browsers have tabs'
      );
    });

    it('shows the guardian only the charter, the amendments and the passage’s items', async () => {
      const { study, provider } = setup();

      await study.run();

      const check = lastMessage(requestsOf(provider, 'study-check:decompose')[0]);
      expect(check).toContain('"id":"P1","statement":"Parses HTML into a tree"');
      // No record of an earlier passage, no search result.
      expect(check).not.toContain('Pages render progressively');
      expect(lastMessage(requestsOf(provider, 'study-check:historicalChoices')[0])).not.toContain(
        'https://example.org'
      );
    });

    it('accepts an amendment that refines the objective and shows it in every later prompt', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study-amendment',
        json({ verdict: 'refines', reason: 'Memory safety is a need of today within the objective' })
      );
      const { study, env } = setup({}, provider);

      const amendment = await study.amend('  Examine memory safety too ');

      expect(amendment).toMatchObject({
        number: 1,
        text: 'Examine memory safety too',
        verdict: 'refines',
        accepted: true,
      });
      // Classified in a run of its own, recorded.
      const events = await env.sdk.getEvents(amendment.runId);
      expect(events.map((event) => event.type)).toEqual([
        'run.started',
        'study.model_called',
        'study.amendment_accepted',
        'run.completed',
      ]);
      expect(events[2]?.data).toMatchObject({
        number: 1,
        text: 'Examine memory safety too',
        charterHash: study.charterHash,
      });

      const result = await study.run();

      const passages = provider.requests.filter((request) => channelOf(request) !== 'study-amendment');
      expect(passages.length).toBeGreaterThan(10);
      for (const request of passages) {
        expect(request.messages[0]?.content).toContain(
          'Accepted amendments (subordinate to the objective):\n1. Examine memory safety too'
        );
      }
      const [started] = await env.sdk.getEvents(result.runId, { type: 'study.started' });
      expect(started?.data.amendments).toEqual([{ number: 1, text: 'Examine memory safety too' }]);
      const [firstPassage] = await env.sdk.getEvents(result.runId, {
        type: 'study.passage_started',
      });
      expect(firstPassage?.data.amendments).toEqual([1]);
      expect(result.markdown).toContain('1. Examine memory safety too — _refines the objective, accepted_');
    });

    it('refuses an amendment that conflicts with the charter or changes the objective', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study-amendment',
        json({ verdict: 'conflicts', reason: 'Accessibility is a need of the charter' }),
        json({ verdict: 'changes objective', reason: 'It studies another object' }),
        { error: new Error('the vendor is down') }
      );
      const { study, env } = setup({}, provider);

      const conflicting = await study.amend('Ignore accessibility');
      const changing = await study.amend('Study the car instead');
      const unclassified = await study.amend('Look at fonts');

      expect(conflicting).toMatchObject({
        verdict: 'conflicts',
        accepted: false,
        reason: 'Accessibility is a need of the charter',
      });
      expect(conflicting.number).toBeUndefined();
      expect(changing).toMatchObject({
        verdict: 'changesObjective',
        accepted: false,
        reason:
          'It studies another object A new objective is a new study: create one with sdk.createStudy.',
      });
      expect(unclassified).toMatchObject({ verdict: 'unclassified', accepted: false });
      expect(unclassified.reason).toContain('the vendor is down');
      const refused = await env.sdk.getEvents(changing.runId, { type: 'study.amendment_refused' });
      expect(refused[0]?.data).toMatchObject({ verdict: 'changesObjective', accepted: false });

      await study.run();

      for (const request of provider.requests.filter(
        (candidate) => channelOf(candidate) !== 'study-amendment'
      )) {
        const prompt = request.messages.map((message) => message.content).join('\n');
        expect(prompt).not.toContain('Accepted amendments');
        expect(prompt).not.toContain('Ignore accessibility');
        expect(prompt).not.toContain('Study the car instead');
      }
      expect(study.amendments.map((amendment) => amendment.accepted)).toEqual([false, false, false]);
    });

    it('freezes and hashes the charter, and records it when a run starts', async () => {
      const { study, env } = setup({ language: 'fr' });

      expect(Object.isFrozen(study.charter)).toBe(true);
      expect(Object.isFrozen(study.charter.leads)).toBe(true);
      expect(Object.isFrozen(study.charter.scope.exclude)).toBe(true);
      expect(() => {
        (study.charter as { objective: string }).objective = 'Something else';
      }).toThrow(TypeError);
      expect(study.charter.question).toBe(
        'Si nous devions satisfaire les besoins d’aujourd’hui avec les connaissances et les techniques disponibles aujourd’hui, comment organiserions-nous cet objet ?'
      );
      expect(study.charterHash).toMatch(/^[0-9a-f]{64}$/);
      const same = env.sdk.createStudy(studyConfig({ language: 'fr', name: 'another name' }));
      const other = env.sdk.createStudy(studyConfig({ language: 'fr', objective: 'Another goal' }));
      expect(same.charterHash).toBe(study.charterHash);
      expect(other.charterHash).not.toBe(study.charterHash);

      const result = await study.run();

      const [started] = await env.sdk.getEvents(result.runId, { type: 'study.started' });
      expect(started?.data).toMatchObject({
        name: 'browser',
        charterHash: study.charterHash,
        charter: {
          object: 'The Web browser, from 1990 to 2026',
          objective: OBJECTIVE,
          needs: ['interactions', 'accessibility'],
          leads: ['vectorisation', 'weights', 'ReLU'],
          scope: { exclude: ['mobile operating systems'] },
        },
        sources: ['search_web'],
        language: 'fr',
      });
      expect(started?.metadata).toMatchObject({ agentId: study.id, studyName: 'browser' });
    });
  });

  describe('configuration', () => {
    it('refuses a bad configuration or a source that is not a defined tool', () => {
      env = createTestSDK();
      const sdk = env.sdk;
      sdk.defineTool({
        name: 'count_pages',
        description: 'Counts pages',
        schema: z.object({ limit: z.number() }),
        handler: async () => 0,
      });

      expect(() => sdk.createStudy(studyConfig({ sources: ['search_nowhere'] }))).toThrow(
        'no tool "search_nowhere"'
      );
      expect(() => sdk.createStudy(studyConfig({ sources: ['count_pages'] }))).toThrow(
        'takes no text query'
      );
      expect(() => sdk.createStudy(studyConfig({ objective: '  ' }))).toThrow(ValidationError);
      expect(() => sdk.createStudy(studyConfig({ limits: { maxModelCalls: 0 } }))).toThrow(
        'limits.maxModelCalls'
      );
      expect(() => sdk.createStudy(studyConfig({ limits: { maxSteps: 3 } as never }))).toThrow(
        ValidationError
      );
      expect(() => sdk.createStudy(studyConfig({ language: 'français' }))).toThrow('language');
    });

    it('puts the query in the parameter the source takes it in', async () => {
      const provider = scriptStudy(new ScriptedLLMProvider());
      env = createTestSDK({}, provider);
      const received: unknown[] = [];
      env.sdk.defineTool({
        name: 'papers',
        description: 'Searches papers',
        schema: z.object({ limit: z.number().optional(), q: z.string() }),
        handler: async (parameters) => {
          received.push(parameters);
          return `A single plain-text answer about ${parameters.q}`;
        },
      });
      provider.enqueue(
        'study-queries:historicalChoices',
        json({ queries: [{ query: 'NeXT', servesObjective: 'Documents the choice' }] })
      );
      provider.enqueue('study-queries:changes', json({ queries: [] }));
      const study = env.sdk.createStudy(studyConfig({ sources: ['papers'] }));

      const { report, status } = await study.run();

      expect(status).toBe('completed');
      expect(received[0]).toEqual({ q: 'NeXT' });
      expect(report.results[0]).toMatchObject({
        id: 'S1',
        title: 'A single plain-text answer about NeXT',
        locator: 'papers: "NeXT"',
      });
    });
  });

  describe('results of experiments', () => {
    it('fills fields 10 and 11 of a card when the user records a result', async () => {
      const { study, env } = setup();
      const result = await study.run();
      // What the model wrote in the user's fields was dropped.
      expect(result.report.cards[0]?.resultAndError).toBeUndefined();
      expect(result.markdown).toContain(
        '10. **Result and error**: _to fill once the experiment has run_'
      );

      const card = await study.recordResult('m1', {
        result: 'p95 frame time fell from 22 ms to 14 ms',
        error: 'Memory grew more than predicted',
        conclusion: 'Keep fragments; bound their versions',
      });

      expect(card).toMatchObject({
        id: 'M1',
        resultAndError: {
          result: 'p95 frame time fell from 22 ms to 14 ms',
          error: 'Memory grew more than predicted',
        },
        conclusionAndMemory: 'Keep fragments; bound their versions',
      });
      expect(study.report().cards[0]).toMatchObject({
        resultAndError: { result: 'p95 frame time fell from 22 ms to 14 ms' },
        conclusionAndMemory: 'Keep fragments; bound their versions',
      });
      // The report of the run stays what it was.
      expect(result.report.cards[0]?.resultAndError).toBeUndefined();
      const recorded = await env.sdk.getEvents(result.runId, { type: 'study.result_recorded' });
      expect(recorded[0]?.data).toEqual({
        card: 'M1',
        resultAndError: {
          result: 'p95 frame time fell from 22 ms to 14 ms',
          error: 'Memory grew more than predicted',
        },
        conclusionAndMemory: 'Keep fragments; bound their versions',
      });
      const markdown = renderStudyMarkdown(study.report());
      expect(markdown).toContain(
        '10. **Result and error**: p95 frame time fell from 22 ms to 14 ms — Error: Memory grew more than predicted'
      );
      expect(markdown).toContain('11. **Conclusion and memory**: Keep fragments; bound their versions');

      await expect(study.recordResult('M9', { result: 'x' })).rejects.toThrow(
        'no card "M9" in this study (cards: M1)'
      );
      await expect(study.recordResult('M1', { result: ' ' })).rejects.toThrow(ValidationError);
    });
  });

  describe('the dossier', () => {
    it('writes the charter, every status with its sources, and the sources, in the study’s language', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study:historicalChoices',
        passage({
          historicalChoices: [
            item('Reused the NeXT editor', {
              choice: 'Reuse',
              status: 'established',
              sources: ['S1'],
            }),
            item('Kept HTML small', { choice: 'Small', status: 'established', sources: ['S99'] }),
          ],
        })
      );
      const { study } = setup({ language: 'fr' }, provider);

      const result = await study.run();
      const markdown = result.markdown;

      expect(markdown).toBe(renderStudyMarkdown(result.report));
      expect(markdown.startsWith('# Étude : The Web browser, from 1990 to 2026\n')).toBe(true);
      expect(markdown).toContain(`- **Objectif** : ${OBJECTIVE}`);
      expect(markdown).toContain('- **Question directrice** : Si nous devions satisfaire');
      expect(markdown).toContain(
        '- **Pistes de l’utilisateur (des exemples à vérifier, non des vérités)** : vectorisation ; weights ; ReLU'
      );
      expect(markdown).toContain(`\`${study.charterHash}\``);
      expect(markdown).toContain('## Le principe');
      expect(markdown).toContain('**Reuse** — Reused the NeXT editor _(établi · S1)_');
      expect(markdown).toContain('**Small** — Kept HTML small _(hypothèse)_');
      expect(markdown).toContain(
        '_déclaré établi : Declared established, but it cites S99, never retrieved in this study._'
      );
      expect(markdown).toContain('Fragments as the common currency of every stage _(nouveauté)_');
      expect(markdown).toContain(
        '**Existant** (en partie nouveau · S4) : WebRender batches display lists, not layout fragments'
      );
      expect(markdown).toContain('## Trois états');
      expect(markdown).toContain('**L’objet à son époque** — Mutable layout objects');
      expect(markdown).toContain('## Pistes de conception');
      expect(markdown).toContain('**Étapes non couvertes** : display');
      expect(markdown).toContain('## Fiches de mécanisme');
      expect(markdown).toContain('9. **Expérience** : Scroll benchmark');
      expect(markdown).toContain('## Sources');
      expect(markdown).toContain(
        '- **S1** [About WorldWideWeb NeXT text editor](https://example.org/WorldWideWeb%20NeXT%20text%20editor) (2021) — _via search\\_web : “WorldWideWeb NeXT text editor”_'
      );
      expect(markdown).toContain('## Journal de dérive');
      expect(markdown).toContain('Aucun élément n’a quitté l’objectif.');
    });

    it('writes a partial dossier that says so, and English words for a language it lacks', async () => {
      const { study } = setup({ language: 'eo', limits: { maxModelCalls: 2 } });

      const result = await study.run();

      expect(result.markdown.startsWith('# Study: ')).toBe(true);
      expect(result.markdown).toContain('## Before reading');
      expect(result.markdown).toContain('> - The run was stopped (model call limit); this dossier is partial.');
      expect(result.markdown).toContain('| 2 | Decompose | not run |');
    });

    it('keeps the model’s text from breaking the Markdown', () => {
      const report = {
        ...emptyReport(),
        observations: [
          {
            id: 'O1',
            passage: 'observe' as const,
            statement: 'A *bold* claim\n# not a heading | [link](x)',
            status: 'hypothesis' as const,
            sources: [],
            servesObjective: 's',
            runId: 'r',
            kind: 'use' as const,
            conditions: 'c',
          },
        ],
      };

      const markdown = renderStudyMarkdown(report);

      expect(markdown).toContain(
        '- **Use** — A \\*bold\\* claim # not a heading \\| \\[link\\](x) _(hypothesis)_'
      );
    });
  });
});

function emptyReport(): StudyReport {
  return {
    studyId: 'study_x',
    name: 'x',
    language: 'en',
    charter: {
      object: 'o',
      question: 'q',
      objective: 'obj',
      needs: [],
      leads: [],
      scope: { exclude: [] },
    },
    charterHash: 'h',
    amendments: [],
    status: 'notRun',
    notices: [],
    passages: [],
    observations: [],
    pieces: [],
    chain: [],
    threeStates: [],
    historicalChoices: [],
    advances: [],
    leadVerdicts: [],
    unverifiedLeads: [],
    independentLeads: [],
    references: [],
    constraints: [],
    revisableDecisions: [],
    combinations: [],
    architectures: [],
    noveltyClaims: [],
    experiments: [],
    cards: [],
    results: [],
    searches: [],
    driftLog: [],
    stats: {
      runs: 0,
      modelCalls: 0,
      searches: 0,
      searchesSkipped: 0,
      results: 0,
      items: 0,
      rejected: 0,
      byStatus: { established: 0, hypothesis: 0, novelty: 0 },
      downgraded: 0,
      noveltiesToVerify: 0,
      redos: 0,
      loops: 0,
    },
    runIds: [],
  };
}
