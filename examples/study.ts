/**
 * A study: understand an object, then propose how to organise it with the knowledge and
 * techniques of today. Here the Web browser from 1990 to 2026, with three leads of the owner
 * to verify (examples, not truths): vectorisation, poids, ReLU. The study looks for a change of
 * principle that makes possible something difficult today, not only faster, and deconstructs
 * Bitcoin as a breakthrough by assembly: prior techniques that, together, opened a capability.
 *
 * Run: OPENAI_API_KEY=... npm run example:study
 *   SEARCH_MCP    command of an MCP search server, e.g. "npx -y @modelcontextprotocol/server-brave-search"
 *                 (with the key it needs, e.g. BRAVE_API_KEY). Without a source, nothing can be
 *                 established: every claim stays a hypothesis.
 *   SEARCH_TOOLS  the server's tools to search with, comma-separated (all of them by default)
 *   MODEL         the model of every call (gpt-4o by default)
 *
 * The study builds, runs and measures nothing: it writes a dossier (examples/study-navigateur.md)
 * with its passages, its architectures and the experiments that would decide between them.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FileEventStore, createSDK } from '../src/index.js';
import { connectMcpServer, type McpConnection } from '../src/mcp.js';

const eventStore = new FileEventStore(join(import.meta.dirname, 'events'));

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore,
  // Illustrative prices: use your provider's current prices or your contract.
  pricing: { 'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 } },
});

// The study searches only with the tools you give it, run through the governed pipeline.
const search = process.env.SEARCH_MCP ? await connectSearch(process.env.SEARCH_MCP) : undefined;
const sources = (search?.tools ?? []).map((tool) => sdk.defineTool(tool).name);

const study = sdk.createStudy({
  name: 'navigateur',
  object: 'Le navigateur Web, de 1990 à 2026',
  objective: "Une conception de navigateur dont chaque choix découle de l'enquête",
  needs: ['interactions', 'accessibilité', 'compatibilité attendue avec le Web existant'],
  leads: ['vectorisation', 'poids', 'ReLU'],
  // No capability named: the study proposes candidates (set `capability` to aim at one).
  analogues: ['Bitcoin'],
  sources,
  model: process.env.MODEL ?? 'gpt-4o',
  language: 'fr',
  limits: { maxModelCalls: 60, maxSearches: 20, timeoutMs: 20 * 60_000 },
});

console.log(`Charter ${study.charterHash.slice(0, 16)}… (${sources.length} search source(s))`);
const result = await study.run({
  onEvent: (event) => {
    if (event.type === 'study.passage_started') console.log(`→ ${event.data.passage}`);
    if (event.type === 'study.search') console.log(`  search: ${event.data.query}`);
    if (event.type === 'study.drift_rejected') {
      const item = event.data.item as { statement?: string };
      console.log(`  ✗ off the objective: ${item.statement ?? '?'} (${event.data.reason})`);
    }
  },
});

const file = join(import.meta.dirname, 'study-navigateur.md');
writeFileSync(file, result.markdown);
const { stats } = result.report;
console.log(`\nStatus: ${result.status}${result.stoppedBy ? ` (${result.stoppedBy})` : ''}`);
console.log(
  `${stats.items} items: ${stats.byStatus.established} established, ${stats.byStatus.hypothesis} hypotheses, ${stats.byStatus.novelty} novelties (${stats.noveltiesToVerify} to verify); ${stats.rejected} rejected`
);
// Capabilities first, then improvements (only faster or cheaper).
for (const { id, kind, name, capability } of result.report.architectures) {
  console.log(`  ${id} [${kind}] ${name}: ${capability.what}`);
}
console.log(`Dossier: ${file}`);
console.log('Cost:', await sdk.getRunCost(result.runId));

// Once you ran an experiment of the dossier, record what it found (fields 10 and 11):
//   await study.recordResult('M1', { result: '…', error: '…', conclusion: '…' });

await search?.close();
// Write pending events and stop the store's flush timer so the process can exit.
await eventStore.destroy();

/** Connects to an MCP search server started by `command` (its tools become study sources). */
async function connectSearch(command: string): Promise<McpConnection> {
  const [program = '', ...args] = command.split(' ').filter(Boolean);
  const include = process.env.SEARCH_TOOLS?.split(',').map((name) => name.trim());
  // The server gets this process's environment: its API key comes from there.
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  return connectMcpServer({
    name: 'search',
    transport: { type: 'stdio', command: program, args, env },
    ...(include ? { include } : {}),
    metadata: { readOnly: true },
  });
}
