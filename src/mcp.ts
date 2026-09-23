/**
 * MCP connectors, published as `@sdk-ai-agents/core/mcp` so the core package does not
 * require `@modelcontextprotocol/sdk` unless you use them.
 */
export { createMcpServer, serveMcpOverStdio } from './mcp/mcp-server.js';
export type { GovernedToolHost, McpServerOptions } from './mcp/mcp-server.js';
export { connectMcpServer } from './mcp/mcp-client.js';
export type { ConnectMcpOptions, McpConnection, McpTransportConfig } from './mcp/mcp-client.js';
