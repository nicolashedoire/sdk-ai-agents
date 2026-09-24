# Key terms in plain words

Every term used in this documentation, explained without jargon, with a link to the page that details it. Terms are grouped by theme; use the search box (<kbd>/</kbd>) to jump to one.

## The basics

| Term | In plain words |
| --- | --- |
| **SDK** | A toolbox for developers: code you add to your own application instead of writing everything yourself. This one is written in TypeScript; it is not on npm yet and is installed from GitHub (see [Getting started](./getting-started)). |
| **Language model (LLM)** | The AI that reads and writes text (GPT-4o, Claude…). Here it is one component among others: it proposes, the SDK checks and decides what is allowed. |
| **Prompt** | The text instructions sent to a language model with each request. |
| **Token** | A piece of a word. Model providers bill per token read and written, which is why [costs](./costs) are counted in tokens. |
| **Agent** | A program that uses a language model to reach a goal, step by step. The SDK has two kinds: [governed agents](./governed-agents) that act with tools, and [cognitive agents](./cognitive-agents) that reason before concluding. |
| **Run** | One execution of an agent on one problem, from start to finish. It has an id (`runId`) you use to read, replay or price it. |
| **Tool** | A function your code gives an agent (read a database, send an email…). The agent can only use the tools it was explicitly given. See [Core concepts](./concepts#_2-tool). |
| **Capability** | A named group of tools you can give to several agents at once. |
| **Policy** | A rule checked **before** every action: a budget, a timeout, a list of allowed tools, or your own check. |
| **Approval** | A policy that pauses an action until a human says yes, for anything risky. |
| **Intention** | What a governed agent's model *wants* to do (call a tool, answer…), written down but not executed: the SDK validates it first. |
| **Schema (Zod)** | A precise description of the shape data must have. Tool calls and the structured replies of the reasoning steps are checked against one; a reply that does not fit is refused. |
| **JSON** | A plain text format for structured data. Profiles, events and model replies are JSON. |

## Traceability

| Term | In plain words |
| --- | --- |
| **Event** | A line in the logbook: "this happened, at this time". Every step of every run is recorded as an event. See the [event catalog](../reference/events). |
| **Event store** | Where the logbook is kept: a folder of files, SQLite or PostgreSQL. |
| **Event sourcing** | The rule that the logbook is the truth: the state of a run, its mental state included, is rebuilt by rereading its events, never stored separately. That is what makes every run auditable months later. A thinker profile is the exception: events only record its id and version, so save the profile itself. |
| **Trace** | All the events of one run, in order. |
| **Replay** | Re-running a recorded run from its events: the actions it decided are executed again, through the same policies, without asking the language model again. Useful to audit a run or to test "what if" after changing a policy. See [Traceability & replay](./observability). |
| **Golden trace** | A good run you keep as a reference; new runs are checked against it, so a change of behaviour is detected like a failing test. |

## How a cognitive agent reasons

| Term | In plain words |
| --- | --- |
| **Mental state** | Everything the agent currently "has in mind" about the problem, written down as data: what it observed, knows, assumes, does not know, and the options it considers. See [the mental state](./cognitive-agents#the-mental-state). |
| **Observation** (`O1`…) | Something seen: a measurement or document you gave with the problem, a tool result, or a test result. |
| **Fact** (`F1`…) | A statement the agent holds true, with where it comes from. A fact is never deleted: it is *retracted* (withdrawn) or *superseded* (replaced), with the reason. |
| **Assumption** (`A1`…) | Something the reasoning takes for granted without proof. |
| **Constraint** (`K1`…) | Something any answer must respect ("before Q4", "under 10k EUR"). |
| **Unknown** (`U1`…) | An open question. It can be *resolved* (answered) or *dropped* (no way to answer it). |
| **Hypothesis** (`H1`…) | An option under consideration. It is one of three kinds: a **proposal** (a choice of action: "decline the job"), a **rule** (a regularity: "rolling time does not depend on mass") or an **explanation** (a cause). |
| **Induction, abduction, deduction** | Three ways of reaching a hypothesis: from repeated cases to a rule; from a surprise to its most likely cause; from a rule to what must follow. The label is declared, it does not make the claim true. |
| **Operation** | One reasoning move: represent the problem, hypothesize, simulate, critique, compare, decide… There are ten. See [the operations](./cognitive-agents#the-operations). |
| **Controller** | What picks the next operation. The **heuristic** controller follows a fixed order, free and predictable; the **typed** controller asks Jev at each step. |
| **Thought patch** | What one operation changed in the mental state, recorded as one event. The mental state is all the patches applied in order. |
| **Simulation** | Imagining what would happen if a hypothesis were true: immediate effects, then indirect ones. |
| **Critique** | The agent attacking its own option: the strongest reason it could fail. A **fatal** critique without an answer rejects the option. |
| **Contradiction** (`C1`…) | Two things that cannot both be true. It stays open until settled by citing the observations or facts that settle it. |
| **Variant** | A corrected version of a hypothesis the evidence contradicted, with a narrower scope or an added condition, and a sentence saying what changed. |
| **Limits** | The budget of a run: number of steps, time, tool calls, tests, and the thresholds for concluding. See [Limits](./cognitive-agents#limits). |

## Evidence and conclusions

| Term | In plain words |
| --- | --- |
| **Provenance** | Where a piece of evidence comes from: given by you, returned by a tool, or measured by a test, with the event that holds the original. |
| **Origin group** (`originGroup`) | A label for "same source". Two observations from the same origin are not two independent confirmations. |
| **Duplicate** | The same content from the same origin, seen again. It adds no weight. |
| **Prediction** (`P1`…) | What should be observed if a hypothesis is right, recorded **before** testing it. |
| **Falsifier** | The observation that would prove the hypothesis wrong. A claim that cannot be proven wrong cannot be tested. |
| **Outcome evaluator** | Your code that confronts a prediction with the world (a measurement, a simulator, a test suite) and answers *confirmed*, *refuted* or *inconclusive*. The language model never grades its own predictions. See [Predictions](./evidence-and-verification#predictions-and-the-outcome-evaluator). |
| **Support** | How well the evidence backs a hypothesis, from 0 (refuted) to 1 (established). It is a judgement, not a measured probability. The code never mixes preferences into it; with a language-model judge, that rests on its instructions (see [Evidence is not preference](./evidence-and-verification#evidence-is-not-preference)). |
| **Preference fit** (`preferenceFit`) | How well a choice of action suits the thinker, from 0 (meets one of their rejection criteria) to 1 (ideal). Only choices of action get one. |
| **Ranking** | The order of the options. Claims are ranked by support alone; choices of action by 60% support and 40% preference fit, by default. |
| **Stale** | An assessment made before the evidence last changed. It must be redone before concluding. |
| **Conclusion guard** | The checks, written in code, an answer must pass to be committed: critiqued, assessed since the last new evidence, no open contradiction concerning it, no prediction left untested while tests remain in the budget, and enough support. See [The conclusion guard](./evidence-and-verification#the-conclusion-guard). |
| **Decision threshold** | The support a firm answer needs: 0.75 by default, "strongly supported". A choice of action the thinker clearly prefers needs only 0.35. |
| **Committed** | A firm answer that passed the conclusion guard. |
| **Provisional** | The best answer available when the budget ran out, with the list of what is not established yet (`missing`). |
| **Abstain** | "I cannot conclude", with the reasons. A valid outcome, not an error. |
| **Confidence** | How sure the decision is, never higher than the evidence support of the chosen option. |

## Imitating a person's reasoning

| Term | In plain words |
| --- | --- |
| **Thinker profile** | A description of **how** a given person reasons: the order in which they look at a problem, their priorities, reflexes, rejection criteria and appetite for risk. It is written into the instructions of each reasoning step, which is how the agent imitates that person's reasoning. See [Thinker profiles](./thinker-profiles). |
| **Sample** | One topic the person explained in their own words: the topic, how they reasoned, what they concluded. |
| **Distill** | Extract a profile from samples: find what repeats in the way the person reasons across topics. |
| **Order of attention** (`reasoningSequence`) | The steps the person goes through, in order. |
| **Heuristic** | A reflex, written "when …, then …". |
| **Rejection criterion** | A reason the person drops an idea. |
| **Verdict** | The person's judgement on a run: `match` (reasoned like me), `partial`, or `mismatch`. |
| **Agreement** | How much of a run the person agrees with, from 0 to 1: `0.8` means "80% right". It is how you measure how close the imitation gets. |
| **Calibration example** | A run the person validated, shown to the model as a model answer. |
| **Correction** | A lesson from a run the person disagreed with, shown to the model as its highest priority. |

## Typed decisions and connectors

| Term | In plain words |
| --- | --- |
| **Jev** | A model by TypeSafe that answers narrow questions (yes/no, a choice, a rating) with probabilities your code can use, quickly and cheaply. See [Typed decisions](./typed-decisions). |
| **Noul, Choice, Score** | Jev's three question types: yes or no; one option among a list; a level on a scale. Picking several options asks one yes/no question per option. |
| **Calibrated** | A probability that matches reality on average: of the answers given with 80% confidence, about 80% are right. |
| **AI Gateway** | A Vercel service that gives access to several models, Jev included, with a single key. |
| **MCP** | Model Context Protocol, a standard way to connect AI applications to tools and data. The SDK can offer its tools through MCP and use the tools of any MCP server. See [MCP connectors](./mcp). |

## Operating in production

| Term | In plain words |
| --- | --- |
| **Retry** | Trying a failed request again after a short wait, when the failure is temporary. See [Retries & fallback](./resilience). |
| **Fallback, failover** | Switching to another model or provider when the first one keeps failing. |
| **Incident** | A failed run, a blocked action or a failover, turned into an alert sent to you by email or webhook. See [Incident alerts](./incidents). |
| **Webhook** | An address your chat or monitoring tool gives you, to which the SDK sends alerts. |
