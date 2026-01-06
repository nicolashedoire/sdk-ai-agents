import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { FileEventStore } from '../stores/file-event-store.js'
import type { Event } from '../types/events.js'

describe('FileEventStore', () => {
  const testEventsDir = `./test-events-${Date.now()}`
  let store: FileEventStore

  beforeEach(async () => {
    try {
      await fs.rm(testEventsDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
    store = new FileEventStore(testEventsDir)
  })

  afterEach(async () => {
    store.destroy()
    try {
      await fs.rm(testEventsDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('append', () => {
    it('should append event successfully', async () => {
      const event: Event = {
        id: 'evt-1',
        runId: 'run-1',
        type: 'run.started',
        timestamp: Date.now(),
        data: { input: 'test' },
      }

      await store.append('run-1', event)
      await new Promise((resolve) => setTimeout(resolve, 150))

      const events = await store.getEvents('run-1')
      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('evt-1')
    })

    it('should auto-generate id and timestamp if missing', async () => {
      const event: Partial<Event> = {
        runId: 'run-2',
        type: 'run.started',
        data: {},
      }

      await store.append('run-2', event as Event)
      await new Promise((resolve) => setTimeout(resolve, 150))

      const events = await store.getEvents('run-2')
      expect(events).toHaveLength(1)
      expect(events[0].id).toBeDefined()
      expect(events[0].timestamp).toBeDefined()
    })
  })

  describe('getEvents', () => {
    beforeEach(async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
        },
        {
          id: 'evt-2',
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 2000,
          data: {},
        },
        {
          id: 'evt-3',
          runId: 'run-1',
          type: 'action.executed',
          timestamp: 3000,
          data: {},
        },
      ]

      for (const event of events) {
        await store.append('run-1', event)
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should return all events for runId', async () => {
      const events = await store.getEvents('run-1')
      expect(events).toHaveLength(3)
    })

    it('should filter by type', async () => {
      const events = await store.getEvents('run-1', {
        type: 'intention.generated',
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('intention.generated')
    })

    it('should filter by multiple types', async () => {
      const events = await store.getEvents('run-1', {
        type: ['run.started', 'action.executed'],
      })

      expect(events).toHaveLength(2)
    })

    it('should filter by timestamp range', async () => {
      const events = await store.getEvents('run-1', {
        since: 1500,
        until: 2500,
      })

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('evt-2')
    })

    it('should limit results', async () => {
      const events = await store.getEvents('run-1', {
        limit: 2,
      })

      expect(events).toHaveLength(2)
    })

    it('should return empty array for non-existent runId', async () => {
      const events = await store.getEvents('non-existent')
      expect(events).toHaveLength(0)
    })
  })

  describe('getRunIds', () => {
    beforeEach(async () => {
      await store.append('run-1', {
        id: 'evt-1',
        runId: 'run-1',
        type: 'run.started',
        timestamp: 1000,
        data: {},
      })

      await store.append('run-2', {
        id: 'evt-2',
        runId: 'run-2',
        type: 'run.started',
        timestamp: 2000,
        data: {},
      })

      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should return all runIds', async () => {
      const runIds = await store.getRunIds()
      expect(runIds.length).toBeGreaterThanOrEqual(2)
      expect(runIds).toContain('run-1')
      expect(runIds).toContain('run-2')
    })

    it('should filter by timestamp', async () => {
      const runIds = await store.getRunIds({
        since: 1500,
      })

      expect(runIds).toContain('run-2')
      expect(runIds).not.toContain('run-1')
    })
  })

  describe('exportEventLog', () => {
    beforeEach(async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: { input: 'test' },
          metadata: { agentId: 'agent-1', agentVersion: '1.0.0' },
        },
        {
          id: 'evt-2',
          runId: 'run-1',
          type: 'run.completed',
          timestamp: 2000,
          data: { output: 'result' },
          metadata: { agentId: 'agent-1' },
        },
      ]

      for (const event of events) {
        await store.append('run-1', event)
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should export complete event log', async () => {
      const log = await store.exportEventLog('run-1')

      expect(log.runId).toBe('run-1')
      expect(log.agentId).toBe('agent-1')
      expect(log.version).toBe('1.0.0')
      expect(log.events).toHaveLength(2)
      expect(log.summary.totalEvents).toBe(2)
      expect(log.status).toBe('completed')
    })

    it('should throw error for non-existent runId', async () => {
      await expect(store.exportEventLog('non-existent')).rejects.toThrow()
    })
  })
})

