import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentAtomizer } from './document-atomizer.js';
import { KnowledgeDocument } from './types.js';

describe('DocumentAtomizer', () => {
  let atomizer: DocumentAtomizer;

  beforeEach(() => {
    atomizer = new DocumentAtomizer();
  });

  const createDoc = (content: string, title = 'Test Document'): KnowledgeDocument => ({
    id: 'test-doc-1',
    title,
    content,
    format: 'markdown',
    created: new Date(),
    modified: new Date(),
    url: 'http://test.local/test',
    metadata: {},
  });

  describe('List Detection', () => {
    it('detects unordered lists', () => {
      const content = `
# Lists

- Item 1
- Item 2
- Item 3
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const listUnit = units.find((u) => (u as any).sectionType === 'list');
      expect(listUnit).toBeDefined();
      expect(listUnit?.content).toContain('Item 1');
    });

    it('detects ordered lists', () => {
      const content = `
# Steps

1. First step
2. Second step
3. Third step
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const listUnit = units.find((u) => (u as any).sectionType === 'list');
      expect(listUnit).toBeDefined();
      expect(listUnit?.content).toContain('First step');
    });

    it('detects nested lists', () => {
      const content = `
- Parent item
  - Nested item 1
  - Nested item 2
- Another parent
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const listUnit = units.find((u) => (u as any).sectionType === 'list');
      expect(listUnit).toBeDefined();
      expect(listUnit?.content).toContain('Nested item');
    });

    it('preserves list structure', () => {
      const content = `
- Item with continuation
  that spans multiple lines
- Next item
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const listUnit = units.find((u) => (u as any).sectionType === 'list');
      expect(listUnit?.content).toContain('continuation');
    });

    it('handles mixed list types', () => {
      const content = `
1. Ordered first
2. Ordered second

- Unordered first
- Unordered second
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const lists = units.filter((u) => (u as any).sectionType === 'list');
      expect(lists.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Table Detection', () => {
    it('detects tables with headers', () => {
      const content = `
# Data

| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const tableUnit = units.find((u) => (u as any).sectionType === 'table');
      expect(tableUnit).toBeDefined();
      expect(tableUnit?.content).toContain('Alice');
    });

    it('detects tables without separator row', () => {
      const content = `
| Col1 | Col2 |
| val1 | val2 |
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const tableUnit = units.find((u) => (u as any).sectionType === 'table');
      expect(tableUnit).toBeDefined();
    });

    it('extracts column count in title', () => {
      const content = `
| A | B | C |
|---|---|---|
| 1 | 2 | 3 |
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const tableUnit = units.find((u) => (u as any).sectionType === 'table');
      expect(tableUnit?.title).toContain('3 columns');
    });

    it('handles multi-row tables', () => {
      const content = `
| ID | Name | Status |
|----|------|--------|
| 1  | Task A | Done |
| 2  | Task B | Pending |
| 3  | Task C | In Progress |
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const tableUnit = units.find((u) => (u as any).sectionType === 'table');
      expect(tableUnit?.content).toContain('Task A');
      expect(tableUnit?.content).toContain('Task B');
    });
  });

  describe('Code Block Detection', () => {
    it('extracts fenced code blocks', () => {
      const content = `
\`\`\`javascript
function hello() {
  console.log('Hello World');
}
\`\`\`
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const codeUnit = units.find((u) => u.type === 'code');
      expect(codeUnit).toBeDefined();
      expect(codeUnit?.content).toContain('hello');
    });

    it('preserves language tags', () => {
      const content = `
\`\`\`python
def greet(name):
    print(f"Hello {name}")
\`\`\`
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const codeUnit = units.find((u) => u.type === 'code');
      expect(codeUnit?.title).toContain('python');
    });

    it('handles multiple code blocks', () => {
      const content = `
\`\`\`js
const x = 1;
\`\`\`

Some text here

\`\`\`ts
const y: number = 2;
\`\`\`
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const codeUnits = units.filter((u) => u.type === 'code');
      expect(codeUnits.length).toBe(2);
    });

    it('handles code blocks without language tag', () => {
      const content = `
\`\`\`
raw code block
\`\`\`
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const codeUnit = units.find((u) => u.type === 'code');
      expect(codeUnit).toBeDefined();
      expect(codeUnit?.title).toContain('Code');
    });

    it('extracts code block content correctly', () => {
      const content = `
\`\`\`typescript
interface User {
  name: string;
  age: number;
}
\`\`\`
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const codeUnit = units.find((u) => u.type === 'code');
      expect(codeUnit?.content).toContain('interface User');
      expect(codeUnit?.content).not.toContain('```');
    });
  });

  describe('Header Detection', () => {
    it('detects H1 headers', () => {
      const content = `
# Main Title
Some content here.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const headerUnit = units.find((u) => (u as any).sectionType === 'heading');
      expect(headerUnit?.title).toBe('Main Title');
    });

    it('detects all heading levels (H1-H6)', () => {
      const content = `
# H1 Title
## H2 Title
### H3 Title
#### H4 Title
##### H5 Title
###### H6 Title
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const headers = units.filter((u) => (u as any).sectionType === 'heading');
      expect(headers.length).toBe(6);
    });

    it('tracks hierarchy levels correctly', () => {
      const content = `
# Top Level
Content here
## Sub Level
Sub content
### Sub-Sub Level
Deep content
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const headers = units.filter((u) => (u as any).sectionType === 'heading');
      const h1 = headers.find((u) => u.title === 'Top Level');
      const h2 = headers.find((u) => u.title === 'Sub Level');
      const h3 = headers.find((u) => u.title === 'Sub-Sub Level');

      expect((h1 as any).hierarchyLevel).toBe(0);
      expect((h2 as any).hierarchyLevel).toBe(1);
      expect((h3 as any).hierarchyLevel).toBe(2);
    });

    it('sets parent-child relationships', () => {
      const content = `
# Parent Section
Content
## Child Section
Child content
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const parent = units.find((u) => u.title === 'Parent Section');
      const child = units.find((u) => u.title === 'Child Section');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect((child as any).parentSectionId).toBe(parent?.id);
    });

    it('handles heading traversal back to higher level', () => {
      const content = `
# H1
Content
## H2
Content
### H3
Content
## Another H2
Another content
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const h1 = units.find((u) => (u as any).level === 0);
      const h2s = units.filter((u) => (u as any).level === 1);
      const h3 = units.find((u) => (u as any).level === 2);

      // Both H2s should have the H1 as parent
      h2s.forEach((h2) => {
        expect((h2 as any).parentSectionId).toBe(h1?.id);
      });

      // H3 should have the first H2 as parent
      expect((h3 as any).parentSectionId).toBe(h2s[0]?.id);
    });
  });

  describe('Blockquote Detection', () => {
    it('detects single-line blockquotes', () => {
      const content = `
> This is a quote
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const quoteUnit = units.find((u) => (u as any).sectionType === 'blockquote');
      expect(quoteUnit).toBeDefined();
      expect(quoteUnit?.content).toBe('This is a quote');
    });

    it('detects multi-line blockquotes', () => {
      const content = `
> This is a
> multi-line
> blockquote
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const quoteUnit = units.find((u) => (u as any).sectionType === 'blockquote');
      expect(quoteUnit?.content).toContain('multi-line');
    });

    it('preserves blockquote formatting', () => {
      const content = `
> Important Note:
> This is significant
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const quoteUnit = units.find((u) => (u as any).sectionType === 'blockquote');
      expect(quoteUnit?.content).toContain('Important Note:');
    });
  });

  describe('Paragraph Detection', () => {
    it('detects paragraphs separated by blank lines', () => {
      const content = `
This is the first paragraph with some content.

This is the second paragraph with different content.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const paragraphs = units.filter((u) => (u as any).sectionType === 'paragraph');
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    });

    it('generates titles for paragraphs', () => {
      const content = `
This paragraph starts with a meaningful first line that should become the title. The rest of the content continues here with more details about the topic being discussed in this paragraph.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const paraUnit = units.find((u) => (u as any).sectionType === 'paragraph');
      expect(paraUnit?.title).toContain('meaningful');
    });

    it('filters out very short paragraphs', () => {
      const content = `
A

This is a long paragraph with enough content to be included in the atomization results because it contains substantial information worth preserving.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const paragraphs = units.filter((u) => (u as any).sectionType === 'paragraph');
      expect(
        paragraphs.every((p) => p.content.split(' ').length > 5)
      ).toBe(true);
    });
  });

  describe('Complex Documents', () => {
    it('handles mixed content types', () => {
      const content = `
# Introduction

This is an introductory paragraph with important information.

## Code Example

\`\`\`javascript
const example = { key: 'value' };
\`\`\`

## Key Points

- Point 1
- Point 2
- Point 3

## Data Table

| Feature | Status |
|---------|--------|
| Auth | Done |
| API | In Progress |

> Remember to update documentation
`;
      const units = atomizer.atomizeDocument(createDoc(content));

      const headings = units.filter((u) => (u as any).sectionType === 'heading');
      const codes = units.filter((u) => u.type === 'code');
      const lists = units.filter((u) => (u as any).sectionType === 'list');
      const tables = units.filter((u) => (u as any).sectionType === 'table');
      const quotes = units.filter((u) => (u as any).sectionType === 'blockquote');

      expect(headings.length).toBeGreaterThan(0);
      expect(codes.length).toBeGreaterThan(0);
      expect(lists.length).toBeGreaterThan(0);
      expect(tables.length).toBeGreaterThan(0);
      expect(quotes.length).toBeGreaterThan(0);
    });

    it('maintains document order', () => {
      const content = `
# Section 1
Content 1

# Section 2
Content 2

# Section 3
Content 3
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const headings = units.filter((u) => (u as any).sectionType === 'heading');

      expect(headings[0]?.title).toBe('Section 1');
      expect(headings[1]?.title).toBe('Section 2');
      expect(headings[2]?.title).toBe('Section 3');
    });

    it('builds correct hierarchy for nested structures', () => {
      const content = `
# Main
## Sub1
### SubSub1
## Sub2
### SubSub2a
### SubSub2b
`;
      const units = atomizer.atomizeDocument(createDoc(content));

      const main = units.find((u) => u.title === 'Main');
      const sub1 = units.find((u) => u.title === 'Sub1');
      const subsub1 = units.find((u) => u.title === 'SubSub1');
      const sub2 = units.find((u) => u.title === 'Sub2');

      expect((sub1 as any).parentSectionId).toBe(main?.id);
      expect((subsub1 as any).parentSectionId).toBe(sub1?.id);
      expect((sub2 as any).parentSectionId).toBe(main?.id);
    });
  });

  describe('Keyword Extraction', () => {
    it('extracts keywords from content', () => {
      const content = `
# Article

This article discusses TypeScript programming, including functions, classes, and interfaces used in modern development.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const unit = units.find((u) => (u as any).sectionType === 'heading');

      expect(unit?.keywords).toBeDefined();
      expect(unit?.keywords?.length).toBeGreaterThan(0);
    });

    it('filters short words from keywords', () => {
      const content = `
The quick brown fox jumps over the lazy dog in the field.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      const unit = units[units.length - 1];

      expect(unit?.keywords).toBeDefined();
      expect(unit?.keywords?.every((k) => k.length > 3)).toBe(true);
    });
  });

  describe('Categorization', () => {
    it('categorizes programming content', () => {
      const content = `
This discusses function declarations and class definitions in JavaScript.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      expect(units.some((u) => u.category === 'programming')).toBe(true);
    });

    it('categorizes design content', () => {
      const content = `
The design pattern we use follows a strategic methodology and framework.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      expect(units.some((u) => u.category === 'design')).toBe(true);
    });

    it('categorizes research content', () => {
      const content = `
Our research study found important findings through experimentation.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      expect(units.some((u) => u.category === 'research')).toBe(true);
    });
  });

  describe('Fallback Behavior', () => {
    it('falls back to paragraph atomization for content without sections', () => {
      const content = `
First long paragraph that contains substantial content about a topic, with enough words to meet the minimum requirement for extraction and inclusion in the knowledge base system.

Second long paragraph that discusses another important aspect of the same or different topic, also containing sufficient content.
`;
      const units = atomizer.atomizeDocument(createDoc(content));
      expect(units.length).toBeGreaterThan(0);
    });

    it('filters out extremely short documents', () => {
      const content = `Short text`;
      const units = atomizer.atomizeDocument(createDoc(content));
      // Should have some fallback behavior or empty result
      expect(Array.isArray(units)).toBe(true);
    });
  });
});
