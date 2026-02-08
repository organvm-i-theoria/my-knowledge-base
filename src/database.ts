/**
 * SQLite database module for knowledge base
 */

import Database from 'better-sqlite3';
import { AtomicUnit, Conversation, KnowledgeDocument, EntityRelationship, RelationshipType, RelationshipSource } from './types.js';
import { normalizeCategory, normalizeKeywords, normalizeTags } from './taxonomy.js';

export class KnowledgeDatabase {
  private db: Database.Database;

  constructor(dbPath: string = './db/knowledge.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private hasAtomicUnitColumn(columnName: string): boolean {
    const stmt = this.db.prepare('PRAGMA table_info(atomic_units)');
    const columns = stmt.all() as Array<{ name: string }>;
    return columns.some(col => col.name === columnName);
  }

  private hasRelationshipColumn(columnName: string): boolean {
    const stmt = this.db.prepare('PRAGMA table_info(unit_relationships)');
    const columns = stmt.all() as Array<{ name: string }>;
    return columns.some(col => col.name === columnName);
  }

  private initSchema() {
    // Main atomic units table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS atomic_units (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        type TEXT NOT NULL,
        created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        context TEXT,
        conversation_id TEXT,
        document_id TEXT,
        category TEXT,
        embedding BLOB
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS units_fts USING fts5(
        title, content, context, tags,
        content=atomic_units,
        content_rowid=rowid
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS unit_tags (
        unit_id TEXT,
        tag_id INTEGER,
        FOREIGN KEY (unit_id) REFERENCES atomic_units(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id),
        PRIMARY KEY (unit_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS unit_keywords (
        unit_id TEXT,
        keyword_id INTEGER,
        FOREIGN KEY (unit_id) REFERENCES atomic_units(id),
        FOREIGN KEY (keyword_id) REFERENCES keywords(id),
        PRIMARY KEY (unit_id, keyword_id)
      );

      CREATE TABLE IF NOT EXISTS unit_relationships (
        from_unit TEXT,
        to_unit TEXT,
        relationship_type TEXT,
        source TEXT DEFAULT 'auto_detected',
        confidence REAL,
        explanation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_unit) REFERENCES atomic_units(id),
        FOREIGN KEY (to_unit) REFERENCES atomic_units(id),
        PRIMARY KEY (from_unit, to_unit, relationship_type)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created TIMESTAMP,
        url TEXT,
        exported_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        created TIMESTAMP,
        modified TIMESTAMP,
        url TEXT,
        format TEXT,
        metadata TEXT,
        exported_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS search_queries (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        normalized_query TEXT NOT NULL,
        search_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latency_ms INTEGER,
        result_count INTEGER,
        user_session TEXT,
        filters TEXT,
        clicked_result TEXT
      );
    `);

    const ensureColumn = (name: string, definition: string) => {
      if (!this.hasAtomicUnitColumn(name)) {
        this.db.exec(`ALTER TABLE atomic_units ADD COLUMN ${name} ${definition}`);
      }
    };

    ensureColumn('section_type', 'TEXT');
    ensureColumn('hierarchy_level', 'INTEGER DEFAULT 0');
    ensureColumn('parent_section_id', 'TEXT');
    ensureColumn('tags', "TEXT DEFAULT '[]'");
    ensureColumn('keywords', "TEXT DEFAULT '[]'");
    ensureColumn('timestamp', 'TEXT');

    // Ensure typed relationship columns exist (OpenMetadata pattern)
    const ensureRelColumn = (name: string, definition: string) => {
      if (!this.hasRelationshipColumn(name)) {
        this.db.exec(`ALTER TABLE unit_relationships ADD COLUMN ${name} ${definition}`);
      }
    };

    // Note: SQLite doesn't allow non-constant defaults in ALTER TABLE
    ensureRelColumn('source', 'TEXT');
    ensureRelColumn('confidence', 'REAL');
    ensureRelColumn('explanation', 'TEXT');
    ensureRelColumn('created_at', 'TEXT');

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_units_created ON atomic_units(created);
      CREATE INDEX IF NOT EXISTS idx_units_category ON atomic_units(category);
      CREATE INDEX IF NOT EXISTS idx_units_type ON atomic_units(type);
      CREATE INDEX IF NOT EXISTS idx_units_conversation ON atomic_units(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_units_document ON atomic_units(document_id);
    `);

    if (this.hasAtomicUnitColumn('parent_section_id')) {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_parent_section ON atomic_units(parent_section_id)');
    }
    if (this.hasAtomicUnitColumn('section_type')) {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_section_type ON atomic_units(section_type)');
    }

    console.log('✅ Database schema initialized');
  }

  insertConversation(conversation: Conversation) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (id, title, created, url, exported_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      conversation.id,
      conversation.title,
      conversation.created.toISOString(),
      conversation.url || null,
      new Date().toISOString()
    );
  }

  insertDocument(doc: KnowledgeDocument) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents 
      (id, title, content, created, modified, url, format, metadata, exported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      doc.id,
      doc.title,
      doc.content,
      doc.created.toISOString(),
      doc.modified.toISOString(),
      doc.url || null,
      doc.format,
      JSON.stringify(doc.metadata),
      new Date().toISOString()
    );
  }

