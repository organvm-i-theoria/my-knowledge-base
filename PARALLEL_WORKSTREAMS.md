# Parallel Workstreams for AI Agent Handoff

**Created:** 2026-01-27
**Status:** 215/255 tasks (84%) complete
**Remaining:** 40 tasks across 6 categories

This document defines parallelizable workstreams for Gemini, Codex, and Copilot agents.

---

## Workstream Overview

| # | Workstream | Tasks | Best For | Est. Complexity |
|---|------------|-------|----------|-----------------|
| A | React Migration | 8 | **Codex** | High |
| B | Test Expansion | 6 | **Codex/Copilot** | Medium |
| C | Performance & Caching | 8 | **Codex** | Medium |
| D | Security Hardening | 5 | **Codex** | Medium |
| E | Integrations | 5 | **Gemini+Codex** | Medium |
| F | Monitoring & Observability | 4 | **Codex** | Low-Medium |

All workstreams are **independent** and can run in parallel.

---

## Workstream A: React Migration (Codex)

**Goal:** Migrate vanilla JS web UI to React + TypeScript

### Prerequisites
- Read: `web/index.html`, `web/js/app.js`, `web/css/styles.css`
- Understand current API calls to `/api/*`

### Tasks

1. **Setup React project** (create `web-react/` directory)
   ```bash
   npx create-vite@latest web-react --template react-ts
   cd web-react && npm install
   npm install @tanstack/react-query zustand tailwindcss
   ```

2. **Port CSS to Tailwind**
   - Convert `web/css/styles.css` CSS variables to Tailwind config
   - Keep dark mode support (already implemented)

3. **Create core components**
   - `SearchBar.tsx` - with autocomplete (port from app.js lines 189-305)
   - `UnitCard.tsx` - result card component (port from app.js lines 547-581)
   - `UnitModal.tsx` - detail view modal (port from app.js lines 583-647)
   - `GraphVisualization.tsx` - D3.js graph (port from app.js lines 777-906)
   - `TagManager.tsx` - tag CRUD (port from app.js lines 649-692)

4. **Create pages**
   - `SearchPage.tsx` - main search interface
   - `GraphPage.tsx` - knowledge graph
   - `TagsPage.tsx` - tag browser
   - `AdminPage.tsx` - dashboard + export
   - `SettingsPage.tsx` - user preferences (NEW)

5. **State management with Zustand**
   ```typescript
   // stores/searchStore.ts
   interface SearchState {
     query: string;
     results: SearchResult[];
     mode: 'fts' | 'semantic' | 'hybrid';
     filters: SearchFilters;
   }
   ```

6. **API integration with React Query**
   - Create hooks: `useSearch`, `useUnits`, `useTags`, `useGraph`
   - Handle loading/error states

7. **Real-time notifications**
   - WebSocket integration for live updates
   - Toast notifications (already have CSS)

8. **Build integration**
   - Update `package.json` to build React app
   - Serve from Express in production

### Deliverables
- `web-react/` directory with full React app
- Updated `src/web-server.ts` to serve React build
- All existing functionality preserved

### Verification
```bash
cd web-react && npm run build
npm run web  # Should serve React app
```

---

## Workstream B: Test Expansion (Codex/Copilot)

**Goal:** Increase test coverage for untested/under-tested modules

### Current Coverage Gaps
Run `npm run test:coverage` to see current gaps.

### Tasks

1. **Source adapter tests** (if not complete)
   - `src/sources/claude.test.ts` - mock Playwright
   - `src/sources/gemini.test.ts` - mock Playwright
   - `src/sources/google-docs.test.ts` - mock OAuth

2. **API endpoint tests**
   - `src/export-api.test.ts` - test all 6 export endpoints
   - `src/graph-api.test.ts` - test graph traversal endpoints
   - `src/websocket-api.test.ts` - test WebSocket endpoints

3. **Integration tests**
   - `tests/full-pipeline.test.ts` - export → atomize → store → search
   - `tests/concurrent-access.test.ts` - multi-user scenarios

4. **Edge case tests**
   - Empty database scenarios
   - Large dataset handling (10K+ units)
   - Special characters in content
   - Unicode handling

