# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📋 Development Status

**See [`DEVELOPMENT_ROADMAP.md`](./DEVELOPMENT_ROADMAP.md) for the complete 221-item task list.**

Current status: **87/221 tasks completed (39%)** - All intelligence features complete
- ✅ Core features complete (9/9)
- ✅ Phase 1 foundation (13/15)
- ✅ Phase 2 semantic intelligence (22/22)
- ✅ Phase 3 Claude analysis (24/24)
- 🔄 API endpoints (14/38)
- 🔄 Web UI (0/20)

## Project Overview

A TypeScript knowledge base system that exports Claude.app conversations, atomizes them into knowledge units, and provides multi-layered search and AI-powered intelligence extraction.

**Technology Stack:** Node.js + TypeScript | SQLite + ChromaDB | Anthropic SDK + OpenAI SDK

## Build & Development Commands

### Core Commands
```bash
npm run build              # Compile TypeScript to dist/
npm run dev              # Run source code directly (tsx)
npm run export:dev       # Export conversations from claude.app (browser required)
npm run start            # Run compiled JavaScript
```

### Search Commands
```bash
npm run search "query"           # Full-text search (FTS5)
npm run search:semantic "query"  # Semantic search via embeddings
npm run search:hybrid "query"    # Hybrid search (FTS + semantic combined)
```

### Phase 3 Intelligence Commands (Claude-powered analysis)
```bash
# Core batch operations (with batch processing, progress bars, resumability)
npm run extract-insights all --save --parallel 3          # Extract insights
npm run smart-tag --limit 100 --save --parallel 4         # Context-aware tagging
npm run find-relationships --save                         # Detect connections
npm run summarize all --save                              # Summarization

# Feature commands
npm run deduplicate-tags -- --threshold 0.85              # Find duplicate tags
npm run deduplicate-tags -- --threshold 0.85 --dry-run    # Preview before merging
npm run visualize-tags -- --format ascii                  # View tag hierarchy
npm run visualize-tags -- --format mermaid                # Generate diagram

# Monitoring and analysis
npm run cost-report -- --period 30days                    # API cost analysis
npm run intelligence-stats                                # Phase 3 statistics
```

### Infrastructure Commands
```bash
npm run generate-embeddings -- --yes   # Generate embeddings for all units
npm run export-obsidian                # Export atomized content to Obsidian format
npm run export-incremental             # Incremental export (new conversations only)
npm run web                            # Start web server for browsing
```

## Architecture & Data Flow

### Three-Phase System

**Phase 1: Foundation** - Export & Atomization
- Playwright scrapes Claude.app conversations or reads local markdown documents
- SourceManager ingests both conversation and document sources
- KnowledgeAtomizer breaks items into atomic knowledge units (5 strategies)
- Output: Database, markdown files, JSON storage

**Phase 2: Semantic Intelligence** - Vector Search
- EmbeddingsService generates OpenAI text-embedding-3-small vectors
- VectorDatabase (ChromaDB) stores embeddings for similarity search
- HybridSearch combines FTS5 (fast keyword) + semantic (meaning-based) using Reciprocal Rank Fusion
- Cost: ~$0.0002 per conversation

