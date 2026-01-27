import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { GeminiSource } from './gemini.js';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

// Use .test-tmp for temporary test files
const TEST_TMP_DIR = join(process.cwd(), '.test-tmp', 'gemini-source-test');

// Mock Playwright
vi.mock('playwright', () => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html></html>'),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    pages: vi.fn().mockReturnValue([mockPage]),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launchPersistentContext: vi.fn().mockResolvedValue(mockContext),
    },
  };
});

describe('GeminiSource', () => {
  let source: GeminiSource;
  let mockContext: any;
  let mockPage: any;

  beforeEach(async () => {
    // Clean up and create test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_TMP_DIR, { recursive: true });
    mkdirSync(join(TEST_TMP_DIR, 'raw', 'gemini'), { recursive: true });

    source = new GeminiSource();

    // Reset mocks
    vi.clearAllMocks();

    // Get mock references
    const playwright = await import('playwright');
    mockContext = await (playwright.chromium.launchPersistentContext as Mock)('', {});
    mockPage = mockContext.pages()[0];
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
      expect(source.id).toBe('gemini');
    });

    it('has correct name', () => {
      expect(source.name).toBe('Google Gemini');
    });

    it('has correct type', () => {
      expect(source.type).toBe('chat');
    });
  });

  describe('init()', () => {
    it('launches persistent browser context', async () => {
      const playwright = await import('playwright');

      await source.init({});

      expect(playwright.chromium.launchPersistentContext).toHaveBeenCalled();
    });

    it('launches browser with viewport settings', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const viewportMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const viewportMockContext = {
        pages: vi.fn().mockReturnValue([viewportMockPage]),
        newPage: vi.fn().mockResolvedValue(viewportMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(viewportMockContext);

      const viewportSource = new GeminiSource();
      await viewportSource.init({});

      const call = launchPersistentContext.mock.calls[launchPersistentContext.mock.calls.length - 1];
      expect(call[1]).toMatchObject({
        viewport: { width: 1280, height: 800 },
      });
    });

    it('launches browser in headless mode by default', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const headlessMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const headlessMockContext = {
        pages: vi.fn().mockReturnValue([headlessMockPage]),
        newPage: vi.fn().mockResolvedValue(headlessMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(headlessMockContext);

      const headlessSource = new GeminiSource();
      await headlessSource.init({});

      const call = launchPersistentContext.mock.calls[launchPersistentContext.mock.calls.length - 1];
      expect(call[1].headless).toBe(true);
    });

    it('launches browser in non-headless mode when specified', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      // Create a fresh source to test non-headless
      const nonHeadlessMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const nonHeadlessMockContext = {
        pages: vi.fn().mockReturnValue([nonHeadlessMockPage]),
        newPage: vi.fn().mockResolvedValue(nonHeadlessMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(nonHeadlessMockContext);

      const nonHeadlessSource = new GeminiSource();
      await nonHeadlessSource.init({ headless: false });

      const call = launchPersistentContext.mock.calls[launchPersistentContext.mock.calls.length - 1];
      expect(call[1].headless).toBe(false);
    });

    it('navigates to gemini.google.com/app', async () => {
      await source.init({});

      expect(mockPage.goto).toHaveBeenCalledWith('https://gemini.google.com/app');
    });

    it('waits for login detection', async () => {
      await source.init({});

      expect(mockPage.waitForFunction).toHaveBeenCalled();
    });
  });

  describe('listItems()', () => {
    beforeEach(async () => {
      await source.init({});
    });

    it('returns empty array when no conversations found', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      const result = await source.listItems();

      expect(result).toEqual([]);
    });

    it('returns list of conversation references', async () => {
      const mockConversations = [
        { id: 'conv-12345abcdef', title: 'First Gemini Chat', url: 'https://gemini.google.com/app/conv-12345abcdef' },
        { id: 'conv-67890ghijkl', title: 'Second Gemini Chat', url: 'https://gemini.google.com/app/conv-67890ghijkl' },
      ];
      mockPage.evaluate.mockResolvedValue(mockConversations);

      const result = await source.listItems();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conv-12345abcdef');
      expect(result[0].title).toBe('First Gemini Chat');
      expect(result[1].id).toBe('conv-67890ghijkl');
      expect(result[1].title).toBe('Second Gemini Chat');
    });

    it('takes debug screenshot', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      await source.listItems();

      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it('saves debug HTML when no conversations found', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.content.mockResolvedValue('<html><body>Test</body></html>');

      await source.listItems();

      expect(mockPage.content).toHaveBeenCalled();
    });
  });

  describe('exportItem()', () => {
    beforeEach(async () => {
      await source.init({});
    });

    it('navigates to conversation URL', async () => {
      mockPage.evaluate.mockResolvedValue({ messages: [], title: 'Test' });

      await source.exportItem('test-conv-123');

      expect(mockPage.goto).toHaveBeenCalledWith('https://gemini.google.com/app/test-conv-123');
    });

    it('waits for content to load', async () => {
      mockPage.evaluate.mockResolvedValue({ messages: [], title: 'Test' });

      await source.exportItem('test-conv');

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '.conversation-container, [role="main"]',
        { timeout: 15000 }
      );
    });

    it('returns conversation with correct structure', async () => {
      mockPage.evaluate.mockResolvedValue({
        messages: [
          { role: 'user', content: 'Hello Gemini' },
          { role: 'assistant', content: 'Hello! How can I help?' },
        ],
        title: 'Test Conversation',
      });

      const result = await source.exportItem('test-123');

      expect(result.id).toBe('test-123');
      expect(result.title).toBe('Test Conversation');
      expect(result.messages).toHaveLength(2);
      expect(result.url).toBe('https://gemini.google.com/app/test-123');
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

    it('handles selector timeout gracefully', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));
      mockPage.evaluate.mockResolvedValue({
        messages: [{ role: 'user', content: 'Test' }],
        title: 'Test',
      });

      // Should not throw
      const result = await source.exportItem('timeout-conv');

      expect(result.messages).toHaveLength(1);
    });

    it('takes debug screenshot', async () => {
      mockPage.evaluate.mockResolvedValue({ messages: [], title: 'Test' });

      await source.exportItem('debug-conv');

      expect(mockPage.screenshot).toHaveBeenCalled();
    });
  });

  describe('exportAll() - File-based Ingestion', () => {
    it('reads existing JSON files when available', async () => {
      const exportPath = join(TEST_TMP_DIR, 'raw', 'gemini');

      const conv1 = {
        id: 'gemini-1',
        title: 'Gemini Conversation 1',
        messages: [{ role: 'user', content: 'Hello' }],
        artifacts: [],
      };

      const conv2 = {
        id: 'gemini-2',
        title: 'Gemini Conversation 2',
        messages: [{ role: 'user', content: 'Hi' }],
        artifacts: [],
      };

      writeFileSync(join(exportPath, 'conv1.json'), JSON.stringify(conv1));
      writeFileSync(join(exportPath, 'conv2.json'), JSON.stringify(conv2));

      // Don't pass headless option - this triggers file-based ingestion
      const result = await source.exportAll({ exportPath });

      expect(result).toHaveLength(2);
    });

    it('uses default path ./raw/gemini when not specified', async () => {
      // When no files exist and headless is undefined, it should try to read from default path
      const result = await source.exportAll({});

      // With no files at default path, it should start the crawler
      // But since we're mocking, it will just return empty
      expect(Array.isArray(result)).toBe(true);
    });

    it('only reads .json files', async () => {
      const exportPath = join(TEST_TMP_DIR, 'raw', 'gemini');

      const validConv = {
        id: 'valid',
        title: 'Valid',
        messages: [],
        artifacts: [],
      };

      writeFileSync(join(exportPath, 'valid.json'), JSON.stringify(validConv));
      writeFileSync(join(exportPath, 'invalid.txt'), 'not json');
      writeFileSync(join(exportPath, 'readme.md'), '# Readme');

      const result = await source.exportAll({ exportPath });

      expect(result).toHaveLength(1);
    });

    it('handles invalid JSON files gracefully', async () => {
      const exportPath = join(TEST_TMP_DIR, 'raw', 'gemini');

      const validConv = {
        id: 'valid',
        title: 'Valid',
        messages: [],
        artifacts: [],
      };

      writeFileSync(join(exportPath, 'valid.json'), JSON.stringify(validConv));
      writeFileSync(join(exportPath, 'invalid.json'), 'not valid json {');

      const result = await source.exportAll({ exportPath });

      // Should still return the valid one
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid');
    });
  });

  describe('exportAll() - Crawler Mode', () => {
    it('exports all conversations via crawler', async () => {
      const exportPath = join(TEST_TMP_DIR, 'crawler-exports');
      mkdirSync(exportPath, { recursive: true });

      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      let evaluateCallCount = 0;
      const crawlerMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) {
            return Promise.resolve([
              { id: 'gem-conv-1', title: 'Conv 1', url: 'https://gemini.google.com/app/gem-conv-1' },
            ]);
          } else {
            return Promise.resolve({
              messages: [{ role: 'user', content: 'Hello Gemini' }],
              title: 'Conv 1',
            });
          }
        }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const crawlerMockContext = {
        pages: vi.fn().mockReturnValue([crawlerMockPage]),
        newPage: vi.fn().mockResolvedValue(crawlerMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(crawlerMockContext);

      const crawlerSource = new GeminiSource();
      // Pass headless explicitly to trigger crawler mode
      const result = await crawlerSource.exportAll({ exportPath, headless: true });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gem-conv-1');
    });

    it('saves exported conversations to JSON files', async () => {
      const exportPath = join(TEST_TMP_DIR, 'save-exports');
      mkdirSync(exportPath, { recursive: true });

      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      let evaluateCallCount = 0;
      const saveMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) {
            return Promise.resolve([
              { id: 'save-gem-test', title: 'Save Test', url: 'https://gemini.google.com/app/save-gem-test' },
            ]);
          } else {
            return Promise.resolve({
              messages: [{ role: 'user', content: 'Saved content' }],
              title: 'Save Test',
            });
          }
        }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const saveMockContext = {
        pages: vi.fn().mockReturnValue([saveMockPage]),
        newPage: vi.fn().mockResolvedValue(saveMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(saveMockContext);

      const saveSource = new GeminiSource();
      await saveSource.exportAll({ exportPath, headless: true });

      const savedFile = join(exportPath, 'save-gem-test.json');
      expect(existsSync(savedFile)).toBe(true);

      const savedData = JSON.parse(readFileSync(savedFile, 'utf-8'));
      expect(savedData.id).toBe('save-gem-test');
      expect(savedData.title).toBe('Save Test');
    });

    it('continues exporting when individual conversation fails', async () => {
      const exportPath = join(TEST_TMP_DIR, 'fail-exports');
      mkdirSync(exportPath, { recursive: true });

      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      let evaluateCallCount = 0;
      const failMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation(() => {
          evaluateCallCount++;
          if (evaluateCallCount === 1) {
            return Promise.resolve([
              { id: 'success-1', title: 'Success 1', url: 'https://gemini.google.com/app/success-1' },
              { id: 'fail', title: 'Fail', url: 'https://gemini.google.com/app/fail' },
              { id: 'success-2', title: 'Success 2', url: 'https://gemini.google.com/app/success-2' },
            ]);
          } else if (evaluateCallCount === 3) {
            // Second exportItem call fails
            return Promise.reject(new Error('Export failed'));
          } else {
            return Promise.resolve({
              messages: [],
              title: `Conv ${evaluateCallCount - 1}`,
            });
          }
        }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const failMockContext = {
        pages: vi.fn().mockReturnValue([failMockPage]),
        newPage: vi.fn().mockResolvedValue(failMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(failMockContext);

      const failSource = new GeminiSource();
      const result = await failSource.exportAll({ exportPath, headless: true });

      // Should return at least one successful export
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('closes context after export completes', async () => {
      const exportPath = join(TEST_TMP_DIR, 'close-exports');
      mkdirSync(exportPath, { recursive: true });

      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const closeMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue([]),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const closeMockContext = {
        pages: vi.fn().mockReturnValue([closeMockPage]),
        newPage: vi.fn().mockResolvedValue(closeMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(closeMockContext);

      const closeSource = new GeminiSource();
      await closeSource.exportAll({ exportPath, headless: true });

      expect(closeMockContext.close).toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('closes context when initialized', async () => {
      await source.init({});

      await source.close();

      expect(mockContext.close).toHaveBeenCalled();
    });

    it('does nothing when context not initialized', async () => {
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

    it('handles login timeout', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const timeoutMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://accounts.google.com/login'),
        waitForFunction: vi.fn().mockRejectedValue(new Error('Timeout')),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const timeoutMockContext = {
        pages: vi.fn().mockReturnValue([timeoutMockPage]),
        newPage: vi.fn().mockResolvedValue(timeoutMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(timeoutMockContext);

      const timeoutSource = new GeminiSource();

      // Should throw because URL doesn't include gemini.google.com/app
      await expect(timeoutSource.init({})).rejects.toThrow('Failed to detect logged-in state');
    });

    it('continues when login timeout but app is detected', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const appMockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockRejectedValue(new Error('Timeout')),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const appMockContext = {
        pages: vi.fn().mockReturnValue([appMockPage]),
        newPage: vi.fn().mockResolvedValue(appMockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(appMockContext);

      const appSource = new GeminiSource();

      // Should NOT throw because URL includes gemini.google.com/app
      await expect(appSource.init({})).resolves.not.toThrow();
    });
  });

  describe('Message Extraction', () => {
    it('extracts user messages correctly', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages: [
            { role: 'user', content: 'What is machine learning?' },
          ],
          title: 'ML Chat',
        }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testContext = {
        pages: vi.fn().mockReturnValue([testPage]),
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(testContext);

      const testSource = new GeminiSource();
      await testSource.init({});
      const result = await testSource.exportItem('ml-chat');

      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('What is machine learning?');
    });

    it('extracts assistant messages correctly', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages: [
            { role: 'assistant', content: 'ML is a subset of artificial intelligence...' },
          ],
          title: 'ML Response',
        }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testContext = {
        pages: vi.fn().mockReturnValue([testPage]),
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(testContext);

      const testSource = new GeminiSource();
      await testSource.init({});
      const result = await testSource.exportItem('ml-response');

      expect(result.messages[0].role).toBe('assistant');
      expect(result.messages[0].content).toContain('ML is a subset');
    });

    it('preserves message order', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const messages = Array.from({ length: 6 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i + 1}`,
      }));

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          messages,
          title: 'Multi-turn',
        }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testContext = {
        pages: vi.fn().mockReturnValue([testPage]),
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(testContext);

      const testSource = new GeminiSource();
      await testSource.init({});
      const result = await testSource.exportItem('multi-turn');

      expect(result.messages).toHaveLength(6);
      result.messages.forEach((msg, i) => {
        expect(msg.content).toBe(`Message ${i + 1}`);
      });
    });
  });

  describe('URL Construction', () => {
    it('constructs correct conversation URL', async () => {
      const playwright = await import('playwright');
      const launchPersistentContext = playwright.chromium.launchPersistentContext as Mock;

      const testPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({ messages: [], title: 'Test' }),
        screenshot: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const testContext = {
        pages: vi.fn().mockReturnValue([testPage]),
        newPage: vi.fn().mockResolvedValue(testPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      launchPersistentContext.mockResolvedValueOnce(testContext);

      const testSource = new GeminiSource();
      await testSource.init({});
      const result = await testSource.exportItem('my-gemini-conversation-id');

      expect(result.url).toBe('https://gemini.google.com/app/my-gemini-conversation-id');
    });
  });
});
