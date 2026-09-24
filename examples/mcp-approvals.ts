/**
 * An MCP server whose write tool waits for a human, with a small admin endpoint on this
 * machine to see and decide the pending approvals.
 *
 * Run: ADMIN_SECRET=change-me npm run example:mcp-approvals   (an MCP client starts it)
 *   GET  http://127.0.0.1:4000/approvals               lists what waits (header X-Admin-Secret)
 *   POST http://127.0.0.1:4000/approvals/<id>/approve  or /reject
 *
 * The admin endpoint decides what runs: protect it like the MCP endpoint.
 */
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';
import { FileEventStore, type SDK, createSDK } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const secret = process.env.ADMIN_SECRET;
if (!secret) throw new Error('Set ADMIN_SECRET: the admin endpoint decides what runs');
const port = Number(process.env.ADMIN_PORT ?? 4000);

const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. A human approves each refund.',
  schema: z.object({ orderId: z.string(), amountEur: z.number().positive() }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  handler: async ({ orderId, amountEur }) => ({ refunded: orderId, amountEur }),
});

const admin = serveApprovalAdmin(sdk, secret, port);
const mcp = await serveMcpOverStdio(sdk, { name: 'refunds', tools: ['refund_order'] });
// When the MCP client leaves, the admin endpoint closes too, so the process can exit.
mcp.onclose = () => admin.close();

/** Lists and decides pending approvals. Local only, secret header, no browser requests. */
function serveApprovalAdmin(host: SDK, adminSecret: string, listenPort: number): Server {
  // Only these Host values: a web page cannot reach it through DNS rebinding.
  const allowedHosts = new Set([`127.0.0.1:${listenPort}`, `localhost:${listenPort}`]);
  const handle = (request: IncomingMessage, response: ServerResponse) => {
    // Browsers send Origin on cross-site requests; this endpoint is for scripts and curl.
    if (request.headers.origin !== undefined) return answer(response, 403, 'Forbidden origin');
    if (!allowedHosts.has(request.headers.host ?? '')) return answer(response, 403, 'Forbidden host');
    const given = request.headers['x-admin-secret'];
    if (typeof given !== 'string' || !sameSecret(given, adminSecret)) {
      return answer(response, 401, 'Unauthorized');
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/approvals') {
      return answer(response, 200, host.getPendingApprovals());
    }
    const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
    if (request.method === 'POST' && decision) {
      const [, id = '', verb] = decision;
      try {
        if (verb === 'approve') host.approveAction(id, 'admin', 'approved from the admin endpoint');
        else host.rejectAction(id, 'admin', 'rejected from the admin endpoint');
        return answer(response, 200, { decided: id, verb });
      } catch (error) {
        // Unknown, already decided, or cancelled because the caller gave up.
        return answer(response, 409, error instanceof Error ? error.message : String(error));
      }
    }
    return answer(response, 404, 'Not found');
  };
  return createServer(handle).listen(listenPort, '127.0.0.1', () => {
    console.error(`Approval admin on http://127.0.0.1:${listenPort}/approvals`);
  });
}

function answer(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
