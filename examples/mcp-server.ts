/**
 * Recipe "a function": exposes one governed tool to any MCP client (Claude Desktop, Claude
 * Code, IDE assistants, other agents) over stdio. Every call is validated, checked against
 * policies and written to the event log.
 *
 * Run: npm run example:mcp   (an MCP client starts it as a process; see docs/guide/mcp-first-server.md)
 */
import { join } from 'node:path';
import { z } from 'zod';
import { FileEventStore, createSDK } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const customers = new Map([
  ['c-42', { plan: 'enterprise', churnRisk: 'low', seats: 120 }],
  ['c-7', { plan: 'starter', churnRisk: 'high', seats: 3 }],
]);

// No model key needed: MCP tools do not call a language model. The event log goes next to
// this file, because MCP clients start servers from a working directory you do not choose.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

sdk.defineTool({
  name: 'lookup_customer',
  description: 'Returns the plan, churn risk and seats of a customer',
  schema: z.object({ customerId: z.string().describe('Customer id, e.g. c-42') }),
  metadata: { readOnly: true },
  handler: async ({ customerId }) =>
    customers.get(customerId) ?? { error: `unknown customer ${customerId}` },
});

await serveMcpOverStdio(sdk, {
  name: 'acme-crm',
  tools: ['lookup_customer'], // nothing is exposed unless listed
  instructions: 'Read-only access to ACME customer data.',
});
