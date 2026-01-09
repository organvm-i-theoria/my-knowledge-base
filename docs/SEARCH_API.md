# Phase 2: Search API Documentation

## Overview

Phase 2 introduces comprehensive search capabilities combining full-text search, semantic search, and advanced features like autocomplete, spell correction, and faceted navigation.

**Key Features:**
- 6 RESTful search endpoints with pagination
- Full-text search (FTS5) with keyword matching
- Semantic search using vector embeddings
- Hybrid search combining both approaches with adjustable weights
- In-memory LRU search result caching
- Query analytics and tracking
- Autocomplete with multi-source suggestions
- Search result faceting by category, type, tags, and date
- Filter presets for saved search configurations
- Spell correction using Levenshtein distance
- Incremental embedding generation

---

## REST API Endpoints

### 1. Enhanced Full-Text Search
**Endpoint:** `GET /api/search`

Search across unit titles and content using SQLite FTS5 full-text search.

**Query Parameters:**
- `q` (required): Search query string
- `page` (default: 1): Page number for pagination
- `pageSize` (default: 20, max: 100): Results per page
- `facets` (default: false): Include facet counts in response (true/false)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "unit-id",
      "type": "insight",
      "title": "Unit Title",
      "content": "Unit content...",
      "category": "programming",
      "tags": ["tag1", "tag2"],
      "keywords": ["keyword1"],
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8,
    "offset": 0
  },
  "query": {
    "original": "OAuth implementation",
    "normalized": "oauth implementation"
  },
  "facets": [
    {
      "field": "category",
      "buckets": [
        { "value": "programming", "count": 45 },
        { "value": "design", "count": 12 }
      ]
    }
  ],
  "stats": {
    "cacheHit": false
  },
  "searchTime": 125,
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Example:**
```bash
curl "http://localhost:3000/api/search?q=OAuth&page=1&pageSize=20&facets=true"
```

---

### 2. Semantic Search
**Endpoint:** `GET /api/search/semantic`

Search using vector embeddings for semantic similarity matching.

**Query Parameters:**
- `q` (required): Search query
- `page` (default: 1): Page number
- `pageSize` (default: 20, max: 100): Results per page
- `type` (optional): Filter by unit type (insight, code, question, reference, decision)
- `category` (optional): Filter by category (programming, writing, research, design, general)

**Response:** Same structure as full-text search with semantic relevance scores

**Example:**
```bash
curl "http://localhost:3000/api/search/semantic?q=design%20patterns&category=programming&page=1"
```

---

### 3. Hybrid Search
**Endpoint:** `GET /api/search/hybrid`

Combine full-text and semantic search with customizable weights using Reciprocal Rank Fusion (RRF).

**Query Parameters:**
- `q` (required): Search query
- `page` (default: 1): Page number
- `pageSize` (default: 20, max: 100): Results per page
- `ftsWeight` (default: 0.4, range: 0-1): Full-text search weight
- `semanticWeight` (default: 0.6, range: 0-1): Semantic search weight
- `facets` (default: false): Include facets (true/false)

**Response:** Combined results ranked by RRF algorithm

**Weighting Strategy:**
- Default (0.4/0.6): Emphasizes semantic meaning
- Balanced (0.5/0.5): Equal importance
- FTS-focused (0.8/0.2): Prioritize keyword matching
- Semantic-focused (0.2/0.8): Prioritize meaning

**Example:**
```bash
# Semantic-focused hybrid search
curl "http://localhost:3000/api/search/hybrid?q=react%20hooks&ftsWeight=0.2&semanticWeight=0.8&facets=true"

# Balanced hybrid search
curl "http://localhost:3000/api/search/hybrid?q=typescript&ftsWeight=0.5&semanticWeight=0.5"
```

---

### 4. Autocomplete Suggestions
**Endpoint:** `GET /api/search/suggestions`

Get autocomplete suggestions from multiple sources (previous queries, tags, keywords, titles).

**Query Parameters:**
- `q` (required): Query prefix (minimum 1 character)
- `limit` (default: 10, max: 20): Number of suggestions

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "text": "OAuth implementation",
      "type": "query",
      "score": 0.95,
      "metadata": {
        "frequency": 42,
        "lastUsed": "2024-01-15T10:00:00Z"
      }
    },
    {
      "text": "OAuth",
      "type": "tag",
      "score": 0.87,
      "metadata": {}
    }
  ],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Suggestion Sources:**
- Previous queries (40% weight)
- Tags (30% weight)
- Keywords (20% weight)
- Unit titles (10% weight)

**Example:**
```bash
curl "http://localhost:3000/api/search/suggestions?q=oaut&limit=10"
```

---

### 5. Faceted Search
**Endpoint:** `GET /api/search/facets`

Get available facets for filtering search results.

**Query Parameters:** None

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "field": "category",
      "buckets": [
        { "value": "programming", "count": 245 },
        { "value": "writing", "count": 123 },
        { "value": "research", "count": 89 }
      ]
    },
    {
      "field": "type",
      "buckets": [
        { "value": "code", "count": 156 },
        { "value": "insight", "count": 189 },
        { "value": "question", "count": 112 }
      ]
    },
    {
      "field": "tags",
      "buckets": [
        { "value": "TypeScript", "count": 67 },
        { "value": "React", "count": 54 }
      ]
    },
    {
      "field": "date",
      "buckets": [
        {
          "value": "2024-01",
          "count": 45,
          "period": "2024-01",
          "startDate": "2024-01-01T00:00:00Z",
          "endDate": "2024-01-31T23:59:59Z"
        }
      ]
    }
  ],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Example:**
```bash
curl "http://localhost:3000/api/search/facets"
```

---

### 6. Filter Presets
**Endpoint:** `GET /api/search/presets`