5. **Performance tests**
   - Search latency benchmarks
   - Embedding generation throughput
   - Memory usage under load

6. **Snapshot tests for exports**
   - CSV, JSON, HTML, Markdown output stability

### Test Pattern
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should handle expected case', () => {
    // Test
  });

  it('should handle edge case', () => {
    // Test
  });
});
```

### Deliverables
- Test files in `src/` alongside modules
- Integration tests in `tests/`
- Coverage report showing 80%+ coverage

### Verification
```bash
npm run test:coverage
# Target: 80%+ line coverage
```

---

## Workstream C: Performance & Caching (Codex)

**Goal:** Implement Redis caching and optimize database queries

### Tasks

1. **Redis cache layer**
   - Add `ioredis` dependency
   - Create `src/redis-cache.ts`
   ```typescript
   interface CacheService {
     get<T>(key: string): Promise<T | null>;
     set<T>(key: string, value: T, ttl?: number): Promise<void>;
     invalidate(pattern: string): Promise<void>;
   }
   ```

2. **Cache search results**
   - Cache FTS results (5 min TTL)
   - Cache semantic results (10 min TTL)
   - Invalidate on unit create/update/delete

3. **Database indexing**
   - Analyze slow queries with `EXPLAIN QUERY PLAN`
   - Add indexes to `atomic_units`:
     - `idx_units_category` on `category`
     - `idx_units_type` on `type`
     - `idx_units_timestamp` on `timestamp`
   - Add composite indexes for common filters

4. **Connection pooling**
   - Configure SQLite connection pool
   - Add connection health checks

5. **Vector search optimization**
   - Implement vector quantization (if using ChromaDB)
   - Add approximate nearest neighbor (ANN) config

6. **HTTP response caching**
   - Add ETag headers for GET requests
   - Add Cache-Control headers
   - Implement conditional requests (304 Not Modified)

7. **Memory optimization**
   - Configure Node.js heap limits
   - Implement streaming for large exports
   - Add GC tuning flags

8. **Pagination optimization**
   - Cursor-based pagination for large datasets
   - Efficient COUNT queries

### Configuration
```typescript
// src/config.ts additions
interface CacheConfig {
  redis: {
    host: string;
    port: number;
    ttl: {
      search: number;
      units: number;
      tags: number;
    };
  };
}
```

### Deliverables
- `src/redis-cache.ts` with full implementation
- Database migration for new indexes
- Updated API handlers with caching

### Verification
```bash
# Start Redis locally
docker run -d -p 6379:6379 redis:alpine

# Run performance tests
npm run benchmark
```

---

## Workstream D: Security Hardening (Codex)

**Goal:** Implement encryption at rest and compliance features

### Tasks

1. **Encryption at rest**
   - Add `better-sqlite3-sqlcipher` or similar
   - Encrypt sensitive fields in database
   - Key management via environment variables

2. **Field-level encryption**
   - Encrypt `content` and `context` fields
   - Transparent decrypt on read

3. **GDPR compliance**
   - `DELETE /api/users/:id/data` - delete all user data
   - `GET /api/users/:id/export` - export user data (DSAR)
   - Data retention policy enforcement

4. **Security headers**
   - Add Helmet.js middleware
   - Configure CSP, HSTS, X-Frame-Options

5. **Input validation**
   - Add Zod or Joi schemas for all API inputs
   - Sanitize HTML in content fields

### Implementation
```typescript
// src/encryption.ts
import crypto from 'crypto';

export class FieldEncryption {
  private key: Buffer;

