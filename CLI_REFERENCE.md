# CLI Reference Guide

Complete guide to all commands available in the knowledge base system.

## Core Commands

### Build & Development

```bash
npm run build
# Compile TypeScript to JavaScript in dist/ directory
# Use when preparing for production deployment

npm run dev
# Run TypeScript directly without compilation
# Useful for development and testing

npm run start
# Run pre-compiled JavaScript from dist/
# Use after npm run build
```

### Export & Ingestion

```bash
npm run export:dev
# Export conversations from claude.app using headless browser
# Interactive: Opens browser for login, waits for user confirmation
# Output: Raw JSON exports, atomized units, markdown, JSON files, database

Options:
  --no-headless     Show browser window (useful for debugging)
  --with-embeddings Generate embeddings during export (requires OPENAI_API_KEY)

Examples:
  npm run export:dev                          # Standard export
  npm run export:dev -- --no-headless         # With visible browser
  npm run export:dev -- --with-embeddings     # Include embeddings
  npm run export:dev -- --no-headless --with-embeddings
```

---

## Search Commands

### Full-Text Search (FTS)

```bash
npm run search "<query>"
# Fast keyword-based search using SQLite FTS5
# Returns exact and fuzzy matches on title, content, context, tags
# Speed: milliseconds (fastest option)

Options:
  Default limit is 10 results

Examples:
  npm run search "OAuth implementation"
  npm run search "authentication patterns"
  npm run search "TypeScript generics"
```

### Semantic Search

```bash
npm run search:semantic "<query>"
# Meaning-based search using vector embeddings
# Finds similar content even with different keywords
# Requires: Embeddings generated (npm run generate-embeddings)
# Requires: OPENAI_API_KEY in .env
# Speed: 100-500ms (slower, better for concepts)

Options:
  --limit <n>      Number of results (default: 10)
  --category <c>   Filter by category (programming, writing, research, design)
  --type <t>       Filter by unit type (insight, code, question, reference, decision)

Examples:
  npm run search:semantic "How do I authenticate users?"
  npm run search:semantic "API security" --limit 20
  npm run search:semantic "React patterns" --category programming
  npm run search:semantic "best practices" --type insight
```

### Hybrid Search (Recommended)

```bash
npm run search:hybrid "<query>"
# Combines FTS (keywords) + semantic (meaning) using Reciprocal Rank Fusion
# Best of both worlds: Fast + Intelligent
# Requires: Embeddings generated + OPENAI_API_KEY
# Speed: 200-600ms (balanced)

Options:
  --limit <n>              Number of results (default: 10)
  --fts-weight <0-1>       Weight for keyword matching (default: 0.4)
  --semantic-weight <0-1>  Weight for semantic similarity (default: 0.6)

Examples:
  npm run search:hybrid "database optimization"
  npm run search:hybrid "error handling" --limit 20
  npm run search:hybrid "testing strategies" --fts-weight 0.5 --semantic-weight 0.5
  npm run search:hybrid "API design" --fts-weight 0.3 --semantic-weight 0.7
```

### Usage Tips
- **Exact matches needed?** Use FTS search
- **Conceptual search?** Use semantic search
- **Not sure?** Use hybrid search
- **Faster results needed?** Increase FTS weight
- **Better relevance?** Increase semantic weight

---

## Embeddings Management

### Generate Embeddings

```bash
npm run generate-embeddings -- --yes
# Generate vector embeddings for all atomic units
# Uses OpenAI text-embedding-3-small model
# Stores in SQLite database + ChromaDB
# Requires: OPENAI_API_KEY in .env
# Cost: ~$0.02 per 1M tokens (~$0.0002 per conversation)

Process:
  1. Fetch all units from database
  2. Estimate cost
  3. Batch embeddings (100 units per batch)
  4. Store in SQLite (for backup)
  5. Add to ChromaDB (for vector search)

Options:
  --yes   Skip confirmation and run immediately

Examples:
  npm run generate-embeddings -- --yes
  # (without --yes will show cost estimate and ask for confirmation)
```

