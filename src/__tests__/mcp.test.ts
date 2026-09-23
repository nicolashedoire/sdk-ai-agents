import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { connectMcpServer, createMcpServer } from '../mcp.js';
import { json } from './support/scripted-llm-provider.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

const customerSchema = z.object({ customerId: z.string() });

function defineCrmTools(env: TestSDK): void {
  env.sdk.defineTool({
    name: 'lookup_customer',
    description: 'Returns the plan and churn risk of a customer',
    schema: customerSchema,
    handler: async (params) => ({ customerId: customerSchema.parse(params).customerId, plan: 'enterprise', churnRisk: 'low' }),
  });
  env.sdk.defineTool({
    name: 'delete_customer',
    description: 'Deletes a customer',
    schema: customerSchema,
    handler: async () => {
      throw new Error('deletion is disabled');
    },
  });
}

async function linkedClient(env: TestSDK, tools: string[], exposeErrorDetails = false) {
  const server = createMcpServer(env.sdk, { name: 'acme-crm', tools, exposeErrorDetails });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

describe('MCP connectors', () => {
  const environments: TestSDK[] = [];
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
    for (const env of environments.splice(0)) await env.dispose();
  });

  it('exposes SDK tools to any MCP client and governs every call', async () => {
    const env = createTestSDK();
    environments.push(env);
    defineCrmTools(env);
    const { client, server } = await linkedClient(env, ['lookup_customer']);
    closers.push(() => client.close(), () => server.close());

    const listed = await client.listTools();
    expect(listed.tools).toEqual([
      {
        name: 'lookup_customer',
        description: 'Returns the plan and churn risk of a customer',
        inputSchema: { type: 'object', properties: { customerId: { type: 'string' } }, required: ['customerId'], additionalProperties: false },
      },
    ]);

    const result = await client.callTool({ name: 'lookup_customer', arguments: { customerId: 'c-42' } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(String((result.content as Array<{ text: string }>)[0]?.text))).toEqual({
      customerId: 'c-42',
      plan: 'enterprise',
      churnRisk: 'low',
    });

    const hidden = await client.callTool({ name: 'delete_customer', arguments: { customerId: 'c-42' } });
    expect(hidden).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Tool "delete_customer" is not exposed by this server' }] });

    const invalid = await client.callTool({ name: 'lookup_customer', arguments: { customerId: 42 } });
    expect(invalid.isError).toBe(true);
  });

  it('traces MCP calls as runs of the MCP identity', async () => {
    const env = createTestSDK();
    environments.push(env);
    defineCrmTools(env);
    const { client, server } = await linkedClient(env, ['lookup_customer', 'delete_customer']);
    closers.push(() => client.close(), () => server.close());

    const failed = await client.callTool({ name: 'delete_customer', arguments: { customerId: 'c-1' } });
    // Internal causes stay in the event log unless the server opts in.
    expect(failed).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Tool execution failed: delete_customer' }],
    });
    const detailed = await linkedClient(env, ['delete_customer'], true);
    closers.push(() => detailed.client.close(), () => detailed.server.close());
    const explained = await detailed.client.callTool({ name: 'delete_customer', arguments: { customerId: 'c-1' } });
    expect(explained).toMatchObject({
      content: [{ type: 'text', text: 'Tool execution failed: delete_customer: deletion is disabled' }],
    });

    const runIds = await env.store.getRunIds();
    const events = (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat();
    expect(events.find((event) => event.type === 'run.started')?.metadata?.agentId).toBe('mcp:acme-crm');
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['policy.checked', 'tool.called', 'action.failed', 'run.failed']));
  });

  it('imports tools from an MCP server so a cognitive agent can use them', async () => {
    const crm = createTestSDK();
    environments.push(crm);
    defineCrmTools(crm);
    const server = createMcpServer(crm.sdk, { name: 'acme-crm', tools: ['lookup_customer'] });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const connection = await connectMcpServer({
      name: 'crm',
      transport: { type: 'custom', transport: clientTransport },
      toolPrefix: 'crm_',
      metadata: { riskLevel: 'low' },
    });
    closers.push(() => connection.close(), () => server.close());
    expect(connection.tools.map((tool) => [tool.name, tool.capability])).toEqual([['crm_lookup_customer', 'mcp:crm']]);

    const assistant = createTestSDK();
    environments.push(assistant);
    scriptBuildOrBuy(assistant.provider)
      .always('tool-selection', { toolCall: { name: 'crm_lookup_customer', arguments: { customerId: 'c-42' } } })
      .always(
        'integrate',
        json({
          summary: 'CRM says low risk',
          addFacts: [{ statement: 'Customer c-42 is enterprise with low churn risk', source: 'tool', confidence: 0.9 }],
          resolveUnknowns: [{ unknownId: 'U1', resolution: 'low churn risk' }],
        })
      );
    const tools = connection.tools.map((definition) => assistant.sdk.defineTool(definition));
    const agent = assistant.sdk.createCognitiveAgent({ name: 'account-manager', model: 'test-model', tools });

    const result = await agent.think({ problem: 'Should we offer c-42 a discount?' });

    expect(result.status).toBe('completed');
    expect(result.state.facts.map((fact) => fact.statement)).toContain('Customer c-42 is enterprise with low churn risk');
    const toolSelection = assistant.provider.requests.find((request) => request.tools?.length);
    expect(toolSelection?.tools?.[0]?.function).toMatchObject({
      name: 'crm_lookup_customer',
      parameters: { type: 'object', properties: { customerId: { type: 'string' } } },
    });
  });
});
