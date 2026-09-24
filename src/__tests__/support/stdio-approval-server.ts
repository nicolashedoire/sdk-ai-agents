/**
 * A real stdio MCP server for `mcp-stdio.test.ts`: its only tool needs an approval, and it
 * writes a marker file if it ever runs. Arguments: events directory, marker file.
 */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { serveMcpOverStdio } from '../../mcp.js';
import { createSDK } from '../../sdk.js';
import { FileEventStore } from '../../stores/file-event-store.js';

const [eventsDir, markerFile] = process.argv.slice(2);
if (!eventsDir || !markerFile) {
  throw new Error('usage: stdio-approval-server <events directory> <marker file>');
}

const sdk = createSDK({ eventStore: new FileEventStore(eventsDir) });
sdk.defineTool({
  name: 'refund',
  description: 'Refunds an order',
  schema: z.object({ orderId: z.string() }),
  metadata: { requiresApproval: true },
  handler: async ({ orderId }) => {
    writeFileSync(markerFile, orderId);
    return 'refunded';
  },
});

await serveMcpOverStdio(sdk, { name: 'refunds', tools: ['refund'] });
