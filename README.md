<p align="center">
  <img src="docs/public/images/banner.svg" alt="SDK AI Agents — governed agents that think before they act" width="100%" />
</p>

<p align="center">
  <a href="https://nicolashedoire.github.io/sdk-ai-agents/"><strong>Documentation</strong></a> ·
  <a href="https://nicolashedoire.github.io/sdk-ai-agents/guide/getting-started">Getting started</a> ·
  <a href="https://nicolashedoire.github.io/sdk-ai-agents/guide/cognitive-agents">How agents think</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" />
  <img alt="MCP" src="https://img.shields.io/badge/MCP-server%20%2B%20client-7C3AED" />
  <img alt="Jev" src="https://img.shields.io/badge/Jev-typed%20decisions-4F46E5" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-0D9488" />
</p>

**SDK AI Agents** is a TypeScript SDK for AI agents you can trust in production. Agents **reason explicitly** on a mental state you can inspect, can be **taught how you think**, decide with **calibrated typed answers** (TypeSafe Jev), **connect to your systems over MCP** — and every step is governed, traced, priced and replayable.

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, state, runId } = await analyst.think({ problem: 'Should we build or buy our analytics module?' });

console.log(answer);                        // the decision, with its rationale and next actions
console.log(state.hypotheses);              // every option considered, simulated and critiqued
console.log(await sdk.getRunCost(runId));   // what it cost, per model
```

## Agents that think before they act

<img src="docs/public/images/reasoning-loop.svg" alt="The cognitive loop" align="right" width="340" />

A classic LLM call goes straight from question to answer. A **cognitive agent** keeps an explicit **mental state** — facts, assumptions, constraints, unknowns, hypotheses, contradictions, confidence — and improves it one operation at a time:

1. **Represent** the problem
2. **Hypothesize** several answers
3. **Simulate** their consequences
4. **Critique** each one
5. **Seek information** with governed tools
6. **Compare** what survives
7. **Decide**, with a rationale and next actions

A **controller** picks the next operation — a deterministic heuristic, or **Jev** with calibrated confidence and automatic fallback. Invariants live in code: a rejected hypothesis cannot be selected, a fatal critique rejects its hypothesis, an agent only runs the tools it was given, the last step is always a decision. Every thought is an event, so any run's mental state can be **rebuilt, audited and replayed**.

<br clear="right" />

<p align="center"><img src="docs/public/images/mental-state.svg" alt="A mental state rebuilt from events" width="720" /></p>

## Teach it how you think

<p align="center"><img src="docs/public/images/learning-loop.svg" alt="Profile learning loop" width="100%" /></p>

Explain a few topics in your own words, **distill** your reasoning into a thinker profile (order of attention, priorities, heuristics, rejection criteria), then **correct** the agent after each run. Matches become calibration examples, mismatches become lessons with the highest priority. Export the runs as a dataset to train your own controller.

```ts
const profile = await sdk.distillThinkerProfile({ id: 'me', name: 'Me', model: 'gpt-4o', samples });
const me = sdk.createCognitiveAgent({ name: 'me', model: 'gpt-4o', profile });

const run = await me.think({ problem: 'Should we pay for Jev or use an open clone?' });
await me.learnFromFeedback(run.runId, {
  verdict: 'mismatch',
  expected: 'Prototype with the free clone first',
  lesson: 'Always test the free option on real data before paying',
});
```

## Typed decisions with Jev

<p align="center"><img src="docs/public/images/typed-decisions.svg" alt="Typed decisions" width="100%" /></p>

Inject any context and get structured, calibrated answers your code can act on — single choice, **multiple choice**, yes/no and ratings, many questions in one request:

```ts
const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle this ticket?',
  options: { billing: 'Payments, refunds', technical: 'Bugs, outages', sales: 'Pricing' },
});
if (!route.confident) escalateToHuman(ticket);

const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export'],
});
```

Works with TypeSafe's API or any compatible self-hosted clone (`jev.baseUrl`).

## MCP connectors, both ways

<p align="center"><img src="docs/public/images/mcp-bridge.svg" alt="MCP in both directions" width="100%" /></p>

```ts
import { connectMcpServer, serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// Expose governed tools to Claude Desktop, IDEs and other agents
await serveMcpOverStdio(sdk, { name: 'acme-crm', tools: ['lookup_customer'] });

// Import the tools of any MCP server — governed like local tools
const crm = await connectMcpServer({ name: 'crm', transport: { type: 'http', url }, toolPrefix: 'crm_' });
const tools = crm.tools.map((tool) => sdk.defineTool(tool));
```

## Built for operations

<p align="center"><img src="docs/public/images/incident-flow.svg" alt="Incident flow" width="100%" /></p>

| | |
| --- | --- |
| **Governance** | The LLM only proposes. Policies, allowlists, budgets and human approvals are checked before every action. |
| **Traceability** | Append-only event log (file, SQLite, PostgreSQL), replay without the LLM, reasoning graphs, golden traces, regression detection. |
| **API costs** | Token usage of every LLM call and typed decision, priced per run and per model. |
| **Retries** | One policy per provider before failover, vendor retries disabled so they never stack, retries for idempotent tools, all traced. |
| **Incidents** | Failed runs, blocked actions and failovers become incidents with their timeline, sent by email (Resend, SMTP…) or webhook (Slack…). |

## Architecture

<p align="center"><img src="docs/public/images/architecture.svg" alt="Architecture" width="100%" /></p>

## Install

Not on npm yet — install from GitHub (the package builds itself on install):

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25
npm install @modelcontextprotocol/sdk   # only for MCP connectors
```

Node.js 20+, TypeScript 5+ and zod 3 (≥ 3.25; zod 4 is not supported yet).

## Documentation

| | |
| --- | --- |
| [Introduction](https://nicolashedoire.github.io/sdk-ai-agents/guide/introduction) | Why and what |
| [Getting started](https://nicolashedoire.github.io/sdk-ai-agents/guide/getting-started) | First agent in five minutes |
| [Cognitive agents](https://nicolashedoire.github.io/sdk-ai-agents/guide/cognitive-agents) | Mental state, operations, controllers |
| [Thinker profiles](https://nicolashedoire.github.io/sdk-ai-agents/guide/thinker-profiles) | Distill, correct, export a dataset |
| [Typed decisions](https://nicolashedoire.github.io/sdk-ai-agents/guide/typed-decisions) | Jev, context injection, choices |
| [MCP connectors](https://nicolashedoire.github.io/sdk-ai-agents/guide/mcp) | Expose and import tools |
| [Operations](https://nicolashedoire.github.io/sdk-ai-agents/guide/costs) | Costs, retries, incidents |
| [SDK API](https://nicolashedoire.github.io/sdk-ai-agents/reference/sdk-api) · [Events](https://nicolashedoire.github.io/sdk-ai-agents/reference/events) | Reference |

The same pages live in [`docs/`](docs) — run `npm run docs:dev` for a local preview.

## Development

```sh
npm install
npm run build          # TypeScript → dist/
npx vitest run         # tests
npm run docs:dev       # documentation site
```

Tests of the new modules use no module mocks: ports are implemented in memory (scripted LLM provider, in-memory decision client), HTTP adapters run against local servers, and MCP runs over the official in-memory transport.

## License

MIT
