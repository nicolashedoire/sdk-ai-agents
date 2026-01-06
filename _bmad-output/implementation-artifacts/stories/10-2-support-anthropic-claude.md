# Story 10.2: Support Anthropic Claude

**Story ID:** 10.2  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,  
**I want** utiliser Anthropic Claude comme provider LLM,  
**So that** je peux bénéficier des avantages de Claude.

## Acceptance Criteria

**Given** Anthropic est configuré comme provider  
**When** je crée un agent avec model "claude-3-opus"  
**Then** le Reasoning Engine utilise l'API Anthropic  
**And** les intentions sont générées correctement  
**And** le format de réponse est compatible  
**And** les tool calls fonctionnent correctement  
**And** les erreurs sont gérées proprement

## Business Value

- **Choix du provider**: Permet aux développeurs d'utiliser Claude selon leurs préférences
- **Avantages spécifiques Claude**: Meilleure compréhension de contexte, meilleure sécurité
- **Résilience**: Réduit la dépendance à un seul provider
- **Performance**: Permet de choisir le meilleur provider pour chaque cas d'usage

## Technical Requirements

### Dépendance de Story 10.1

**Prérequis:**
- Story 10.1 doit être complétée (abstraction LLMProvider créée)
- Interface `LLMProvider` doit être définie
- `ProviderFactory` doit être implémenté
- `AnthropicProvider` doit exister en squelette

### Architecture Actuelle (après Story 10.1)

**État attendu après Story 10.1:**
- Interface `LLMProvider` définie dans `src/providers/llm-provider.ts`
- `OpenAIProvider` implémenté et testé
- `AnthropicProvider` existe en squelette (structure de base)
- `ProviderFactory` peut créer les providers
- `ReasoningEngine` utilise `LLMProvider` au lieu de client OpenAI direct

**Fichiers concernés:**
- `src/providers/anthropic-provider.ts` - À compléter
- `src/providers/provider-factory.ts` - Vérifier la création Anthropic
- `src/types/sdk.ts` - Configuration Anthropic
- `src/errors/index.ts` - Gestion d'erreurs Anthropic

### Différences Clés OpenAI vs Anthropic

**1. Format de Messages:**
- **OpenAI**: `messages[]` avec `role: 'system' | 'user' | 'assistant'`
- **Anthropic**: `messages[]` avec `role: 'user' | 'assistant'` (pas de système séparé)
  - Le système est passé via paramètre `system` séparé

**2. Tool Calling:**
- **OpenAI**: `tools[]` avec `tool_choice`, réponse dans `message.tool_calls[]`
- **Anthropic**: `tools[]` avec `tool_choice`, réponse dans `content[]` avec type `tool_use`

**3. Format de Réponse:**
- **OpenAI**: `message.content` (string) ou `message.tool_calls[]`
- **Anthropic**: `content[]` (array) avec objets `{type: 'text', text: '...'}` ou `{type: 'tool_use', ...}`

**4. Modèles:**
- **OpenAI**: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`, etc.
- **Anthropic**: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3-5-sonnet`, etc.

**5. Paramètres:**
- **OpenAI**: `temperature`, `max_tokens`, `top_p`, etc.
- **Anthropic**: `temperature`, `max_tokens`, `top_p`, `top_k`, etc. (similaires mais noms peuvent différer)

**6. Gestion d'Erreurs:**
- **OpenAI**: Exceptions avec codes HTTP
- **Anthropic**: Exceptions avec codes HTTP similaires mais messages différents

### Implémentation AnthropicProvider

