# Story 6.8: Interroger les événements par runId

**Story ID:** 6.8  
**Epic:** 6 - Event Sourcing & Persistence  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** interroger les événements par runId,
**So that** je peux récupérer l'historique complet d'une exécution spécifique.

## Acceptance Criteria

**Given** un runId existe
**When** j'appelle `sdk.getEvents(runId)`
**Then** je reçois tous les événements pour ce runId
**And** les événements sont dans l'ordre chronologique
**And** une erreur claire est retournée si le runId n'existe pas
**And** la requête est performante même avec beaucoup d'événements

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
