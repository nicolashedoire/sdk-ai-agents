import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import type { ToolDefinition, ToolMetadata, ToolRetryPolicy } from '../types/tool.js';

export type McpTransportConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  | { type: 'http'; url: string; headers?: Record<string, string> }
  /** Any MCP transport you build yourself (WebSocket, in-memory, custom). */
  | { type: 'custom'; transport: Transport };

export interface ConnectMcpOptions {
  /** Short name of the connected system, used in descriptions and capabilities. */
  name: string;
  transport: McpTransportConfig;
  /** Prefix added to every tool name (e.g. `crm_`) to avoid collisions between servers. */
  toolPrefix?: string;
  /** Only import these MCP tool names. */
  include?: string[];
  /** Governance metadata applied to every imported tool (risk level, approval). */
  metadata?: ToolMetadata;
  retry?: ToolRetryPolicy;
}

export interface McpConnection {
  name: string;
  /** Tool definitions ready for `sdk.defineTool()`. */
  tools: ToolDefinition[];
  client: Client;
  close(): Promise<void>;
}

const MCP_NAME_PATTERN = /[^a-zA-Z0-9_-]/g;

/**
 * Connects to an MCP server and turns its tools into SDK tools. Once defined with
 * `sdk.defineTool`, they are governed like local tools: allowlists, policies, approvals,
 * budgets, retries and traces apply to every call made by an agent.
 */
export async function connectMcpServer(options: ConnectMcpOptions): Promise<McpConnection> {
  const client = new Client({ name: '@sdk-ai-agents/core', version: '0.2.0' });
  await client.connect(createTransport(options.transport));

  const listed = [];
  try {
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      listed.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
  } catch (error) {
    // Do not leave a child process or an HTTP session behind.
    await client.close().catch(() => undefined);
    throw error;
  }

  const prefix = options.toolPrefix ?? '';
  const tools: ToolDefinition[] = listed
    .filter((tool) => !options.include || options.include.includes(tool.name))
    .map((tool) => ({
      name: `${prefix}${tool.name}`.replace(MCP_NAME_PATTERN, '_').slice(0, 64),
      description: tool.description ?? `${tool.name} (MCP tool from ${options.name})`,
      schema: z.record(z.unknown()),
      inputJsonSchema: tool.inputSchema,
      capability: `mcp:${options.name}`,
      ...(options.metadata ? { metadata: options.metadata } : {}),
      ...(options.retry ? { retry: options.retry } : {}),
      handler: async (params: unknown) => {
        const result = await client.callTool({
          name: tool.name,
          arguments: isRecord(params) ? params : {},
        });
        const text = extractText(result.content);
        if (result.isError) {
          throw new Error(text || `MCP tool ${tool.name} failed`);
        }
        return result.structuredContent ?? text;
      },
    }));

  return {
    name: options.name,
    tools,
    client,
    close: () => client.close(),
  };
}

function createTransport(config: McpTransportConfig): Transport {
  switch (config.type) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        ...(config.args ? { args: config.args } : {}),
        ...(config.env ? { env: config.env } : {}),
        ...(config.cwd ? { cwd: config.cwd } : {}),
      });
    case 'http':
      return new StreamableHTTPClientTransport(new URL(config.url), {
        ...(config.headers ? { requestInit: { headers: config.headers } } : {}),
      });
    case 'custom':
      return config.transport;
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part: unknown) =>
      isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? part.text : ''
    )
    .filter((text) => text !== '')
    .join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
