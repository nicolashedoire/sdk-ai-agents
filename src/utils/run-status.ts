import type { Event, RunStatus } from '../types/events.js';

const TERMINAL_STATUSES: Partial<Record<Event['type'], RunStatus>> = {
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.cancelled': 'cancelled',
};

/**
 * Derives a run status from its events. The latest lifecycle event wins, so events appended
 * after the end of a run (such as `cognition.feedback`) do not reopen it.
 */
export function deriveRunStatus(events: Event[]): RunStatus {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    const status = event ? TERMINAL_STATUSES[event.type] : undefined;
    if (status) {
      return status;
    }
  }
  return events.some((event) => event.type === 'run.started') ? 'running' : 'pending';
}
