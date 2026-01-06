# Story 1.5: Documentation des concepts clés

**Story ID:** 1.5  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,  
**I want** comprendre les concepts clés via la documentation,  
**So that** je peux utiliser le SDK efficacement et comprendre le paradigme.

## Acceptance Criteria

**Given** je suis nouveau sur le SDK  
**When** je consulte la documentation  
**Then** les concepts clés sont expliqués clairement (agent ≠ LLM, event-sourcing, replay)  
**And** chaque concept explique le problème qu'il résout  
**And** la documentation est orientée "mental model" pas "how-to magique"  
**And** des exemples illustrent chaque concept

## Business Value

- **Compréhension**: Paradigme clair dès le début
- **Adoption**: Meilleure compréhension = meilleure adoption
- **Efficacité**: Utilisation correcte du SDK
- **Mental Model**: Compréhension profonde vs surface

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- Documentation concepts dans `docs/CONCEPTS.md`
- Explication du paradigme agent ≠ LLM
- Event-sourcing expliqué
- Replay expliqué

**Fichiers concernés:**
- `docs/CONCEPTS.md` - Documentation complète des concepts
- `README.md` - Vue d'ensemble

### Concepts Clés Documentés

1. **Agent ≠ LLM**: Séparation conceptuelle
2. **Event-Sourcing**: Source de vérité unique
3. **Replay**: Rejouabilité sans LLM
4. **Séparation Raisonnement/Action**: Sécurité by design
5. **Policies**: Gouvernance native
6. **Tools**: Contrôle et sécurité

## Architecture Compliance

### Principes Respectés

1. **Mental Model**: Focus sur compréhension
2. **Problèmes Résolus**: Chaque concept explique pourquoi
3. **Exemples**: Illustrations concrètes
4. **Clarté**: Langage accessible

## Testing Requirements

- ✅ Concepts expliqués clairement
- ✅ Problèmes résolus identifiés
- ✅ Exemples fournis
- ✅ Mental model établi

## Story Completion Status

**Status:** done  
**Implementation:** Complète dans `docs/CONCEPTS.md`


