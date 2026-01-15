# Repository Guidelines

Global policy: /Users/4jp/AGENTS.md applies and cannot be overridden.

## Project Structure & Module Organization
- `src/` contains the TypeScript application logic: services, features, API handlers, and phase-specific modules.
- `tests/` provides higher-level Vitest suites that exercise API contracts; unit tests sit next to implementation files in `src/*.test.ts`.
- `web/` hosts the React-based UI, `docs/` holds contributing/operations guides, and `scripts/` automates local workflows (backup, migration, export).
- Data and generated artifacts live under `db/`, `raw/`, `atomized/`, and `dist/` once builds are emitted.
- Keep service code modular by following the current capability grouping (e.g., search, analytics, admin) so features remain discoverable.

## Build, Test, and Development Commands
- `npm run dev` runs the TypeScript server with hot reload for rapid iteration.
- `npm run build` compiles everything into `dist/`; `npm run start` launches the compiled output.
- `npm run test` executes Vitest suites, while `npm run test:coverage` collects coverage reports and `npm run test:ui` validates UI helpers.
- UI-specific tasks include `npm run web` (starts the React app) and `npm run backup` (triggers backup automation; `BACKUP_ENCRYPT=true` enables encryption).
- Database helpers: `npm run migrate` applies schema changes and `npm run seed` populates sample data; invoke `npm run migrate && npm run seed` before running the web server or tests when schema drift is suspected.

## Coding Style & Naming Conventions
- TypeScript, ESM modules, and `strict` mode per `tsconfig.json`; prefer 2-space indentation and semicolons.
- Files use kebab-case, classes use PascalCase, and functions/variables follow camelCase.
- Emphasize small services with clear responsibility (e.g., `smart-tagger.ts`, `insight-extractor.ts`) to keep imports readable.
- Run formatting/linting via `npm run lint` when adding code; matching existing patterns is critical for maintainability.

## Testing Guidelines
- Vitest is the default runner; keep tests close to sources using `*.test.ts`.
- Name suites to match their feature (e.g., `src/semantic-chunker.test.ts`) and update fixtures when schema changes touch analytics or API behavior.
- Reuse existing mocks for Claude/OpenAI APIs to avoid flakiness; ensure rate-limit and token-stat assertions align with the injected delays.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- PRs should include a short summary, list of tests run, and links to related issues or cards; include screenshots for UI work (`web/`) when relevant.
- Keep generated files out of VCS unless part of a documented workflow (`db/` dumps require justification).

## Deployment & Operation Notes
- Documented workflows reside in `docs/CONTRIBUTING.md` and `docs/OPERATIONS.md`; link to them when adding new automation.
- CI should run `npm run migrate && npm run seed` before tests to keep analytic suites stable.
- Backup automation runs via `npm run backup`; a passing review mentions whether encryption (`BACKUP_ENCRYPT=true`) was exercised.
