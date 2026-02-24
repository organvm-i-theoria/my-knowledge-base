# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Status

**See [`DEVELOPMENT_ROADMAP.md`](./DEVELOPMENT_ROADMAP.md) for the complete 235-item task list.**

Current status: **187/235 tasks completed (80%)**
- Phase 1-3 + API: 100% complete
- Web UI: Complete (20/20)

## Project Overview

A TypeScript knowledge base that exports Claude.app conversations, atomizes them into knowledge units, and provides multi-layered search and AI-powered intelligence extraction.

**Stack:** Node.js + TypeScript (ESM) | SQLite + ChromaDB | Anthropic SDK + OpenAI SDK | Vitest

## Build & Development Commands

```bash
# Build & Run
npm run build              # Compile TypeScript to dist/
npm run dev                # Run with tsx (development)
npm run start              # Run compiled JavaScript
npm run web                # Start web server

# Database
npm run migrate            # Run database migrations
npm run prepare-db         # migrate + seed (runs automatically before start/web/test)

# Export & Ingestion
npm run export:dev         # Export conversations from claude.app (browser required)
npm run export:dev -- --source=gemini   # Export from specific source only
npm run generate-embeddings -- --yes    # Generate embeddings for all units

# Search
npm run search "query"           # Full-text search (FTS5)
npm run search:semantic "query"  # Semantic search via embeddings
npm run search:hybrid "query"    # Hybrid search (FTS + semantic combined)

# Testing
npm test                   # Run all tests
npm test -- src/api.test.ts         # Run single test file
npm test -- --watch        # Watch mode
npm run test:ui            # Vitest UI
npm run test:coverage      # Coverage report
```

## Phase 3 Intelligence Commands (Claude-powered)

```bash
# Core batch operations (progress bars, checkpoints, resumability)
npm run extract-insights all --save --parallel 3    # Extract insights
npm run smart-tag --limit 100 --save --parallel 4   # Context-aware tagging
npm run find-relationships --save                   # Detect connections
npm run summarize all --save                        # Summarization
```

## Architecture

### Three-Phase System

**Phase 1: Foundation** - Export & Atomization
- Playwright scrapes Claude.app/Gemini or reads local markdown
- SourceManager ingests from multiple sources
- KnowledgeAtomizer breaks content into atomic units (5 strategies)

**Phase 2: Semantic Intelligence** - Vector Search
- OpenAI text-embedding-3-small vectors stored in ChromaDB
- HybridSearch combines FTS5 + semantic via Reciprocal Rank Fusion

**Phase 3: Claude Intelligence** - Advanced Analysis
- InsightExtractor, SmartTagger, RelationshipDetector, ConversationSummarizer
- Prompt caching: 90% token savings (~$0.034 vs $0.32 per operation)

### Data Model

**AtomicUnit** (core entity)
```typescript
{
  id: UUID
  type: 'insight' | 'code' | 'question' | 'reference' | 'decision'
  title: string               // auto-generated from first line
  content: string             // main knowledge
  context: string             // surrounding context
  tags: string[]              // auto-generated
  category: 'programming' | 'writing' | 'research' | 'design' | 'general'
  timestamp: Date
  embedding?: number[]        // Phase 2: vector embedding
  conversationId?: string     // source reference
  relatedUnits: string[]      // Phase 3: connections
}
```

### Database Tables
- `atomic_units` - Core knowledge units
- `units_fts` - Full-text search index (SQLite FTS5)
- `tags`, `unit_tags` - Tagging relationships
- `unit_relationships` - Phase 3: relationship graph
- `conversations`, `documents` - Source metadata

## Project Structure

