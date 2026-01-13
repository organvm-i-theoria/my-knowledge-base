# Contributing

Thanks for helping improve the knowledge base. This repo blends a TypeScript backend with a lightweight web UI, so changes typically touch `src/`, `web/`, and `tests/`.

## Project Structure
- `src/` - Core services, API handlers, and CLI tooling.
- `web/` - Static UI (HTML/CSS/JS) served by `npm run web`.
- `tests/` - Vitest suites (unit, integration, E2E).
- `scripts/` - Operational tooling and performance helpers.
- `docs/` - Architecture, API, and operations references.

## Local Setup
1. Install Node.js 18+ and dependencies: `npm install`.
2. Configure `.env` if you need embeddings or hybrid search: `OPENAI_API_KEY` (optional) and `ANTHROPIC_API_KEY` (optional).

## Development Commands
- `npm run dev` - Run the API server with tsx.
- `npm run web` - Serve the web UI at `http://localhost:3000`.
- `npm run build && npm run start` - Build and run the compiled output.
- `npm run test` - Run the test suite.
- `npm run test:coverage` - Run tests with coverage.

## Coding Style
- Follow existing patterns in each file; keep formatting consistent with surrounding code.
- Use descriptive names for files and modules (for example, `src/backup.ts`, `scripts/backup.ts`).
- Keep UI changes in `web/` and avoid adding frameworks unless discussed.

## Testing Guidelines
- Add or update tests in `tests/` for behavior changes.
- Name new test files with `.test.ts` and group by feature.
- Call out any manual validation in your PR (for example, "verified search filters in the UI").

## Commits & Pull Requests
- Use Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`).
- Include a clear PR description, link related issues, and list tests run.
- Add screenshots or short clips for UI changes.
