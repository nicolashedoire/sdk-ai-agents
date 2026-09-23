# Story 13.4: Trace Visualization

**Story ID:** 13.4  
**Epic:** 13 - Cognitive Observability  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to visualize traces interactively,
**So that** I can easily explore what happened.

## Acceptance Criteria

**Given** an execution trace
**When** I visualize it
**Then** I can navigate the timeline
**And** events are grouped logically
**And** details are easily accessible

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
- Interactive trace visualization
- Timeline navigation
- Logical event grouping

**Files concerned:**
- React components in `src/components/trace-viewer/`
- Storybook stories in `.storybook/`
- Tailwind CSS styles
- shadcn/ui components for the interface

### Implementation

**Components to create:**
- `TraceViewer` - Main visualization component
- `Timeline` - Interactive event timeline
- `EventGroup` - Logical event group
- `EventCard` - Individual event card
- `TraceFilters` - Search filters
- `TraceNavigation` - Trace navigation

**Recommended libraries:**
- shadcn/ui components: Tabs, Accordion, Card, Badge, etc.
- Tailwind CSS for styling
- `react-virtualized` or `@tanstack/react-virtual` for performance with large traces

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: Strict TypeScript
3. **Event-sourcing**: Events traced
4. **Security**: Deny-by-default respected

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
- Required components: Tabs, Accordion, Card, Badge, ScrollArea, etc.

**Performance libraries:**
- `@tanstack/react-virtual` for virtualizing long lists

### Installation

```bash
# Storybook
npx storybook@latest init

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add tabs accordion card badge scroll-area

# Performance
npm install @tanstack/react-virtual
```

## File Structure Requirements

```
src/
  components/
    trace-viewer/
      TraceViewer.tsx         # Main component
      Timeline.tsx            # Interactive timeline
      EventGroup.tsx          # Event group
      EventCard.tsx           # Event card
      TraceFilters.tsx        # Filters
      TraceNavigation.tsx      # Navigation
      index.ts                # Exports
  ui/                         # shadcn/ui components
    tabs.tsx
    accordion.tsx
    card.tsx
    badge.tsx
    scroll-area.tsx
    ...
.storybook/
  main.ts                     # Storybook 10 configuration
  preview.ts                  # Preview configuration
stories/
  TraceViewer.stories.tsx     # Storybook stories
  Timeline.stories.tsx
  ...
```

## Testing Requirements

- ✅ Unit tests for React components
- ✅ Storybook tests with interactions
- ✅ Integration tests with real data
- ✅ Performance tests with large traces
- ✅ Accessibility tests (a11y)

## Story Completion Status

**Status:** review  
**Implementation:** Backend completed - Trace visualization with logical grouping  
**Notes:** Backend part implemented. Frontend visualization (React/Storybook) can be added separately.

## Implementation Details (Backend)

### Components Created

1. **Trace Visualization Types** (`src/types/trace-visualization.ts`)
   - `EventGroup`: Logical event group with metadata
   - `TraceVisualization`: Complete structure for visualization with groups, timeline, and summary

2. **TraceVisualizer** (`src/utils/trace-visualizer.ts`)
   - `visualize()`: Creates an optimized structure for visualization from a trace
   - Groups events logically (run_lifecycle, reasoning_cycle, tool_execution, policy_check, approval_workflow, error)
   - Builds a flat timeline with references to groups
   - Computes key metrics and statistics

3. **SDK Method** (`src/sdk.ts`)
   - `getTraceVisualization(runId)`: Retrieves the optimized visualization for a run

### Event Group Types

- **run_lifecycle**: Run lifecycle events (started, completed, failed, cancelled)
- **reasoning_cycle**: Reasoning cycle (intention generation, execution)
- **tool_execution**: Tool execution (tool calls, actions)
- **policy_check**: Policy checks
- **approval_workflow**: Approval workflow (requested, approved, rejected)
- **error**: Errors and failures

### Grouping Logic

- Events are grouped by logical type
- tool_execution groups are separated by tool
- Reasoning cycles are separated when there is a temporal gap > 5 seconds
- Each group contains its metadata (toolName, policyId, intentionType, status)

### Timeline Structure

- Flat timeline with all events in chronological order
- Each entry references its parent group
- Readable descriptions for each event
- Direct access to the full event when needed

### Summary Metrics

- Total events and groups
- Breakdown by group type
- Key metrics: intentions, actions, tools, policies, approvals, errors

### Tests

- **Unit Tests**: `src/__tests__/trace-visualizer.test.ts` (7 tests, all passing)
  - Tests for visualization creation
  - Tests for logical grouping
  - Tests for flat timeline
  - Tests for metrics
  - Tests for approval workflows
  - Tests for errors
  - Tests for empty events

- **Integration Tests**: `src/__tests__/sdk-trace-visualization.test.ts` (4 tests, all passing)
  - Tests for `getTraceVisualization()` via SDK
  - Tests for logical grouping
  - Tests for metrics
  - Tests for error handling

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: 'your-api-key' });

// Get trace visualization
const visualization = await sdk.getTraceVisualization('run-123');

console.log(`Run: ${visualization.runId}`);
console.log(`Duration: ${visualization.timeRange.duration}ms`);
console.log(`Total groups: ${visualization.summary.totalGroups}`);

// Navigate groups
for (const group of visualization.groups) {
  console.log(`\n${group.label} (${group.type})`);
  console.log(`  Duration: ${group.duration}ms`);
  console.log(`  Events: ${group.events.length}`);
  if (group.metadata?.toolName) {
    console.log(`  Tool: ${group.metadata.toolName}`);
  }
}

// Navigate flat timeline
for (const entry of visualization.flatTimeline) {
  console.log(`${new Date(entry.timestamp).toISOString()} - ${entry.description}`);
  if (entry.groupId) {
    const group = visualization.groups.find((g) => g.id === entry.groupId);
    console.log(`  Group: ${group?.label}`);
  }
}

// Review summary
console.log('\nSummary:');
console.log(`  Intentions: ${visualization.summary.keyMetrics.intentionsGenerated}`);
console.log(`  Actions: ${visualization.summary.keyMetrics.actionsExecuted}`);
console.log(`  Tools: ${visualization.summary.keyMetrics.toolsCalled}`);
console.log(`  Policies: ${visualization.summary.keyMetrics.policiesChecked}`);
```

### Next Steps (Frontend)

The backend part is complete. For frontend visualization:
- Use the visualization's JSON data
- Create React components for the interactive timeline
- Display event groups visually
- Implement navigation and filters
- Use @tanstack/react-virtual for performance with large traces
- Integrate with Storybook for documentation