```
src/
├── database.ts              # SQLite operations, schema
├── atomizer.ts              # Conversation atomization
├── document-atomizer.ts     # Document atomization
├── types.ts                 # TypeScript interfaces
├── export.ts                # Main orchestration
├── sources/                 # Source integrations
│   ├── manager.ts           # Unified ingestion
│   ├── claude.ts            # Claude.app scraper
│   ├── gemini.ts            # Gemini scraper
│   ├── chatgpt.ts           # ChatGPT export parser
│   └── local.ts             # Local markdown
├── analytics/               # Search analytics
│   ├── spell-checker.ts
│   ├── query-suggestions.ts
│   └── search-analytics.ts
├── embeddings-service.ts    # OpenAI embeddings
├── vector-database.ts       # ChromaDB storage
├── hybrid-search.ts         # FTS + semantic (RRF)
├── claude-service.ts        # Anthropic SDK + prompt caching
├── insight-extractor.ts     # Phase 3: insights
├── smart-tagger.ts          # Phase 3: auto-tagging
├── relationship-detector.ts # Phase 3: connections
├── conversation-summarizer.ts
├── batch-processor.ts       # Progress + checkpoints
├── api.ts                   # REST API endpoints
├── web-server.ts            # Express server
└── *-cli.ts                 # CLI entry points
```

## Key Patterns

### Atomization Strategy
1. Infers unit type from content (question marks → 'question', code blocks → 'code')
2. Auto-generates titles from first line (80 char max)
3. Extracts keywords via frequency analysis
4. Auto-tags by detecting technologies/languages
5. Categorizes into 5 categories

### Cost Optimization
- **Embeddings**: ~$0.02 per 1M tokens
- **Claude Phase 3**: Prompt caching at 0.1x read rate → 90% savings
- Track usage via `ClaudeService.getTokenStats()`

### Adding New Features

**New Phase 3 Analyzer:**
1. Create class similar to InsightExtractor
2. Use ClaudeService for API calls with caching
3. Add CLI script in `src/<name>-cli.ts`
4. Track tokens via getTokenStats()

**New Source:**
1. Add in `src/sources/` implementing KnowledgeSource interface
2. Register in SourceManager
3. Normalize output to Conversation or KnowledgeDocument

## REST API (38 endpoints)

See [`docs/API_ENDPOINTS_SUMMARY.md`](./docs/API_ENDPOINTS_SUMMARY.md) for full reference.

**Categories:** Core CRUD (12) | Search (6) | Intelligence (6) | Graph (8) | Dedup (4) | Export (5) | WebSocket (3) | Rate Limiting (4)

**Response format:** `{ success, data, pagination?, timestamp }`

## Environment Variables

```bash
OPENAI_API_KEY=     # Required for Phase 2 embeddings
ANTHROPIC_API_KEY=  # Required for Phase 3 Claude intelligence
```

## Documentation

- `docs/API_DOCUMENTATION.md` - API overview
- `docs/ARCHITECTURE.md` - System design
- `docs/DATABASE_SCHEMA.md` - Database structure
- `docs/DEPLOYMENT.md` - Docker and deployment

<!-- ORGANVM:AUTO:START -->
## System Context (auto-generated — do not edit)

**Organ:** ORGAN-I (Theory) | **Tier:** standard | **Status:** CANDIDATE
**Org:** `unknown` | **Repo:** `my-knowledge-base`

### Edges
- **Produces** → `unknown`: unknown

### Siblings in Theory
`recursive-engine--generative-entity`, `organon-noumenon--ontogenetic-morphe`, `auto-revision-epistemic-engine`, `narratological-algorithmic-lenses`, `call-function--ontological`, `sema-metra--alchemica-mundi`, `system-governance-framework`, `cognitive-archaelogy-tribunal`, `a-recursive-root`, `radix-recursiva-solve-coagula-redi`, `.github`, `nexus--babel-alexandria-`, `reverse-engine-recursive-run`, `4-ivi374-F0Rivi4`, `cog-init-1-0-` ... and 4 more

### Governance
- Foundational theory layer. No upstream dependencies.

*Last synced: 2026-02-24T12:41:28Z*
<!-- ORGANVM:AUTO:END -->
