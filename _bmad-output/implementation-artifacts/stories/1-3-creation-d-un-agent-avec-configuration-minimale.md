# Story 1.3: Création d'un agent avec configuration minimale

**Story ID:** 1.3  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,  
**I want** créer un agent avec une configuration minimale,  
**So that** je peux avoir un agent fonctionnel rapidement.

## Acceptance Criteria

**Given** une instance SDK est initialisée  
**When** j'appelle `sdk.createAgent({ name: '...', model: '...' })`  
**Then** un agent est créé avec succès  
**And** l'agent a une configuration par défaut valide  
**And** l'API est intuitive et nécessite moins de 5 paramètres obligatoires  
**And** les erreurs de validation sont claires

## Business Value

- **Simplicité**: Configuration minimale (name + model)
- **Rapidité**: Agent fonctionnel en quelques lignes
- **Intuitivité**: API claire et prévisible
- **Validation**: Erreurs claires si configuration invalide

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- `createAgent()` méthode dans `SDKImpl`
- `AgentConfig` interface dans `src/types/agent.ts`
- `AgentImpl` classe dans `src/agent.ts`
- Validation et création automatique d'ID

**Fichiers concernés:**
- `src/sdk.ts` - Méthode `createAgent()`
- `src/types/agent.ts` - Interface `AgentConfig`
- `src/agent.ts` - Classe `AgentImpl`

### Implémentation

**Configuration Minimale:**
```typescript
interface AgentConfig {
  name: string;      // Requis
  model: string;     // Requis
  systemPrompt?: string;
  maxSteps?: number;
  timeout?: number;
  tools?: Tool[];
  capabilities?: string[];
  version?: string;
}
```

**Création Automatique:**
- ID unique (UUID)
- Timestamps (createdAt, updatedAt)
- ConfigHash pour versioning
- Valeurs par défaut

## Architecture Compliance

### Principes Respectés

1. **Simplicité**: 2 paramètres obligatoires seulement
2. **Type-safety**: TypeScript strict
3. **Defaults**: Valeurs par défaut intelligentes
4. **Validation**: Erreurs claires

## Testing Requirements

- ✅ Agent créé avec name + model
- ✅ ID unique généré
- ✅ Configuration par défaut appliquée
- ✅ Erreur si paramètres manquants

## Story Completion Status

**Status:** done  
**Implementation:** Complète dans `src/sdk.ts` et `src/agent.ts`

