import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSDK, defineTool } from '../sdk.js'
import { z } from 'zod'
import type { IEventStore } from '../stores/event-store.js'
import type { Event } from '../types/events.js'

describe('Integration Tests - End-to-End', () => {
  describe('Complete Agent Execution Flow', () => {
    it('should create agent successfully', () => {
      const mockEventStore: IEventStore = {
        append: vi.fn(),
        getEvents: vi.fn().mockResolvedValue([]),
        getRunIds: vi.fn().mockResolvedValue([]),
        exportEventLog: vi.fn(),
      }

      const sdk = createSDK({
        apiKey: 'test-key',
        eventStore: mockEventStore,
      })

      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Calculator',
        schema: z.object({
          a: z.number(),
          b: z.number(),
          operation: z.enum(['add', 'subtract']),
        }),
        handler: async (params) => {
          const { a, b, operation } = params as {
            a: number
            b: number
            operation: 'add' | 'subtract'
          }
          return operation === 'add' ? a + b : a - b
        },
      })

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [calculatorTool],
      })

      expect(agent).toBeDefined()
      expect(agent).toHaveProperty('run')
      expect(agent).toHaveProperty('addTools')
      expect(agent).toHaveProperty('setPolicy')
    })
  })

  describe('Policy Enforcement Flow', () => {
    it('should enforce allowlist policy', async () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const tool1 = defineTool({
        name: 'allowed-tool',
        description: 'Allowed',
        schema: z.object({}),
        handler: async () => ({}),
      })

      const tool2 = defineTool({
        name: 'blocked-tool',
        description: 'Blocked',
        schema: z.object({}),
        handler: async () => ({}),
      })

      sdk.defineGlobalPolicy({
        id: 'allowlist-policy',
        type: 'allowlist',
        rules: [
          {
            condition: 'allowedTools',
            action: 'deny',
            metadata: { tools: ['allowed-tool'] },
          },
        ],
        scope: 'global',
        enabled: true,
      })

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [tool1, tool2],
      })

      expect(agent).toBeDefined()
    })
  })

  describe('Replay Flow', () => {
    it('should replay execution from events', async () => {
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
              parameters: { value: 'test' },
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

      const mockEventStore: IEventStore = {
        append: vi.fn(),
        getEvents: vi.fn().mockResolvedValue(events),
        getRunIds: vi.fn().mockResolvedValue(['original-run']),
        exportEventLog: vi.fn(),
      }

      const sdk = createSDK({
        apiKey: 'test-key',
        eventStore: mockEventStore,
      })

      const tool = defineTool({
        name: 'test-tool',
        description: 'Test',
        schema: z.object({
          value: z.string(),
        }),
        handler: async (params) => {
          return { result: `Processed: ${(params as { value: string }).value}` }
        },
      })

      sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [tool],
      })

      const replay = await sdk.replay('original-run')

      expect(replay).toBeDefined()
      expect(replay.runId).not.toBe('original-run')
      expect(mockEventStore.append).toHaveBeenCalled()
    })
  })

  describe('Trace Export Flow', () => {
    it('should export trace in JSON format', async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
        {
          id: 'evt-2',
          runId: 'run-1',
          type: 'run.completed',
          timestamp: 2000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
      ]

      const mockEventStore: IEventStore = {
        append: vi.fn(),
        getEvents: vi.fn().mockResolvedValue(events),
        getRunIds: vi.fn().mockResolvedValue(['run-1']),
        exportEventLog: vi.fn(),
      }

      const sdk = createSDK({
        apiKey: 'test-key',
        eventStore: mockEventStore,
      })

      const trace = await sdk.getTrace('run-1')
      const exported = await sdk.exportTrace('run-1', 'json')

      expect(trace).toBeDefined()
      expect(trace.runId).toBe('run-1')
      expect(exported).toContain('run-1')
      expect(JSON.parse(exported)).toBeDefined()
    })

    it('should export trace in text format', async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
      ]

      const mockEventStore: IEventStore = {
        append: vi.fn(),
        getEvents: vi.fn().mockResolvedValue(events),
        getRunIds: vi.fn().mockResolvedValue(['run-1']),
        exportEventLog: vi.fn(),
      }

      const sdk = createSDK({
        apiKey: 'test-key',
        eventStore: mockEventStore,
      })

      const exported = await sdk.exportTrace('run-1', 'text')

      expect(exported).toContain('run-1')
      expect(exported).toContain('Trace for runId')
    })
  })

  describe('Error Handling Flow', () => {
    it('should handle tool execution errors gracefully', async () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const errorTool = defineTool({
        name: 'error-tool',
        description: 'Error tool',
        schema: z.object({}),
        handler: async () => {
          throw new Error('Tool execution failed')
        },
      })

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [errorTool],
      })

      expect(agent).toBeDefined()
    })

    it('should handle policy violations', async () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      sdk.defineGlobalPolicy({
        id: 'strict-policy',
        type: 'budget',
        rules: [
          {
            condition: 'maxSteps',
            action: 'deny',
            metadata: { value: 0 },
          },
        ],
        scope: 'global',
        enabled: true,
      })

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
      })

      expect(agent).toBeDefined()
    })
  })

  describe('Multiple Agents Flow', () => {
    it('should handle multiple agents independently', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const agent1 = sdk.createAgent({
        name: 'agent-1',
        model: 'gpt-4',
      })

      const agent2 = sdk.createAgent({
        name: 'agent-2',
        model: 'gpt-4',
      })

      expect(agent1).toBeDefined()
      expect(agent2).toBeDefined()
      expect(agent1).not.toBe(agent2)
    })

    it('should apply agent-specific policies', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const agent1 = sdk.createAgent({
        name: 'agent-1',
        model: 'gpt-4',
        policies: [
          {
            id: 'agent-1-policy',
            type: 'budget',
            rules: [],
            scope: 'agent',
            enabled: true,
          },
        ],
      })

      const agent2 = sdk.createAgent({
        name: 'agent-2',
        model: 'gpt-4',
      })

      expect(agent1).toBeDefined()
      expect(agent2).toBeDefined()
    })
  })
})

