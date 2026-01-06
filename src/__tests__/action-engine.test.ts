import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ActionEngine } from '../engines/action-engine.js'
import { PolicyEngine } from '../engines/policy-engine.js'
import { ToolRegistry } from '../registry/tool-registry.js'
import { FileEventStore } from '../stores/file-event-store.js'
import { PolicyViolationError } from '../errors/index.js'
import type { Intention, ActionContext } from '../types/run.js'
import { z } from 'zod'

describe('ActionEngine', () => {
  let actionEngine: ActionEngine
  let policyEngine: PolicyEngine
  let toolRegistry: ToolRegistry
  let eventStore: FileEventStore

  beforeEach(() => {
    eventStore = new FileEventStore('./test-events')
    policyEngine = new PolicyEngine()
    toolRegistry = new ToolRegistry()
    actionEngine = new ActionEngine(policyEngine, toolRegistry, eventStore)

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

  describe('executeIntention - tool_call', () => {
    it('should execute tool call successfully', async () => {
      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
        parameters: { value: 'test' },
      }

      const context: ActionContext = {
        runId: 'run-1',
        agentId: 'agent-1',
      }

      const result = await actionEngine.executeIntention(intention, context)

      expect(result.success).toBe(true)
      expect(result.result).toMatchObject({
        result: 'Processed: test',
      })

      const events = await eventStore.getEvents('run-1')
      expect(events.some((e) => e.type === 'tool.called')).toBe(true)
      expect(events.some((e) => e.type === 'action.executed')).toBe(true)
    })

    it('should check policy before execution', async () => {
      policyEngine.applyGlobalPolicy({
        id: 'policy-1',
        type: 'allowlist',
        rules: [
          {
            condition: 'allowedTools',
            action: 'deny',
            metadata: { tools: ['other-tool'] },
          },
        ],
        scope: 'global',
        enabled: true,
      })

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'test-tool',
        parameters: { value: 'test' },
      }

      const context: ActionContext = {
        runId: 'run-2',
        agentId: 'agent-1',
      }

      await expect(
        actionEngine.executeIntention(intention, context)
      ).rejects.toThrow(PolicyViolationError)

      const events = await eventStore.getEvents('run-2')
      expect(events.some((e) => e.type === 'policy.checked')).toBe(true)
      expect(events.some((e) => e.type === 'policy.violated')).toBe(true)
    })

    it('should handle tool execution errors', async () => {
      toolRegistry.registerTool({
        name: 'error-tool',
        description: 'Error tool',
        schema: z.object({}),
        handler: async () => {
          throw new Error('Tool error')
        },
      })

      const intention: Intention = {
        type: 'tool_call',
        toolName: 'error-tool',
        parameters: {},
      }

      const context: ActionContext = {
        runId: 'run-3',
        agentId: 'agent-1',
      }

      await expect(
        actionEngine.executeIntention(intention, context)
      ).rejects.toThrow()

      const events = await eventStore.getEvents('run-3')
      expect(events.some((e) => e.type === 'action.failed')).toBe(true)
    })
  })

  describe('executeIntention - final_answer', () => {
    it('should return final answer', async () => {
      const intention: Intention = {
        type: 'final_answer',
        reasoning: 'This is the answer',
      }

      const context: ActionContext = {
        runId: 'run-4',
        agentId: 'agent-1',
      }

      const result = await actionEngine.executeIntention(intention, context)

      expect(result.success).toBe(true)
      expect(result.result).toBe('This is the answer')
    })
  })

  describe('executeIntention - continue', () => {
    it('should return success for continue', async () => {
      const intention: Intention = {
        type: 'continue',
      }

      const context: ActionContext = {
        runId: 'run-5',
        agentId: 'agent-1',
      }

      const result = await actionEngine.executeIntention(intention, context)

      expect(result.success).toBe(true)
    })
  })
})


