import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { GoldenTrace, GoldenTraceConfig } from '../types/golden-trace.js';
import type { Trace } from '../types/sdk.js';

export class GoldenTraceManager {
  private goldenTracesDir: string;
  private goldenTracesCache: Map<string, GoldenTrace> = new Map();

  constructor(goldenTracesDir = './golden-traces') {
    this.goldenTracesDir = goldenTracesDir;
    this.ensureGoldenTracesDir();
  }

  private async ensureGoldenTracesDir(): Promise<void> {
    try {
      await fs.mkdir(this.goldenTracesDir, { recursive: true });
    } catch (error) {
      this.handleError('Failed to create golden traces directory', error);
    }
  }

  private handleError(message: string, error: unknown): void {
    console.error(`${message}:`, error);
  }

  async createGoldenTrace(
    runId: string,
    trace: Trace,
    config: GoldenTraceConfig
  ): Promise<GoldenTrace> {
    await this.ensureGoldenTracesDir();

    const goldenTrace: GoldenTrace = {
      id: uuidv4(),
      name: config.name,
      description: config.description,
      runId,
      agentId: trace.agentId,
      createdAt: Date.now(),
      trace,
      metadata: config.metadata,
    };

    const filePath = join(this.goldenTracesDir, `${goldenTrace.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(goldenTrace, null, 2), 'utf-8');

    this.goldenTracesCache.set(goldenTrace.id, goldenTrace);

    return goldenTrace;
  }

  async getGoldenTrace(goldenTraceId: string): Promise<GoldenTrace | null> {
    const cached = this.goldenTracesCache.get(goldenTraceId);
    if (cached) {
      return cached;
    }

    try {
      const filePath = join(this.goldenTracesDir, `${goldenTraceId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const goldenTrace = JSON.parse(content) as GoldenTrace;
      this.goldenTracesCache.set(goldenTraceId, goldenTrace);
      return goldenTrace;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.handleError('Failed to read golden trace', error);
      return null;
    }
  }

  async getGoldenTraces(agentId?: string): Promise<GoldenTrace[]> {
    await this.ensureGoldenTracesDir();

    try {
      const files = await fs.readdir(this.goldenTracesDir);
      const goldenTraces: GoldenTrace[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(this.goldenTracesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const goldenTrace = JSON.parse(content) as GoldenTrace;

          if (!agentId || goldenTrace.agentId === agentId) {
            goldenTraces.push(goldenTrace);
            this.goldenTracesCache.set(goldenTrace.id, goldenTrace);
          }
        } catch (error) {
          this.handleError(`Failed to read golden trace file ${file}`, error);
        }
      }

      return goldenTraces.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      this.handleError('Failed to list golden traces', error);
      return [];
    }
  }

  async deleteGoldenTrace(goldenTraceId: string): Promise<boolean> {
    await this.ensureGoldenTracesDir();

    try {
      const filePath = join(this.goldenTracesDir, `${goldenTraceId}.json`);
      await fs.unlink(filePath);
      this.goldenTracesCache.delete(goldenTraceId);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      this.handleError('Failed to delete golden trace', error);
      return false;
    }
  }

  async exportGoldenTrace(
    goldenTraceId: string,
    format: 'json' | 'yaml' = 'json'
  ): Promise<string> {
    await this.ensureGoldenTracesDir();

    const goldenTrace = await this.getGoldenTrace(goldenTraceId);
    if (!goldenTrace) {
      throw new Error(`Golden trace ${goldenTraceId} not found`);
    }

    if (format === 'json') {
      return JSON.stringify(goldenTrace, null, 2);
    }

    if (format === 'yaml') {
      return this.toYAML(goldenTrace);
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  private toYAML(obj: unknown, indent = 0): string {
    const indentStr = '  '.repeat(indent);
    if (obj === null || obj === undefined) {
      return 'null';
    }
    if (typeof obj === 'string') {
      const escaped = obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      if (obj.includes(':') || obj.includes('-') || obj.trim() !== obj || obj === '') {
        return `"${escaped}"`;
      }
      return obj;
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj);
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map((item) => `${indentStr}- ${this.toYAML(item, indent + 1)}`).join('\n');
    }
    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      if (entries.length === 0) return '{}';
      return entries
        .map(([key, value]) => {
          const valueStr = this.toYAML(value, indent + 1);
          if (valueStr.includes('\n') && !valueStr.startsWith('"')) {
            return `${indentStr}${key}:\n${valueStr}`;
          }
          return `${indentStr}${key}: ${valueStr}`;
        })
        .join('\n');
    }
    return String(obj);
  }
}
