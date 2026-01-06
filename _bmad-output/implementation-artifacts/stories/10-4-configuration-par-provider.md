# Story 10.4: Configuration par Provider

**Story ID:** 10.4  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** configurer des paramètres spécifiques par provider,
**So that** je peux optimiser chaque provider selon ses caractéristiques.

## Acceptance Criteria

**Given** plusieurs providers configurés
**When** je configure un agent
**Then** je peux spécifier des paramètres par provider (temperature, maxTokens, etc.)
**And** les paramètres sont appliqués correctement
**And** la configuration est validée

## Business Value

- **Fonctionnalité**: Feature implémentée
- **Qualité**: Testée et validée
- **Traçabilité**: Événements tracés

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- `ReasoningEngine` utilise `DEFAULT_LLM_TEMPERATURE` hardcodé
- `maxTokens` non configurable au niveau agent/run
- Pas de configuration spécifique par provider

**Fichiers concernés:**
- `src/types/agent.ts` - AgentConfig
- `src/types/run.ts` - RunInput
- `src/engines/reasoning-engine.ts` - Génération d'intentions
- `src/agent.ts` - AgentImpl

### Architecture Cible

**Configuration requise:**
1. **Par Agent** - Configuration dans `AgentConfig.providerSettings`
2. **Par Run** - Surcharge dans `RunInput.providerSettings`
3. **Par Provider** - Settings spécifiques (openai, anthropic) ou default
4. **Priorité** - Run > Agent > Defaults

### Implémentation

**1. Types étendus**
- `ProviderSettings` interface avec `temperature?` et `maxTokens?`
- `AgentConfig.providerSettings` pour configuration par agent
- `RunInput.providerSettings` pour surcharge par run

**2. ReasoningEngine**
- Utilise `context.temperature` et `context.maxTokens` au lieu de valeurs hardcodées
- Passe ces paramètres aux providers

**3. AgentImpl**
- `resolveProviderSettings()` pour fusionner agent + run + defaults
- `getProviderName()` pour déterminer le provider depuis le modèle
- Passe les settings résolus à `ReasoningEngine`

**4. Priorité de résolution**
- Run provider-specific > Run default > Agent provider-specific > Agent default

## Architecture Compliance

### Principes Respectés

1. **Séparation des responsabilités**: Architecture respectée
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Événements tracés
4. **Sécurité**: Deny-by-default respecté

## Testing Requirements

### Tests Unitaires Requis

1. **Configuration par agent**
   - Test settings par défaut appliqués
   - Test settings spécifiques par provider
   - Test priorité provider-specific > default

2. **Configuration par run**
   - Test surcharge des settings agent
   - Test settings par défaut au niveau run
   - Test priorité complète

3. **Anthropic provider**
   - Test application settings à Anthropic

## Tasks/Subtasks

- [x] Étendre AgentConfig avec providerSettings
- [x] Étendre RunInput avec providerSettings
- [x] Créer interface ProviderSettings
- [x] Modifier ReasoningEngine pour utiliser context.temperature et maxTokens
- [x] Implémenter resolveProviderSettings dans AgentImpl
- [x] Implémenter getProviderName dans AgentImpl
- [x] Créer tests unitaires (7 tests)

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] Corriger résolution settings avec FallbackProvider [src/agent.ts:148-188]
- [x] [AI-Review][HIGH] Exposer getProviderName() dans ReasoningEngine [src/engines/reasoning-engine.ts] - Résolu via providerSettings dans LLMRequest

## File List

- `src/types/agent.ts` - Modifié (ajout ProviderSettings et providerSettings dans AgentConfig)
- `src/types/run.ts` - Modifié (ajout providerSettings dans RunInput)
- `src/providers/llm-provider.ts` - Modifié (ajout providerSettings dans LLMRequest)
- `src/providers/fallback-provider.ts` - Modifié (résolution settings par provider)
- `src/engines/reasoning-engine.ts` - Modifié (utilise providerSettings, résolution après connaître provider utilisé, ajout getProviderName())
- `src/sdk.ts` - Modifié (création ReasoningEngine par agent au lieu de partagé)
- `src/agent.ts` - Modifié (mergeProviderSettings, passage providerSettings au lieu de settings résolus)
- `src/__tests__/provider-settings.test.ts` - Nouveau (7 tests)
- `src/__tests__/provider-settings-fallback.test.ts` - Nouveau (2 tests pour FallbackProvider)
- `src/__tests__/reasoning-engine-isolation.test.ts` - Nouveau (2 tests pour isolation ReasoningEngine)

