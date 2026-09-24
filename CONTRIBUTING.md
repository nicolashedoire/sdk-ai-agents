# Contributing to SDK_AI_Agents

## Development Setup

```bash
npm install
npm run build
npm test
```

## Code Style

We use Biome for linting and formatting:

```bash
npm run check          # Check lint + format
npm run check:fix      # Auto-fix issues
npm run lint           # Lint only
npm run format         # Format only
```

## Testing

```bash
npm test               # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage
```

## Releasing

Versions are published to npm by the `Release` GitHub Actions workflow when a `vX.Y.Z` tag is pushed; `npm run verify` runs the same checks locally. The steps (version, changelog, tag, npm token or trusted publishing) are in [docs/contributing/releasing.md](docs/contributing/releasing.md).

## Architecture Principles

1. **Event-Sourcing First** : Every action generates an event
2. **Deny-by-Default** : Security by impossibility, not configuration
3. **Separation of Concerns** : Reasoning Engine ≠ Action Engine
4. **Type Safety** : Full TypeScript strict mode
5. **Testability** : All components are testable in isolation

## Adding New Features

1. Update types in `src/types/`
2. Implement component in appropriate directory
3. Add tests in `src/__tests__/`
4. Update documentation
5. Ensure all tests pass

## Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `chore:` Maintenance


