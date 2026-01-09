# Phase 3: Claude Intelligence API Documentation

## Overview

Phase 3 exposes Claude-powered intelligence capabilities via REST API. Analyze conversations for insights, auto-tag content with context awareness, detect relationships between knowledge units, and generate summaries—all with advanced batch processing, caching, and cost optimization.

**Key Features:**
- 6 intelligence endpoints with pagination
- Batch processing with progress tracking and resumability
- Prompt caching for 90% cost savings
- Advanced ranking, deduplication, and visualization
- Token usage tracking and cost reporting
- Health monitoring for service availability

---

## REST API Endpoints

### 1. List Insights
**Endpoint:** `GET /api/intelligence/insights`

Query stored insights extracted from conversations. Supports filtering, pagination, and ranking.

**Query Parameters:**
- `page` (default: 1): Page number for pagination
- `pageSize` (default: 20, max: 100): Results per page
- `type` (optional): Filter by unit type ('insight', 'decision', 'code', etc.)
- `category` (optional): Filter by category (technical, architectural, best-practice, etc.)
- `rank` (optional): Sort by ranking score (true/false, default: false)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "unit-id",
      "type": "insight",
      "title": "Key Learning from Conversation",
      "content": "Summary of the insight...",
      "category": "technical",
      "tags": ["authentication", "oauth"],
      "keywords": ["token", "refresh"],
      "timestamp": "2024-01-15T10:30:00Z",
      "importance": 0.9,
      "relatedUnits": ["unit-2", "unit-3"]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  },
  "metadata": {
    "processingTime": 45
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Example:**
```bash
# Get insights with ranking
curl "http://localhost:3000/api/intelligence/insights?page=1&pageSize=20&rank=true&category=technical"
```

---

### 2. Extract Insights On Demand
**Endpoint:** `POST /api/intelligence/insights/extract`

Extract insights from conversations or units using Claude. Supports batch processing.

**Request Body:**
```json
{
  "conversationId": "conv-id",     // OR
  "unitIds": ["unit-1", "unit-2"], // Either conversationId OR unitIds
  "save": true                      // Optional: auto-save to database
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "insight-uuid",
      "type": "insight",
      "title": "Key Learning Title",
      "content": "Detailed insight content...",
      "importance": 0.85,
      "category": "architectural",
      "tags": ["design", "scalability"],
      "keywords": ["microservices", "distributed"]
    }
  ],
  "metadata": {
    "tokenUsage": {
      "inputTokens": 2500,
      "outputTokens": 450,
      "cacheCreationTokens": 1200,
      "cacheReadTokens": 0,
      "totalCost": 0.032
    },
    "processingTime": 2340,
    "cached": false
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Examples:**
```bash
# Extract from conversation
curl -X POST http://localhost:3000/api/intelligence/insights/extract \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-abc123",
    "save": true
  }'

# Extract from multiple units with batch processing
curl -X POST http://localhost:3000/api/intelligence/insights/extract \
  -H "Content-Type: application/json" \
  -d '{
    "unitIds": ["unit-1", "unit-2", "unit-3"],
    "save": true
  }'
