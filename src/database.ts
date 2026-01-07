/**
 * SQLite database module for knowledge base
 */

import Database from 'better-sqlite3';
import { AtomicUnit, Conversation, KnowledgeDocument } from './types.js';

export class KnowledgeDatabase {
  private db: Database.Database;

  constructor(dbPath: string = './db/knowledge.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    // Main atomic units table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS atomic_units (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        created TIMESTAMP NOT NULL,
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

      CREATE INDEX IF NOT EXISTS idx_units_created ON atomic_units(created);
      CREATE INDEX IF NOT EXISTS idx_units_category ON atomic_units(category);
      CREATE INDEX IF NOT EXISTS idx_units_type ON atomic_units(type);
      CREATE INDEX IF NOT EXISTS idx_units_conversation ON atomic_units(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_units_document ON atomic_units(document_id);
    `);

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

  insertAtomicUnit(unit: AtomicUnit) {
    const insertUnit = this.db.prepare(`
      INSERT OR REPLACE INTO atomic_units
      (id, type, created, title, content, context, conversation_id, document_id, category, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUnit.run(
      unit.id,
      unit.type,
      unit.timestamp.toISOString(),
      unit.title,
      unit.content,
      unit.context,
      unit.conversationId || null,
      unit.documentId || null,
      unit.category,
      unit.embedding ? Buffer.from(new Float32Array(unit.embedding).buffer) : null
    );

    this.insertTags(unit.id, unit.tags);
    this.insertKeywords(unit.id, unit.keywords);
    this.insertRelationships(unit.id, unit.relatedUnits);
    this.updateFTS(unit);
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
      INSERT OR IGNORE INTO unit_relationships (from_unit, to_unit, relationship_type)
      VALUES (?, ?, 'related')
    `);

    for (const relatedId of relatedUnits) {
      insertRel.run(unitId, relatedId);
    }
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
    return rows.map(this.rowToAtomicUnit.bind(this));
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
    return rows.map(this.rowToAtomicUnit.bind(this));
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
    const tags = this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN unit_tags ut ON t.id = ut.tag_id
      WHERE ut.unit_id = ?
    `).all(row.id) as { name: string }[];

    const keywords = this.db.prepare(`
      SELECT k.keyword FROM keywords k
      JOIN unit_keywords uk ON k.id = uk.keyword_id
      WHERE uk.unit_id = ?
    `).all(row.id) as { keyword: string }[];

    const related = this.db.prepare(`
      SELECT to_unit FROM unit_relationships WHERE from_unit = ?
    `).all(row.id) as { to_unit: string }[];

    return {
      id: row.id,
      type: row.type,
      timestamp: new Date(row.created),
      title: row.title,
      content: row.content,
      context: row.context || '',
      tags: tags.map(t => t.name),
      category: row.category || 'uncategorized',
      conversationId: row.conversation_id,
      documentId: row.document_id,
      relatedUnits: related.map(r => r.to_unit),
      keywords: keywords.map(k => k.keyword)
    };
  }

  close() {
    this.db.close();
  }
}
