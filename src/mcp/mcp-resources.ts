import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ValidationError } from '../errors/index.js';
import type { ResourceProvider } from '../types/resource.js';
import type { GovernedToolHost } from './governed-tool-host.js';

/**
 * Serves resources: lists every provider's resources and routes each read to the provider
 * that handles its URI. Every read, refused ones included, is a run in the event log.
 */
export function serveResources(
  server: Server,
  host: GovernedToolHost,
  providers: ResourceProvider[],
  options: { agentId: string; exposeErrorDetails: boolean }
): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      return {
        resources: (await Promise.all(providers.map((provider) => provider.list()))).flat(),
      };
    } catch (error) {
      // Causes (a folder's absolute path, a permission error) stay on the server.
      const message =
        options.exposeErrorDetails || error instanceof ValidationError
          ? error instanceof Error
            ? error.message
            : String(error)
          : 'Resources could not be listed';
      throw new McpError(ErrorCode.InternalError, message);
    }
  });
  // Some clients ask for templates even when a server has none.
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const provider = providers.find((candidate) => candidate.handles(uri));
    try {
      const content = await host.traceResourceRead(
        uri,
        () =>
          provider ? provider.read(uri) : Promise.reject(new Error(`Unknown resource ${uri}`)),
        { agentId: options.agentId }
      );
      return {
        contents: [
          {
            uri: content.uri,
            text: content.text,
            ...(content.mimeType ? { mimeType: content.mimeType } : {}),
          },
        ],
      };
    } catch (error) {
      // Refusals (outside the folder, not found…) say why; other causes stay in the event log.
      const message =
        options.exposeErrorDetails || error instanceof ValidationError || !provider
          ? error instanceof Error
            ? error.message
            : String(error)
          : `Resource ${uri} could not be read`;
      throw new McpError(ErrorCode.InvalidParams, message);
    }
  });
}
