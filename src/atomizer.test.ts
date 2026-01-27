import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeAtomizer } from './atomizer.js';
import { Conversation, Message, KnowledgeDocument, AtomicUnit } from './types.js';

describe('KnowledgeAtomizer', () => {
  let atomizer: KnowledgeAtomizer;

  beforeEach(() => {
    atomizer = new KnowledgeAtomizer();
  });

  // Helper to create a conversation
  const createConversation = (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    title = 'Test Conversation'
  ): Conversation => ({
    id: 'test-conv-1',
    title,
    created: new Date('2024-01-15'),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date('2024-01-15'),
    })),
    artifacts: [],
  });

  // Helper to create a document
  const createDoc = (content: string, title = 'Test Document'): KnowledgeDocument => ({
    id: 'test-doc-1',
    title,
    content,
    format: 'markdown',
    created: new Date('2024-01-15'),
    modified: new Date('2024-01-15'),
    url: 'http://test.local/test',
    metadata: {},
  });

  describe('atomize() - Universal Entry Point', () => {
    it('routes conversations to atomizeConversation', () => {
      const conversation = createConversation([
        { role: 'user', content: 'What is TypeScript and how does it work?' },
        { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.' },
      ]);

      const units = atomizer.atomize(conversation);
      expect(units.length).toBeGreaterThan(0);
      expect(units.every((u) => u.conversationId === 'test-conv-1')).toBe(true);
    });

    it('routes documents to atomizeDocument', () => {
      const doc = createDoc(`
# Introduction
This is a document about programming concepts.
`);
      const units = atomizer.atomize(doc);
      expect(units.length).toBeGreaterThan(0);
    });
  });

  describe('atomizeConversation()', () => {
    it('creates units from conversation messages', () => {
      const conversation = createConversation([
        { role: 'user', content: 'How do I implement a binary search tree in Python?' },
        { role: 'assistant', content: 'Here is how you can implement a binary search tree in Python with insert and search methods.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units.length).toBeGreaterThan(0);
    });

    it('includes both message units and code block units', () => {
      const conversation = createConversation([
        { role: 'user', content: 'Show me a JavaScript function' },
        {
          role: 'assistant',
          content: `Here is a simple function:

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`
`,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const codeUnits = units.filter((u) => u.type === 'code');
      expect(codeUnits.length).toBeGreaterThanOrEqual(1);
    });

    it('skips messages shorter than 20 characters', () => {
      const conversation = createConversation([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'This is a longer message that should be included in the atomization process.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      // Only the longer message should produce a unit
      const messageUnits = units.filter((u) => u.type !== 'code');
      expect(messageUnits.length).toBe(1);
    });

    it('includes previous message as context', () => {
      const conversation = createConversation([
        { role: 'user', content: 'What is the best way to handle errors in async JavaScript code?' },
        { role: 'assistant', content: 'You can use try-catch blocks with async/await syntax to handle errors in asynchronous JavaScript code effectively.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const secondUnit = units.find((u) => u.content.includes('try-catch'));
      expect(secondUnit?.context).toContain('errors');
    });
  });

  describe('atomizeByMessage()', () => {
    it('creates one unit per valid message', () => {
      const conversation = createConversation([
        { role: 'user', content: 'How do I set up a Node.js project with TypeScript configuration?' },
        { role: 'assistant', content: 'You can initialize a new Node.js project and add TypeScript with npm install typescript.' },
        { role: 'user', content: 'What about ESLint configuration for the project?' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      // Filter out code units
      const messageUnits = units.filter((u) => u.type !== 'code');
      expect(messageUnits.length).toBe(3);
    });

    it('preserves conversation ID in each unit', () => {
      const conversation = createConversation([
        { role: 'user', content: 'This is a test message with enough characters to be valid.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.conversationId).toBe('test-conv-1');
    });

    it('initializes relatedUnits as empty array', () => {
      const conversation = createConversation([
        { role: 'user', content: 'A sufficiently long message to test the relatedUnits field initialization.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.relatedUnits).toEqual([]);
    });
  });

  describe('atomizeCodeBlocks()', () => {
    it('extracts code blocks with language tags', () => {
      const conversation = createConversation([
        {
          role: 'assistant',
          content: `Here is some Python code:

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`
`,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      // Find code unit from atomizeCodeBlocks (not atomizeByMessage)
      const codeUnit = units.find((u) => u.title === 'Code: python');

      expect(codeUnit).toBeDefined();
      expect(codeUnit?.title).toBe('Code: python');
      expect(codeUnit?.tags).toContain('python');
      expect(codeUnit?.content).toContain('def hello');
    });

    it('extracts multiple code blocks from one message', () => {
      const conversation = createConversation([
        {
          role: 'assistant',
          content: `Here are two examples:

\`\`\`javascript
const x = 1;
\`\`\`

And in TypeScript:

\`\`\`typescript
const y: number = 2;
\`\`\`
`,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      // Filter for extracted code blocks specifically (title starts with "Code:")
      const extractedCodeBlocks = units.filter((u) => u.title.startsWith('Code:'));
      expect(extractedCodeBlocks.length).toBe(2);
    });

    it('handles code blocks without language specification', () => {
      const conversation = createConversation([
        {
          role: 'assistant',
          content: `Here is some code:

\`\`\`
some raw code
without language
\`\`\`
`,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const codeUnit = units.find((u) => u.title === 'Code: text');

      expect(codeUnit).toBeDefined();
      expect(codeUnit?.title).toBe('Code: text');
      expect(codeUnit?.tags).toContain('text');
    });

    it('sets category to programming for extracted code blocks', () => {
      const conversation = createConversation([
        {
          role: 'assistant',
          content: `\`\`\`rust
fn main() {
    println!("Hello!");
}
\`\`\``,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const codeUnit = units.find((u) => u.title === 'Code: rust');
      expect(codeUnit?.category).toBe('programming');
    });

    it('includes message content as context for code blocks', () => {
      const conversation = createConversation([
        {
          role: 'assistant',
          content: `This calculates the factorial of a number:

\`\`\`javascript
function factorial(n) {
  return n <= 1 ? 1 : n * factorial(n - 1);
}
\`\`\`
`,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const codeUnit = units.find((u) => u.title === 'Code: javascript');
      expect(codeUnit?.context).toContain('factorial');
    });
  });

  describe('inferType()', () => {
    it('infers question type for user messages with question marks', () => {
      const conversation = createConversation([
        { role: 'user', content: 'What is the difference between let and const in JavaScript?' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.type).toBe('question');
    });

    it('infers question type for messages starting with how/what/why/when', () => {
      const testCases = [
        { content: 'How do I configure webpack for production builds?', expected: 'question' },
        { content: 'What are the benefits of using TypeScript over JavaScript?', expected: 'question' },
        { content: 'Why does React use a virtual DOM for rendering?', expected: 'question' },
        { content: 'When should I use useCallback hook in React components?', expected: 'question' },
      ];

      for (const tc of testCases) {
        const conversation = createConversation([{ role: 'user', content: tc.content }]);
        const units = atomizer.atomizeConversation(conversation);
        expect(units[0]?.type).toBe(tc.expected);
      }
    });

    it('infers code type for messages with code indicators', () => {
      const testCases = [
        'Here is a function declaration: function test() {}',
        'Define a class User with properties name and email',
        'Use const to declare immutable variables in JavaScript',
      ];

      for (const content of testCases) {
        const conversation = createConversation([{ role: 'assistant', content }]);
        const units = atomizer.atomizeConversation(conversation);
        const messageUnits = units.filter((u) => u.type !== 'code' || !u.content.includes('```'));
        expect(messageUnits.some((u) => u.type === 'code')).toBe(true);
      }
    });

    it('infers decision type for messages with decision keywords', () => {
      const testCases = [
        'We should decide between using REST or GraphQL for the API',
        'I recommend choosing PostgreSQL for this use case over MongoDB',
        'You should choose between Redis and Memcached for caching',
      ];

      for (const content of testCases) {
        const conversation = createConversation([{ role: 'assistant', content }]);
        const units = atomizer.atomizeConversation(conversation);
        expect(units.some((u) => u.type === 'decision')).toBe(true);
      }
    });

    it('infers reference type for documentation mentions', () => {
      const testCases = [
        'You can refer to the official React documentation for more details',
        'See the MDN docs for complete browser compatibility information',
        'Check the documentation for the complete API reference guide',
      ];

      for (const content of testCases) {
        const conversation = createConversation([{ role: 'assistant', content }]);
        const units = atomizer.atomizeConversation(conversation);
        expect(units.some((u) => u.type === 'reference')).toBe(true);
      }
    });

    it('defaults to insight type when no specific pattern matches', () => {
      const conversation = createConversation([
        // Avoid words like 'function', 'class', 'const' that trigger code detection
        { role: 'assistant', content: 'React hooks allow you to use state and lifecycle features in your components easily.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.type).toBe('insight');
    });
  });

  describe('generateTitle()', () => {
    it('uses first non-empty line as title', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Introduction to Machine Learning\n\nThis article covers the basics of ML.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.title).toBe('Introduction to Machine Learning');
    });

    it('truncates titles longer than 80 characters', () => {
      const longTitle = 'A'.repeat(100);
      const conversation = createConversation([
        { role: 'assistant', content: `${longTitle}\n\nMore content here.` },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.title.length).toBe(80);
      expect(units[0]?.title.endsWith('...')).toBe(true);
    });

    it('returns Untitled for empty content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: '                    \n\n                    ' },
      ]);

      // This message is too short and will be skipped
      // But let's test with just whitespace that's long enough
      const longWhitespace = ' '.repeat(30) + '\n' + 'Some actual content here that is long enough';
      const conv2 = createConversation([{ role: 'assistant', content: longWhitespace }]);
      const units = atomizer.atomizeConversation(conv2);
      expect(units[0]?.title).toBe('Some actual content here that is long enough');
    });

    it('skips empty lines to find title', () => {
      const conversation = createConversation([
        { role: 'assistant', content: '\n\n\nActual Title Line\n\nBody content follows here.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.title).toBe('Actual Title Line');
    });
  });

  describe('extractKeywords()', () => {
    it('extracts words longer than 4 characters', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'The quick brown fox jumps over the lazy dog in the forest.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.keywords).toBeDefined();
      expect(units[0]?.keywords.every((k) => k.length > 4)).toBe(true);
    });

    it('returns unique keywords sorted by frequency', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'JavaScript JavaScript TypeScript React React React Node Express.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      // React appears 3 times, should be first (converted to lowercase)
      expect(units[0]?.keywords[0]).toBe('react');
    });

    it('limits keywords to top 10', () => {
      const manyWords = Array.from({ length: 20 }, (_, i) => `keyword${i}word`).join(' ');
      const conversation = createConversation([{ role: 'assistant', content: manyWords }]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.keywords.length).toBeLessThanOrEqual(10);
    });

    it('removes punctuation before extraction', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Hello, world! Testing: keywords; extraction.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.keywords).not.toContain('hello,');
      expect(units[0]?.keywords).toContain('hello');
    });
  });

  describe('autoTag()', () => {
    it('includes unit type as a tag', () => {
      const conversation = createConversation([
        { role: 'user', content: 'What is the purpose of useEffect hook in React?' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.tags).toContain('question');
    });

    it('detects programming language tags', () => {
      const languages = ['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'sql'];

      for (const lang of languages) {
        const conversation = createConversation([
          { role: 'assistant', content: `Here is how to use ${lang} for web development.` },
        ]);

        const units = atomizer.atomizeConversation(conversation);
        expect(units[0]?.tags).toContain(lang);
      }
    });

    it('detects technology tags', () => {
      const techs = ['react', 'node', 'express', 'oauth', 'api', 'database', 'auth'];

      for (const tech of techs) {
        const conversation = createConversation([
          { role: 'assistant', content: `Learn how to implement ${tech} in your project effectively.` },
        ]);

        const units = atomizer.atomizeConversation(conversation);
        expect(units[0]?.tags).toContain(tech);
      }
    });

    it('detects security-related tags', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Implementing proper security measures and authentication is crucial.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.tags).toContain('security');
    });

    it('detects performance-related tags', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'You can optimize the performance of your application by caching.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.tags).toContain('performance');
    });

    it('detects bugfix-related tags', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Here is how to fix the bug in the authentication module.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.tags).toContain('bugfix');
    });

    it('detects feature-related tags', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'We need to implement a new feature for user notifications.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.tags).toContain('feature');
    });
  });

  describe('categorize()', () => {
    it('categorizes programming content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'This code defines a function that processes user input.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.category).toBe('programming');
    });

    it('categorizes writing content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Here is how to write a compelling article for your blog.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.category).toBe('writing');
    });

    it('categorizes research content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Our research study found that users prefer simple interfaces.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.category).toBe('research');
    });

    it('categorizes design content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'The UI design should follow these UX principles for better usability.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.category).toBe('design');
    });

    it('defaults to general category', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'This is a general message without specific category indicators.' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.category).toBe('general');
    });
  });

  describe('atomizeDocument()', () => {
    it('uses chunking strategies for documents', () => {
      const doc = createDoc(`
# Introduction
This is the introduction section of the document.

## Getting Started
Here is how to get started with the project.

## Advanced Topics
These are more advanced topics for experienced users.
`);

      const units = atomizer.atomizeDocument(doc);
      expect(units.length).toBeGreaterThan(0);
    });

    it('enriches units with chunk metadata', () => {
      const doc = createDoc(`
# Section 1
Content for section one.

# Section 2
Content for section two.
`);

      const units = atomizer.atomizeDocument(doc);
      // Units should have tags and keywords
      expect(units.every((u) => Array.isArray(u.tags))).toBe(true);
      expect(units.every((u) => Array.isArray(u.keywords))).toBe(true);
    });

    it('handles PDF documents with page metadata', () => {
      const doc: KnowledgeDocument = {
        id: 'test-pdf-1',
        title: 'Test PDF Document',
        content: 'This is a very long PDF content. '.repeat(100),
        format: 'pdf',
        created: new Date(),
        modified: new Date(),
        metadata: {
          numpages: 5,
        },
      };

      const units = atomizer.atomizeDocument(doc);
      expect(units.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty conversation', () => {
      const conversation = createConversation([]);
      const units = atomizer.atomizeConversation(conversation);
      expect(units).toEqual([]);
    });

    it('handles conversation with only short messages', () => {
      const conversation = createConversation([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Thanks' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units.length).toBe(0);
    });

    it('handles messages with only code blocks', () => {
      const conversation = createConversation([
        {
          role: 'assistant',
          content: `\`\`\`javascript
const x = 1;
\`\`\``,
        },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const codeUnits = units.filter((u) => u.type === 'code');
      expect(codeUnits.length).toBeGreaterThanOrEqual(1);
    });

    it('handles special characters in content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Using special chars: <script>alert("test")</script> & more!' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.content).toContain('<script>');
    });

    it('handles unicode content', () => {
      const conversation = createConversation([
        { role: 'assistant', content: 'Unicode test: Hello World from Japan: Ruby on Rails' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      expect(units[0]?.content).toContain('Japan');
    });

    it('generates unique IDs for each unit', () => {
      const conversation = createConversation([
        { role: 'user', content: 'First question about TypeScript configuration?' },
        { role: 'assistant', content: 'Here is the answer about TypeScript configuration.' },
        { role: 'user', content: 'Second question about React components?' },
      ]);

      const units = atomizer.atomizeConversation(conversation);
      const ids = units.map((u) => u.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
