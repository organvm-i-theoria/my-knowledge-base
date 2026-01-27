/**
 * Collections & Favorites Module
 * Allows users to organize atomic units into named collections and mark favorites
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { AtomicUnit } from './types.js';

/**
 * Collection interface - a named grouping of atomic units
 */
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  unitIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Favorite interface - marks a unit as favorited
 */
export interface Favorite {
  unitId: string;
  userId: string | null;
  createdAt: Date;
}

/**
 * Collection with populated units
 */
export interface CollectionWithUnits extends Collection {
  units: AtomicUnit[];
}

/**
 * CollectionsManager handles CRUD operations for collections and favorites
 */
export class CollectionsManager {
  private db: Database.Database;

  constructor(dbPath: string = './db/knowledge.db') {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  /**
   * Initialize collections and favorites tables
   */
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_units (
        collection_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES atomic_units(id) ON DELETE CASCADE,
        PRIMARY KEY (collection_id, unit_id)
      );

      CREATE TABLE IF NOT EXISTS favorites (
        unit_id TEXT NOT NULL,
        user_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (unit_id) REFERENCES atomic_units(id) ON DELETE CASCADE,
        PRIMARY KEY (unit_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_collection_units_collection ON collection_units(collection_id);
      CREATE INDEX IF NOT EXISTS idx_collection_units_unit ON collection_units(unit_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_unit ON favorites(unit_id);
    `);
  }

  // ==================== Collection Operations ====================

  /**
   * Create a new collection
   */
  createCollection(name: string, description?: string): Collection {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Collection name is required');
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO collections (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), description?.trim() || null, now, now);

    return {
      id,
      name: name.trim(),
      description: description?.trim() || null,
      unitIds: [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Get a collection by ID
   */
  getCollection(id: string): Collection | null {
    const row = this.db.prepare(`
      SELECT * FROM collections WHERE id = ?
    `).get(id) as any;

    if (!row) return null;

    const unitIds = this.getCollectionUnitIds(id);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      unitIds,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get a collection with its full units populated
   */
  getCollectionWithUnits(id: string): CollectionWithUnits | null {
    const collection = this.getCollection(id);
    if (!collection) return null;

    const units = this.getUnitsInCollection(id);

    return {
      ...collection,
      units,
    };
  }

  /**
   * List all collections
   */
  listCollections(): Collection[] {
    const rows = this.db.prepare(`
      SELECT * FROM collections ORDER BY updated_at DESC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      unitIds: this.getCollectionUnitIds(row.id),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Update a collection
   */
  updateCollection(id: string, updates: { name?: string; description?: string }): Collection | null {
    const existing = this.getCollection(id);
    if (!existing) return null;

    const updateFields: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
        throw new Error('Collection name cannot be empty');
      }
      updateFields.push('name = ?');
      params.push(updates.name.trim());
    }

    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      params.push(updates.description?.trim() || null);
    }

    if (updateFields.length === 0) {
      return existing;
    }

    const now = new Date().toISOString();
    updateFields.push('updated_at = ?');
    params.push(now);
    params.push(id);

    this.db.prepare(`
      UPDATE collections SET ${updateFields.join(', ')} WHERE id = ?
    `).run(...params);

    return this.getCollection(id);
  }

  /**
   * Delete a collection (units are NOT deleted, just the association)
   */
  deleteCollection(id: string): boolean {
    const existing = this.getCollection(id);
    if (!existing) return false;

    // Delete collection_units associations first
    this.db.prepare('DELETE FROM collection_units WHERE collection_id = ?').run(id);

    // Delete the collection
    const result = this.db.prepare('DELETE FROM collections WHERE id = ?').run(id);

    return result.changes > 0;
  }

  /**
   * Add a unit to a collection
   */
  addToCollection(collectionId: string, unitId: string): boolean {
    const collection = this.getCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    // Check if unit exists
    const unit = this.db.prepare('SELECT id FROM atomic_units WHERE id = ?').get(unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    // Check if already in collection
    const existing = this.db.prepare(`
      SELECT 1 FROM collection_units WHERE collection_id = ? AND unit_id = ?
    `).get(collectionId, unitId);

    if (existing) {
      return false; // Already in collection
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO collection_units (collection_id, unit_id, added_at)
      VALUES (?, ?, ?)
    `).run(collectionId, unitId, now);

    // Update collection's updated_at
    this.db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now, collectionId);

    return true;
  }

  /**
   * Remove a unit from a collection
   */
  removeFromCollection(collectionId: string, unitId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM collection_units WHERE collection_id = ? AND unit_id = ?
    `).run(collectionId, unitId);

    if (result.changes > 0) {
      // Update collection's updated_at
      const now = new Date().toISOString();
      this.db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now, collectionId);
    }

    return result.changes > 0;
  }

  /**
   * Get unit IDs in a collection
   */
  private getCollectionUnitIds(collectionId: string): string[] {
    const rows = this.db.prepare(`
      SELECT unit_id FROM collection_units
      WHERE collection_id = ?
      ORDER BY added_at DESC
    `).all(collectionId) as Array<{ unit_id: string }>;

    return rows.map(r => r.unit_id);
  }

  /**
   * Get full units in a collection
   */
  private getUnitsInCollection(collectionId: string): AtomicUnit[] {
    const rows = this.db.prepare(`
      SELECT u.* FROM atomic_units u
      JOIN collection_units cu ON u.id = cu.unit_id
      WHERE cu.collection_id = ?
      ORDER BY cu.added_at DESC
    `).all(collectionId) as any[];

    return rows.map(this.rowToAtomicUnit.bind(this));
  }

  /**
   * Get collections containing a specific unit
   */
  getCollectionsForUnit(unitId: string): Collection[] {
    const rows = this.db.prepare(`
      SELECT c.* FROM collections c
      JOIN collection_units cu ON c.id = cu.collection_id
      WHERE cu.unit_id = ?
      ORDER BY c.name
    `).all(unitId) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      unitIds: this.getCollectionUnitIds(row.id),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  // ==================== Favorites Operations ====================

  /**
   * Add a unit to favorites
   */
  addFavorite(unitId: string, userId?: string): boolean {
    // Check if unit exists
    const unit = this.db.prepare('SELECT id FROM atomic_units WHERE id = ?').get(unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    const userIdValue = userId || '';

    // Check if already favorited
    const existing = this.db.prepare(`
      SELECT 1 FROM favorites WHERE unit_id = ? AND user_id = ?
    `).get(unitId, userIdValue);

    if (existing) {
      return false; // Already favorited
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO favorites (unit_id, user_id, created_at)
      VALUES (?, ?, ?)
    `).run(unitId, userIdValue, now);

    return true;
  }

  /**
   * Remove a unit from favorites
   */
  removeFavorite(unitId: string, userId?: string): boolean {
    const userIdValue = userId || '';

    const result = this.db.prepare(`
      DELETE FROM favorites WHERE unit_id = ? AND user_id = ?
    `).run(unitId, userIdValue);

    return result.changes > 0;
  }

  /**
   * List all favorites for a user (or global if no userId)
   */
  listFavorites(userId?: string): Favorite[] {
    const userIdValue = userId || '';

    const rows = this.db.prepare(`
      SELECT * FROM favorites
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userIdValue) as any[];

    return rows.map(row => ({
      unitId: row.unit_id,
      userId: row.user_id || null,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * List favorites with full unit data
   */
  listFavoritesWithUnits(userId?: string): Array<Favorite & { unit: AtomicUnit }> {
    const userIdValue = userId || '';

    const rows = this.db.prepare(`
      SELECT f.*, u.* FROM favorites f
      JOIN atomic_units u ON f.unit_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userIdValue) as any[];

    return rows.map(row => ({
      unitId: row.unit_id,
      userId: row.user_id || null,
      createdAt: new Date(row.created_at),
      unit: this.rowToAtomicUnit(row),
    }));
  }

  /**
   * Check if a unit is favorited
   */
  isFavorite(unitId: string, userId?: string): boolean {
    const userIdValue = userId || '';

    const result = this.db.prepare(`
      SELECT 1 FROM favorites WHERE unit_id = ? AND user_id = ?
    `).get(unitId, userIdValue);

    return !!result;
  }

  /**
   * Get favorite count for a unit (across all users)
   */
  getFavoriteCount(unitId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM favorites WHERE unit_id = ?
    `).get(unitId) as { count: number };

    return result.count;
  }

  // ==================== Helper Methods ====================

  /**
   * Convert database row to AtomicUnit
   */
  private rowToAtomicUnit(row: any): AtomicUnit {
    let tags: string[] = [];
    let keywords: string[] = [];

    try {
      tags = row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [];
    } catch {
      tags = [];
    }

    try {
      keywords = row.keywords ? (typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords) : [];
    } catch {
      keywords = [];
    }

    return {
      id: row.id,
      type: row.type,
      timestamp: new Date(row.timestamp || row.created),
      title: row.title,
      content: row.content,
      context: row.context || '',
      tags,
      category: row.category || 'general',
      conversationId: row.conversation_id,
      documentId: row.document_id,
      relatedUnits: [],
      keywords,
    };
  }

  /**
   * Get statistics about collections and favorites
   */
  getStats(): {
    totalCollections: number;
    totalFavorites: number;
    avgUnitsPerCollection: number;
    collectionsWithMostUnits: Array<{ id: string; name: string; unitCount: number }>;
    mostFavoritedUnits: Array<{ unitId: string; favoriteCount: number }>;
  } {
    const totalCollections = (this.db.prepare('SELECT COUNT(*) as count FROM collections').get() as { count: number }).count;
    const totalFavorites = (this.db.prepare('SELECT COUNT(*) as count FROM favorites').get() as { count: number }).count;

    const avgResult = this.db.prepare(`
      SELECT AVG(unit_count) as avg FROM (
        SELECT COUNT(*) as unit_count FROM collection_units GROUP BY collection_id
      )
    `).get() as { avg: number | null };
    const avgUnitsPerCollection = avgResult.avg || 0;

    const collectionsWithMostUnits = this.db.prepare(`
      SELECT c.id, c.name, COUNT(cu.unit_id) as unitCount
      FROM collections c
      LEFT JOIN collection_units cu ON c.id = cu.collection_id
      GROUP BY c.id
      ORDER BY unitCount DESC
      LIMIT 10
    `).all() as Array<{ id: string; name: string; unitCount: number }>;

    const mostFavoritedUnits = this.db.prepare(`
      SELECT unit_id as unitId, COUNT(*) as favoriteCount
      FROM favorites
      GROUP BY unit_id
      ORDER BY favoriteCount DESC
      LIMIT 10
    `).all() as Array<{ unitId: string; favoriteCount: number }>;

    return {
      totalCollections,
      totalFavorites,
      avgUnitsPerCollection,
      collectionsWithMostUnits,
      mostFavoritedUnits,
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Export a factory function for easier testing
export function createCollectionsManager(dbPath?: string): CollectionsManager {
  return new CollectionsManager(dbPath);
}