---

## Phase 3: Claude Intelligence Commands

### Extract Insights

```bash
npm run extract-insights <target> [--save]
# Identify key learnings from conversations
# Uses Claude Sonnet to analyze what matters (not just messages)
# Requires: ANTHROPIC_API_KEY in .env

Target:
  all              All conversations in database
  <conversation-id> Specific conversation ID

Output:
  - Console: Sample insights with types and tags
  - Database: Saved to insights table (if --save)
  - JSON: Saved to atomized/json/insights/
  - Markdown: Saved to atomized/markdown/insights/

Options:
  --save   Persist insights to database and files

Cost:
  ~$0.03 per conversation (with 90% savings via prompt caching)

Examples:
  npm run extract-insights all                    # Preview all
  npm run extract-insights all --save             # Save to database
  npm run extract-insights abc123def456           # Single conversation
  npm run extract-insights abc123def456 --save    # Save specific one
```

### Smart Tagging

```bash
npm run smart-tag [--limit <n>] [--save]
# Context-aware auto-tagging using Claude (better than regex)
# Analyzes content + similar units for better tags
# Requires: ANTHROPIC_API_KEY in .env

Options:
  --limit <n>  Number of units to tag (default: 50)
  --save       Persist new tags to database

Output:
  Console: Before/after tags with confidence scores
  Database: Updated tags (if --save)

Cost:
  ~$0.01 per unit (with caching: ~$0.002 per unit)
  --limit 100 = ~$0.50 (or $0.10 with caching)

Examples:
  npm run smart-tag --limit 50                    # Preview 50 units
  npm run smart-tag --limit 100 --save            # Tag and save 100
  npm run smart-tag --save                        # Tag default 50, save
```

### Detect Relationships

```bash
npm run find-relationships [--limit <n>] [--save]
# Detect connections between knowledge units
# Finds semantic relationships + co-occurrence patterns
# Requires: ANTHROPIC_API_KEY + OPENAI_API_KEY in .env

Options:
  --limit <n>  Number of units to process (default: all)
  --save       Persist relationships to database

Output:
  Console: Relationship graph summary
  Database: unit_relationships table (if --save)
  Markdown/JSON: Relationship details

Cost:
  ~$0.02 per unit analyzed (with semantic embeddings)

Examples:
  npm run find-relationships                      # Analyze all
  npm run find-relationships --limit 100          # Preview 100
  npm run find-relationships --save               # Full graph, save
```

### Summarize Conversations

```bash
npm run summarize <target> [--save]
# Generate structured summaries of conversations
# Key points, technologies, outcomes extracted by Claude
# Requires: ANTHROPIC_API_KEY in .env

Target:
  all              All conversations
  <conversation-id> Single conversation

Output:
  Console: Formatted summaries with key points
  Database: conversation_summaries table (if --save)
  JSON: atomized/json/summaries/

Options:
  --save   Persist summaries to database and files

Cost:
  ~$0.05 per conversation (with 90% caching savings)

Examples:
  npm run summarize all                           # Preview all
  npm run summarize all --save                    # Save all
  npm run summarize abc123def456 --save           # Single conversation
```

---

## Incremental Export

```bash
npm run export:incremental [--force]
# Export only new/updated conversations since last export
# Faster than full export - skips previously exported ones
# Saves state in ./export-state.json

First run: Behaves like full export
Subsequent runs: Only new conversations

Options:
  --force  Re-export everything (ignore state)

Output:
  Same as npm run export:dev

Examples:
  npm run export:incremental              # Normal incremental
  npm run export:incremental -- --force   # Full re-export
```

---

## Export Formats

### Export to Obsidian

```bash
npm run export-obsidian <vault-path>
# Export knowledge base as Obsidian vault
# Includes: Notes, tags, relationships, graph metadata
# Creates proper folder structure and backlinks

Output:
  <vault-path>/
    ├── 📁 inbox/           (daily-created units)
    ├── 📁 insights/        (insight units)
    ├── 📁 code/            (code snippets)
    ├── 📁 tags/            (tag index files)
    └── .obsidian/          (vault config + graph settings)

Options:
  --no-graph   Skip graph metadata generation

Examples:
  npm run export-obsidian ~/Documents/KnowledgeVault
  npm run export-obsidian ~/Obsidian/KB --no-graph
```

