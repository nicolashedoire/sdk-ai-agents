import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ToolExecutionError, ToolNotFoundError, ValidationError } from '../errors/index.js';
import type { Tool, ToolCallContext, ToolDefinition, ToolResult } from '../types/tool.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  registerTool(definition: ToolDefinition): Tool {
    if (this.tools.has(definition.name)) {
      const existingTool = this.tools.get(definition.name);
      if (existingTool) {
        if (existingTool.version !== (definition.version || '1.0.0')) {
          throw new Error(
            `Tool "${definition.name}" is already registered with version ${existingTool.version}. Use a different version or unregister first.`
          );
        }
      }
      throw new Error(`Tool "${definition.name}" is already registered`);
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
