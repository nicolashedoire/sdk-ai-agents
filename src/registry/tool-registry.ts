import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ToolExecutionError, ToolNotFoundError, ValidationError } from '../errors/index.js';
import type { Tool, ToolCallContext, ToolDefinition, ToolResult } from '../types/tool.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  registerTool(definition: ToolDefinition): Tool {
    if (this.tools.has(definition.name)) {
      // One tool per name, whatever its version: a version does not make a second one.
      throw new Error(
        `Tool "${definition.name}" is already registered: a name is registered once, whatever its version. Give this tool another name (for example with a prefix), or use the registered one.`
      );
    }

    const tool: Tool = {
      id: uuidv4(),
      name: definition.name,
      description: definition.description,
      schema: definition.schema,
      handler: definition.handler,
      version: definition.version || '1.0.0',
      capability: definition.capability,
      metadata: definition.metadata,
      ...(definition.inputJsonSchema ? { inputJsonSchema: definition.inputJsonSchema } : {}),
      ...(definition.retry ? { retry: definition.retry } : {}),
    };

    this.tools.set(definition.name, tool);
    return tool;
  }

  /**
   * Registers the tools a caller was given (an agent's `tools`, a capability's tools), all or
   * none. A tool whose name is taken is accepted when it is that same tool (the object
   * `sdk.defineTool` returned, or a tool built from the same definition by `defineTool`), and
   * the registered one is used. Another tool with a taken name is refused with a
   * `ValidationError` naming `field`: calls run by name, so it would never run and the
   * registered one would. Returns the registered tools, in order.
   */
  registerOrReuse(definitions: readonly ToolDefinition[], field = 'tools'): Tool[] {
    const batch = new Map<string, ToolDefinition>();
    for (const definition of definitions) {
      const taken = this.tools.get(definition.name) ?? batch.get(definition.name);
      if (taken && !isSameTool(taken, definition)) {
        throw new ValidationError(
          field,
          `another tool named "${definition.name}" is already registered or given: calls run by name, so this one would never run. Give it another name (for example with a prefix), or pass the registered tool`
        );
      }
      batch.set(definition.name, taken ?? definition);
    }
    return definitions.map(
      (definition) => this.tools.get(definition.name) ?? this.registerTool(definition)
    );
  }

  getToolByVersion(name: string, version: string): Tool | null {
    const tool = this.tools.get(name);
    if (tool && tool.version === version) {
      return tool;
    }
    return null;
  }

  getToolsByCapability(capability: string): Tool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.capability === capability);
  }

  getTool(name: string): Tool | null {
    return this.tools.get(name) || null;
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  isToolAllowed(name: string, allowlist?: string[]): boolean {
    if (!this.tools.has(name)) {
      return false;
    }

    if (allowlist && !allowlist.includes(name)) {
      return false;
    }

    return true;
  }

  async executeTool(
    name: string,
    parameters: unknown,
    allowlist?: string[],
    context?: ToolCallContext
  ): Promise<ToolResult> {
    this.validateToolAccess(name, allowlist);

    const tool = this.getToolOrThrow(name);

    try {
      const validated = tool.schema.parse(parameters);
      const result = await tool.handler(validated, context);

      return {
        success: true,
        result,
      };
    } catch (error) {
      throw this.handleExecutionError(error, name, tool.schema, parameters);
    }
  }

  /**
   * Checks parameters against the tool's schema without running it. Returns the refusal, or
   * nothing when they are valid or the tool is unknown (reported when it is executed).
   */
  validateParameters(name: string, parameters: unknown): ValidationError | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;
    const parsed = tool.schema.safeParse(parameters);
    return parsed.success
      ? undefined
      : new ValidationError(name, this.formatZodErrors(parsed.error), tool.schema);
  }

  private validateToolAccess(name: string, allowlist?: string[]): void {
    if (!this.isToolAllowed(name, allowlist)) {
      throw new ToolNotFoundError(`Tool "${name}" is not declared or not in allowlist`);
    }
  }

  private getToolOrThrow(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(`Tool "${name}" not found`);
    }
    return tool;
  }

  private handleExecutionError(
    error: unknown,
    toolName: string,
    schema: z.ZodSchema,
    parameters: unknown
  ): Error {
    if (error instanceof z.ZodError) {
      return new ValidationError(toolName, this.formatZodErrors(error), schema);
    }

    if (error instanceof Error) {
      return new ToolExecutionError(toolName, error, parameters);
    }

    return new ToolExecutionError(toolName, new Error(String(error)), parameters);
  }

  private formatZodErrors(error: z.ZodError): string {
    return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }
}

/**
 * Whether `definition` is the tool `registered`: the same object, or one built from the same
 * definition (same handler, schema, texts, metadata, retry and version). A copy with other
 * metadata (an approval added or removed) is another tool.
 */
function isSameTool(registered: ToolDefinition, definition: ToolDefinition): boolean {
  if (registered === definition) return true;
  return (
    registered.handler === definition.handler &&
    registered.schema === definition.schema &&
    registered.description === definition.description &&
    (registered.version || '1.0.0') === (definition.version || '1.0.0') &&
    (registered.capability || undefined) === (definition.capability || undefined) &&
    registered.metadata === definition.metadata &&
    registered.retry === definition.retry &&
    registered.inputJsonSchema === definition.inputJsonSchema
  );
}
