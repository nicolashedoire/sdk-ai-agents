import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentImpl } from '../agent.js'
import { ReasoningEngine } from '../engines/reasoning-engine.js'
import { ActionEngine } from '../engines/action-engine.js'
import { PolicyEngine } from '../engines/policy-engine.js'
import { ToolRegistry } from '../registry/tool-registry.js'
import { FileEventStore } from '../stores/file-event-store.js'
import { OpenAIProvider } from '../providers/openai-provider.js'
import type { Agent } from '../types/agent.js'
import { z } from 'zod'

describe('AgentImpl', () => {
  let agent: AgentImpl
  let reasoningEngine: ReasoningEngine
  let actionEngine: ActionEngine
  let policyEngine: PolicyEngine
  let eventStore: FileEventStore
  let agentData: Agent

  beforeEach(() => {
    eventStore = new FileEventStore('./test-events')
    policyEngine = new PolicyEngine()
    const toolRegistry = new ToolRegistry()
    actionEngine = new ActionEngine(policyEngine, toolRegistry, eventStore)
    const provider = new OpenAIProvider('test-key', 'gpt-4')
    reasoningEngine = new ReasoningEngine(provider, 'gpt-4')

    // The agent is given this tool: a governed agent may only run its own tools.
    const testTool = toolRegistry.registerTool({
      name: 'test-tool',
      description: 'Test tool',
      schema: z.object({
        value: z.string(),
      }),
      handler: async (params) => {
        return { result: `Processed: ${(params as { value: string }).value}` }
      },
    })

    agentData = {
      id: 'agent-1',
      name: 'test-agent',
      model: 'gpt-4',
      tools: [testTool],
      policies: [],
      config: {
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 5,
        timeout: 30000,
      },
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      configHash: 'test-hash',
    }

    agent = new AgentImpl(
      agentData,
      reasoningEngine,
      actionEngine,
      policyEngine,
      eventStore
    )
  })

  describe('run', () => {
    it('should create run with events', async () => {
      const mockGenerateIntention = vi
        .spyOn(reasoningEngine, 'generateIntention')
        .mockResolvedValue({
          type: 'final_answer',
          reasoning: 'Test answer',
        })

      const result = await agent.run({
        message: 'test input',
      })

      expect(result.runId).toBeDefined()
      expect(result.status).toBe('completed')
      expect(mockGenerateIntention).toHaveBeenCalled()

      const events = await eventStore.getEvents(result.runId)
      expect(events.some((e) => e.type === 'run.started')).toBe(true)
      expect(events.some((e) => e.type === 'run.completed')).toBe(true)

      mockGenerateIntention.mockRestore()
    })

    it('should respect maxSteps', async () => {
      agentData.config.maxSteps = 2

      const mockGenerateIntention = vi
        .spyOn(reasoningEngine, 'generateIntention')
        .mockResolvedValue({
          type: 'continue',
        })

      const result = await agent.run({
        message: 'test',
      })

      expect(result.status).toBe('failed')
      expect(result.error?.message).toContain('Max steps')

      mockGenerateIntention.mockRestore()
    })

    it('should respect timeout', async () => {
      agentData.config.timeout = 100

      const mockGenerateIntention = vi
        .spyOn(reasoningEngine, 'generateIntention')
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    type: 'continue',
                  }),
                200
              )
            )
        )

      const result = await agent.run({
        message: 'test',
      })

      expect(result.status).toBe('failed')

      mockGenerateIntention.mockRestore()
    })

    it('should handle tool calls in loop', async () => {
      let callCount = 0
      const mockGenerateIntention = vi
        .spyOn(reasoningEngine, 'generateIntention')
        .mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({
              type: 'tool_call',
              toolName: 'test-tool',
              parameters: { value: 'test' },
            })
          }
          return Promise.resolve({
            type: 'final_answer',
            reasoning: 'Done',
          })
        })

      const result = await agent.run({
        message: 'test',
      })

      expect(result.status).toBe('completed')
      expect(callCount).toBe(2)

      mockGenerateIntention.mockRestore()
    })
  })

  describe('addTools', () => {
    it('should add tools to agent', () => {
      const tool = {
        id: 'tool-1',
        name: 'new-tool',
        description: 'New tool',
        schema: z.object({}),
        handler: async () => ({}),
        version: '1.0.0',
      }

      agent.addTools([tool])

      expect(agentData.tools).toContain(tool)
    })
  })

  describe('setPolicy', () => {
    it('should add policy to agent', () => {
      const policy = {
        id: 'policy-1',
        type: 'budget' as const,
        rules: [],
        scope: 'agent' as const,
        enabled: true,
      }

      agent.setPolicy(policy)

      expect(agentData.policies).toContain(policy)
    })
  })
})

