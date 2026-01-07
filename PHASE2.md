# Phase 2: Vector Search & Semantic Intelligence

Phase 2 adds **semantic search** capabilities using vector embeddings and ChromaDB.

## ✅ New Features

### 1. Vector Embeddings
- Generate embeddings for all atomic units using OpenAI's `text-embedding-3-small`
- Store embeddings in both SQLite and ChromaDB
- 1536-dimensional vectors for semantic similarity

### 2. Semantic Search
- Find knowledge by **meaning**, not just keywords
- Query: "How do I secure an API?" finds OAuth, authentication, JWT content
- Powered by vector similarity search

### 3. Hybrid Search
- **Combines** full-text search (FTS) + semantic search
- Uses Reciprocal Rank Fusion (RRF) to merge results
- Configurable weights (default: 40% FTS, 60% semantic)
- Best of both worlds: keyword precision + semantic recall

## 🚀 Quick Start

### Step 1: Set Up API Key

Create a `.env` file:
```bash
cd ~/knowledge-base
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:
```bash
OPENAI_API_KEY=sk-...
```

Get your key from: https://platform.openai.com/api-keys

### Step 2: Generate Embeddings

For existing knowledge base:
```bash
npm run generate-embeddings -- --yes
```

This will:
1. Read all atomic units from database
2. Generate embeddings using OpenAI
3. Store in SQLite + ChromaDB
4. Show cost estimate before running

**Cost:** ~$0.02 per 1M tokens (~$0.001 for 100 conversations)

### Step 3: Use Semantic Search

```bash
# Semantic search (meaning-based)
npm run search:semantic "How do I implement OAuth?"

# Hybrid search (FTS + semantic)
npm run search:hybrid "OAuth security patterns"

# Traditional FTS (keyword-based)
npm run search "OAuth"
```

## 📊 Search Comparison

### Full-Text Search (FTS)
```bash
npm run search "OAuth implementation"
```
- **Pros:** Fast, exact keyword matching
- **Cons:** Misses synonyms and concepts
- **Best for:** Known terms, code snippets

### Semantic Search
```bash
npm run search:semantic "How do I authenticate users?"
```
- **Pros:** Understands meaning, finds related concepts
- **Cons:** May miss exact matches
- **Best for:** Conceptual queries, learning

### Hybrid Search (Recommended)
```bash
npm run search:hybrid "secure API authentication"
```
- **Pros:** Best of both worlds
- **Cons:** Slightly slower
- **Best for:** General queries, exploration

## 🔧 Advanced Usage

### Customize Hybrid Weights

```bash
# More keyword-focused (70% FTS, 30% semantic)
npm run search:hybrid "OAuth" -- --fts-weight 0.7 --semantic-weight 0.3

# More concept-focused (30% FTS, 70% semantic)
npm run search:hybrid "authentication patterns" -- --fts-weight 0.3 --semantic-weight 0.7
```

### Filter Semantic Search

```bash
# Search only programming content
npm run search:semantic "error handling" -- --category programming

# Search only code snippets
npm run search:semantic "async function" -- --type code

# Limit results
npm run search:semantic "database queries" -- --limit 5
```

### Export with Embeddings

Generate embeddings automatically during export:
```bash
npm run export:dev -- --with-embeddings
```

This adds ~5-10 seconds per 100 units but saves a separate step.

## 💰 Cost Analysis

### Embedding Costs (OpenAI text-embedding-3-small)
- **Price:** $0.02 per 1M tokens
- **Average conversation:** ~10,000 tokens → $0.0002
- **100 conversations:** ~1M tokens → $0.02
- **1000 conversations:** ~10M tokens → $0.20

### Cost Optimization Tips
1. **Generate once:** Embeddings are stored permanently
2. **Batch processing:** Script automatically batches 100 units per request
3. **Local caching:** ChromaDB stores vectors locally (no repeated API calls)
4. **Selective embedding:** Only embed important conversations

## 🏗️ Architecture

### Data Flow
```
1. Atomic Units (from Phase 1)
   ↓
2. Text Preparation (title + content)
   ↓
3. OpenAI Embeddings API
   ↓
4. Storage:
   ├─ SQLite (atomic_units.embedding BLOB)
   └─ ChromaDB (vector similarity search)
   ↓
5. Search:
   ├─ FTS (SQLite FTS5)
   ├─ Semantic (ChromaDB)
   └─ Hybrid (RRF merge)
```

### Vector Database Schema (ChromaDB)

```typescript
Collection: knowledge_units
- IDs: unit.id (UUID)
- Embeddings: 1536-dimensional vectors
- Documents: "title\n\ncontent"
- Metadata:
  - type: insight|code|question|...
  - category: programming|writing|...
  - tags: comma-separated
  - conversationId
  - timestamp
  - title
