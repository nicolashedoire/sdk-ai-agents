import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ValidationError } from '../errors/index.js';
import type { ResourceProvider } from '../types/resource.js';
import type { Tool, ToolDefinition } from '../types/tool.js';
import { zodSchemaToJsonSchema } from '../utils/zod-to-json-schema.js';
import type { GovernedToolHost } from './governed-tool-host.js';
import { serveResources } from './mcp-resources.js';

const DEFAULT_APPROVAL_TIMEOUT_MS = 50_000;

export interface McpServerOptions {
  name: string;
  version?: string;
  /**
   * What to expose. Required: nothing is exposed unless listed, so tools imported from other
   * MCP servers or meant for internal agents never leak to clients by accident. Give the
   * names of tools already defined with `sdk.defineTool`, or tool definitions (from
   * `openApiTools`, `folderTools`, `databaseTools`, `cognitiveAgentTool`…), which are
   * defined on the SDK for you.
   */
  tools: Array<string | ToolDefinition>;
  /** Documents offered as MCP resources (e.g. `folderResources({ root })`). Reads are traced. */
  resources?: ResourceProvider | ResourceProvider[];
  /** Identity used for policies and traces of MCP calls. Defaults to `mcp:<name>`. */
  agentId?: string;
  /** Guidance shown to MCP clients about how to use this server. */
  instructions?: string;
  /**
   * Longest wait for a human approval during an MCP call, in milliseconds. Default 50 000:
   * below the time most clients wait (about a minute), so an approval nobody is waiting for
   * any more is cancelled — the tool then never runs. Raise it if your client waits longer.
   */
  approvalTimeoutMs?: number;
  /**
   * Include the underlying causes of tool errors in the text sent to clients. Off by default:
   * causes can contain internal details (SQL errors, file paths). The full error is always in
   * the event log.
   */
  exposeErrorDetails?: boolean;
}

/**
 * Exposes SDK tools as an MCP server. Every call goes through the governed pipeline:
 * policies, approvals, budgets and retries apply, and each call is traced as its own run.
 * Connect the returned server to any MCP transport (stdio, Streamable HTTP...).
 */
export function createMcpServer(host: GovernedToolHost, options: McpServerOptions): Server {
  const allowed = defineListedTools(host, options.tools);
  const providers = options.resources ? [options.resources].flat() : [];
  const server = new Server(
    { name: options.name, version: options.version ?? '1.0.0' },
    {
      capabilities: { tools: {}, ...(providers.length > 0 ? { resources: {} } : {}) },
      ...(options.instructions ? { instructions: options.instructions } : {}),
    }
  );
  const agentId = options.agentId ?? `mcp:${options.name}`;
  const exposed = (): Tool[] => host.listTools().filter((tool) => allowed.includes(tool.name));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: exposed().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toObjectSchema(tool.inputJsonSchema ?? zodSchemaToJsonSchema(tool.schema)),
      ...(tool.metadata?.readOnly !== undefined
        ? { annotations: { readOnlyHint: tool.metadata.readOnly } }
        : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    if (!exposed().some((tool) => tool.name === name)) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Tool "${name}" is not exposed by this server` }],
      };
    }
    try {
      const result = await host.executeTool(name, args ?? {}, {
        agentId,
        allowedTools: allowed,
        // Cancels a pending approval and reaches the tool when the client gives up, or when
        // the connection closes.
        signal: extra.signal,
        approvalTimeoutMs: options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
      });
      return { content: [{ type: 'text' as const, text: formatResult(result) }] };
    } catch (error) {
      const text = options.exposeErrorDetails ? describeFailure(error) : describeSafely(error);
      return { isError: true, content: [{ type: 'text' as const, text }] };
    }
  });

  if (providers.length > 0) {
    serveResources(server, host, providers, {
      agentId,
      exposeErrorDetails: options.exposeErrorDetails ?? false,
    });
  }
  return server;
}

/** Starts an MCP server on stdin/stdout, the transport used by desktop and IDE clients. */
export async function serveMcpOverStdio(
  host: GovernedToolHost,
  options: McpServerOptions
): Promise<Server> {
  const server = createMcpServer(host, options);
  await server.connect(new StdioServerTransport());
  // When the client goes away, stdin ends: closing the server aborts the calls still in
  // progress (a pending approval is cancelled, the tool never runs) and lets the process exit.
  const closeWhenClientLeaves = () => {
    server.close().catch(() => undefined);
  };
  process.stdin.once('end', closeWhenClientLeaves);
  process.stdin.once('close', closeWhenClientLeaves);
  // stdout carries the protocol: human messages go to stderr.
  console.error(`MCP server "${options.name}" ready on stdio, waiting for a client`);
  return server;
}

/**
 * Names of the exposed tools. Definitions are registered on the host; defining the same
 * definition again (a server created per HTTP session) reuses the registered tool.
 */
function defineListedTools(
  host: GovernedToolHost,
  entries: Array<string | ToolDefinition>
): string[] {
  const names: string[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      names.push(entry);
      continue;
    }
    const existing = host.listTools().find((tool) => tool.name === entry.name);
    if (!existing) {
      host.defineTool(entry);
    } else if (existing.handler !== entry.handler) {
      throw new Error(
        `Another tool named "${entry.name}" is already defined: give one of them a prefix`
      );
    }
    names.push(entry.name);
  }
  return names;
}

function toObjectSchema(schema: Record<string, unknown>): {
  type: 'object';
  [key: string]: unknown;
} {
  return { ...schema, type: 'object' };
}

/**
 * Top-level message, plus the reason when the call was refused for its input (a
 * `ValidationError`: wrong argument, path outside a shared folder, SQL that is not a query).
 * Those reasons are written for callers; other causes may hold internal details.
 */
function describeSafely(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Tool execution failed';
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 4; depth++) {
    if (current instanceof ValidationError && current !== error) {
      return `${message}: ${current.message}`;
    }
    current = Reflect.get(current, 'originalError') ?? Reflect.get(current, 'cause');
  }
  return message;
}

/** Error message with its underlying causes (tool errors are wrapped by the action engine). */
function describeFailure(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 4) {
    if (!messages.includes(current.message)) {
      messages.push(current.message);
    }
    const inner: unknown = Reflect.get(current, 'originalError') ?? Reflect.get(current, 'cause');
    current = inner;
  }
  return messages.length > 0 ? messages.join(': ') : String(error);
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return JSON.stringify(result ?? null, null, 2);
}