  /**
   * Fetch documents for reprocessing with optional source/format filters.
   * Source filtering is applied in JavaScript to avoid SQLite JSON functions.
   */
  getDocumentsForReprocess(options: {
    sourceIds?: string[];
    formats?: Array<'markdown' | 'txt' | 'pdf' | 'html'>;
    limit?: number;
    offset?: number;
  } = {}): KnowledgeDocument[] {
    const limit = options.limit ?? 500;
    const offset = options.offset ?? 0;
    const batchSize = Math.max(limit * 3, 300);
    const maxBatches = 25;

    const stmt = this.db.prepare(`
      SELECT * FROM documents
      ORDER BY modified DESC
      LIMIT ? OFFSET ?
    `);

    const results: KnowledgeDocument[] = [];
    let cursor = offset;

    for (let batch = 0; batch < maxBatches && results.length < limit; batch++) {
      const rows = stmt.all(batchSize, cursor) as any[];
      if (rows.length === 0) break;
      cursor += batchSize;

      for (const row of rows) {
        if (options.formats && options.formats.length > 0) {
          if (!row.format || !options.formats.includes(row.format)) {
            continue;
          }
        }

        let metadata: Record<string, unknown> = {};
        try {
          metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
        } catch {
          metadata = {};
        }

        const sourceId = typeof metadata.sourceId === 'string' ? metadata.sourceId : undefined;
        if (options.sourceIds && options.sourceIds.length > 0) {
          if (!sourceId || !options.sourceIds.includes(sourceId)) {
            continue;
          }
        }

        results.push({
          id: row.id,
          title: row.title,
          content: row.content,
          created: new Date(row.created),
          modified: new Date(row.modified),
          url: row.url || undefined,
          format: row.format,
          metadata,
        });

        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  insertAtomicUnit(unit: AtomicUnit) {
    const insertUnit = this.db.prepare(`
      INSERT OR REPLACE INTO atomic_units
      (id, timestamp, type, created, title, content, context, conversation_id, document_id, category, embedding, section_type, hierarchy_level, parent_section_id, tags, keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const unitTimestamp = unit.timestamp.toISOString();
    const createdTimestamp = unitTimestamp;
    insertUnit.run(
      unit.id,
      unitTimestamp,
      unit.type,
      createdTimestamp,
      unit.title,
      unit.content,
      unit.context,
      unit.conversationId || null,
      unit.documentId || null,
      unit.category,
      unit.embedding ? Buffer.from(new Float32Array(unit.embedding).buffer) : null,
      unit.sectionType || null,
      typeof unit.hierarchyLevel === 'number' ? unit.hierarchyLevel : null,
      unit.parentSectionId || null,
      JSON.stringify(unit.tags || []),
      JSON.stringify(unit.keywords || [])
    );

    this.insertTags(unit.id, unit.tags);
    this.insertKeywords(unit.id, unit.keywords);
    this.insertRelationships(unit.id, unit.relatedUnits);
    this.updateFTS(unit);
  }

  /**
   * Delete all units (and related tag/keyword/relationship/FTS rows) for documents.
   */
  deleteUnitsForDocumentIds(documentIds: string[]): {
    documentIds: number;
    unitsDeleted: number;
    tagLinksDeleted: number;
    keywordLinksDeleted: number;
    relationshipsDeleted: number;
    ftsDeleted: number;
  } {
    if (documentIds.length === 0) {
      return {
        documentIds: 0,
        unitsDeleted: 0,
        tagLinksDeleted: 0,
        keywordLinksDeleted: 0,
        relationshipsDeleted: 0,
        ftsDeleted: 0,
      };
    }

    const placeholders = documentIds.map(() => '?').join(', ');
    const unitRows = this.db
      .prepare(`
        SELECT id FROM atomic_units
        WHERE document_id IN (${placeholders})
      `)
      .all(...documentIds) as Array<{ id: string }>;

    const unitIds = unitRows.map((r) => r.id);
    if (unitIds.length === 0) {
      return {
        documentIds: documentIds.length,
        unitsDeleted: 0,
        tagLinksDeleted: 0,
        keywordLinksDeleted: 0,
        relationshipsDeleted: 0,
        ftsDeleted: 0,
      };
    }

    const MAX_VARS = 800;
    const batches: string[][] = [];
    for (let i = 0; i < unitIds.length; i += MAX_VARS) {
      batches.push(unitIds.slice(i, i + MAX_VARS));
    }

    const transaction = this.db.transaction(() => {
      let tagLinksDeleted = 0;
      let keywordLinksDeleted = 0;
      let relationshipsDeleted = 0;
      let ftsDeleted = 0;
      let unitsDeleted = 0;

      for (const batch of batches) {
        const placeholders = batch.map(() => '?').join(', ');

        const deleteUnitTags = this.db.prepare(`
          DELETE FROM unit_tags WHERE unit_id IN (${placeholders})
        `);
        const deleteUnitKeywords = this.db.prepare(`
          DELETE FROM unit_keywords WHERE unit_id IN (${placeholders})
        `);
        const deleteRelationships = this.db.prepare(`
          DELETE FROM unit_relationships
          WHERE from_unit IN (${placeholders}) OR to_unit IN (${placeholders})
        `);
        const deleteFts = this.db.prepare(`
          DELETE FROM units_fts
          WHERE rowid IN (
            SELECT rowid FROM atomic_units WHERE id IN (${placeholders})
          )
        `);
        const deleteUnits = this.db.prepare(`
          DELETE FROM atomic_units WHERE id IN (${placeholders})
        `);

        tagLinksDeleted += deleteUnitTags.run(...batch).changes;
        keywordLinksDeleted += deleteUnitKeywords.run(...batch).changes;
        relationshipsDeleted += deleteRelationships.run(...batch, ...batch).changes;
        ftsDeleted += deleteFts.run(...batch).changes;
        unitsDeleted += deleteUnits.run(...batch).changes;
      }

      return {
        documentIds: documentIds.length,
        unitsDeleted,
        tagLinksDeleted,
        keywordLinksDeleted,
        relationshipsDeleted,
        ftsDeleted,
      };
    });

    return transaction();
  }

  /**
   * Count atomic units for a specific document.
   */
  getUnitCountForDocument(documentId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM atomic_units WHERE document_id = ?`)
      .get(documentId) as { count: number };
    return row.count;
  }

  private insertTags(unitId: string, tags: string[]) {
    const insertTag = this.db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
    const getTagId = this.db.prepare(`SELECT id FROM tags WHERE name = ?`);
    const linkTag = this.db.prepare(`INSERT OR IGNORE INTO unit_tags (unit_id, tag_id) VALUES (?, ?)`);

    for (const tag of tags) {
      insertTag.run(tag);
      const tagRow = getTagId.get(tag) as { id: number };
      linkTag.run(unitId, tagRow.id);
    }
  }

  private insertKeywords(unitId: string, keywords: string[]) {
    const insertKeyword = this.db.prepare(`INSERT OR IGNORE INTO keywords (keyword) VALUES (?)`);
    const getKeywordId = this.db.prepare(`SELECT id FROM keywords WHERE keyword = ?`);
    const linkKeyword = this.db.prepare(`INSERT OR IGNORE INTO unit_keywords (unit_id, keyword_id) VALUES (?, ?)`);

    for (const keyword of keywords) {
      insertKeyword.run(keyword);
      const kwRow = getKeywordId.get(keyword) as { id: number };
      linkKeyword.run(unitId, kwRow.id);
    }
  }

  private insertRelationships(unitId: string, relatedUnits: string[]) {
    const insertRel = this.db.prepare(`
      INSERT OR IGNORE INTO unit_relationships (from_unit, to_unit, relationship_type, source, confidence)
      VALUES (?, ?, 'related', 'auto_detected', 0.5)
    `);

    for (const relatedId of relatedUnits) {
      insertRel.run(unitId, relatedId);
    }
  }

  /**
   * Insert a typed entity relationship (OpenMetadata pattern)
   */
  insertTypedRelationship(relationship: EntityRelationship): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO unit_relationships
      (from_unit, to_unit, relationship_type, source, confidence, explanation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      relationship.fromEntity,
      relationship.toEntity,
      relationship.relationshipType,
      relationship.source,
      relationship.confidence ?? null,
      relationship.explanation ?? null,
      relationship.createdAt?.toISOString() ?? new Date().toISOString()
    );
  }

  /**
   * Insert multiple typed relationships in a transaction
   */
  insertTypedRelationships(relationships: EntityRelationship[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO unit_relationships
      (from_unit, to_unit, relationship_type, source, confidence, explanation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((rels: EntityRelationship[]) => {
      for (const rel of rels) {
        stmt.run(
          rel.fromEntity,
          rel.toEntity,
          rel.relationshipType,
          rel.source,
          rel.confidence ?? null,
          rel.explanation ?? null,
          rel.createdAt?.toISOString() ?? new Date().toISOString()
        );
      }
    });

    transaction(relationships);
  }

  private updateFTS(unit: AtomicUnit) {
    const stmt = this.db.prepare(`
      INSERT INTO units_fts (rowid, title, content, context, tags)
      SELECT rowid, title, content, context, ?
      FROM atomic_units WHERE id = ?
    `);

    stmt.run(unit.tags.join(' '), unit.id);
  }

  searchText(query: string, limit: number = 10): AtomicUnit[] {
    const stmt = this.db.prepare(`
      SELECT u.* FROM atomic_units u
      JOIN units_fts ON u.rowid = units_fts.rowid
      WHERE units_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = stmt.all(query, limit) as any[];
    return this.rowsToAtomicUnits(rows);
  }

  /**
   * Get a single unit by its ID
   */
  getUnitById(id: string): AtomicUnit | null {
    const stmt = this.db.prepare(`
      SELECT * FROM atomic_units WHERE id = ? LIMIT 1
    `);

    const row = stmt.get(id) as any | undefined;
    if (!row) return null;
    return this.rowToAtomicUnit(row);
  }

  /**
   * Get units for graph views with optional filters
   */
  getUnitsForGraph(options: { limit?: number; type?: string; category?: string } = {}): AtomicUnit[] {
    const limit = options.limit ?? 50;
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (options.type) {
      whereClauses.push('type = ?');
      params.push(options.type);
    }

    if (options.category) {
      whereClauses.push('category = ?');
      params.push(options.category);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const stmt = this.db.prepare(`
      SELECT * FROM atomic_units
      ${where}
      ORDER BY created DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, limit) as any[];
    return rows.map(this.rowToAtomicUnit.bind(this));
  }

  /**
   * Get units by a set of IDs with optional filters and limit
   */
  getUnitsByIds(
    ids: string[],
    options: { limit?: number; type?: string; category?: string } = {}
  ): AtomicUnit[] {
    if (ids.length === 0) return [];

    const limit = options.limit ?? ids.length;
    const placeholders = ids.map(() => '?').join(', ');
    const whereClauses: string[] = [`id IN (${placeholders})`];
    const params: any[] = [...ids];

    if (options.type) {
      whereClauses.push('type = ?');
      params.push(options.type);
    }

    if (options.category) {
      whereClauses.push('category = ?');
      params.push(options.category);
    }

    const stmt = this.db.prepare(`
      SELECT * FROM atomic_units
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, limit) as any[];
    return rows.map(this.rowToAtomicUnit.bind(this));
  }

  /**
   * Get relationships that touch a set of unit IDs
   * Returns basic relationship info for backward compatibility
   */
  getRelationshipsForUnitIds(ids: string[]): Array<{ fromUnit: string; toUnit: string; type: string }> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      SELECT from_unit as fromUnit, to_unit as toUnit, relationship_type as type
      FROM unit_relationships
      WHERE from_unit IN (${placeholders}) OR to_unit IN (${placeholders})
    `);

    const rows = stmt.all(...ids, ...ids) as Array<{ fromUnit: string; toUnit: string; type: string }>;
    return rows;
  }

  /**
   * Get typed relationships for a set of unit IDs (OpenMetadata pattern)
   * Returns full EntityRelationship objects with all metadata
   */
  getTypedRelationshipsForUnitIds(ids: string[]): EntityRelationship[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      SELECT
        from_unit as fromEntity,
        to_unit as toEntity,
        relationship_type as relationshipType,
        source,
        confidence,
        explanation,
        created_at as createdAt
      FROM unit_relationships
      WHERE from_unit IN (${placeholders}) OR to_unit IN (${placeholders})
    `);

    const rows = stmt.all(...ids, ...ids) as Array<{
      fromEntity: string;
      toEntity: string;
      relationshipType: string;
      source: string | null;
      confidence: number | null;
      explanation: string | null;
      createdAt: string | null;
    }>;

    return rows.map(row => ({
      fromEntity: row.fromEntity,
      toEntity: row.toEntity,
      relationshipType: (row.relationshipType || 'related') as RelationshipType,
      source: (row.source || 'auto_detected') as RelationshipSource,
      confidence: row.confidence ?? undefined,
      explanation: row.explanation ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }));
  }

  /**
   * Get all relationships from a specific unit
   */
  getRelationshipsFromUnit(unitId: string): EntityRelationship[] {
    const stmt = this.db.prepare(`
      SELECT
        from_unit as fromEntity,
        to_unit as toEntity,
        relationship_type as relationshipType,
        source,
        confidence,
        explanation,
        created_at as createdAt
      FROM unit_relationships
      WHERE from_unit = ?
      ORDER BY confidence DESC, created_at DESC
    `);

    const rows = stmt.all(unitId) as Array<{
      fromEntity: string;
      toEntity: string;
      relationshipType: string;
      source: string | null;
      confidence: number | null;
      explanation: string | null;
      createdAt: string | null;
    }>;

    return rows.map(row => ({
      fromEntity: row.fromEntity,
      toEntity: row.toEntity,
      relationshipType: (row.relationshipType || 'related') as RelationshipType,
      source: (row.source || 'auto_detected') as RelationshipSource,
      confidence: row.confidence ?? undefined,
      explanation: row.explanation ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }));
  }

  /**
   * Get relationships by type
   */
  getRelationshipsByType(relationshipType: RelationshipType, limit: number = 100): EntityRelationship[] {
    const stmt = this.db.prepare(`
      SELECT
        from_unit as fromEntity,
        to_unit as toEntity,
        relationship_type as relationshipType,
        source,
        confidence,
        explanation,
        created_at as createdAt
      FROM unit_relationships
      WHERE relationship_type = ?
      ORDER BY confidence DESC, created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(relationshipType, limit) as Array<{
      fromEntity: string;
      toEntity: string;
      relationshipType: string;
      source: string | null;
      confidence: number | null;
      explanation: string | null;
      createdAt: string | null;
    }>;

    return rows.map(row => ({
      fromEntity: row.fromEntity,
      toEntity: row.toEntity,
      relationshipType: (row.relationshipType || 'related') as RelationshipType,
      source: (row.source || 'auto_detected') as RelationshipSource,
      confidence: row.confidence ?? undefined,
      explanation: row.explanation ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
    }));
  }

  /**
   * Delete a specific relationship
   */
  deleteRelationship(fromUnit: string, toUnit: string, relationshipType?: RelationshipType): void {
    if (relationshipType) {
      this.db.prepare(`
        DELETE FROM unit_relationships
        WHERE from_unit = ? AND to_unit = ? AND relationship_type = ?
      `).run(fromUnit, toUnit, relationshipType);
    } else {
      this.db.prepare(`
        DELETE FROM unit_relationships
        WHERE from_unit = ? AND to_unit = ?
      `).run(fromUnit, toUnit);
    }
  }

  /**
   * Select document-backed units for tag backfill workflows.
   * Filters are applied in JavaScript to avoid SQLite JSON function dependencies.
   */
  getUnitsForBackfill(options: {
    limit?: number;
    sourceIds?: string[];
    formats?: Array<'markdown' | 'txt' | 'pdf' | 'html'>;
    maxExistingTags?: number;
    requireDocument?: boolean;
    minContentLength?: number;
    offset?: number;
    maxBatches?: number;
  } = {}): AtomicUnit[] {
    const targetLimit = options.limit ?? 200;
    const requireDocument = options.requireDocument ?? true;
    const batchSize = Math.max(targetLimit * 3, 300);
    const maxBatches = options.maxBatches ?? 20;
    const minContentLength = options.minContentLength ?? 0;

    const stmt = this.db.prepare(`
      SELECT
        u.*,
        d.format as doc_format,
        d.metadata as doc_metadata
      FROM atomic_units u
      LEFT JOIN documents d ON u.document_id = d.id
      WHERE u.document_id IS NOT NULL
      ORDER BY u.created DESC
      LIMIT ? OFFSET ?
    `);

    const filtered: AtomicUnit[] = [];
    let currentOffset = options.offset ?? 0;

    for (let batch = 0; batch < maxBatches && filtered.length < targetLimit; batch++) {
      const rows = stmt.all(batchSize, currentOffset) as Array<any>;
      if (rows.length === 0) {
        break;
      }
      currentOffset += batchSize;

      for (const row of rows) {
        if (requireDocument && !row.doc_format) {
          continue;
        }

        if (minContentLength > 0 && row.content.length < minContentLength) {
          continue;
        }

        if (options.formats && options.formats.length > 0) {
          if (!row.doc_format || !options.formats.includes(row.doc_format)) {
            continue;
          }
        }

        let sourceId: string | undefined;
        if (row.doc_metadata) {
          try {
            const parsed = JSON.parse(row.doc_metadata) as Record<string, unknown>;
            if (typeof parsed.sourceId === 'string') {
              sourceId = parsed.sourceId;
            }
          } catch {
            // Ignore malformed metadata and proceed without source-based filtering.
          }
        }

        if (options.sourceIds && options.sourceIds.length > 0) {
          if (!sourceId || !options.sourceIds.includes(sourceId)) {
            continue;
          }
        }

        const unit = this.rowToAtomicUnit(row);

        if (typeof options.maxExistingTags === 'number') {
          if ((unit.tags?.length || 0) > options.maxExistingTags) {
            continue;
          }
        }

        filtered.push(unit);
        if (filtered.length >= targetLimit) {
          break;
        }
      }
    }

    return filtered.slice(0, targetLimit);
  }

  /**
   * Compute chunking-related metrics across documents and document-backed units.
   * This uses unit counts per document as the primary signal for chunking.
   */
  getChunkingMetrics(): {
    totals: {
      documents: number;
      documentsWithUnits: number;
      documentsChunked: number;
      documentsChunkedPct: number;
      avgUnitsPerDocument: number;
      maxUnitsPerDocument: number;
      documentUnits: number;
      documentUnitsWithChunkStrategy: number;
      documentUnitsWithChunkStrategyPct: number;
      documentUnitsWithImages: number;
      documentUnitsWithImagesPct: number;
    };
    chunkingTags: Array<{ tag: string; documents: number; applications: number }>;
    formats: Array<{
      format: string;
      documents: number;
      documentsWithUnits: number;
      documentsChunked: number;
      documentsChunkedPct: number;
      avgUnitsPerDocument: number;
    }>;
    sourceBreakdown: Array<{
      sourceId: string;
      documents: number;
      documentsWithUnits: number;
      documentsChunked: number;
      documentsChunkedPct: number;
      avgUnitsPerDocument: number;
    }>;
    topDocuments: Array<{
      documentId: string;
      title: string;
      format: string;
      sourceId: string;
      unitCount: number;
    }>;
  } {
    const totalDocumentsRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM documents`)
      .get() as { count: number };
    const totalDocuments = totalDocumentsRow.count;

    const unitCounts = this.db
      .prepare(`
        SELECT document_id as documentId, COUNT(*) as unitCount
        FROM atomic_units
        WHERE document_id IS NOT NULL
        GROUP BY document_id
      `)
      .all() as Array<{ documentId: string; unitCount: number }>;

    const documentsWithUnits = unitCounts.length;
    const documentsChunked = unitCounts.filter((r) => r.unitCount > 1).length;
    const totalUnitsAcrossDocs = unitCounts.reduce((sum, r) => sum + r.unitCount, 0);
    const avgUnitsPerDocument =
      documentsWithUnits > 0 ? totalUnitsAcrossDocs / documentsWithUnits : 0;
    const maxUnitsPerDocument =
      unitCounts.length > 0 ? Math.max(...unitCounts.map((r) => r.unitCount)) : 0;
    const documentsChunkedPct =
      documentsWithUnits > 0 ? (documentsChunked / documentsWithUnits) * 100 : 0;

    const documentUnitsRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM atomic_units WHERE document_id IS NOT NULL`)
      .get() as { count: number };
    const documentUnits = documentUnitsRow.count;

    const documentUnitsWithChunkStrategyRow = this.db
      .prepare(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM atomic_units u
        JOIN unit_tags ut ON u.id = ut.unit_id
        JOIN tags t ON t.id = ut.tag_id
        WHERE u.document_id IS NOT NULL
          AND t.name LIKE 'chunk-strategy-%'
      `)
      .get() as { count: number };
    const documentUnitsWithChunkStrategy = documentUnitsWithChunkStrategyRow.count;
    const documentUnitsWithChunkStrategyPct =
      documentUnits > 0 ? (documentUnitsWithChunkStrategy / documentUnits) * 100 : 0;

    const documentUnitsWithImagesRow = this.db
      .prepare(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM atomic_units u
        JOIN unit_tags ut ON u.id = ut.unit_id
        JOIN tags t ON t.id = ut.tag_id
        WHERE u.document_id IS NOT NULL
          AND t.name = 'has-image'
      `)
      .get() as { count: number };
    const documentUnitsWithImages = documentUnitsWithImagesRow.count;
    const documentUnitsWithImagesPct =
      documentUnits > 0 ? (documentUnitsWithImages / documentUnits) * 100 : 0;

    const chunkingTags = this.db
      .prepare(`
        SELECT
          t.name as tag,
          COUNT(DISTINCT u.document_id) as documents,
          COUNT(*) as applications
        FROM tags t
        JOIN unit_tags ut ON t.id = ut.tag_id
        JOIN atomic_units u ON u.id = ut.unit_id
        WHERE u.document_id IS NOT NULL
          AND t.name LIKE 'chunk-strategy-%'
        GROUP BY t.name
        ORDER BY documents DESC, applications DESC
      `)
      .all() as Array<{ tag: string; documents: number; applications: number }>;

    const formats = this.db
      .prepare(`
        WITH unit_counts AS (
          SELECT document_id as documentId, COUNT(*) as unitCount
          FROM atomic_units
          WHERE document_id IS NOT NULL
          GROUP BY document_id
        )
        SELECT
          d.format as format,
          COUNT(*) as documents,
          SUM(CASE WHEN uc.unitCount IS NOT NULL THEN 1 ELSE 0 END) as documentsWithUnits,
          SUM(CASE WHEN uc.unitCount > 1 THEN 1 ELSE 0 END) as documentsChunked,
          AVG(CASE WHEN uc.unitCount IS NOT NULL THEN uc.unitCount ELSE NULL END) as avgUnitsPerDocument
        FROM documents d
        LEFT JOIN unit_counts uc ON d.id = uc.documentId
        GROUP BY d.format
        ORDER BY documents DESC
      `)
      .all() as Array<{
        format: string;
        documents: number;
        documentsWithUnits: number;
        documentsChunked: number;
        avgUnitsPerDocument: number | null;
      }>;

    const formatsWithPct = formats.map((row) => {
      const documentsChunkedPctForFormat =
        row.documentsWithUnits > 0 ? (row.documentsChunked / row.documentsWithUnits) * 100 : 0;
      return {
        format: row.format,
        documents: row.documents,
        documentsWithUnits: row.documentsWithUnits,
        documentsChunked: row.documentsChunked,
        documentsChunkedPct: documentsChunkedPctForFormat,
        avgUnitsPerDocument: row.avgUnitsPerDocument ?? 0,
      };
    });

    const documentsWithCounts = this.db
      .prepare(`
        WITH unit_counts AS (
          SELECT document_id as documentId, COUNT(*) as unitCount
          FROM atomic_units
          WHERE document_id IS NOT NULL
          GROUP BY document_id
        )
        SELECT
          d.id as documentId,
          d.title as title,
          d.format as format,
          d.metadata as metadata,
          COALESCE(uc.unitCount, 0) as unitCount
        FROM documents d
        LEFT JOIN unit_counts uc ON d.id = uc.documentId
      `)
      .all() as Array<{
        documentId: string;
        title: string;
        format: string;
        metadata: string | null;
        unitCount: number;
      }>;

    const documentsEnriched = documentsWithCounts.map((doc) => {
      let sourceId = '(unknown)';
      if (doc.metadata) {
        try {
          const parsed = JSON.parse(doc.metadata) as Record<string, unknown>;
          if (typeof parsed.sourceId === 'string' && parsed.sourceId.trim().length > 0) {
            sourceId = parsed.sourceId;
          }
        } catch {
          // Ignore malformed metadata for metrics purposes.
        }
      }
      return {
        ...doc,
        sourceId,
      };
    });

    const topDocuments = documentsEnriched
      .filter((d) => d.unitCount > 0)
      .sort((a, b) => b.unitCount - a.unitCount)
      .slice(0, 25)
      .map((d) => ({
        documentId: d.documentId,
        title: d.title,
        format: d.format,
        sourceId: d.sourceId,
        unitCount: d.unitCount,
      }));

    const bySource = new Map<
      string,
      { documents: number; documentsWithUnits: number; documentsChunked: number; units: number }
    >();

    for (const doc of documentsEnriched) {
      const current = bySource.get(doc.sourceId) || {
        documents: 0,
        documentsWithUnits: 0,
        documentsChunked: 0,
        units: 0,
      };
      current.documents += 1;
      if (doc.unitCount > 0) {
        current.documentsWithUnits += 1;
        current.units += doc.unitCount;
      }
      if (doc.unitCount > 1) {
        current.documentsChunked += 1;
      }
      bySource.set(doc.sourceId, current);
    }

    const sourceBreakdown = Array.from(bySource.entries())
      .map(([sourceId, stats]) => {
        const documentsChunkedPctForSource =
          stats.documentsWithUnits > 0
            ? (stats.documentsChunked / stats.documentsWithUnits) * 100
            : 0;
        const avgUnitsPerDocumentForSource =
          stats.documentsWithUnits > 0 ? stats.units / stats.documentsWithUnits : 0;
        return {
          sourceId,
          documents: stats.documents,
          documentsWithUnits: stats.documentsWithUnits,
          documentsChunked: stats.documentsChunked,
          documentsChunkedPct: documentsChunkedPctForSource,
          avgUnitsPerDocument: avgUnitsPerDocumentForSource,
        };
      })
      .sort((a, b) => b.documents - a.documents);

    return {
      totals: {
        documents: totalDocuments,
        documentsWithUnits,
        documentsChunked,
        documentsChunkedPct,
        avgUnitsPerDocument,
        maxUnitsPerDocument,
        documentUnits,
        documentUnitsWithChunkStrategy,
        documentUnitsWithChunkStrategyPct,
        documentUnitsWithImages,
        documentUnitsWithImagesPct,
      },
      chunkingTags,
      formats: formatsWithPct,
      sourceBreakdown,
      topDocuments,
    };
  }

  getUnitsByTag(tagName: string): AtomicUnit[] {
    const stmt = this.db.prepare(`
      SELECT u.* FROM atomic_units u
      JOIN unit_tags ut ON u.id = ut.unit_id
      JOIN tags t ON ut.tag_id = t.id
      WHERE t.name = ?
      ORDER BY u.created DESC
    `);

    const rows = stmt.all(tagName) as any[];
    return this.rowsToAtomicUnits(rows);
  }

  getAllConversations(): Conversation[] {
    const stmt = this.db.prepare(`SELECT * FROM conversations ORDER BY created DESC`);
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      created: new Date(row.created),
      url: row.url,
      messages: [],
      artifacts: []
    }));
  }

