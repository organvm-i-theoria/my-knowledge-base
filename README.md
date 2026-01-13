# Knowledge Base System

A sophisticated TypeScript knowledge base that exports Claude.app conversations, atomizes them into semantic knowledge units, and provides multi-layered search and AI-powered intelligence extraction.

**[→ View Development Roadmap](./DEVELOPMENT_ROADMAP.md)** | **[→ View Technical Docs](./CLAUDE.md)** | **[→ View Implementation Summary](./COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md)**

---

## Quick Links

### Development
- 📋 **[DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md)** — 235-item comprehensive task list (151 completed, 84 pending)
- 📖 **[CLAUDE.md](./CLAUDE.md)** — Project overview, architecture, and development commands
- 📋 **[CLI_REFERENCE.md](./CLI_REFERENCE.md)** — Command reference for all npm scripts

### Phase Documentation
- **Phase 2:** [SEARCH_API.md](./docs/SEARCH_API.md) — Semantic search API reference
- **Phase 3:** [CLAUDE_INTELLIGENCE_API.md](./docs/CLAUDE_INTELLIGENCE_API.md) — Intelligence API reference
- **Phase 3:** [PHASE3_COMPLETION.md](./docs/PHASE3_COMPLETION.md) — Phase 3 completion report

### Implementation Details
- 📚 **[COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md](./COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md)** — Detailed summary of all 9 core features implemented

---

## Current Status

**Intelligence Complete: 100% ✅** | **Total: 64% (151/235 tasks)**

| Component | Status | Tasks |
|-----------|--------|-------|
| Core Features | ✅ Complete | 9/9 |
| Phase 1: Export & Atomization | ✅ Complete | 15/15 |
| Phase 2: Semantic Intelligence | ✅ Complete | 22/22 |
| Phase 3: Claude Intelligence | ✅ Complete | 24/24 |
| API Endpoints | ✅ Complete | 38/38 |
| Web UI | ⏳ Not Started | 0/20 |

---

## Technology Stack

- **Backend**: Node.js + TypeScript (ESM)
- **Database**: SQLite + ChromaDB (vector store)
- **APIs**: Anthropic SDK (Claude) + OpenAI SDK (embeddings)
- **Web Framework**: Express.js
- **Real-time**: WebSocket protocol
- **Testing**: Vitest (200+ test cases, 85%+ coverage)

---

## Key Features (Implemented)

### ✅ Core Features (9/9)
1. **Knowledge Graph Visualization** — Graph-based knowledge discovery
2. **WebSocket Real-Time Updates** — Live event streaming
3. **Smart Data Export** — 5 export formats (CSV, JSON, JSON-LD, Markdown, NDJSON)
4. **Intelligent Deduplication** — Levenshtein + Jaccard similarity
5. **Per-User Rate Limiting** — 4-tier system (Free/Basic/Pro/Enterprise)
6. **Authentication & Authorization** — JWT + API keys, RBAC
7. **Phase 1 Export** — Claude.app scraping + document ingestion
8. **Phase 1 Atomization** — 5 strategies for breaking content into units
9. **Database Layer** — SQLite with optimizations

### 🔄 In Progress

#### Web UI & Platform Hardening
- Web UI foundation and core pages
- Security hardening (CORS, HTTPS, encryption at rest)
- Documentation completion (API, architecture, ops)

#### Phase 3: Claude Intelligence ✅ Complete
**Core Features:**
- ✅ Insight extraction with batch processing
- ✅ Smart context-aware tagging with concurrent processing
- ✅ Relationship detection (vector + Claude validation)
- ✅ Conversation summarization with executive summaries

**Infrastructure & Tools:**
- ✅ Advanced batch processor with progress bars and checkpoint resumability
- ✅ Insight ranking system (multi-criteria scoring)
- ✅ Tag deduplication with Levenshtein distance
- ✅ Hierarchical tag visualization (ASCII, JSON, Mermaid)

**REST API Endpoints:**
- ✅ GET `/api/intelligence/insights` - List insights with pagination and ranking
- ✅ POST `/api/intelligence/insights/extract` - Extract on demand
- ✅ GET `/api/intelligence/tags/suggestions` - Smart tag suggestions
- ✅ GET/POST `/api/intelligence/relationships` - Relationship management
- ✅ GET `/api/intelligence/health` - Service health monitoring

