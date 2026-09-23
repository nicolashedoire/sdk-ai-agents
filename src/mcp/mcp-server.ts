import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '../types/tool.js';
import { zodSchemaToJsonSchema } from '../utils/zod-to-json-schema.js';

/** What the MCP server needs from the SDK: the tools and their governed execution. */
export interface GovernedToolHost {
  listTools(): Tool[];
  executeTool(
    name: string,
    parameters: Record<string, unknown>,
    options?: { agentId?: string; runId?: string; allowedTools?: string[] }
  ): Promise<unknown>;
}

export interface McpServerOptions {
  name: string;
  version?: string;
  /**
   * Tool names to expose. Required: nothing is exposed by default, so tools imported from
   * other MCP servers or meant for internal agents never leak to clients by accident.
   */
  tools: string[];
  /** Identity used for policies and traces of MCP calls. Defaults to `mcp:<name>`. */
  agentId?: string;
  /** Guidance shown to MCP clients about how to use this server. */
  instructions?: string;
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
  const server = new Server(
    { name: options.name, version: options.version ?? '1.0.0' },
    {
      capabilities: { tools: {} },
      ...(options.instructions ? { instructions: options.instructions } : {}),
    }
  );
  const agentId = options.agentId ?? `mcp:${options.name}`;
  const exposed = (): Tool[] =>
    host.listTools().filter((tool) => options.tools.includes(tool.name));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: exposed().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toObjectSchema(tool.inputJsonSchema ?? zodSchemaToJsonSchema(tool.schema)),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
        allowedTools: options.tools,
      });
      return { content: [{ type: 'text' as const, text: formatResult(result) }] };
    } catch (error) {
      const text = options.exposeErrorDetails
        ? describeFailure(error)
        : error instanceof Error
          ? error.message
          : 'Tool execution failed';
      return { isError: true, content: [{ type: 'text' as const, text }] };
    }
  });

  return server;
}

/** Starts an MCP server on stdin/stdout, the transport used by desktop and IDE clients. */
export async function serveMcpOverStdio(
  host: GovernedToolHost,
  options: McpServerOptions
): Promise<Server> {
  const server = createMcpServer(host, options);
  await server.connect(new StdioServerTransport());
  return server;
}

function toObjectSchema(schema: Record<string, unknown>): {
  type: 'object';
  [key: string]: unknown;
} {
  return { ...schema, type: 'object' };
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
