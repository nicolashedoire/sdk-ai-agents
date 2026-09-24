import { AgentImpl } from '../../agent.js';
import { ActionEngine } from '../../engines/action-engine.js';
import { PolicyEngine } from '../../engines/policy-engine.js';
import { ReasoningEngine } from '../../engines/reasoning-engine.js';
import type { LLMProvider } from '../../providers/llm-provider.js';
import { ToolRegistry } from '../../registry/tool-registry.js';
import type { IEventStore } from '../../stores/event-store.js';
import type { Tool } from '../../types/tool.js';

/** A governed agent named `support`, assembled by hand on `store`, outside any SDK. */
export function handBuiltAgent(
  store: IEventStore,
  provider: LLMProvider,
  tools: Tool[] = []
): AgentImpl {
  const policyEngine = new PolicyEngine();
  const registry = new ToolRegistry();
  for (const tool of tools) registry.registerTool(tool);
  return new AgentImpl(
    {
      id: 'agent-1',
      name: 'support',
      model: 'test-model',
      tools,
      policies: [],
      config: { name: 'support', model: 'test-model' },
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
    },
    new ReasoningEngine(provider, 'test-model'),
    new ActionEngine(policyEngine, registry, store),
    policyEngine,
    store
  );
}
