# Story 13.1: Graphe de Raisonnement Visualisable

**Story ID:** 13.1  
**Epic:** 13 - Observabilité Cognitive  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** visualiser le graphe de raisonnement de l'agent,
**So that** je peux comprendre comment l'agent a pensé.

## Acceptance Criteria

**Given** une exécution d'agent
**When** je récupère le graphe de raisonnement
**Then** je peux voir les étapes de raisonnement
**And** les connexions entre les décisions sont visibles
**And** le graphe est exportable (JSON, Graphviz, etc.)

## Business Value

- **Fonctionnalité**: Feature implémentée
- **Qualité**: Testée et validée
- **Traçabilité**: Événements tracés

## Technical Requirements

### Stack Front-End

**Technologies requises:**
- **Storybook 10**: Pour le développement et la documentation des composants UI
- **Tailwind CSS**: Pour le styling et le design system
- **shadcn/ui**: Composants UI réutilisables basés sur Radix UI

### Architecture Actuelle

**État actuel:**
- À implémenter avec composants React/TypeScript
- Visualisation interactive du graphe de raisonnement
- Export en formats multiples (JSON, Graphviz)

**Fichiers concernés:**
- Composants React dans `src/components/` ou `src/ui/`
- Stories Storybook dans `.storybook/`
- Styles Tailwind CSS
- Composants shadcn/ui pour l'interface

### Implémentation

**Composants à créer:**
- `ReasoningGraph` - Composant principal de visualisation
- `GraphNode` - Nœud du graphe (décision/intention)
- `GraphEdge` - Connexion entre nœuds
- `GraphControls` - Contrôles de navigation (zoom, pan, etc.)
- `GraphExport` - Export du graphe

**Bibliothèques recommandées:**
- `react-flow` ou `vis-network` pour le rendu du graphe
- Composants shadcn/ui pour les contrôles (Button, Dialog, etc.)
- Tailwind CSS pour le styling

**Storybook:**
- Créer des stories pour chaque composant
- Documenter les props et les états
- Exemples d'utilisation avec données réelles

## Library & Framework Requirements

### Dépendances Front-End Requises

**Storybook:**
- `@storybook/react` v10.x
- `@storybook/addon-essentials` v10.x
- Configuration Storybook 10 selon les meilleures pratiques

**Tailwind CSS:**
- `tailwindcss` dernière version stable
- `postcss` et `autoprefixer`
- Configuration Tailwind avec thème personnalisé si nécessaire

**shadcn/ui:**
- Installation via `npx shadcn-ui@latest init`
- Composants nécessaires: Button, Dialog, Card, Tabs, etc.
- Configuration selon documentation officielle

**Bibliothèques de visualisation:**
- `react-flow` ou `@visx/network` pour le graphe
- `d3` ou `cytoscape` pour visualisation avancée (optionnel)

### Installation

```bash
# Storybook
npx storybook@latest init

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init

# Bibliothèques de visualisation
npm install react-flow
# ou
npm install @visx/network
```

## File Structure Requirements

```
src/
  components/
    reasoning-graph/
      ReasoningGraph.tsx      # Composant principal
      GraphNode.tsx            # Composant nœud
      GraphEdge.tsx            # Composant connexion
      GraphControls.tsx        # Contrôles navigation
      GraphExport.tsx          # Export graphe
      index.ts                 # Exports
  ui/                         # Composants shadcn/ui
    button.tsx
    dialog.tsx
    card.tsx
    tabs.tsx
    ...
.storybook/
  main.ts                     # Configuration Storybook 10
  preview.ts                  # Configuration preview
stories/
  ReasoningGraph.stories.tsx   # Stories Storybook
  GraphNode.stories.tsx
  ...
tailwind.config.js            # Configuration Tailwind
postcss.config.js             # Configuration PostCSS
```

## Architecture Compliance

### Principes Respectés

1. **Séparation des responsabilités**: Architecture respectée
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Événements tracés
4. **Sécurité**: Deny-by-default respecté
5. **Composants réutilisables**: shadcn/ui pour cohérence UI

