# Thinker profiles

A thinker profile describes **how** someone reasons — not what they like. It is rendered into every prompt of a cognitive agent, so the agent follows the same order of attention, weighs the same priorities and rejects what that person would reject.

![Teach it how you think](/images/learning-loop.svg){.illustration}

## Anatomy of a profile

```ts
import { defineThinkerProfile } from '@sdk-ai-agents/core';

const builder = defineThinkerProfile({
  id: 'builder',
  name: 'Pragmatic builder',
  summary: 'Looks for what a technology really enables, then its limits, then a prototype.',
  reasoningSequence: [
    { id: 'real-capability', instruction: 'Establish what the technology really enables' },
    { id: 'limits', instruction: 'Look for its limits immediately' },
    { id: 'workaround', instruction: 'Imagine how to work around those limits' },
    { id: 'product', instruction: 'Check whether it can become a product' },
    { id: 'automation', instruction: 'Ask how the product could run itself' },
    { id: 'generalize', instruction: 'Extrapolate towards a more general architecture' },
    { id: 'prototype', instruction: 'Design the smallest prototype that tests it' },
  ],
  priorities: ['Real capability over hype', 'Free and open options first', 'Fast feedback'],
  heuristics: [{ when: 'a service is paid and closed', action: 'look for an open alternative before paying' }],
  rejectionCriteria: ['Cannot be tested with a prototype', 'Locks data in a vendor'],
  riskAppetite: 'high',
});

const agent = sdk.createCognitiveAgent({ name: 'me', model: 'gpt-4o', profile: builder });
```

| Field | Role in prompts |
| --- | --- |
| `reasoningSequence` | "Order of attention — follow it" |
| `priorities` | Ranked, most important first |
| `heuristics` | "When …, then …" rules |
| `rejectionCriteria` | Used by `critique` and `compare` |
| `riskAppetite` | `low`, `medium` or `high` |
| `examples` | Runs the person validated — calibration |
| `corrections` | Lessons from runs they disagreed with — **highest priority**, rendered last |

Without a profile, agents use `DEFAULT_THINKER_PROFILE`, a neutral, evidence-first analyst.

## Distill a profile from your own words

You do not have to write a profile by hand. Explain a few topics the way they come to you — messy is fine — and let the SDK extract the recurring operations of your reasoning:

```ts
const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    {
      topic: 'Typed decision APIs like Jev',
      reasoning:
        'What does it really allow? Then the limits: closed, US-only, paid. Is there an open clone? ' +
        'Could it become the controller of my agents? I would benchmark it on my own traces first.',
      conclusion: 'Use an open clone as the controller and benchmark it against Jev',
    },
    { topic: 'World models', reasoning: 'Structure beats scale. Test on a small chaotic system before anything big.' },
  ],
});
```

The distiller keeps only patterns supported by the samples, and samples with a conclusion become calibration `examples`. The result is validated by the same Zod schema as hand-written profiles.

## Correct it, run after run

After a run, tell the agent whether it reasoned the way you would have:

```ts
const run = await agent.think({ problem: 'Should we pay for Jev or use an open clone?' });

// "Yes, exactly what I would have thought."
await agent.learnFromFeedback(run.runId, { verdict: 'match' });

// "No — I would have gone another way."
await agent.learnFromFeedback(run.runId, {
  verdict: 'mismatch',
  expected: 'Prototype with the free clone first, then compare with Jev on 100 real tickets',
  lesson: 'Always test the free option on real data before paying',
});

// "You are 50% right — here is where you went wrong."
await agent.learnFromFeedback(run.runId, {
  verdict: 'partial',
  agreement: 0.5,
  wrongAbout: ['ignored the free option', 'overestimated the integration cost'],
  expected: 'Benchmark the open clone on our own tickets before deciding',
});
```

| Verdict | Effect |
| --- | --- |
| `match` | The run becomes a calibration example (the 10 most recent are kept) |
| `partial` / `mismatch` | A correction with the expected direction and the lesson (the 20 most recent are kept) |

`agreement` (0 to 1 — `0.8` means "80% right") is optional on every verdict, `wrongAbout` (where the reasoning went wrong, in your words) on `partial` and `mismatch`. Both are recorded in the `cognition.feedback` event; corrections keep them and show them to the model in the next prompts, and `agreement` is exported with the controller dataset. This is the loop of predicting what you would say, getting a percentage and the points to fix, and trying again.

::: warning Fidelity is not truth
Feedback measures whether the agent reasoned **like you**, not whether it was **right**. To check a claim against the world, give the agent an [outcome evaluator](./evidence-and-verification#predictions-and-the-outcome-evaluator).
:::

Every refinement bumps the profile's patch version (`1.0.0` → `1.0.1`). Events carry `profileId` and `profileVersion`, so you always know which version of "you" produced a run. The feedback itself is appended to the run as a `cognition.feedback` event.

Profiles are plain JSON: persist them wherever you like and reload them with `agent.setProfile(profile)` or the `profile` option.

## Train your own controller

Every choice of operation is recorded with the state the controller saw. Export them as JSON Lines:

```ts
const jsonl = await sdk.exportControllerDataset(); // or pass runIds
```

```json
{"runId":"run_…","step":3,"state":{…},"available":["hypothesize","simulate","critique","decide"],"operation":"simulate","controller":"jev","confidence":0.82,"usedFallback":false,"runStatus":"completed","feedback":"partial","agreement":0.5}
```

Filter on `feedback: "match"` and you have supervised examples of *your* way of choosing the next move — enough to fine-tune a small open model and plug it in as a custom `CognitiveController`, free of per-call costs.
