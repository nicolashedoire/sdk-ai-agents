# Story 13.2: Alternatives Considered by the Agent

**Story ID:** 13.2  
**Epic:** 13 - Cognitive Observability  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to see the alternatives considered by the agent,
**So that** I can understand why certain options were chosen.

## Acceptance Criteria

**Given** an agent execution
**When** I look at the alternatives
**Then** I can see the options considered
**And** the reasons for the choice are explained
**And** the alternatives are traced in the events

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
- Display of alternatives considered by the agent
- Visual comparison of options

**Files concerned:**
- React components in `src/components/alternatives-viewer/`
- Storybook stories in `.storybook/`
- Tailwind CSS styles
- shadcn/ui components for the interface

### Implementation

**Components to create:**
- `AlternativesViewer` - Main component
- `AlternativeCard` - Alternative card
- `ComparisonView` - Comparison view
- `ReasoningDisplay` - Reasoning display

**Recommended libraries:**
- shadcn/ui components: Card, Badge, Tabs, etc.
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
- Required components: Card, Badge, Tabs, Accordion, etc.

### Installation

```bash
# Storybook
npx storybook@latest init

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add card badge tabs accordion
```

## File Structure Requirements

```
src/
  components/
    alternatives-viewer/
      AlternativesViewer.tsx  # Main component
      AlternativeCard.tsx      # Alternative card
      ComparisonView.tsx       # Comparison view
      ReasoningDisplay.tsx     # Reasoning display
      index.ts                 # Exports
  ui/                         # shadcn/ui components
    card.tsx
    badge.tsx
    tabs.tsx
    accordion.tsx
    ...
.storybook/
  main.ts                     # Storybook 10 configuration
  preview.ts                  # Preview configuration
stories/
  AlternativesViewer.stories.tsx  # Storybook stories
  AlternativeCard.stories.tsx
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
- ✅ Accessibility tests (a11y)

## Story Completion Status

**Status:** review  
**Implementation:** Backend completed - Extraction and analysis of alternatives considered  
**Notes:** Backend part implemented. Frontend visualization (React/Storybook) can be added separately.

## Implementation Details (Backend)

### Components Created

1. **Alternatives Types** (`src/types/alternatives.ts`)
   - `Alternative`: Represents an alternative considered (intention, tool_call, action, decision)
   - `AlternativesAnalysis`: Complete analysis with decision points and statistics

2. **AlternativesExtractor** (`src/utils/alternatives-extractor.ts`)
   - `extractFromEvents()`: Extracts alternatives from a sequence of events
   - Identifies multiple tool calls (alternatives)
   - Detects rejected intentions
   - Analyzes policy rejections
   - Handles approval workflows (rejected approvals)
   - Computes statistics (selected, rejected, considered)

3. **SDK Method** (`src/sdk.ts`)
   - `getAlternatives(runId)`: Retrieves the alternatives analysis for a run

### Supported Alternative Types

- **intention**: Intention generated but not executed
- **tool_call**: Tool call considered among several options
- **action**: Action considered but not executed
- **decision**: Decision made (approval, policy rejection)

### Alternative Status

- **considered**: Alternative considered but not yet decided
- **selected**: Alternative chosen and executed
- **rejected**: Alternative rejected (policy, approval, etc.)
- **not_executed**: Alternative considered but not executed (another was chosen)

### Decision Points

Each decision point contains:
- **context**: Decision context (preceding message, etc.)
- **alternatives**: List of alternatives considered
- **selectedAlternative**: Alternative chosen (if applicable)
- **reasoning**: Reasoning explaining the choice

### Tests

- **Unit Tests**: `src/__tests__/alternatives.test.ts` (5 tests, all passing)
  - Tests for extraction with multiple tool calls
  - Tests for rejected intentions
  - Tests for policy rejections
  - Tests for approval workflows
  - Tests for statistics

- **Integration Tests**: `src/__tests__/sdk-alternatives.test.ts` (3 tests, all passing)
  - Tests for `getAlternatives()` via SDK
  - Tests for rejected intentions
  - Tests for error handling

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: 'your-api-key' });

// Get alternatives analysis
const analysis = await sdk.getAlternatives('run-123');

console.log(`Total alternatives: ${analysis.summary.totalAlternatives}`);
console.log(`Selected: ${analysis.summary.selectedCount}`);
console.log(`Rejected: ${analysis.summary.rejectedCount}`);

// Analyze decision points
for (const decisionPoint of analysis.decisionPoints) {
  console.log(`Decision at ${new Date(decisionPoint.timestamp).toISOString()}`);
  console.log(`Context: ${decisionPoint.context}`);
  console.log(`Alternatives considered: ${decisionPoint.alternatives.length}`);
  if (decisionPoint.selectedAlternative) {
    console.log(`Selected: ${decisionPoint.selectedAlternative.description}`);
  }
  if (decisionPoint.reasoning) {
    console.log(`Reasoning: ${decisionPoint.reasoning}`);
  }
}
```

### Next Steps (Frontend)

The backend part is complete. For frontend visualization:
- Use the alternatives analysis JSON data
- Create React components to display the alternatives
- Visually compare the options considered
- Integrate with Storybook for documentation
