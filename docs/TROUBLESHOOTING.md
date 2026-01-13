# Troubleshooting

## Missing API Keys
- Semantic search requires `OPENAI_API_KEY`.
- Intelligence endpoints require `ANTHROPIC_API_KEY`.

## ChromaDB Errors
- Ensure `atomized/embeddings/chroma` exists and is writable.
- Re-run `npm run generate-embeddings` if embeddings are missing.

## SQLite Locked
- Stop concurrent writers and retry.
- WAL mode is configured in `src/database.ts`.

## Export Failures
- Validate `raw/` paths and source credentials.
- For Claude exports, re-run `npm run export:dev`.

## References
- `docs/OPERATIONS.md`
- `src/database.ts`
