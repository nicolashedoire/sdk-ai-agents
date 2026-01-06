# Story 8.5: Tester des scénarios "et si" en rejouant avec des paramètres différents

**Story ID:** 8.5  
**Epic:** 8 - Replay & Debugging  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** tester des scénarios "et si" en rejouant avec des paramètres différents,
**So that** je peux explorer différentes possibilités sans réexécuter complètement.

## Acceptance Criteria

**Given** un runId existe
**When** je rejoue avec des paramètres différents (inputs, policies, etc.)
**Then** le replay utilise les nouveaux paramètres
**And** je peux comparer les résultats avec l'original
**And** les différences sont clairement visibles
**And** le replay est rapide car il réutilise les événements

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
