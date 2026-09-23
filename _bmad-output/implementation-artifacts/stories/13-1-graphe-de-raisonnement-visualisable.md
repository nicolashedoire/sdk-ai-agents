# Story 13.1: Visualizable Reasoning Graph

**Story ID:** 13.1  
**Epic:** 13 - Cognitive Observability  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to visualize the agent's reasoning graph,
**So that** I can understand how the agent thought.

## Acceptance Criteria

**Given** an agent execution
**When** I retrieve the reasoning graph
**Then** I can see the reasoning steps
**And** the connections between decisions are visible
**And** the graph is exportable (JSON, Graphviz, etc.)

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
- Interactive visualization of the reasoning graph
- Export in multiple formats (JSON, Graphviz)

**Files concerned:**
- React components in `src/components/` or `src/ui/`
- Storybook stories in `.storybook/`
- Tailwind CSS styles
- shadcn/ui components for the interface

### Implementation

**Components to create:**
- `ReasoningGraph` - Main visualization component
- `GraphNode` - Graph node (decision/intention)
- `GraphEdge` - Connection between nodes
- `GraphControls` - Navigation controls (zoom, pan, etc.)
- `GraphExport` - Graph export

**Recommended libraries:**
- `react-flow` or `vis-network` for graph rendering
- shadcn/ui components for controls (Button, Dialog, etc.)
- Tailwind CSS for styling

**Storybook:**
- Create stories for each component
- Document props and states
- Usage examples with real data

## Library & Framework Requirements

### Required Front-End Dependencies

**Storybook:**
- `@storybook/react` v10.x
- `@storybook/addon-essentials` v10.x
- Storybook 10 configuration following best practices

**Tailwind CSS:**
- `tailwindcss` latest stable version
- `postcss` and `autoprefixer`
- Tailwind configuration with a custom theme if needed

**shadcn/ui:**
- Installation via `npx shadcn-ui@latest init`
- Required components: Button, Dialog, Card, Tabs, etc.
- Configuration per official documentation

**Visualization libraries:**
- `react-flow` or `@visx/network` for the graph
- `d3` or `cytoscape` for advanced visualization (optional)

### Installation

```bash
# Storybook
npx storybook@latest init

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init

# Visualization libraries
npm install react-flow
# or
npm install @visx/network
```

## File Structure Requirements

```
src/
  components/
    reasoning-graph/
      ReasoningGraph.tsx      # Main component
      GraphNode.tsx            # Node component
      GraphEdge.tsx            # Connection component
      GraphControls.tsx        # Navigation controls
      GraphExport.tsx          # Graph export
      index.ts                 # Exports
  ui/                         # shadcn/ui components
    button.tsx
    dialog.tsx
    card.tsx
    tabs.tsx
    ...
.storybook/
  main.ts                     # Storybook 10 configuration
  preview.ts                  # Preview configuration
stories/
  ReasoningGraph.stories.tsx   # Storybook stories
  GraphNode.stories.tsx
  ...
tailwind.config.js            # Tailwind configuration
postcss.config.js             # PostCSS configuration
```

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: Strict TypeScript
3. **Event-sourcing**: Events traced
4. **Security**: Deny-by-default respected
5. **Reusable components**: shadcn/ui for consistency

## Testing Requirements

- ✅ Unit tests for React components
- ✅ Storybook tests with interactions
- ✅ Integration tests with real data
- ✅ Accessibility tests (a11y)
- ✅ Performance tests with large graphs

## Story Completion Status

**Status:** review  
**Implementation:** Backend completed - Reasoning graph generation and export  
**Notes:** Backend part implemented. Frontend visualization (React/Storybook) can be added separately.

## Implementation Details (Backend)

### Components Created

1. **ReasoningGraph Types** (`src/types/reasoning-graph.ts`)
   - `ReasoningNode`: Represents a graph node (intention, action, tool, policy, decision, start, end)
   - `ReasoningEdge`: Represents a connection between nodes (leads_to, triggers, validates, rejects, approves)
   - `ReasoningGraph`: Complete graph structure with metadata

2. **ReasoningGraphBuilder** (`src/utils/reasoning-graph-builder.ts`)
   - `buildFromEvents()`: Builds the reasoning graph from a sequence of events
   - Extracts intentions, actions, tools, policies, and decisions from events
   - Creates connections between nodes according to temporal sequence
   - Handles approval workflows and policy checks

3. **ReasoningGraphExporter** (`src/utils/reasoning-graph-export.ts`)
   - `toJSON()`: Export in JSON format (with pretty-print option)
   - `toGraphviz()`: Export in Graphviz DOT format for visualization
   - Supports customization options (direction, nodeShape, nodeStyle)
   - Correctly escapes special characters in labels

4. **SDK Methods** (`src/sdk.ts`)
   - `getReasoningGraph(runId)`: Retrieves the reasoning graph for a run
   - `exportReasoningGraph(runId, format)`: Exports the graph as JSON or Graphviz

### Supported Node Types

- **start**: Beginning of an execution (`run.started`)
- **intention**: Intention generated by the LLM (`intention.generated`)
- **action**: Action executed (`action.executing`, `action.executed`)
- **tool**: Tool call (`tool.called`)
- **policy**: Policy check (`policy.checked`)
- **decision**: Decision made (approval requests, approvals, rejections)
- **end**: End of execution (`run.completed`, `run.failed`, `run.cancelled`)

### Supported Edge Types

- **leads_to**: Normal sequential connection
- **triggers**: One action triggers another
- **validates**: A policy validates an intention
- **rejects**: A policy or approval rejects an action
- **approves**: An approval approves an action

### Tests

- **Unit Tests**: `src/__tests__/reasoning-graph.test.ts` (9 tests, all passing)
  - Tests for building the graph from events
  - Tests for different node and edge types
  - Tests for approval workflows
  - Tests for JSON and Graphviz export

- **Integration Tests**: `src/__tests__/sdk-reasoning-graph.test.ts` (4 tests, all passing)
  - Tests for `getReasoningGraph()` via SDK
  - Tests for `exportReasoningGraph()` in JSON and Graphviz
  - Tests for error handling

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: 'your-api-key' });

// Get reasoning graph
const graph = await sdk.getReasoningGraph('run-123');

// Export to JSON
const json = await sdk.exportReasoningGraph('run-123', 'json');

// Export to Graphviz (can be visualized with Graphviz tools)
const dot = await sdk.exportReasoningGraph('run-123', 'graphviz');
console.log(dot);
// Can be saved to file and visualized: dot -Tpng graph.dot -o graph.png
```

### Next Steps (Frontend)

The backend part is complete. For frontend visualization:
- Use the graph's JSON data
- Create React components with react-flow or vis-network
- Integrate with Storybook for documentation
- Use Tailwind CSS and shadcn/ui for styling
