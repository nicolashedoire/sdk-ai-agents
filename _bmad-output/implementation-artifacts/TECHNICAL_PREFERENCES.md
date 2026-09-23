# Technical Preferences

## Front-End Stack

For all stories involving front-end development, use:

### Technical Stack

- **Storybook**: Version 10
  - For developing and documenting UI components
  - Configuration and setup following Storybook 10 best practices

- **Tailwind CSS**: Latest stable version
  - For styling and the design system
  - Configuration following standard Tailwind conventions

- **shadcn/ui**: Latest version
  - Reusable UI components based on Radix UI
  - Installation and configuration per the official documentation
  - Use shadcn/ui components for the interface

### Affected Stories

The following stories will likely require front-end work:

**Epic 13 - Cognitive Observability:**
- Story 13.1: Visualizable Reasoning Graph
- Story 13.2: Alternatives Considered by the Agent
- Story 13.3: Decision Patterns Across Multiple Runs
- Story 13.4: Trace Visualization

**Phase 4 (Future):**
- Web UI/Dashboard (mentioned in the PRD)

### Implementation Notes

- All UI components must be developed in Storybook first
- Use shadcn/ui components as the base
- Tailwind CSS for custom styling
- Ensure responsiveness and accessibility
- Document components in Storybook

### References

- Storybook 10: https://storybook.js.org/
- Tailwind CSS: https://tailwindcss.com/
- shadcn/ui: https://ui.shadcn.com/


