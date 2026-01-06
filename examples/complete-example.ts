/**
 * Exemple Complet - SDK_AI_Agents
 * 
 * Cet exemple démontre toutes les fonctionnalités principales du MVP :
 * - Création d'un SDK et d'un agent
 * - Définition de tools avec validation Zod
 * - Création de capabilities
 * - Configuration de policies
 * - Exécution d'un agent avec tracing
 * - Replay d'une exécution
 * - Arrêt d'exécution
 * - Export de traces
 */

import { createSDK, defineTool } from '../src/index.js';
import { z } from 'zod';

async function main() {
  console.log('🚀 SDK_AI_Agents - Exemple Complet\n');

  // 1. Initialisation du SDK
  console.log('📦 1. Initialisation du SDK...');
  const sdk = createSDK({
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
  });
  console.log('✅ SDK initialisé\n');

  // 2. Définition de tools avec validation Zod
  console.log('🔧 2. Définition des tools...');
  
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
      // Simulation - dans un vrai cas, appeler une API météo
      return {
        location,
        temperature: unit === 'celsius' ? 22 : 72,
        condition: 'sunny',
        unit,
      };
    },
    version: '1.0.0',
  });

  console.log(`✅ Tools définis: ${calculatorTool.name}, ${weatherTool.name}\n`);

  // 3. Création d'une capability
  console.log('🎯 3. Création d\'une capability...');
  
  const mathCapability = sdk.defineCapability({
    name: 'math',
    description: 'Mathematical operations capability',
    tools: [calculatorTool], // Auto-enregistrement des tools
    version: '1.0.0',
  });

  console.log(`✅ Capability créée: ${mathCapability.name}\n`);

  // 4. Configuration de policies
  console.log('🛡️  4. Configuration des policies...');
  
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

  console.log('✅ Policy globale configurée (max 10 steps)\n');

  // 5. Création d'un agent avec tools et policies
  console.log('🤖 5. Création d\'un agent...');
  
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
            metadata: { value: 30000 }, // 30 secondes
          },
        ],
        scope: 'agent',
        enabled: true,
      },
    ],
    maxSteps: 5,
    version: '1.0.0',
  });

  console.log(`✅ Agent créé: math-assistant (v1.0.0)\n`);

  // 6. Exécution d'un agent
  console.log('▶️  6. Exécution de l\'agent...');
  console.log('   Input: "What is 15 * 23? Then tell me the weather in Paris."\n');

  try {
    const result = await agent.run({
      message: 'What is 15 * 23? Then tell me the weather in Paris.',
      metadata: {
        userId: 'example-user',
        sessionId: 'example-session',
      },
    });

    console.log(`✅ Exécution terminée (status: ${result.status})`);
    console.log(`   Run ID: ${result.runId}`);
    if (result.output) {
      console.log(`   Output: ${result.output}\n`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error.message}\n`);
    }

    // 7. Récupération de la trace
    console.log('📊 7. Récupération de la trace...');
    const trace = await sdk.getTrace(result.runId);
    
    console.log(`✅ Trace récupérée:`);
    console.log(`   - Total événements: ${trace.summary.totalEvents}`);
    console.log(`   - Durée: ${trace.summary.duration}ms`);
    console.log(`   - Intentions générées: ${trace.summary.intentionsGenerated}`);
    console.log(`   - Actions exécutées: ${trace.summary.actionsExecuted}`);
    console.log(`   - Tools appelés: ${trace.summary.toolsCalled}\n`);

    // 8. Export de la trace
    console.log('💾 8. Export de la trace...');
    const traceText = await sdk.exportTrace(result.runId, 'text');
    console.log('✅ Trace exportée (premiers 500 caractères):');
    console.log(traceText.substring(0, 500) + '...\n');

    // 9. Replay de l'exécution
    console.log('🔄 9. Replay de l\'exécution...');
    const replayResult = await sdk.replay(result.runId);
    
    console.log(`✅ Replay terminé (status: ${replayResult.status})`);
    console.log(`   Run ID: ${replayResult.runId}`);
    if (replayResult.output) {
      console.log(`   Output: ${replayResult.output}\n`);
    }

    // 10. Replay avec modifications
    console.log('🔄 10. Replay avec modifications...');
    const modifiedReplay = await sdk.replay(result.runId, {
      input: {
        message: 'What is 20 * 30?',
      },
    });
    
    console.log(`✅ Replay modifié terminé (status: ${modifiedReplay.status})\n`);

    // 11. Récupération des événements avec filtres
    console.log('📋 11. Récupération des événements filtrés...');
    const toolEvents = await sdk.getEvents(result.runId, {
      type: 'tool.called',
    });
    
    console.log(`✅ ${toolEvents.length} événements de type tool/action trouvés\n`);

    // 12. Démonstration de l'arrêt d'exécution (si run long)
    console.log('⏹️  12. Démonstration de l\'arrêt d\'exécution...');
    console.log('   (Note: Cette démo nécessite un run long pour être visible)');
    
    // Créer un agent avec beaucoup de steps pour démo
    const longRunningAgent = sdk.createAgent({
      name: 'long-running-agent',
      model: 'gpt-4',
      tools: [calculatorTool],
      maxSteps: 100, // Beaucoup de steps pour permettre l'arrêt
    });

    const longRunPromise = longRunningAgent.run({
      message: 'Count from 1 to 100 step by step',
    });

    // Arrêter après 2 secondes
    setTimeout(async () => {
      try {
        const longRun = await longRunPromise;
        await sdk.stopRun(longRun.runId);
        console.log(`   ✅ Run arrêté: ${longRun.runId}`);
      } catch (error) {
        // Peut échouer si déjà terminé
      }
    }, 2000);

    console.log('   ✅ Mécanisme d\'arrêt démontré\n');

  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }

  console.log('✨ Exemple complet terminé !');
  console.log('\n📚 Pour plus d\'informations:');
  console.log('   - Documentation: docs/CONCEPTS.md');
  console.log('   - Quick Start: docs/QUICKSTART.md');
  console.log('   - Architecture: _bmad-output/planning-artifacts/architecture.md');
}

// Exécution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default main;

