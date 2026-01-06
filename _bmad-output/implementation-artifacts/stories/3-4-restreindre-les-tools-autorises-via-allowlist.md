# Story 3.4: Restreindre les tools autorisés via allowlist

**Story ID:** 3.4  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** restreindre les tools autorisés via allowlist,
**So that** je peux limiter les capabilities d'un agent de manière explicite.

## Acceptance Criteria

**Given** plusieurs tools sont définis
**When** je configure un agent avec une allowlist de tools
**Then** seuls les tools de l'allowlist sont accessibles
**And** tout tool non dans l'allowlist est bloqué même s'il est déclaré
**And** les tentatives d'utilisation de tools non autorisés sont tracées

## Business Value

- **Contrôle**: Allowlist explicite
- **Sécurité**: Blocage automatique
- **Traçabilité**: Tentatives tracées

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
