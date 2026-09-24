import type { LiveEventListener } from '../types/events.js';
import type { ResourceContent } from '../types/resource.js';
import type { Tool, ToolDefinition } from '../types/tool.js';

/**
 * What the MCP server needs from the SDK: the tools, their governed execution, and a traced
 * read of resources. `createSDK()` returns an object that implements it.
 */
export interface GovernedToolHost {
  listTools(): Tool[];
  /** Registers a tool definition (used for the definitions passed in `tools`). */
  defineTool(definition: ToolDefinition): Tool;
  executeTool(
    name: string,
    parameters: Record<string, unknown>,
    options?: {
      agentId?: string;
      runId?: string;
      allowedTools?: string[];
      signal?: AbortSignal;
      approvalTimeoutMs?: number;
      /** The call's live events, used to send progress notifications. */
      onEvent?: LiveEventListener;
    }
  ): Promise<unknown>;
  /** Reads a resource as its own run in the event log. */
  traceResourceRead(
    uri: string,
    read: () => Promise<ResourceContent>,
    options?: { agentId?: string }
  ): Promise<ResourceContent>;
}
