[![ORGAN-I: Theory](https://img.shields.io/badge/ORGAN--I-Theory-1a237e?style=flat-square)](https://github.com/organvm-i-theoria)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Tests: 200+](https://img.shields.io/badge/tests-200%2B-brightgreen?style=flat-square)]()
[![Status: Active](https://img.shields.io/badge/status-active-brightgreen?style=flat-square)]()

# My Knowledge Base

[![CI](https://github.com/organvm-i-theoria/my-knowledge-base/actions/workflows/ci.yml/badge.svg)](https://github.com/organvm-i-theoria/my-knowledge-base/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)](https://github.com/organvm-i-theoria/my-knowledge-base)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/organvm-i-theoria/my-knowledge-base/blob/main/LICENSE)
[![Organ I](https://img.shields.io/badge/Organ-I%20Theoria-8B5CF6)](https://github.com/organvm-i-theoria)
[![Status](https://img.shields.io/badge/status-active-brightgreen)](https://github.com/organvm-i-theoria/my-knowledge-base)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-informational)](https://github.com/organvm-i-theoria/my-knowledge-base)


**An epistemological infrastructure for converting AI conversations into durable, searchable, interconnected knowledge — with multi-modal retrieval and LLM-powered intelligence extraction.**

*"Knowledge base" — from the Greek **epistēmē** (knowledge) and **basis** (foundation). Where conventional knowledge management systems store what you put in, this system excavates what you did not know you had: latent patterns, implicit connections, and higher-order insights buried across hundreds of AI conversation threads. It treats each exchange with Claude, Gemini, or ChatGPT not as disposable dialogue but as raw epistemological material awaiting decomposition into atomic units of reusable understanding.*

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Core Concepts](#core-concepts)
  - [Knowledge Atomization](#1-knowledge-atomization)
  - [Multi-Modal Search (FTS + Vector + Hybrid)](#2-multi-modal-search-fts--vector--hybrid)
  - [Intelligence Extraction via LLM](#3-intelligence-extraction-via-llm)
  - [Knowledge Graph Construction](#4-knowledge-graph-construction)
  - [Federated Source Ingestion](#5-federated-source-ingestion)
- [Architecture](#architecture)
- [Installation & Usage](#installation--usage)
- [Examples](#examples)
- [Downstream Implementation](#downstream-implementation)
- [Validation](#validation)
- [Roadmap](#roadmap)
- [Cross-References](#cross-references)
- [Contributing](#contributing)
- [License](#license)
- [Author & Contact](#author--contact)

---

## Problem Statement

Every meaningful AI conversation generates knowledge that evaporates. You spend ninety minutes with Claude working through a recursive data structure design, or an afternoon with Gemini prototyping a deployment strategy, and afterward that knowledge exists only inside a vendor-specific chat interface — unsearchable, unstructured, disconnected from every other conversation you have ever had.

This is not a minor inconvenience. It is a structural epistemological failure. The problem decomposes into four discrete failures that existing tools do not address:

**1. No export pathway.** Claude.app, Gemini, and ChatGPT offer no bulk export mechanism. Your knowledge lives behind their UIs, inaccessible to any external system. The few available export formats (ChatGPT's JSON dump, for instance) are monolithic and unprocessed — they give you raw data, not usable knowledge.

**2. No atomization.** Conversations are monolithic blobs. A single session might contain a database schema discussion, a deployment decision, three code patterns, and a conceptual insight about state machines — all stored as one undifferentiated unit. Traditional note-taking tools (Notion, Obsidian, Logseq) require *you* to manually decompose conversations into discrete notes. This is precisely the labor that AI should automate.

**3. No cross-conversation search.** There is no way to query across sessions, across platforms, or across time. You cannot ask "What have I learned about recursive architectures across all my Claude conversations this quarter?" Tools like Readwise, Mem, or Reflect offer search, but none ingest AI conversations natively, none atomize automatically, and none provide multi-modal retrieval that combines keyword precision with semantic understanding.

**4. No intelligence extraction.** Conversations contain implicit insights — recurring themes, latent contradictions, evolving understanding — that are invisible without systematic analysis. No existing tool applies LLM intelligence to a corpus of AI conversations to surface what you did not explicitly articulate.

My Knowledge Base addresses each failure with a dedicated subsystem: a multi-source export engine, a five-strategy atomizer, a three-modal search index, and an LLM-powered intelligence layer.

---

## Core Concepts

### 1. Knowledge Atomization

The central epistemological operation is **atomization**: decomposing raw conversations and documents into the smallest self-contained units of knowledge that can stand alone, be retrieved independently, and form connections with other units. The `KnowledgeAtomizer` class (`src/atomizer.ts`) implements this through a strategy pattern, with five distinct chunking strategies dispatched based on content characteristics.

For conversations, two complementary passes run in parallel. **Message-level atomization** (`atomizeByMessage`) processes each message independently: messages shorter than 20 characters are discarded, each surviving message is classified by type (`insight`, `code`, `question`, `reference`, or `decision`), assigned auto-generated tags via content analysis, categorized into a controlled vocabulary (`programming`, `writing`, `research`, `design`, `devops`, `data`, `general`), and enriched with extracted keywords ranked by frequency. **Code extraction** (`atomizeCodeBlocks`) uses regex-based parsing to identify fenced code blocks, extracting them as discrete `code`-typed units with language metadata.

For documents — markdown, plain text, HTML, and PDF — the atomizer delegates to format-specific `ChunkingStrategy` implementations defined in `src/chunking-strategies.ts`:

| Strategy | Class | Target |
|----------|-------|--------|
| Markdown Semantic | `MarkdownSemanticChunkingStrategy` | `.md`, `.txt`, `.html` — splits on headings and semantic boundaries using `SemanticChunker` |
| PDF Sliding Window | `PdfSlidingWindowChunkingStrategy` | `.pdf` — configurable token windows (default 500 tokens, 50 overlap) with page range estimation |
| Single Chunk | `SingleChunkStrategy` | Fallback for any format — passes content through as one unit |

The `SemanticChunker` (`src/semantic-chunker.ts`) performs content-type detection (markdown, code, or plain text), splits on structural boundaries (headings, code fences, list blocks), merges chunks below a configurable minimum size, and calculates confidence scores for each resulting segment. Chunk guardrails enforce maximum chunk counts per document (`CHUNK_MAX_PER_DOC`, default 40) and minimum token thresholds (`CHUNK_MIN_TOKENS`, default 160), merging small fragments and capping excessive fragmentation.

Every atomic unit carries a typed `AtomicUnit` interface (`src/types.ts`) with provenance fields (`conversationId`, `documentId`, `parentSectionId`), hierarchical metadata (`sectionType`, `hierarchyLevel`), and a `RedactionMetadata` payload when the built-in `RedactionService` has processed the content.

```typescript
interface AtomicUnit {
  id: string;
  type: 'insight' | 'code' | 'question' | 'reference' | 'decision';
  timestamp: Date;
  title: string;
  content: string;
  context: string;
  tags: string[];
  category: string;
  conversationId?: string;
  documentId?: string;
  keywords: string[];
  sectionType?: 'list' | 'table' | 'blockquote' | 'heading' | 'code' | 'paragraph';
  hierarchyLevel?: number;
}
```

### 2. Multi-Modal Search (FTS + Vector + Hybrid)

Retrieval operates across three complementary modalities, each optimized for a different query type.

**Full-Text Search** uses SQLite FTS5 via `better-sqlite3`. The `KnowledgeDatabase` class (`src/database.ts`) maintains a virtual FTS5 table (`units_fts`) indexed on `title`, `content`, `context`, and `tags`. FTS5 provides BM25 ranking, prefix matching, boolean operators, and sub-millisecond latency for keyword-exact queries. The database runs in WAL (Write-Ahead Logging) mode for concurrent read/write performance.

**Semantic Search** uses ChromaDB as a vector store with configurable embedding providers. The `VectorDatabase` class (`src/vector-database.ts`) manages profile-aware collections — each embedding model gets its own ChromaDB collection (e.g., `knowledge_units_text-embedding-3-small`), with legacy fallback support for migration scenarios. The `EmbeddingsService` generates vectors via the `EmbeddingFactory` (`src/embedding-factory.ts`), which supports OpenAI (`text-embedding-3-small` at 1536 dimensions, `text-embedding-3-large` at 3072), Ollama (`nomic-embed-text` at 768, `mxbai-embed-large` at 1024), and Hugging Face Sentence Transformers (384 dimensions). An `EmbeddingCache` (`src/embedding-cache.ts`) avoids redundant API calls for previously embedded content.

**Hybrid Search** (`src/hybrid-search.ts`) combines both modalities using **Reciprocal Rank Fusion (RRF)**. The `HybridSearch.search()` method executes FTS and embedding generation in parallel, then merges ranked lists with the formula:

```
score(unit) = w_fts / (k + rank_fts + 1) + w_semantic / (k + rank_semantic + 1)
```

where `k=60` (the RRF smoothing constant), and weights default to `fts=0.6, semantic=0.4` but are caller-configurable. Post-fusion boosts are applied for chunked content (+0.05) and visual-intent queries (+0.02 for units tagged `has-image`). The system supports filtering by date range, source, and document format, with visual intent detection that recognizes 18 query terms (e.g., "diagram", "screenshot", "wireframe").

### 3. Intelligence Extraction via LLM

Three LLM-powered analysis modules transform the knowledge base from a retrieval system into an analytical instrument. All use the `AIFactory` (`src/ai-factory.ts`) abstraction, which supports Anthropic, OpenAI, and Ollama backends interchangeably.

The **InsightExtractor** (`src/insight-extractor.ts`) analyzes conversation transcripts through a structured system prompt that instructs the LLM to identify reusable technical insights, decision rationale, code patterns, and actionable recommendations. Each extraction produces 3-10 `AtomicUnit` objects tagged with `claude-extracted` and importance levels (`high`, `medium`, `low`). Batch processing with checkpoint support (`BatchProcessor`) enables resumable extraction across large corpora.

The **SmartTagger** (`src/smart-tagger.ts`) generates controlled-vocabulary tags using LLM classification. Given a unit's title and first 1,000 characters of content, it produces 3-8 hyphenated tags, a category assignment from the canonical taxonomy, extracted keywords, and a confidence score. The `taxonomy.ts` module enforces normalization: aliases like `technical` or `tooling` resolve to `programming`; `infrastructure` resolves to `devops`.

The **RelationshipDetector** (`src/relationship-detector.ts`) maps connections between units using a two-phase approach: first, vector similarity identifies candidate pairs above a configurable threshold (default 0.7); then the LLM validates and classifies each relationship using an OpenMetadata-inspired type system — `references`, `builds_on`, `contradicts`, `implements`, `derived_from`, `prerequisite`, or the fallback `related`. Each relationship carries a confidence score and human-readable explanation.

The **ConversationSummarizer** (`src/conversation-summarizer.ts`) produces structured summaries with title, overview, key points, topics, outcome, action items, code snippet counts, and technology mentions — providing a high-level map of conversational content before deep retrieval.

### 4. Knowledge Graph Construction

The `KnowledgeGraph` class (`src/knowledge-graph.ts`) implements a directed graph with typed nodes and weighted edges. Nodes correspond to atomic units; edges represent typed relationships (`RelationshipType` enum: `RELATED`, `SIMILAR`, `CONTRADICTS`, `EXTENDS`, `REFERENCES`, `DEPENDS_ON`, `PART_OF`, `FOLLOWS`, `PRECEDES`, `SAME_CATEGORY`, `SAME_TOPIC`).

Graph operations include BFS-based shortest path finding (`findShortestPath`), configurable neighborhood extraction (`getNeighborhood` with hop-depth control), type-based and category-based filtering, and graph statistics (node count, edge count, density, average/max degree). The `GraphBuilder.detectRelationships` static method computes Jaccard similarity over keyword sets to auto-detect `RELATED` edges above a configurable threshold.

The graph exports to both raw JSON and vis.js-compatible format (`toVisFormat`) for direct rendering in the web frontend's graph visualization tab.

### 5. Federated Source Ingestion

The `SourceManager` (`src/sources/manager.ts`) orchestrates ingestion from nine source adapters, each implementing the `KnowledgeSource` interface:

| Source | Class | Type | Method |
|--------|-------|------|--------|
| Claude (browser) | `ClaudeSource` | chat | Playwright browser automation |
| Claude (export) | `ClaudeExportSource` | chat | JSON export file parsing |
| ChatGPT (browser) | `ChatGPTSource` | chat | Playwright browser automation |
| ChatGPT (export) | `ChatGPTExportSource` | chat | JSON export file parsing |
| Gemini | `GeminiSource` | chat | Playwright browser automation |
| Local files | `LocalFileSource` | file | Filesystem glob (`.md`, `.txt`, `.pdf`, `.html`) |
| Google Docs | `GoogleDocsSource` | file | OAuth2 API integration |
| Apple Notes | `AppleNotesSource` | file | macOS-only native bridge |
| Bookmarks | `BookmarkSource` | file | Browser bookmark parsing |

A **Federation layer** (`src/federation/`) extends this with persistent, schedulable source management. `FederatedSourceRecord` entries define filesystem paths with include/exclude glob patterns; the `FederatedIndexer` performs incremental scans, content hashing for change detection, and scan history tracking via `FederatedScanRunRecord`. Federated search (`src/federation/search.ts`) queries across all indexed federation sources with unified scoring.

The system also supports real-time ingestion via `watch` mode — `chokidar`-based filesystem monitoring that triggers atomization and indexing as new files appear.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Source Layer                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Claude   │ │ ChatGPT  │ │ Gemini   │ │ Local FS │ │ Google Docs  │   │
│  │(Playwrgt)│ │(Playwrgt)│ │(Playwrgt)│ │(glob/pdf)│ │  (OAuth2)    │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       └────────────┬┴───────────┬┴────────────┘              │           │
│                    ▼            ▼                             ▼           │
│              SourceManager.ingestAll()           Federation Indexer       │
└────────────────────────┬─────────────────────────────┬───────────────────┘
                         ▼                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Atomization Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  KnowledgeAtomizer                                                  │  │
│  │  ├── atomizeConversation() → message-level + code extraction        │  │
│  │  └── atomizeDocument()     → strategy dispatch:                     │  │
│  │       ├── MarkdownSemanticChunkingStrategy (md/txt/html)            │  │
│  │       ├── PdfSlidingWindowChunkingStrategy (pdf)                    │  │
│  │       └── SingleChunkStrategy (fallback)                            │  │
│  │  + RedactionService (PII/secret masking before storage)             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────┬──────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Storage + Index Layer                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌───────────────────────┐  │
│  │ SQLite + FTS5   │    │ ChromaDB        │    │ Knowledge Graph       │  │
│  │ (better-sqlite3)│    │ (vector store)  │    │ (in-memory directed)  │  │
│  │ atomic_units    │    │ profile-aware   │    │ BFS/neighborhood/     │  │
│  │ units_fts       │    │ collections     │    │ Jaccard detection     │  │
│  │ documents       │    │ legacy fallback │    │ vis.js export         │  │
│  │ tags, rels      │    │ EmbeddingCache  │    │                       │  │
│  └────────┬────────┘    └────────┬────────┘    └───────────┬───────────┘  │
│           └──────────────┬───────┘                         │              │
│                          ▼                                 │              │
│  ┌──────────────────────────────────┐                      │              │
│  │ HybridSearch (RRF fusion)       │◀─────────────────────┘              │
│  │ w_fts / (k + rank) + w_vec /..  │                                     │
│  │ + date/source/format filters    │                                     │
│  │ + visual intent boost           │                                     │
│  └──────────────────────────────────┘                                     │
└────────────────────────┬──────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    Intelligence Layer (LLM)                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ Insight      │ │ Smart        │ │ Relationship │ │ Conversation    │  │
│  │ Extractor    │ │ Tagger       │ │ Detector     │ │ Summarizer      │  │
│  │ (3-10/conv)  │ │ (3-8 tags)   │ │ (vec+LLM)   │ │ (structured)    │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────────┘  │
│                    AIFactory: Anthropic | OpenAI | Ollama                  │
└────────────────────────┬──────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                                  │
│  ┌─────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Express.js REST API     │    │ React Frontend (web-react/)          │  │
│  │ + WebSocket (real-time) │    │ SearchTab, GraphTab, TagsTab,       │  │
│  │ + Auth middleware       │    │ ConversationsTab, FederationTab,    │  │
│  │ + Rate limiting         │    │ AdminTab, SettingsTab, ExportsTab   │  │
│  │ + Collections API       │    │ + Zustand stores + keyboard nav     │  │
│  │ + Saved Searches API    │    │                                      │  │
│  └─────────────────────────┘    └──────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ CLI (30+ commands): search, search:semantic, search:hybrid,        │  │
│  │ extract-insights, smart-tag, find-relationships, summarize,        │  │
│  │ export-obsidian, watch, probe:runtime, redact:scan, ...            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Installation & Usage

### Prerequisites

- **Node.js** 20+ (TypeScript 5.7)
- **SQLite3** (bundled via `better-sqlite3`)
- **ChromaDB** instance (local Docker or remote) for semantic search
- **API keys**: Anthropic (intelligence extraction) and/or OpenAI (embeddings) — or use Ollama for fully local operation

### Setup

```bash
# Clone the repository
git clone https://github.com/organvm-i-theoria/my-knowledge-base.git
cd my-knowledge-base

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, OPENAI_API_KEY, or configure Ollama

# (Optional) Configure for local-only operation via config.yaml:
# llm.provider: ollama
# embedding.provider: local

# Initialize database (runs migrations + seeds)
npm run prepare-db

# Run the test suite
npm test

# Start the web server (React UI at http://localhost:3000)
npm run web

# Or start in dev mode with hot reload
npm run dev
```

### Local-Only Mode (No API Keys)

Edit `config.yaml` to use Ollama for both LLM and embeddings:

```yaml
llm:
  provider: ollama
  model: gemma3:4b
  baseUrl: http://localhost:11434/v1
embedding:
  provider: local
  model: nomic-embed-text
search:
  semanticPolicy: degrade
  hybridPolicy: degrade
```

With `semanticPolicy: degrade`, the system gracefully falls back to FTS-only search when ChromaDB is unavailable.

---

## Examples

### Example 1: Ingest and Search Claude Conversations

```bash
# Export all conversations from configured sources
npm run ingest:all

# Full-text keyword search
npm run search -- "recursive data structures"

# Semantic search (requires embeddings)
npm run search:semantic -- "approaches to handling state in deeply nested systems"

# Hybrid search (FTS + vector, RRF fusion)
npm run search:hybrid -- "deployment patterns for microservices"
```

### Example 2: Extract Intelligence from Your Corpus

```bash
# Extract insights from all conversations (LLM-powered)
npm run extract-insights

# Generate smart tags for all untagged units
npm run smart-tag:backfill

# Discover relationships between knowledge units
npm run find-relationships

# Summarize a batch of conversations
npm run summarize
```

### Example 3: Watch Mode + Obsidian Export

```bash
# Watch for new files and auto-ingest with embeddings
npm run watch:semantic

# Export entire knowledge base to Obsidian vault
npm run export-obsidian -- --vault-path ~/Documents/ObsidianVault

# Export processed knowledge base as structured JSON
npm run export-processed-pkb
```

### Example 4: Privacy-First Ingestion

```bash
# Scan for secrets and PII before committing data
npm run redact:scan

# Apply redaction to all detected items
npm run redact:apply

# Validate no secrets remain
npm run redact:validate
```

The `RedactionService` (`src/redaction-service.ts`) detects 17 secret types (OpenAI, Anthropic, AWS, GitHub, Stripe, Slack, Discord API keys; JWTs; private keys; bearer tokens; connection strings) and 6 PII types (SSN, phone, email, credit card, IPv4, IPv6) with sophisticated false-positive filtering to avoid flagging code patterns like `process.env.API_KEY`.

---

## Downstream Implementation

As an ORGAN-I (Theory) repository, My Knowledge Base provides foundational infrastructure that downstream organs build upon:

- **ORGAN-II: Poiesis** — The atomized knowledge units and insight extraction pipeline inform generative art systems in [metasystem-master](https://github.com/organvm-ii-poiesis/metasystem-master), where extracted conceptual patterns seed creative generation.
- **ORGAN-III: Ergon** — The search API and federation architecture pattern are adapted for commercial product search interfaces in ORGAN-III SaaS repositories.
- **ORGAN-V: Logos** — The intelligence extraction outputs (summaries, insights, relationship maps) provide source material for public-process essays published through [public-process](https://github.com/organvm-v-logos/public-process).

The unidirectional dependency constraint (I -> II -> III) means this repository is consumed by, but never depends on, any downstream organ.

---

## Validation

The system is validated through multiple layers:

- **200+ automated tests** via Vitest, covering unit tests (`src/**/*.test.ts`) and integration tests (`tests/`), including search parity smoke tests, federation endpoint tests, WebSocket integration, and end-to-end auth and export flows.
- **Runtime probes** (`scripts/probe-search-runtime.ts`) — automated health checks for local, staging, and production environments that verify search latency, semantic readiness, and cross-modal parity.
- **Performance benchmarks** (`benchmarks/search-latency.bench.ts`) — search latency measurement under controlled conditions.
- **Stability testing** (`scripts/test-stability.sh`) — repeated test runs to detect flaky tests and non-deterministic behavior.
- **Alert verification** (`scripts/verify-alerts.ts`) — validates that Prometheus alert rules (`ops/alerts/search-runtime-alerts.yaml`) fire correctly under simulated failure conditions.
- **Evidence artifacts** — runtime probe results, backfill trial data, and release evidence are persisted in `docs/evidence/` for audit trail purposes.

---

## Universe Chat Cosmos (New)

- Canonical provider-aware schema now includes provider/account/thread/turn/token layers (`providers`, `provider_accounts`, `chat_threads`, `chat_turns`, `term_lexicon`, `term_occurrences`, `thematic_edges`, `ingest_runs`).
- New API namespace: `/api/universe/*` for macro→micro traversal and term occurrence search.
- New ingestion path with safety enforcement:
- Dry run: `npm run ingest:universe -- --root=intake`
- Persist + report: `npm run ingest:universe:save -- --root=intake --report-dir=intake/reports`
- Provider importer coverage includes JSON + fallback transcript formats (HTML/markdown role-tagged logs) for ChatGPT, Claude, Gemini, Grok, and Copilot.
- Universe contract test gate: `npm run test:universe`.
- Web UI includes a `Universe` tab for provider→chat→turn drill-down and click-to-global-term exploration.
- Workspace scaffolds added for native clients:
- Mobile: `/apps/mobile` (Expo/React Native scaffold)
- Desktop: `/apps/desktop` (Tauri scaffold)
- Shared contracts package: `/packages/contracts`.
- Native core parity modules now include shared universe API clients, offline exploration cache, resumable sync planner, and desktop attach/reindex workflow primitives (`apps/mobile/src/*`, `apps/desktop/src/*`), validated by `tests/native-parity.test.ts`.
- `npm run build:all` compiles server + web + native-core modules in one gate.

## Roadmap

- [ ] **Additional exporters** — Perplexity, generic markdown import, and browser extension for one-click capture
- [ ] **Graph query language** — Structured queries over the knowledge graph beyond keyword/vector search (Cypher-like syntax)
- [ ] **Incremental re-indexing** — Watch for new exports and atomize/index without full corpus reprocessing
- [ ] **Multi-user support** — Shared knowledge bases with role-based access control
- [ ] **Bidirectional Obsidian sync** — Two-way sync with Obsidian/Logseq vaults, not just one-way export
- [ ] **Temporal analysis** — Track how understanding of a concept evolves across conversations over time
- [ ] **Embedding profile migration** — Automated re-embedding when switching between vector models (e.g., `text-embedding-3-small` to `text-embedding-3-large`)
- [ ] **RSS feed generation** — `RSSBuilder` already implemented; wire to API endpoint for knowledge feed subscription

---

## Cross-References

This repository is part of **ORGAN-I: Theoria**, the theoretical and epistemological organ of the ORGAN system.

| Repository | Organ | Relationship |
|-----------|-------|-------------|
| [recursive-engine](https://github.com/organvm-i-theoria/recursive-engine--generative-entity) | I | Recursive self-modeling framework — the theoretical foundation for the knowledge graph's self-referential structure |
| [organon-noumenon](https://github.com/organvm-i-theoria/organon-noumenon--ontogenetic-morphe) | I | Ontological category system — informs the taxonomy and category normalization used in atomization |
| [metasystem-master](https://github.com/organvm-ii-poiesis/metasystem-master) | II | Generative art system that consumes extracted insights as creative seed material |
| [public-process](https://github.com/organvm-v-logos/public-process) | V | Public essays drawing on intelligence extraction outputs from this system |
| [agentic-titan](https://github.com/organvm-iv-taxis/agentic-titan) | IV | Orchestration agent that coordinates automated knowledge processing workflows |
| [organvm-i-theoria](https://github.com/organvm-i-theoria) | I | Parent organization — all theory, epistemology, and ontology repositories |
| [meta-organvm](https://github.com/meta-organvm) | VIII | Umbrella organization coordinating all eight organs |

---

## Contributing

Contributions are welcome. This project follows standard GitHub workflow:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Write tests for new functionality (Vitest, in `src/` for unit tests or `tests/` for integration)
4. Ensure `npm test` passes
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines, including code style, commit conventions, and the pull request template.

---

## License

[MIT](LICENSE)

---

## Author & Contact

**[@4444J99](https://github.com/4444J99)**

Part of [ORGAN-I: Theoria](https://github.com/organvm-i-theoria) — the theoretical organ of the [ORGAN system](https://github.com/meta-organvm).
