import { promises as fs } from 'node:fs';
import type { ImpactAnalysis } from '../types/impact-analysis.js';
import { fileInFolder } from '../utils/file-in-folder.js';

export class ImpactAnalysisManager {
  private analysesDir: string;
  private analysesCache: Map<string, ImpactAnalysis> = new Map();

  constructor(analysesDir = './impact-analyses') {
    // Created on first use, not at start-up: an SDK used only for tools (an MCP server
    // started from any working directory) leaves no empty folders behind.
    this.analysesDir = analysesDir;
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

    const filePath = fileInFolder(this.analysesDir, analysis.id, '.json', 'id');
    await fs.writeFile(filePath, JSON.stringify(analysis, null, 2), 'utf-8');

    this.analysesCache.set(analysis.id, analysis);
  }

  async getAnalysis(analysisId: string): Promise<ImpactAnalysis | null> {
    const cached = this.analysesCache.get(analysisId);
    if (cached) {
      return cached;
    }

    await this.ensureAnalysesDir();

    try {
      const filePath = fileInFolder(this.analysesDir, analysisId, '.json', 'id');
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
      const filePath = fileInFolder(this.analysesDir, analysisId, '.json', 'id');
      await fs.unlink(filePath);
      this.analysesCache.delete(analysisId);
      return true;
    } catch {
      return false;
    }
  }
}
