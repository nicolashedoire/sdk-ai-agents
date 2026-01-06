import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSDK, defineTool } from '../sdk.js'
import { z } from 'zod'

describe('SDK', () => {
  describe('createSDK', () => {
    it('should create SDK instance', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      expect(sdk).toBeDefined()
      expect(sdk.createAgent).toBeDefined()
      expect(sdk.defineTool).toBeDefined()
      expect(sdk.replay).toBeDefined()
      expect(sdk.getTrace).toBeDefined()
    })

    it('should use custom event store if provided', () => {
      const customStore = {
        append: vi.fn(),
        getEvents: vi.fn(),
        getRunIds: vi.fn(),
        exportEventLog: vi.fn(),
      }

      const sdk = createSDK({
        apiKey: 'test-key',
        eventStore: customStore as any,
      })

      expect(sdk).toBeDefined()
    })

    it('should apply default policies if provided', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
        defaultPolicies: [
          {
            id: 'default-1',
            type: 'budget',
            rules: [],
            scope: 'global',
            enabled: true,
          },
        ],
      })

      expect(sdk).toBeDefined()
    })
  })

  describe('createAgent', () => {
    it('should create agent successfully', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
      })

      expect(agent).toBeDefined()
    })

    it('should register tools when creating agent', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const tool = defineTool({
        name: 'test-tool',
        description: 'Test',
        schema: z.object({}),
        handler: async () => ({}),
      })

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [tool],
      })

      expect(agent).toBeDefined()
    })
  })

  describe('defineTool', () => {
    it('should define tool successfully', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      const tool = sdk.defineTool({
        name: 'calculator',
        description: 'Calculator',
        schema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        handler: async (params) => {
          const { a, b } = params as { a: number; b: number }
          return a + b
        },
      })

      expect(tool.name).toBe('calculator')
    })
  })

  describe('defineGlobalPolicy', () => {
    it('should define global policy', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
      })

      sdk.defineGlobalPolicy({
        id: 'policy-1',
        type: 'budget',
        rules: [],
        scope: 'global',
        enabled: true,
      })

      expect(sdk).toBeDefined()
    })
  })
})

describe('defineTool', () => {
  it('should create tool definition', () => {
    const tool = defineTool({
      name: 'test',
      description: 'Test tool',
      schema: z.object({}),
      handler: async () => ({}),
    })

    expect(tool.name).toBe('test')
  })
})