**Structure requise:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequest, LLMResponse } from './llm-provider.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Conversion des messages OpenAI → Anthropic
    // Gestion du system prompt
    // Appel API Anthropic
    // Conversion de la réponse Anthropic → LLMResponse
  }

  supportsModel(model: string): boolean {
    return model.startsWith('claude-');
  }

  getProviderName(): string {
    return 'anthropic';
  }
}
```

### Conversions Requises

**1. Conversion Messages:**
```typescript
// OpenAI format → Anthropic format
function convertMessages(messages: OpenAI.Message[]): {
  system?: string;
  messages: Anthropic.Message[];
} {
  // Extraire le message système
  // Convertir les autres messages
  // Gérer le format Anthropic (pas de role 'system' dans messages[])
}
```

**2. Conversion Tools:**
```typescript
// OpenAI tools → Anthropic tools
function convertTools(tools: OpenAI.Tool[]): Anthropic.Tool[] {
  // Format similaire mais vérifier les différences
  // Anthropic utilise 'name' au lieu de 'function.name'
}
```

**3. Conversion Réponse:**
```typescript
// Anthropic response → LLMResponse
function convertResponse(response: Anthropic.Message): LLMResponse {
  // Extraire le texte depuis content[]
  // Extraire les tool calls depuis content[] avec type 'tool_use'
  // Normaliser le format
}
```

### Modèles Anthropic Supportés

**Modèles recommandés:**
- `claude-3-5-sonnet-20241022` - Meilleur équilibre (recommandé)
- `claude-3-opus-20240229` - Plus puissant
- `claude-3-sonnet-20240229` - Équilibre
- `claude-3-haiku-20240307` - Plus rapide

**Validation:**
- Vérifier que le modèle commence par `claude-`
- Valider le format exact du nom du modèle
- Gérer les erreurs si modèle invalide

### Configuration

**SDKConfig étendu:**
```typescript
interface SDKConfig {
  provider?: 'openai' | 'anthropic';
  providerConfig?: {
    openai?: { apiKey?: string; defaultModel?: string };
    anthropic?: { apiKey?: string; defaultModel?: string };
  };
  // ...
}
```

**Exemple d'utilisation:**
```typescript
const sdk = createSDK({
  provider: 'anthropic',
  providerConfig: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-3-5-sonnet-20241022'
    }
  }
});

const agent = sdk.createAgent({
  name: 'Claude Agent',
  model: 'claude-3-opus-20240229', // Override du modèle par défaut
  // ...
});
```

## Architecture Compliance

### Principes à Respecter

1. **Normalisation**: L'interface LLMProvider doit masquer les différences entre providers
2. **Type-safety**: Tous les types doivent être stricts
3. **Error handling**: Gestion d'erreurs cohérente avec OpenAIProvider
4. **Performance**: Pas de surcharge inutile dans les conversions
5. **Backward compatibility**: L'API publique reste identique

### Patterns à Utiliser

- **Adapter Pattern**: Adapter l'API Anthropic à l'interface LLMProvider
- **Normalization**: Normaliser les formats de réponse
- **Error Mapping**: Mapper les erreurs Anthropic vers LLMProviderError

### Fichiers à Créer/Modifier

**Fichiers à modifier:**
- `src/providers/anthropic-provider.ts` - Compléter l'implémentation
- `src/providers/provider-factory.ts` - Vérifier création AnthropicProvider
- `src/errors/index.ts` - Adapter LLMProviderError si nécessaire
- `src/types/sdk.ts` - Configuration Anthropic si nécessaire

**Tests à créer:**
- `src/__tests__/anthropic-provider.test.ts` - Tests complets
- Tests d'intégration avec API réelle Anthropic

## Library & Framework Requirements

### Dépendances Requises

**Déjà installé (Story 10.1):**
- `@anthropic-ai/sdk` - SDK officiel Anthropic
  - Version: Dernière stable (v0.27.x ou supérieur)
  - Documentation: https://docs.anthropic.com/claude/reference

### Installation

```bash
npm install @anthropic-ai/sdk
```

**Note:** Cette dépendance devrait déjà être installée dans Story 10.1.

### Versions et Compatibilité

- **Node.js**: 18+ (compatible avec notre stack)
- **TypeScript**: 5.x (compatible)
- **SDK Anthropic**: Vérifier la dernière version stable

## File Structure Requirements

```
src/
  providers/
    anthropic-provider.ts      # Implémentation complète Anthropic
    llm-provider.ts            # Interface (créée Story 10.1)
    openai-provider.ts         # Implémentation OpenAI (Story 10.1)
    provider-factory.ts        # Factory (Story 10.1)
    index.ts                   # Exports
  __tests__/
    anthropic-provider.test.ts # Tests AnthropicProvider
  ...
