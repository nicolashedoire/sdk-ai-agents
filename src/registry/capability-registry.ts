import { v4 as uuidv4 } from 'uuid';
import type { Capability } from '../types/tool.js';

export interface CapabilityDefinition {
  name: string;
  description: string;
  tools: string[];
  version?: string;
  metadata?: Record<string, unknown>;
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  registerCapability(definition: CapabilityDefinition): Capability {
    if (this.capabilities.has(definition.name)) {
      throw new Error(`Capability "${definition.name}" is already registered`);
    }

    const capability: Capability = {
      id: uuidv4(),
      name: definition.name,
      description: definition.description,
      tools: definition.tools,
      version: definition.version || '1.0.0',
      metadata: definition.metadata,
    };

    this.capabilities.set(definition.name, capability);
    return capability;
  }

  getCapability(name: string): Capability | null {
    return this.capabilities.get(name) || null;
  }

  getAllCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  getToolsByCapability(capabilityName: string): string[] {
    const capability = this.capabilities.get(capabilityName);
    return capability ? capability.tools : [];
  }

  getCapabilitiesByTool(toolName: string): Capability[] {
    return Array.from(this.capabilities.values()).filter((cap) => cap.tools.includes(toolName));
  }

  unregisterCapability(name: string): boolean {
    return this.capabilities.delete(name);
  }

  clear(): void {
    this.capabilities.clear();
  }
}
