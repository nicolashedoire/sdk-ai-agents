# SDK_AI_Agents

Infrastructure de gouvernance des agents IA avec event-sourcing natif, replay et sécurité by design.

## Vision

SDK_AI_Agents transforme les agents IA d'outils expérimentaux en systèmes décisionnels gouvernables, explicables et prêts pour la production.

## Différenciateurs Clés

1. **Event-sourcing natif** → Replay/audit en 1 commande
2. **Séparation raisonnement/action** → Sécurité par design
3. **Gouvernance intégrée** → Policies, budgets, approbations natifs
4. **Testabilité native** → Golden traces, replay déterministe

## Quick Start

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core'
import { z } from 'zod'

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY })

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b
      case 'subtract': return a - b
      case 'multiply': return a * b
      case 'divide': return a / b
    }
  }
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool]
})

const result = await agent.run({ message: 'What is 15 * 23?' })
console.log(result.output)

const trace = await sdk.getTrace(result.runId)
const replay = await sdk.replay(result.runId)
```

## Installation

```bash
npm install @sdk-ai-agents/core
```

## Documentation

### Pour Commencer
- [Quick Start Guide](./docs/QUICKSTART.md) - Créer votre premier agent en < 30 minutes
- [Concepts Clés](./docs/CONCEPTS.md) - Guide complet des concepts fondamentaux

### Exemples
- [Quick Start](./examples/quick-start.ts) - Exemple minimal
- [Exemple Complet](./examples/complete-example.ts) - Toutes les fonctionnalités

### Planification
- [Product Brief](./_bmad-output/planning-artifacts/product-brief-SDK_AI_Agents-2026-01-06.md)
- [PRD](./_bmad-output/planning-artifacts/prd.md)
- [Architecture](./_bmad-output/planning-artifacts/architecture.md)
- [Epics & Stories](./_bmad-output/planning-artifacts/epics.md)

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT

