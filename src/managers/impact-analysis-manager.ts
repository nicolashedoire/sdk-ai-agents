import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ImpactAnalysis } from '../types/impact-analysis.js';

export class ImpactAnalysisManager {
  private analysesDir: string;
  private analysesCache: Map<string, ImpactAnalysis> = new Map();

  constructor(analysesDir = './impact-analyses') {
    this.analysesDir = analysesDir;
    this.ensureAnalysesDir();
  }

  private async ensureAnalysesDir(): Promise<void> {
    try {
      await fs.mkdir(this.analysesDir, { recursive: true });
    } catch {
      // Ignore
    }
  }

  async saveAnalysis(analysis: ImpactAnalysis): Promise<void> {
    await this.ensureAnalysesDir();

    const filePath = join(this.analysesDir, `${analysis.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(analysis, null, 2), 'utf-8');

    this.analysesCache.set(analysis.id, analysis);
  }

  async getAnalysis(analysisId: string): Promise<ImpactAnalysis | null> {
    if (this.analysesCache.has(analysisId)) {
      return this.analysesCache.get(analysisId)!;
    }

    await this.ensureAnalysesDir();

    try {
      const filePath = join(this.analysesDir, `${analysisId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const analysis = JSON.parse(content) as ImpactAnalysis;
      this.analysesCache.set(analysisId, analysis);
      return analysis;
    } catch {
      return null;
    }
  }

  async deleteAnalysis(analysisId: string): Promise<boolean> {
    await this.ensureAnalysesDir();

    try {
      const filePath = join(this.analysesDir, `${analysisId}.json`);
      await fs.unlink(filePath);
      this.analysesCache.delete(analysisId);
      return true;
    } catch {
      return false;
    }
  }
}

