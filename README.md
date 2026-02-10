[![ORGAN-I: Theory](https://img.shields.io/badge/ORGAN--I-Theory-1a237e?style=flat-square)](https://github.com/organvm-i-theoria)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)]()
[![Tests: 200+](https://img.shields.io/badge/tests-200%2B-brightgreen?style=flat-square)]()
[![Status: Active](https://img.shields.io/badge/status-active-brightgreen?style=flat-square)]()

# My Knowledge Base

**An epistemological system for capturing, structuring, and retrieving knowledge from AI conversations.**

Most knowledge generated through AI interaction — Claude sessions, Gemini exchanges, ChatGPT threads — evaporates. It lives in vendor-specific interfaces, unsearchable, unconnected, and unstructured. My Knowledge Base treats AI conversations as raw epistemological material: it exports them, decomposes them into atomic knowledge units, indexes them across three search modalities, and extracts higher-order intelligence from the corpus. The result is a personal knowledge infrastructure that makes conversational knowledge *durable* and *retrievable*.

This is not a design document or proof of concept. It is a working TypeScript application with ~260 source files, 200+ test cases, a web UI, and Kubernetes deployment manifests.

---

## Problem Statement

The knowledge fragmentation problem is structural, not incidental. Every AI conversation platform is a silo:

- **No export pathway** — Claude.app, Gemini, and similar tools offer no bulk export. Knowledge stays locked behind their UIs.
- **No atomization** — Conversations are monolithic blobs. A 90-minute session about database design, deployment strategy, and API patterns is stored as one undifferentiated unit.
- **No cross-conversation search** — You cannot search across sessions, across platforms, or across time. There is no way to answer "What did I learn about recursive data structures across all my Claude sessions in January?"
- **No intelligence extraction** — Conversations contain implicit insights, recurring themes, and latent connections that are invisible without systematic analysis.

My Knowledge Base addresses each of these failures with a dedicated subsystem.

---

## Core Architecture

The system is organized into five subsystems, each handling a distinct phase of the knowledge lifecycle:

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────────┐     ┌──────────┐
│   Export     │────▶│  Atomizer    │────▶│  Search Index   │────▶│  Intelligence    │────▶│  Web UI  │
│  (Playwright)│     │  (5 strats)  │     │ (FTS+Vec+Hyb)  │     │  (Claude API)    │     │ (React)  │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────────┘     └──────────┘
```

### 1. Export Engine

Browser automation via Playwright extracts conversations from Claude.app and Gemini. This is not API-dependent — it drives real browser sessions to capture content that these platforms do not expose through their APIs. The exporter handles authentication, pagination, and rate limiting to produce clean conversation transcripts.

### 2. Atomization Engine

The atomizer (`src/atomizer.ts`) is the epistemological core. It decomposes raw conversations into discrete, self-contained **knowledge units** — the smallest meaningful fragments of knowledge that can stand alone.

Five chunking strategies operate in parallel, each optimized for different content structures:

| Strategy | Target Content | Approach |
|----------|---------------|----------|
| **Semantic Boundary** | Conceptual shifts within conversation | Detects topic transitions using embedding similarity, splitting at semantic discontinuities |
| **Structural** | Code blocks, lists, headers | Parses markdown/conversation structure to extract discrete informational blocks |
| **Fixed Window** | Long-form exposition | Sliding window with configurable overlap, ensuring no fragment exceeds token limits |
| **Question-Answer** | Instructional exchanges | Pairs user questions with assistant responses as atomic Q&A units |
| **Entity-Centric** | Technical discussions | Groups content around named entities (libraries, concepts, APIs) for topic-coherent chunks |

Each knowledge unit carries metadata: source conversation, timestamp, strategy used, estimated token count, and extracted entities. This metadata enables provenance tracking — you can always trace a knowledge unit back to its original conversational context.

### 3. Search Architecture

Three search modalities serve different retrieval needs:

**Full-Text Search (SQLite FTS5)** — Keyword-exact retrieval using SQLite's full-text search engine. Handles precise queries ("Playwright browser context API") with sub-millisecond response times. FTS5 provides BM25 ranking, prefix matching, and boolean operators.

**Semantic Search (ChromaDB + OpenAI Embeddings)** — Vector similarity retrieval for conceptual queries. Knowledge units are embedded using OpenAI's embedding model and stored in ChromaDB. A query like "how to handle state in recursive systems" retrieves semantically related units even when they share no keywords with the query.

**Hybrid Search (Reciprocal Rank Fusion)** — Combines FTS5 and vector results using Reciprocal Rank Fusion (RRF). This addresses the fundamental tension between lexical precision and semantic recall: FTS5 excels at exact matches, vector search excels at conceptual similarity, and RRF merges both ranked lists into a single result set that outperforms either modality alone.

The hybrid search implementation (`src/hybrid-search.ts`) supports configurable weighting between the two modalities, allowing the caller to bias toward precision or recall depending on the query type.

### 4. Intelligence Extraction

The Claude API integration (`src/claude-service.ts`) performs higher-order analysis on the knowledge corpus:

- **Insight Extraction** — Identifies non-obvious conclusions, patterns, and principles embedded in conversational exchanges
- **Smart Tagging** — Generates a controlled vocabulary of tags using LLM classification, going beyond keyword extraction to capture conceptual categories
- **Relationship Detection** — Maps connections between knowledge units, building a knowledge graph (`src/knowledge-graph.ts`) of conceptual dependencies and thematic links
- **Summarization** — Produces multi-level summaries: per-unit, per-conversation, and corpus-wide

This layer transforms the knowledge base from a retrieval system into an analytical tool. The knowledge graph enables queries like "What concepts are most connected to my understanding of recursive architecture?" — a question that requires structural analysis, not just search.

### 5. Web Interface

An Express.js server (`src/web-server.ts`) with WebSocket support serves a React frontend for browsing, searching, and exploring the knowledge base. The UI provides:

- Multi-modal search with result highlighting
- Knowledge unit browser with provenance links
- Knowledge graph visualization
- Real-time indexing status via WebSocket

---

## Quick Start

```bash
# Clone
git clone https://github.com/organvm-i-theoria/my-knowledge-base.git
cd my-knowledge-base

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Set ANTHROPIC_API_KEY, OPENAI_API_KEY, CHROMA_URL

# Initialize database
npm run db:init

# Run tests
npm test

# Start the web server
npm run start
```

**Prerequisites:** Node.js 20+, SQLite3, ChromaDB instance (local or remote), API keys for Anthropic (intelligence extraction) and OpenAI (embeddings).

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript 5.x | Type-safe application code |
| Runtime | Node.js | Server + CLI execution |
| Database | SQLite + FTS5 | Persistent storage + full-text search |
| Vector Store | ChromaDB | Semantic embedding storage + similarity search |
| Embeddings | OpenAI API | Text-to-vector conversion |
| Intelligence | Anthropic Claude API | Insight extraction, tagging, summarization |
| Browser Automation | Playwright | Conversation export from web UIs |
| Web Server | Express.js + WebSocket | API + real-time communication |
| Frontend | React | Knowledge base browser UI |
| Testing | Vitest | 200+ unit and integration tests |
| Deployment | Kubernetes | Production deployment manifests |

---

## Repository Structure

```
src/
├── atomizer.ts              # Knowledge unit decomposition (5 strategies)
├── database.ts              # SQLite storage + FTS5 indexing
├── semantic-search.ts       # ChromaDB vector search
├── hybrid-search.ts         # Reciprocal Rank Fusion search
├── knowledge-graph.ts       # Relationship mapping between units
├── claude-service.ts        # Anthropic API intelligence extraction
├── web-server.ts            # Express.js + WebSocket server
├── exporters/               # Playwright-based conversation exporters
└── ...                      # ~260 files total
tests/                       # 200+ test cases (Vitest)
k8s/                         # Kubernetes deployment manifests
```

---

## Roadmap

- [ ] **Additional exporters** — ChatGPT, Perplexity, and generic markdown import
- [ ] **Graph query language** — Structured queries over the knowledge graph (beyond keyword/vector search)
- [ ] **Incremental re-indexing** — Watch for new exports and atomize/index without full reprocessing
- [ ] **Multi-user support** — Shared knowledge bases with access control
- [ ] **Export to Obsidian/Logseq** — Bidirectional sync with existing PKM tools

---

## Cross-References

This repository is part of **ORGAN-I: Theoria**, the theoretical and epistemological organ of the ORGAN system. Related work:

| Repository | Relationship |
|-----------|-------------|
| [recursive-engine](https://github.com/organvm-i-theoria/recursive-engine) | Recursive self-modeling framework — the theoretical foundation for knowledge graph structures used here |
| [organvm-i-theoria](https://github.com/organvm-i-theoria) | Parent organ — all theory, epistemology, and ontology repositories |
| [meta-organvm](https://github.com/meta-organvm) | Umbrella organization coordinating all eight organs |

---

## Author

**[@4444J99](https://github.com/4444J99)** / Part of [ORGAN-I: Theoria](https://github.com/organvm-i-theoria)
