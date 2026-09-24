import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const server = join(process.cwd(), 'src', '__tests__', 'support', 'stdio-approval-server.ts');

function eventsIn(directory: string): Array<{ type: string; data: Record<string, unknown> }> {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const parsed: unknown = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    });
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  for (const started = Date.now(); Date.now() - started < timeoutMs; ) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

describe('a stdio MCP server whose client leaves', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('cancels the pending approval, never runs the tool, records it and exits', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mcp-stdio-'));
    directories.push(directory);
    const eventsDir = join(directory, 'events');
    const marker = join(directory, 'tool-ran');
    // Only stdin is used: the other streams are not read, so they are not piped.
    const child = spawn(tsx, [server, eventsDir, marker], { stdio: ['pipe', 'ignore', 'ignore'] });
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);

    try {
      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'refund', arguments: { orderId: 'o-1' } } });
      const requested = await waitFor(
        () => eventsIn(eventsDir).some((event) => event.type === 'approval.requested'),
        10_000
      );
      expect(requested).toBe(true);

      // The client goes away: its end of stdin closes.
      child.stdin.end();
      const code = await Promise.race([exited, new Promise<'still running'>((resolve) => setTimeout(() => resolve('still running'), 10_000))]);

      expect(code).toBe(0);
      expect(existsSync(marker)).toBe(false);
      const rejected = eventsIn(eventsDir).find((event) => event.type === 'approval.rejected');
      expect(rejected?.data.reason).toBe('cancelled before a decision');
    } finally {
      child.kill();
    }
  }, 30_000);
});
