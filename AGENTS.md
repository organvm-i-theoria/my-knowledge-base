# Repository Guidelines

Global policy: /Users/4jp/AGENTS.md applies and cannot be overridden.

## Project Structure & Module Organization
- `src/` contains the TypeScript source, organized by capability (core, phase2, phase3, api, features, middleware).
- Tests live alongside code as `src/*.test.ts` and in `tests/` for endpoint coverage.
- `raw/` stores imported conversation/doc exports; `atomized/` stores derived Markdown/JSON output.
- `db/` holds the SQLite database; `dist/` is build output from `npm run build`.
- `docs/`, `scripts/`, and `web/` provide documentation, automation, and UI scaffolding.

## Build, Test, and Development Commands
- `npm run dev` runs the app from `src/` with tsx (fast iteration).
- `npm run build` compiles to `dist/`; `npm run start` runs the compiled entrypoint.
- `npm run export:dev` performs a local export from Claude.app (browser needed).
- `npm run search "query"`, `npm run search:semantic "query"`, `npm run search:hybrid "query"` run CLI search modes.
- `npm run test`, `npm run test:coverage`, `npm run test:ui` run Vitest suites.

## Coding Style & Naming Conventions
- TypeScript, ESM modules, `strict` mode (see `tsconfig.json`).
- Use 2-space indentation and semicolons; prefer single quotes as in existing files.
- File names are kebab-case (e.g., `smart-tagger.ts`); classes PascalCase; functions/vars camelCase.
- Follow existing patterns in `src/` for service classes and CLI entrypoints.

## Testing Guidelines
- Vitest is the standard test runner; keep unit tests close to sources.
- Name tests `*.test.ts` and colocate when practical (example: `src/insight-extractor.test.ts`).
- Target 85%+ coverage when adding new behavior; update or add tests with feature work.

## Commit & Pull Request Guidelines
- Use Conventional Commit-style subjects: `feat:`, `fix:`, `docs:`, `chore:` (see recent history).
- PRs should include a short summary, testing notes, and linked issues if applicable.
- Add screenshots or recordings for UI changes under `web/`.

## Security & Configuration
- Required env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (use `.env`, never commit secrets).
- Local data lives in `db/`, `raw/`, and `atomized/`; keep generated files out of PRs unless required.
