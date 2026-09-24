# Why this SDK

**In one sentence:** most agent frameworks help a language model **act**; this SDK makes it **justify what it believes** before it concludes, and can make it **reason the way a given person does**.

This page is honest on purpose: it says what the SDK does that you will not easily find elsewhere, what other frameworks also do, and what they do better. The comparison is based on the documentation of widely used frameworks as of mid-2026 (LangChain and LangGraph, the OpenAI Agents SDK, the Vercel AI SDK, CrewAI, AutoGen and its successor Microsoft Agent Framework, Mastra, DSPy); they evolve quickly, so check their current documentation before deciding.

## What it does differently

### 1. Reasoning rules written in code, not in the prompt

In a usual agent, the "reasoning" is whatever the model writes: if it says it is 90% sure, nothing checks it unless you write that check. Here:

- the [mental state](./cognitive-agents#the-mental-state) (facts, hypotheses, predictions, contradictions) is typed data, not free text;
- the model cannot raise its own confidence: a decision's confidence is capped at the evidence support of the chosen option, judged in a separate comparison step (by Jev without the thinker's profile, or by the language model under instructions);
- a rejected hypothesis cannot be selected, updated or restated; it comes back only as a variant that says what changed (a reworded restatement is not detected);
- an answer is **committed** only when it passes the [conclusion guard](./evidence-and-verification#the-conclusion-guard): critiqued, assessed since the last new evidence, no contradiction concerning it, predictions tested while the budget allows, enough support. Otherwise the agent says **provisional**, with what is missing, or **abstains**.

"I cannot conclude" is a first-class outcome, enforced by code rather than requested in a prompt.

### 2. The world checks the predictions, not the model

A common pattern is to have one model judge another. Here, the agent states **before** the test what it should observe and what would prove it wrong, and **your code** decides: a measurement, a simulator, a test suite, a query. A refuted rule is rejected, and can only come back as a variant that states its difference. See [Predictions and the outcome evaluator](./evidence-and-verification#predictions-and-the-outcome-evaluator).

What the tests answered is kept for later runs of the same scope: the next run starts with the rules that held and cannot restate, as it was, one that failed. Memory products remember what was said; this [memory across runs](./memory) keeps only what a test answered.

### 3. Evidence and preferences are kept apart

What the thinker prefers can change **which action is chosen**, and let an action they clearly prefer be committed on plausible evidence; in the code, it never makes a **claim about the world** more credible. With Jev, the evidence question is even sent without the thinker's profile; with a language-model judge, that separation rests on its instructions. See [Evidence is not preference](./evidence-and-verification#evidence-is-not-preference).

### 4. Reasoning like a given person, and measuring it

Memory products mostly store facts and preferences about a user (some also rewrite instructions from feedback); prompt optimizers such as DSPy tune prompts and examples against a metric. This SDK extracts **how** a person reasons: the order in which they examine a problem, their reflexes, what makes them reject an idea. It versions that [thinker profile](./thinker-profiles), writes it into every reasoning step, adds the person's corrections, with a percentage of agreement, to its instructions, and exports the agent's choices of next step, labelled with the person's verdict on each run, as a dataset to train a small controller.

### 5. Calibrated decisions inside the reasoning

[Jev](./typed-decisions) answers narrow questions with probabilities its vendor calibrates. It picks the next reasoning step and scores the hypotheses for a fraction of a cent, and a deterministic controller takes over when it is unsure.

### 6. One log for reasoning and actions

Governed tools, approvals, costs, retries and MCP calls are recorded in the same event log as every thought. You can rebuild exactly what the agent "had in mind" behind any answer, months later, and replay its actions without calling the model.

## What other frameworks also do

- **Governed tools and human approval.** Guardrails in the OpenAI Agents SDK, human-in-the-loop in LangGraph.
- **Persistence and replay.** LangGraph checkpoints let you resume, inspect, and replay or fork from past states.
- **MCP**, cost tracking and retries are widely available.

The difference here is that these pieces share one event log with an explicit reasoning state.

## What other frameworks do better

- **Ecosystem.** Hundreds of integrations, large communities, examples for everything.
- **Maturity.** This SDK is young, has a single maintainer, is not published on npm yet, and has been tried on a limited number of real problems.
- **Multi-agent orchestration, streaming and UI kits** are richer elsewhere.
- **Cost and latency.** A cognitive answer takes about ten reasoning steps, each with one or two model requests (with gpt-4o and Jev, a few minutes and around 0.1 USD per problem in our trials), where a direct answer takes a single call and a tool-using agent a few.
- **Model dependence.** The rules hold whatever the model, but the quality of the reasoning does not: small models follow the method poorly, and even strong ones often end provisional or abstain on hard problems.
- **Memory and retrieval.** Memory products and retrieval pipelines offer semantic search over large collections; [memory across runs](./memory) here recalls tested rules by word matching within a narrow scope.

## When to choose it

- **Decisions you must justify or audit**: research, industry, internal governance, and decision support in regulated fields (health, finance, legal) where a person reviews the conclusion and its basis.
- **When "I don't know" is better than a confident invention**, and you want that enforced.
- **When a claim can be checked**: you have a measurement, a simulator or a test suite the agent can confront its predictions with.
- **A reasoning twin**: capturing how an expert or a founder approaches problems, and measuring how close the imitation gets.

When you need a quick chatbot, a large catalogue of ready-made integrations or a single fast call, a lighter framework is a better fit.