  /**
   * Search with complex filters (AND/OR/NOT combinations)
   */
  searchWithFilters(whereClause: string, params: any[], limit: number = 10): AtomicUnit[] {
    const where = whereClause ? 'WHERE ' + whereClause : '';
    const stmt = this.db.prepare(`
      SELECT u.* FROM atomic_units u ${where}
      ORDER BY u.created DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params, limit) as any[];
    return this.rowsToAtomicUnits(rows);
  }

  /**
   * Full-text search with pagination
   */
  searchTextPaginated(query: string, offset: number = 0, limit: number = 10): { results: AtomicUnit[]; total: number } {
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM atomic_units u
      JOIN units_fts ON u.rowid = units_fts.rowid
      WHERE units_fts MATCH ?
    `);

    const searchStmt = this.db.prepare(`
      SELECT u.* FROM atomic_units u
      JOIN units_fts ON u.rowid = units_fts.rowid
      WHERE units_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    const countResult = countStmt.get(query) as { count: number };
    if (countResult.count === 0) {
      const searchTerm = `%${query}%`;
      const fallbackCountStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM atomic_units
        WHERE title LIKE ? OR content LIKE ?
      `);
      const fallbackRowsStmt = this.db.prepare(`
        SELECT * FROM atomic_units
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY created DESC
        LIMIT ? OFFSET ?
      `);

      const fallbackCount = fallbackCountStmt.get(searchTerm, searchTerm) as { count: number };
      const fallbackRows = fallbackRowsStmt.all(
        searchTerm,
        searchTerm,
        limit,
        offset
      ) as any[];

      return {
        results: this.rowsToAtomicUnits(fallbackRows),
        total: fallbackCount.count
      };
    }

