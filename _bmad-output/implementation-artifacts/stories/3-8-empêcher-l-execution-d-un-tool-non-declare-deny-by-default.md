# Story 3.8: Empêcher l'exécution d'un tool non déclaré (deny by default)

**Story ID:** 3.8  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** que le système empêche l'exécution d'un tool non déclaré,
**So that** la sécurité est garantie par design, pas par configuration.

## Acceptance Criteria

**Given** un agent est configuré avec des tools spécifiques
**When** l'agent tente d'appeler un tool non déclaré
**Then** l'appel est bloqué immédiatement
**And** une erreur claire est générée
**And** l'événement de blocage est tracé
**And** aucun effet de bord n'est produit

## Business Value

- **Sécurité**: Blocage automatique
- **Design**: Sécurité structurelle
- **Traçabilité**: Blocages tracés

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
