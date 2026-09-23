---
layout: home

hero:
  name: SDK AI Agents
  text: Governed agents that think before they act
  tagline: Explicit reasoning with a mental state you can inspect, typed decisions with Jev, MCP connectors — on top of event sourcing, replay, costs, retries and incident alerts.
  image:
    src: /images/reasoning-loop.svg
    alt: The cognitive loop around an explicit mental state
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: How agents think
      link: /guide/cognitive-agents
    - theme: alt
      text: View on GitHub
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: Reasoning, not just prompting
    details: Represent, compare observations, hypothesize, simulate, test, revise, critique, seek information, compare, decide. Each step is an operation on an explicit mental state, chosen by a controller and recorded as an event.
    link: /guide/cognitive-agents
    linkText: The cognitive loop
  - icon: 🔬
    title: Believes what it can justify
    details: Observations keep their provenance, rules come with falsifiable predictions, your own evaluator tests them, refuted rules are revised — and an answer is committed only when the evidence holds.
    link: /guide/evidence-and-verification
    linkText: Evidence & verification
  - icon: 🪞
    title: Thinks the way you do
    details: Explain a few topics in your own words, distill your reasoning into a profile, then correct the agent run after run. Lessons are kept and applied.
    link: /guide/thinker-profiles
    linkText: Thinker profiles
  - icon: 🎯
    title: Typed decisions with Jev
    details: Inject any context, ask yes/no, single or multiple choice and rating questions, and get calibrated probabilities your code can act on.
    link: /guide/typed-decisions
    linkText: Decide with confidence
  - icon: 🔌
    title: MCP in both directions
    details: Expose your governed tools to Claude Desktop, IDEs and other agents, and import any MCP server as tools your agents can use.
    link: /guide/mcp
    linkText: Connect your systems
  - icon: 🛡️
    title: Governance by design
    details: The model proposes, the engine disposes. Policies, allowlists, budgets and human approvals are checked before every action.
    link: /guide/governed-agents
    linkText: Governed agents
  - icon: 🎞️
    title: Everything is an event
    details: Replay runs without calling the LLM, rebuild the mental state of any run, compare runs and turn them into golden tests.
    link: /guide/observability
    linkText: Traceability & replay
  - icon: 💸
    title: Costs you can see
    details: Token usage of every LLM call and typed decision is recorded and priced per run and per model.
    link: /guide/costs
    linkText: API costs
  - icon: 🔁
    title: Retries that do not stack
    details: One retry policy per provider before failover, retries for idempotent tools, and every retry written to the trace.
    link: /guide/resilience
    linkText: Retries & fallback
  - icon: 🚨
    title: Incidents that reach you
    details: Failed runs, blocked actions and provider failovers become incidents with their timeline, sent by email or webhook.
    link: /guide/incidents
    linkText: Incident alerts
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## From a prompt to a decision you can audit

A classic LLM call goes straight from question to answer. A cognitive agent builds an explicit picture of the problem, explores several options, stresses them, checks facts with governed tools and only then commits — and you can read every step afterwards.

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![A mental state rebuilt from the event log](/images/mental-state.svg){.illustration}

## One SDK, every layer

![Architecture of the SDK](/images/architecture.svg){.illustration}

| You need | A raw LLM API | SDK AI Agents |
| --- | --- | --- |
| Reason before answering | One-shot generation | Hypotheses, simulation and critique on an explicit state |
| Reason like a given person | A long system prompt | A versioned thinker profile, refined by feedback |
| Fast, calibrated decisions | Parse free text | Typed answers with probabilities and confidence (Jev) |
| Connect company tools | Custom glue per tool | MCP server and client, governed by policies |
| Know what happened | Logs, if any | Event log, replay, mental state rebuild |
| Control risk and spend | Hope | Policies, approvals, budgets, per-run costs, incident alerts |

</div>
