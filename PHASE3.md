# Phase 3: Claude-Powered Intelligence Layer

Phase 3 adds **intelligent processing** using Claude with prompt caching for token optimization.

## ✅ New Features

### 1. Intelligent Insight Extraction
- **Beyond message-level atomization** - Claude identifies key insights, not just messages
- Extracts actionable knowledge and best practices
- Identifies decision rationale and trade-offs
- Assigns importance ratings (high/medium/low)
- Self-contained, reusable insights

### 2. Smart Auto-Tagging
- **Claude-powered tagging** - better than regex keyword matching
- Context-aware categorization
- Confidence scoring
- Consistent, meaningful tags across all knowledge
- Automatic keyword extraction

### 3. Relationship Detection
- **Find connections** between atomic units
- Uses vector similarity + Claude validation
- Relationship types: related, prerequisite, expands-on, contradicts, implements
- Strength scoring (0-1)
- Explanations for each relationship

### 4. Semantic Chunking
- **Smarter than message-level** - chunks by topic, not arbitrary boundaries
- Natural topic segmentation
- Self-contained chunks
- Importance-weighted

### 5. Conversation Summarization
- Structured summaries with key points
- Identified topics and technologies
- Action items extraction
- Collection-level summaries

### 6. Prompt Caching
- **90% token cost savings** on repeated contexts
- Automatic cache management
- Detailed cost tracking
- Cache hit rate monitoring

## 🚀 Quick Start

### Step 1: Add Anthropic API Key

Edit `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Get your key from: https://console.anthropic.com/settings/keys

### Step 2: Extract Insights

```bash
# Extract insights from all conversations
npm run extract-insights all --save

# Extract from specific conversation
npm run extract-insights abc123 --save
```

### Step 3: Smart Tagging

```bash
# Re-tag existing units with Claude
npm run smart-tag --limit 10 --save

# Tag more units
npm run smart-tag --limit 100 --save
```

### Step 4: Find Relationships

```bash
# Detect relationships between units
npm run find-relationships --limit 5 --save

# More comprehensive (slower, more expensive)
npm run find-relationships --limit 20 --save
```

### Step 5: Summarize Conversations

```bash
# Summarize all conversations
npm run summarize all --save

# Summarize one conversation
npm run summarize abc123
```

## 📊 Feature Comparison

### Message-Level Atomization (Phase 1)
```
User: How do I implement OAuth?
Assistant: You can use Passport.js...

→ Creates 2 units (one per message)
→ Tags: basic keyword matching
→ No relationships detected
```

### Insight Extraction (Phase 3)
```
Same conversation →

Insight 1: "OAuth 2.0 Implementation Strategy"
- Type: insight
- Content: "Passport.js provides abstraction for OAuth flows..."
- Importance: high
- Tags: oauth, authentication, passport, nodejs, security
- Keywords: oauth2, strategy, middleware, session

Insight 2: "CSRF Protection in OAuth"
- Type: decision
- Content: "Always use CSRF tokens in OAuth state parameter..."
- Importance: high
- Relationship: prerequisite for Insight 1
```

## 🔧 CLI Tools

### 1. Extract Insights

```bash
npm run extract-insights <conversation-id | all> [--save]
```

**What it does:**
- Uses Claude to identify key insights
- Extracts 3-10 high-value learnings per conversation
- Assigns importance ratings
- Auto-tags and categorizes

**Example:**
```bash
npm run extract-insights all --save

# Output:
# 🧠 Intelligent Insight Extraction
# Loaded 10 conversations
#
# 🔍 Extracting insights from: OAuth Implementation
#   ✅ Extracted 5 insights
# ...
# ✅ Extracted 47 total insights
# 💾 Saved to database, markdown, and JSON
```

### 2. Smart Tag

```bash
npm run smart-tag [--limit N] [--save]
```

**What it does:**
- Re-tags existing units with Claude
- Improves tag quality and consistency
- Adds contextual keywords
- Updates categories

**Example:**
```bash
npm run smart-tag --limit 10 --save

# Output:
# 🏷️  Smart Auto-Tagging
#
# ✅ OAuth Implementation Strategy
#    Old tags: oauth, code
#    New tags: authentication, security, passport-js, best-practices
#    Confidence: 92%
#
# 📈 Summary:
#   Units processed: 10
#   Units improved: 8
#   Improvement rate: 80%
```

### 3. Find Relationships

```bash
npm run find-relationships [--limit N] [--save]
```

**What it does:**
- Uses embeddings to find similar units
- Claude validates and classifies relationships
- Builds knowledge graph

**Example:**
```bash
npm run find-relationships --limit 5 --save

