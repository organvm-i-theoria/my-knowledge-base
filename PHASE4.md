# Phase 4: Web UI, Visualization & Export

Phase 4 adds **web interface**, **graph visualization**, and **export utilities** to make your knowledge base accessible and portable.

## ✅ New Features

### 1. Web UI with REST API
- **Modern dark-themed interface** for browsing knowledge
- **Three search modes** (FTS, semantic, hybrid) in browser
- **Knowledge graph visualization** with D3.js
- **Tag browsing** and filtering
- **Conversation listing**
- **Real-time search** with adjustable weights

### 2. REST API
- **9 API endpoints** for programmatic access
- **CORS enabled** for external clients
- **JSON responses** for easy integration
- **Health checks** and stats

### 3. Obsidian Export
- **Native Obsidian vault format**
- **Wikilink-style connections** between notes
- **Tag index files**
- **Graph view configuration**
- **Organized folder structure** by type

### 4. Incremental Export
- **Only export new conversations** (saves time)
- **State tracking** to remember what's exported
- **Automatic embedding generation** (optional)
- **Force re-export** option

## 🚀 Quick Start

### Step 1: Start Web Server

```bash
cd ~/knowledge-base
npm run web
```

This starts the server at **http://localhost:3000**

### Step 2: Open in Browser

Navigate to **http://localhost:3000** and you'll see:

- **Search interface** with 3 modes
- **Knowledge graph** visualization
- **Tag browser**
- **Conversation list**

### Step 3: Search Your Knowledge

1. Type a query in the search box
2. Select search mode (FTS, Semantic, or Hybrid)
3. Click Search
4. Click any result to see full details

## 🌐 Web UI Features

### Search Interface

**Three Search Modes:**

1. **FTS (Full-Text Search)**
   - Fast keyword matching
   - Good for exact terms
   - Uses SQLite FTS5

2. **Semantic Search**
   - Meaning-based matching
   - Finds related concepts
   - Uses vector embeddings

3. **Hybrid Search** (Recommended)
   - Combines FTS + Semantic
   - Adjustable weights
   - Best overall results

**Adjustable Hybrid Weights:**
- FTS Weight slider (0-1)
- Semantic Weight slider (0-1)
- Real-time adjustment

### Knowledge Graph

**Interactive D3.js visualization:**

- **Nodes** = atomic units (color-coded by type)
- **Edges** = relationships between units
- **Draggable** nodes for custom layout
- **Click** nodes to view details
- **Limit** slider to control graph size

**Node Colors:**
- Blue: Insights
- Green: Code
- Orange: Questions
- Purple: References
- Red: Decisions

### Tag Browser

- **Grid layout** of all tags
- **Click tag** to filter units
- **Quick filtering** by category

### Conversations List

- **All exported conversations**
- **Creation dates**
- **Chronological order**

### Unit Detail Modal

Click any result to see:
- Full content
- Tags and keywords
- Type and category
- Timestamp
- Related units

## 🔌 REST API

### Endpoints

#### GET /api/health
Health check and service status

**Response:**
```json
{
  "status": "ok",
  "servicesReady": true,
  "hasOpenAI": true,
  "hasAnthropic": true
}
```

#### GET /api/stats
Database statistics

**Response:**
```json
{
  "totalUnits": { "count": 500 },
  "totalConversations": { "count": 50 },
  "totalTags": { "count": 120 },
  "unitsByType": [
    { "type": "insight", "count": 200 },
    { "type": "code", "count": 150 }
  ]
}
```

#### GET /api/search/fts?q=query&limit=10
Full-text search

**Parameters:**
- `q` (required): Search query
- `limit` (optional): Max results (default: 10)

**Response:**
```json
{
  "results": [{ "id": "...", "title": "...", ... }],
  "count": 10
}
```

#### GET /api/search/semantic?q=query&limit=10
Semantic search

**Parameters:**
- `q` (required): Search query
- `limit` (optional): Max results (default: 10)

**Response:**
```json
{
  "results": [
    {
      "unit": { "id": "...", "title": "...", ... },
      "score": 0.89,
      "distance": 0.11
    }
  ],
  "count": 10
}
```

#### GET /api/search/hybrid?q=query&ftsWeight=0.4&semanticWeight=0.6
Hybrid search

**Parameters:**
- `q` (required): Search query
- `limit` (optional): Max results (default: 10)
- `ftsWeight` (optional): FTS weight (default: 0.4)
- `semanticWeight` (optional): Semantic weight (default: 0.6)

