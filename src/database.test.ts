import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { KnowledgeDatabase } from './database.js';
import { AtomicUnit } from './types.js';

describe('KnowledgeDatabase helpers', () => {
  let tempDir: string;
  let dbPath: string;
  let db: KnowledgeDatabase;

  beforeEach(() => {
    tempDir = join(process.cwd(), '.test-tmp', 'database-helpers');
    dbPath = join(tempDir, 'test.db');
    mkdirSync(tempDir, { recursive: true });
    db = new KnowledgeDatabase(dbPath);

    const timestamp = new Date('2026-01-01T00:00:00.000Z');
    const units: AtomicUnit[] = [
      {
        id: 'unit-1',
        type: 'insight',
        title: 'Focused Graph Node',
        content: 'Graph focus content',
        context: 'context',
        category: 'programming',
        tags: ['graph', 'focus'],
        keywords: ['graph', 'focus'],
        relatedUnits: [],
        timestamp,
      },
      {
        id: 'unit-2',
        type: 'code',
        title: 'Neighbor Node',
        content: 'Neighbor content',
        context: 'context',
        category: 'programming',
        tags: ['graph', 'neighbor'],
        keywords: ['neighbor'],
        relatedUnits: [],
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'unit-3',
        type: 'question',
        title: 'Different Category',
        content: 'Design category content',
        context: 'context',
        category: 'design',
        tags: ['design'],
        keywords: ['design'],
        relatedUnits: [],
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
      },
    ];

    units.forEach(unit => db.insertAtomicUnit(unit));

    const rawDb = db['db'];
    rawDb.prepare(`
      INSERT INTO unit_relationships (from_unit, to_unit, relationship_type)
      VALUES (?, ?, 'related')
    `).run('unit-1', 'unit-2');
  });

  afterEach(() => {
    try {
      db.close();
    } catch (error) {
      // Ignore close errors for cleanup robustness in tests
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('getUnitById returns a hydrated unit', () => {
    const unit = db.getUnitById('unit-1');
    expect(unit?.id).toBe('unit-1');
    expect(unit?.tags).toContain('graph');
    expect(unit?.keywords).toContain('focus');
    expect(unit?.relatedUnits).toContain('unit-2');
  });

  it('getUnitsForGraph supports type and category filters', () => {
    const programmingInsights = db.getUnitsForGraph({
      limit: 10,
      type: 'insight',
      category: 'programming',
    });

    expect(programmingInsights.map(u => u.id)).toEqual(['unit-1']);
  });

  it('getRelationshipsForUnitIds returns touching relationships', () => {
    const edges = db.getRelationshipsForUnitIds(['unit-1', 'unit-2']);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0]).toMatchObject({ fromUnit: 'unit-1', toUnit: 'unit-2' });
  });
});