# Output:
# 🕸️  Building relationship graph...
#
# 📌 OAuth Implementation
#    → [prerequisite] CSRF Protection
#       Strength: 85%
#       CSRF protection must be understood before implementing OAuth
#    → [expands-on] JWT Token Management
#       Strength: 78%
#       JWT is one approach for token handling in OAuth flows
```

### 4. Summarize

```bash
npm run summarize <conversation-id | all> [--save]
```

**What it does:**
- Creates structured conversation summaries
- Extracts key points and topics
- Identifies technologies mentioned
- Collection-level summaries for multiple conversations

**Example:**
```bash
npm run summarize all --save

# Output:
# 📋 Conversation Summarization
#
# 📌 Building a Secure API with OAuth
# Comprehensive discussion of implementing OAuth 2.0 authentication
#
# Key Points:
#   1. Use Passport.js for OAuth abstraction
#   2. Always validate CSRF tokens
#   3. Store tokens securely (encrypted, httpOnly cookies)
#
# Topics: authentication, oauth, security, nodejs
# Technologies: passport, express, jwt
```

## 💰 Cost Analysis

### Phase 3 Pricing (Claude Sonnet 4.5)

**Input:** $3 per 1M tokens
**Output:** $15 per 1M tokens
**Cache writes:** $3.75 per 1M tokens
**Cache reads:** $0.30 per 1M tokens (90% savings!)

### Typical Costs

#### Insight Extraction
- **Per conversation:** ~5,000 tokens input, ~1,000 tokens output
- **Cost:** ~$0.03 per conversation
- **100 conversations:** ~$3
- **With caching (after warmup):** ~$1

#### Smart Tagging
- **Per unit:** ~500 tokens input, ~100 tokens output
- **Cost:** ~$0.002 per unit
- **1000 units:** ~$2

#### Relationship Detection
- **Per unit:** ~1,000 tokens input (cached), ~200 tokens output
- **Cost:** ~$0.004 per unit (first time), ~$0.0005 (cached)
- **100 units:** ~$0.40 (first), ~$0.05 (subsequent)

#### Summarization
- **Per conversation:** ~3,000 tokens input, ~500 tokens output
- **Cost:** ~$0.015 per conversation
- **100 conversations:** ~$1.50

### Prompt Caching Savings

**Example: Processing 100 conversations**

Without caching:
- Input: 500,000 tokens × $3/M = $1.50
- Output: 100,000 tokens × $15/M = $1.50
- **Total: $3.00**

With caching (after warmup):
- Cache writes: 50,000 tokens × $3.75/M = $0.19
- Cache reads: 450,000 tokens × $0.30/M = $0.14
- Output: 100,000 tokens × $15/M = $1.50
- **Total: $1.83**

**Savings: 39%** (and increases with more requests)

## 🏗️ Architecture

### Prompt Caching Strategy

```typescript
// System prompt (cached for 5 minutes)
const systemPrompt = "You are an expert at extracting insights...";

// Cached context (conversation-specific, cached)
const cachedContext = "Previous conversation history...";

// Current query (never cached)
const query = "Extract insights from this message";

// Claude API call with cache
await claude.chat(query, {
  systemPrompt,      // 🔒 Cached
  cachedContext,     // 🔒 Cached
  useCache: true
});
```

### Insight Extraction Pipeline

```
1. Load Conversation
   ↓
2. Prepare Context (title + messages)
   ↓
3. Claude Analysis
   - Identify key insights (3-10 per conversation)
   - Assign types (insight, code, decision, reference)
   - Rate importance (high/medium/low)
   - Extract tags and keywords
   ↓
4. Parse JSON Response
   ↓
5. Convert to Atomic Units
   ↓
6. Save to Database
```

### Smart Tagging Pipeline

```
1. Load Atomic Unit
   ↓
2. Prepare Content (title + content preview)
   ↓
3. Claude Analysis
   - Generate relevant tags
   - Determine category
   - Extract keywords
   - Confidence score
   ↓
4. Parse Response
   ↓
5. Merge with Existing Tags
   ↓
6. Update Unit
```

### Relationship Detection Pipeline

```
1. Load Unit with Embedding
   ↓
2. Vector Similarity Search (ChromaDB)
   - Find candidates (similarity >= 0.7)
   - Get top 10
   ↓
3. For Each Candidate:
   - Claude validates relationship
   - Classifies type
   - Scores strength
   - Provides explanation
   ↓
4. Filter by Strength (>= 0.5)
   ↓
