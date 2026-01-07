/**
 * Claude.ai Knowledge Source with error recovery and retry logic
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Conversation, ExportOptions, Message } from '../types.js';
import { KnowledgeSource, SourceItemReference } from './interface.js';
import { logger, retryAsync, AppError } from '../logger.js';

interface BrowserConfig {
  headless: boolean;
  maxRetries: number;
  retryDelayMs: number;
  navigationTimeoutMs: number;
  waitTimeoutMs: number;
}

export class ClaudeSource implements KnowledgeSource {
  id = 'claude';
  name = 'Claude.ai';
  type: 'chat' = 'chat';

  private browser?: Browser;
  private page?: Page;
  private isClosing = false;
  private exportedIds = new Set<string>();
  private failedIds = new Map<string, string>();

  private config: BrowserConfig = {
    headless: true,
    maxRetries: 3,
    retryDelayMs: 2000,
    navigationTimeoutMs: 30000,
    waitTimeoutMs: 10000
  };

  async init(options: ExportOptions = {}) {
    try {
      const headless = options.headless !== false;
      this.config.headless = headless;

      logger.info('Launching browser for Claude', { headless }, 'ClaudeSource');

      await retryAsync(
        () => this.launchBrowser(),
        this.config.maxRetries,
        this.config.retryDelayMs,
        'ClaudeSource:init'
      );

      await this.login();
      logger.success('✅ Initialization complete');
    } catch (error) {
      const appError = error instanceof AppError ? error : 
        new AppError(
          `Failed to initialize Claude source: ${error instanceof Error ? error.message : String(error)}`,
          'CLAUDE_INIT_FAILED'
        );
      logger.error(appError.message, error instanceof Error ? error : undefined, 'ClaudeSource:init');
      throw appError;
    }
  }

  private async launchBrowser(): Promise<void> {
    try {
      logger.debug('Launching Chromium browser', undefined, 'ClaudeSource');
      this.browser = await chromium.launch({ headless: this.config.headless });
      this.page = await this.browser.newPage();
      this.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
      this.page.setDefaultTimeout(this.config.waitTimeoutMs);
      logger.debug('Browser launched successfully', undefined, 'ClaudeSource');
    } catch (error) {
      throw new AppError(
        `Browser launch failed: ${error instanceof Error ? error.message : String(error)}`,
        'BROWSER_LAUNCH_FAILED'
      );
    }
  }

  private async login() {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      logger.info('Navigating to claude.app', undefined, 'ClaudeSource:login');
      await this.page.goto('https://claude.app', { waitUntil: 'domcontentloaded' });

      logger.info('Waiting for user authentication', undefined, 'ClaudeSource:login');
      console.log('\n⏳ Please log in to claude.app in the browser window...');
      console.log('   Once you see your conversations list, press Enter.');

      // Wait for the main app to load (conversations list) or timeout after 5 minutes
      await Promise.race([
        this.page.waitForURL('**/claude.app/**', { timeout: 300000 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Login timeout after 5 minutes')), 300000)
        )
      ]);

      logger.success('✅ Logged in successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('timeout')) {
        throw new AppError(
          'Login timeout: Please check your internet connection and try again',
          'LOGIN_TIMEOUT'
        );
      }
      throw new AppError(
        `Login failed: ${message}`,
        'LOGIN_FAILED'
      );
    }
  }

  async listItems(): Promise<SourceItemReference[]> {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      logger.info('Fetching Claude conversation list', undefined, 'ClaudeSource:listItems');

      const conversations = await retryAsync(
        async () => {
          await this.page!.goto('https://claude.app/recents', { waitUntil: 'networkidle' });
          
          // Scroll to load more conversations
          await this.page!.evaluate(() => {
            const container = document.querySelector('[role="list"]') || document.body;
            container.scrollTop = container.scrollHeight;
          });

          await this.page!.waitForTimeout(1000);

          // Extract conversation data
          return await this.page!.evaluate(() => {
            const results: { id: string; title: string; url: string }[] = [];
            const links = document.querySelectorAll('a[href^="/chat/"]');

            links.forEach(link => {
              const href = link.getAttribute('href');
              if (href) {
                const id = href.replace('/chat/', '').split('?')[0]; // Remove query params
                const titleEl = link.querySelector('[data-testid="conversation-title"]') ||
                               link.querySelector('div') ||
                               link;
                const title = titleEl.textContent?.trim() || 'Untitled';

                if (id && !results.find(r => r.id === id)) {
                  results.push({
                    id,
                    title,
                    url: `https://claude.app${href}`
                  });
                }
              }
            });

            return results;
          });
        },
        this.config.maxRetries,
        this.config.retryDelayMs,
        'ClaudeSource:listItems'
      );

      logger.info(`Found ${conversations.length} conversations`, 
        { count: conversations.length }, 
        'ClaudeSource:listItems'
      );
      return conversations;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(
        `Failed to list conversations: ${message}`,
        'LIST_CONVERSATIONS_FAILED'
      );
    }
  }

  async exportItem(id: string): Promise<Conversation> {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      logger.info(`Exporting conversation`, { conversationId: id }, 'ClaudeSource:exportItem');

      const conversation = await retryAsync(
        async () => {
          const url = `https://claude.app/chat/${id}`;
          
          await this.page!.goto(url, { waitUntil: 'networkidle' });
          
          // Wait for messages to load and give extra time
          await this.page!.waitForTimeout(2000);

          // Extract conversation data with error handling
          const data = await this.page!.evaluate(() => {
            const messages: Message[] = [];
            const messageElements = document.querySelectorAll('[data-testid^="message-"]');

            messageElements.forEach((msgEl, index) => {
              try {
                const isUser = msgEl.getAttribute('data-testid')?.includes('user');
                const role = isUser ? 'user' : 'assistant';
                const contentEl = msgEl.querySelector('[data-testid="message-content"]') || msgEl;
                const content = contentEl.textContent?.trim() || '';

                if (content && content.length > 0) {
                  messages.push({
                    role: role as 'user' | 'assistant',
                    content,
                    timestamp: new Date()
                  });
                }
              } catch (e) {
                console.warn(`Failed to parse message ${index}:`, e);
              }
            });

            const titleEl = document.querySelector('[data-testid="conversation-title"], h1, header');
            const title = titleEl?.textContent?.trim() || 'Untitled Conversation';

            return { messages, title };
          });

          if (data.messages.length === 0) {
            logger.warn(
              'No messages found in conversation',
              { conversationId: id },
              'ClaudeSource:exportItem'
            );
          }

          return data;
        },
        this.config.maxRetries,
        this.config.retryDelayMs,
        `ClaudeSource:exportItem:${id}`
      );

      const conversation: Conversation = {
        id,
        title: conversation.title,
        created: new Date(),
        url: `https://claude.app/chat/${id}`,
        messages: conversation.messages,
        artifacts: []
      };

      logger.debug(
        `Exported conversation`,
        { conversationId: id, messageCount: conversation.messages.length },
        'ClaudeSource:exportItem'
      );

      this.exportedIds.add(id);
      return conversation;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = `Failed to export conversation ${id}: ${message}`;
      logger.error(errorMsg, error instanceof Error ? error : undefined, 'ClaudeSource:exportItem');
      this.failedIds.set(id, message);
      throw new AppError(errorMsg, 'EXPORT_ITEM_FAILED');
    }
  }

  async exportAll(options: ExportOptions = {}): Promise<Conversation[]> {
    const exportPath = options.exportPath || './raw/claude-app';

    try {
      if (!existsSync(exportPath)) {
        mkdirSync(exportPath, { recursive: true });
      }

      if (!this.browser) {
        await this.init(options);
      }

      this.exportedIds.clear();
      this.failedIds.clear();

      const conversationList = await this.listItems();
      const conversations: Conversation[] = [];

      logger.info(
        `Starting export of ${conversationList.length} conversations`,
        { totalCount: conversationList.length },
        'ClaudeSource:exportAll'
      );

      for (let i = 0; i < conversationList.length; i++) {
        const conv = conversationList[i];
        const progress = `${i + 1}/${conversationList.length}`;

        try {
          logger.debug(
            `Exporting conversation [${progress}]`,
            { title: conv.title.substring(0, 50) },
            'ClaudeSource:exportAll'
          );

          const conversation = await this.exportItem(conv.id);

          // Save raw JSON
          const filename = join(exportPath, `${conv.id}.json`);
          writeFileSync(filename, JSON.stringify(conversation, null, 2));
          logger.debug(
            `Saved conversation to file`,
            { path: filename, messageCount: conversation.messages.length },
            'ClaudeSource:exportAll'
          );

          conversations.push(conversation);

          // Delay between exports to avoid rate limiting
          if (i < conversationList.length - 1) {
            await this.page!.waitForTimeout(1500);
          }
        } catch (error) {
          const errorMsg = `[${progress}] ${conv.title}: ${error instanceof Error ? error.message : String(error)}`;
          logger.warn(errorMsg, undefined, 'ClaudeSource:exportAll');
        }
      }

      // Summary
      logger.info(
        `Export complete`,
        {
          succeeded: this.exportedIds.size,
          failed: this.failedIds.size,
          total: conversationList.length
        },
        'ClaudeSource:exportAll'
      );

      if (this.failedIds.size > 0) {
        logger.warn(
          `${this.failedIds.size} conversations failed to export`,
          { failures: Array.from(this.failedIds.entries()) },
          'ClaudeSource:exportAll'
        );
      }

      await this.close();

      return conversations;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const appError = new AppError(
        `Export failed: ${message}`,
        'EXPORT_ALL_FAILED'
      );
      logger.error(appError.message, error instanceof Error ? error : undefined, 'ClaudeSource:exportAll');
      throw appError;
    }
  }

  async close() {
    if (this.isClosing) return;

    try {
      this.isClosing = true;

      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }

      if (this.browser) {
        await this.browser.close();
      }

      this.browser = undefined;
      this.page = undefined;
      logger.success('✅ Browser closed');
    } catch (error) {
      logger.warn(
        `Error closing browser: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'ClaudeSource:close'
      );
    } finally {
      this.isClosing = false;
    }
  }

  /**
   * Get export summary
   */
  getSummary() {
    return {
      exported: this.exportedIds.size,
      failed: this.failedIds.size,
      failedIds: Array.from(this.failedIds.keys()),
      failureReasons: Array.from(this.failedIds.entries())
    };
  }
}