List available filter presets for quick filtered searches.

**Query Parameters:** None

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "recent-code",
      "name": "Recent Code Snippets",
      "description": "Code units from the last 30 days",
      "filters": {
        "type": "code",
        "dateFrom": "2023-12-15"
      }
    },
    {
      "id": "unanswered-questions",
      "name": "Unanswered Questions",
      "description": "Question units without answers",
      "filters": {
        "type": "question",
        "tags": ["unanswered"]
      }
    }
  ],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**Built-in Presets:**
- `recent-code`: Code units from last 30 days
- `unanswered-questions`: Questions marked as unanswered
- `all-decisions`: All decision records
- `recent-design`: Design units from last 14 days
- `typescript-only`: TypeScript-related content only
- `exclude-incomplete`: Hide incomplete/draft items
- `react-ecosystem`: React-related content

**Example:**
```bash
curl "http://localhost:3000/api/search/presets"
```

---

## Caching Strategy

### Result Caching
- **Type:** In-memory LRU cache
- **Max Size:** 1,000 entries
- **TTL:** 5 minutes (300 seconds)
- **Hit Rate Target:** >70%
- **Invalidation:** Manual via API or automatic on TTL expiry

### Cache Key Generation
Cache keys are generated using SHA256 hash of:
- Query string (normalized)
- Filter criteria (sorted for consistency)
- Search type (FTS, semantic, hybrid)
- Pagination parameters (limit only, not page)
- Weights (for hybrid search)

### Cache Hit Detection
The response includes a `stats.cacheHit` field:
- `true`: Result served from cache
- `false`: Result from fresh query

---

## Analytics & Tracking

### Query Tracking
Every search query is automatically logged with:
- Query text and normalized form
- Search type (fts/semantic/hybrid)
- Latency in milliseconds
- Number of results returned
- Timestamp
- Optional: user session ID, filters, clicked result

### Spell Correction
- **Algorithm:** Levenshtein distance (edit distance)
- **Max Distance:** 2 character edits
- **Confidence:** Combines distance + term frequency
- **Dictionary:** Auto-built from tags, keywords, titles

### Query Suggestions
- **Sources:** Previous queries (40%), tags (30%), keywords (20%), titles (10%)
- **Frequency Tracking:** Counts for popular suggestion ranking
- **Cleanup:** Automatic deletion of unused suggestions older than 30 days

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Uncached search | < 500ms | FTS5 + semantic combined |
| Cached search | < 10ms | From in-memory cache |
| Facet generation | < 100ms | For 10K+ units |
| Autocomplete | < 50ms | Multi-source aggregation |
| Spell check | < 30ms | Levenshtein algorithm |
| Cache hit rate | > 70% | Typical usage patterns |

---

## Filter Syntax

### Simple Filters
```
GET /api/search/hybrid?q=typescript&type=code&category=programming
```

### Multiple Values
```
GET /api/search/hybrid?q=design&type=code&type=insight
```

### Date Ranges
```
GET /api/search/hybrid?q=recent&dateFrom=2024-01-01&dateTo=2024-01-31
```

### Complex Queries (URL-encoded)
```
GET /api/search/hybrid?q=typescript%20patterns&ftsWeight=0.3&semanticWeight=0.7&page=2&pageSize=50
```

---

## Error Handling

### Error Response Format
```json
{
  "error": "Search query is required",
  "code": "MISSING_QUERY",
  "statusCode": 400
}
```

### Common Errors
- `400 MISSING_QUERY`: Query parameter required
- `400 INVALID_PAGESIZE`: Page size out of range
- `404 NOT_FOUND`: Specific unit not found
- `503 NOT_AVAILABLE`: Semantic search unavailable (no embeddings)
- `500 INTERNAL_ERROR`: Unexpected server error

---

## Search Examples

### Finding Code Patterns
```bash
# Semantic search for React patterns
curl "http://localhost:3000/api/search/semantic?q=react%20component%20patterns&type=code"
```

### Recent Design Decisions
```bash
# Using a preset
curl "http://localhost:3000/api/search/hybrid?q=design%20decision&preset=recent-design"
```

### TypeScript Examples with Pagination
```bash
# Page 2 of TypeScript results
curl "http://localhost:3000/api/search/hybrid?q=typescript%20generics&category=programming&page=2&pageSize=20"
```

### Exploring with Facets
```bash
# Get facets to understand available data
curl "http://localhost:3000/api/search/facets"

# Then search with specific facet values
curl "http://localhost:3000/api/search/hybrid?q=TypeScript&tags=typescript"
```

---

## Integration Guide

### Basic Search in Node.js
```typescript
import fetch from 'node-fetch';

async function search(query: string, page = 1) {
  const params = new URLSearchParams({
    q: query,
    page: page.toString(),
    pageSize: '20',
    facets: 'true'
  });

  const response = await fetch(`http://localhost:3000/api/search?${params}`);
  const data = await response.json();
  
  return data;
}

// Usage
const results = await search('OAuth implementation', 1);
console.log(`Found ${results.pagination.total} results`);
```

### Hybrid Search with Custom Weights
```typescript
async function hybridSearch(query: string, ftsWeight = 0.4, semanticWeight = 0.6) {
  const params = new URLSearchParams({
    q: query,
    ftsWeight: ftsWeight.toString(),
    semanticWeight: semanticWeight.toString(),
    facets: 'true'
  });

  const response = await fetch(`http://localhost:3000/api/search/hybrid?${params}`);
  return response.json();
}
```

---

## Version History

- **v1.0 (January 2024):** Initial Phase 2 release
  - 6 REST API endpoints
  - Full-text and semantic search
  - LRU result caching
  - Query analytics
  - Autocomplete and spell correction
  - Faceted navigation
  - Filter presets
