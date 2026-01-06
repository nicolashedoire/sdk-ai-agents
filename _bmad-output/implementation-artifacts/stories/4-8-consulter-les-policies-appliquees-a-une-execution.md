# Story 4.8: Consulter les policies appliquées à une exécution

**Story ID:** 4.8  
**Epic:** 4 - Policies & Governance  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** consulter les policies appliquées à une exécution,
**So that** je peux comprendre pourquoi certaines actions ont été autorisées ou bloquées..

## Acceptance Criteria

**Given** une exécution a été effectuée
**When** j'interroge les policies appliquées avec `sdk.getRunPolicies(runId)`
**Then** je reçois la liste complète des policies actives pendant l'exécution
**And** chaque policy inclut sa source (globale ou spécifique)
**And** les vérifications de policy sont associées aux actions correspondantes

## Business Value

- **Fonctionnalité**: Feature implémentée
- **Qualité**: Testée et validée
- **Traçabilité**: Événements tracés

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- Implémentation complète dans le codebase
- Fonctionnalité testée et validée
- Code dans `src/` avec tests dans `src/__tests__/`

**Fichiers concernés:**
- Code source dans `src/`
- Tests dans `src/__tests__/`
- Types dans `src/types/`

### Implémentation

Fonctionnalité implémentée et testée. Voir les fichiers sources pour les détails d'implémentation.

## Architecture Compliance

### Principes Respectés

1. **Séparation des responsabilités**: Architecture respectée
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Événements tracés
4. **Sécurité**: Deny-by-default respecté

## Testing Requirements

- ✅ Tests unitaires présents
- ✅ Tests d'intégration présents
- ✅ Fonctionnalité validée

## Story Completion Status

**Status:** done  
**Implementation:** Complète  
**Notes:** Story complétée et testée
