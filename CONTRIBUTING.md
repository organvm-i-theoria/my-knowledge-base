# Contributing

Thanks for helping improve the knowledge base. This repo blends a TypeScript backend with a lightweight web UI, so changes typically touch `src/`, `web/`, and `tests/`.

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: 20+)
- npm 9+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/knowledge-base.git
cd knowledge-base

# Install dependencies
npm install

# Set up environment variables (optional - needed for AI features)
cp .env.example .env
# OPENAI_API_KEY    - Required for embeddings/semantic search
# ANTHROPIC_API_KEY - Required for Phase 3 Claude intelligence

# Initialize the database
npm run prepare-db

# Verify setup
npm test
```

## Project Structure

```
src/
├── database.ts              # SQLite operations
├── atomizer.ts              # Conversation atomization
├── types.ts                 # TypeScript interfaces
├── sources/                 # Data source integrations
│   ├── manager.ts           # Unified ingestion
│   ├── claude.ts            # Claude.app scraper
│   └── local.ts             # Local markdown
├── analytics/               # Search analytics
├── embeddings-service.ts    # OpenAI embeddings (Phase 2)
├── vector-database.ts       # ChromaDB storage
├── hybrid-search.ts         # FTS + semantic search
├── claude-service.ts        # Anthropic SDK (Phase 3)
├── api.ts                   # REST API endpoints
├── web-server.ts            # Express server
└── *-cli.ts                 # CLI entry points

web/                         # Static UI (HTML/CSS/JS)
tests/                       # Integration & E2E tests
scripts/                     # Operational tooling
docs/                        # Architecture, API, operations
```

## Development Commands

```bash
# Build & Run
npm run build                # Compile TypeScript
npm run dev                  # Run with tsx (hot reload)
npm run web                  # Serve web UI at http://localhost:3000
npm run start                # Run compiled output

# Database
npm run prepare-db           # migrate + seed (runs automatically before start/web/test)
npm run migrate              # Run migrations only
npm run seed                 # Seed sample data

# Testing
npm test                     # Run all tests
npm test -- --watch          # Watch mode
npm run test:ui              # Vitest UI
npm run test:coverage        # Coverage report

# Search
npm run search "query"           # Full-text search
npm run search:semantic "query"  # Semantic search
npm run search:hybrid "query"    # Combined search

# Phase 3 Intelligence
npm run extract-insights all --save
npm run smart-tag --limit 100 --save
npm run find-relationships --save
```

## Code Style

### TypeScript Guidelines

- Use ESM modules (`import`/`export`, not `require`)
- Strict mode is enabled in `tsconfig.json`
- Define explicit types for function parameters and return values
- Use interfaces for data structures (see `src/types.ts`)

### File Naming

- Use kebab-case for files: `hybrid-search.ts`
- CLI scripts end with `-cli.ts`: `smart-tag-cli.ts`
- Test files end with `.test.ts`: `api.test.ts`

### General Style

- Follow existing patterns in each file
- Keep formatting consistent with surrounding code
- Use descriptive names for files and modules
- Keep UI changes in `web/` and avoid adding frameworks unless discussed

## Testing Requirements

We use [Vitest](https://vitest.dev/) for testing. **Target 80%+ code coverage for new code.**

### Test Structure

- **Unit tests**: Place alongside source files as `src/foo.test.ts`
- **Integration tests**: Place in `tests/` directory
- **E2E tests**: Place in `tests/e2e-*.test.ts`

### Running Tests

```bash
npm test                           # All tests
npm test -- src/api.test.ts        # Single file
npm test -- --coverage             # With coverage report
npm run test:ui                    # Visual UI
```

### Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { searchUnits } from './search.js';

describe('searchUnits', () => {
  beforeEach(() => {
    // Setup test data
  });

  it('should return matching results', async () => {
    const results = await searchUnits('typescript');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('TypeScript');
  });
});
```

### Test Guidelines

- Add or update tests for behavior changes
- Name new test files with `.test.ts` and group by feature
- Call out any manual validation in your PR (e.g., "verified search filters in the UI")

## Database Migrations & Seeds

- `npm run prepare-db` runs automatically before `start`, `web`, and `test`
- Reapply seeds via `npm run seed` when resetting the database
- Keep schema history in `src/migrations.ts`; append new migrations instead of editing prior versions

## Web UI Verification

When making UI changes:

1. Confirm filters by toggling search categories and tag selections
2. Test tag add/remove via the detail modal
3. Verify admin dashboard counts and health indicators
4. Document the steps in your PR so reviewers can replay the flow

## Pull Request Process

1. **Create a branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Write/update tests** for your changes (80%+ coverage goal)

4. **Run the full test suite**:
   ```bash
   npm run build
   npm test
   npm run test:coverage
   ```

5. **Commit with conventional commits** (see format below)

6. **Push and create a PR** against `master`

7. **Fill out the PR template**:
   - Clear description of changes
   - Link related issues
   - List tests run
   - Add screenshots for UI changes

8. **Address review feedback** if requested

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Code change that neither fixes nor adds |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, tooling |
| `perf` | Performance improvement |

### Examples

```
feat(search): add fuzzy matching to hybrid search
fix(api): handle empty query parameter in search endpoint
docs: update API documentation for new endpoints
test(atomizer): add edge cases for code block extraction
chore(deps): update vitest to v4.0
perf(embeddings): batch API calls for 3x throughput
```

## Adding New Features

### New Phase 3 Analyzer

1. Create service in `src/`:
   ```typescript
   // src/my-analyzer.ts
   import { ClaudeService } from './claude-service.js';

   export class MyAnalyzer {
     constructor(private claude: ClaudeService) {}
     async analyze(content: string) { /* ... */ }
   }
   ```

2. Add CLI script: `src/my-analyzer-cli.ts`
3. Add npm script to `package.json`
4. Write tests: `src/my-analyzer.test.ts`

### New Data Source

1. Create source in `src/sources/`:
   ```typescript
   import { KnowledgeSource, Conversation } from './interface.js';

   export class MySource implements KnowledgeSource {
     async fetch(): Promise<Conversation[]> { /* ... */ }
   }
   ```

2. Register in `src/sources/manager.ts`

## Backup & Automation Checks

- Run `npm run backup` to exercise backup automation
- Test encrypted backups: `BACKUP_ENCRYPT=true BACKUP_ENCRYPTION_KEY=<key> npm run backup`
- Document backup success in your PR

## Getting Help

- **Documentation**: Check `docs/` for detailed guides
  - `docs/ARCHITECTURE.md` - System design
  - `docs/API_DOCUMENTATION.md` - API reference
  - `docs/DATABASE_SCHEMA.md` - Database structure
- **Issues**: Open a GitHub issue for bugs or feature requests
- **CLAUDE.md**: Quick reference for common commands

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
