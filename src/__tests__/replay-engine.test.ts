import { describe, it, expect, beforeEach } from 'vitest'
import { ReplayEngine } from '../engines/replay-engine.js'
import { ActionEngine } from '../engines/action-engine.js'
import { PolicyEngine } from '../engines/policy-engine.js'
import { ToolRegistry } from '../registry/tool-registry.js'
import { FileEventStore } from '../stores/file-event-store.js'
import type { Event } from '../types/events.js'
import { z } from 'zod'

describe('ReplayEngine', () => {
  let replayEngine: ReplayEngine
  let eventStore: FileEventStore
  let actionEngine: ActionEngine
  let toolRegistry: ToolRegistry

  beforeEach(() => {
    eventStore = new FileEventStore('./test-events')
    const policyEngine = new PolicyEngine()
    toolRegistry = new ToolRegistry()
    actionEngine = new ActionEngine(policyEngine, toolRegistry, eventStore)
    replayEngine = new ReplayEngine(eventStore, actionEngine)

    toolRegistry.registerTool({
      name: 'test-tool',
      description: 'Test tool',
      schema: z.object({
        value: z.string(),
      }),
      handler: async (params) => {
        return { result: `Processed: ${(params as { value: string }).value}` }
      },
    })
  })

  describe('replay', () => {
    beforeEach(async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'original-run',
          type: 'run.started',
          timestamp: 1000,
          data: { input: { message: 'test' } },
          metadata: { agentId: 'agent-1' },
        },
        {
          id: 'evt-2',
          runId: 'original-run',
          type: 'intention.generated',
          timestamp: 2000,
          data: {
            intention: {
              type: 'tool_call',
              toolName: 'test-tool',
              parameters: { value: 'original' },
            },
          },
          metadata: { agentId: 'agent-1' },
        },
        {
          id: 'evt-3',
          runId: 'original-run',
          type: 'run.completed',
          timestamp: 3000,
          data: { output: 'result' },
          metadata: { agentId: 'agent-1' },
        },
      ]

      for (const event of events) {
        await eventStore.append('original-run', event)
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should replay execution successfully', async () => {
      const result = await replayEngine.replay('original-run')
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(result.status).toBe('completed')
      expect(result.runId).not.toBe('original-run')

      const replayEvents = await eventStore.getEvents(result.runId)
      expect(replayEvents.length).toBeGreaterThan(0)
      expect(replayEvents.some((e) => e.type === 'run.started')).toBe(true)
    })

    it('should use original intentions without calling LLM', async () => {
      const result = await replayEngine.replay('original-run')

      const replayEvents = await eventStore.getEvents(result.runId)
      const toolCalls = replayEvents.filter((e) => e.type === 'tool.called')

      expect(toolCalls.length).toBeGreaterThan(0)
      expect(toolCalls[0].data.toolName).toBe('test-tool')
    })

    it('should support modifications', async () => {
      const result = await replayEngine.replay('original-run', {
        input: { message: 'modified input' },
      })

      const replayEvents = await eventStore.getEvents(result.runId)
      const startEvent = replayEvents.find((e) => e.type === 'run.started')

      expect(startEvent).toBeDefined()
      expect(startEvent?.data.input).toMatchObject({ message: 'modified input' })
    })
  })

  describe('canReplay', () => {
    it('should return true if events exist', async () => {
      await eventStore.append('test-run', {
        id: 'evt-1',
        runId: 'test-run',
        type: 'run.started',
        timestamp: Date.now(),
        data: {},
      })
      await new Promise((resolve) => setTimeout(resolve, 150))

      const canReplay = await replayEngine.canReplay('test-run')
      expect(canReplay).toBe(true)
    })

    it('should return false if no events exist', async () => {
      const canReplay = await replayEngine.canReplay('non-existent')
      expect(canReplay).toBe(false)
    })
  })
})

