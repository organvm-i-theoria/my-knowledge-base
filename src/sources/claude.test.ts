import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { ClaudeSource } from './claude.js';

const TEST_TMP_DIR = join(process.cwd(), '.test-tmp', 'claude-source-test');
const { launchPersistentContextMock, mockPage, mockContext } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    waitForTimeout: vi.fn(),
    evaluate: vi.fn(),
    url: vi.fn(),
  };

  const mockContext = {
    pages: vi.fn(),
    newPage: vi.fn(),
    close: vi.fn(),
  };

  return {
    launchPersistentContextMock: vi.fn(),
    mockPage,
    mockContext,
  };
});

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: launchPersistentContextMock,
  },
}));

describe('ClaudeSource', () => {
  let source: ClaudeSource;

  beforeEach(() => {
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_TMP_DIR, { recursive: true });

    vi.clearAllMocks();

    mockContext.pages.mockReturnValue([]);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockContext.close.mockResolvedValue(undefined);
    launchPersistentContextMock.mockResolvedValue(mockContext);

    mockPage.goto.mockResolvedValue(undefined);
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.waitForTimeout.mockResolvedValue(undefined);
    mockPage.evaluate.mockResolvedValue([]);
    mockPage.url.mockReturnValue('https://claude.ai');

    source = new ClaudeSource();
  });

  afterEach(async () => {
    await source.close();
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    }
  });

  it('exposes stable source metadata', () => {
    expect(source.id).toBe('claude');
    expect(source.name).toBe('Claude.ai');
    expect(source.type).toBe('chat');
  });

  it('initializes browser context using launchPersistentContext', async () => {
    await source.init({});

    expect(launchPersistentContextMock).toHaveBeenCalledWith(
      expect.stringContaining(join('.playwright', 'claude')),
      expect.objectContaining({ headless: true }),
    );
    expect(mockPage.goto).toHaveBeenCalledWith('https://claude.ai');
    expect(mockPage.waitForSelector).toHaveBeenCalled();
  });

  it('supports non-headless mode when requested', async () => {
    await source.init({ headless: false });

    expect(launchPersistentContextMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headless: false }),
    );
  });

  it('lists available conversations from page extraction', async () => {
    mockPage.evaluate.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111', title: 'First chat', url: 'https://claude.ai/chat/11111111-1111-1111-1111-111111111111' },
      { id: '22222222-2222-2222-2222-222222222222', title: 'Second chat', url: 'https://claude.ai/chat/22222222-2222-2222-2222-222222222222' },
    ]);

    await source.init({});
    const items = await source.listItems();

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(items[1].title).toBe('Second chat');
  });

  it('exports an individual conversation with metadata', async () => {
    mockPage.evaluate.mockResolvedValue({
      title: 'Project planning',
      messages: [
        { role: 'user', content: 'Plan this', timestamp: new Date('2026-01-01T00:00:00.000Z') },
        { role: 'assistant', content: 'Here is a plan', timestamp: new Date('2026-01-01T00:00:01.000Z') },
      ],
    });

    await source.init({});
    const conversation = await source.exportItem('abc123');

    expect(mockPage.goto).toHaveBeenCalledWith('https://claude.ai/chat/abc123');
    expect(conversation.id).toBe('abc123');
    expect(conversation.title).toBe('Project planning');
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.url).toBe('https://claude.ai/chat/abc123');
    expect(Array.isArray(conversation.artifacts)).toBe(true);
  });

  it('continues export when selector wait times out', async () => {
    mockPage.waitForSelector
      .mockResolvedValueOnce(undefined) // login
      .mockRejectedValueOnce(new Error('timeout')); // exportItem selector
    mockPage.evaluate.mockResolvedValue({
      title: 'Recovered conversation',
      messages: [],
    });

    await source.init({});
    const conversation = await source.exportItem('timeout-case');

    expect(conversation.id).toBe('timeout-case');
    expect(conversation.title).toBe('Recovered conversation');
  });

  it('exports all conversations to disk as JSON', async () => {
    const exportPath = join(TEST_TMP_DIR, 'exports');
    await source.init({});

    vi.spyOn(source, 'listItems').mockResolvedValue([
      { id: 'conv-1', title: 'One' },
      { id: 'conv-2', title: 'Two' },
    ]);

    vi.spyOn(source, 'exportItem')
      .mockResolvedValueOnce({
        id: 'conv-1',
        title: 'One',
        created: new Date('2026-01-01T00:00:00.000Z'),
        messages: [],
        artifacts: [],
        url: 'https://claude.ai/chat/conv-1',
      })
      .mockResolvedValueOnce({
        id: 'conv-2',
        title: 'Two',
        created: new Date('2026-01-01T00:00:00.000Z'),
        messages: [],
        artifacts: [],
        url: 'https://claude.ai/chat/conv-2',
      });

    const conversations = await source.exportAll({ exportPath });

    expect(conversations).toHaveLength(2);
    const files = readdirSync(exportPath).sort();
    expect(files).toEqual(['conv-1.json', 'conv-2.json']);

    const saved = JSON.parse(readFileSync(join(exportPath, 'conv-1.json'), 'utf-8'));
    expect(saved.id).toBe('conv-1');
  });

  it('closes browser context cleanly', async () => {
    await source.init({});
    await source.close();

    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });
});
