/**
 * Exposes governed tools to any MCP client (Claude Desktop, IDE assistants, other agents)
 * over stdio. Every call is validated, checked against policies and traced.
 *
 * Run: npm run example:mcp   (an MCP client starts it as a process)
 */
import { z } from 'zod';
import { createSDK } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const customers = new Map([
  ['c-42', { plan: 'enterprise', churnRisk: 'low', seats: 120 }],
  ['c-7', { plan: 'starter', churnRisk: 'high', seats: 3 }],
]);

// MCP tools do not call an LLM, so a placeholder key is enough here.
const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY ?? 'not-used-by-mcp-tools' });

sdk.defineTool({
  name: 'lookup_customer',
  description: 'Returns the plan, churn risk and seats of a customer',
  schema: z.object({ customerId: z.string() }),
  handler: async ({ customerId }) => customers.get(customerId) ?? { error: `unknown customer ${customerId}` },
});

await serveMcpOverStdio(sdk, {
  name: 'acme-crm',
  tools: ['lookup_customer'], // nothing is exposed unless listed
  instructions: 'Read-only access to ACME customer data.',
});
