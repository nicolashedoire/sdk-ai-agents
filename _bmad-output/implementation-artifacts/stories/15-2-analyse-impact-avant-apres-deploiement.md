# Story 15.2: Before/After Deployment Impact Analysis

**Epic:** Epic 15 - Advanced Observability & Comparison  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR54

## Description

Allow a developer to analyze the impact of a change (new agent version, policy modification, etc.) by comparing behavior before and after the deployment.

## Context

Impact analysis makes it possible to understand the effects of a change before deploying it to production, by comparing executions across different versions or configurations.

## Acceptance Criteria

### AC1: Analyze the Impact of a Change
**Given** traces before and after a change exist  
**When** a developer calls `sdk.analyzeImpact(beforeRunIds, afterRunIds, options)`  
**Then** a detailed impact report is returned

### AC2: Detailed Impact Report
**Given** an impact analysis is performed  
**When** the report is generated  
**Then** it contains:
- Comparative metrics (duration, cost, quality)
- Identified behavior changes
- Impact on results (improvement, degradation, neutral)
- Recommendations based on the analysis

### AC3: Grouping by Version/Configuration
**Given** several before and after runs exist  
**When** an analysis is performed  
**Then** the runs can be grouped by:
- Agent version
- Configuration used
- Time period
- User or session

## Technical Details

### Types to Create

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

### SDK Methods

- `analyzeImpact(beforeRunIds: string[], afterRunIds: string[], options?: ImpactAnalysisOptions): Promise<ImpactAnalysis>`
- `getImpactAnalysis(analysisId: string): Promise<ImpactAnalysis>`
- `compareVersions(agentId: string, version1: string, version2: string, options?: ImpactAnalysisOptions): Promise<ImpactAnalysis>`

## Tests

- Analyze impact with improvement
- Analyze impact with degradation
- Analyze neutral impact
- Group by version
- Generate recommendations

## Dependencies

- Story 15.1: Comparison of Two Executions
- Epic 9: Versioning & Audit (agent versions)
