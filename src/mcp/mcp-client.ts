import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import type {
  ToolCallContext,
  ToolDefinition,
  ToolMetadata,
  ToolRetryPolicy,
} from '../types/tool.js';
import { jsonSchemaProblems } from '../utils/json-schema-check.js';

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
  /**
   * Governance metadata applied to every imported tool (risk level, approval). Each field you
   * set replaces the one the server's annotations gave: `readOnlyHint` gives `readOnly`, and
   * `destructiveHint: true` (on a tool not marked read-only) gives `riskLevel: 'high'`.
   */
  metadata?: ToolMetadata;
  retry?: ToolRetryPolicy;
  /**
   * Check each call's arguments against the tool's `inputSchema` before policies, approvals
   * and the server see it (a subset of JSON Schema, see `jsonSchemaProblems`; the server checks
   * the rest). Default `true`.
   */
  validateArguments?: boolean;
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
    .map((tool) => {
      const metadata = importedMetadata(tool.annotations, options.metadata);
      return {
        name: `${prefix}${tool.name}`.replace(MCP_NAME_PATTERN, '_').slice(0, 64),
        description: tool.description ?? `${tool.name} (MCP tool from ${options.name})`,
        schema: argumentsSchema(tool.inputSchema, options.validateArguments ?? true),
        inputJsonSchema: tool.inputSchema,
        capability: `mcp:${options.name}`,
        ...(metadata ? { metadata } : {}),
        ...(options.retry ? { retry: options.retry } : {}),
        handler: async (params: unknown, context?: ToolCallContext) => {
          // When the caller gives up, the request is abandoned and the server is told
          // (`notifications/cancelled`), so it can stop the work. Each call gets its own
          // signal, unlinked once the call ends: the MCP client never removes the listener it
          // adds, so a run's signal given as is would keep one per call, and cancel them all.
          const caller = context?.signal;
          const call = new AbortController();
          const forward = () => call.abort(caller?.reason);
          if (caller?.aborted) forward();
          else caller?.addEventListener('abort', forward, { once: true });
          let result: Awaited<ReturnType<typeof client.callTool>>;
          try {
            result = await client.callTool(
              { name: tool.name, arguments: isRecord(params) ? params : {} },
              undefined,
              caller ? { signal: call.signal } : undefined
            );
          } finally {
            caller?.removeEventListener('abort', forward);
          }
          const text = extractText(result.content);
          if (result.isError) {
            throw new Error(text || `MCP tool ${tool.name} failed`);
          }
          return result.structuredContent ?? text;
        },
      };
    });

  return {
    name: options.name,
    tools,
    client,
    close: () => client.close(),
  };
}

/**
 * The server's annotations as governance metadata, with every field of `given` over them.
 * Annotations are the server's own claims: they label, they never relax a policy.
 */
function importedMetadata(
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean } | undefined,
  given: ToolMetadata | undefined
): ToolMetadata | undefined {
  const metadata: ToolMetadata = {};
  if (typeof annotations?.readOnlyHint === 'boolean') metadata.readOnly = annotations.readOnlyHint;
  for (const [key, value] of Object.entries(given ?? {})) {
    if (value !== undefined) Object.assign(metadata, { [key]: value });
  }
  // After the merge, so a tool your `metadata` marks not read-only is still high risk. A
  // server that omits `destructiveHint` gives no risk (MCP's default, true, is not applied).
  if (
    annotations?.destructiveHint === true &&
    metadata.readOnly !== true &&
    metadata.riskLevel === undefined
  ) {
    metadata.riskLevel = 'high';
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/** An object of arguments, checked against the tool's JSON Schema unless `validate` is off. */
function argumentsSchema(
  inputSchema: unknown,
  validate: boolean
): z.ZodType<Record<string, unknown>> {
  const object = z.record(z.unknown());
  if (!validate) return object;
  return object.superRefine((args, context) => {
    for (const problem of jsonSchemaProblems(inputSchema, args)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: problem.path,
        message: problem.message,
      });
    }
  });
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
