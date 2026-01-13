# API Documentation

## Overview
The REST API exposes CRUD, search, intelligence, graph, export, deduplication, websocket, and rate-limit capabilities for the knowledge base.

## Base URL
- Local: `http://localhost:3000/api`

## Authentication
- `Authorization: Bearer <token>` for JWT
- `Authorization: ApiKey <key>` for API keys
- Some endpoints can be read-only without auth depending on deployment config.
 - Set `ENABLE_AUTH=true` to require auth context and enable field-level filtering.

## Response Format
- Success: `{ success, data, timestamp }`
- Errors: `{ error, code, statusCode, details? }`

## Pagination & Filtering
- Use `page` and `pageSize` for pagination on list endpoints.
- Search endpoints support filters/facets when enabled.

## Field-Level Access
- When `ENABLE_AUTH=true`, unauthenticated requests receive redacted unit fields.
- Sensitive fields include `context`, `keywords`, and `conversationId`.

## Endpoint Groups
- CRUD: `/units`, `/categories`, `/units/:id/tags`
- Search: `/search`, `/search/semantic`, `/search/hybrid`, `/search/suggestions`, `/search/analytics`, `/search/facets`
- Intelligence: `/intelligence/*`
- Graph: `/graph/*`
- Export: `/export/*`
- Deduplication: `/dedup/*`
- WebSocket: `/ws/*`
- Rate limits: `/rate-limit/*`

## Examples
```bash
curl "http://localhost:3000/api/search?q=embedding"
```

## References
- `docs/API_ENDPOINTS_SUMMARY.md`
- `docs/SEARCH_API.md`
- `docs/CLAUDE_INTELLIGENCE_API.md`
- `src/api.ts`
