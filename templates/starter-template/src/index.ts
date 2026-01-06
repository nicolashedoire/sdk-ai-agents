import { createSDK } from '@sdk-ai-agents/core';
import { z } from 'zod';
import { defineTool } from '@sdk-ai-agents/core';

async function main() {
  console.log('🚀 Starting AI Agent...\n');

  const sdk = createSDK({
    apiKey: process.env.OPENAI_API_KEY || '',
  });

  const calculatorTool = defineTool({
    name: 'calculator',
    description: 'Performs basic arithmetic operations',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    handler: async (params: {
      operation: 'add' | 'subtract' | 'multiply' | 'divide';
      a: number;
      b: number;
    }) => {
      const { operation, a, b } = params;

      switch (operation) {
        case 'add':
          return { result: a + b };
        case 'subtract':
          return { result: a - b };
        case 'multiply':
          return { result: a * b };
        case 'divide':
          if (b === 0) throw new Error('Division by zero');
          return { result: a / b };
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    },
    version: '1.0.0',
  });

  const agent = sdk.createAgent({
    name: 'math-assistant',
    model: 'gpt-4',
    tools: [calculatorTool],
    maxSteps: 5,
    timeout: 30000,
    systemPrompt: 'You are a helpful math assistant. Use the calculator tool to perform calculations.',
  });

  console.log('Running agent...');
  const result = await agent.run({
    message: 'What is 15 * 23?',
  });

  console.log('\n✅ Result:', result);
  console.log('Run ID:', result.runId);
  console.log('Status:', result.status);
  if (result.output) {
    console.log('Output:', result.output);
  }

  if (result.runId) {
    console.log('\n📊 Getting trace...');
    const trace = await sdk.getTrace(result.runId);
    console.log('Trace summary:', trace.summary);

    console.log('\n🔄 Replaying execution...');
    const replay = await sdk.replay(result.runId);
    console.log('Replay result:', replay.output);
  }
}

main().catch(console.error);

