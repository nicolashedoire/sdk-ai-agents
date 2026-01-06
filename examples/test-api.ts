/**
 * Test Rapide avec API Réelle
 * 
 * Test minimal pour valider que le SDK fonctionne avec une vraie clé API
 */

import { createSDK, defineTool } from '../src/index.js';
import { z } from 'zod';

async function test() {
  console.log('🧪 Test avec API réelle...\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY non définie');
    process.exit(1);
  }

  // 1. Initialisation
  console.log('1️⃣  Initialisation du SDK...');
  const sdk = createSDK({ apiKey });
  console.log('✅ SDK initialisé\n');

  // 2. Définition d'un tool simple
  console.log('2️⃣  Définition d\'un tool...');
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
  console.log(`✅ Tool créé: ${calculatorTool.name}\n`);

  // 3. Création d'un agent
  console.log('3️⃣  Création d\'un agent...');
  const agent = sdk.createAgent({
    name: 'test-agent',
    model: 'gpt-4',
    tools: [calculatorTool],
    maxSteps: 3,
    timeout: 30000,
  });
  console.log('✅ Agent créé\n');

  // 4. Exécution simple
  console.log('4️⃣  Exécution de l\'agent...');
  console.log('   Question: "What is 15 * 23?"\n');
  
  try {
    const result = await agent.run({
      message: 'What is 15 * 23?',
    });

    console.log(`✅ Exécution terminée!`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Run ID: ${result.runId}`);
    if (result.output) {
      console.log(`   Réponse: ${result.output.substring(0, 200)}...`);
    }
    console.log('');

    // 5. Récupération de la trace
    console.log('5️⃣  Récupération de la trace...');
    const trace = await sdk.getTrace(result.runId);
    console.log(`✅ Trace récupérée:`);
    console.log(`   - Événements: ${trace.summary.totalEvents}`);
    console.log(`   - Durée: ${trace.summary.duration}ms`);
    console.log(`   - Intentions: ${trace.summary.intentionsGenerated}`);
    console.log(`   - Actions: ${trace.summary.actionsExecuted}`);
    console.log(`   - Tools appelés: ${trace.summary.toolsCalled}`);
    console.log('');

    // 6. Replay
    console.log('6️⃣  Replay de l\'exécution...');
    const replayResult = await sdk.replay(result.runId);
    console.log(`✅ Replay terminé!`);
    console.log(`   Status: ${replayResult.status}`);
    if (replayResult.output) {
      console.log(`   Réponse: ${replayResult.output.substring(0, 200)}...`);
    }
    console.log('');

    console.log('✨ Tous les tests sont passés avec succès! 🎉');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    } else {
      console.error('   Erreur inconnue:', error);
    }
    process.exit(1);
  }
}

test().catch(console.error);

