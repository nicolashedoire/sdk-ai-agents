import { createSDK, defineTool } from '../src/index.js'
import { z } from 'zod'

async function main() {
  const sdk = createSDK({
    apiKey: process.env.OPENAI_API_KEY || '',
  })

  const calculatorTool = defineTool({
    name: 'calculator',
    description: 'Performs basic arithmetic operations',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number(),
      b: z.number(),
    }),
    handler: async (params) => {
      const { operation, a, b } = params as {
        operation: 'add' | 'subtract' | 'multiply' | 'divide'
        a: number
        b: number
      }

      switch (operation) {
        case 'add':
          return a + b
        case 'subtract':
          return a - b
        case 'multiply':
          return a * b
        case 'divide':
          if (b === 0) throw new Error('Division by zero')
          return a / b
        default:
          throw new Error(`Unknown operation: ${operation}`)
      }
    },
  })

  const agent = sdk.createAgent({
    name: 'math-assistant',
    model: 'gpt-5.4',
    tools: [calculatorTool],
    maxSteps: 5,
    timeout: 30000,
    systemPrompt: 'You are a helpful math assistant. Use the calculator tool to perform calculations.',
  })

  console.log('Running agent...')
  const result = await agent.run({
    message: 'What is 15 * 23?',
  })

  console.log('Result:', result)
  console.log('Run ID:', result.runId)
  console.log('Status:', result.status)
  console.log('Output:', result.output)

  if (result.runId) {
    console.log('\nGetting trace...')
    const trace = await sdk.getTrace(result.runId)
    console.log('Trace summary:', trace.summary)
    console.log('Total events:', trace.events.length)

    console.log('\nReplaying execution...')
    const replay = await sdk.replay(result.runId)
    console.log('Replay result:', replay.output)
  }
}

main().catch(console.error)