```

---

### 3. Get Smart Tag Suggestions
**Endpoint:** `GET /api/intelligence/tags/suggestions`

Get AI-powered tag suggestions for a unit. Tags are context-aware and technology-aware.

**Query Parameters:**
- `unitId` (optional): ID of unit to tag
- `content` (optional): Raw content to tag (if no unitId)
- `title` (optional): Unit title for context

**Response:**
```json
{
  "success": true,
  "data": {
    "tags": ["authentication", "oauth2", "jwt"],
    "category": "programming",
    "keywords": ["token", "refresh", "authorization"],
    "confidence": 0.92
  },
  "metadata": {
    "tokenUsage": {
      "inputTokens": 1200,
      "outputTokens": 85,
      "cacheCreationTokens": 800,
      "cacheReadTokens": 0,
      "totalCost": 0.0145
    },
    "processingTime": 1200
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Examples:**
```bash
# Tag by unit ID
curl "http://localhost:3000/api/intelligence/tags/suggestions?unitId=unit-abc123"

# Tag raw content
curl "http://localhost:3000/api/intelligence/tags/suggestions?content=Here%20is%20React%20code...&title=React%20Component%20Example"
```

---

### 4. List Unit Relationships
**Endpoint:** `GET /api/intelligence/relationships`

List detected relationships for a unit. Relationships show conceptual connections between knowledge units.

**Query Parameters:**
- `unitId` (required): Source unit ID
- `type` (optional): Filter by relationship type (related, prerequisite, expands-on, contradicts, implements)
- `minStrength` (default: 0.0, range: 0-1): Minimum relationship strength

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "from_unit": "unit-1",
      "to_unit": "unit-2",
      "relationship_type": "prerequisite",
      "strength": 0.87,
      "explanation": "Unit 2 requires understanding concepts from Unit 1",
      "to_unit_details": {
        "title": "Related Unit Title",
        "type": "code",
        "category": "programming"
      }
    }
  ],
  "metadata": {
    "processingTime": 65
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Relationship Types:**
- `related` - Conceptually related units
- `prerequisite` - Must understand this unit first
- `expands-on` - Provides more detail on topic
- `contradicts` - Presents conflicting view
- `implements` - Shows practical implementation

**Example:**
```bash
curl "http://localhost:3000/api/intelligence/relationships?unitId=unit-abc123&minStrength=0.7"
```

---

### 5. Detect Relationships Batch
**Endpoint:** `POST /api/intelligence/relationships/detect`

Detect relationships between multiple units using vector similarity + Claude validation.

**Request Body:**
```json
{
  "unitIds": ["unit-1", "unit-2", "unit-3", "unit-4"],
  "threshold": 0.7,  // Min similarity score (0-1)
  "save": true       // Auto-save to database
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "fromUnit": "unit-1",
      "relationships": [
        {
          "unitId": "unit-2",
          "type": "related",
          "strength": 0.85,
          "explanation": "Both cover authentication mechanisms"
        },
        {
          "unitId": "unit-3",
          "type": "prerequisite",
          "strength": 0.92,
          "explanation": "Unit 3 builds on concepts from Unit 1"
        }
      ]
    }
  ],
  "metadata": {
    "tokenUsage": {
      "inputTokens": 4200,
      "outputTokens": 650,
      "cacheCreationTokens": 2100,
      "cacheReadTokens": 0,
      "totalCost": 0.052
    },
    "processingTime": 5420
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/intelligence/relationships/detect \
  -H "Content-Type: application/json" \
  -d '{
    "unitIds": ["unit-1", "unit-2", "unit-3"],
    "threshold": 0.75,
    "save": true
  }'
```

---

### 6. List Conversation Summaries
**Endpoint:** `GET /api/intelligence/summaries`

Access pre-generated conversation summaries. Filter by date, retrieve by conversation ID.

**Query Parameters:**
- `page` (default: 1): Page number
- `pageSize` (default: 20, max: 100): Results per page
- `conversationId` (optional): Specific conversation to summarize

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "summary-uuid",
      "conversationId": "conv-abc123",
      "title": "Discussion Title",
      "summary": "2-3 sentence overview of conversation...",
      "keyPoints": [
        "Key point 1",
        "Key point 2",
        "Key point 3"
      ],
      "topics": ["topic1", "topic2"],
      "outcome": "Conclusion or decision reached",
      "actionItems": [
        "Action to take",
        "Another action"
      ],
      "timestamp": "2024-01-15T10:35:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Example:**
```bash
curl "http://localhost:3000/api/intelligence/summaries?page=1&pageSize=20"
```

---

## Advanced Features

### Batch Processing with Progress Tracking

Batch operations (insight extraction, relationship detection) support:

- **Progress Bars**: Real-time progress display with throughput and ETA
- **Resumability**: Checkpoint files allow resuming interrupted batches
- **Concurrency Control**: Parallel processing with configurable worker count
- **Rate Limiting**: Adaptive delays between API calls
- **Retry Logic**: Exponential backoff for transient failures

**CLI Example:**
```bash
# Extract insights from 100 conversations with progress
npm run extract-insights all --save --parallel 3 --progress

# Resume interrupted batch
npm run extract-insights all --save --resume
```

---

### Insight Ranking

Rank insights by relevance using multi-criteria scoring:

- **Importance** (40%): Claude's assessment of insight significance
- **Recency** (20%): Newer insights weighted higher
- **Relevance** (25%): Match with search query (if provided)
- **Uniqueness** (15%): How specific vs. generic

**API Usage:**
```bash
curl "http://localhost:3000/api/intelligence/insights?page=1&rank=true"
```

**Returns insights sorted by combined score with category suggestions.**

---

### Tag Deduplication

Find and merge similar/duplicate tags:

**API Reference:**
```bash
# Find duplicate tags (80% similarity threshold)
npm run deduplicate-tags -- --threshold 0.8

# Dry run (show what would be merged)
npm run deduplicate-tags -- --threshold 0.85 --dry-run

# Actually merge
npm run deduplicate-tags -- --threshold 0.85
```

**Features:**
- Levenshtein distance algorithm (edit distance)
- Case variant detection
- Merge tracking and statistics
- Preserves all relationships

---

### Tag Hierarchy Visualization

Organize tags into hierarchical tree structures:

**Formats:**
```bash
# ASCII tree view (default)
npm run visualize-tags -- --format ascii

# JSON structure
npm run visualize-tags -- --format json

# Mermaid diagram (for documentation)
npm run visualize-tags -- --format mermaid
```

**Example Output (ASCII):**
```
├── programming
│   ├── typescript (45)
│   │   ├── generics (8)
│   │   ├── types (12)
│   │   └── decorators (5)
│   ├── javascript (32)
│   └── python (18)
├── design
│   ├── ui (15)
│   └── ux (12)
└── writing (24)
```

**Hierarchy Building:**
- Automatic: Uses '/' separator in tags (e.g., 'programming/typescript/generics')
- AI-Suggested: Use Claude to infer hierarchies for flat tag lists

---

## Cost Tracking

All endpoints report token usage and estimated costs:

```json
"metadata": {
  "tokenUsage": {
    "inputTokens": 2500,
    "outputTokens": 450,
    "cacheCreationTokens": 1200,    // First request, creates cache
    "cacheReadTokens": 0,            // Subsequent requests use cache
    "totalCost": 0.032               // Estimated USD cost
  }
}
```

**Cost Savings Formula:**
- Cache writes: 1.25x input token cost
- Cache reads: 0.1x input token cost
- **Result:** 90% savings on repeated operations

**Example:**
```
Without cache: $0.10 per operation
With cache (first): $0.12 (1.25x input tokens)
With cache (subsequent): $0.01 (0.1x input tokens)
Savings after 2 calls: $0.03 vs $0.20 = 85% savings
```

---

## Error Handling

### Standard Error Response
```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "details": {
    "field": "Additional context"
  }
}
```

### Common Errors

| Code | Status | Description |
|------|--------|-------------|
| MISSING_PARAMS | 400 | Required parameters missing (conversationId, unitIds, etc.) |
| API_KEY_MISSING | 503 | ANTHROPIC_API_KEY not configured |
| NOT_FOUND | 404 | Unit, conversation, or relationship not found |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |
| RATE_LIMIT | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unexpected server error |

### Example Error Response
```json
{
  "error": "Either conversationId or unitIds must be provided",
  "code": "MISSING_PARAMS",
  "statusCode": 400,
  "timestamp": "2024-01-15T10:35:00Z"
}
```

---

## Performance Targets

| Operation | Target | Achieved |
|-----------|--------|----------|
| Single insight extraction | < 2 sec | ✅ |
| Batch extraction (10 units) | < 15 sec | ✅ |
| Tag suggestion | < 1.5 sec | ✅ |
| Relationship detection | < 3 sec | ✅ |
| List insights (cached) | < 50ms | ✅ |
| Batch processing throughput | > 5 items/sec | ✅ |

---

## Integration Examples

### Node.js/TypeScript
```typescript
import fetch from 'node-fetch';

async function extractInsights(conversationId: string) {
  const response = await fetch('http://localhost:3000/api/intelligence/insights/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      save: true
    })
  });
  
  const result = await response.json();
  console.log(`Extracted ${result.data.length} insights`);
  console.log(`Cost: $${result.metadata.tokenUsage.totalCost}`);
  
  return result;
}
```

### Python
```python
import requests

def get_insights(page=1, category=None):
    params = {
        'page': page,
        'pageSize': 20,
        'category': category
    }
    
    response = requests.get('http://localhost:3000/api/intelligence/insights', params=params)
    return response.json()

insights = get_insights(category='technical')
print(f"Found {insights['pagination']['total']} insights")
```

### cURL
```bash
# Get tag suggestions
curl -s "http://localhost:3000/api/intelligence/tags/suggestions?unitId=unit-123" | jq '.data.tags'

# Detect relationships
curl -X POST http://localhost:3000/api/intelligence/relationships/detect \
  -H "Content-Type: application/json" \
  -d '{"unitIds": ["unit-1", "unit-2"], "save": true}' | jq '.data'
```

---

## Database Schema

Intelligence data is stored in existing atomic_units with new fields:

```sql
-- Enhanced atomic_units table
id TEXT PRIMARY KEY,
type TEXT,                        -- 'insight', 'code', 'decision', etc.
title TEXT,
content TEXT,
context TEXT,
category TEXT,                    -- 'technical', 'architectural', etc.
tags TEXT,                        -- JSON array
keywords TEXT,                    -- JSON array
timestamp TIMESTAMP,
importance FLOAT,                 -- 0-1 (from InsightRanker)

-- Relationships table
CREATE TABLE unit_relationships (
  from_unit TEXT,
  to_unit TEXT,
  relationship_type TEXT,         -- 'related', 'prerequisite', etc.
  strength FLOAT,                 -- 0-1 confidence
  explanation TEXT,
  PRIMARY KEY (from_unit, to_unit, relationship_type)
);

-- Tags table for deduplication
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE
);

CREATE TABLE unit_tags (
  unit_id TEXT,
  tag_id INTEGER,
  PRIMARY KEY (unit_id, tag_id)
);
```

---

## CLI Commands

### Batch Operations
```bash
# Extract insights from all conversations
npm run extract-insights all --save --parallel 3

# Smart tag all units
npm run smart-tag --limit 100 --save --parallel 4

# Find relationships between units
npm run find-relationships --save

# Summarize conversations
npm run summarize all --save
```

### Feature Commands
```bash
# Deduplicate tags
npm run deduplicate-tags -- --threshold 0.85

# Visualize tag hierarchy
npm run visualize-tags -- --format ascii

# Generate cost report
npm run cost-report -- --period 30days
```

---

## Health Monitoring

### Health Check Endpoint
**Endpoint:** `GET /api/intelligence/health`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "services": {
      "claudeService": true,
      "relationshipDetector": true,
      "database": true
    },
    "timestamp": "2024-01-15T10:35:00Z"
  }
}
```

**Status Values:**
- `healthy` - All services working
- `degraded` - Some services unavailable (e.g., embeddings)
- `unhealthy` - Critical service failure

---

## Best Practices

1. **Batch Processing**: Use batch endpoints for processing > 10 items
2. **Caching**: Repeated analyses benefit from 90% cost savings
3. **Progress Tracking**: Enable progress bars for long-running operations
4. **Error Handling**: Implement retry logic with exponential backoff
5. **Cost Monitoring**: Check token usage in responses to budget API calls
6. **Relationship Thresholds**: Start at 0.7 for strict, lower to 0.5 for exploratory
7. **Tag Organization**: Use '/' separators to build meaningful hierarchies

---

## Future Enhancements

- **User Session Tracking**: Correlate insights with user workflows
- **Click Analytics**: Track which insights are most useful
- **A/B Testing**: Compare different extraction strategies
- **Advanced Visualization**: Interactive web UI for exploring relationships
- **Export Options**: JSONL, CSV, markdown export formats
- **Webhook Notifications**: Real-time alerts for new insights
- **Custom Prompts**: User-defined extraction templates

---

**Last Updated:** January 2024  
**API Version:** 1.0  
**Phase:** 3 of 5

