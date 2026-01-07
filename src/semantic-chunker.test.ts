import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticChunker, semanticChunk, DEFAULT_CHUNKING_CONFIG } from './semantic-chunker.js';

describe('SemanticChunker', () => {
  let chunker: SemanticChunker;

  beforeEach(() => {
    chunker = new SemanticChunker();
  });

  describe('Markdown Chunking', () => {
    it('should chunk markdown by headings', () => {
      const text = `# Main Title
This is an introduction.

## Section 1
Content for section 1.

## Section 2  
Content for section 2.`;

      const chunks = chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].type).toBe('section');
    });

    it('should preserve heading levels', () => {
      const text = `# H1
content
## H2
content
### H3
content`;

      const chunks = chunker.chunk(text);
      const withLevel = chunks.filter(c => c.level);
      expect(withLevel.length).toBeGreaterThan(0);
    });

    it('should extract code blocks', () => {
      const text = `Some text

\`\`\`typescript
const x = 1;
const y = 2;
\`\`\`

More text`;

      const chunks = chunker.chunk(text);
      const codeChunks = chunks.filter(c => c.type === 'code');
      expect(codeChunks.length).toBeGreaterThan(0);
      expect(codeChunks[0].content).toContain('const x');
    });
  });

  describe('Code Chunking', () => {
    it('should detect code content', () => {
      const code = `function hello(name: string): void {
  console.log('Hello, ' + name);
}`;

      const chunks = semanticChunk(code, {}, 'typescript');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].type).toBe('code');
    });

    it('should split on function boundaries', () => {
      const code = `function first() {
  return 1;
}

function second() {
  return 2;
}`;

      const chunks = chunker.chunk(code);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('Plain Text Chunking', () => {
    it('should chunk on paragraphs', () => {
      const text = `This is paragraph 1.
It has multiple lines.

This is paragraph 2.
Also multiple lines.`;

      const chunks = chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].type).toBe('paragraph');
    });

    it('should respect minimum chunk size', () => {
      const text = 'A B C D E F G H I J';
      const cfg = { minChunkSize: 50, maxChunkSize: 1000 };
      const chunks = new SemanticChunker(cfg).chunk(text);

      chunks.forEach(c => {
        expect(c.content.length).toBeGreaterThanOrEqual(50);
      });
    });

    it('should respect maximum chunk size', () => {
      const text = 'Word '.repeat(200);
      const cfg = { minChunkSize: 10, maxChunkSize: 100 };
      const chunks = new SemanticChunker(cfg).chunk(text);

      chunks.forEach(c => {
        expect(c.content.length).toBeLessThanOrEqual(110);
      });
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign high confidence to code chunks', () => {
      const code = 'const x = 1;';
      const chunks = chunker.chunk(code);
      const codeChunk = chunks.find(c => c.type === 'code');
      if (codeChunk) {
        expect(codeChunk.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should score based on chunk quality', () => {
      const text = `This is a well-formed paragraph. It has multiple sentences. Each one contributes to overall coherence. The length is appropriate for a knowledge unit.`;
      const chunks = chunker.chunk(text);
      
      chunks.forEach(c => {
        expect(c.confidence).toBeGreaterThan(0);
        expect(c.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Keyword Extraction', () => {
    it('should extract meaningful keywords', () => {
      const text = 'TypeScript is a programming language for building scalable applications with TypeScript types.';
      const chunks = chunker.chunk(text);
      
      const keywords = chunks.flatMap(c => c.keywords);
      expect(keywords).toContain('typescript');
    });

    it('should filter stopwords', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const chunks = chunker.chunk(text);
      
      const keywords = chunks.flatMap(c => c.keywords);
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('a');
    });

    it('should rank by frequency', () => {
      const text = 'test test test important detail important';
      const chunks = chunker.chunk(text);
      
      const kw = chunks[0].keywords;
      expect(kw[0]).toBe('test');
    });
  });

  describe('Related Chunks Detection', () => {
    it('should detect related chunks by keyword overlap', () => {
      const text = `
Chunk about TypeScript and programming.

Details about TypeScript syntax.

Information about programming patterns.
      `.trim();

      const chunks = chunker.chunk(text);
      const withRelated = chunks.filter(c => c.relatedChunks && c.relatedChunks.length > 0);
      
      expect(withRelated.length).toBeGreaterThan(0);
    });
  });

  describe('Content Type Detection', () => {
    it('should detect markdown', () => {
      const markdown = `# Title
## Subtitle
- item 1
- item 2`;

      const chunks = chunker.chunk(markdown);
      expect(chunks[0].type).toBe('section');
    });

    it('should detect code', () => {
      const code = `function test() {
  const x = 1;
  return x;
}`;

      const chunks = chunker.chunk(code);
      expect(chunks.some(c => c.type === 'code')).toBe(true);
    });
  });

  describe('Merging Small Chunks', () => {
    it('should merge chunks smaller than min size', () => {
      const cfg = { minChunkSize: 500, maxChunkSize: 1000, mergeSmallChunks: true };
      const text = 'Small. Very small. Text fragments.';
      
      const chunks = new SemanticChunker(cfg).chunk(text);
      chunks.forEach(c => {
        expect(c.content.length).toBeGreaterThanOrEqual(500 * 0.8);
      });
    });

    it('should not merge code blocks', () => {
      const cfg = { minChunkSize: 500, maxChunkSize: 10000, mergeSmallChunks: true };
      const text = `\`\`\`
code
\`\`\``;
      
      const chunks = new SemanticChunker(cfg).chunk(text);
      const codeChunks = chunks.filter(c => c.type === 'code');
      expect(codeChunks.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const chunks = chunker.chunk('');
      expect(chunks.length).toBe(0);
    });

    it('should handle very long chunks', () => {
      const longText = 'word '.repeat(10000);
      const chunks = chunker.chunk(longText);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should handle mixed content', () => {
      const text = `# Markdown
Some text here.

\`\`\`code\`\`\`

Back to text.`;

      const chunks = chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should respect custom config', () => {
      const cfg = { minChunkSize: 200, maxChunkSize: 500 };
      const chunker2 = new SemanticChunker(cfg);
      
      const text = 'word '.repeat(300);
      const chunks = chunker2.chunk(text);
      
      chunks.forEach(c => {
        expect(c.content.length).toBeGreaterThanOrEqual(200 * 0.8);
        expect(c.content.length).toBeLessThanOrEqual(550);
      });
    });

    it('should use default config if not specified', () => {
      const chunker2 = new SemanticChunker();
      expect(chunker2['config'].minChunkSize).toBe(DEFAULT_CHUNKING_CONFIG.minChunkSize);
    });
  });
});
