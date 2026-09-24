import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Assertion } from '../types/assertion.js';

export class AssertionManager {
  private assertionsDir: string;
  private assertionsCache: Map<string, Assertion> = new Map();

  constructor(assertionsDir = './assertions') {
    // Created on first use, not at start-up: an SDK used only for tools (an MCP server
    // started from any working directory) leaves no empty folders behind.
    this.assertionsDir = assertionsDir;
  }

  private async ensureAssertionsDir(): Promise<void> {
    try {
      await fs.mkdir(this.assertionsDir, { recursive: true });
    } catch {
      // Ignore
    }
  }

  async createAssertion(
    name: string,
    condition: Assertion['condition'],
    options: {
      description?: string;
      severity?: 'error' | 'warning';
      tags?: string[];
      agentId?: string;
    } = {}
  ): Promise<Assertion> {
    await this.ensureAssertionsDir();

    const assertion: Assertion = {
      id: uuidv4(),
      name,
      description: options.description,
      condition,
      severity: options.severity || 'error',
      tags: options.tags,
      agentId: options.agentId,
      createdAt: Date.now(),
    };

    const filePath = join(this.assertionsDir, `${assertion.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(assertion, null, 2), 'utf-8');

    this.assertionsCache.set(assertion.id, assertion);

    return assertion;
  }

  async getAssertion(assertionId: string): Promise<Assertion | null> {
    const cached = this.assertionsCache.get(assertionId);
    if (cached) {
      return cached;
    }

    await this.ensureAssertionsDir();

    try {
      const filePath = join(this.assertionsDir, `${assertionId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const assertion = JSON.parse(content) as Assertion;
      this.assertionsCache.set(assertionId, assertion);
      return assertion;
    } catch {
      return null;
    }
  }

  async getAssertions(agentId?: string, tags?: string[]): Promise<Assertion[]> {
    await this.ensureAssertionsDir();

    try {
      const files = await fs.readdir(this.assertionsDir);
      const assertions: Assertion[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(this.assertionsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const assertion = JSON.parse(content) as Assertion;

          if (agentId && assertion.agentId !== agentId) {
            continue;
          }

          if (tags && tags.length > 0) {
            const hasMatchingTag = tags.some((tag) => assertion.tags?.includes(tag));
            if (!hasMatchingTag) {
              continue;
            }
          }

          assertions.push(assertion);
          this.assertionsCache.set(assertion.id, assertion);
        } catch {
          // Ignore invalid files
        }
      }

      return assertions.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async deleteAssertion(assertionId: string): Promise<boolean> {
    await this.ensureAssertionsDir();

    try {
      const filePath = join(this.assertionsDir, `${assertionId}.json`);
      await fs.unlink(filePath);
      this.assertionsCache.delete(assertionId);
      return true;
    } catch {
      return false;
    }
  }
}