## Dev Agent Record

### Implementation Plan

1. **Types** : Extension de AgentConfig et RunInput avec providerSettings
2. **ReasoningEngine** : Utilisation des paramètres du contexte au lieu de valeurs hardcodées
3. **AgentImpl** : Résolution des settings avec priorité correcte
4. **Tests** : Tests complets pour tous les cas d'usage

### Completion Notes

✅ **Story complétée avec succès**

**Implémentation:**
- ProviderSettings interface créée avec temperature et maxTokens
- AgentConfig étendu avec providerSettings (openai, anthropic, default)
- RunInput étendu avec providerSettings pour surcharge
- LLMRequest étendu avec providerSettings pour FallbackProvider
- FallbackProvider résout settings par provider automatiquement
- ReasoningEngine modifié pour utiliser providerSettings et résoudre après connaître provider utilisé
- AgentImpl implémente mergeProviderSettings avec priorité correcte
- Priorité: Run provider-specific > Run default > Agent provider-specific > Agent default
- **FIX CRITICAL**: Settings résolus APRÈS connaître le provider réellement utilisé (corrige bug avec FallbackProvider)
- **AMÉLIORATION ARCHITECTURE**: ReasoningEngine créé par agent pour meilleure isolation
- **AMÉLIORATION ARCHITECTURE**: ReasoningEngine expose getProviderName() et getPrimaryProviderName()

**Tests:**
- 7 tests d'intégration (tous passent)
- 2 tests spécifiques FallbackProvider (tous passent)
- 2 tests isolation ReasoningEngine (tous passent)
- Couverture complète: agent-level, run-level, priority, Anthropic, FallbackProvider, isolation

**Critères d'acceptation validés:**
- ✅ Configuration par provider possible
- ✅ Paramètres spécifiques par provider (temperature, maxTokens)
- ✅ Paramètres appliqués correctement
- ✅ Configuration validée (via tests)

## Senior Developer Review (AI)

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Changes Requested

### Review Summary

**Issues Found:** 2 issues (1 CRITICAL ✅ CORRIGÉ, 1 HIGH ✅ RÉSOLU)  
**Files Reviewed:** 8 fichiers modifiés/créés  
**Tests Status:** Tous les tests passent, y compris nouveaux tests FallbackProvider

### Action Items

#### 🔴 CRITICAL Priority - ✅ CORRIGÉ

1. **[CRITICAL] Provider settings appliqués au mauvais provider avec FallbackProvider** [src/agent.ts:148-188] ✅ CORRIGÉ
   - Problème: `getProviderName()` détermine le provider depuis le modèle AVANT l'appel. Si FallbackProvider bascule vers un autre provider, les mauvais settings sont appliqués.
   - Impact: Si modèle="gpt-4" mais fallback vers Anthropic, settings OpenAI appliqués au lieu de Anthropic
   - Solution appliquée: 
     - Ajout de `providerSettings` dans `LLMRequest`
     - `FallbackProvider` résout les settings par provider automatiquement
     - `ReasoningEngine` passe `providerSettings` à `FallbackProvider` au lieu de settings résolus
     - Settings résolus APRÈS connaître le provider réellement utilisé
   - Tests: 2 nouveaux tests ajoutés pour valider le comportement avec FallbackProvider

#### 🟡 HIGH Priority - ✅ RÉSOLU

2. **[HIGH] ReasoningEngine devrait exposer getProviderName()** [src/engines/reasoning-engine.ts:25-32] ✅ RÉSOLU
   - Problème: `AgentImpl` ne peut pas accéder au provider du ReasoningEngine pour déterminer le provider réellement utilisé
   - Impact: `AgentImpl.getProviderName()` devine depuis le modèle au lieu d'utiliser le provider réel
   - Solution appliquée: Résolu via `providerSettings` dans `LLMRequest` - `FallbackProvider` résout automatiquement selon le provider utilisé

## Story Completion Status

**Status:** review  
**Ready for:** Final code review  
**Dependencies:** Story 10.1, 10.2, 10.3 complétées (prérequis créés)  
**Next Story:** Epic 10 complété
