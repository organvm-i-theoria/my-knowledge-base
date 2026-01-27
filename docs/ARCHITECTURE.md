# Architecture

A comprehensive overview of the Knowledge Base system design, data flow, and component responsibilities.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KNOWLEDGE BASE SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Claude.app │    │   Gemini    │    │   ChatGPT   │    │   Local MD  │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┼──────────────────┼──────────────────┘          │
│                            │                  │                             │
│                    ┌───────▼──────────────────▼───────┐                     │
│                    │       SOURCE MANAGER             │                     │
│                    │   (Unified Ingestion Layer)      │                     │
│                    └───────────────┬──────────────────┘                     │
│                                    │                                        │
│                    ┌───────────────▼──────────────────┐                     │
│                    │        ATOMIZER                  │                     │
│                    │  (Content → Atomic Units)        │                     │
│                    └───────────────┬──────────────────┘                     │
│                                    │                                        │
│         ┌──────────────────────────┼──────────────────────────┐            │
│         │                          │                          │            │
│  ┌──────▼──────┐           ┌───────▼───────┐          ┌───────▼───────┐   │
│  │   SQLite    │           │   ChromaDB    │          │  JSON Files   │   │
│  │  (FTS5)     │           │  (Vectors)    │          │  (Archive)    │   │
│  └──────┬──────┘           └───────┬───────┘          └───────────────┘   │
│         │                          │                                       │
│         └──────────────────────────┼───────────────────────────┐          │
│                                    │                           │          │
│                    ┌───────────────▼───────────────┐           │          │
│                    │      HYBRID SEARCH            │           │          │
│                    │   (FTS + Semantic + RRF)      │           │          │
│                    └───────────────┬───────────────┘           │          │
│                                    │                           │          │
│         ┌──────────────────────────┼───────────────────────────┤          │
│         │                          │                           │          │
│  ┌──────▼──────┐           ┌───────▼───────┐          ┌───────▼───────┐   │
│  │  REST API   │           │  WebSocket    │          │  Web UI       │   │
│  │  (Express)  │           │  (Real-time)  │          │  (Static)     │   │
│  └─────────────┘           └───────────────┘          └───────────────┘   │
│                                                                            │
│                    ┌───────────────────────────────┐                      │
│                    │    PHASE 3: INTELLIGENCE      │                      │
│                    │  ┌─────────┐ ┌─────────────┐  │                      │
│                    │  │Insights │ │Smart Tagger │  │                      │
│                    │  └─────────┘ └─────────────┘  │                      │
│                    │  ┌─────────────┐ ┌─────────┐  │                      │
│                    │  │Relationships│ │Summaries│  │                      │
│                    │  └─────────────┘ └─────────┘  │                      │
│                    └───────────────────────────────┘                      │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Three-Phase Architecture

### Phase 1: Foundation (Export & Atomization)

**Purpose:** Ingest conversations from multiple sources and break them into atomic knowledge units.

**Components:**
- `src/sources/manager.ts` - Unified source orchestration
- `src/sources/claude.ts` - Playwright scraper for Claude.app
- `src/sources/gemini.ts` - Playwright scraper for Gemini
- `src/sources/chatgpt.ts` - ChatGPT export parser
- `src/sources/local.ts` - Local markdown file reader
- `src/atomizer.ts` - Conversation atomization
- `src/document-atomizer.ts` - Document atomization

**Data Flow:**
```
Source → Export → raw/ → Atomizer → atomic_units table + atomized/json/
```

### Phase 2: Semantic Intelligence (Vector Search)

**Purpose:** Enable meaning-based search through embeddings.

**Components:**
- `src/embeddings-service.ts` - OpenAI embedding generation
- `src/vector-database.ts` - ChromaDB storage/retrieval
- `src/semantic-search.ts` - Vector similarity search
- `src/hybrid-search.ts` - Combined FTS + semantic with RRF

**Data Flow:**
```
Unit content → OpenAI API → embedding vector → ChromaDB
Query → embedding → ChromaDB similarity → ranked results
```

### Phase 3: Claude Intelligence (Advanced Analysis)

**Purpose:** Extract insights, relationships, and metadata using Claude.

