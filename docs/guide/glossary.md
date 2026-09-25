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
| **Approval** | A pause before a risky action until a human says yes. A policy can ask for it, or the tool itself (`requiresApproval`); if the caller gives up first, the action never runs. |
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
| **Knowledge** (`M1`…) | What earlier runs established with real tests, recalled at the start of a run: *verified*, *refuted*, or *contested* when tests disagree. See [Memory across runs](./memory). |
| **Scope** | The boundary of a memory: runs share what they learned only within the same scope, for example one test bench or one product. |
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

## Studies

| Term | In plain words |
| --- | --- |
| **Study** | An AI researcher (`sdk.createStudy`): it understands an object, then proposes how to redesign it with the knowledge and techniques of today, and designs the experiments that would decide. It builds and measures nothing. See [Studies](./studies). |
| **Passage** | One of the seven stages of a study: observe, decompose, understand the choices of their time, examine what changed, cross past and present, design, confront. A passage can reopen an earlier one. |
| **Charter** | The frame of a study: the object, the guiding question, the objective, the needs, your leads, what is out of scope. It is frozen when the study is created, and every prompt starts with it. |
| **Lead** | An idea you give the study to look into. It is an example to verify, not a truth: the study says whether it is relevant, with reasons, and looks beyond it. |
| **Claim status** | What a statement of a study is worth: **established** (backed by a source the study actually found), **hypothesis** (plausible, not documented) or **novelty** (a new idea, to check against existing work). The code checks it, not the model. See [Established, hypothesis, novelty](./studies#established-hypothesis-novelty). |
| **Prior art** | The existing work closest to an idea presented as new. A novelty stays "to verify" until the study has searched for it. |
| **Guardian** | A separate check after each passage of a study: it sees only the charter and what the passage produced, and removes what wanders off the objective. See [The guardian](./studies#the-guardian). |
| **Drift, drift log** | Drift is a model slowly leaving its subject. The drift log lists everything a study removed for that reason, and why. |
| **Amendment** | An instruction added to a study after it was created. It is accepted only when it refines the objective; one that contradicts the charter or changes the objective is refused. |
| **New capability** | Something that becomes possible, difficult or impossible today, through a change of principle — as opposed to an **improvement**, which only makes something faster or cheaper. |
| **Breakthrough by assembly** | A breakthrough made of techniques that already existed, joined in a new way. Bitcoin is one: signatures, hash chains, proof of work and a peer-to-peer network were all known before. |
| **Mechanism card** | Eleven questions about one mechanism, from what was observed to what was concluded. A study answers the first nine; you answer the last two once you have run the experiment. |

## Typed decisions and connectors

| Term | In plain words |
| --- | --- |
| **Jev** | A model by TypeSafe that answers narrow questions (yes/no, a choice, a rating) with probabilities your code can use, quickly and cheaply. See [Typed decisions](./typed-decisions). |
| **Noul, Choice, Score** | Jev's three question types: yes or no; one option among a list; a level on a scale. Picking several options asks one yes/no question per option. |
| **Calibrated** | A probability that matches reality on average: of the answers given with 80% confidence, about 80% are right. |
| **AI Gateway** | A Vercel service that gives access to several models, Jev included, with a single key. |
| **MCP** | Model Context Protocol: one standard "plug" between AI applications (Claude Desktop, Claude Code, IDE assistants, agents) and your systems. The SDK can turn a function, a web API, a folder, a database or an agent into an MCP server, and use the tools of any MCP server. See [MCP in plain words](./mcp). |
| **MCP server** | A small program in front of one of your systems that tells AI applications what it offers and does the work when asked. See [Your first MCP server](./mcp-first-server). |
| **MCP client, host** | The host is the AI application the user talks to; inside it, an MCP client holds the connection to one server. |
| **Resource** | A document an MCP server offers for reading, such as a file of a shared folder. Unlike a tool, the user or the application picks it, not the model. |
| **Transport** | How an MCP application and a server exchange messages: **stdio** (the application starts the server as a program on the same computer and talks through its input and output) or **Streamable HTTP** (the server is a web service). See [stdio or HTTP?](./mcp-deploy#stdio-or-http). |
| **OpenAPI** | A standard, machine-readable description of a web API: its addresses, parameters and answers, often published as `openapi.json`. From it, the SDK makes one tool per operation. See [A web API](./mcp-recipes#a-web-api-from-its-openapi-description). |
| **JSON Schema** | A description of the shape of some data — here, of a tool's arguments — that models and MCP applications read to call the tool correctly. The SDK writes it from your Zod schema or from the OpenAPI description. |
| **Read-only** | Can look, cannot change. The folder and database sources are read-only by construction; web APIs are read-only by default (only `GET` operations). |
| **Tool source** | A function that builds ready-made tools from a system: `openApiTools`, `folderTools`, `databaseTools`, `webTools`, `governedAgentTool`, `cognitiveAgentTool`, and `connectMcpServer` for the tools of any MCP server. Serve them over MCP in one line, or give them to your own agents. See [Tools](./tools), [An MCP server for anything](./mcp-recipes) and [Web research](./web-research). |

## Operating in production

| Term | In plain words |
| --- | --- |
| **Retry** | Trying a failed request again after a short wait, when the failure is temporary. See [Retries & fallback](./resilience). |
| **Fallback, failover** | Switching to another model or provider when the first one keeps failing. |
| **Incident** | A failed run, a blocked action or a failover, turned into an alert sent to you by email or webhook. See [Incident alerts](./incidents). |
| **Webhook** | An address your chat or monitoring tool gives you, to which the SDK sends alerts. |