```

## 🧪 Example Queries

### Conceptual Understanding
```bash
# Finds OAuth, JWT, sessions, auth patterns
npm run search:semantic "How do user authentication work?"

# Finds async/await, promises, callbacks
npm run search:semantic "handling asynchronous operations"

# Finds optimization techniques across languages
npm run search:semantic "performance optimization strategies"
```

### Code Discovery
```bash
# Finds code examples regardless of exact syntax
npm run search:semantic "error handling in API requests"

# Finds database query patterns
npm run search:semantic "querying relational databases"
```

### Cross-Language Learning
```bash
# Finds similar concepts in different languages
npm run search:semantic "dependency injection patterns"

# Finds testing approaches
npm run search:semantic "unit testing best practices"
```

## 📈 Performance

### Typical Search Times
- **FTS only:** 10-50ms (SQLite)
- **Semantic only:** 50-200ms (ChromaDB + embedding generation)
- **Hybrid:** 100-300ms (both + merge)

### Database Sizes
- **SQLite:** ~1MB per 1000 units (with embeddings)
- **ChromaDB:** ~10MB per 1000 units (vector index)
- **Markdown:** ~2MB per 1000 units

## 🔍 How Semantic Search Works

### 1. Query Embedding
```typescript
Query: "How do I secure an API?"
  ↓
OpenAI API
  ↓
Vector: [0.023, -0.145, 0.089, ...] (1536 dimensions)
```

### 2. Similarity Search
```typescript
// Cosine similarity between query vector and all unit vectors
similarity(query, unit) = cos(θ) = (A · B) / (||A|| × ||B||)

// ChromaDB returns top K most similar
Top results:
1. "OAuth 2.0 Implementation" (similarity: 0.92)
2. "API Authentication Best Practices" (0.89)
3. "JWT Token Security" (0.87)
```

### 3. Hybrid Fusion (RRF)
```typescript
// Reciprocal Rank Fusion combines FTS + Semantic
score(unit) = fts_weight / (k + fts_rank) + semantic_weight / (k + semantic_rank)

// Example:
Unit A: FTS rank=1, Semantic rank=3
  → score = 0.4/(60+1) + 0.6/(60+3) = 0.0066 + 0.0095 = 0.0161

Unit B: FTS rank=10, Semantic rank=1
  → score = 0.4/(60+10) + 0.6/(60+1) = 0.0057 + 0.0098 = 0.0155

// Unit A wins (better balanced ranking)
```

## 🛠️ Troubleshooting

### "No vectors in database"
```bash
# Generate embeddings first
npm run generate-embeddings -- --yes
```

### "OPENAI_API_KEY not found"
```bash
# Create .env file
echo 'OPENAI_API_KEY=sk-...' > .env
```

### "Rate limit exceeded"
```bash
# The script automatically batches and adds delays
# Wait a minute and try again
```

### ChromaDB connection errors
```bash
# Clear and reinitialize
rm -rf ~/knowledge-base/atomized/embeddings/chroma
npm run generate-embeddings -- --yes
```

## 📚 Technical Deep Dive

### Embedding Model
- **Model:** `text-embedding-3-small`
- **Dimensions:** 1536
- **Context window:** 8,191 tokens
- **Performance:** High quality at low cost

### Why Text-Embedding-3-Small?
1. **Cost-effective:** 5x cheaper than text-embedding-3-large
2. **Fast:** Lower dimensions = faster search
3. **Quality:** Excellent for knowledge retrieval tasks
4. **Proven:** Industry standard for RAG applications

### Reciprocal Rank Fusion (RRF)
RRF is better than simple score combination because:
- **Rank-based:** Doesn't assume comparable scores across systems
- **Robust:** Works even if one system fails
- **Proven:** Used by major search engines

Formula:
```
RRF(d) = Σ (w_i / (k + rank_i(d)))
```

Where:
- `d` = document
- `w_i` = weight for ranker i
- `k` = constant (typically 60)
- `rank_i(d)` = rank of document d in ranker i

## 🎯 Next: Phase 3

Phase 3 will add **Claude-powered intelligence**:
- Auto-tagging with Claude
- Insight extraction (not just messages)
- Relationship detection
- Semantic chunking
- Conversation summarization

## 💡 Tips

1. **Start with hybrid search** - it's the most versatile
2. **Use semantic for exploration** - discover related concepts
3. **Use FTS for precision** - when you know exact terms
4. **Adjust weights** based on your query type
5. **Generate embeddings incrementally** - only for new conversations

---

**Phase 2 Complete!** You now have a semantic knowledge base with three search modes.
