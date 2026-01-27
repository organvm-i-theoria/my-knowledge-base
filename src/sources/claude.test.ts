import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction, Mock } from 'vitest';
import { ClaudeSource } from './claude.js';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Browser, Page, BrowserContext } from 'playwright';

// Use .test-tmp for temporary test files
const TEST_TMP_DIR = join(process.cwd(), '.test-tmp', 'claude-source-test');

// Mock Playwright
vi.mock('playwright', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

describe('ClaudeSource', () => {
  let source: ClaudeSource;
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_TMP_DIR, { recursive: true });

    source = new ClaudeSource();

    // Reset mocks
    vi.clearAllMocks();

    // Get mock references
    const playwright = await import('playwright');
    mockBrowser = await (playwright.chromium.launch as Mock)();
    mockPage = await mockBrowser.newPage();
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }

    await source.close();
  });

  describe('Source Properties', () => {
    it('has correct id', () => {
      expect(source.id).toBe('claude');
    });

    it('has correct name', () => {
      expect(source.name).toBe('Claude.ai');
    });

    it('has correct type', () => {
      expect(source.type).toBe('chat');
    });
  });

  describe('init()', () => {
    it('launches browser with headless mode by default', async () => {
      const playwright = await import('playwright');

      await source.init({});

      expect(playwright.chromium.launch).toHaveBeenCalledWith({ headless: true });
    });

    it('launches browser in non-headless mode when specified', async () => {
      const playwright = await import('playwright');

      await source.init({ headless: false });

      expect(playwright.chromium.launch).toHaveBeenCalledWith({ headless: false });
    });

    it('navigates to claude.app for login', async () => {
      await source.init({});

      expect(mockPage.goto).toHaveBeenCalledWith('https://claude.app');
    });

    it('waits for successful login', async () => {
      await source.init({});

      expect(mockPage.waitForURL).toHaveBeenCalledWith(
        '**/claude.app/**',
        { timeout: 0 }
      );
    });
  });

  describe('listItems()', () => {
    beforeEach(async () => {
      await source.init({});
    });

    it('navigates to recents page', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      await source.listItems();

      expect(mockPage.goto).toHaveBeenCalledWith('https://claude.app/recents');
    });

    it('waits for network idle', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      await source.listItems();

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
    });

    it('returns empty array when no conversations found', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      const result = await source.listItems();

      expect(result).toEqual([]);
    });

    it('returns list of conversation references', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'First Chat', url: 'https://claude.app/chat/conv-1' },
        { id: 'conv-2', title: 'Second Chat', url: 'https://claude.app/chat/conv-2' },
      ];
      mockPage.evaluate.mockResolvedValue(mockConversations);

      const result = await source.listItems();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conv-1');
      expect(result[0].title).toBe('First Chat');
      expect(result[1].id).toBe('conv-2');
      expect(result[1].title).toBe('Second Chat');
    });

    it('extracts conversation IDs from URLs correctly', async () => {
      const mockConversations = [
        { id: 'abc-123-def', title: 'Test', url: 'https://claude.app/chat/abc-123-def' },
      ];
      mockPage.evaluate.mockResolvedValue(mockConversations);

      const result = await source.listItems();

      expect(result[0].id).toBe('abc-123-def');
    });
  });

  describe('exportItem()', () => {
    beforeEach(async () => {
      await source.init({});
    });

    it('navigates to conversation URL', async () => {
      mockPage.evaluate.mockResolvedValue({ messages: [], title: 'Test' });

      await source.exportItem('conv-123');

      expect(mockPage.goto).toHaveBeenCalledWith('https://claude.app/chat/conv-123');
    });

    it('waits for page to load completely', async () => {
      mockPage.evaluate.mockResolvedValue({ messages: [], title: 'Test' });

      await source.exportItem('conv-123');

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000);
    });

    it('returns conversation with correct structure', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [
          { role: 'user', content: 'Hello', timestamp: new Date() },
          { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
        ],
        title: 'Test Conversation',
      });

      const result = await source.exportItem('conv-123');

      expect(result.id).toBe('conv-123');
      expect(result.title).toBe('Test Conversation');
      expect(result.messages).toHaveLength(2);
      expect(result.url).toBe('https://claude.app/chat/conv-123');
    });

    it('handles empty conversations', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [],
        title: 'Empty Conversation',
      });

      const result = await source.exportItem('empty-conv');

      expect(result.messages).toHaveLength(0);
      expect(result.title).toBe('Empty Conversation');
    });

    it('preserves message roles correctly', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [
          { role: 'user', content: 'Question', timestamp: new Date() },
          { role: 'assistant', content: 'Answer', timestamp: new Date() },
          { role: 'user', content: 'Follow up', timestamp: new Date() },
        ],
        title: 'Multi-turn',
      });

      const result = await source.exportItem('multi-turn');

      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[2].role).toBe('user');
    });

    it('handles untitled conversations', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [{ role: 'user', content: 'Test' }],
        title: 'Untitled Conversation',
      });

      const result = await source.exportItem('untitled');

      expect(result.title).toBe('Untitled Conversation');
    });

    it('includes created date', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [],
        title: 'Test',
      });

      const before = new Date();
      const result = await source.exportItem('test');
      const after = new Date();

      expect(result.created.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.created.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('initializes empty artifacts array', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [],
        title: 'Test',
      });

      const result = await source.exportItem('test');

      expect(result.artifacts).toEqual([]);
    });
  });

  describe('exportAll()', () => {
    it('creates export directory if it does not exist', async () => {
      const exportPath = join(TEST_TMP_DIR, 'exports');
      mockPage.evaluate
        .mockResolvedValueOnce([]) // listItems returns empty
        .mockResolvedValueOnce({ messages: [], title: 'Test' }); // For any other calls

      await source.exportAll({ exportPath });

      expect(existsSync(exportPath)).toBe(true);
    });

    it('exports all conversations', async () => {
      const exportPath = join(TEST_TMP_DIR, 'exports');
      mkdirSync(exportPath, { recursive: true });

      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      let evaluateCallCount = 0;
      const exportMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) {
            return Promise.resolve([
              { id: 'conv-1', title: 'Conv 1', url: 'https://claude.app/chat/conv-1' },
              { id: 'conv-2', title: 'Conv 2', url: 'https://claude.app/chat/conv-2' },
            ]);
          } else {
            return Promise.resolve({
              messages: [{ role: 'user', content: `Hello ${evaluateCallCount - 1}` }],
              title: `Conv ${evaluateCallCount - 1}`,
            });
          }
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const exportMockBrowser = {
        newPage: vi.fn().mockResolvedValue(exportMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(exportMockBrowser);

      const exportSource = new ClaudeSource();
      const result = await exportSource.exportAll({ exportPath });

      expect(result).toHaveLength(2);
    });

    it('saves exported conversations to JSON files', async () => {
      // This test verifies the file saving logic - exportAll calls:
      // 1. init() - needs browser mock
      // 2. listItems() - needs page.evaluate to return conversation list
      // 3. exportItem() for each - needs page.evaluate to return message data
      // 4. writeFileSync for each
      // 5. close()

      const exportPath = join(TEST_TMP_DIR, 'exports');
      mkdirSync(exportPath, { recursive: true });

      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      // Track the evaluate calls to return different values
      let evaluateCallCount = 0;
      const saveMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) {
            // First call is from listItems
            return Promise.resolve([
              { id: 'save-test', title: 'Save Test', url: 'https://claude.app/chat/save-test' },
            ]);
          } else {
            // Subsequent calls are from exportItem
            return Promise.resolve({
              messages: [{ role: 'user', content: 'Saved content' }],
              title: 'Save Test',
            });
          }
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const saveMockBrowser = {
        newPage: vi.fn().mockResolvedValue(saveMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(saveMockBrowser);

      const saveSource = new ClaudeSource();
      await saveSource.exportAll({ exportPath });

      const savedFile = join(exportPath, 'save-test.json');
      expect(existsSync(savedFile)).toBe(true);

      const savedData = JSON.parse(readFileSync(savedFile, 'utf-8'));
      expect(savedData.id).toBe('save-test');
      expect(savedData.title).toBe('Save Test');
    });

    it('continues exporting when individual conversation fails', async () => {
      const exportPath = join(TEST_TMP_DIR, 'exports');
      mkdirSync(exportPath, { recursive: true });

      // This test verifies that exportAll continues even when one export fails
      // The source code catches errors per-conversation and continues
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const failMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn()
          .mockResolvedValueOnce([
            { id: 'success-1', title: 'Success 1', url: 'https://claude.app/chat/success-1' },
            { id: 'fail', title: 'Fail', url: 'https://claude.app/chat/fail' },
            { id: 'success-2', title: 'Success 2', url: 'https://claude.app/chat/success-2' },
          ])
          .mockResolvedValueOnce({ messages: [], title: 'Success 1' })
          .mockRejectedValueOnce(new Error('Export failed'))
          .mockResolvedValueOnce({ messages: [], title: 'Success 2' }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const failMockBrowser = {
        newPage: vi.fn().mockResolvedValue(failMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(failMockBrowser);

      const failSource = new ClaudeSource();
      const result = await failSource.exportAll({ exportPath });

      // Should still return the successful exports (at least 1)
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('uses default export path when not specified', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const defaultPathPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue([]), // listItems returns empty
        close: vi.fn().mockResolvedValue(undefined),
      };

      const defaultPathBrowser = {
        newPage: vi.fn().mockResolvedValue(defaultPathPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(defaultPathBrowser);

      const defaultSource = new ClaudeSource();
      await defaultSource.exportAll({});

      // The source should use ./raw/claude-app as default
      // This test verifies it doesn't throw when no path is given
    });

    it('closes browser after export completes', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const closePage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue([]), // listItems returns empty
        close: vi.fn().mockResolvedValue(undefined),
      };

      const closeBrowser = {
        newPage: vi.fn().mockResolvedValue(closePage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(closeBrowser);

      const closeSource = new ClaudeSource();
      await closeSource.exportAll({});

      expect(closeBrowser.close).toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('closes browser when initialized', async () => {
      await source.init({});

      await source.close();

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('does nothing when browser not initialized', async () => {
      // Don't call init
      await source.close();

      // Should not throw
    });

    it('can be called multiple times safely', async () => {
      await source.init({});

      await source.close();
      await source.close();
      await source.close();

      // Should not throw
    });
  });

  describe('Error Handling', () => {
    it('throws error when listItems called without init', async () => {
      await expect(source.listItems()).rejects.toThrow('Browser not initialized');
    });

    it('throws error when exportItem called without init', async () => {
      await expect(source.exportItem('any-id')).rejects.toThrow('Browser not initialized');
    });

    it('handles page evaluation errors gracefully', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const errorMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockRejectedValue(new Error('Page crashed')),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const errorMockBrowser = {
        newPage: vi.fn().mockResolvedValue(errorMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(errorMockBrowser);

      const errorSource = new ClaudeSource();
      await errorSource.init({});

      await expect(errorSource.listItems()).rejects.toThrow('Page crashed');
    });

    it('handles navigation timeout errors', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const timeoutMockPage = {
        goto: vi.fn().mockRejectedValue(new Error('Navigation timeout')),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const timeoutMockBrowser = {
        newPage: vi.fn().mockResolvedValue(timeoutMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(timeoutMockBrowser);

      const timeoutSource = new ClaudeSource();
      await expect(timeoutSource.init({})).rejects.toThrow('Navigation timeout');
    });
  });

  describe('Message Extraction', () => {
    // These tests verify the message extraction happens correctly via page.evaluate
    // Since the mocking is complex, we test via exportItem behavior

    it('extracts user messages correctly', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'What is the weather?', timestamp: new Date() },
          ],
          title: 'Weather Chat',
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('weather');

      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('What is the weather?');
    });

    it('extracts assistant messages correctly', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages: [
            { role: 'assistant', content: 'I can help with that!', timestamp: new Date() },
          ],
          title: 'Help Chat',
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('help');

      expect(result.messages[0].role).toBe('assistant');
      expect(result.messages[0].content).toBe('I can help with that!');
    });

    it('handles messages with special characters', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'Code: `const x = 1;` and math: $x^2$', timestamp: new Date() },
          ],
          title: 'Special Chars',
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('special');

      expect(result.messages[0].content).toContain('`const x = 1;`');
      expect(result.messages[0].content).toContain('$x^2$');
    });

    it('handles multiline messages', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages: [
            {
              role: 'user',
              content: 'Line 1\nLine 2\nLine 3',
              timestamp: new Date(),
            },
          ],
          title: 'Multiline',
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('multiline');

      expect(result.messages[0].content).toContain('Line 1');
      expect(result.messages[0].content).toContain('Line 2');
      expect(result.messages[0].content).toContain('Line 3');
    });

    it('preserves message order', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
        timestamp: new Date(),
      }));

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages,
          title: 'Long Chat',
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('long');

      expect(result.messages).toHaveLength(10);
      result.messages.forEach((msg, i) => {
        expect(msg.content).toBe(`Message ${i + 1}`);
      });
    });
  });

  describe('URL Construction', () => {
    it('constructs correct conversation URL', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({ messages: [], title: 'Test' }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('my-conversation-id');

      expect(result.url).toBe('https://claude.app/chat/my-conversation-id');
    });

    it('handles conversation IDs with special characters', async () => {
      const playwright = await import('playwright');
      const launch = playwright.chromium.launch as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        waitForURL: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({ messages: [], title: 'Test' }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testBrowser = {
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launch.mockResolvedValueOnce(testBrowser);

      const testSource = new ClaudeSource();
      await testSource.init({});
      const result = await testSource.exportItem('id-with-dashes-123');

      expect(result.url).toBe('https://claude.app/chat/id-with-dashes-123');
    });
  });
});