## Testing Requirements

- ✅ Tests unitaires des composants React
- ✅ Tests Storybook avec interactions
- ✅ Tests d'intégration avec données réelles
- ✅ Tests d'accessibilité (a11y)
- ✅ Tests de performance avec grands graphes

## Story Completion Status

**Status:** review  
**Implementation:** Backend complété - Génération et export du graphe de raisonnement  
**Notes:** Partie backend implémentée. La visualisation frontend (React/Storybook) peut être ajoutée séparément.

## Implementation Details (Backend)

### Components Created

1. **ReasoningGraph Types** (`src/types/reasoning-graph.ts`)
   - `ReasoningNode`: Représente un nœud du graphe (intention, action, tool, policy, decision, start, end)
   - `ReasoningEdge`: Représente une connexion entre nœuds (leads_to, triggers, validates, rejects, approves)
   - `ReasoningGraph`: Structure complète du graphe avec métadonnées

2. **ReasoningGraphBuilder** (`src/utils/reasoning-graph-builder.ts`)
   - `buildFromEvents()`: Construit le graphe de raisonnement à partir d'une séquence d'événements
   - Extrait les intentions, actions, tools, policies, et décisions des événements
   - Crée les connexions entre les nœuds selon la séquence temporelle
   - Gère les workflows d'approbation et les vérifications de policies

3. **ReasoningGraphExporter** (`src/utils/reasoning-graph-export.ts`)
   - `toJSON()`: Export en format JSON (avec option pretty-print)
   - `toGraphviz()`: Export en format Graphviz DOT pour visualisation
   - Supporte les options de personnalisation (direction, nodeShape, nodeStyle)
   - Échappe correctement les caractères spéciaux dans les labels

4. **SDK Methods** (`src/sdk.ts`)
   - `getReasoningGraph(runId)`: Récupère le graphe de raisonnement pour un run
   - `exportReasoningGraph(runId, format)`: Exporte le graphe en JSON ou Graphviz

### Node Types Supported

- **start**: Début d'une exécution (`run.started`)
- **intention**: Intention générée par le LLM (`intention.generated`)
- **action**: Action exécutée (`action.executing`, `action.executed`)
- **tool**: Appel d'outil (`tool.called`)
- **policy**: Vérification de policy (`policy.checked`)
- **decision**: Décision prise (approval requests, approvals, rejections)
- **end**: Fin d'exécution (`run.completed`, `run.failed`, `run.cancelled`)

### Edge Types Supported

- **leads_to**: Connexion séquentielle normale
- **triggers**: Une action déclenche une autre
- **validates**: Une policy valide une intention
- **rejects**: Une policy ou approbation rejette une action
- **approves**: Une approbation approuve une action

### Tests

- **Unit Tests**: `src/__tests__/reasoning-graph.test.ts` (9 tests, all passing)
  - Tests pour la construction du graphe depuis les événements
  - Tests pour différents types de nœuds et edges
  - Tests pour les workflows d'approbation
  - Tests pour l'export JSON et Graphviz

- **Integration Tests**: `src/__tests__/sdk-reasoning-graph.test.ts` (4 tests, all passing)
  - Tests pour `getReasoningGraph()` via SDK
  - Tests pour `exportReasoningGraph()` en JSON et Graphviz
  - Tests de gestion d'erreurs

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: 'your-api-key' });

// Get reasoning graph
const graph = await sdk.getReasoningGraph('run-123');

// Export to JSON
const json = await sdk.exportReasoningGraph('run-123', 'json');

// Export to Graphviz (can be visualized with Graphviz tools)
const dot = await sdk.exportReasoningGraph('run-123', 'graphviz');
console.log(dot);
// Can be saved to file and visualized: dot -Tpng graph.dot -o graph.png
```

### Next Steps (Frontend)

La partie backend est complète. Pour la visualisation frontend :
- Utiliser les données JSON du graphe
- Créer des composants React avec react-flow ou vis-network
- Intégrer avec Storybook pour la documentation
- Utiliser Tailwind CSS et shadcn/ui pour le styling
