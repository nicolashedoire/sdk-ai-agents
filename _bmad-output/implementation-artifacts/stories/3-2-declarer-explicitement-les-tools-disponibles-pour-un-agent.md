# Story 3.2: Déclarer explicitement les tools disponibles pour un agent

**Story ID:** 3.2  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** déclarer explicitement les tools disponibles pour un agent,
**So that** je contrôle précisément ce que l'agent peut utiliser.

## Acceptance Criteria

**Given** des tools sont définis
**When** je configure un agent avec `agent.addTools([tool1, tool2])`
**Then** seuls ces tools sont disponibles pour l'agent
**And** tout tool non déclaré est inaccessible (deny by default)
**And** la configuration est validée avant l'exécution

## Business Value

- **Contrôle**: Tools explicites
- **Sécurité**: Deny-by-default
- **Validation**: Configuration vérifiée

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
