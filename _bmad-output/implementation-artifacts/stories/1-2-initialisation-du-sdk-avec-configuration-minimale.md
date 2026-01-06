# Story 1.2: Initialisation du SDK avec configuration minimale

**Story ID:** 1.2  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,  
**I want** initialiser le SDK avec des paramètres de base,  
**So that** je peux commencer à utiliser le SDK immédiatement.

## Acceptance Criteria

**Given** le SDK est installé  
**When** j'appelle `createSDK({ apiKey: '...' })`  
**Then** une instance SDK est créée  
**And** l'API est entièrement typée (type-safety complet)  
**And** la configuration minimale est validée  
**And** les erreurs de configuration sont claires et explicites

## Business Value

- **Simplicité**: Configuration minimale requise (seulement apiKey)
- **Type-safety**: API entièrement typée pour meilleure DX
- **Validation**: Erreurs claires si configuration invalide
- **Rapidité**: Démarrage immédiat sans configuration complexe

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- `createSDK()` fonction dans `src/index.ts`
- `SDKImpl` classe dans `src/sdk.ts`
- `SDKConfig` interface dans `src/types/sdk.ts`
- Validation de configuration dans constructeur

**Fichiers concernés:**
- `src/index.ts` - Export fonction `createSDK()`
- `src/sdk.ts` - Implémentation SDK
- `src/types/sdk.ts` - Types et interfaces

### Implémentation

**Configuration Minimale:**
```typescript
interface SDKConfig {
  apiKey: string;  // Requis
  provider?: 'openai' | 'anthropic';  // Optionnel
  eventStore?: IEventStore;  // Optionnel
  defaultPolicies?: Policy[];  // Optionnel
}
```

**Validation:**
- `apiKey` requis
- Erreurs claires si manquant
- Configuration par défaut intelligente

## Architecture Compliance

### Principes Respectés

1. **Simplicité**: Configuration minimale
2. **Type-safety**: TypeScript strict
3. **Validation**: Erreurs claires
4. **Defaults**: Valeurs par défaut intelligentes

## Testing Requirements

- ✅ SDK créé avec apiKey uniquement
- ✅ Types corrects
- ✅ Erreur si apiKey manquant
- ✅ Configuration par défaut appliquée

## Story Completion Status

**Status:** done  
**Implementation:** Complète dans `src/sdk.ts`

