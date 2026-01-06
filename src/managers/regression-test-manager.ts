import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { RegressionTestSuite } from '../types/regression-test.js';

export class RegressionTestManager {
  private testSuitesDir: string;
  private testSuitesCache: Map<string, RegressionTestSuite> = new Map();

  constructor(testSuitesDir = './regression-test-suites') {
    this.testSuitesDir = testSuitesDir;
    this.ensureTestSuitesDir();
  }

  private async ensureTestSuitesDir(): Promise<void> {
    try {
      await fs.mkdir(this.testSuitesDir, { recursive: true });
    } catch {
      // Ignore
    }
  }

  async createTestSuite(
    agentId: string,
    config: {
      name: string;
      goldenTraces: Array<{
        goldenTraceId: string;
        name: string;
        input: unknown;
        tags?: string[];
      }>;
    }
  ): Promise<RegressionTestSuite> {
    await this.ensureTestSuitesDir();

    const suite: RegressionTestSuite = {
      id: uuidv4(),
      name: config.name,
      agentId,
      goldenTraces: config.goldenTraces,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const filePath = join(this.testSuitesDir, `${suite.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(suite, null, 2), 'utf-8');

    this.testSuitesCache.set(suite.id, suite);

    return suite;
  }

  async getTestSuite(suiteId: string): Promise<RegressionTestSuite | null> {
    if (this.testSuitesCache.has(suiteId)) {
      return this.testSuitesCache.get(suiteId)!;
    }

    await this.ensureTestSuitesDir();

    try {
      const filePath = join(this.testSuitesDir, `${suiteId}.json`);
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

  async getTestSuites(agentId?: string): Promise<RegressionTestSuite[]> {
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

          if (!agentId || suite.agentId === agentId) {
            suites.push(suite);
            this.testSuitesCache.set(suite.id, suite);
          }
        } catch {
          // Ignore invalid files
        }
      }

      return suites.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  async deleteTestSuite(suiteId: string): Promise<boolean> {
    await this.ensureTestSuitesDir();

    try {
      const filePath = join(this.testSuitesDir, `${suiteId}.json`);
      await fs.unlink(filePath);
      this.testSuitesCache.delete(suiteId);
      return true;
    } catch {
      return false;
    }
  }
}

