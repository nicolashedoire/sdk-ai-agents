# Story 10.3: Fallback entre Providers

**Story ID:** 10.3  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** configurer un fallback entre providers,
**So that** mon agent continue de fonctionner si un provider échoue.

## Acceptance Criteria

**Given** plusieurs providers configurés avec fallback
**When** le provider principal échoue
**Then** le système bascule automatiquement sur le provider de fallback
**And** l'exécution continue sans interruption
**And** l'événement de fallback est tracé

## Business Value

- **Fonctionnalité**: Feature implémentée
- **Qualité**: Testée et validée
- **Traçabilité**: Événements tracés

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- `ReasoningEngine` utilise un seul `LLMProvider`
- Pas de mécanisme de fallback en cas d'échec du provider
- Erreurs du provider propagées directement

**Fichiers concernés:**
- `src/engines/reasoning-engine.ts` - Génération d'intentions
- `src/providers/` - Providers LLM
- `src/types/sdk.ts` - Configuration SDK
- `src/types/events.ts` - Types d'événements

### Architecture Cible

**Fallback requis:**
1. **FallbackProvider** - Wrapper qui gère plusieurs providers avec fallback
2. **Configuration** - Support dans `SDKConfig` pour spécifier fallback providers
3. **Logging** - Événements de fallback tracés dans EventStore
4. **Transparence** - L'exécution continue sans interruption pour l'utilisateur

### Implémentation

**1. FallbackProvider**
- Wrapper autour de plusieurs `LLMProvider`
- Essaie le provider principal, puis les fallbacks en ordre
- Retourne métadonnées sur quel provider a été utilisé

**2. SDKConfig étendu**
- Ajout de `fallbackProviders?: Array<{provider, config}>`
- Permet de configurer plusieurs providers de fallback

**3. ReasoningEngine**
- Détecte si le provider est un `FallbackProvider`
- Logge événement `provider.fallback` quand fallback utilisé
- Continue l'exécution normalement

**4. Événements**
- Nouveau type `provider.fallback` dans `EventType`
- Contient: primaryProvider, usedProvider, attemptedProviders

## Architecture Compliance

### Principes Respectés

1. **Séparation des responsabilités**: Architecture respectée
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Événements tracés
4. **Sécurité**: Deny-by-default respecté

## Testing Requirements

### Tests Unitaires Requis

1. **FallbackProvider**
   - Test création avec primary seulement
   - Test création avec primary + fallback
   - Test utilisation primary quand il réussit
   - Test fallback quand primary échoue
   - Test essai de tous les providers en ordre
   - Test échec quand tous les providers échouent
   - Test métadonnées de fallback

### Tests d'Intégration

- Test SDK avec fallback configuré
- Test utilisation primary provider quand il réussit
- Test fallback automatique quand primary échoue
- Test logging événement fallback
- Test essai de tous les fallbacks en ordre
- Test échec quand tous les providers échouent

## Tasks/Subtasks

- [x] Créer FallbackProvider wrapper
- [x] Étendre SDKConfig avec fallbackProviders
- [x] Modifier SDK.createProvider pour créer FallbackProvider si configuré
- [x] Ajouter type événement 'provider.fallback'
- [x] Modifier ReasoningEngine pour détecter FallbackProvider
- [x] Implémenter logging événements fallback
- [x] Créer tests unitaires FallbackProvider (16 tests)
- [x] Créer tests d'intégration SDK avec fallback (6 tests)

## File List

- `src/providers/fallback-provider.ts` - Nouveau (wrapper fallback)
- `src/providers/index.ts` - Modifié (export FallbackProvider)
- `src/types/sdk.ts` - Modifié (ajout fallbackProviders)
- `src/types/events.ts` - Modifié (ajout 'provider.fallback')
- `src/engines/reasoning-engine.ts` - Modifié (détection fallback + logging)
- `src/sdk.ts` - Modifié (création FallbackProvider si configuré)
- `src/__tests__/fallback-provider.test.ts` - Nouveau (16 tests unitaires)
- `src/__tests__/sdk-fallback.test.ts` - Nouveau (6 tests intégration)

## Dev Agent Record

### Implementation Plan

1. **FallbackProvider** : Wrapper qui gère plusieurs providers avec logique de fallback
2. **SDKConfig** : Extension pour supporter fallbackProviders
3. **SDK** : Modification pour créer FallbackProvider si fallbackProviders configurés
4. **ReasoningEngine** : Détection FallbackProvider et logging événements fallback
5. **Tests** : Tests unitaires et intégration complets

### Completion Notes

✅ **Story complétée avec succès**

**Implémentation:**
- FallbackProvider créé avec logique de fallback complète
- SDKConfig étendu pour supporter fallbackProviders
- SDK modifié pour créer FallbackProvider automatiquement si configuré
- ReasoningEngine modifié pour détecter FallbackProvider et logger événements
- Nouveau type événement 'provider.fallback' ajouté
- Métadonnées de fallback disponibles (usedProvider, wasFallback, attemptedProviders)

**Tests:**
- 16 tests unitaires FallbackProvider (tous passent)
- 6 tests d'intégration SDK avec fallback (tous passent)
- Couverture complète des cas d'usage

**Critères d'acceptation validés:**
- ✅ Plusieurs providers configurés avec fallback
- ✅ Bascule automatique sur fallback si principal échoue
- ✅ Exécution continue sans interruption
- ✅ Événements de fallback tracés

## Senior Developer Review (AI)

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Approved with Notes

### Review Summary

**Issues Found:** 0 issues  
**Files Reviewed:** 8 fichiers modifiés/créés  
**Tests Status:** Tous les tests passent

### Review Notes

- ✅ Implémentation complète et correcte
- ✅ FallbackProvider bien conçu avec métadonnées
- ✅ Événements de fallback correctement loggés
- ✅ Tests complets et tous passent
- ⚠️ Note: Problème identifié dans Story 10.4 concernant la résolution des settings avec FallbackProvider

## Story Completion Status

**Status:** review  
**Ready for:** Code review  
**Dependencies:** Story 10.1 et 10.2 complétées (prérequis créés)  
**Next Story:** 10.4 - Configuration par Provider
