# Quick Start Guide - Phase 1

## 🚀 You're Ready to Go!

Phase 1 is complete and installed. Here's how to use it:

## Option 1: Export from claude.app (Automated)

```bash
cd ~/knowledge-base
npm run export:dev
```

**What happens:**
1. Browser opens to claude.app
2. You log in manually
3. Press Enter when logged in
4. System exports ALL conversations automatically
5. Atomizes them into knowledge units
6. Saves to database, markdown, and JSON

**First time?** Use `--no-headless` to see the browser:
```bash
npm run export:dev -- --no-headless
```

## Option 2: Manual Export (Simpler)

### Step 1: Export from claude.app manually
1. Go to each conversation
2. Copy the full text
3. Save as JSON in `~/knowledge-base/raw/claude-app/`

Example JSON format:
```json
{
  "id": "abc123",
  "title": "OAuth Implementation",
  "created": "2025-01-15T10:30:00Z",
  "url": "https://claude.app/chat/abc123",
  "messages": [
    {
      "role": "user",
      "content": "How do I implement OAuth?"
    },
    {
      "role": "assistant",
      "content": "Here's how to implement OAuth..."
    }
  ],
  "artifacts": []
}
```

### Step 2: Process the exports
```typescript
// Create process-exports.ts
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ConversationAtomizer } from './atomizer.js';
import { KnowledgeDatabase } from './database.js';
import { MarkdownWriter } from './markdown-writer.js';
import { JSONWriter } from './json-writer.js';

const dir = './raw/claude-app';
const files = readdirSync(dir).filter(f => f.endsWith('.json'));

const db = new KnowledgeDatabase('./db/knowledge.db');
const atomizer = new ConversationAtomizer();
const mdWriter = new MarkdownWriter('./atomized/markdown');
const jsonWriter = new JSONWriter('./atomized/json');

for (const file of files) {
  const conv = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
  const units = atomizer.atomize(conv);

  db.insertConversation(conv);
  units.forEach(u => db.insertAtomicUnit(u));
  mdWriter.writeUnits(units);
  jsonWriter.writeUnits(units);
}

db.close();
```

## Search Your Knowledge

```bash
# Full-text search
tsx src/search.ts "OAuth implementation"

# Or use the database directly
npm run dev
```

## File Locations

After export, your knowledge will be in:

```
~/knowledge-base/
├── raw/claude-app/          # Original exports
├── atomized/
│   ├── markdown/            # Human-readable
│   │   └── 2025-01/
│   │       ├── *.md
│   │       └── index.md
│   └── json/                # Machine-readable
│       ├── units/*.json
│       └── index.jsonl
└── db/knowledge.db          # Searchable database
```

## What Gets Extracted?

Each conversation is atomized into:

1. **Message Units** - Individual messages with:
   - Auto-detected type (insight, question, code, decision, reference)
   - Auto-generated title
   - Extracted keywords
   - Auto-tags (programming languages, technologies, concepts)
   - Category (programming, writing, research, design)

2. **Code Units** - Extracted code blocks with:
   - Detected language
   - Full code content
   - Surrounding context

## Example Queries

```bash
# Find all OAuth-related knowledge
tsx src/search.ts "OAuth"

# Find TypeScript code
tsx src/search.ts "typescript"

# Find security insights
tsx src/search.ts "security"
```

## Database Queries

You can also query the SQLite database directly:

```bash
sqlite3 ~/knowledge-base/db/knowledge.db

# Full-text search
SELECT title, category, type FROM atomic_units
JOIN units_fts ON atomic_units.rowid = units_fts.rowid
WHERE units_fts MATCH 'OAuth'
LIMIT 10;

# Get all units by tag
SELECT u.title FROM atomic_units u
JOIN unit_tags ut ON u.id = ut.unit_id
JOIN tags t ON ut.tag_id = t.id
WHERE t.name = 'typescript';

# Stats
SELECT type, COUNT(*) as count FROM atomic_units GROUP BY type;
```

## Next: Phase 2 Features

Coming soon:
- Vector embeddings for semantic search
- Claude-powered insight extraction
- Relationship detection
- Web interface
- Incremental exports
- Token optimization with prompt caching

## Troubleshooting

### Playwright fails to launch
```bash
# Reinstall browser
cd ~/knowledge-base
npx playwright install chromium
```

### Database locked
```bash
# Close all connections
rm ~/knowledge-base/db/knowledge.db-wal
rm ~/knowledge-base/db/knowledge.db-shm
```

### Export fails at login
Use `--no-headless` mode to see what's happening:
```bash
npm run export:dev -- --no-headless
```

---

**You're all set!** Start exporting your Claude conversations and building your personal knowledge database.
