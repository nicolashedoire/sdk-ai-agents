import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Assertion, AssertionOptions } from '../types/assertion.js';
import { fileInFolder } from '../utils/file-in-folder.js';

/**
 * Assertions are saved as JSON files in `assertionsDir`, except `custom` ones: their evaluator
 * is a function, which a file cannot hold. Those live in this manager only, for the life of
 * the SDK instance that defined them.
 */
export class AssertionManager {
  private assertionsDir: string;
  private assertionsCache: Map<string, Assertion> = new Map();
  /** `custom` assertions, never written to disk. */
  private inMemory: Map<string, Assertion> = new Map();

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
    options: AssertionOptions = {}
  ): Promise<Assertion> {
    const assertion: Assertion = {
      id: uuidv4(),
      name,
      description: options.description,
      condition,
      severity: options.severity || 'error',
      tags: options.tags,
      agentId: options.agentId,
      agentName: options.agentName,
      createdAt: Date.now(),
    };

    if (condition.type === 'custom') {
      this.inMemory.set(assertion.id, assertion);
      return assertion;
    }

    await this.ensureAssertionsDir();
    const filePath = fileInFolder(this.assertionsDir, assertion.id, '.json', 'id');
    await fs.writeFile(filePath, JSON.stringify(assertion, null, 2), 'utf-8');

    this.assertionsCache.set(assertion.id, assertion);

    return assertion;
  }

  async getAssertion(assertionId: string): Promise<Assertion | null> {
    const cached = this.inMemory.get(assertionId) ?? this.assertionsCache.get(assertionId);
    if (cached) {
      return cached;
    }

    await this.ensureAssertionsDir();

    try {
      const filePath = fileInFolder(this.assertionsDir, assertionId, '.json', 'id');
      const content = await fs.readFile(filePath, 'utf-8');
      const assertion = JSON.parse(content) as Assertion;
      this.assertionsCache.set(assertionId, assertion);
      return assertion;
    } catch {
      return null;
    }
  }

  /**
   * Saved and in-memory assertions, newest first. `matchesAgent` keeps those of one agent;
   * `tags` those with at least one of the tags.
   */
  async getAssertions(
    matchesAgent?: (assertion: Assertion) => boolean,
    tags?: string[]
  ): Promise<Assertion[]> {
    await this.ensureAssertionsDir();

    const assertions: Assertion[] = [...this.inMemory.values()];
    try {
      const files = await fs.readdir(this.assertionsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(this.assertionsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const assertion = JSON.parse(content) as Assertion;
          assertions.push(assertion);
          this.assertionsCache.set(assertion.id, assertion);
        } catch {
          // Ignore invalid files
        }
      }
    } catch {
      // No folder: only the in-memory assertions.
    }

    return assertions
      .filter((assertion) => !matchesAgent || matchesAgent(assertion))
      .filter(
        (assertion) =>
          !tags || tags.length === 0 || tags.some((tag) => assertion.tags?.includes(tag))
      )
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  }

  async deleteAssertion(assertionId: string): Promise<boolean> {
    if (this.inMemory.delete(assertionId)) {
      return true;
    }

    await this.ensureAssertionsDir();

    try {
      const filePath = fileInFolder(this.assertionsDir, assertionId, '.json', 'id');
      await fs.unlink(filePath);
      this.assertionsCache.delete(assertionId);
      return true;
    } catch {
      return false;
    }
  }
}
