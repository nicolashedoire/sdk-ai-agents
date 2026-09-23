import type { Event } from '../types/events.js';

/** Drops events repeated with the same id (defensive against at-least-once stores). */
export function uniqueById(events: Event[]): Event[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}
