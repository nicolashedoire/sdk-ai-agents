import { knowledgeFindings } from './knowledge-findings.js';
import { toRecalledKnowledge } from './knowledge-records.js';
import type { KnowledgeStore } from './knowledge-store.js';
import type { MentalState } from './mental-state.js';
import { toError, truncate } from './operation-outcome.js';
import type { RecalledKnowledgeRecord } from './thought-patch.js';

export interface KnowledgeSettings {
  store: KnowledgeStore;
  /** What the knowledge is about: runs share what they learned only within a scope. */
  scope: string;
  /** Items recalled at the start of a run; 0 records without recalling. */
  recallLimit: number;
  /** Whether runs record what their tests established. */
  record: boolean;
}

export interface RecalledKnowledge {
  scope: string;
  items: RecalledKnowledgeRecord[];
  /** Why nothing could be recalled: the run goes on without memory. */
  error?: string;
}

/**
 * Connects a cognitive agent to its knowledge store. A failing store never stops a run:
 * the failure is recorded in the run's events instead.
 */
export class RunKnowledge {
  constructor(private readonly settings: KnowledgeSettings) {}

  async recall(goal: string): Promise<RecalledKnowledge> {
    const { store, scope, recallLimit } = this.settings;
    if (recallLimit === 0) return { scope, items: [] };
    try {
      const items = await store.recall({ scope, goal, limit: recallLimit });
      return { scope, items: items.slice(0, recallLimit).map(toRecalledKnowledge) };
    } catch (error) {
      return { scope, items: [], error: truncate(toError(error).message) };
    }
  }

  /** Records what the run's tests established; returns the data of the event to append. */
  async remember(state: MentalState, runId: string): Promise<Record<string, unknown> | undefined> {
    const { store, scope, record } = this.settings;
    if (!record) return undefined;
    const findings = knowledgeFindings(state, runId);
    if (findings.length === 0) return undefined;
    try {
      await store.record({ scope, runId, recordedAt: Date.now(), findings });
      return { scope, findings };
    } catch (error) {
      return { scope, findings, error: truncate(toError(error).message) };
    }
  }
}
