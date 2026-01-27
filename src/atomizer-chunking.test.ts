import { describe, it, expect } from 'vitest';
import { KnowledgeAtomizer } from './atomizer.js';
import { KnowledgeDocument } from './types.js';
import { ALLOWED_CATEGORIES } from './taxonomy.js';

function createDoc(content: string, format: KnowledgeDocument['format'] = 'markdown'): KnowledgeDocument {
  const now = new Date();
  return {
    id: 'doc-chunk-test',
    title: 'Chunked Doc',
    content,
    format,
    created: now,
    modified: now,
    url: 'http://example.test/doc',
    metadata: { sourceId: 'local-test', sourceName: 'Local Test' },
  };
}

describe('KnowledgeAtomizer Chunking & Enrichment', () => {
  it('chunks markdown documents and annotates image-rich content', () => {
    const prevMin = process.env.CHUNK_MIN_TOKENS;
    const prevMax = process.env.CHUNK_MAX_PER_DOC;
    process.env.CHUNK_MIN_TOKENS = '10';
    process.env.CHUNK_MAX_PER_DOC = '100';

    const atomizer = new KnowledgeAtomizer();
    const content = [
      '# Overview',
      '',
      'Intro section that is intentionally long. '.repeat(12),
      '',
      '![System Diagram](https://example.com/system.png)',
      '',
      '## Implementation',
      '',
      'Implementation details with more lengthy prose. '.repeat(16),
      '',
      '## Notes',
      '',
      'Additional notes and references. '.repeat(18),
    ].join('\n');

    const units = atomizer.atomizeDocument(createDoc(content, 'markdown'));

    try {
      expect(units.length).toBeGreaterThan(1);
      expect(units.some((u) => u.tags.includes('chunked'))).toBe(true);
      expect(units.some((u) => u.tags.includes('has-image'))).toBe(true);
      expect(units.some((u) => u.tags.some((t) => t.startsWith('chunk-strategy-')))).toBe(true);

      // Ensure taxonomy alignment (categories are normalized to allowed values)
      units.forEach((u) => {
        expect(ALLOWED_CATEGORIES.includes(u.category as any)).toBe(true);
      });
    } finally {
      process.env.CHUNK_MIN_TOKENS = prevMin;
      process.env.CHUNK_MAX_PER_DOC = prevMax;
    }
  });
});
