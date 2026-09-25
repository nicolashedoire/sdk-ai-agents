import { afterEach, describe, expect, it } from 'vitest';
import type { LLMRequest } from '../providers/llm-provider.js';
import type { StudyConfig } from '../study/study-types.js';
import { channelOf, json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  defineSearchTool,
  FASTER_ONLY,
  item,
  REPLIES,
  scriptStudy,
  studyConfig,
} from './support/study-script.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

// The owner looks for a change of principle that makes possible something difficult today,
// not only something faster; the novelty of a proposal lies in its assembly of earlier
// techniques, as with Bitcoin.
describe('studies aim at a new capability', () => {
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

  const requestsOf = (provider: ScriptedLLMProvider, channel: string) =>
    provider.requests.filter((request) => channelOf(request) === channel);
  const lastMessage = (request: LLMRequest | undefined) => request?.messages.at(-1)?.content ?? '';

  /** The scripted design, its architectures changed by `edit`. */
  function design(edit: (architectures: Array<Record<string, unknown>>) => unknown[]) {
    const reply = JSON.parse((REPLIES.design as { content: string }).content);
    return json({ ...reply, architectures: edit(reply.architectures) });
  }

  describe('capabilities, not only improvements', () => {
    it('rejects a design that offers only improvements, and redoes it once', async () => {
      const provider = new ScriptedLLMProvider();
      const improvementsOnly = design((architectures) =>
        architectures.map((architecture) => ({ ...architecture, kind: 'improvement' }))
      );
      provider.enqueue('study:design', improvementsOnly, REPLIES.design);
      const { study } = setup({}, provider);

      const result = await study.run();

      const attempts = requestsOf(provider, 'study:design');
      expect(attempts).toHaveLength(2);
      expect(lastMessage(attempts[1])).toContain(
        '- "The design as a whole": It offers no new capability, only improvements (faster or cheaper)'
      );
      expect(result.report.driftLog).toContainEqual(
        expect.objectContaining({
          passage: 'design',
          collection: 'architectures',
          by: 'guardian',
          attempt: 1,
          reason: expect.stringContaining('It offers no new capability'),
        })
      );
      expect(result.report.architectures.map((architecture) => architecture.kind)).toEqual([
        'capability',
        'improvement',
      ]);
      expect(result.report.stats.redos).toBe(1);
      expect(result.report.notices.map((notice) => notice.code)).not.toContain('noCapability');
    });

    it('lowers to an improvement a capability the guardian judges only faster, and says when none is left', async () => {
      const provider = new ScriptedLLMProvider();
      const fasterOnly = design((architectures) =>
        architectures.map((architecture) => ({
          ...architecture,
          statement: `${architecture.statement} ${FASTER_ONLY}`,
        }))
      );
      // The redo is no better: no third attempt.
      provider.enqueue('study:design', fasterOnly, fasterOnly);
      const { study } = setup({}, provider);

      const result = await study.run();

      expect(result.status).toBe('completed');
      expect(requestsOf(provider, 'study:design')).toHaveLength(2);
      // The guardian was asked, and saw each architecture's aim.
      const check = lastMessage(requestsOf(provider, 'study-check:design')[0]);
      expect(check).toContain('say also with "newCapability"');
      expect(check).toContain(
        '"kind":"capability","capability":{"what":"Pages whose rendering results are reused across tabs and devices"'
      );
      const [shared] = result.report.architectures.filter(
        (architecture) => architecture.name === 'Shared results'
      );
      expect(shared).toMatchObject({ kind: 'improvement', declaredKind: 'capability' });
      expect(result.report.notices).toContainEqual(
        expect.objectContaining({ code: 'noCapability' })
      );
      expect(result.markdown).toContain(
        '- _declared new capability: the guardian judged it only faster or cheaper_'
      );
      expect(result.markdown).toContain(
        '> - No architecture aims at a new capability: the design offers only improvements.'
      );
    });

    it('ranks improvements after capabilities', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study:design',
        design((architectures) => [...architectures].reverse())
      );
      const { study } = setup({}, provider);

      const { report, markdown } = await study.run();

      expect(report.architectures.map((architecture) => [architecture.id, architecture.kind])).toEqual([
        ['A2', 'capability'],
        ['A1', 'improvement'],
      ]);
      expect(markdown.indexOf('### A2. Shared results')).toBeLessThan(
        markdown.indexOf('### A1. Reused engine')
      );
      expect(markdown).toContain('### A1. Reused engine _(hypothesis)_ — **improvement: faster or cheaper**');
      expect(markdown).toContain('- **What improves**: A working browser sooner');
    });

    it('requires the principle and the assembly of a capability', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study:design',
        design((architectures) => [
          ...architectures,
          { ...architectures[0], name: 'Unexplained', principleChange: undefined, assembly: [] },
        ])
      );
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(report.architectures.map((architecture) => architecture.name)).not.toContain(
        'Unexplained'
      );
      expect(report.driftLog).toContainEqual(
        expect.objectContaining({
          by: 'schema',
          reason: 'principleChange: a capability states the principle it changes',
        })
      );
    });

    it('asks for candidate capabilities when the charter names none', async () => {
      const provider = new ScriptedLLMProvider();
      const { capabilities: _capabilities, ...withoutCandidates } = JSON.parse(
        (REPLIES.cross as { content: string }).content
      );
      provider.enqueue('study:cross', json(withoutCandidates));
      provider.enqueue('study:cross:repair', REPLIES.cross);
      const { study } = setup({}, provider);

      const { report } = await study.run();

      expect(lastMessage(requestsOf(provider, 'study:cross:repair')[0])).toContain(
        '"capabilities" needs at least 1 valid item(s), got 0'
      );
      expect(report.capabilities.map((candidate) => candidate.capability)).toEqual([
        'Reuse rendering results across devices and users',
      ]);
      expect(lastMessage(requestsOf(provider, 'study:design')[0])).toContain(
        '"capabilities":[{"capability":"Reuse rendering results across devices and users"'
      );
    });

    it('aims at the capability the charter names, in its question and every prompt', async () => {
      const provider = new ScriptedLLMProvider();
      const { capabilities: _capabilities, ...withoutCandidates } = JSON.parse(
        (REPLIES.cross as { content: string }).content
      );
      provider.enqueue('study:cross', json(withoutCandidates));
      const capability = 'Pages that keep working offline, shared between devices';
      const { study } = setup({ capability }, provider);

      const { report } = await study.run();

      expect(study.charter.capability).toBe(capability);
      expect(study.charter.question).toBe(
        `If we had to meet today’s needs with the knowledge and techniques available today, how would we organise this object? Which change of principle would make this possible, difficult today: ${capability}?`
      );
      // Named, no candidate is required.
      expect(provider.channels()).not.toContain('study:cross:repair');
      expect(report.capabilities).toEqual([]);
      for (const request of provider.requests) {
        expect(request.messages[0]?.content).toContain(`New capability aimed at: ${capability}`);
      }
    });
  });

  describe('novelty lies in the assembly', () => {
    const novelAssembly = () =>
      design((architectures) => [
        {
          ...architectures[0],
          status: 'novelty',
          components: [
            {
              name: 'Immutable fragments',
              statement: 'Layout produces immutable fragments',
              status: 'established',
              sources: ['S2'],
            },
            {
              name: 'Content addressing',
              statement: 'A hash names a content',
              status: 'novelty',
            },
          ],
        },
        architectures[1],
      ]);

    it('keeps the components established while the assembly stays a novelty to verify', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue('study:design', novelAssembly());
      // A prior-art search runs for another claim, not for the combination.
      provider.enqueue(
        'study-prior-art-queries:design',
        json({
          queries: [
            {
              claim: 'N1',
              source: 'search_web',
              query: 'fragments as common currency',
              servesObjective: 'Checks the idea',
            },
          ],
        })
      );
      const { study } = setup({}, provider);

      const { report, markdown } = await study.run();

      const [shared] = report.architectures;
      expect(shared?.components).toEqual([
        {
          name: 'Immutable fragments',
          statement: 'Layout produces immutable fragments',
          status: 'established',
          sources: ['S2'],
        },
        {
          name: 'Content addressing',
          statement: 'A hash names a content',
          status: 'hypothesis',
          declaredStatus: 'novelty',
          sources: [],
          statusReason:
            'Presented as new without a retrieved source: a component is a prior technique, and this one stays a hypothesis.',
        },
      ]);
      expect(shared).toMatchObject({
        status: 'novelty',
        toVerify: true,
        statusReason: 'Novelty to verify: no prior-art search was run for it.',
      });
      // The prior-art search was offered the assembly as a combination.
      expect(lastMessage(requestsOf(provider, 'study-prior-art-queries:design')[0])).toContain(
        '"combination":"Immutable fragments + Content addressing","capability":"Pages whose rendering results are reused across tabs and devices"'
      );
      expect(markdown).toContain(
        '  - Immutable fragments + Content addressing → assembly _(novelty to verify)_ → Pages whose rendering results are reused across tabs and devices'
      );
      expect(markdown).toContain(
        '  - **Immutable fragments** — Layout produces immutable fragments _(established · S2)_'
      );
    });

    it('checks the prior art of an assembly as a combination', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue('study:design', novelAssembly());
      const { study, searches } = setup({}, provider);

      const { report } = await study.run();

      const check = lastMessage(requestsOf(provider, 'study-prior-art-check:design')[0]);
      expect(check).toContain('An assembly already exists only when some work combines the same components');
      expect(searches.queries).toContain(
        'prior art of One explicit representation of rendering results'
      );
      expect(report.architectures[0]).toMatchObject({
        status: 'novelty',
        priorArt: { verdict: 'partlyNovel' },
      });
      expect(report.architectures[0]?.toVerify).toBeUndefined();
    });
  });

  describe('breakthroughs by assembly', () => {
    it('reports the analogues with their statuses, and gives their patterns to the design', async () => {
      const provider = new ScriptedLLMProvider();
      provider.enqueue(
        'study-queries:changes',
        json({
          queries: [
            { source: 'search_web', query: 'LayoutNG', servesObjective: 'Layout' },
            { source: 'search_web', query: 'Bitcoin components', servesObjective: 'Analogue' },
          ],
        })
      );
      const changes = JSON.parse((REPLIES.changes as { content: string }).content);
      const bitcoin = changes.analogues[0];
      provider.enqueue(
        'study:changes',
        json({
          ...changes,
          analogues: [
            { ...bitcoin, status: 'established', sources: ['S3'] },
            item('The printing press assembled the screw press, movable type and oil ink', {
              breakthrough: 'Printing press',
              date: '1450',
              components: [
                { name: 'Screw press' },
                { name: 'Movable type' },
                { name: 'Oil-based ink' },
              ],
              liftedConstraint: 'Copies were written by hand',
              capability: 'Books in thousands of identical copies',
              pattern: 'Mechanise a skilled step with parts already in use',
              status: 'established',
              sources: ['S42'],
            }),
          ],
        })
      );
      const { study } = setup({ analogues: ['Bitcoin'] }, provider);

      const { report, markdown } = await study.run();

      expect(report.analogues.map((analogue) => [analogue.id, analogue.breakthrough, analogue.status])).toEqual([
        ['B1', 'Bitcoin', 'established'],
        ['B2', 'Printing press', 'hypothesis'],
      ]);
      expect(report.analogues[0]).toMatchObject({
        sources: ['S3'],
        components: expect.arrayContaining([{ name: 'Hashcash proof of work', date: '1997' }]),
        liftedConstraint: 'A shared ledger needed a trusted third party',
        capability: 'A shared ledger without a trusted third party',
      });
      expect(report.analogues[1]).toMatchObject({
        declaredStatus: 'established',
        unretrievedSources: ['S42'],
      });
      expect(report.undeconstructedAnalogues).toEqual([]);
      expect(lastMessage(requestsOf(provider, 'study:design')[0])).toContain(
        '"pattern":"Replace a trusted party by verifiable work and signatures replicated by peers"'
      );
      expect(markdown).toContain('## Breakthroughs by assembly');
      expect(markdown).toContain(
        '- **Bitcoin (2008)** — Bitcoin assembled prior techniques into a ledger without a trusted third party _(established · S3)_'
      );
      expect(markdown).toContain(
        '  - **Components**: Public-key signatures (1976); Hash chains and timestamping (1991); Hashcash proof of work (1997); Merkle trees (1979); Peer-to-peer networks (1999)'
      );
      expect(markdown).toContain('- **Breakthroughs to deconstruct**: Bitcoin');
    });

    it('asks to deconstruct every breakthrough the charter names, and says which ones were not', async () => {
      const provider = new ScriptedLLMProvider();
      // The repair still leaves Linux out.
      provider.enqueue('study:changes:repair', REPLIES.changes);
      const { study } = setup({ analogues: ['Bitcoin', 'Linux'] }, provider);

      const { report, status } = await study.run();

      expect(status).toBe('completed');
      expect(lastMessage(requestsOf(provider, 'study:changes:repair')[0])).toContain(
        '"analogues" must deconstruct every breakthrough the charter names; missing: Linux'
      );
      expect(report.undeconstructedAnalogues).toEqual(['Linux']);
      expect(report.notices).toContainEqual(
        expect.objectContaining({ code: 'analoguesNotDeconstructed', details: ['Linux'] })
      );
      expect(study.charter.analogues).toEqual(['Bitcoin', 'Linux']);
      expect(Object.isFrozen(study.charter.analogues)).toBe(true);
    });
  });
});
