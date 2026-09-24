/**
 * Recipe "an agent": your reasoning twin, consulted from Claude Desktop ("what would
 * Nicolas think of…?"). A cognitive agent with a thinker profile is exposed as one tool.
 *
 * Run: OPENAI_API_KEY=... npm run example:mcp-agent
 *   PROFILE_FILE   a JSON thinker profile saved from sdk.distillThinkerProfile (optional)
 *
 * A cognitive run takes tens of seconds to minutes; MCP clients cancel slow calls (often
 * after about a minute), so the limits below are kept small. Cancelling stops the run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FileEventStore,
  cognitiveAgentTool,
  createSDK,
  thinkerProfileSchema,
  type ThinkerProfileInput,
} from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new FileEventStore(join(import.meta.dirname, 'events')),
});

const profile: ThinkerProfileInput = process.env.PROFILE_FILE
  ? loadProfile(process.env.PROFILE_FILE)
  : {
      id: 'nicolas',
      name: 'Nicolas',
      reasoningSequence: [
        { id: 'capability', instruction: 'Establish what the thing really enables, beyond the hype' },
        { id: 'limits', instruction: 'Find its limits immediately' },
        { id: 'workaround', instruction: 'Imagine how to work around those limits' },
        { id: 'prototype', instruction: 'Design the smallest prototype that would test it' },
      ],
      priorities: ['Real capability over hype', 'Free and open options first'],
      heuristics: [{ when: 'a service is paid and closed', action: 'look for an open clone first' }],
      rejectionCriteria: ['Cannot be tested with a prototype'],
      riskAppetite: 'high',
    };

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: process.env.MODEL ?? 'gpt-4o-mini',
  profile,
  limits: { maxSteps: 6, timeoutMs: 50_000 },
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [
    cognitiveAgentTool(twin, {
      name: 'ask_nicolas',
      description:
        'Asks how Nicolas would reason about a question or a decision, and what he would conclude. Returns a decision (committed, provisional or abstain) with its rationale.',
    }),
  ],
  instructions: 'Use ask_nicolas when the user wants to know what Nicolas would think or decide.',
});

/** A profile file is external data: it is validated before use. */
function loadProfile(file: string): ThinkerProfileInput {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return thinkerProfileSchema.parse(raw);
}
