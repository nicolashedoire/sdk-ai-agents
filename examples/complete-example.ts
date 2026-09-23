/**
 * Complete Example - SDK_AI_Agents
 *
 * This example demonstrates all the main MVP features:
 * - Creating an SDK and an agent
 * - Defining tools with Zod validation
 * - Creating capabilities
 * - Configuring policies
 * - Running an agent with tracing
 * - Replaying an execution
 * - Stopping an execution
 * - Exporting traces
 */

import { createSDK, defineTool } from '../src/index.js';
import { z } from 'zod';

async function main() {
  console.log('🚀 SDK_AI_Agents - Complete Example\n');

  // 1. SDK Initialization
  console.log('📦 1. Initializing the SDK...');
  const sdk = createSDK({
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
  });
  console.log('✅ SDK initialized\n');

  // 2. Defining tools with Zod validation
  console.log('🔧 2. Defining tools...');

  const calculatorTool = sdk.defineTool({
    name: 'calculator',
    description: 'Performs basic arithmetic operations',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    handler: async (params) => {
      const { operation, a, b } = params as {
        operation: 'add' | 'subtract' | 'multiply' | 'divide';
        a: number;
        b: number;
      };
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
      }
    },
    version: '1.0.0',
  });

  const weatherTool = sdk.defineTool({
    name: 'get_weather',
    description: 'Gets the current weather for a location',
    schema: z.object({
      location: z.string().describe('City name'),
      unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
    }),
    handler: async (params) => {
      const { location, unit } = params as {
        location: string;
        unit: 'celsius' | 'fahrenheit';
      };
      // Simulation - in a real case, call a weather API
      return {
        location,
        temperature: unit === 'celsius' ? 22 : 72,
        condition: 'sunny',
        unit,
      };
    },
    version: '1.0.0',
  });

  console.log(`✅ Tools defined: ${calculatorTool.name}, ${weatherTool.name}\n`);

  // 3. Creating a capability
  console.log('🎯 3. Creating a capability...');

  const mathCapability = sdk.defineCapability({
    name: 'math',
    description: 'Mathematical operations capability',
    tools: [calculatorTool], // Auto-registration of tools
    version: '1.0.0',
  });

  console.log(`✅ Capability created: ${mathCapability.name}\n`);

  // 4. Configuring policies
  console.log('🛡️  4. Configuring policies...');

  sdk.defineGlobalPolicy({
    id: 'max-steps-global',
    type: 'budget',
    rules: [
      {
        condition: 'maxSteps',
        action: 'deny',
        metadata: { value: 10 },
      },
    ],
    scope: 'global',
    enabled: true,
  });

  console.log('✅ Global policy configured (max 10 steps)\n');

  // 5. Creating an agent with tools and policies
  console.log('🤖 5. Creating an agent...');

  const agent = sdk.createAgent({
    name: 'math-assistant',
    model: 'gpt-4',
    tools: [calculatorTool, weatherTool],
    capabilities: ['math'],
    policies: [
      {
        id: 'timeout-policy',
        type: 'timeout',
        rules: [
          {
            condition: 'maxDuration',
            action: 'deny',
            metadata: { value: 30000 }, // 30 seconds
          },
        ],
        scope: 'agent',
        enabled: true,
      },
    ],
    maxSteps: 5,
    version: '1.0.0',
  });

  console.log(`✅ Agent created: math-assistant (v1.0.0)\n`);

  // 6. Running an agent
  console.log('▶️  6. Running the agent...');
  console.log('   Input: "What is 15 * 23? Then tell me the weather in Paris."\n');

  try {
    const result = await agent.run({
      message: 'What is 15 * 23? Then tell me the weather in Paris.',
      metadata: {
        userId: 'example-user',
        sessionId: 'example-session',
      },
    });

    console.log(`✅ Execution completed (status: ${result.status})`);
    console.log(`   Run ID: ${result.runId}`);
    if (result.output) {
      console.log(`   Output: ${result.output}\n`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error.message}\n`);
    }

    // 7. Retrieving the trace
    console.log('📊 7. Retrieving the trace...');
    const trace = await sdk.getTrace(result.runId);

    console.log(`✅ Trace retrieved:`);
    console.log(`   - Total events: ${trace.summary.totalEvents}`);
    console.log(`   - Duration: ${trace.summary.duration}ms`);
    console.log(`   - Intentions generated: ${trace.summary.intentionsGenerated}`);
    console.log(`   - Actions executed: ${trace.summary.actionsExecuted}`);
    console.log(`   - Tools called: ${trace.summary.toolsCalled}\n`);

    // 8. Exporting the trace
    console.log('💾 8. Exporting the trace...');
    const traceText = await sdk.exportTrace(result.runId, 'text');
    console.log('✅ Trace exported (first 500 characters):');
    console.log(traceText.substring(0, 500) + '...\n');

    // 9. Replaying the execution
    console.log('🔄 9. Replaying the execution...');
    const replayResult = await sdk.replay(result.runId);

    console.log(`✅ Replay completed (status: ${replayResult.status})`);
    console.log(`   Run ID: ${replayResult.runId}`);
    if (replayResult.output) {
      console.log(`   Output: ${replayResult.output}\n`);
    }

    // 10. Replay with modifications
    console.log('🔄 10. Replay with modifications...');
    const modifiedReplay = await sdk.replay(result.runId, {
      input: {
        message: 'What is 20 * 30?',
      },
    });

    console.log(`✅ Modified replay completed (status: ${modifiedReplay.status})\n`);

    // 11. Retrieving filtered events
    console.log('📋 11. Retrieving filtered events...');
    const toolEvents = await sdk.getEvents(result.runId, {
      type: 'tool.called',
    });

    console.log(`✅ ${toolEvents.length} tool/action events found\n`);

    // 12. Demonstrating execution stop (if long run)
    console.log('⏹️  12. Demonstrating execution stop...');
    console.log('   (Note: This demo needs a long run to be visible)');

    // Create an agent with many steps for the demo
    const longRunningAgent = sdk.createAgent({
      name: 'long-running-agent',
      model: 'gpt-4',
      tools: [calculatorTool],
      maxSteps: 100, // Many steps to allow stopping
    });

    const longRunPromise = longRunningAgent.run({
      message: 'Count from 1 to 100 step by step',
    });

    // Stop after 2 seconds
    setTimeout(async () => {
      try {
        const longRun = await longRunPromise;
        await sdk.stopRun(longRun.runId);
        console.log(`   ✅ Run stopped: ${longRun.runId}`);
      } catch (error) {
        // May fail if already completed
      }
    }, 2000);

    console.log('   ✅ Stop mechanism demonstrated\n');

  } catch (error) {
    console.error('❌ Error during execution:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }

  console.log('✨ Complete example finished!');
  console.log('\n📚 For more information:');
  console.log('   - Documentation: docs/CONCEPTS.md');
  console.log('   - Quick Start: docs/QUICKSTART.md');
  console.log('   - Architecture: _bmad-output/planning-artifacts/architecture.md');
}

// Execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default main;
