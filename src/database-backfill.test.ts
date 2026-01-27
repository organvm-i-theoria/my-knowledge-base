import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { KnowledgeDatabase } from './database.js';
import { AtomicUnit, KnowledgeDocument } from './types.js';

const TEST_DIR = join(process.cwd(), '.test-tmp', 'database-backfill');
const TEST_DB = join(TEST_DIR, 'test.db');

function createDoc(
  id: string,
  format: KnowledgeDocument['format'],
  sourceId: string
): KnowledgeDocument {
  const now = new Date();
  return {
    id,
    title: `Doc ${id}`,
    content: `# ${id}\n\nDocument content for ${id}.`,
    created: now,
    modified: now,
    format,
    url: `file:///tmp/${id}.${format}`,
    metadata: {
      sourceId,
      sourceName: sourceId,
      path: `/tmp/${id}.${format}`,
    },
  };
}

function createUnit(partial: Partial<AtomicUnit>): AtomicUnit {
  const now = new Date();
  return {
    id: partial.id || `unit-${Math.random().toString(36).slice(2)}`,
    type: partial.type || 'insight',
    timestamp: partial.timestamp || now,
    title: partial.title || 'Test Unit',
    content: partial.content || 'Some content here.',
    context: partial.context || 'From test',
    tags: partial.tags || [],
    category: partial.category || 'general',
    conversationId: partial.conversationId,
    documentId: partial.documentId,
    relatedUnits: partial.relatedUnits || [],
    keywords: partial.keywords || [],
  };
}

describe('KnowledgeDatabase.getUnitsForBackfill', () => {
  let db: KnowledgeDatabase;

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { force: true });
    }
    db = new KnowledgeDatabase(TEST_DB);

    // Seed documents
    db.insertDocument(createDoc('doc-pdf-local-1', 'pdf', 'local-1'));
    db.insertDocument(createDoc('doc-md-local-1', 'markdown', 'local-1'));
    db.insertDocument(createDoc('doc-pdf-local-2', 'pdf', 'local-2'));

    // Seed units
    db.insertAtomicUnit(
      createUnit({
        id: 'unit-a',
        documentId: 'doc-pdf-local-1',
        tags: [],
        category: 'uncategorized',
        keywords: ['pdf'],
      })
    );
    db.insertAtomicUnit(
      createUnit({
        id: 'unit-b',
        documentId: 'doc-md-local-1',
        tags: ['document'],
        category: 'writing',
        keywords: ['markdown'],
      })
    );
    db.insertAtomicUnit(
      createUnit({
        id: 'unit-c',
        documentId: 'doc-pdf-local-2',
        tags: ['document', 'pdf', 'manual'],
        category: 'programming',
        keywords: ['reference'],
      })
    );
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { force: true });
    }
  });

  it('filters document units by source, format, and tag count', () => {
    const units = db.getUnitsForBackfill({
      limit: 50,
      sourceIds: ['local-1'],
      formats: ['pdf'],
      maxExistingTags: 1,
      requireDocument: true,
    });

    const ids = new Set(units.map((u) => u.id));

    expect(ids.has('unit-a')).toBe(true);
    expect(ids.has('unit-b')).toBe(false);
    expect(ids.has('unit-c')).toBe(false);
  });

  it('respects offset parameter', () => {
    // Assuming units are ordered by created DESC. 
    // We have 3 units.
    const allUnits = db.getUnitsForBackfill({ limit: 10 });
    expect(allUnits.length).toBe(3);

    const offsetUnits = db.getUnitsForBackfill({ limit: 10, offset: 1 });
    expect(offsetUnits.length).toBe(2);
    // The first one in 'allUnits' should NOT be in 'offsetUnits'
    expect(offsetUnits.map(u => u.id)).not.toContain(allUnits[0].id);
    expect(offsetUnits.map(u => u.id)).toContain(allUnits[1].id);
    expect(offsetUnits.map(u => u.id)).toContain(allUnits[2].id);
  });

  it('filters by minContentLength', () => {
    // unit-a content length: ~16 chars ('Some content here.')
    // Let's update unit-a to have very short content
    db.insertAtomicUnit(
      createUnit({
        id: 'unit-short',
        documentId: 'doc-pdf-local-1',
        content: 'short',
      })
    );

    const units = db.getUnitsForBackfill({ minContentLength: 10 });
    const ids = new Set(units.map(u => u.id));
    
    expect(ids.has('unit-short')).toBe(false);
    expect(ids.has('unit-a')).toBe(true);
  });
});

