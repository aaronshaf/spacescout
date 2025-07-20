# SpaceScout Development Guidelines

## Code Quality Standards

### TypeScript Configuration
- ✅ `isolatedDeclarations: true` is enforced
- ✅ No `noExplicitAny` or implicit `any` types allowed
- ✅ Only `.ts`/`.tsx` files (no `.js`/`.jsx`)
- ✅ All linters and checks only process `.ts`/`.tsx` files

### Type Safety
- ❌ `as` typecasting is banned (except `as const` and `as unknown`)
- ✅ Enforced via ast-grep pre-commit hook
- ✅ Strict type checking enabled

### File Size Limits
- ⚠️ Warning: Files over 500 lines
- 🚫 Blocked: Files over 700 lines
- ✅ No noise for files under 500 lines
- ✅ Enforced in pre-commit and pre-push hooks

### Testing Requirements
- ✅ Unit test coverage threshold enforced (80% minimum)
- ✅ All tests must pass before commit/push
- ✅ Playwright E2E tests included
- ✅ Exclude generated code and `tmp/` from coverage

### Code Quality Checks
All of these run on pre-commit and pre-push hooks:
1. TypeScript type checking
2. Unit tests with coverage
3. Playwright tests
4. Biome linting
5. Biome formatting
6. File size checks
7. ast-grep rules

### Excluded Paths
The following are excluded from linting, type-checking, and testing:
- `node_modules/`
- `dist/`
- `build/`
- `tmp/`
- `*.generated.ts`
- `src-tauri/target/`

## Security Requirements

### Data Protection
- ❌ No sensitive data in commits
- ❌ No API keys, tokens, or credentials
- ✅ All secrets in environment variables
- ✅ `.env` files in `.gitignore`

### Error Handling
- ✅ Regional error boundaries in React
- ✅ Errors provide debugging info without sensitive data
- ✅ Structured error logging
- ❌ Never expose file system paths in production errors

### Application Security
- ✅ Minimal file system permissions
- ✅ No network requests (offline-only app)
- ✅ Sandboxed file operations
- ✅ Input validation for all paths

## Development Workflow

### Pre-commit Hooks
```bash
# Never use --no-verify
# All commits must pass:
- TypeScript type checking
- Biome linting
- Biome formatting
- Unit tests with coverage
- ast-grep type casting checks
- File size checks
```

### Pre-push Hooks
```bash
# All pushes must pass:
- All pre-commit checks
- Playwright E2E tests
- Full test suite
```

## GitHub Actions Optimization

### Workflow Structure
1. **Fast checks first** (parallel):
   - Type checking
   - Linting
   - Unit tests

2. **Expensive checks** (after fast checks pass):
   - E2E tests
   - Tauri builds
   - Release builds

### Performance Optimizations
- ✅ Dependency caching with Bun
- ✅ Parallel job execution
- ✅ Conditional E2E tests
- ✅ Incremental builds

### Cache Strategy
- Bun cache for dependencies
- Rust/Cargo cache for Tauri
- Build artifact caching
- Test result caching

## Error Boundary Implementation

```typescript
// Every major component should be wrapped
<ErrorBoundary fallback={<ErrorFallback />}>
  <Component />
</ErrorBoundary>
```

### Error Logging
- Development: Full stack traces
- Production: Sanitized messages
- Never log user paths or personal data

## Commit Standards
- ✅ Conventional commits enforced
- ✅ All checks must pass
- ❌ Never use `--no-verify`
- ✅ Signed commits recommended

## File Organization
- Feature-based structure
- Colocate tests with source
- Shared types in `types/`
- Reusable hooks in `hooks/`

## Performance Guidelines
- Lazy load heavy components
- Memoize expensive calculations
- Virtual scrolling for large lists
- Progressive data loading

Remember: Quality over speed. Never bypass checks!

## Project Status
- ✅ No sensitive data in commits (enforced via .gitignore)
- ✅ All checks run on pre-commit and pre-push hooks
- ✅ 80% code coverage enforced in vitest.config.ts
- ✅ Formatter runs automatically in pre-commit
- ✅ No implicit any (TypeScript strict mode + Biome rule)
- ✅ isolatedDeclarations: true in tsconfig.json
- ✅ ast-grep bans 'as' typecasting (except 'as const' and 'as unknown')
- ✅ Only .ts/.tsx files allowed (configured in biome.json)
- ✅ File size limits enforced (500 line warning, 700 line error)
- ✅ Generated code excluded from all checks
- ✅ Husky hooks configured for pre-commit and pre-push
- ✅ Effect and Effect Schema used for data validation
- ✅ TanStack Router and Query integrated
- ✅ D3 treemap visualization implemented

## Current Implementation
- Basic Tauri + React + TypeScript project structure
- File system scanner in Rust
- Effect-based service layer
- TanStack Router for navigation
- TanStack Query for async state
- D3 treemap visualization
- Basic UI with home and scan views