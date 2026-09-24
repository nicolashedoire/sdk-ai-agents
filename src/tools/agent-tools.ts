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
  /**
   * Governance metadata, merged field by field over the default: medium risk (the agent
   * calls a language model, which costs money).
   */
  metadata?: ToolMetadata;
  /** Longest problem or message accepted. Default 4 000 characters. */
  maxInputLength?: number;
  /** Longest `context`, as JSON text. Default 20 000 characters. */
  maxContextLength?: number;
  /**
   * Put the error message of a failed run in the result. Off by default: messages can hold
   * internal details (provider errors); they are always in the event log.
   */
  exposeErrors?: boolean;
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
    context: boundedContext(options).describe(
      'Facts and constraints the agent should take into account'
    ),
  });
  return {
    name: options.name ?? toToolName(`ask_${agent.name}`),
    description:
      options.description ??
      `Asks the "${agent.name}" agent to reason about a problem. It answers with a decision (committed, provisional or abstain), its rationale, confidence and what is missing.`,
    schema,
    capability: `agent:${agent.name}`,
    metadata: mergedMetadata(options),
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
      if (result.error) summary.error = errorText(result.runId, result.error, options);
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
    context: boundedContext(options).describe('Extra data for the agent'),
  });
  return {
    name: options.name ?? toToolName(`ask_${agent.name}`),
    description:
      options.description ?? `Runs the "${agent.name}" agent on a message and returns its answer.`,
    schema,
    capability: `agent:${agent.name}`,
    metadata: mergedMetadata(options),
    handler: async ({ message, context }: z.infer<typeof schema>, call) => {
      const result = await agent.run({
        message,
        ...(context ? { context } : {}),
        // When the caller gives up, the run stops and a pending approval is cancelled.
        ...(call?.signal ? { signal: call.signal } : {}),
      });
      const summary: GovernedAgentToolResult = { runId: result.runId, status: result.status };
      if (result.output !== undefined) summary.output = result.output;
      if (result.error) summary.error = errorText(result.runId, result.error, options);
      return summary;
    },
  };
}

/** An optional object argument whose JSON text stays under `maxContextLength`. */
function boundedContext(options: AgentToolOptions) {
  const max = options.maxContextLength ?? 20_000;
  return z
    .record(z.unknown())
    .refine((value) => JSON.stringify(value).length <= max, {
      message: `context is longer than ${max} characters (as JSON)`,
    })
    .optional();
}

function mergedMetadata(options: AgentToolOptions): ToolMetadata {
  const given = options.metadata ?? {};
  return {
    category: given.category ?? DEFAULT_METADATA.category,
    riskLevel: given.riskLevel ?? DEFAULT_METADATA.riskLevel,
    ...(given.requiresApproval !== undefined ? { requiresApproval: given.requiresApproval } : {}),
    ...(given.readOnly !== undefined ? { readOnly: given.readOnly } : {}),
  };
}

function errorText(runId: string, error: Error, options: AgentToolOptions): string {
  return options.exposeErrors
    ? error.message
    : `the run did not complete; the reason is in the event log (run ${runId})`;
}
