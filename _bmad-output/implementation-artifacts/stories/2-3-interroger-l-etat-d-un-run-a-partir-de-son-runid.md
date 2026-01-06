# Story 2.3: Interroger l'état d'un run à partir de son runId

**Story ID:** 2.3  
**Epic:** 2 - Agent Lifecycle & Execution Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** interroger l'état d'un run à partir de son runId,
**So that** je peux vérifier le statut d'une exécution spécifique.

## Acceptance Criteria

**Given** un runId existe
**When** j'appelle `sdk.getRunStatus(runId)`
**Then** je reçois l'état actuel du run
**And** les informations incluent l'état, le timestamp, et les métadonnées de base
**And** une erreur claire est retournée si le runId n'existe pas

## Business Value

- **Traçabilité**: Consultation par runId
- **Métadonnées**: Informations complètes
- **Erreurs**: Gestion claire

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- Implémentation complète dans le codebase MVP
- Fonctionnalité testée et validée
- Code dans `src/` avec tests dans `src/__tests__/`

**Fichiers concernés:**
- Code source dans `src/`
- Tests dans `src/__tests__/`
- Types dans `src/types/`

### Implémentation

Fonctionnalité implémentée et testée dans le MVP. Voir les fichiers sources pour les détails d'implémentation.

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
**Implementation:** Complète dans le MVP  
**Notes:** Story MVP complétée et testée
