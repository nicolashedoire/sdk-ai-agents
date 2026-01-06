import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function generateRunId(): string {
  return `run_${uuidv4()}`;
}

export function generateEventId(): string {
  return `evt_${uuidv4()}`;
}
