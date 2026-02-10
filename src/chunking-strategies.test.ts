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

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  Object.entries(vars).forEach(([key, value]) => {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  });

  try {
    fn();
  } finally {
    Object.entries(vars).forEach(([key]) => {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    });
  }
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

  it('strips noisy html blocks and preserves list bullets during preprocessing', () => {
    withEnv(
      {
        CHUNK_MIN_TOKENS: '5',
        CHUNK_MAX_PER_DOC: '100',
      },
      () => {
        const strategy = new MarkdownSemanticChunkingStrategy();
        const content = [
          '<script>window.__badSignal = "drop-me";</script>',
          '<style>.do-not-keep { color: red; }</style>',
          '<nav>Ignore navigation noise</nav>',
          '<h3>Checklist</h3>',
          '<ul><li>Alpha item</li><li>Beta item</li></ul>',
          '<h4>Details</h4>',
          '<p>' + 'Context line for list-heavy content. '.repeat(35) + '</p>',
        ].join('\n');

        const chunks = strategy.chunk(createDoc({ content, format: 'html' }));
        const combined = chunks.map((c) => c.content).join('\n');

        expect(combined).toContain('- Alpha item');
        expect(combined).toContain('- Beta item');
        expect(combined).toContain('# Checklist');
        expect(combined).not.toContain('__badSignal');
        expect(combined).not.toContain('do-not-keep');
        expect(combined).not.toContain('Ignore navigation noise');
      }
    );
  });

  it('applies markdown guardrails to cap chunk count', () => {
    withEnv(
      {
        CHUNK_MIN_TOKENS: '1',
        CHUNK_MAX_PER_DOC: '2',
      },
      () => {
        const strategy = new MarkdownSemanticChunkingStrategy();
        const content = [
          '# Section 1',
          'One '.repeat(220),
          '## Section 2',
          'Two '.repeat(220),
          '## Section 3',
          'Three '.repeat(220),
          '## Section 4',
          'Four '.repeat(220),
        ].join('\n\n');

        const chunks = strategy.chunk(createDoc({ content, format: 'markdown' }));
        expect(chunks.length).toBeLessThanOrEqual(2);
        chunks.forEach((chunk, index) => {
          expect(chunk.metadata.chunkIndex).toBe(index);
          expect(chunk.metadata.chunkCount).toBe(chunks.length);
        });
      }
    );
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

  it('reads pdf window controls from environment defaults', () => {
    withEnv(
      {
        CHUNK_PDF_WINDOW_TOKENS: '200',
        CHUNK_PDF_OVERLAP_TOKENS: '20',
        CHUNK_PDF_MIN_TOKENS: '300',
        CHUNK_MAX_PER_DOC: '100',
        CHUNK_MIN_TOKENS: '1',
      },
      () => {
        const strategy = new PdfSlidingWindowChunkingStrategy();
        const words = Array.from({ length: 900 }, (_, i) => `token${i + 1}`).join(' ');
        const chunks = strategy.chunk(
          createDoc({
            format: 'pdf',
            content: words,
            metadata: { numpages: 9 },
          })
        );

        expect(chunks.length).toBeGreaterThan(3);
        expect(chunks[0].metadata.tokenStart).toBe(0);
        expect(chunks[0].metadata.tokenEnd).toBeTypeOf('number');
      }
    );
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
