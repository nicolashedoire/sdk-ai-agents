# Story 1.6: Exemple complet fonctionnel

**Story ID:** 1.6  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,  
**I want** un exemple complet fonctionnel fourni par le SDK,  
**So that** je peux comprendre comment utiliser toutes les fonctionnalités de base.

## Acceptance Criteria

**Given** le SDK est installé  
**When** je consulte l'exemple fourni  
**Then** l'exemple montre un agent complet avec tool + replay  
**And** l'exemple est fonctionnel et exécutable  
**And** l'exemple démontre les concepts fondamentaux  
**And** l'exemple peut être copié et adapté facilement

## Business Value

- **Apprentissage**: Exemple complet pour comprendre
- **Référence**: Template pour nouveaux projets
- **Démonstration**: Toutes les features MVP montrées
- **Réutilisabilité**: Code copiable et adaptable

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- Exemple complet dans `examples/complete-example.ts`
- Démontre: agent, tool, capability, replay, trace
- Fonctionnel et exécutable
- Commenté et documenté

**Fichiers concernés:**
- `examples/complete-example.ts` - Exemple complet
- `examples/README.md` - Documentation exemples

### Implémentation

**Exemple Complet Inclut:**
- Création SDK
- Création agent
- Définition tool
- Définition capability
- Exécution agent
- Replay
- Trace
- Tous les concepts MVP

## Architecture Compliance

### Principes Respectés

1. **Complétude**: Toutes features MVP
2. **Fonctionnalité**: Exécutable
3. **Clarté**: Bien commenté
4. **Réutilisabilité**: Adaptable

## Testing Requirements

- ✅ Exemple exécutable
- ✅ Toutes features démontrées
- ✅ Code fonctionnel
- ✅ Documentation claire

## Story Completion Status

**Status:** done  
**Implementation:** Complète dans `examples/complete-example.ts`


