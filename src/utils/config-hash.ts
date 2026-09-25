import { createHash } from 'node:crypto';
import type { ZodTypeAny } from 'zod';
import type { Agent } from '../types/agent.js';
import { stableJson } from './stable-json.js';
import { zodSchemaToJsonSchema } from './zod-to-json-schema.js';

/**
 * Hash of what makes a governed agent behave as it does: its name, model, system prompt, run
 * limits (`maxSteps`, `timeout`), provider settings (temperature, max tokens…), `version`,
 * capabilities, its tools (name, description, version, the parameter schema the model sees,
 * metadata, retry settings) and its own policies with their rules and limits. Handlers and
 * other functions are not part of it. Global policies are not either: they are the SDK's.
 */
export function computeConfigHash(
  agent: Pick<
    Agent,
    'name' | 'model' | 'config' | 'tools' | 'policies' | 'version' | 'capabilities'
  >
): string {
  const { config } = agent;
  const described = {
    name: agent.name,
    model: agent.model,
    systemPrompt: config.systemPrompt,
    maxSteps: config.maxSteps,
    timeout: config.timeout,
    providerSettings: config.providerSettings,
    version: agent.version,
    capabilities: agent.capabilities,
    tools: agent.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      version: tool.version,
      parameters: tool.inputJsonSchema ?? zodSchemaToJsonSchema(tool.schema as ZodTypeAny),
      capability: tool.capability,
      metadata: tool.metadata,
      retry: tool.retry,
    })),
    policies: agent.policies,
  };
  return createHash('sha256').update(stableJson(described)).digest('hex').slice(0, 16);
}