    const rows = searchStmt.all(query, limit, offset) as any[];

    return {
      results: this.rowsToAtomicUnits(rows),
      total: countResult.count
    };
  }

  /**
   * Get category facets with optional filtering
   */
  getCategoryFacets(whereClause: string = '', params: any[] = []): Array<{ value: string; count: number }> {
    const where = whereClause ? 'WHERE ' + whereClause : '';
    const stmt = this.db.prepare(`
      SELECT category as value, COUNT(*) as count FROM atomic_units u
      ${where}
      GROUP BY category
      ORDER BY count DESC
    `);

    return stmt.all(...params) as Array<{ value: string; count: number }>;
  }

  /**
   * Get type facets with optional filtering
   */
  getTypeFacets(whereClause: string = '', params: any[] = []): Array<{ value: string; count: number }> {
    const where = whereClause ? 'WHERE ' + whereClause : '';
    const stmt = this.db.prepare(`
      SELECT type as value, COUNT(*) as count FROM atomic_units u
      ${where}
      GROUP BY type
      ORDER BY count DESC
    `);

    return stmt.all(...params) as Array<{ value: string; count: number }>;
  }

  /**
   * Get tag facets with optional filtering
   */
  getTagFacets(whereClause: string = '', params: any[] = [], limit: number = 20): Array<{ value: string; count: number }> {
    const where = whereClause ? 'AND ' + whereClause : '';
    const stmt = this.db.prepare(`
      SELECT t.name as value, COUNT(*) as count FROM tags t
      JOIN unit_tags ut ON t.id = ut.tag_id
      JOIN atomic_units u ON ut.unit_id = u.id
      WHERE 1=1 ${where}
      GROUP BY t.name
      ORDER BY count DESC
      LIMIT ?
    `);

    return stmt.all(...params, limit) as Array<{ value: string; count: number }>;
  }

  /**
   * Get date facets (monthly buckets) with optional filtering
   */
  getDateFacets(whereClause: string = '', params: any[] = [], bucketBy: 'month' | 'year' = 'month'): Array<{ period: string; count: number; startDate: string; endDate: string }> {
    const where = whereClause ? 'WHERE ' + whereClause : '';
    const dateFormat = bucketBy === 'month' ? '%Y-%m' : '%Y';
    const stmt = this.db.prepare(`
      SELECT
        strftime('${dateFormat}', u.created) as period,
        COUNT(*) as count,
        MIN(u.created) as startDate,
        MAX(u.created) as endDate
      FROM atomic_units u
      ${where}
      GROUP BY strftime('${dateFormat}', u.created)
      ORDER BY period DESC
    `);

    return stmt.all(...params) as Array<{ period: string; count: number; startDate: string; endDate: string }>;
  }

  /**
   * Get search suggestions for autocomplete
   */
  getSearchSuggestions(prefix: string, limit: number = 10): string[] {
    const likPrefix = prefix + '%';

    // Combine titles and tags in a single query with specific ordering:
    // 1. Titles matching prefix (ordered by created DESC)
    // 2. Tags matching prefix (ordered by name ASC)
    // We use GROUP BY in the first subquery to ensure we get distinct titles *before* applying LIMIT.
    const rows = this.db.prepare(`
      SELECT suggestion
      FROM (
        SELECT * FROM (
          SELECT title as suggestion, 1 as priority, MAX(created) as date_sort, NULL as name_sort
          FROM atomic_units WHERE title LIKE ? GROUP BY title ORDER BY date_sort DESC LIMIT ?
        )
        UNION ALL
        SELECT * FROM (
          SELECT name as suggestion, 2 as priority, NULL as date_sort, name as name_sort
          FROM tags WHERE name LIKE ? ORDER BY name ASC LIMIT ?
        )
      )
      ORDER BY priority ASC, date_sort DESC, name_sort ASC
    `).all(likPrefix, limit, likPrefix, limit) as Array<{ suggestion: string }>;

    // Deduplicate in application in case a title matches a tag
    const suggestions = new Set<string>();
    for (const row of rows) {
      suggestions.add(row.suggestion);
      if (suggestions.size >= limit) break;
    }

    return Array.from(suggestions);
  }

  getStats() {
    const stats = {
      totalUnits: this.db.prepare('SELECT COUNT(*) as count FROM atomic_units').get() as { count: number },
      totalConversations: this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number },
      totalDocuments: this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number },
      totalTags: this.db.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number },
      unitsByType: this.db.prepare(`
        SELECT type, COUNT(*) as count FROM atomic_units GROUP BY type
      `).all() as { type: string; count: number }[]
    };

    return stats;
  }

  private rowToAtomicUnit(row: any): AtomicUnit {
    return this.rowsToAtomicUnits([row])[0];
  }

  private rowsToAtomicUnits(rows: any[]): AtomicUnit[] {
    if (rows.length === 0) return [];

    const unitMap = new Map<string, AtomicUnit>();
    rows.forEach(row => {
      unitMap.set(row.id, {
        id: row.id,
        type: row.type,
        timestamp: new Date(row.created),
        title: row.title,
        content: row.content,
        context: row.context || '',
        tags: [],
        category: row.category || 'uncategorized',
        conversationId: row.conversation_id,
        documentId: row.document_id,
        relatedUnits: [],
        keywords: []
      });
    });

    const allIds = rows.map(r => r.id);
    const BATCH_SIZE = 900; // Safe limit for SQLite variables

    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
      const batchIds = allIds.slice(i, i + BATCH_SIZE);
      const placeholders = batchIds.map(() => '?').join(',');

      // Fetch Tags
      const tagsStmt = this.db.prepare(`
        SELECT ut.unit_id, t.name
        FROM tags t
        JOIN unit_tags ut ON t.id = ut.tag_id
        WHERE ut.unit_id IN (${placeholders})
      `);
      const tags = tagsStmt.all(...batchIds) as { unit_id: string, name: string }[];
      for (const t of tags) {
        unitMap.get(t.unit_id)?.tags.push(t.name);
      }

      // Fetch Keywords
      const keywordsStmt = this.db.prepare(`
        SELECT uk.unit_id, k.keyword
        FROM keywords k
        JOIN unit_keywords uk ON k.id = uk.keyword_id
        WHERE uk.unit_id IN (${placeholders})
      `);
      const keywords = keywordsStmt.all(...batchIds) as { unit_id: string, keyword: string }[];
      for (const k of keywords) {
        unitMap.get(k.unit_id)?.keywords.push(k.keyword);
      }

      // Fetch Related
      const relatedStmt = this.db.prepare(`
        SELECT from_unit, to_unit
        FROM unit_relationships
        WHERE from_unit IN (${placeholders})
      `);
      const related = relatedStmt.all(...batchIds) as { from_unit: string, to_unit: string }[];
      for (const r of related) {
        unitMap.get(r.from_unit)?.relatedUnits.push(r.to_unit);
      }
    }

    // Return in original order
    return rows.map(row => {
      const unit = unitMap.get(row.id)!;
      unit.category = normalizeCategory(unit.category);
      unit.tags = normalizeTags(unit.tags);
      unit.keywords = normalizeKeywords(unit.keywords);
      return unit;
    });
  }

  close() {
    this.db.close();
  }

  /**
   * Return the shared sqlite handle for advanced modules that operate directly
   * on analytics/search tables.
   */
  getRawHandle(): Database.Database {
    return this.db;
  }
}
