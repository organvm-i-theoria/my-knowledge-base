import { describe, it, expect } from 'vitest';
import {
  MarkdownSemanticChunkingStrategy,
  PdfSlidingWindowChunkingStrategy,
  detectImages,
} from './chunking-strategies.js';
import { KnowledgeDocument } from './types.js';

function createDoc(partial: Partial<KnowledgeDocument>): KnowledgeDocument {
  const now = new Date();
  return {
    id: partial.id || 'doc-1',
    title: partial.title || 'Test Doc',
    content: partial.content || '',
    created: partial.created || now,
    modified: partial.modified || now,
    url: partial.url,
    format: partial.format || 'markdown',
    metadata: partial.metadata || {},
  };
}

describe('Chunking Strategies', () => {
  it('chunks markdown/text by semantic headings', () => {
    const strategy = new MarkdownSemanticChunkingStrategy();
    const content = [
      '# Intro',
      '',
      'This is a long intro section that should be chunked as its own unit. '.repeat(8),
      '',
      '## Details',
      '',
      'More detailed content that should appear in another chunk. '.repeat(10),
      '',
      '## Appendix',
      '',
      'Supporting notes and references. '.repeat(12),
    ].join('\n');

    const chunks = strategy.chunk(createDoc({ content, format: 'markdown' }));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].metadata.strategy).toBe('markdown-semantic');
    expect(chunks[0].metadata.chunkCount).toBe(chunks.length);
  });

  it('preprocesses html headings to enable semantic chunking', () => {
    const prevMin = process.env.CHUNK_MIN_TOKENS;
    const prevMax = process.env.CHUNK_MAX_PER_DOC;
    process.env.CHUNK_MIN_TOKENS = '10';
    process.env.CHUNK_MAX_PER_DOC = '100';

    try {
      const strategy = new MarkdownSemanticChunkingStrategy();
      const content = [
        '<style>.hidden{display:none}</style>',
        '<script>console.log("noise")</script>',
        '<h1>Overview</h1>',
        '<p>' + 'Overview text that is fairly long. '.repeat(30) + '</p>',
        '<h2>Details</h2>',
        '<ul><li>First item</li><li>Second item</li></ul>',
        '<p>' + 'Detailed section content that should split. '.repeat(36) + '</p>',
        '<h3>Appendix</h3>',
        '<p>' + 'Appendix notes and references. '.repeat(28) + '</p>',
      ].join('\n');

      const chunks = strategy.chunk(createDoc({ content, format: 'html' }));

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].metadata.strategy).toBe('markdown-semantic');
      expect(chunks.some((c) => (c.metadata.heading || '').includes('Overview'))).toBe(true);
      expect(chunks.some((c) => (c.metadata.heading || '').includes('Appendix'))).toBe(true);
    } finally {
      process.env.CHUNK_MIN_TOKENS = prevMin;
      process.env.CHUNK_MAX_PER_DOC = prevMax;
    }
  });

  it('chunks large PDFs into sliding token windows with estimated page ranges', () => {
    const strategy = new PdfSlidingWindowChunkingStrategy({
      windowTokens: 300,
      overlapTokens: 30,
      minTokensToChunk: 400,
    });

    const words = Array.from({ length: 1200 }, (_, i) => `token${i + 1}`).join(' ');
    const doc = createDoc({
      format: 'pdf',
      content: words,
      metadata: { numpages: 12 },
    });

    const chunks = strategy.chunk(doc);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].metadata.pageStart).toBeTypeOf('number');
    expect(chunks[0].metadata.pageEnd).toBeTypeOf('number');
    expect(chunks[0].metadata.chunkCount).toBe(chunks.length);
  });

  it('detects markdown and html images', () => {
    const content = [
      'Here is a markdown image:',
      '![Architecture Diagram](https://example.com/arch.png)',
      '',
      'And an HTML image:',
      '<img src="https://example.com/ui.png" alt="UI Screenshot" />',
    ].join('\n');

    const images = detectImages(content);

    expect(images.length).toBe(2);
    expect(images[0].type).toBe('markdown');
    expect(images[1].type).toBe('html');
    expect(images[1].alt).toContain('UI');
  });
});
