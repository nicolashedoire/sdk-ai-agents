# Story 13.2: Alternatives Envisagées par l'Agent

**Story ID:** 13.2  
**Epic:** 13 - Observabilité Cognitive  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** voir les alternatives envisagées par l'agent,
**So that** je peux comprendre pourquoi certaines options ont été choisies.

## Acceptance Criteria

**Given** une exécution d'agent
**When** je consulte les alternatives
**Then** je peux voir les options considérées
**And** les raisons du choix sont expliquées
**And** les alternatives sont tracées dans les événements

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
- Affichage des alternatives envisagées par l'agent
- Comparaison visuelle des options

**Fichiers concernés:**
- Composants React dans `src/components/alternatives-viewer/`
- Stories Storybook dans `.storybook/`
- Styles Tailwind CSS
- Composants shadcn/ui pour l'interface

### Implémentation

**Composants à créer:**
- `AlternativesViewer` - Composant principal
- `AlternativeCard` - Carte d'alternative
- `ComparisonView` - Vue de comparaison
- `ReasoningDisplay` - Affichage du raisonnement

**Bibliothèques recommandées:**
- Composants shadcn/ui: Card, Badge, Tabs, etc.
- Tailwind CSS pour le styling

## Library & Framework Requirements

### Dépendances Front-End Requises

**Storybook:**
- `@storybook/react` v10.x
- `@storybook/addon-essentials` v10.x
- `@storybook/addon-interactions` pour tests interactifs

**Tailwind CSS:**
- `tailwindcss` dernière version stable
- Configuration avec thème personnalisé

**shadcn/ui:**
- Composants nécessaires: Card, Badge, Tabs, Accordion, etc.

### Installation

```bash
# Storybook
npx storybook@latest init

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add card badge tabs accordion
```

## File Structure Requirements

```
src/
  components/
    alternatives-viewer/
      AlternativesViewer.tsx  # Composant principal
      AlternativeCard.tsx      # Carte d'alternative
      ComparisonView.tsx       # Vue de comparaison
      ReasoningDisplay.tsx     # Affichage raisonnement
      index.ts                 # Exports
  ui/                         # Composants shadcn/ui
    card.tsx
    badge.tsx
    tabs.tsx
    accordion.tsx
    ...
.storybook/
  main.ts                     # Configuration Storybook 10
  preview.ts                  # Configuration preview
stories/
  AlternativesViewer.stories.tsx  # Stories Storybook
  AlternativeCard.stories.tsx
  ...
```

## Architecture Compliance

### Principes Respectés

1. **Séparation des responsabilités**: Architecture respectée
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Événements tracés
4. **Sécurité**: Deny-by-default respecté

## Testing Requirements

- ✅ Tests unitaires des composants React
- ✅ Tests Storybook avec interactions
- ✅ Tests d'intégration avec données réelles
- ✅ Tests d'accessibilité (a11y)

## Story Completion Status

**Status:** review  
**Implementation:** Backend complété - Extraction et analyse des alternatives envisagées  
**Notes:** Partie backend implémentée. La visualisation frontend (React/Storybook) peut être ajoutée séparément.

## Implementation Details (Backend)

### Components Created

1. **Alternatives Types** (`src/types/alternatives.ts`)
   - `Alternative`: Représente une alternative envisagée (intention, tool_call, action, decision)
   - `AlternativesAnalysis`: Analyse complète avec points de décision et statistiques

2. **AlternativesExtractor** (`src/utils/alternatives-extractor.ts`)
   - `extractFromEvents()`: Extrait les alternatives depuis une séquence d'événements
   - Identifie les tool calls multiples (alternatives)
   - Détecte les intentions rejetées
   - Analyse les rejections de policies
   - Gère les workflows d'approbation (approvals rejetées)
   - Calcule les statistiques (selected, rejected, considered)

3. **SDK Method** (`src/sdk.ts`)
   - `getAlternatives(runId)`: Récupère l'analyse des alternatives pour un run

### Alternative Types Supported

- **intention**: Intention générée mais non exécutée
- **tool_call**: Appel d'outil considéré parmi plusieurs options
- **action**: Action considérée mais non exécutée
- **decision**: Décision prise (approval, policy rejection)

### Alternative Status

- **considered**: Alternative considérée mais pas encore décidée
- **selected**: Alternative choisie et exécutée
- **rejected**: Alternative rejetée (policy, approval, etc.)
- **not_executed**: Alternative considérée mais non exécutée (une autre a été choisie)

### Decision Points

Chaque point de décision contient :
- **context**: Contexte de la décision (message précédent, etc.)
- **alternatives**: Liste des alternatives considérées
- **selectedAlternative**: Alternative choisie (si applicable)
- **reasoning**: Raisonnement expliquant le choix

### Tests

- **Unit Tests**: `src/__tests__/alternatives.test.ts` (5 tests, all passing)
  - Tests pour extraction avec tool calls multiples
  - Tests pour intentions rejetées
  - Tests pour rejections de policies
  - Tests pour workflows d'approbation
  - Tests pour statistiques

- **Integration Tests**: `src/__tests__/sdk-alternatives.test.ts` (3 tests, all passing)
  - Tests pour `getAlternatives()` via SDK
  - Tests pour intentions rejetées
  - Tests de gestion d'erreurs

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: 'your-api-key' });

// Get alternatives analysis
const analysis = await sdk.getAlternatives('run-123');

console.log(`Total alternatives: ${analysis.summary.totalAlternatives}`);
console.log(`Selected: ${analysis.summary.selectedCount}`);
console.log(`Rejected: ${analysis.summary.rejectedCount}`);

// Analyze decision points
for (const decisionPoint of analysis.decisionPoints) {
  console.log(`Decision at ${new Date(decisionPoint.timestamp).toISOString()}`);
  console.log(`Context: ${decisionPoint.context}`);
  console.log(`Alternatives considered: ${decisionPoint.alternatives.length}`);
  if (decisionPoint.selectedAlternative) {
    console.log(`Selected: ${decisionPoint.selectedAlternative.description}`);
  }
  if (decisionPoint.reasoning) {
    console.log(`Reasoning: ${decisionPoint.reasoning}`);
  }
}
```

### Next Steps (Frontend)

La partie backend est complète. Pour la visualisation frontend :
- Utiliser les données JSON de l'analyse des alternatives
- Créer des composants React pour afficher les alternatives
- Comparer visuellement les options considérées
- Intégrer avec Storybook pour la documentation