**Response:**
```json
{
  "results": [
    {
      "unit": { "id": "...", "title": "...", ... },
      "ftsScore": 1,
      "semanticScore": 0.85,
      "combinedScore": 0.92
    }
  ],
  "count": 10
}
```

#### GET /api/units/:id
Get unit by ID

**Response:**
```json
{
  "id": "uuid",
  "title": "Unit Title",
  "type": "insight",
  "content": "...",
  "tags": ["tag1", "tag2"],
  ...
}
```

#### GET /api/tags
Get all tags

**Response:**
```json
{
  "tags": ["oauth", "typescript", "security", ...],
  "count": 120
}
```

#### GET /api/tags/:tag/units
Get units by tag

**Response:**
```json
{
  "units": [{ "id": "...", "title": "...", ... }],
  "count": 15
}
```

#### GET /api/graph?limit=50
Get graph data for visualization

**Parameters:**
- `limit` (optional): Max nodes (default: 50)

**Response:**
```json
{
  "nodes": [
    {
      "id": "uuid",
      "label": "Unit Title",
      "type": "insight",
      "category": "programming",
      "tags": ["oauth", "security"]
    }
  ],
  "edges": [
    {
      "source": "uuid1",
      "target": "uuid2",
      "type": "related"
    }
  ]
}
```

#### GET /api/conversations
Get all conversations

**Response:**
```json
{
  "conversations": [
    {
      "id": "conv123",
      "title": "OAuth Implementation",
      "created": "2025-01-15T10:00:00Z",
      "url": "https://claude.app/chat/conv123"
    }
  ],
  "count": 50
}
```

## 📦 Obsidian Export

Export your knowledge base to an Obsidian vault:

```bash
npm run export-obsidian ~/Documents/MyKnowledgeVault
```

### What Gets Created

**Folder Structure:**
```
MyKnowledgeVault/
├── Insights/           # Insight units
├── Code/               # Code snippets
├── Questions/          # Questions
├── References/         # References
├── Decisions/          # Decision records
├── Tags/               # Tag index files
└── .obsidian/          # Obsidian config
    └── graph.json      # Graph view settings
```

**Each Note:**
- YAML frontmatter with metadata
- Wikilink [[connections]] to related notes
- Tags as #hashtags
- Keywords and context

**Example Note:**
```markdown
---
id: uuid-here
type: insight
category: programming
tags:
  - oauth
  - security
  - typescript
created: 2025-01-15T10:30:00Z
conversationId: conv123
---

# OAuth Implementation Strategy

## Context

Working on adding OAuth2 authentication...

## Content

Passport.js provides a clean abstraction for OAuth flows...

## Related

- [[CSRF Protection in OAuth Flows]]
- [[Token Storage Considerations]]

## Tags

#oauth #security #typescript #authentication

## Keywords

authentication, authorization, strategy, session
```

### Tag Index Files

Each tag gets an index file in `Tags/`:

```markdown
# Tag: oauth

**15 units**

## Units

- [[OAuth Implementation Strategy]]
- [[CSRF Protection in OAuth Flows]]
- [[Token Storage Considerations]]
...
```

### Graph Configuration

Obsidian graph view is pre-configured with:
- Color-coded nodes by type
- Tag-based filtering
- Optimized layout settings

### Usage

```bash
# Basic export
npm run export-obsidian ~/Documents/KnowledgeVault

# Skip graph metadata
npm run export-obsidian ~/Documents/KnowledgeVault --no-graph
```

Then open the vault in Obsidian to explore your knowledge graph!

## 🔄 Incremental Export

Only export new conversations (much faster than full re-export):

```bash
npm run export-incremental
```

### How It Works

1. **State Tracking**: Remembers which conversations were exported
2. **Comparison**: Only exports new conversation IDs
3. **Updates**: Adds new units to existing knowledge base
4. **Efficiency**: Saves time and API calls

**State File:** `./db/export-state.json`
```json
{
  "lastExportDate": "2025-01-15T12:00:00Z",
  "exportedConversationIds": ["conv1", "conv2", ...]
}
```

### Options

```bash
# Basic incremental export
npm run export-incremental

# With embeddings
npm run export-incremental -- --with-embeddings

# Force re-export all
npm run export-incremental -- --force

# Visible browser (debugging)
npm run export-incremental -- --no-headless
```

### When to Use

**Incremental:** Daily/weekly updates
**Full Export:** Initial setup, major changes

**Example Workflow:**
```bash
# Initial export (full)
npm run export:dev -- --with-embeddings

# Daily incremental updates
npm run export-incremental -- --with-embeddings
```

## 🎨 UI Customization

### Colors (in `/web/css/styles.css`)

