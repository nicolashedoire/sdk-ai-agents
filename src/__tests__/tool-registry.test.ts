import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from '../registry/tool-registry.js'
import { ToolNotFoundError, ValidationError, ToolExecutionError } from '../errors/index.js'

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe('registerTool', () => {
    it('should register a tool successfully', () => {
      const tool = registry.registerTool({
        name: 'test-tool',
        description: 'A test tool',
        schema: z.object({
          input: z.string(),
        }),
        handler: async (params) => {
          return { result: params }
        },
      })

      expect(tool.name).toBe('test-tool')
      expect(tool.description).toBe('A test tool')
      expect(registry.getTool('test-tool')).not.toBeNull()
    })

    it('should throw error if tool already exists', () => {
      registry.registerTool({
        name: 'duplicate',
        description: 'First',
        schema: z.object({}),
        handler: async () => ({}),
      })

      expect(() => {
        registry.registerTool({
          name: 'duplicate',
          description: 'Second',
          schema: z.object({}),
          handler: async () => ({}),
        })
      }).toThrow('already registered')
    })
  })

  describe('getTool', () => {
    it('should return tool if exists', () => {
      registry.registerTool({
        name: 'exists',
        description: 'Exists',
        schema: z.object({}),
        handler: async () => ({}),
      })

      const tool = registry.getTool('exists')
      expect(tool).not.toBeNull()
      expect(tool?.name).toBe('exists')
    })

    it('should return null if tool does not exist', () => {
      const tool = registry.getTool('not-exists')
      expect(tool).toBeNull()
    })
  })

  describe('isToolAllowed', () => {
    beforeEach(() => {
      registry.registerTool({
        name: 'allowed',
        description: 'Allowed',
        schema: z.object({}),
        handler: async () => ({}),
      })

      registry.registerTool({
        name: 'not-allowed',
        description: 'Not allowed',
        schema: z.object({}),
        handler: async () => ({}),
      })
    })

    it('should return true if tool exists and no allowlist', () => {
      expect(registry.isToolAllowed('allowed')).toBe(true)
    })

    it('should return true if tool is in allowlist', () => {
      expect(registry.isToolAllowed('allowed', ['allowed'])).toBe(true)
    })

    it('should return false if tool not in allowlist', () => {
      expect(registry.isToolAllowed('not-allowed', ['allowed'])).toBe(false)
    })

    it('should return false if tool does not exist', () => {
      expect(registry.isToolAllowed('unknown')).toBe(false)
    })
  })

  describe('executeTool', () => {
    beforeEach(() => {
      registry.registerTool({
        name: 'calculator',
        description: 'Calculator',
        schema: z.object({
          a: z.number(),
          b: z.number(),
          operation: z.enum(['add', 'subtract']),
        }),
        handler: async (params) => {
          const { a, b, operation } = params as { a: number; b: number; operation: 'add' | 'subtract' }
          if (operation === 'add') return a + b
          return a - b
        },
      })
    })

    it('should execute tool successfully with valid parameters', async () => {
      const result = await registry.executeTool('calculator', {
        a: 5,
        b: 3,
        operation: 'add',
      })

      expect(result.success).toBe(true)
      expect(result.result).toBe(8)
    })

    it('should throw ValidationError for invalid parameters', async () => {
      await expect(
        registry.executeTool('calculator', {
          a: 'invalid',
          b: 3,
          operation: 'add',
        })
      ).rejects.toThrow(ValidationError)
    })

    it('should throw ToolNotFoundError for undeclared tool', async () => {
      await expect(
        registry.executeTool('unknown', {})
      ).rejects.toThrow(ToolNotFoundError)
    })

    it('should respect allowlist', async () => {
      await expect(
        registry.executeTool('calculator', { a: 1, b: 2, operation: 'add' }, ['other'])
      ).rejects.toThrow(ToolNotFoundError)
    })

    it('should handle tool handler errors', async () => {
      registry.registerTool({
        name: 'error-tool',
        description: 'Error tool',
        schema: z.object({}),
        handler: async () => {
          throw new Error('Handler error')
        },
      })

      await expect(
        registry.executeTool('error-tool', {})
      ).rejects.toThrow(ToolExecutionError)
    })
  })

  describe('unregisterTool', () => {
    it('should unregister tool successfully', () => {
      registry.registerTool({
        name: 'to-remove',
        description: 'To remove',
        schema: z.object({}),
        handler: async () => ({}),
      })

      expect(registry.unregisterTool('to-remove')).toBe(true)
      expect(registry.getTool('to-remove')).toBeNull()
    })

    it('should return false if tool does not exist', () => {
      expect(registry.unregisterTool('not-exists')).toBe(false)
    })
  })

  describe('clear', () => {
    it('should clear all tools', () => {
      registry.registerTool({
        name: 'tool1',
        description: 'Tool 1',
        schema: z.object({}),
        handler: async () => ({}),
      })

      registry.registerTool({
        name: 'tool2',
        description: 'Tool 2',
        schema: z.object({}),
        handler: async () => ({}),
      })

      registry.clear()

      expect(registry.getAllTools()).toHaveLength(0)
    })
  })
})