  encrypt(plaintext: string): string { /* ... */ }
  decrypt(ciphertext: string): string { /* ... */ }
}
```

### Deliverables
- `src/encryption.ts` - field encryption service
- `src/gdpr.ts` - GDPR compliance endpoints
- Updated migrations for encrypted fields
- Security documentation

### Verification
```bash
# Run security audit
npm audit
# Run OWASP checks if available
```

---

## Workstream E: Integrations (Gemini Design + Codex Implementation)

**Goal:** Add external service integrations

### Tasks

1. **Obsidian vault sync** (Gemini: design, Codex: implement)
   - Export units as markdown files with YAML frontmatter
   - Support bidirectional sync
   - Preserve internal links as `[[wikilinks]]`

   ```typescript
   // src/integrations/obsidian.ts
   interface ObsidianSync {
     exportVault(path: string): Promise<void>;
     importVault(path: string): Promise<ImportResult>;
     watchVault(path: string, callback: SyncCallback): void;
   }
   ```

2. **Slack notifications**
   - Webhook integration for events
   - Configurable triggers (new insights, relationships)

   ```typescript
   // src/integrations/slack.ts
   interface SlackNotifier {
     sendMessage(channel: string, message: SlackMessage): Promise<void>;
     onUnitCreated(unit: AtomicUnit): void;
     onInsightExtracted(insight: Insight): void;
   }
   ```

3. **Zapier webhook endpoint**
   - Generic webhook for Zapier triggers
   - Support custom payload formats

4. **Notion sync** (stretch goal)
   - Export to Notion databases
   - Import from Notion exports

5. **GitHub integration**
   - Sync code units to gists
   - Link to repository references

### Deliverables
- `src/integrations/` directory with all integrations
- Configuration in `.env` for API keys
- Integration tests
- Documentation

### Verification
```bash
# Test Obsidian export
npm run export-obsidian -- --path=/path/to/vault

# Test Slack (with test webhook)
npm run test:integrations
```

---

## Workstream F: Monitoring & Observability (Codex)

**Goal:** Add error tracking and metrics

### Tasks

1. **Sentry error tracking**
   - Add `@sentry/node` dependency
   - Configure error boundaries
   - Add breadcrumbs for debugging

2. **Prometheus metrics**
   - Add `prom-client` dependency
   - Create `GET /metrics` endpoint
   - Track: request count, latency, cache hits, error rate

3. **Health checks**
   - Enhanced `GET /api/health` with dependencies
   - Database connectivity check
   - ChromaDB connectivity check
   - Redis connectivity check (if implemented)

4. **Logging improvements**
   - Structured JSON logging
   - Log correlation IDs
   - Log level configuration

### Implementation
```typescript
// src/metrics.ts
import { Counter, Histogram, Registry } from 'prom-client';

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status']
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path']
});
```

### Deliverables
- `src/metrics.ts` - Prometheus metrics
- `src/sentry.ts` - Sentry integration
- Updated `src/web-server.ts` with middleware
- Grafana dashboard JSON (in `monitoring/`)

### Verification
```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Verify Sentry (trigger test error)
npm run test:sentry
```

---

## Quick Start for Each Agent

### For Gemini (Design & Documentation)
```
Focus: Workstream E (Integration design)

1. Read existing code:
   - src/sources/manager.ts (source integration pattern)
   - src/data-export.ts (export patterns)

2. Design specifications for:
   - Obsidian sync architecture
   - Slack webhook events
   - Zapier payload formats

3. Output: Design docs in docs/integrations/
```

### For Codex (Implementation)
```
Focus: Workstreams A, B, C, D, F (any)

1. Read CLAUDE.md for project context
2. Pick a workstream above
3. Follow task list in order
4. Run tests after each task

Commands:
  npm run build     # Verify TypeScript
  npm test          # Run tests
  npm run web       # Test web server
```

### For Copilot (Tests & Small Tasks)
```
Focus: Workstream B (Tests)

1. Run: npm run test:coverage
2. Find modules with < 80% coverage
3. Add tests following existing patterns
4. Target: 80%+ coverage overall
```

---

## Coordination Notes

- **No blocking dependencies** between workstreams
- Each workstream produces isolated deliverables
- Merge order doesn't matter
- Run full test suite before merging: `npm test`

## Files NOT to Modify (Shared State)

- `package.json` - coordinate dependency additions
- `src/web-server.ts` - core routing (unless React migration)
- `src/database.ts` - schema changes need migration
- `DEVELOPMENT_ROADMAP.md` - update after completion

---

*Last updated: 2026-01-27 by Claude Opus 4.5*
