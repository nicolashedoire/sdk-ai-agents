/**
 * Quick Test with Real API
 *
 * Minimal test to validate that the SDK works with a real API key
 */

import { createSDK, defineTool } from '../src/index.js';
import { z } from 'zod';

async function test() {
  console.log('🧪 Testing with real API...\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not defined');
    process.exit(1);
  }

  // 1. Initialization
  console.log('1️⃣  Initializing the SDK...');
  const sdk = createSDK({ apiKey });
  console.log('✅ SDK initialized\n');

  // 2. Defining a simple tool
  console.log('2️⃣  Defining a tool...');
  const calculatorTool = sdk.defineTool({
    name: 'calculator',
    description: 'Performs basic arithmetic operations',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number(),
      b: z.number(),
    }),
    handler: async (params) => {
      const { operation, a, b } = params as {
        operation: 'add' | 'subtract' | 'multiply' | 'divide';
        a: number;
        b: number;
      };
      switch (operation) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return b !== 0 ? a / b : 'Error: Division by zero';
      }
    },
  });
  console.log(`✅ Tool created: ${calculatorTool.name}\n`);

  // 3. Creating an agent
  console.log('3️⃣  Creating an agent...');
  const agent = sdk.createAgent({
    name: 'test-agent',
    model: 'gpt-5.4',
    tools: [calculatorTool],
    maxSteps: 3,
    timeout: 30000,
  });
  console.log('✅ Agent created\n');

  // 4. Simple execution
  console.log('4️⃣  Running the agent...');
  console.log('   Question: "What is 15 * 23?"\n');

  try {
    const result = await agent.run({
      message: 'What is 15 * 23?',
    });

    console.log(`✅ Execution completed!`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Run ID: ${result.runId}`);
    if (result.output) {
      console.log(`   Response: ${result.output.substring(0, 200)}...`);
    }
    console.log('');

    // 5. Retrieving the trace
    console.log('5️⃣  Retrieving the trace...');
    const trace = await sdk.getTrace(result.runId);
    console.log(`✅ Trace retrieved:`);
    console.log(`   - Events: ${trace.summary.totalEvents}`);
    console.log(`   - Duration: ${trace.summary.duration}ms`);
    console.log(`   - Intentions: ${trace.summary.intentionsGenerated}`);
    console.log(`   - Actions: ${trace.summary.actionsExecuted}`);
    console.log(`   - Tools called: ${trace.summary.toolsCalled}`);
    console.log('');

    // 6. Replay
    console.log('6️⃣  Replaying the execution...');
    const replayResult = await sdk.replay(result.runId);
    console.log(`✅ Replay completed!`);
    console.log(`   Status: ${replayResult.status}`);
    if (replayResult.output) {
      console.log(`   Response: ${replayResult.output.substring(0, 200)}...`);
    }
    console.log('');

    console.log('✨ All tests passed successfully! 🎉');

  } catch (error) {
    console.error('❌ Error during execution:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    } else {
      console.error('   Unknown error:', error);
    }
    process.exit(1);
  }
}

test().catch(console.error);