---

## Web Server

```bash
npm run web
# Start web UI server for browsing knowledge base
# REST API endpoints for queries
# Browser interface at http://localhost:3000

Features:
  - Full-text search with UI
  - Semantic search (if embeddings generated)
  - Hybrid search
  - Database statistics
  - Tag browsing
  - Relationship graph
  - Unit details view

Environment:
  PORT (default: 3000)
  Set via: PORT=3001 npm run web

Examples:
  npm run web                 # Default port 3000
  PORT=8080 npm run web      # Custom port
```

---

## Database Management

```bash
# Future commands (planned):
npm run db:backup
# Backup database and all files

npm run db:restore <backup-path>
# Restore from backup

npm run db:migrate up
# Run pending migrations

npm run db:migrate down <version>
# Rollback to specific version

npm run db:stats
# Show database statistics
```

---

## Environment Variables

Create `.env` file in project root:

```bash
# Required for exports
ANTHROPIC_API_KEY=sk-ant-...      # Claude API (Phase 3)

# Required for semantic search & embeddings
OPENAI_API_KEY=sk-...             # OpenAI API (Phase 2)

# Optional configuration
LOG_LEVEL=info                     # debug|info|warn|error (default: info)
PORT=3000                          # Web server port (default: 3000)
DATABASE_PATH=./db/knowledge.db    # Custom DB location
VECTOR_DB_PATH=./atomized/embeddings/chroma
```

---

## Common Workflows

### 1. Initial Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Create .env with your API keys
cp .env.example .env
# Edit .env and add OPENAI_API_KEY and ANTHROPIC_API_KEY
```

### 2. Export Conversations

```bash
# Export from Claude.app
npm run export:dev

# Later, incremental exports
npm run export:incremental
```

### 3. Enable Semantic Search

```bash
# Generate embeddings (one-time)
npm run generate-embeddings -- --yes

# Now use semantic search
npm run search:semantic "your query"
npm run search:hybrid "your query"
```

### 4. Full Intelligence Analysis

```bash
# Extract insights
npm run extract-insights all --save

# Smart tagging
npm run smart-tag --limit 100 --save

# Find relationships
npm run find-relationships --save

# Summarize conversations
npm run summarize all --save

# View results in web UI
npm run web
```

### 5. Continuous Development

```bash
# Watch TypeScript changes
npm run build -- --watch

# Or use development mode
npm run dev

# In another terminal, start web server
npm run web
```

---

## Troubleshooting

### Missing API Keys
```bash
# Error: OPENAI_API_KEY not found
# Solution: Add to .env

# Error: ANTHROPIC_API_KEY not found
# Solution: Add to .env
```

### Browser Login Issues
```bash
# If export:dev hangs at login:
npm run export:dev -- --no-headless
# Then manually log in in the browser window
```

### No Embeddings
```bash
# Error: No vectors in database
# Solution:
npm run generate-embeddings -- --yes

# Or re-export with embeddings:
npm run export:dev -- --with-embeddings
```

### Database Locked
```bash
# If "database is locked" error:
# 1. Stop all running commands
# 2. Delete db/knowledge.db-shm and db/knowledge.db-wal
# 3. Try again
```

---

## Performance Tips

- **Large database (10K+ units)?**
  - Use FTS search (faster than semantic)
  - Use `--limit` to reduce results
  - Use specific categories/types to filter

- **Semantic search slow?**
  - Reduce `--limit` parameter
  - Use FTS search for exact matches first
  - Pre-filter with `--category` or `--type`

- **Export slow?**
  - Use `npm run export:incremental` for subsequent exports
  - Disable embeddings if not needed

- **Memory issues?**
  - Reduce batch sizes in generate-embeddings
  - Process in smaller chunks