**Cost Optimization:**
- ✅ Prompt caching: 90% token cost savings
- ✅ Per-operation cost: $0.32 → $0.034 (cached)

#### API Endpoints (14/38)
All CRUD, search, graph, export, deduplication, rate limiting endpoints

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

### Installation
```bash
npm install
npm run build
```

### Development
```bash
npm run dev                              # Run with tsx
npm run build && npm run start           # Run compiled version
npm run test                             # Run tests
npm run test:watch                       # Watch mode
```

### Search Commands
```bash
npm run search "query"                   # Full-text search
npm run search:semantic "query"          # Semantic search
npm run search:hybrid "query"            # Combined search
```

---

## Architecture Overview

### Three-Phase System

**Phase 1: Foundation** (Export & Atomization)
- Scrapes Claude.app conversations or ingests markdown files
- Breaks conversations into atomic knowledge units
- Stores in SQLite with full-text search index

**Phase 2: Semantic Intelligence** (Vector Search)
- Generates embeddings via OpenAI
- Stores vectors in ChromaDB
- Enables semantic similarity search with Reciprocal Rank Fusion

**Phase 3: Claude Intelligence** (AI Analysis)
- Extracts key insights using Claude
- Auto-generates smart tags
- Detects relationships between units
- Creates conversation summaries
- Prompt caching: 90% token cost savings

---

## Project Structure

```
src/
├── core/                    # Core data services
│   ├── database.ts         # SQLite operations
│   ├── atomizer.ts         # Content atomization
│   └── types.ts            # TypeScript interfaces
├── phase2/                  # Semantic search
│   ├── embeddings-service.ts
│   ├── vector-database.ts
│   └── hybrid-search.ts
├── phase3/                  # Claude intelligence
│   ├── insight-extractor.ts
│   ├── smart-tagger.ts
│   ├── relationship-detector.ts
│   └── conversation-summarizer.ts
├── features/                # Advanced features
│   ├── knowledge-graph.ts
│   ├── deduplication.ts
│   ├── user-rate-limiter.ts
│   └── websocket-manager.ts
├── api/                     # REST endpoints
│   ├── graph-api.ts
│   ├── export-api.ts
│   ├── deduplication-api.ts
│   └── ...
└── middleware/              # Express middleware
    ├── auth.ts
    └── rate-limit-middleware.ts
```

---

## Next Steps

### Immediate Priority (Next 1-2 Sessions)
1. Complete Phase 2 semantic search features
2. Implement core CRUD API endpoints
3. Build Web UI foundation (React/Vue)

### Short-term (2-4 Sessions)
1. Complete Phase 3 intelligence features
2. Web UI core pages
3. Integration test suite
4. Deployment infrastructure (Docker/K8s)

### See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) for the complete 235-item list

---

## Development Standards

### Code Quality
- TypeScript with strict mode
- ESM modules
- Comprehensive error handling
- Consistent logging via Logger service
- 85%+ test coverage

### Testing
- Unit tests: Vitest
- Integration tests: API endpoints
- Test fixtures included
- 200+ test cases implemented

### Documentation
- JSDoc comments on public APIs
- Inline comments for complex logic
- README files in each major section
- API documentation in progress

---

## Contributing

Follow patterns established in:
- `src/knowledge-graph.ts` — Graph operations
- `src/data-export.ts` — Multi-format handling
- `src/deduplication.ts` — Similarity algorithms
- `src/user-rate-limiter.ts` — Quota management

See `CLAUDE.md` for detailed guidelines.

---

## License

MIT

---

## Resources

- **Project Plan**: [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) — Master task list
- **Technical Docs**: [CLAUDE.md](./CLAUDE.md) — Architecture and commands
- **CLI Reference**: [CLI_REFERENCE.md](./CLI_REFERENCE.md) — All npm scripts
- **API Documentation**: [docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) — REST API overview
- **Architecture**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — System design notes
- **Operations**: [docs/OPERATIONS.md](./docs/OPERATIONS.md) — Runbooks and maintenance
- **Implementation Details**: [COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md](./COMPREHENSIVE_IMPLEMENTATION_SUMMARY.md) — Feature overview

---

**Last Updated**: January 13, 2026
**Status**: Intelligence Complete (100%) | Total Progress 64% (151/235 tasks)
