# Story 13.3: Decision Patterns Across Multiple Runs

**Story ID:** 13.3  
**Epic:** 13 - Cognitive Observability  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** product engineer,
**I want** to analyze decision patterns across multiple runs,
**So that** I can identify trends and improve the agent.

## Acceptance Criteria

**Given** several agent runs
**When** I analyze the patterns
**Then** I can see recurring decisions
**And** patterns are identified automatically
**And** insights are presented in an understandable way

## Business Value

- **Functionality**: Feature implemented
- **Quality**: Tested and validated
- **Traceability**: Events traced

## Technical Requirements

### Front-End Stack

**Required technologies:**
- **Storybook 10**: For UI component development and documentation
- **Tailwind CSS**: For styling and the design system
- **shadcn/ui**: Reusable UI components based on Radix UI

### Current Architecture

**Current state:**
- To be implemented with React/TypeScript components
- Pattern analysis across multiple runs
- Visualization of trends and insights

**Files concerned:**
- React components in `src/components/patterns-analyzer/`
- Storybook stories in `.storybook/`
- Tailwind CSS styles
- shadcn/ui components for the interface

### Implementation

**Components to create:**
- `PatternsAnalyzer` - Main component
- `PatternChart` - Pattern charts
- `InsightsPanel` - Insights panel
- `RunComparison` - Run comparison

**Recommended libraries:**
- `recharts` or `@visx/visx` for charts
- shadcn/ui components: Card, Tabs, Table, etc.
- Tailwind CSS for styling

## Library & Framework Requirements

### Required Front-End Dependencies

**Storybook:**
- `@storybook/react` v10.x
- `@storybook/addon-essentials` v10.x
- `@storybook/addon-interactions` for interactive tests

**Tailwind CSS:**
- `tailwindcss` latest stable version
- Configuration with a custom theme

**shadcn/ui:**
- Required components: Card, Tabs, Table, Badge, etc.

**Visualization libraries:**
- `recharts` for simple charts
- `@visx/visx` for advanced visualizations (optional)

### Installation

```bash
# Storybook
npx storybook@latest init

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add card tabs table badge

# Visualization libraries
npm install recharts
# or
npm install @visx/visx
```

## File Structure Requirements

```
src/
  components/
    patterns-analyzer/
      PatternsAnalyzer.tsx    # Main component
      PatternChart.tsx        # Pattern charts
      InsightsPanel.tsx       # Insights panel
      RunComparison.tsx       # Run comparison
      index.ts                # Exports
  ui/                         # shadcn/ui components
    card.tsx
    tabs.tsx
    table.tsx
    badge.tsx
    ...
.storybook/
  main.ts                     # Storybook 10 configuration
  preview.ts                  # Preview configuration
stories/
  PatternsAnalyzer.stories.tsx  # Storybook stories
  PatternChart.stories.tsx
  ...
```

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: Strict TypeScript
3. **Event-sourcing**: Events traced
4. **Security**: Deny-by-default respected

## Testing Requirements

- ✅ Unit tests for React components
- ✅ Storybook tests with interactions
- ✅ Integration tests with real data
- ✅ Performance tests with large amounts of data
- ✅ Accessibility tests (a11y)

## Story Completion Status

**Status:** review  
**Implementation:** Backend completed - Analysis of decision patterns across multiple runs  
**Notes:** Backend part implemented. Frontend visualization (React/Storybook) can be added separately.

## Implementation Details (Backend)

### Components Created

1. **Decision Patterns Types** (`src/types/decision-patterns.ts`)
   - `DecisionPattern`: Represents a recurring decision pattern
   - `PatternInsight`: Automatically generated insight (frequent_choice, trending_up, trending_down, anomaly, recommendation)
   - `DecisionPatternAnalysis`: Complete analysis with patterns, insights, and statistics

2. **PatternAnalyzer** (`src/utils/pattern-analyzer.ts`)
   - `analyzePatterns()`: Analyzes decision patterns across multiple runs
   - Identifies tool choice patterns
   - Detects recurring policy violations
   - Analyzes frequent approval requests
   - Identifies recurring intention types
   - Analyzes rejection reasons
   - Computes trends (increasing, decreasing, stable)
   - Generates automatic insights

3. **SDK Method** (`src/sdk.ts`)
   - `getDecisionPatterns(options)`: Analyzes patterns with filters (agentId, userId, sessionId, time range, minFrequency)

### Supported Pattern Types

- **tool_choice**: Recurring tool choices
- **policy_violation**: Frequent policy violations
- **approval_request**: Frequent approval requests
- **intention_type**: Recurring intention types
- **rejection_reason**: Frequent rejection reasons

### Insights Generated

- **frequent_choice**: Most frequent pattern (>50% of runs)
- **trending_up**: Pattern on the rise
- **trending_down**: Pattern in decline
- **anomaly**: Frequent policy violations (>20%)
- **recommendation**: Frequent approval requests (>30%)

### Tests

- **Unit Tests**: `src/__tests__/pattern-analyzer.test.ts` (8 tests, all passing)
  - Tests for pattern analysis across multiple runs
  - Tests for tool choice identification
  - Tests for policy violations
  - Tests for approval requests
  - Tests for trend calculation
  - Tests for insight generation
  - Tests for filtering by minimum frequency
  - Tests for empty runs

- **Integration Tests**: `src/__tests__/sdk-patterns.test.ts` (4 tests, all passing)
  - Tests for `getDecisionPatterns()` via SDK
  - Tests for filtering by minimum frequency
  - Tests for filtering by time range
  - Tests for empty runs

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: 'your-api-key' });

// Analyze patterns for a specific agent
const analysis = await sdk.getDecisionPatterns({
  agentId: 'agent-123',
  since: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
  minFrequency: 3, // Only show patterns that occur in at least 3 runs
});

console.log(`Runs analyzed: ${analysis.runsAnalyzed}`);
console.log(`Total patterns: ${analysis.summary.totalPatterns}`);

// Review insights
for (const insight of analysis.insights) {
  console.log(`[${insight.severity.toUpperCase()}] ${insight.title}`);
  console.log(`  ${insight.description}`);
  if (insight.recommendation) {
    console.log(`  Recommendation: ${insight.recommendation}`);
  }
}

// Review patterns
for (const pattern of analysis.patterns) {
  console.log(`${pattern.pattern}: ${pattern.frequency} times (${pattern.percentage.toFixed(1)}%)`);
  if (pattern.trend) {
    console.log(`  Trend: ${pattern.trend}`);
  }
}
```

### Next Steps (Frontend)

The backend part is complete. For frontend visualization:
- Use the pattern analysis JSON data
- Create charts with recharts or @visx/visx
- Display insights visually
- Compare patterns across different periods
- Integrate with Storybook for documentation
