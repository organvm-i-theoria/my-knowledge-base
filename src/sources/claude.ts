/**
 * Claude.ai Knowledge Source
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Conversation, ExportOptions, Message } from '../types.js';
import { KnowledgeSource, SourceItemReference } from './interface.js';

export class ClaudeSource implements KnowledgeSource {
  id = 'claude';
  name = 'Claude.ai';
  type: 'chat' = 'chat';

  private browser?: Browser;
  private page?: Page;

  async init(options: ExportOptions = {}) {
    const headless = options.headless !== false;
    console.log('🚀 Launching browser for Claude...');
    this.browser = await chromium.launch({ headless });
    this.page = await this.browser.newPage();
    console.log('✅ Browser ready');
    
    await this.login();
  }

  private async login() {
    if (!this.page) throw new Error('Browser not initialized');

    console.log('🔐 Navigating to claude.app...');
    await this.page.goto('https://claude.app');

    // Wait for user to log in manually
    console.log('\n⏳ Please log in to claude.app in the browser window...');
    console.log('   Press Enter when you are logged in and see your conversations.');

    // Wait for the main app to load (conversations list)
    await this.page.waitForURL('**/claude.app/**', { timeout: 0 });

    console.log('✅ Logged in successfully');
  }

  async listItems(): Promise<SourceItemReference[]> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log('📋 Fetching Claude conversation list...');

    // Navigate to conversations page
    await this.page.goto('https://claude.app/recents');
    await this.page.waitForLoadState('networkidle');

    // Extract conversation data from the page
    const conversations = await this.page.evaluate(() => {
      const results: { id: string; title: string; url: string }[] = [];

      // Find conversation links
      const links = document.querySelectorAll('a[href^="/chat/"]');

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          const id = href.replace('/chat/', '');
          const titleEl = link.querySelector('[data-testid="conversation-title"]') ||
                         link.querySelector('div') ||
                         link;
          const title = titleEl.textContent?.trim() || 'Untitled';

          results.push({
            id,
            title,
            url: `https://claude.app${href}`
          });
        }
      });

      return results;
    });

    console.log(`✅ Found ${conversations.length} conversations`);
    return conversations;
  }

  async exportItem(id: string): Promise<Conversation> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log(`📥 Exporting Claude conversation: ${id}`);

    const url = `https://claude.app/chat/${id}`;
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');

    // Give page time to load messages
    await this.page.waitForTimeout(2000);

    // Extract conversation data
    const data = await this.page.evaluate(() => {
      const messages: Message[] = [];

      // Find all message elements
      const messageElements = document.querySelectorAll('[data-testid^="message-"]');

      messageElements.forEach(msgEl => {
        const isUser = msgEl.getAttribute('data-testid')?.includes('user');
        const role = isUser ? 'user' : 'assistant';

        // Get message content
        const contentEl = msgEl.querySelector('[data-testid="message-content"]') || msgEl;
        const content = contentEl.textContent?.trim() || '';

        if (content) {
          messages.push({
            role: role as 'user' | 'assistant',
            content,
            timestamp: new Date()
          });
        }
      });

      // Get conversation title
      const titleEl = document.querySelector('[data-testid="conversation-title"], h1, header');
      const title = titleEl?.textContent?.trim() || 'Untitled Conversation';

      return { messages, title };
    });

    const conversation: Conversation = {
      id: id,
      title: data.title,
      created: new Date(),
      url,
      messages: data.messages,
      artifacts: []
    };

    console.log(`✅ Exported ${data.messages.length} messages`);
    return conversation;
  }

  async exportAll(options: ExportOptions = {}): Promise<Conversation[]> {
    const exportPath = options.exportPath || './raw/claude-app';

    // Ensure export directory exists
    if (!existsSync(exportPath)) {
      mkdirSync(exportPath, { recursive: true });
    }

    if (!this.browser) {
      await this.init(options);
    }

    const conversationList = await this.listItems();
    const conversations: Conversation[] = [];

    for (const conv of conversationList) {
      try {
        const conversation = await this.exportItem(conv.id);

        // Save raw JSON
        const filename = join(exportPath, `${conv.id}.json`);
        writeFileSync(filename, JSON.stringify(conversation, null, 2));
        console.log(`💾 Saved to: ${filename}`);

        conversations.push(conversation);

        // Small delay between exports
        await this.page!.waitForTimeout(1000);
      } catch (error) {
        console.error(`❌ Failed to export ${conv.id}:`, error);
      }
    }

    await this.close();

    console.log(`\n✅ Export complete: ${conversations.length} conversations`);
    return conversations;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.page = undefined;
      console.log('🔒 Claude browser closed');
    }
  }
}