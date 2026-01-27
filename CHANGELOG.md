# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-27

### Added

#### Phase 1: Foundation & Export
- Playwright-based Claude.app conversation scraping
- Gemini browser crawler with login detection
- ChatGPT export file parser
- Local markdown document ingestion
- Google Docs integration (read-only)
- Message-level atomization with 5 strategies (insight, code, question, reference, decision)
- Code block extraction as separate units
- Header-based document atomization
- Auto-generated titles and keyword extraction
- RSS feed export capability
- Batch export with progress tracking

#### Phase 2: Semantic Intelligence
- OpenAI text-embedding-3-small vector embeddings
- ChromaDB vector store with persistence
- Semantic similarity search with configurable thresholds
- SQLite FTS5 full-text search
- Hybrid search combining FTS + semantic via Reciprocal Rank Fusion (RRF)
- Search filters (date, category, tags)
- Search result pagination
- Query suggestions and autocomplete
- Spell correction for search queries
- Faceted search support
- Search analytics and popular query tracking
- Embedding cache for cost reduction

#### Phase 3: Claude Intelligence
- Claude-powered insight extraction with prompt caching
- Context-aware auto-tagging with technology/language detection
- Tag hierarchy and relationships
- Tag merge and deduplication (Levenshtein distance)
- Relationship detection (5 types: related, prerequisite, expands-on, contradicts, implements)
- Confidence scoring for relationships
- Structured conversation summaries
- Key points and action items extraction
- Executive summary generation
- Batch processing with progress bars, checkpoints, and resumability
- 90% token cost savings via prompt caching

#### API (38 Endpoints)
- Core CRUD: 12 endpoints (units, tags, categories)
- Search: 6 endpoints (FTS, semantic, hybrid, suggestions, analytics, facets)
- Graph: 8 endpoints (nodes, edges, paths, visualization)
- Intelligence: 6 endpoints (insights, tags, relationships, summaries)
- Deduplication: 4 endpoints (detect, merge, batch, report)
- Export: 5 endpoints (CSV, JSON, JSON-LD, Markdown, NDJSON)
- WebSocket: 3 endpoints (status, clients, events)
- Rate Limiting: 4 endpoints (status, tiers, upgrade, usage)

#### Core Features
- Knowledge graph with BFS path finding
- vis.js graph visualization export
- WebSocket real-time updates and event broadcasting
- Multi-format data export
- Smart deduplication (Levenshtein + Jaccard similarity)
- Per-user rate limiting with 4 tiers (Free/Basic/Pro/Enterprise)

#### Authentication & Security
- JWT token generation and validation
- API key generation with HMAC-SHA256 hashing
- Role-Based Access Control (4 roles: admin, editor, viewer, guest)
- 8 granular permissions
- CORS configuration
- HTTPS enforcement for production
- Audit logging

#### Testing
- 1000+ test cases across all modules
- Unit tests for all core services
- Integration tests for API endpoints
- E2E tests for critical flows
- Performance benchmarks (load, latency, memory)

#### Web UI
- Search/Home page with autocomplete
- Unit detail view
- Knowledge graph visualization
- Search results with filters
- Admin dashboard
- Tag management component

#### Documentation
- CLAUDE.md project overview
- API documentation
- Architecture deep-dive
- Database schema reference
- Deployment guide
- Operations and troubleshooting guides

#### Infrastructure
- Docker containerization
- Docker Compose configuration
- GitHub Actions CI/CD pipeline
- SQLite with WAL mode
- Database migrations framework
- Backup and recovery procedures

### Changed
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Removed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Security
- API keys stored with HMAC-SHA256 hashing
- User blocking for abuse prevention
- HTTPS enforcement in production
- Field-level access control

---

## [Unreleased]

### Planned
- PostgreSQL support option
- Kubernetes deployment manifests
- Redis cache layer
- Encryption at rest
- GDPR compliance tools
- User-created collections
- Obsidian vault sync
- Dark mode support
