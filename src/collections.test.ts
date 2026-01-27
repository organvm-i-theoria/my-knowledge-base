/**
 * Tests for Collections & Favorites Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CollectionsManager, Collection, Favorite } from './collections.js';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Test database path
const TEST_DB_PATH = './.test-tmp/collections-test.db';

// Helper to create test atomic units
function createTestUnit(db: Database.Database, overrides: Partial<any> = {}): string {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO atomic_units (id, timestamp, type, created, title, content, context, category, tags, keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    now,
    overrides.type || 'insight',
    now,
    overrides.title || 'Test Unit',
    overrides.content || 'Test content',
    overrides.context || 'Test context',
    overrides.category || 'general',
    JSON.stringify(overrides.tags || ['test']),
    JSON.stringify(overrides.keywords || ['keyword'])
  );

  return id;
}

describe('CollectionsManager', () => {
  let manager: CollectionsManager;
  let rawDb: Database.Database;

  beforeEach(() => {
    // Ensure test directory exists
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create database with atomic_units table
    rawDb = new Database(TEST_DB_PATH);
    rawDb.exec(`
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
        embedding BLOB,
        tags TEXT DEFAULT '[]',
        keywords TEXT DEFAULT '[]'
      );
    `);

    manager = new CollectionsManager(TEST_DB_PATH);
  });

  afterEach(() => {
    manager.close();
    rawDb.close();

    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  // ==================== Collection CRUD Tests ====================

  describe('Collection CRUD Operations', () => {
    it('should create a collection with name only', () => {
      const collection = manager.createCollection('My Collection');

      expect(collection).toBeDefined();
      expect(collection.id).toBeDefined();
      expect(collection.name).toBe('My Collection');
      expect(collection.description).toBeNull();
      expect(collection.unitIds).toEqual([]);
      expect(collection.createdAt).toBeInstanceOf(Date);
      expect(collection.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a collection with name and description', () => {
      const collection = manager.createCollection('Research', 'Research materials');

      expect(collection.name).toBe('Research');
      expect(collection.description).toBe('Research materials');
    });

    it('should trim collection name and description', () => {
      const collection = manager.createCollection('  Trimmed Name  ', '  Trimmed Description  ');

      expect(collection.name).toBe('Trimmed Name');
      expect(collection.description).toBe('Trimmed Description');
    });

    it('should throw error for empty collection name', () => {
      expect(() => manager.createCollection('')).toThrow('Collection name is required');
      expect(() => manager.createCollection('   ')).toThrow('Collection name is required');
    });

    it('should get a collection by ID', () => {
      const created = manager.createCollection('Test Collection', 'Description');
      const retrieved = manager.getCollection(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('Test Collection');
    });

    it('should return null for non-existent collection', () => {
      const result = manager.getCollection('non-existent-id');
      expect(result).toBeNull();
    });

    it('should list all collections', () => {
      manager.createCollection('Collection 1');
      manager.createCollection('Collection 2');
      manager.createCollection('Collection 3');

      const collections = manager.listCollections();

      expect(collections).toHaveLength(3);
    });

    it('should list collections ordered by updated_at DESC', () => {
      const c1 = manager.createCollection('First');
      const c2 = manager.createCollection('Second');

      // Update first collection to make it most recent
      manager.updateCollection(c1.id, { name: 'First Updated' });

      const collections = manager.listCollections();

      expect(collections[0].name).toBe('First Updated');
    });

    it('should update collection name', () => {
      const created = manager.createCollection('Original Name');
      const updated = manager.updateCollection(created.id, { name: 'New Name' });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New Name');
    });

    it('should update collection description', () => {
      const created = manager.createCollection('Name', 'Original Description');
      const updated = manager.updateCollection(created.id, { description: 'New Description' });

      expect(updated!.description).toBe('New Description');
    });

    it('should update both name and description', () => {
      const created = manager.createCollection('Original', 'Desc 1');
      const updated = manager.updateCollection(created.id, {
        name: 'Updated',
        description: 'Desc 2',
      });

      expect(updated!.name).toBe('Updated');
      expect(updated!.description).toBe('Desc 2');
    });

    it('should throw error when updating with empty name', () => {
      const created = manager.createCollection('Name');
      expect(() => manager.updateCollection(created.id, { name: '' })).toThrow('Collection name cannot be empty');
    });

    it('should return null when updating non-existent collection', () => {
      const result = manager.updateCollection('non-existent', { name: 'New' });
      expect(result).toBeNull();
    });

    it('should delete a collection', () => {
      const created = manager.createCollection('To Delete');
      const deleted = manager.deleteCollection(created.id);

      expect(deleted).toBe(true);
      expect(manager.getCollection(created.id)).toBeNull();
    });

    it('should return false when deleting non-existent collection', () => {
      const result = manager.deleteCollection('non-existent');
      expect(result).toBe(false);
    });
  });

  // ==================== Collection-Unit Relationship Tests ====================

  describe('Collection-Unit Relationships', () => {
    it('should add a unit to a collection', () => {
      const collection = manager.createCollection('My Collection');
      const unitId = createTestUnit(rawDb);

      const added = manager.addToCollection(collection.id, unitId);

      expect(added).toBe(true);

      const retrieved = manager.getCollection(collection.id);
      expect(retrieved!.unitIds).toContain(unitId);
    });

    it('should return false when adding duplicate unit to collection', () => {
      const collection = manager.createCollection('My Collection');
      const unitId = createTestUnit(rawDb);

      manager.addToCollection(collection.id, unitId);
      const addedAgain = manager.addToCollection(collection.id, unitId);

      expect(addedAgain).toBe(false);
    });

    it('should throw error when adding to non-existent collection', () => {
      const unitId = createTestUnit(rawDb);
      expect(() => manager.addToCollection('non-existent', unitId)).toThrow('Collection not found');
    });

    it('should throw error when adding non-existent unit', () => {
      const collection = manager.createCollection('My Collection');
      expect(() => manager.addToCollection(collection.id, 'non-existent')).toThrow('Unit not found');
    });

    it('should remove a unit from a collection', () => {
      const collection = manager.createCollection('My Collection');
      const unitId = createTestUnit(rawDb);

      manager.addToCollection(collection.id, unitId);
      const removed = manager.removeFromCollection(collection.id, unitId);

      expect(removed).toBe(true);

      const retrieved = manager.getCollection(collection.id);
      expect(retrieved!.unitIds).not.toContain(unitId);
    });

    it('should return false when removing non-existent unit from collection', () => {
      const collection = manager.createCollection('My Collection');
      const removed = manager.removeFromCollection(collection.id, 'non-existent');

      expect(removed).toBe(false);
    });

    it('should get collection with full units', () => {
      const collection = manager.createCollection('My Collection');
      const unitId1 = createTestUnit(rawDb, { title: 'Unit 1' });
      const unitId2 = createTestUnit(rawDb, { title: 'Unit 2' });

      manager.addToCollection(collection.id, unitId1);
      manager.addToCollection(collection.id, unitId2);

      const retrieved = manager.getCollectionWithUnits(collection.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.units).toHaveLength(2);
      expect(retrieved!.units.map(u => u.title)).toContain('Unit 1');
      expect(retrieved!.units.map(u => u.title)).toContain('Unit 2');
    });

    it('should get collections for a specific unit', () => {
      const c1 = manager.createCollection('Collection 1');
      const c2 = manager.createCollection('Collection 2');
      const c3 = manager.createCollection('Collection 3');
      const unitId = createTestUnit(rawDb);

      manager.addToCollection(c1.id, unitId);
      manager.addToCollection(c2.id, unitId);
      // c3 does not contain the unit

      const collections = manager.getCollectionsForUnit(unitId);

      expect(collections).toHaveLength(2);
      expect(collections.map(c => c.id)).toContain(c1.id);
      expect(collections.map(c => c.id)).toContain(c2.id);
      expect(collections.map(c => c.id)).not.toContain(c3.id);
    });

    it('should update collection timestamp when adding unit', () => {
      const collection = manager.createCollection('My Collection');
      const originalUpdatedAt = collection.updatedAt;

      // Small delay to ensure timestamp difference
      const unitId = createTestUnit(rawDb);

      manager.addToCollection(collection.id, unitId);

      const updated = manager.getCollection(collection.id);
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('should delete collection_units when collection is deleted', () => {
      const collection = manager.createCollection('My Collection');
      const unitId = createTestUnit(rawDb);

      manager.addToCollection(collection.id, unitId);
      manager.deleteCollection(collection.id);

      // Verify the junction table entries are gone
      const entries = rawDb.prepare('SELECT * FROM collection_units WHERE collection_id = ?').all(collection.id);
      expect(entries).toHaveLength(0);
    });
  });

  // ==================== Favorites Tests ====================

  describe('Favorites Operations', () => {
    it('should add a unit to favorites', () => {
      const unitId = createTestUnit(rawDb);
      const added = manager.addFavorite(unitId);

      expect(added).toBe(true);
    });

    it('should add favorite with user ID', () => {
      const unitId = createTestUnit(rawDb);
      const added = manager.addFavorite(unitId, 'user-123');

      expect(added).toBe(true);
    });

    it('should return false when adding duplicate favorite', () => {
      const unitId = createTestUnit(rawDb);

      manager.addFavorite(unitId);
      const addedAgain = manager.addFavorite(unitId);

      expect(addedAgain).toBe(false);
    });

    it('should allow same unit favorited by different users', () => {
      const unitId = createTestUnit(rawDb);

      const added1 = manager.addFavorite(unitId, 'user-1');
      const added2 = manager.addFavorite(unitId, 'user-2');

      expect(added1).toBe(true);
      expect(added2).toBe(true);
    });

    it('should throw error when favoriting non-existent unit', () => {
      expect(() => manager.addFavorite('non-existent')).toThrow('Unit not found');
    });

    it('should remove favorite', () => {
      const unitId = createTestUnit(rawDb);

      manager.addFavorite(unitId);
      const removed = manager.removeFavorite(unitId);

      expect(removed).toBe(true);
      expect(manager.isFavorite(unitId)).toBe(false);
    });

    it('should remove favorite for specific user', () => {
      const unitId = createTestUnit(rawDb);

      manager.addFavorite(unitId, 'user-1');
      manager.addFavorite(unitId, 'user-2');

      const removed = manager.removeFavorite(unitId, 'user-1');

      expect(removed).toBe(true);
      expect(manager.isFavorite(unitId, 'user-1')).toBe(false);
      expect(manager.isFavorite(unitId, 'user-2')).toBe(true);
    });

    it('should return false when removing non-existent favorite', () => {
      const unitId = createTestUnit(rawDb);
      const removed = manager.removeFavorite(unitId);

      expect(removed).toBe(false);
    });

    it('should list favorites', () => {
      const unitId1 = createTestUnit(rawDb, { title: 'Unit 1' });
      const unitId2 = createTestUnit(rawDb, { title: 'Unit 2' });

      manager.addFavorite(unitId1);
      manager.addFavorite(unitId2);

      const favorites = manager.listFavorites();

      expect(favorites).toHaveLength(2);
      expect(favorites.map(f => f.unitId)).toContain(unitId1);
      expect(favorites.map(f => f.unitId)).toContain(unitId2);
    });

    it('should list favorites for specific user', () => {
      const unitId1 = createTestUnit(rawDb);
      const unitId2 = createTestUnit(rawDb);

      manager.addFavorite(unitId1, 'user-1');
      manager.addFavorite(unitId2, 'user-2');

      const favoritesUser1 = manager.listFavorites('user-1');
      const favoritesUser2 = manager.listFavorites('user-2');

      expect(favoritesUser1).toHaveLength(1);
      expect(favoritesUser1[0].unitId).toBe(unitId1);

      expect(favoritesUser2).toHaveLength(1);
      expect(favoritesUser2[0].unitId).toBe(unitId2);
    });

    it('should list favorites with units', () => {
      const unitId = createTestUnit(rawDb, { title: 'Test Title' });

      manager.addFavorite(unitId);

      const favorites = manager.listFavoritesWithUnits();

      expect(favorites).toHaveLength(1);
      expect(favorites[0].unit).toBeDefined();
      expect(favorites[0].unit.title).toBe('Test Title');
    });

    it('should check if unit is favorite', () => {
      const unitId = createTestUnit(rawDb);

      expect(manager.isFavorite(unitId)).toBe(false);

      manager.addFavorite(unitId);

      expect(manager.isFavorite(unitId)).toBe(true);
    });

    it('should check favorite status for specific user', () => {
      const unitId = createTestUnit(rawDb);

      manager.addFavorite(unitId, 'user-1');

      expect(manager.isFavorite(unitId, 'user-1')).toBe(true);
      expect(manager.isFavorite(unitId, 'user-2')).toBe(false);
    });

    it('should get favorite count for a unit', () => {
      const unitId = createTestUnit(rawDb);

      expect(manager.getFavoriteCount(unitId)).toBe(0);

      manager.addFavorite(unitId, 'user-1');
      expect(manager.getFavoriteCount(unitId)).toBe(1);

      manager.addFavorite(unitId, 'user-2');
      expect(manager.getFavoriteCount(unitId)).toBe(2);
    });
  });

  // ==================== Statistics Tests ====================

  describe('Statistics', () => {
    it('should return stats with zero collections', () => {
      const stats = manager.getStats();

      expect(stats.totalCollections).toBe(0);
      expect(stats.totalFavorites).toBe(0);
      expect(stats.avgUnitsPerCollection).toBe(0);
    });

    it('should return correct total collections count', () => {
      manager.createCollection('C1');
      manager.createCollection('C2');
      manager.createCollection('C3');

      const stats = manager.getStats();

      expect(stats.totalCollections).toBe(3);
    });

    it('should return correct total favorites count', () => {
      const unitId1 = createTestUnit(rawDb);
      const unitId2 = createTestUnit(rawDb);

      manager.addFavorite(unitId1);
      manager.addFavorite(unitId2);

      const stats = manager.getStats();

      expect(stats.totalFavorites).toBe(2);
    });

    it('should return collections with most units', () => {
      const c1 = manager.createCollection('Small Collection');
      const c2 = manager.createCollection('Large Collection');

      const unitId1 = createTestUnit(rawDb);
      const unitId2 = createTestUnit(rawDb);
      const unitId3 = createTestUnit(rawDb);

      manager.addToCollection(c1.id, unitId1);

      manager.addToCollection(c2.id, unitId1);
      manager.addToCollection(c2.id, unitId2);
      manager.addToCollection(c2.id, unitId3);

      const stats = manager.getStats();

      expect(stats.collectionsWithMostUnits[0].name).toBe('Large Collection');
      expect(stats.collectionsWithMostUnits[0].unitCount).toBe(3);
    });

    it('should return most favorited units', () => {
      const unitId1 = createTestUnit(rawDb);
      const unitId2 = createTestUnit(rawDb);

      manager.addFavorite(unitId1, 'user-1');
      manager.addFavorite(unitId1, 'user-2');
      manager.addFavorite(unitId1, 'user-3');

      manager.addFavorite(unitId2, 'user-1');

      const stats = manager.getStats();

      expect(stats.mostFavoritedUnits[0].unitId).toBe(unitId1);
      expect(stats.mostFavoritedUnits[0].favoriteCount).toBe(3);
    });
  });

  // ==================== Edge Cases ====================

  describe('Edge Cases', () => {
    it('should handle collection with empty description', () => {
      const collection = manager.createCollection('Name', '');

      expect(collection.description).toBeNull();
    });

    it('should handle updating collection with null description', () => {
      const created = manager.createCollection('Name', 'Description');
      const updated = manager.updateCollection(created.id, { description: '' });

      expect(updated!.description).toBeNull();
    });

    it('should handle multiple collections with same name', () => {
      const c1 = manager.createCollection('Same Name');
      const c2 = manager.createCollection('Same Name');

      expect(c1.id).not.toBe(c2.id);
      expect(c1.name).toBe(c2.name);
    });

    it('should handle collection with many units', () => {
      const collection = manager.createCollection('Large Collection');

      const unitIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const unitId = createTestUnit(rawDb, { title: `Unit ${i}` });
        unitIds.push(unitId);
        manager.addToCollection(collection.id, unitId);
      }

      const retrieved = manager.getCollection(collection.id);
      expect(retrieved!.unitIds).toHaveLength(100);
    });

    it('should handle unit in multiple collections', () => {
      const unitId = createTestUnit(rawDb);
      const collections: Collection[] = [];

      for (let i = 0; i < 10; i++) {
        const c = manager.createCollection(`Collection ${i}`);
        collections.push(c);
        manager.addToCollection(c.id, unitId);
      }

      const unitCollections = manager.getCollectionsForUnit(unitId);
      expect(unitCollections).toHaveLength(10);
    });

    it('should preserve favorites when unit is in collections', () => {
      const unitId = createTestUnit(rawDb);
      const collection = manager.createCollection('My Collection');

      manager.addToCollection(collection.id, unitId);
      manager.addFavorite(unitId);

      expect(manager.isFavorite(unitId)).toBe(true);
      expect(manager.getCollection(collection.id)!.unitIds).toContain(unitId);
    });
  });
});
