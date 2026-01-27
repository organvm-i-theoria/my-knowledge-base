import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatGPTSource } from './chatgpt.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

// Use .test-tmp for temporary test files
const TEST_TMP_DIR = join(process.cwd(), '.test-tmp', 'chatgpt-source-test');

describe('ChatGPTSource', () => {
  let source: ChatGPTSource;

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_TMP_DIR, { recursive: true });

    source = new ChatGPTSource();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
  });

  describe('Source Properties', () => {
    it('has correct id', () => {
      expect(source.id).toBe('chatgpt');
    });

    it('has correct name', () => {
      expect(source.name).toBe('ChatGPT');
    });

    it('has correct type', () => {
      expect(source.type).toBe('chat');
    });
  });

  describe('exportAll() - Path Handling', () => {
    it('returns empty array when export path does not exist', async () => {
      const result = await source.exportAll({ exportPath: '/non/existent/path' });
      expect(result).toEqual([]);
    });

    it('uses default path ./raw/chatgpt when not specified', async () => {
      // Default path won't exist in test environment
      const result = await source.exportAll();
      expect(result).toEqual([]);
    });

    it('reads JSON files from export path', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test Conversation',
        created: new Date().toISOString(),
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conversation1.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(1);
    });

    it('only reads .json files', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'valid.json'), JSON.stringify(conversation));
      writeFileSync(join(TEST_TMP_DIR, 'invalid.txt'), 'not json');
      writeFileSync(join(TEST_TMP_DIR, 'readme.md'), '# Readme');

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(1);
    });
  });

  describe('Conversation Parsing', () => {
    it('parses single conversation file', async () => {
      const conversation = {
        id: 'conv-123',
        title: 'My Conversation',
        created: new Date('2024-01-15').toISOString(),
        messages: [
          { role: 'user', content: 'What is TypeScript?' },
          { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result[0].id).toBe('conv-123');
      expect(result[0].title).toBe('My Conversation');
    });

    it('parses multiple conversation files', async () => {
      const conv1 = {
        id: 'conv-1',
        title: 'Conversation 1',
        messages: [{ role: 'user', content: 'Hello' }],
        artifacts: [],
      };

      const conv2 = {
        id: 'conv-2',
        title: 'Conversation 2',
        messages: [{ role: 'user', content: 'Hi' }],
        artifacts: [],
      };

      const conv3 = {
        id: 'conv-3',
        title: 'Conversation 3',
        messages: [{ role: 'user', content: 'Hey' }],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv1.json'), JSON.stringify(conv1));
      writeFileSync(join(TEST_TMP_DIR, 'conv2.json'), JSON.stringify(conv2));
      writeFileSync(join(TEST_TMP_DIR, 'conv3.json'), JSON.stringify(conv3));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(3);
    });

    it('preserves conversation structure', async () => {
      const conversation = {
        id: 'conv-full',
        title: 'Full Conversation',
        created: new Date('2024-01-15'),
        url: 'https://chat.openai.com/c/conv-full',
        messages: [
          { role: 'user', content: 'First message', timestamp: new Date('2024-01-15T10:00:00Z') },
          { role: 'assistant', content: 'First response', timestamp: new Date('2024-01-15T10:01:00Z') },
          { role: 'user', content: 'Second message', timestamp: new Date('2024-01-15T10:02:00Z') },
        ],
        artifacts: [
          {
            id: 'artifact-1',
            type: 'code',
            language: 'javascript',
            content: 'const x = 1;',
          },
        ],
      };

      writeFileSync(join(TEST_TMP_DIR, 'full.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result[0]).toMatchObject({
        id: 'conv-full',
        title: 'Full Conversation',
      });
    });
  });

  describe('Message Extraction', () => {
    it('extracts user messages', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [
          { role: 'user', content: 'User message 1' },
          { role: 'assistant', content: 'Assistant response' },
          { role: 'user', content: 'User message 2' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      const messages = (result[0] as any).messages;

      const userMessages = messages.filter((m: any) => m.role === 'user');
      expect(userMessages.length).toBe(2);
    });

    it('extracts assistant messages', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [
          { role: 'user', content: 'Question' },
          { role: 'assistant', content: 'Answer 1' },
          { role: 'user', content: 'Follow up' },
          { role: 'assistant', content: 'Answer 2' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      const messages = (result[0] as any).messages;

      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      expect(assistantMessages.length).toBe(2);
    });

    it('preserves message order', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Message 2' },
          { role: 'user', content: 'Message 3' },
          { role: 'assistant', content: 'Message 4' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      const messages = (result[0] as any).messages;

      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
      expect(messages[2].content).toBe('Message 3');
      expect(messages[3].content).toBe('Message 4');
    });

    it('handles empty messages array', async () => {
      const conversation = {
        id: 'conv-empty',
        title: 'Empty Conversation',
        messages: [],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'empty.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).messages).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('handles invalid JSON gracefully', async () => {
      writeFileSync(join(TEST_TMP_DIR, 'invalid.json'), 'not valid json {{{');

      // Should log error but continue processing
      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(0);
    });

    it('continues processing after single file error', async () => {
      const validConv = {
        id: 'valid-conv',
        title: 'Valid',
        messages: [{ role: 'user', content: 'Hello' }],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'valid.json'), JSON.stringify(validConv));
      writeFileSync(join(TEST_TMP_DIR, 'invalid.json'), 'broken json');

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('valid-conv');
    });

    it('handles empty JSON file', async () => {
      writeFileSync(join(TEST_TMP_DIR, 'empty.json'), '');

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(0);
    });

    it('handles JSON with null content', async () => {
      writeFileSync(join(TEST_TMP_DIR, 'null.json'), 'null');

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      // Behavior depends on implementation - may throw or return empty
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Artifacts Handling', () => {
    it('preserves artifacts array', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [{ role: 'assistant', content: 'Here is code' }],
        artifacts: [
          {
            id: 'art-1',
            type: 'code',
            language: 'javascript',
            content: 'console.log("hello");',
          },
        ],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).artifacts.length).toBe(1);
    });

    it('handles multiple artifacts', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [{ role: 'assistant', content: 'Multiple artifacts' }],
        artifacts: [
          { id: 'art-1', type: 'code', language: 'javascript', content: 'const x = 1;' },
          { id: 'art-2', type: 'code', language: 'python', content: 'x = 1' },
          { id: 'art-3', type: 'markdown', content: '# Title' },
        ],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).artifacts.length).toBe(3);
    });

    it('handles conversations without artifacts', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [{ role: 'user', content: 'No artifacts here' }],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      // Should handle missing artifacts gracefully
      expect(result.length).toBe(1);
    });
  });

  describe('Date Handling', () => {
    it('preserves created date from JSON', async () => {
      const createdDate = '2024-01-15T10:30:00.000Z';
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        created: createdDate,
        messages: [],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).created).toBe(createdDate);
    });

    it('handles missing created date', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(1);
    });
  });

  describe('Large Conversations', () => {
    it('handles conversation with many messages', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message number ${i + 1}`,
      }));

      const conversation = {
        id: 'conv-large',
        title: 'Large Conversation',
        messages,
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'large.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).messages.length).toBe(100);
    });

    it('handles very long message content', async () => {
      const longContent = 'A'.repeat(10000);
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [
          { role: 'user', content: longContent },
          { role: 'assistant', content: longContent },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'conv.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).messages[0].content.length).toBe(10000);
    });
  });

  describe('Unicode and Special Characters', () => {
    it('handles unicode in messages', async () => {
      const conversation = {
        id: 'conv-unicode',
        title: 'Unicode Test: Hello',
        messages: [
          { role: 'user', content: 'Hello from Japan: Japanese' },
          { role: 'assistant', content: 'Response with special chars' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'unicode.json'), JSON.stringify(conversation), 'utf-8');

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).title).toContain('Unicode Test');
    });

    it('handles special characters in content', async () => {
      const conversation = {
        id: 'conv-special',
        title: 'Special Chars',
        messages: [
          { role: 'user', content: '<script>alert("xss")</script>' },
          { role: 'assistant', content: 'HTML entities: &amp; &lt; &gt;' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'special.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).messages[0].content).toContain('<script>');
    });

    it('handles newlines and whitespace', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [
          { role: 'user', content: 'Line 1\nLine 2\n\nLine 3' },
          { role: 'assistant', content: '\t\tTabbed content\n\n\n' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'whitespace.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect((result[0] as any).messages[0].content).toContain('\n');
    });
  });

  describe('File System Edge Cases', () => {
    it('handles directory with only non-JSON files', async () => {
      writeFileSync(join(TEST_TMP_DIR, 'readme.md'), '# README');
      writeFileSync(join(TEST_TMP_DIR, 'notes.txt'), 'Some notes');
      writeFileSync(join(TEST_TMP_DIR, 'data.xml'), '<data></data>');

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(0);
    });

    it('handles empty directory', async () => {
      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(0);
    });

    it('handles files with .json in name but not extension', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        artifacts: [],
      };

      // These should not be picked up
      writeFileSync(join(TEST_TMP_DIR, 'json-backup.txt'), JSON.stringify(conversation));
      writeFileSync(join(TEST_TMP_DIR, 'data.json.bak'), JSON.stringify(conversation));

      // This should be picked up
      writeFileSync(join(TEST_TMP_DIR, 'valid.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(1);
    });
  });

  describe('ChatGPT Export Format Compatibility', () => {
    it('handles standard ChatGPT export format', async () => {
      // Simulating actual ChatGPT export structure
      const chatGptExport = {
        id: '8f7a1234-5678-90ab-cdef-1234567890ab',
        title: 'React Component Help',
        create_time: 1705320000,
        update_time: 1705320300,
        messages: [
          {
            role: 'user',
            content: 'How do I create a React component?',
            timestamp: '2024-01-15T10:00:00Z',
          },
          {
            role: 'assistant',
            content: 'You can create a React component using either a function or class.',
            timestamp: '2024-01-15T10:00:05Z',
          },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'export.json'), JSON.stringify(chatGptExport));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('8f7a1234-5678-90ab-cdef-1234567890ab');
    });

    it('handles system messages if present', async () => {
      const conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
        artifacts: [],
      };

      writeFileSync(join(TEST_TMP_DIR, 'system.json'), JSON.stringify(conversation));

      const result = await source.exportAll({ exportPath: TEST_TMP_DIR });
      const messages = (result[0] as any).messages;
      expect(messages.length).toBe(3);
      expect(messages[0].role).toBe('system');
    });
  });
});
