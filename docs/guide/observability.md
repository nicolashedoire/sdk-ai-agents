# Traceability & replay

Every run — governed, cognitive, a direct typed decision or an MCP tool call — is an **append-only event log**. Nothing happens off the record, and everything else is derived from it.

```mermaid
flowchart LR
  subgraph Run
    direction TB
    A[run.started] --> B[cognition.operation_selected]
    B --> C[decision.evaluated]
    C --> D[cognition.thought]
    D --> E[policy.checked]
    E --> F[tool.called]
    F --> G[action.executed]
    G --> H[run.completed]
  end
  Run --> T[getTrace]
  Run --> M[getMentalState]
  Run --> R[replay]
  Run --> K[getRunCost]
  Run --> I[getIncidents]
  Run --> DS[exportControllerDataset]
```

## Stores

| Store | Use it for |
| --- | --- |
| `FileEventStore` (default) | Development, single process — one JSON file per run |
| `SQLiteEventStore` | Local persistence with queries |
| `PostgreSQLEventStore` | Production: indexed queries, aggregation, backup and restore |

::: code-group

```ts [File]
import { createSDK, FileEventStore } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey, eventStore: new FileEventStore('./events') });
```

```ts [SQLite]
import Database from 'better-sqlite3';
import { createSDK, SQLiteEventStore } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey, eventStore: new SQLiteEventStore({ db: new Database('events.db') }) });
```

```ts [PostgreSQL]
import pg from 'pg';
import { createSDK, PostgreSQLEventStore } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sdk = createSDK({ apiKey, eventStore: new PostgreSQLEventStore({ pool }) });
```

:::

Stores implement `IEventStore`; write your own to target any database. The file store buffers events and flushes them every 100 ms; call `await store.destroy()` at shutdown to write what is pending. Readers of the log (mental state rebuild, costs, datasets) ignore events repeated with the same id.

## Read a run

```ts
const trace = await sdk.getTrace(runId);          // status, timeline, summary
const text = await sdk.exportTrace(runId, 'text'); // human-readable timeline
const events = await sdk.getEvents(runId, { type: ['tool.called', 'policy.violated'] });
const state = await sdk.getMentalState(runId);    // cognitive runs
```

A run's status is the **last lifecycle event** (`run.completed`, `run.failed`, `run.cancelled`). Events appended afterwards — feedback, incident reports — never reopen it.

## Live progress

Events also reach your code **while the run is in progress**, once the store has accepted them: to show progress in an interface, stream it to a client or feed a dashboard. MCP clients get them as [progress notifications](./mcp-deploy#progress-notifications).

```ts
const result = await agent.run({
  message: 'Refund order 1234',
  onEvent: (event) => console.log(event.type),
});

const answer = await cognitiveAgent.think({ problem, onEvent: (event) => socket.send(JSON.stringify(event)) });
const replay = await sdk.replay(runId, undefined, { onEvent: (event) => console.log(event.type) });

// Every run of the SDK, for as long as you listen
const unsubscribe = sdk.subscribe((event) => dashboard.push(event), { types: ['run.failed', 'approval.requested'] });
unsubscribe();
```

| Where | What the listener receives |
| --- | --- |
| `run({ onEvent })`, `think({ onEvent })` | Every event of that run |
| `replay(runId, modifications, { onEvent })` | Every event of the replay |
| `executeTool(name, params, { onEvent })` | The events of the call, and of the agent runs its tool starts (`governedAgentTool`, `cognitiveAgentTool`) |
| `sdk.subscribe(listener, { runId?, agentId?, types? })` | Every event of every run that matches the filter, until you call the function it returns |

What is guaranteed:

- **Only what the store accepted.** A listener is called once the store's `append` has succeeded, never for an event the store refused. With the SQL stores the row is committed; with the file store the event is in its buffer: `getEvents` returns it at once, and it reaches the disk within 100 ms (a crash in between loses it).
- **In order.** The events of a run arrive in the order they were recorded; the events of different runs interleave.
- **One event at a time, and the run never waits.** When your listener returns a promise, its next event waits until that promise settles, so an async listener cannot reorder events. The run goes on meanwhile: a slow listener falls behind, it does not slow the agent down. `run()`, `think()`, `replay()` and `executeTool()` resolve once their `onEvent` has settled on every event of the run, so when they return you have seen everything. A promise that never settles keeps them from returning: for fire-and-forget work, do not return the promise (`onEvent: (event) => { void save(event); }`). A synchronous listener is called before the event's `append` returns: keep it quick.
- **Errors stay out of the run.** A listener that throws or rejects is reported on standard error (`console.error`) and still gets the next events. To handle them yourself, catch them in the listener, or create the SDK with `eventStore: new ObservedEventStore(store, { onListenerError })`.
- **A copy.** Each listener gets its own copy of the event, as the store reads it back: changing it changes nothing in the log.
- **Unsubscribing is immediate.** After the function returned by `sdk.subscribe` is called, the listener is not called again, not even for events already waiting; it can be called from inside the listener.

The `agentId` filter matches the `metadata.agentId` of each event: a few events carry no agent (`provider.retry`, the end of a replay), filter by run to get them. Restored backups are not delivered. For an agent assembled by hand on your own store (`new AgentImpl(…)`), wrap the store in an `ObservedEventStore` to use `onEvent`; `createSDK` does it for you.

## Replay without the LLM

```ts
const replay = await sdk.replay(runId);
```

Replay re-executes the recorded intentions through the action engine — policies included — **without calling the LLM**. Replay with modifications to test "what if" scenarios, for example after changing a policy.

A replay runs the tools again, for real. For tools marked `requiresApproval`, a replay repeats only the calls a human **approved** in the original run — the same tool with the same parameters — without asking again; a call that was rejected, cancelled or never approved is refused, not run. Approvals required by a *policy* still apply and wait for a decision.

## Understand decisions

| Method | What you get |
| --- | --- |
| `getReasoningGraph(runId)` / `exportReasoningGraph(runId, 'graphviz')` | The chain intention → policy → action as a graph |
| `getAlternatives(runId)` | Alternatives the agent considered |
| `getDecisionPatterns(filters)` | Recurring decision patterns across runs |
| `getTraceVisualization(runId)` | Grouped, timeline-ready structure for a UI |
| `getPolicyAuditTrail(runId)` | Every policy evaluation and its result |

## Test agents like code

Turn a good run into a **golden trace**, then validate new runs against it:

```ts
const golden = await sdk.createGoldenTrace(runId, { name: 'refund flow', description: 'Expected behavior' });
const validation = await sdk.validateAgainstGoldenTrace(newRunId, golden.id);
const regressions = await sdk.detectRegressions(newRunId, golden.id);
```

Regression suites, behavioral assertions, run comparison and impact analysis before deployment are available too — see the [SDK API](../reference/sdk-api).
