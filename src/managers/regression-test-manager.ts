import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { RegressionTestSuite } from '../types/regression-test.js';
import { fileInFolder } from '../utils/file-in-folder.js';

export class RegressionTestManager {
  private testSuitesDir: string;
  private testSuitesCache: Map<string, RegressionTestSuite> = new Map();
  /** Suites created here get increasing times, so their order survives the same millisecond. */
  private lastCreatedAt = 0;

  constructor(testSuitesDir = './regression-test-suites') {
    // Created on first use, not at start-up: an SDK used only for tools (an MCP server
    // started from any working directory) leaves no empty folders behind.
    this.testSuitesDir = testSuitesDir;
  }

  private async ensureTestSuitesDir(): Promise<void> {
    try {
      await fs.mkdir(this.testSuitesDir, { recursive: true });
    } catch {
      // Ignore
    }
  }

  async createTestSuite(
    agent: { id: string; name?: string },
    config: {
      name: string;
      goldenTraces: RegressionTestSuite['goldenTraces'];
    }
  ): Promise<RegressionTestSuite> {
    await this.ensureTestSuitesDir();

    const createdAt = Math.max(Date.now(), this.lastCreatedAt + 1);
    this.lastCreatedAt = createdAt;
    const suite: RegressionTestSuite = {
      id: uuidv4(),
      name: config.name,
      agentId: agent.id,
      ...(agent.name !== undefined ? { agentName: agent.name } : {}),
      goldenTraces: config.goldenTraces,
      createdAt,
      updatedAt: createdAt,
    };

    const filePath = fileInFolder(this.testSuitesDir, suite.id, '.json', 'id');
    await fs.writeFile(filePath, JSON.stringify(suite, null, 2), 'utf-8');

    this.testSuitesCache.set(suite.id, suite);

    return suite;
  }

  async getTestSuite(suiteId: string): Promise<RegressionTestSuite | null> {
    const cached = this.testSuitesCache.get(suiteId);
    if (cached) {
      return cached;
    }

    await this.ensureTestSuitesDir();

    try {
      const filePath = fileInFolder(this.testSuitesDir, suiteId, '.json', 'id');
      const content = await fs.readFile(filePath, 'utf-8');
      const suite = JSON.parse(content) as RegressionTestSuite;
      this.testSuitesCache.set(suiteId, suite);
      return suite;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      return null;
    }
  }

  /** Suites of the folder, newest first; `matchesAgent` keeps those of one agent. */
  async getTestSuites(
    matchesAgent?: (suite: RegressionTestSuite) => boolean
  ): Promise<RegressionTestSuite[]> {
    await this.ensureTestSuitesDir();

    try {
      const files = await fs.readdir(this.testSuitesDir);
      const suites: RegressionTestSuite[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = join(this.testSuitesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const suite = JSON.parse(content) as RegressionTestSuite;

          if (!matchesAgent || matchesAgent(suite)) {
            suites.push(suite);
            this.testSuitesCache.set(suite.id, suite);
          }
        } catch {
          // Ignore invalid files
        }
      }

      return suites.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    } catch {
      return [];
    }
  }

  async deleteTestSuite(suiteId: string): Promise<boolean> {
    await this.ensureTestSuitesDir();

    try {
      const filePath = fileInFolder(this.testSuitesDir, suiteId, '.json', 'id');
      await fs.unlink(filePath);
      this.testSuitesCache.delete(suiteId);
      return true;
    } catch {
      return false;
    }
  }
}
