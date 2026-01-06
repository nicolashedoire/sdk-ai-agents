# Story 4.3: Définir un budget maximum (tokens ou steps) pour un agent

**Story ID:** 4.3  
**Epic:** 4 - Policies & Governance  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** définir un budget maximum (tokens ou steps) pour un agent,
**So that** je peux contrôler les coûts et la durée d'exécution..

## Acceptance Criteria

**Given** un agent est configuré
**When** je définis un budget maximum (maxTokens: 1000 ou maxSteps: 10)
**Then** l'exécution s'arrête automatiquement si le budget est atteint
**And** l'état passe à "failed" avec une raison claire
**And** le budget est vérifié avant chaque étape
**And** les événements de dépassement de budget sont tracés

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
