# Story 1.1: Installation du SDK via npm

**Story ID:** 1.1  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** développeur,  
**I want** installer le SDK via npm avec une seule commande,  
**So that** je peux démarrer rapidement sans configuration complexe.

## Acceptance Criteria

**Given** un projet Node.js existant ou nouveau  
**When** j'exécute `npm install @sdk-ai-agents/core`  
**Then** le package est installé avec succès  
**And** les types TypeScript sont disponibles  
**And** le package est compatible avec Node.js 20+ LTS  
**And** le package supporte ESM et CommonJS

## Business Value

- **Rapidité**: Installation en une seule commande
- **Simplicité**: Pas de configuration complexe requise
- **Compatibilité**: Support Node.js LTS et formats de modules modernes
- **Type-safety**: Types TypeScript inclus pour meilleure DX

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- Package npm configuré dans `package.json`
- TypeScript configuré avec `tsconfig.json`
- Build configuré pour générer ESM et CommonJS
- Types générés dans `dist/`

**Fichiers concernés:**
- `package.json` - Configuration npm, dépendances, scripts
- `tsconfig.json` - Configuration TypeScript
- `dist/` - Fichiers compilés et types générés

### Implémentation

**Package Configuration:**
- Nom: `@sdk-ai-agents/core`
- Version: Suivant semver
- Entry points: ESM et CommonJS
- Types: Inclus dans le package

**Compatibilité:**
- Node.js: 20+ LTS
- TypeScript: 5.x
- ESM: Support complet
- CommonJS: Support complet

## Architecture Compliance

### Principes Respectés

1. **Simplicité**: Installation en une commande
2. **Type-safety**: Types TypeScript inclus
3. **Compatibilité**: Support formats modernes et legacy
4. **Documentation**: README avec instructions d'installation

## Library & Framework Requirements

### Dépendances

- TypeScript 5.x
- Node.js 20+ LTS
- Build tools pour ESM/CommonJS

## File Structure Requirements

```
package.json          # Configuration npm
tsconfig.json         # Configuration TypeScript
dist/                 # Fichiers compilés
  *.js               # Code JavaScript
  *.d.ts             # Types TypeScript
```

## Testing Requirements

- ✅ Package installable via npm
- ✅ Types disponibles après installation
- ✅ Compatible Node.js 20+
- ✅ ESM et CommonJS fonctionnels

## Story Completion Status

**Status:** done  
**Implementation:** Complète  
**Notes:** Package npm configuré et fonctionnel

