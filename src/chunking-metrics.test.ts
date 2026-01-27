import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { KnowledgeDatabase } from './database.js';
import { AtomicUnit, KnowledgeDocument } from './types.js';

const TMP_DIR = path.join(process.cwd(), '.test-tmp', 'chunking-metrics');
const DB_PATH = path.join(TMP_DIR, 'test.db');

function makeDoc(id: string, format: KnowledgeDocument['format']): KnowledgeDocument {
  const now = new Date();
  return {
    id,
    title: `Doc ${id}`,
    content: `Content for ${id}`,
    created: now,
    modified: now,
    format,
    metadata: { sourceId: 'local-test' },
  };
}

function makeUnit(partial: Partial<AtomicUnit> & { id: string; documentId: string }): AtomicUnit {
  const now = new Date();
  return {
    id: partial.id,
    type: partial.type || 'reference',
    timestamp: partial.timestamp || now,
    title: partial.title || `Unit ${partial.id}`,
    content: partial.content || 'Unit content',
    context: partial.context || 'Unit context',
    tags: partial.tags || [],
    category: partial.category || 'general',
    documentId: partial.documentId,
    relatedUnits: partial.relatedUnits || [],
    keywords: partial.keywords || [],
  };
}

describe('KnowledgeDatabase chunking metrics', () => {
  let db: KnowledgeDatabase;

  beforeEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    db = new KnowledgeDatabase(DB_PATH);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('computes chunking coverage, format breakdown, and strategy tags', () => {
    const docPdf = makeDoc('doc-pdf', 'pdf');
    const docMd = makeDoc('doc-md', 'markdown');
    const docHtml = makeDoc('doc-html', 'html');

    db.insertDocument(docPdf);
    db.insertDocument(docMd);
    db.insertDocument(docHtml);

    // Chunked PDF document: 3 units, all tagged with the same strategy tag.
    db.insertAtomicUnit(
      makeUnit({
        id: 'u-pdf-1',
        documentId: docPdf.id,
        tags: ['chunked', 'chunk-strategy-pdf-sliding-window'],
      })
    );
    db.insertAtomicUnit(
      makeUnit({
        id: 'u-pdf-2',
        documentId: docPdf.id,
        tags: ['chunked', 'chunk-strategy-pdf-sliding-window'],
      })
    );
    db.insertAtomicUnit(
      makeUnit({
        id: 'u-pdf-3',
        documentId: docPdf.id,
        tags: ['chunked', 'chunk-strategy-pdf-sliding-window'],
      })
    );

    // Single-unit markdown document (not chunked).
    db.insertAtomicUnit(
      makeUnit({
        id: 'u-md-1',
        documentId: docMd.id,
        tags: ['document'],
      })
    );

    const metrics = db.getChunkingMetrics();

    expect(metrics.totals.documents).toBe(3);
    expect(metrics.totals.documentsWithUnits).toBe(2);
    expect(metrics.totals.documentsChunked).toBe(1);
    expect(metrics.totals.documentsChunkedPct).toBeCloseTo(50, 5);
    expect(metrics.totals.avgUnitsPerDocument).toBeCloseTo(2, 5);
    expect(metrics.totals.maxUnitsPerDocument).toBe(3);
    expect(metrics.totals.documentUnits).toBe(4);
    expect(metrics.totals.documentUnitsWithChunkStrategy).toBe(3);
    expect(metrics.totals.documentUnitsWithChunkStrategyPct).toBeCloseTo(75, 5);
    expect(metrics.totals.documentUnitsWithImages).toBe(0);
    expect(metrics.totals.documentUnitsWithImagesPct).toBeCloseTo(0, 5);

    const strategy = metrics.chunkingTags.find(
      (t) => t.tag === 'chunk-strategy-pdf-sliding-window'
    );
    expect(strategy).toBeDefined();
    expect(strategy?.documents).toBe(1);
    expect(strategy?.applications).toBe(3);

    const pdfRow = metrics.formats.find((f) => f.format === 'pdf');
    expect(pdfRow).toBeDefined();
    expect(pdfRow?.documents).toBe(1);
    expect(pdfRow?.documentsWithUnits).toBe(1);
    expect(pdfRow?.documentsChunked).toBe(1);
    expect(pdfRow?.documentsChunkedPct).toBeCloseTo(100, 5);
    expect(pdfRow?.avgUnitsPerDocument).toBeCloseTo(3, 5);

    const mdRow = metrics.formats.find((f) => f.format === 'markdown');
    expect(mdRow).toBeDefined();
    expect(mdRow?.documents).toBe(1);
    expect(mdRow?.documentsWithUnits).toBe(1);
    expect(mdRow?.documentsChunked).toBe(0);
    expect(mdRow?.documentsChunkedPct).toBeCloseTo(0, 5);
    expect(mdRow?.avgUnitsPerDocument).toBeCloseTo(1, 5);

    const htmlRow = metrics.formats.find((f) => f.format === 'html');
    expect(htmlRow).toBeDefined();
    expect(htmlRow?.documents).toBe(1);
    expect(htmlRow?.documentsWithUnits).toBe(0);
    expect(htmlRow?.documentsChunked).toBe(0);
    expect(htmlRow?.documentsChunkedPct).toBeCloseTo(0, 5);
    expect(htmlRow?.avgUnitsPerDocument).toBeCloseTo(0, 5);

    const sourceRow = metrics.sourceBreakdown.find((s) => s.sourceId === 'local-test');
    expect(sourceRow).toBeDefined();
    expect(sourceRow?.documents).toBe(3);
    expect(sourceRow?.documentsWithUnits).toBe(2);
    expect(sourceRow?.documentsChunked).toBe(1);
    expect(sourceRow?.documentsChunkedPct).toBeCloseTo(50, 5);
    expect(sourceRow?.avgUnitsPerDocument).toBeCloseTo(2, 5);

    expect(metrics.topDocuments.length).toBeGreaterThan(0);
    expect(metrics.topDocuments[0].documentId).toBe(docPdf.id);
    expect(metrics.topDocuments[0].unitCount).toBe(3);
  });
});