**Phase 3: Claude Intelligence** - Advanced Analysis
- InsightExtractor: Claude identifies key learnings with batch processing
- SmartTagger: Context-aware auto-tagging with concurrent batch processing
- RelationshipDetector: Finds connections between knowledge units (vector + Claude)
- ConversationSummarizer: Structured summaries with key points + executive summaries
- InsightRanker: Multi-criteria ranking (importance, recency, relevance, uniqueness)
- TagDeduplicator: Find and merge similar tags with edit distance algorithm
- TagHierarchy: Organize tags into tree structures with multiple visualization formats
- **Batch Processing**: Progress tracking, checkpoint resumability, concurrency control
- **Prompt caching** enabled: 90% token savings on repeated contexts
- Cost: ~$0.034 per conversation with caching (vs $0.32 uncached, 89% savings)

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
  category: string            // 'programming' | 'writing' | 'research' | 'design'
  timestamp: Date
  embedding?: number[]        // Phase 2: vector embedding
  keywords: string[]          // extracted terms
  conversationId?: string     // source reference
  relatedUnits: string[]      // Phase 3: connections
}
```

**Database Schema**
- `atomic_units` - Core knowledge units
- `units_fts` - Full-text search index (SQLite FTS5)
- `tags`, `unit_tags` - Tagging relationships
- `keywords`, `unit_keywords` - Keyword extraction
- `unit_relationships` - Phase 3: relationship graph
- `conversations` - Source conversation metadata
- `documents` - Source document metadata

### Processing Pipeline

1. **SourceManager** - Unified ingestion from multiple sources
   - Claude.app conversations (via Playwright)
   - Local markdown documents
   - Extensible for other sources

2. **KnowledgeAtomizer** - Multiple strategies
   - Message-level: Each message → unit
   - Code extraction: Code blocks → separate units
   - Header-based (documents): Section → unit
   - Paragraph-based (documents): Fallback splitting

3. **Writers** - Multi-format output
   - MarkdownWriter: Organized by date/title
   - JSONWriter: Structured indexes and JSONL stream
   - Database: Direct SQLite insertion

4. **Search & Intelligence**
   - Search path: Query → FTS lookup OR semantic embedding search
   - Hybrid: RRF combines FTS rank + semantic rank
   - Intelligence: Claude processes units for insights/relationships

## Key Files & Responsibilities

### Core Services
- `src/database.ts` - SQLite operations, schema, query builders
- `src/atomizer.ts` - Atomization strategies for conversations & documents
- `src/types.ts` - TypeScript interfaces (AtomicUnit, Conversation, etc.)

### I/O & Sources
- `src/markdown-writer.ts`, `src/json-writer.ts` - File output
- `src/sources/manager.ts` - Unified source ingestion
- `src/export.ts` - Main orchestration script

### Phase 2 (Semantic Search)
- `src/embeddings-service.ts` - OpenAI embedding generation
- `src/vector-database.ts` - ChromaDB vector storage
- `src/semantic-search.ts` - Similarity search
- `src/hybrid-search.ts` - Combined FTS + semantic (Reciprocal Rank Fusion)

### Phase 3 (Claude Intelligence)
**Core Modules:**
- `src/claude-service.ts` - Anthropic SDK wrapper with prompt caching & token tracking
- `src/insight-extractor.ts` - Extracts meaningful learnings with batch processing
- `src/smart-tagger.ts` - Intelligent context-aware tagging with concurrent processing
- `src/relationship-detector.ts` - Detects connections between units (vector + Claude)
- `src/conversation-summarizer.ts` - Structured conversation summaries + executive summaries

**Infrastructure & Features:**
- `src/batch-processor.ts` - Advanced batch processing with progress tracking and checkpoints
- `src/insight-ranker.ts` - Multi-criteria insight ranking and categorization
- `src/tag-deduplicator.ts` - Find and merge duplicate/similar tags
- `src/tag-hierarchy.ts` - Build and visualize hierarchical tag structures
- `src/api-intelligence.ts` - REST API for all intelligence endpoints

### CLI Interfaces
- `src/search.ts`, `src/semantic-search.ts`, `src/search-hybrid-cli.ts` - Search interfaces
- `src/extract-insights-cli.ts`, `src/smart-tag-cli.ts`, `src/find-relationships-cli.ts`, `src/summarize-cli.ts` - Phase 3 CLI

## Important Patterns & Conventions

### Atomization Strategy
When atomizing, the system:
1. Infers unit type from content patterns (question marks → 'question', code blocks → 'code')
2. Auto-generates titles from first line (truncated to 80 chars)
3. Extracts keywords via frequency analysis
4. Auto-tags by detecting technologies/languages/patterns
5. Categorizes into 5 categories (programming, writing, research, design, general)

### Cost Optimization
- **Embeddings**: Batch processing, ~$0.02 per 1M tokens
- **Claude Phase 3**: Prompt caching writes at 1.25x rate, reads at 0.1x rate → **90% savings**
  - Per operation: $0.32 → $0.034 (insight extraction)
  - 100 operations: $32.00 → $3.31 (89% savings)
  - Monthly (1000 ops): $4,800 → $520
- Token tracking via ClaudeService.getTokenStats() - monitor in all CLI and API calls
- **API Endpoints**: All Phase 3 REST endpoints report token usage in responses

### Error Handling
- Export failures are logged with detailed context
- Database operations use pragmas (WAL mode) for performance
- CLI scripts catch and log errors but exit(1) on critical failures

## Phase 3 REST API

All 6 intelligence endpoints are available at `http://localhost:3000/api/intelligence/`:

- `GET /insights` - List extracted insights with pagination and ranking
- `POST /insights/extract` - Extract insights on demand from conversations/units
- `GET /tags/suggestions` - Get smart tag suggestions for a unit
- `GET /relationships` - List detected relationships for a unit
- `POST /relationships/detect` - Batch detect relationships between units
- `GET /health` - Service health check and availability

**Response Format:** All endpoints return `IntelligenceResponse<T>` with token usage and processing time.

**Full API Documentation:** See `docs/CLAUDE_INTELLIGENCE_API.md` for complete reference with examples.

---

## Development Guidelines

### Adding a New Phase 3 Analysis
1. Create new class extending or similar to existing analyzers (e.g., InsightExtractor)
2. Use ClaudeService for Claude API calls with caching enabled
3. Add CLI script in `src/<name>-cli.ts` following existing pattern
4. Add database schema changes if storing new relationships
5. Track token usage via ClaudeService.getTokenStats()

### Extending Sources
1. Add new source in `src/sources/` implementing compatible interface
2. Update SourceManager to ingest from new source
3. Ensure output normalizes to Conversation or KnowledgeDocument type

### Adding New Search Capability
1. Implement searcher class with standardized interface
2. Add CLI entry point following pattern of search.ts/semantic-search.ts
3. Integrate with HybridSearch if combining with existing searches

## Deployment Notes

- **Environment variables** (in .env):
  - `OPENAI_API_KEY` - Required for Phase 2 embeddings
  - `ANTHROPIC_API_KEY` - Required for Phase 3 Claude intelligence
- **Database**: SQLite WAL mode enabled for concurrency
- **Vector DB**: ChromaDB persisted to `./atomized/embeddings/chroma`
- **Output**: Creates directories automatically (raw/, atomized/, db/)
