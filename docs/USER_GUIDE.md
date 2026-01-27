# User Guide

A complete guide to using the Knowledge Base system for capturing, organizing, and searching your AI conversations.

## Getting Started

### Prerequisites

- Node.js 20+ installed
- OpenAI API key (for semantic search)
- Anthropic API key (for Phase 3 intelligence features)

### Installation

```bash
# Clone and install
git clone <repository-url>
cd knowledge-base
npm install

# Create environment file
cp .env.example .env

# Add your API keys to .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### First Run

```bash
# Build the project
npm run build

# Initialize database and start
npm run start

# Or use development mode (auto-recompile)
npm run dev
```

**Verify installation:**
```bash
curl http://localhost:3000/api/health
# Response: {"status":"healthy","timestamp":"...","uptime":...}
```

---

## Data Ingestion Workflow

The typical workflow: **Export -> Atomize -> Embed -> Search**

### Step 1: Export Conversations

**From Claude.app (browser-based):**
```bash
# Opens browser, logs in, scrapes conversations
npm run export:dev

# Export only new conversations (incremental)
npm run export:dev -- --incremental
```

**From Gemini:**
```bash
npm run export:dev -- --source=gemini
```

**From local markdown files:**
```bash
# Place .md files in raw/local/
cp your-notes/*.md raw/local/

# Process local files
npm run export-incremental
```

**From ChatGPT export:**
```bash
# Place ChatGPT export in raw/chatgpt/
unzip export.zip -d raw/chatgpt/

# Process
npm run export-incremental
```

### Step 2: Generate Embeddings

```bash
# Generate embeddings for all units (required for semantic search)
npm run generate-embeddings -- --yes

# Check embedding status
npm run search:semantic "test" 2>&1 | head -5
# Should return results, not "embeddings unavailable"
```

### Step 3: Search Your Knowledge

```bash
# Full-text search (fast, keyword-based)
npm run search "typescript generics"

# Semantic search (meaning-based, requires embeddings)
npm run search:semantic "how to handle errors in async code"

# Hybrid search (best of both, recommended)
npm run search:hybrid "react state management patterns"
```

---

## CLI Commands Reference

### Search Commands

```bash
# Basic full-text search
npm run search "your query"

# With filters
npm run search "query" -- --type=code --category=programming

# Semantic similarity search
npm run search:semantic "conceptual query"

# Hybrid search with custom weights
npm run search:hybrid "query" -- --fts-weight=0.3 --semantic-weight=0.7

# Get search suggestions (autocomplete)
curl "http://localhost:3000/api/search/suggestions?q=type"
```

### Export Commands

```bash
# Export from Claude.app
npm run export:dev

# Export from specific source
npm run export:dev -- --source=gemini
npm run export:dev -- --source=chatgpt
npm run export:dev -- --source=local

# Incremental export (new items only)
npm run export-incremental

# Export to Obsidian format
npm run export-obsidian
```

### Embedding Commands

```bash
# Generate embeddings for all units
npm run generate-embeddings -- --yes

# Generate for specific batch
npm run generate-embeddings -- --limit=100 --offset=0

# Check embedding coverage
curl http://localhost:3000/api/stats
```

### Phase 3 Intelligence Commands

```bash
# Extract insights from conversations
npm run extract-insights all --save --parallel 3

# Smart auto-tagging
npm run smart-tag --limit 100 --save --parallel 4

# Find relationships between units
npm run find-relationships --save

# Generate summaries
npm run summarize all --save

# Check token usage
curl http://localhost:3000/api/rate-limit/usage
```

---

## Web UI Walkthrough

### Starting the Web Interface

```bash
npm run web
# Open http://localhost:3000
```

### Main Features

**Search Panel:**
- Type your query in the search box
- Toggle between FTS, Semantic, and Hybrid modes
- Use filters: type (insight, code, question), category, tags
- Results show relevance scores and snippets

**Unit Details:**
- Click any result to view full content
- See related units and relationships
- View extracted tags and keywords
- Edit tags or content inline

**Graph Visualization:**
- Navigate to `/graph` endpoint
- Interactive knowledge graph
- Filter by relationship type
- Find paths between concepts

**Analytics Dashboard:**
- View search patterns
- Monitor unit distribution
- Track Phase 3 processing status

---

## Common Workflows

### Workflow 1: Daily Knowledge Capture

```bash
# Morning: Export new conversations
npm run export:dev -- --incremental

# Generate embeddings for new content
npm run generate-embeddings -- --yes

# Start web UI for searching
npm run web
```

### Workflow 2: Research Deep Dive

```bash
# Semantic search for concepts
npm run search:semantic "machine learning optimization techniques"

# Find related units
curl "http://localhost:3000/api/units/{unit-id}/related?limit=20"

# Export research to markdown
curl -X POST "http://localhost:3000/api/export/markdown" \
  -H "Content-Type: application/json" \
  -d '{"query":"machine learning"}' > research.md
```

### Workflow 3: Code Snippet Library

```bash
# Search for code snippets
npm run search "python async" -- --type=code

# List all code units
curl "http://localhost:3000/api/units?type=code&pageSize=50"

# Export code snippets
curl -X POST "http://localhost:3000/api/export/json" \
  -H "Content-Type: application/json" \
  -d '{"type":"code"}' > code-snippets.json
```

### Workflow 4: Weekly Intelligence Extraction

```bash
# Run full Phase 3 pipeline
npm run extract-insights all --save --parallel 3
npm run smart-tag --limit 500 --save --parallel 4
npm run find-relationships --save

# Check results
curl http://localhost:3000/api/intelligence/insights?limit=20
curl http://localhost:3000/api/graph/stats
```

---

## Phase 3 Intelligence Features

### Insight Extraction

Automatically extracts key insights, decisions, and learnings from conversations.

```bash
# Extract from all unprocessed conversations
npm run extract-insights all --save

# Extract from specific conversation
npm run extract-insights --conversation-id=abc123 --save

# View extracted insights via API
curl "http://localhost:3000/api/intelligence/insights?type=decision"
```

**Output types:**
- `insight` - Key learnings and observations
- `decision` - Choices made with reasoning
- `action` - Tasks or next steps identified

### Smart Tagging

Context-aware tagging using Claude to understand content semantics.

```bash
# Tag untagged units
npm run smart-tag --save

# Preview tags without saving
npm run smart-tag --limit=10

# Get tag suggestions via API
curl "http://localhost:3000/api/intelligence/tags/suggestions?unitId={id}"
```

**Benefits over keyword extraction:**
- Understands context (e.g., "React" vs "react to")
- Suggests hierarchical tags
- Identifies technology stacks

### Relationship Detection

Finds semantic connections between knowledge units.

```bash
# Detect relationships across all units
npm run find-relationships --save

# View relationship types
curl "http://localhost:3000/api/intelligence/relationships?unitId={id}"
```

**Relationship types:**
- `related` - General topical connection
- `prerequisite` - A must be understood before B
- `expands-on` - B elaborates on A
- `contradicts` - A and B have conflicting information
- `implements` - B is an implementation of concept A

### Conversation Summarization

Creates concise summaries of long conversations.

```bash
npm run summarize all --save

# View summaries
curl "http://localhost:3000/api/intelligence/summaries"
```

---

## Tips and Best Practices

### Optimizing Search Quality

1. **Use hybrid search** for best results: combines keyword matching with semantic understanding
2. **Be specific in queries**: "React useState hook examples" > "react hooks"
3. **Use filters**: narrow by type=code when looking for snippets
4. **Try semantic search** for conceptual questions: "best practices for error handling"

### Managing Large Knowledge Bases

```bash
# Process in batches to avoid memory issues
npm run generate-embeddings -- --limit=500 --yes

# Run intelligence in parallel but not too aggressively
npm run extract-insights all --save --parallel 2

# Monitor database size
ls -lh db/knowledge.db
```

### Keeping Content Fresh

```bash
# Daily incremental exports
0 9 * * * cd /path/to/kb && npm run export:dev -- --incremental

# Weekly embedding refresh
0 0 * * 0 cd /path/to/kb && npm run generate-embeddings -- --yes

# Monthly intelligence re-run
0 0 1 * * cd /path/to/kb && npm run extract-insights all --save
```

### Cost Management

**Embeddings (OpenAI):**
- ~$0.02 per 1M tokens
- Run once per unit, persisted in ChromaDB

**Phase 3 Intelligence (Anthropic):**
- Uses prompt caching for 90% token savings
- ~$0.034 per operation with caching (vs $0.32 without)
- Monitor usage: `curl http://localhost:3000/api/rate-limit/usage`

### Data Organization

```
raw/                    # Source exports
  claude/               # Claude.app exports
  gemini/               # Gemini exports
  chatgpt/              # ChatGPT exports
  local/                # Manual markdown files

atomized/               # Processed outputs
  json/units/           # Individual unit files
  embeddings/chroma/    # Vector database

db/                     # SQLite database
  knowledge.db          # Main database
```

---

## Keyboard Shortcuts (Web UI)

| Shortcut | Action |
|----------|--------|
| `/` | Focus search box |
| `Esc` | Clear search / close modal |
| `Enter` | Execute search |
| `Tab` | Cycle through results |
| `g` then `h` | Go to home |
| `g` then `g` | Go to graph view |

---

## API Quick Reference

```bash
# Health check
curl http://localhost:3000/api/health

# List units (paginated)
curl "http://localhost:3000/api/units?page=1&pageSize=20"

# Get single unit
curl http://localhost:3000/api/units/{id}

# Search
curl "http://localhost:3000/api/search?q=typescript"
curl "http://localhost:3000/api/search/semantic?q=error+handling"
curl "http://localhost:3000/api/search/hybrid?q=react+patterns"

# Create unit
curl -X POST http://localhost:3000/api/units \
  -H "Content-Type: application/json" \
  -d '{"type":"insight","title":"My insight","content":"..."}'

# Database stats
curl http://localhost:3000/api/stats
```

**Full API documentation:** See `docs/API_ENDPOINTS_SUMMARY.md`

---

## Next Steps

1. **Start small**: Export a few conversations and search them
2. **Generate embeddings**: Enable semantic search for better results
3. **Explore Phase 3**: Run intelligence extraction for insights
4. **Build habits**: Set up daily/weekly automation
5. **Customize**: Add your own sources in `src/sources/`

---

## References

- `CLAUDE.md` - Development commands and architecture
- `docs/API_DOCUMENTATION.md` - Full API reference
- `docs/TROUBLESHOOTING.md` - Common issues and fixes
- `docs/ARCHITECTURE.md` - System design details
