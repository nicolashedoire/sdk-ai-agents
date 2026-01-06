# Story 15.2: Analyse d'Impact Avant/Après Déploiement

**Epic:** Epic 15 - Advanced Observability & Comparison  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR54

## Description

Permettre à un développeur d'analyser l'impact d'un changement (nouvelle version d'agent, modification de policy, etc.) en comparant le comportement avant et après le déploiement.

## Contexte

L'analyse d'impact permet de comprendre les effets d'un changement avant de le déployer en production, en comparant des exécutions avec différentes versions ou configurations.

## Acceptance Criteria

### AC1: Analyser Impact d'un Changement
**Given** des traces avant et après un changement existent  
**When** un développeur appelle `sdk.analyzeImpact(beforeRunIds, afterRunIds, options)`  
**Then** un rapport d'impact détaillé est retourné

### AC2: Rapport d'Impact Détaillé
**Given** une analyse d'impact est effectuée  
**When** le rapport est généré  
**Then** il contient :
- Métriques comparatives (durée, coût, qualité)
- Changements de comportement identifiés
- Impact sur les résultats (amélioration, dégradation, neutre)
- Recommandations basées sur l'analyse

### AC3: Groupement par Version/Configuration
**Given** plusieurs runs avant et après existent  
**When** une analyse est effectuée  
**Then** les runs peuvent être groupés par :
- Version de l'agent
- Configuration utilisée
- Période de temps
- Utilisateur ou session

## Technical Details

### Types à créer

```typescript
interface ImpactAnalysisOptions {
  groupBy?: 'version' | 'configuration' | 'time' | 'user' | 'session';
  metrics?: ('duration' | 'cost' | 'quality' | 'success_rate')[];
  includeRecommendations?: boolean;
}

interface ImpactMetric {
  name: string;
  before: {
    average: number;
    min: number;
    max: number;
    count: number;
  };
  after: {
    average: number;
    min: number;
    max: number;
    count: number;
  };
  change: {
    absolute: number;
    percentage: number;
    direction: 'improvement' | 'degradation' | 'neutral';
  };
}

interface ImpactAnalysis {
  id: string;
  beforeRunIds: string[];
  afterRunIds: string[];
  analyzedAt: number;
  metrics: ImpactMetric[];
  behaviorChanges: Array<{
    type: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    beforeValue: unknown;
    afterValue: unknown;
  }>;
  impact: {
    overall: 'positive' | 'negative' | 'neutral';
    confidence: number; // 0-1
    summary: string;
  };
  recommendations?: Array<{
    type: 'rollback' | 'monitor' | 'optimize' | 'investigate';
    priority: 'high' | 'medium' | 'low';
    description: string;
  }>;
}
```

### Méthodes SDK

- `analyzeImpact(beforeRunIds: string[], afterRunIds: string[], options?: ImpactAnalysisOptions): Promise<ImpactAnalysis>`
- `getImpactAnalysis(analysisId: string): Promise<ImpactAnalysis>`
- `compareVersions(agentId: string, version1: string, version2: string, options?: ImpactAnalysisOptions): Promise<ImpactAnalysis>`

## Tests

- Analyser l'impact avec amélioration
- Analyser l'impact avec dégradation
- Analyser l'impact neutre
- Grouper par version
- Générer des recommandations

## Dependencies

- Story 15.1: Comparaison de Deux Exécutions
- Epic 9: Versioning & Audit (versions d'agents)