```

## Testing Requirements

### Tests Unitaires Requis

1. **AnthropicProvider - Création**
   - Test création avec API key
   - Test modèle par défaut
   - Test modèle personnalisé

2. **AnthropicProvider - Conversion Messages**
   - Test conversion messages OpenAI → Anthropic
   - Test extraction message système
   - Test gestion messages multiples
   - Test gestion conversation history

3. **AnthropicProvider - Conversion Tools**
   - Test conversion tools OpenAI → Anthropic
   - Test format des paramètres
   - Test tool_choice

4. **AnthropicProvider - Conversion Réponse**
   - Test extraction texte depuis content[]
   - Test extraction tool calls depuis content[]
   - Test normalisation format LLMResponse
   - Test gestion usage tokens

5. **AnthropicProvider - Tool Calls**
   - Test génération tool call
   - Test multiple tool calls
   - Test format arguments

6. **AnthropicProvider - Gestion d'Erreurs**
   - Test erreurs API Anthropic
   - Test erreurs réseau
   - Test erreurs authentification
   - Test erreurs modèle invalide
   - Test mapping vers LLMProviderError

7. **AnthropicProvider - Modèles**
   - Test supportsModel() avec différents modèles
   - Test validation modèles Claude
   - Test modèles invalides

### Tests d'Intégration

1. **SDK avec Anthropic**
   - Test création SDK avec provider Anthropic
   - Test création agent avec modèle Claude
   - Test génération intention avec Claude
   - Test tool calls avec Claude
   - Test que l'API reste identique

2. **End-to-End**
   - Test agent complet avec Anthropic
   - Test génération intention
   - Test exécution tool call
   - Test final answer
   - Test événements générés

3. **Tests avec API Réelle**
   - Test avec vraie API Anthropic (nécessite API key)
   - Test différents modèles Claude
   - Test tool calling réel
   - Test gestion erreurs réelles

### Critères de Test

- ✅ Tous les tests unitaires passent
- ✅ Tests d'intégration passent
- ✅ Tests avec API réelle Anthropic (si API key disponible)
- ✅ Format de réponse compatible avec ReasoningEngine
- ✅ Tool calls fonctionnent correctement
- ✅ Gestion d'erreurs cohérente avec OpenAIProvider

## Previous Story Intelligence

### Story 10.1: Abstraction du Provider LLM

**Apprentissages:**
- Interface LLMProvider doit être stable et bien définie
- Normalisation des formats est critique
- Tests doivent couvrir tous les cas de conversion
- Gestion d'erreurs doit être cohérente

**Fichiers créés Story 10.1:**
- `src/providers/llm-provider.ts` - Interface commune
- `src/providers/openai-provider.ts` - Implémentation OpenAI
- `src/providers/anthropic-provider.ts` - Squelette (à compléter)
- `src/providers/provider-factory.ts` - Factory

**Patterns établis:**
- Utiliser l'interface LLMProvider
- Normaliser les formats de réponse
- Gérer les erreurs avec LLMProviderError
- Tests avec mocks et API réelle

### Stories MVP Pertinentes

**Story 5.1: Séparation Raisonnement/Action**
- Le ReasoningEngine utilise déjà LLMProvider (Story 10.1)
- Pas de changement nécessaire dans ActionEngine
- Les intentions générées doivent rester compatibles

**Story 7.6: Comprendre pourquoi l'agent a pris une décision**
- Les événements doivent inclure le provider utilisé
- La traçabilité doit rester complète avec Anthropic

## Git Intelligence

### Patterns de Code Existants

- **Imports**: Utiliser imports ESM (`from './file.js'`)
- **Exports**: Exporter les classes publiques
- **Error handling**: Utiliser LLMProviderError
- **Testing**: Utiliser Vitest avec mêmes patterns
- **Type-safety**: TypeScript strict

### Commits Récents Pertinents

- Story 10.1: Création abstraction LLMProvider
- Patterns établis pour providers

## Latest Technical Information

### Anthropic SDK (@anthropic-ai/sdk)

**Version actuelle:** 0.27.x (vérifier dernière version)

**Documentation:**
- API Reference: https://docs.anthropic.com/claude/reference
- SDK TypeScript: https://github.com/anthropics/anthropic-sdk-typescript

**Caractéristiques clés:**
- Support complet tool use (depuis Claude 3)
- Format messages avec `system` séparé
- Format réponse avec `content[]` array
- Support `max_tokens`, `temperature`, `top_p`, `top_k`

**Tool Use:**
- Format: `content[]` avec objets `{type: 'tool_use', id: '...', name: '...', input: {...}}`
- Tool choice: `'auto'`, `'any'`, ou `{type: 'tool', name: '...'}`
- Réponse: `content[]` avec `{type: 'text', text: '...'}` ou `{type: 'tool_use', ...}`

**Messages:**
- Format: `messages[]` avec `role: 'user' | 'assistant'`
- System prompt: Paramètre `system` séparé (string)
- Pas de `role: 'system'` dans `messages[]`

**Modèles disponibles:**
- `claude-3-5-sonnet-20241022` - Dernière version Sonnet (recommandé)
- `claude-3-opus-20240229` - Plus puissant
- `claude-3-sonnet-20240229` - Équilibre
- `claude-3-haiku-20240307` - Plus rapide

### Considérations Techniques

1. **Conversion Messages:**
   - Extraire `role: 'system'` des messages OpenAI
   - Le passer comme paramètre `system` séparé
   - Convertir les autres messages au format Anthropic

2. **Conversion Tools:**
   - Format similaire mais vérifier les différences exactes
   - Anthropic utilise `name` directement dans l'objet tool
   - Vérifier le format des paramètres

3. **Conversion Réponse:**
   - `content[]` est un array, pas une string
   - Extraire le texte depuis `content[]` avec `type: 'text'`
   - Extraire tool calls depuis `content[]` avec `type: 'tool_use'`
   - Normaliser vers `LLMResponse`

4. **Gestion d'Erreurs:**
   - Anthropic utilise des codes HTTP similaires
   - Messages d'erreur peuvent différer
   - Mapper vers LLMProviderError avec provider='anthropic'

5. **AbortSignal:**
   - Vérifier support dans SDK Anthropic
   - Implémenter si nécessaire

## Project Context Reference

### Documents Pertinents

- **PRD**: Section "Phase 2 - Production-Ready" - Multi-providers LLM
- **Architecture**: Section "Reasoning Engine" - Architecture avec abstraction
- **Epics**: Epic 10 - Multi-Providers LLM, Story 10.2
- **Story 10.1**: Abstraction du Provider LLM (prérequis)

### Contraintes du Projet

- **Backward compatibility**: L'API publique ne doit pas changer
- **Type-safety**: TypeScript strict obligatoire
- **Performance**: Conversions efficaces
- **Tests**: Tests complets avec mocks et API réelle
- **Format compatible**: Les intentions générées doivent être compatibles

## Implementation Notes

### Étapes d'Implémentation Recommandées

1. **Installer/Valider SDK Anthropic**
   - Vérifier installation `@anthropic-ai/sdk`
   - Vérifier version et compatibilité

2. **Implémenter Conversion Messages**
   - Fonction `convertMessages()` OpenAI → Anthropic
   - Extraire message système
   - Convertir messages restants
   - Tests unitaires complets

3. **Implémenter Conversion Tools**
   - Fonction `convertTools()` OpenAI → Anthropic
   - Vérifier format exact
   - Tests unitaires

4. **Implémenter Conversion Réponse**
   - Fonction `convertResponse()` Anthropic → LLMResponse
   - Extraire texte depuis content[]
   - Extraire tool calls depuis content[]
   - Normaliser format
   - Tests unitaires complets

5. **Compléter AnthropicProvider**
   - Implémenter `generateCompletion()`
   - Utiliser les fonctions de conversion
   - Gérer les erreurs
   - Implémenter `supportsModel()`
   - Tests unitaires

6. **Tests d'Intégration**
   - Tests avec ReasoningEngine
   - Tests end-to-end
   - Tests avec API réelle (si disponible)

7. **Documentation**
   - Documenter l'utilisation
   - Exemples avec Anthropic
   - Notes sur différences avec OpenAI

### Points d'Attention

1. **Format Messages**: Bien gérer l'extraction du système prompt
2. **Format Réponse**: `content[]` est un array, bien parser
3. **Tool Calls**: Format différent, bien normaliser
4. **Gestion d'Erreurs**: Mapper correctement vers LLMProviderError
5. **Tests**: Tester avec API réelle si possible
6. **Performance**: Conversions efficaces, pas de surcharge

### Cas Limites à Tester

1. **Messages vides**
2. **Pas de message système**
3. **Plusieurs messages système** (ne devrait pas arriver mais gérer)
4. **Tool calls multiples**
5. **Réponse mixte** (texte + tool calls)
6. **Erreurs API** (rate limit, auth, etc.)
7. **Modèles invalides**
8. **AbortSignal** pendant appel API

## Senior Developer Review (AI) - Final Review

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Approved

### Review Summary

**Issues Found:** 0 issues (tous corrigés)  
**Files Reviewed:** 8 fichiers modifiés/créés  
**Tests Status:** Tous les tests passent

### Review Notes

- ✅ Implémentation AnthropicProvider complète et correcte après corrections
- ✅ Conversions messages/tools/réponse bien implémentées
- ✅ Tests complets et tous passent
- ✅ Problèmes HIGH/MEDIUM identifiés précédemment ont été corrigés
- ✅ max_tokens configurable via LLMRequest.maxTokens
- ✅ Messages système multiples concaténés correctement
- ✅ Blocs text multiples concaténés correctement
- ✅ Validation des clés API ajoutée

## Tasks/Subtasks

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Corriger max_tokens hardcodé dans AnthropicProvider [src/providers/anthropic-provider.ts:27]
- [x] [AI-Review][HIGH] Gérer plusieurs messages système dans convertMessages [src/providers/anthropic-provider.ts:70-72]
- [x] [AI-Review][HIGH] Concaténer plusieurs blocs text dans convertResponse [src/providers/anthropic-provider.ts:107-109]
- [x] [AI-Review][MEDIUM] Ajouter validation clé API dans AnthropicProvider [src/providers/anthropic-provider.ts:14]
- [x] [AI-Review][MEDIUM] Ajouter maxTokens dans LLMRequest interface [src/providers/llm-provider.ts]

- [x] Installer SDK Anthropic (@anthropic-ai/sdk)

---

## Tasks/Subtasks

- [x] Installer SDK Anthropic (@anthropic-ai/sdk)
- [x] Créer OpenAIProvider (prérequis Story 10.1)
- [x] Créer ProviderFactory (prérequis Story 10.1)
- [x] Refactoriser ReasoningEngine pour utiliser LLMProvider
- [x] Implémenter AnthropicProvider avec conversions messages
- [x] Implémenter conversions tools
- [x] Implémenter conversions réponses
- [x] Gérer les erreurs Anthropic
- [x] Mettre à jour SDK pour créer provider Anthropic
- [x] Créer tests unitaires AnthropicProvider (14 tests)
- [x] Créer tests d'intégration avec ReasoningEngine (6 tests)
- [x] Créer tests end-to-end avec SDK (5 tests)
- [x] Corriger tests existants pour utiliser LLMProvider

## File List

- `src/providers/openai-provider.ts` - Nouveau
- `src/providers/anthropic-provider.ts` - Nouveau
- `src/providers/provider-factory.ts` - Nouveau
- `src/providers/index.ts` - Nouveau
- `src/engines/reasoning-engine.ts` - Modifié (utilise LLMProvider)
- `src/agent.ts` - Modifié (passe modèle dans ReasoningContext)
- `src/sdk.ts` - Modifié (crée provider approprié)
- `src/types/sdk.ts` - Modifié (ajout providerConfig)
- `src/__tests__/anthropic-provider.test.ts` - Nouveau (14 tests)
- `src/__tests__/anthropic-integration.test.ts` - Nouveau (6 tests)
- `src/__tests__/sdk-anthropic.test.ts` - Nouveau (5 tests)
- `src/__tests__/agent.test.ts` - Modifié (utilise OpenAIProvider)
- `package.json` - Modifié (ajout @anthropic-ai/sdk)

## Dev Agent Record

### Implementation Plan

1. **Prérequis Story 10.1** : Création d'OpenAIProvider et ProviderFactory nécessaires pour l'abstraction LLM
2. **AnthropicProvider** : Implémentation complète avec conversions messages/tools/réponse
3. **Intégration** : Refactorisation de ReasoningEngine pour utiliser LLMProvider
4. **SDK** : Mise à jour pour créer le provider approprié selon la configuration
5. **Tests** : Tests unitaires, intégration et end-to-end complets

### Completion Notes

✅ **Story complétée avec succès**

**Implémentation:**
- AnthropicProvider implémenté avec toutes les conversions nécessaires
- Support complet des modèles Claude (claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3-5-sonnet)
- Conversions messages OpenAI → Anthropic (extraction système prompt)
- Conversions tools avec format Anthropic (input_schema)
- Conversions réponses Anthropic → LLMResponse (content[], tool_use)
- Gestion d'erreurs complète avec LLMProviderError
- Support AbortSignal pour annulation

**Tests:**
- 14 tests unitaires AnthropicProvider (tous passent)
- 6 tests d'intégration ReasoningEngine (tous passent)
- 5 tests end-to-end SDK (tous passent)
- Tests existants corrigés pour utiliser LLMProvider

**Critères d'acceptation validés:**
- ✅ Anthropic configuré comme provider
- ✅ Agent créé avec modèle Claude fonctionne
- ✅ Reasoning Engine utilise API Anthropic
- ✅ Intentions générées correctement
- ✅ Format de réponse compatible
- ✅ Tool calls fonctionnent correctement
- ✅ Erreurs gérées proprement

**Note:** Cette story complète l'implémentation d'Anthropic Claude. Le fallback entre providers sera implémenté dans Story 10.3.