5. Save to Relationship Graph
```

## 📈 Comparison: Phase 1 vs Phase 3

| Feature | Phase 1 | Phase 3 |
|---------|---------|---------|
| **Atomization** | Message-level | Intelligent insights |
| **Tagging** | Regex keywords | Claude context-aware |
| **Relationships** | None | Multi-type with strength |
| **Quality** | Basic | High quality, curated |
| **Cost** | Free | ~$3-5 per 100 conversations |
| **Processing Time** | Instant | ~1-2 min per conversation |
| **Reusability** | Medium | Very High |

## 🎯 Use Cases

### 1. Learning & Knowledge Discovery

**Before (Phase 1):**
```bash
npm run search "OAuth"
→ Finds messages mentioning "OAuth"
→ Mixed quality, need to filter manually
```

**After (Phase 3):**
```bash
npm run extract-insights all --save
npm run search:hybrid "OAuth best practices"
→ Finds curated insights rated "high importance"
→ Sees related concepts (CSRF, sessions, JWT)
→ Follows prerequisite chain
```

### 2. Code Pattern Library

**Phase 3 Workflow:**
```bash
# 1. Extract code-focused insights
npm run extract-insights all --save

# 2. Find all code snippets
npm run search --type code "error handling"

# 3. See relationships
npm run find-relationships --save

# Result: Connected code pattern library
```

### 3. Decision Documentation

```bash
# Extract decisions from conversations
npm run extract-insights all --save

# Filter by type
npm run search --type decision "architecture"

# See what decisions led to what outcomes
npm run find-relationships --save
```

## 🔍 Advanced Usage

### Custom Insight Extraction

Create `custom-extract.ts`:
```typescript
import { InsightExtractor } from './insight-extractor.js';
import { Conversation } from './types.js';

const extractor = new InsightExtractor();

// Custom filtering
const myConversations: Conversation[] = [/* ... */];

const insights = await extractor.extractBatch(
  myConversations.filter(c => c.title.includes('Architecture'))
);

// Process insights
for (const [convId, units] of insights) {
  const highImportance = units.filter(u =>
    u.tags.includes('importance-high')
  );

  console.log(`${highImportance.length} high-value insights`);
}
```

### Batch Processing Workflow

```bash
# 1. Export conversations
npm run export:dev

# 2. Generate embeddings
npm run generate-embeddings -- --yes

# 3. Extract insights (Phase 3)
npm run extract-insights all --save

# 4. Smart tag everything
npm run smart-tag --limit 1000 --save

# 5. Build relationship graph
npm run find-relationships --limit 50 --save

# 6. Create summaries
npm run summarize all --save
```

## 🛠️ Troubleshooting

### "ANTHROPIC_API_KEY not found"
```bash
# Add to .env
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env
```

### Rate Limits

The CLI tools automatically add delays between requests:
- Insight extraction: 500ms
- Smart tagging: 200ms
- Relationship detection: 300ms
- Summarization: 400ms

If you hit rate limits, the tools will error. Wait a minute and retry.

### High Costs

**Tips to reduce costs:**

1. **Use limits:** Start with `--limit 10` to test
2. **Enable caching:** Always use `useCache: true` (done by default)
3. **Batch wisely:** Process similar conversations together for better cache hits
4. **Filter first:** Use Phase 2 semantic search to find relevant conversations before processing all

### Poor Quality Insights

**Improve extraction quality:**

1. **Better conversations:** Claude extracts what's there - ensure conversations are substantive
2. **Adjust prompts:** Modify `systemPrompt` in `insight-extractor.ts`
3. **Filter by importance:** Only keep "high" importance insights
4. **Use relationships:** Cross-reference insights to validate quality

## 📊 Monitoring Token Usage

All Phase 3 tools print token statistics:

```bash
npm run extract-insights all --save

# Output includes:
# 📊 Token Usage Statistics:
#   Input tokens: 425,183
#   Output tokens: 52,471
#   Cache writes: 125,000
#   Cache reads: 300,183
#   Total cost: $2.47
#   Cache savings: $0.85 (26%)
```

## 🎓 Best Practices

### 1. Progressive Enhancement

```bash
# Start with Phase 1 export
npm run export:dev

# Add Phase 2 semantics
npm run generate-embeddings -- --yes

# Enhance with Phase 3 intelligence
npm run extract-insights all --save
npm run smart-tag --limit 100 --save
```

### 2. Quality Over Quantity

- Extract insights from important conversations only
- Use importance ratings to filter
- Validate relationships before saving

### 3. Incremental Processing

- Process new conversations as they're added
- Don't re-extract insights from unchanged conversations
- Cache hits make subsequent runs cheap

### 4. Cost Management

- Test with small batches first (`--limit 5`)
- Monitor token usage
- Use prompt caching effectively
- Consider cost per insight vs value

## 🚀 What's Next: Phase 4+

Phase 4 could add:
- **Web UI** for browsing knowledge graph
- **Visual relationship explorer**
- **Interactive insight editor**
- **Collaborative knowledge base**
- **Git-based versioning**
- **Export to Obsidian/Notion**

---

**Phase 3 Complete!** You now have an intelligent, Claude-powered knowledge extraction system.
