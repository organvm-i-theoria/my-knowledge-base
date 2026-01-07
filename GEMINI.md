# Personal Knowledge Database System

**Project Type:** Node.js / TypeScript / SQLite
**Purpose:** A comprehensive system for exporting, atomizing, archiving, and intelligently searching conversation history from Claude.ai.

## Project Overview

This project is a sophisticated knowledge management tool that transforms raw conversation exports from Claude into a structured, searchable database. It evolves in phases, adding layers of intelligence:

1.  **Phase 1 (Foundation):** Automated export via Playwright, atomization into "Knowledge Units" (markdown/JSON), and SQLite storage with Full-Text Search (FTS5).
2.  **Phase 2 (Semantic Intelligence):** Vector embeddings (OpenAI), semantic search, and hybrid search (Reciprocal Rank Fusion) using ChromaDB.
3.  **Phase 3 (Claude Intelligence):** Intelligent insight extraction, smart auto-tagging, relationship detection, and summarization using the Anthropic API.
4.  **Phase 4 (Web UI & Export):** Visual knowledge graph, hybrid search interface, REST API, and Obsidian export.
5.  **Phase 5 (Omni-Source Ingestion):** Unified ingestion architecture for ChatGPT, Gemini, Grok, Apple Notes, and cloud drives (Dropbox/Drive/iCloud).

## Key Technologies

*   **Runtime:** Node.js, TypeScript (`tsx`)
*   **Database:** SQLite (`better-sqlite3`), ChromaDB (Vector Store)
*   **AI/ML:** OpenAI (Embeddings), Anthropic (Intelligence/Insights)
*   **Automation:** Playwright (Browser automation for exports)
- **Federated Knowledge System (Phase 5):** The system has transitioned to a "Zero-Copy" architecture.
    - **Configuration:** `config/sources.yaml` manages "Watch Roots" (Local, Dropbox, iCloud).
    - **Ingestion:** `LocalFileSource` indexes files in-place using stable path hashes.
    - **Status:** Dropbox `padavano-mdc` indexed successfully (26 docs). `Local Projects` scanned.
    - **Next:** PDF Parsing, Real-time Watchers (`chokidar`), and Semantic Search verification.
- A Cigna medical document was recovered from local Documents and is staged in 'production/rolling_submissions/B02_MEDICAL'.
- An Omni-Search was completed across iCloud, local directories, and Mail.app, resulting in 78 prioritized medical email leads and 'key' files dropped in all visited directories for future sorting.

## Setup & Configuration

Ensure you have a `.env` file in the root directory with the following keys (see `.env.example`):

```env
OPENAI_API_KEY=sk-...      # Required for Phase 2 (Embeddings)
ANTHROPIC_API_KEY=sk-...   # Required for Phase 3 (Intelligence)
```

## Core Workflows & Usage

### 1. Exporting Conversations
Automate the retrieval of chat history from Claude.app.

```bash
# Automated export (Headless)
npm run export:dev
```

### 2. Cloud Sync (Rclone)
Sync files from Dropbox, Drive, etc. into the system.

1.  Install Rclone: `brew install rclone`
2.  Configure remotes: `rclone config`
3.  Edit `scripts/sync-cloud.sh` to map your folders.
4.  Run sync:
    ```bash
    npm run sync
    ```

### 3. Searching Knowledge
Retrieve information using different search strategies.

```bash
# Full-Text Search (Fast, Keyword-based)
npm run search "search query"

# Semantic Search (Concept-based using embeddings)
npm run search:semantic "search query"

# Hybrid Search (Recommended: Combines FTS + Semantic)
npm run search:hybrid "search query"
```

### 3. Enhancing Knowledge (Phase 3)
Apply AI to extract structure and meaning from existing data.

```bash
# Extract key insights
npm run extract-insights all --save

# Generate smart tags based on context
npm run smart-tag --limit 100 --save

# Detect relationships between units
npm run find-relationships --limit 10 --save

# Summarize conversations
npm run summarize all --save
```

### 4. Database Maintenance

```bash
# Generate embeddings for existing non-vectorized data
npm run generate-embeddings -- --yes
```

## Directory Structure

*   `src/`: TypeScript source code.
    *   `atomizer.ts`: Logic for breaking conversations into atomic units.
    *   `database.ts`: SQLite interaction layer.
    *   `export.ts`: Main export script using Playwright.
    *   `search*.ts`: Various search implementations.
    *   `*-cli.ts`: CLI entry points for specific tasks.
*   `raw/`: Raw JSON exports from Claude.app.
*   `atomized/`: Processed data in human/machine-readable formats.
    *   `markdown/`: Knowledge units as Markdown files.
    *   `json/`: Knowledge units as JSON files.
*   `db/`: SQLite database file (`knowledge.db`).

## Development

*   **Build:** `npm run build` (Compiles TS to `dist/`)
*   **Dev Run:** Use `npm run dev` or run specific scripts via `tsx` (e.g., `tsx src/index.ts`).

## Documentation References

*   **[PHASE2.md](PHASE2.md)**: Semantic Search Implementation.
*   **[PHASE3.md](PHASE3.md)**: Claude Intelligence Layer.
*   **[PHASE4.md](PHASE4.md)**: Web UI & Export.
*   **[PHASE5.md](PHASE5.md)**: Omni-Source Ingestion Roadmap.