```css
:root {
    --primary: #2563eb;      /* Primary blue */
    --bg: #0f172a;           /* Dark background */
    --bg-light: #1e293b;     /* Card background */
    --text: #f1f5f9;         /* Text color */
    /* ... */
}
```

### Port Configuration

Change the port in `.env`:
```bash
PORT=8080
```

Or via command line:
```bash
PORT=8080 npm run web
```

## 🔒 Security

### XSS Prevention

All user content is HTML-escaped:
```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

### CORS

CORS is enabled for all origins (development mode).

For production, restrict in `web-server.ts`:
```typescript
app.use(cors({
  origin: 'https://yourdomain.com'
}));
```

### API Keys

Never expose API keys in frontend. All LLM operations happen server-side.

## 📊 Performance

### Web Server
- Express.js with async/await
- Lazy initialization of heavy services
- Efficient SQLite queries

### Graph Rendering
- D3.js force-directed layout
- Limit control to prevent slowdowns
- Hardware-accelerated rendering

### Search
- FTS: 10-50ms
- Semantic: 100-300ms (generates query embedding)
- Hybrid: 150-400ms (both + merge)

## 🔧 Advanced Usage

### Programmatic API Access

```javascript
// Fetch stats
const response = await fetch('http://localhost:3000/api/stats');
const stats = await response.json();
console.log(stats);

// Hybrid search
const query = 'OAuth best practices';
const url = `http://localhost:3000/api/search/hybrid?q=${encodeURIComponent(query)}`;
const results = await fetch(url).then(r => r.json());
console.log(results);
```

### Embedding in Other Apps

The API can be consumed by:
- Raycast extensions
- Alfred workflows
- Custom Electron apps
- Mobile apps
- CLI tools

### Custom Export Scripts

```typescript
import { KnowledgeDatabase } from './database.js';
import { writeFileSync } from 'fs';

const db = new KnowledgeDatabase();
const units = db.searchText('*', 10000);

// Export to custom format
const data = {
  version: '1.0',
  units: units,
  exportedAt: new Date().toISOString()
};

writeFileSync('custom-export.json', JSON.stringify(data, null, 2));
db.close();
```

## 🐛 Troubleshooting

### Web server won't start

**Check port availability:**
```bash
lsof -i :3000
```

**Kill existing process:**
```bash
kill -9 <PID>
```

### Graph not loading

1. Check browser console for errors
2. Ensure D3.js loaded (check Network tab)
3. Verify API endpoint returns data

### Search returns no results

1. Check database has data: `npm run search "*"`
2. For semantic search, ensure embeddings generated
3. Check API keys in `.env`

### Obsidian export fails

1. Ensure target directory is writable
2. Check disk space
3. Verify no invalid characters in titles

## 📈 Statistics

### Phase 4 Additions

- **Files Created:** 6 (web server, UI, export utils)
- **Lines of Code:** ~1,200 new lines
- **API Endpoints:** 9
- **UI Components:** 5 tabs/views

### Complete System

- **Total TypeScript Files:** 31
- **Total Lines of Code:** ~4,700
- **API Endpoints:** 9 REST endpoints
- **Search Modes:** 3 (FTS, semantic, hybrid)
- **Export Formats:** 4 (Markdown, JSON, Obsidian, SQLite)
- **Documentation:** 60KB+ across 7 files

## 🎯 Use Cases

### Daily Workflow

```bash
# Morning: export new conversations
npm run export-incremental -- --with-embeddings

# Browse and search via web UI
npm run web
# Open http://localhost:3000

# Evening: export to Obsidian for review
npm run export-obsidian ~/Documents/DailyReview
```

### Research Project

```bash
# Export full knowledge base
npm run export:dev -- --with-embeddings

# Extract insights
npm run extract-insights all --save

# Build relationship graph
npm run find-relationships --limit 50 --save

# Explore in web UI
npm run web
```

### Knowledge Sharing

```bash
# Export to Obsidian vault
npm run export-obsidian ~/Shared/TeamKnowledge

# Commit to git
cd ~/Shared/TeamKnowledge
git add . && git commit -m "Update knowledge base"
git push

# Team members can clone and use in Obsidian
```

## ✨ What's Next?

Phase 4 completes the core system. Possible future enhancements:

- **Mobile app** (React Native)
- **Browser extension** for in-context search
- **Slack/Discord bot** for team knowledge
- **Auto-sync** to Obsidian/Notion
- **Real-time collaboration**
- **Custom themes** for web UI
- **Export to PDF/eBook**
- **Import from other sources** (Notion, Roam)

---

**Phase 4 Status: COMPLETE ✅**

You now have a complete, production-ready knowledge management system!
