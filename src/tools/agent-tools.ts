import { z } from 'zod';
import type { CognitiveAgent } from '../cognition/cognitive-agent.js';
import type { RunInput, RunResult } from '../types/run.js';
import type { ToolDefinition, ToolMetadata } from '../types/tool.js';
import { toToolName } from './tool-names.js';

export interface AgentToolOptions {
  /** Tool name. Default: `ask_<agent name>`. */
  name?: string;
  /** What the agent is good at, shown to the model or client that picks tools. */
  description?: string;
  /** Default: medium risk (the agent calls a language model, which costs money). */
  metadata?: ToolMetadata;
  /** Longest problem or message accepted. Default 4 000 characters. */
  maxInputLength?: number;
}

/** What the tool of a cognitive agent returns: the decision, without the whole mental state. */
export interface CognitiveAgentToolResult {
  runId: string;
  /** `completed`, `failed` or `cancelled`. */
  status: string;
  /** `committed`, `provisional` or `abstain`. */
  decisionStatus?: string;
  answer?: string;
  rationale?: string;
  confidence?: number;
  /** What was not established (provisional or abstained decisions). */
  missing?: string[];
  nextActions?: string[];
  error?: string;
}

const DEFAULT_METADATA: ToolMetadata = { category: 'agent', riskLevel: 'medium' };

/**
 * Exposes a cognitive agent as a tool: another agent, or an MCP client such as Claude
 * Desktop, can ask it to reason about a problem and get its decision back.
 *
 * ```ts
 * const twin = sdk.createCognitiveAgent({ name: 'nicolas', model: 'gpt-4o', profile });
 * const tool = cognitiveAgentTool(twin, { description: 'How Nicolas would decide' });
 * ```
 */
export function cognitiveAgentTool(
  agent: Pick<CognitiveAgent, 'name' | 'think'>,
  options: AgentToolOptions = {}
): ToolDefinition {
  const schema = z.object({
    problem: z
      .string()
      .min(1)
      .max(options.maxInputLength ?? 4_000)
      .describe('The question, problem or decision to reason about, with what matters'),
    context: z
      .record(z.unknown())
      .optional()
      .describe('Facts and constraints the agent should take into account'),
  });
  return {
    name: options.name ?? toToolName(`ask_${agent.name}`),
    description:
      options.description ??
      `Asks the "${agent.name}" agent to reason about a problem. It answers with a decision (committed, provisional or abstain), its rationale, confidence and what is missing.`,
    schema,
    capability: `agent:${agent.name}`,
    metadata: options.metadata ?? DEFAULT_METADATA,
    handler: async ({ problem, context }: z.infer<typeof schema>, call) => {
      const result = await agent.think({
        problem,
        ...(context ? { context } : {}),
        ...(call?.signal ? { signal: call.signal } : {}),
      });
      const decision = result.decision;
      const summary: CognitiveAgentToolResult = { runId: result.runId, status: result.status };
      if (decision) {
        summary.answer = decision.answer;
        summary.rationale = decision.rationale;
        summary.confidence = decision.confidence;
        summary.nextActions = decision.nextActions;
        if (decision.status) summary.decisionStatus = decision.status;
        if (decision.missing && decision.missing.length > 0) summary.missing = decision.missing;
      }
      if (result.error) summary.error = result.error.message;
      return summary;
    },
  };
}

/** What the tool of a governed agent returns. */
export interface GovernedAgentToolResult {
  runId: string;
  status: string;
  output?: string;
  error?: string;
}

/**
 * Exposes a governed agent (`sdk.createAgent`) as a tool that runs it on a message.
 *
 * ```ts
 * const support = sdk.createAgent({ name: 'support', model: 'gpt-4o', tools });
 * const tool = governedAgentTool(support, { description: 'Answers customer questions' });
 * ```
 */
export function governedAgentTool(
  agent: { readonly name: string; run(input: RunInput): Promise<RunResult> },
  options: AgentToolOptions = {}
): ToolDefinition {
  const schema = z.object({
    message: z
      .string()
      .min(1)
      .max(options.maxInputLength ?? 4_000)
      .describe('What to ask the agent'),
    context: z.record(z.unknown()).optional().describe('Extra data for the agent'),
  });
  return {
    name: options.name ?? toToolName(`ask_${agent.name}`),
    description:
      options.description ?? `Runs the "${agent.name}" agent on a message and returns its answer.`,
    schema,
    capability: `agent:${agent.name}`,
    metadata: options.metadata ?? DEFAULT_METADATA,
    handler: async ({ message, context }: z.infer<typeof schema>) => {
      const result = await agent.run({ message, ...(context ? { context } : {}) });
      const summary: GovernedAgentToolResult = { runId: result.runId, status: result.status };
      if (result.output !== undefined) summary.output = result.output;
      if (result.error) summary.error = result.error.message;
      return summary;
    },
  };
}