**Components:**
- `src/claude-service.ts` - Anthropic SDK with prompt caching
- `src/insight-extractor.ts` - Key insight extraction
- `src/smart-tagger.ts` - Context-aware tagging
- `src/relationship-detector.ts` - Unit connection detection
- `src/conversation-summarizer.ts` - Summary generation
- `src/batch-processor.ts` - Progress tracking, checkpointing

**Data Flow:**
```
Units → Claude API (cached) → insights/tags/relationships → database
```

---

## Component Responsibilities

### Source Manager (`src/sources/manager.ts`)

Orchestrates ingestion from multiple sources:
- Registers available sources
- Handles incremental vs full export
- Normalizes output to `Conversation` or `KnowledgeDocument`
- Deduplication based on source IDs

```typescript
interface KnowledgeSource {
  name: string;
  type: 'conversation' | 'document';
  export(): AsyncGenerator<Conversation | KnowledgeDocument>;
}
```

### Atomizer (`src/atomizer.ts`)

Converts conversations into atomic knowledge units:
- Splits by message boundaries
- Infers unit type (insight, code, question, reference, decision)
- Extracts keywords via frequency analysis
- Auto-generates titles (80 char max)
- Categorizes into 5 categories

**Atomization Strategies:**
1. Question detection (? marks)
2. Code block detection (``` fences)
3. Decision patterns ("decided", "chose", "selected")
4. Reference detection (links, citations)
5. Default: insight

### Database (`src/database.ts`)

SQLite with WAL mode for concurrent reads:

```sql
-- Core tables
atomic_units (id, type, title, content, context, category, ...)
units_fts (FTS5 virtual table for full-text search)
tags, unit_tags (many-to-many tagging)
keywords, unit_keywords (extracted keywords)
unit_relationships (graph edges)
conversations, documents (source metadata)
search_queries (analytics)
```

**Indexes:**
- `idx_units_created` - Chronological sorting
- `idx_units_category` - Category filtering
- `idx_units_type` - Type filtering
- `idx_units_conversation` - Source grouping

### Vector Database (`src/vector-database.ts`)

ChromaDB for embedding storage:
- Collection: `knowledge_units`
- Dimensions: 1536 (text-embedding-3-small)
- Metadata: id, type, category, tags
- Distance metric: cosine similarity

```typescript
interface VectorDatabase {
  addEmbedding(id: string, vector: number[], metadata: object): Promise<void>;
  query(vector: number[], limit: number, filters?: object): Promise<SearchResult[]>;
}
```

### Hybrid Search (`src/hybrid-search.ts`)

Combines FTS5 and semantic search using Reciprocal Rank Fusion:

```
HybridScore = (1 / (k + FTS_rank)) * ftsWeight + (1 / (k + Semantic_rank)) * semanticWeight
```

Default weights: FTS 0.4, Semantic 0.6, k=60

### API Layer (`src/api.ts`, `src/api-intelligence.ts`)

Express-based REST API:
- 50 endpoints across 9 categories
- Consistent response format
- Pagination, filtering, sorting
- Rate limiting (tier-based)
- WebSocket for real-time updates

**Response Format:**
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "pageSize": 20, "total": 100 },
  "timestamp": "2026-01-27T10:30:00.000Z"
}
```

### Claude Service (`src/claude-service.ts`)

Anthropic SDK wrapper with optimizations:
- Prompt caching (90% token savings)
- Token tracking and cost estimation
- Rate limit handling
- Retry with exponential backoff

```typescript
class ClaudeService {
  async analyze(content: string, prompt: string): Promise<string>;
  getTokenStats(): { input: number, output: number, cached: number };
}
```

---

## Database Schema Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        atomic_units                              │
├─────────────────────────────────────────────────────────────────┤
│ id (UUID PK)                                                     │
│ type: insight | code | question | reference | decision           │
│ title: string                                                    │
│ content: text                                                    │
│ context: text                                                    │
│ category: programming | writing | research | design | general    │
│ timestamp: datetime                                              │
│ created: datetime                                                │
│ conversation_id → conversations.id                               │
│ document_id → documents.id                                       │
│ embedding: blob (optional, deprecated)                           │
│ tags: json array                                                 │
│ keywords: json array                                             │
└─────────────────────────────────────────────────────────────────┘
         │                           │
         │ 1:N                       │ N:M
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│ unit_tags       │         │unit_relationships│
├─────────────────┤         ├─────────────────┤
│ unit_id (FK)    │         │ from_unit (FK)  │
│ tag_id (FK)     │         │ to_unit (FK)    │
└─────────────────┘         │ relationship_type│
         │                  └─────────────────┘
         ▼
┌─────────────────┐
│ tags            │
├─────────────────┤
│ id (PK)         │
│ name (unique)   │
└─────────────────┘
```

**Full-Text Search (FTS5):**
```sql
CREATE VIRTUAL TABLE units_fts USING fts5(
  title, content, context, tags,
  content=atomic_units,
  content_rowid=rowid
);
```

---

## Data Flow Diagrams

### Export → Search Pipeline

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│   Export   │───▶│  Atomize   │───▶│   Store    │───▶│   Embed    │
│  (Scrape)  │    │  (Split)   │    │  (SQLite)  │    │  (OpenAI)  │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
                                           │                │
                                           ▼                ▼
                                    ┌────────────┐   ┌────────────┐
                                    │   FTS5     │   │  ChromaDB  │
                                    │   Index    │   │  Vectors   │
                                    └─────┬──────┘   └─────┬──────┘
                                          │                │
                                          └───────┬────────┘
                                                  ▼
                                          ┌────────────┐
                                          │  Hybrid    │
                                          │  Search    │
                                          └────────────┘
```

### Phase 3 Intelligence Pipeline

```
┌────────────┐    ┌────────────┐    ┌────────────┐
│   Select   │───▶│  Batch     │───▶│  Claude    │
│   Units    │    │ Processor  │    │   API      │
└────────────┘    └────────────┘    └────────────┘
                        │                  │
                        │ checkpoint       │ prompt cache
                        ▼                  ▼
                 ┌────────────┐    ┌────────────┐
                 │  Progress  │    │  Results   │
                 │  Tracking  │    │  (JSON)    │
                 └────────────┘    └────────────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        │                 │                 │
                        ▼                 ▼                 ▼
                 ┌────────────┐   ┌────────────┐   ┌────────────┐
                 │  Insights  │   │   Tags     │   │ Relations  │
                 │  (units)   │   │ (unit_tags)│   │  (edges)   │
                 └────────────┘   └────────────┘   └────────────┘
```

---

## API Layer Design

### Endpoint Categories

| Category | Count | Description |
|----------|-------|-------------|
| Core CRUD | 12 | Unit operations, tags, categories |
| Search | 6 | FTS, semantic, hybrid, suggestions |
| Graph | 8 | Knowledge graph navigation |
| Intelligence | 6 | Insights, tags, relationships |
| Deduplication | 4 | Duplicate detection and merge |
| Export | 5 | CSV, JSON, Markdown, JSON-LD |
| WebSocket | 3 | Real-time updates |
| Rate Limiting | 4 | Usage tracking |
| Utility | 2 | Health, stats |

### Request Flow

```
Request → Rate Limiter → Auth (optional) → Router → Handler → Database → Response
                                              │
                                              └── Audit Log (if enabled)
```

### WebSocket Events

```typescript
// Server-sent events
{ type: 'unit.created', data: { id, title } }
{ type: 'unit.updated', data: { id, changes } }
{ type: 'unit.deleted', data: { id } }
{ type: 'search.completed', data: { query, resultCount } }
```

---

## Security Model

### Authentication (`ENABLE_AUTH=true`)

- Optional authentication middleware
- API key or JWT token based
- Per-endpoint access control

### CORS Configuration

```typescript
// src/web-server.ts
cors({
  origin: process.env.CORS_ORIGINS?.split(','),
  methods: process.env.CORS_METHODS?.split(','),
});
```

### HTTPS Redirect (`ENFORCE_HTTPS=true`)

Redirects HTTP to HTTPS when behind a proxy that sets `X-Forwarded-Proto`.

### Audit Logging (`AUDIT_LOG_ENABLED=true`)

Logs write operations to `AUDIT_LOG_PATH`:
```json
{"timestamp":"...","action":"unit.create","unitId":"...","userId":"..."}
```

---

## Extensibility

### Adding a New Source

1. Create `src/sources/newsource.ts`:
```typescript
import { KnowledgeSource, Conversation } from './interface.js';

export class NewSource implements KnowledgeSource {
  name = 'newsource';
  type = 'conversation' as const;

  async *export(): AsyncGenerator<Conversation> {
    // Implementation
  }
}
```

2. Register in `src/sources/manager.ts`:
```typescript
this.sources.set('newsource', new NewSource());
```

### Adding a New Analyzer

1. Create `src/my-analyzer.ts`:
```typescript
export class MyAnalyzer {
  constructor(private claude: ClaudeService) {}

  async analyze(unit: AtomicUnit): Promise<AnalysisResult> {
    return this.claude.analyze(unit.content, MY_PROMPT);
  }
}
```

2. Create CLI: `src/my-analyzer-cli.ts`
3. Add npm script in `package.json`
4. Wire into API if needed

### Adding New API Endpoints

1. Add route in `src/api.ts`:
```typescript
router.get('/api/myendpoint', async (req, res) => {
  // Implementation
});
```

2. Register with app in `src/web-server.ts`

---

## Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| FTS Search | <50ms | SQLite FTS5, indexed |
| Semantic Search | 100-500ms | OpenAI API + ChromaDB |
| Hybrid Search | 200-800ms | Combined with RRF |
| Unit Create | <10ms | SQLite insert |
| Embedding Gen | 200-500ms/unit | OpenAI API |
| Phase 3 Analysis | 2-5s/unit | Claude API (cached) |

### Optimization Strategies

1. **WAL Mode** - Concurrent reads during writes
2. **Prompt Caching** - 90% token savings on repeated prompts
3. **Batch Processing** - Amortize API overhead
4. **Result Caching** - API response caching (future)
5. **Index Optimization** - Strategic SQLite indexes

---

## Directory Structure

```
knowledge-base/
├── src/                          # TypeScript source
│   ├── database.ts               # SQLite operations
│   ├── atomizer.ts               # Conversation atomization
│   ├── document-atomizer.ts      # Document atomization
│   ├── types.ts                  # TypeScript interfaces
│   ├── export.ts                 # Main orchestration
│   ├── sources/                  # Source integrations
│   │   ├── interface.ts          # Source interface
│   │   ├── manager.ts            # Source orchestration
│   │   ├── claude.ts             # Claude.app scraper
│   │   ├── gemini.ts             # Gemini scraper
│   │   ├── chatgpt.ts            # ChatGPT parser
│   │   └── local.ts              # Local markdown
│   ├── embeddings-service.ts     # OpenAI embeddings
│   ├── vector-database.ts        # ChromaDB storage
│   ├── search.ts                 # FTS search
│   ├── semantic-search.ts        # Vector search
│   ├── hybrid-search.ts          # Combined search
│   ├── claude-service.ts         # Anthropic SDK
│   ├── insight-extractor.ts      # Phase 3: insights
│   ├── smart-tagger.ts           # Phase 3: tagging
│   ├── relationship-detector.ts  # Phase 3: connections
│   ├── conversation-summarizer.ts# Phase 3: summaries
│   ├── batch-processor.ts        # Progress/checkpoints
│   ├── api.ts                    # REST API core
│   ├── api-intelligence.ts       # Intelligence endpoints
│   ├── web-server.ts             # Express server
│   └── *-cli.ts                  # CLI entry points
├── db/                           # SQLite database
├── raw/                          # Source exports
├── atomized/                     # Processed outputs
│   ├── json/units/               # Unit JSON files
│   └── embeddings/chroma/        # Vector database
├── web/                          # Static UI assets
├── docs/                         # Documentation
└── dist/                         # Compiled JavaScript
```

---

## References

- `CLAUDE.md` - Development guide and commands
- `docs/DATABASE_SCHEMA.md` - Detailed schema documentation
- `docs/API_ENDPOINTS_SUMMARY.md` - Complete API reference
- `docs/DEPLOYMENT.md` - Production deployment guide
