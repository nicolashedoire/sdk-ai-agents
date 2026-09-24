# Why this SDK

**In one sentence:** most agent frameworks help a language model **act**; this SDK makes it **justify what it believes** before it concludes, and can make it **reason the way a given person does**.

This page is honest on purpose: it says what the SDK does that you will not easily find elsewhere, what other frameworks also do, and what they do better. The comparison reflects the main frameworks as of mid-2026 (LangChain and LangGraph, the OpenAI Agents SDK, the Vercel AI SDK, CrewAI, AutoGen, Mastra, DSPy); they evolve quickly, so check their current documentation before deciding.

## What it does differently

### 1. Reasoning rules written in code, not in the prompt

In a usual agent, the "reasoning" is whatever the model writes: if it says it is 90% sure, you take its word for it. Here:

- the [mental state](./cognitive-agents#the-mental-state) (facts, hypotheses, predictions, contradictions) is typed data, not free text;
- the model cannot set its own confidence: it comes from the evidence support of the chosen option;
- a rejected hypothesis cannot come back; it can only be revised into a variant that says what changed;
- an answer is **committed** only when it passes the [conclusion guard](./evidence-and-verification#the-conclusion-guard): critiqued, assessed since the last new evidence, no contradiction concerning it, predictions tested while the budget allows, enough support. Otherwise the agent says **provisional**, with what is missing, or **abstains**.

"I cannot conclude" is a first-class outcome, enforced by code rather than requested in a prompt.

### 2. The world checks the predictions, not the model

A common pattern is to have one model judge another. Here, the agent states **before** the test what it should observe and what would prove it wrong, and **your code** decides: a measurement, a simulator, a test suite, a query. A refuted rule becomes a variant that states its difference. See [Predictions and the outcome evaluator](./evidence-and-verification#predictions-and-the-outcome-evaluator).

### 3. Evidence and preferences are kept apart

What the thinker prefers can change **which action is chosen**; it never makes a **claim about the world** more credible. With Jev, the evidence question is even sent without the thinker's profile. See [Evidence is not preference](./evidence-and-verification#evidence-is-not-preference).

### 4. Reasoning like a given person, and measuring it

Memory products store facts and preferences about a user; prompt optimizers such as DSPy tune prompts and examples against a metric. This SDK extracts **how** a person reasons: the order in which they examine a problem, their reflexes, what makes them reject an idea. It versions that [thinker profile](./thinker-profiles), writes it into every reasoning step, learns from the person's corrections with a percentage of agreement, and exports their choices as a dataset to train a small model on their way of choosing the next step.

### 5. Calibrated decisions inside the reasoning

[Jev](./typed-decisions) answers narrow questions with calibrated probabilities. It picks the next reasoning step and scores the hypotheses for a fraction of a cent, and a deterministic controller takes over when it is unsure.

### 6. One log for reasoning and actions

Governed tools, approvals, costs, retries and MCP calls are recorded in the same event log as every thought. You can rebuild exactly what the agent "had in mind" behind any answer, months later, and replay its actions without calling the model.

## What other frameworks also do

- **Governed tools and human approval.** Guardrails in the OpenAI Agents SDK, human-in-the-loop in LangGraph.
- **Persistence and replay.** LangGraph checkpoints let you resume and inspect past states.
- **MCP**, cost tracking and retries are widely available.

The difference here is that these pieces share one event log with an explicit reasoning state.

## What other frameworks do better

- **Ecosystem.** Hundreds of integrations, large communities, examples for everything.
- **Maturity.** This SDK is young, has a single maintainer, is not published on npm yet, and has been tried on a limited number of real problems.
- **Multi-agent orchestration, streaming and UI kits** are richer elsewhere.
- **Cost and latency.** A cognitive answer takes about ten reasoning steps (with gpt-4o, a few minutes and around 0.1 USD per problem in our trials), where a classic agent makes one call.
- **Model dependence.** The rules hold whatever the model, but the quality of the reasoning does not: small models follow the method poorly, and even strong ones often end provisional or abstain on hard problems.
- **Memory across runs.** A rule verified in one run is not reused by the next one yet.

## When to choose it

- **Decisions you must justify or audit**: health, finance, legal, industry, research, internal governance.
- **When "I don't know" is better than a confident invention**, and you want that enforced.
- **When a claim can be checked**: you have a measurement, a simulator or a test suite the agent can confront its predictions with.
- **A reasoning twin**: capturing how an expert or a founder approaches problems, and measuring how close the imitation gets.

When you need a quick chatbot, a large catalogue of ready-made integrations or a single fast call, a lighter framework is a better fit.
