/**
 * Claude.ai Knowledge Source
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Conversation, ExportOptions, Message } from '../types.js';
import { KnowledgeSource, SourceItemReference } from './interface.js';

export class ClaudeSource implements KnowledgeSource {
  id = 'claude';
  name = 'Claude.ai';
  type: 'chat' = 'chat';

  private context?: BrowserContext;
  private page?: Page;

  async init(options: ExportOptions = {}) {
    const headless = options.headless !== false;
    const userDataDir = join(process.cwd(), '.playwright', 'claude');
    
    if (!existsSync(userDataDir)) {
      mkdirSync(userDataDir, { recursive: true });
    }

    console.log(`🚀 Launching browser for Claude (session: ${userDataDir})...`);
    this.context = await chromium.launchPersistentContext(userDataDir, { 
      headless,
      viewport: { width: 1280, height: 800 }
    });
    
    this.page = this.context.pages()[0] || await this.context.newPage();
    console.log('✅ Browser ready');
    
    await this.login();
  }

  private async login() {
    if (!this.page) throw new Error('Browser not initialized');

    console.log('🔐 Navigating to claude.ai...');
    await this.page.goto('https://claude.ai');

    // Wait for user to log in manually
    console.log('\n⏳ Please log in to claude.ai in the browser window...');
    console.log('   The crawler will start once it detects the conversation list.');

    try {
      // Wait for a selector that indicates we are logged in
      await this.page.waitForSelector('text=Chat History, [data-testid="conversation-title"], .flex.flex-col.gap-1', { timeout: 120000 });
      console.log('✅ Logged in successfully');
    } catch (e) {
      console.log('⚠️  Detection timed out. Current URL:', this.page.url());
      if (this.page.url().includes('claude.ai')) {
        console.log('✅ App detected despite timeout, proceeding...');
      } else {
        throw new Error('Failed to detect logged-in state. Please ensure you are logged in.');
      }
    }
  }

  async listItems(): Promise<SourceItemReference[]> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log('📋 Fetching Claude conversation list...');

    // Extract conversation data from the page
    const conversations = await this.page.evaluate(() => {
      const results: { id: string; title: string; url: string }[] = [];

      // Find conversation links - Claude changed these to include the ID in the URL
      const links = document.querySelectorAll('a[href*="/chat/"]');

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          const parts = href.split('/');
          const id = parts[parts.length - 1];
          
          // Only add if it looks like a UUID
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
          
          if (isUuid && !results.find(r => r.id === id)) {
            const titleEl = link.querySelector('[data-testid="conversation-title"]') ||
                           link.querySelector('div') ||
                           link;
            const title = titleEl.textContent?.trim() || 'Untitled';

            results.push({
              id,
              title,
              url: `https://claude.ai${href}`
            });
          }
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

    const url = `https://claude.ai/chat/${id}`;
    await this.page.goto(url);
    
    // Use a safer wait
    try {
      await this.page.waitForSelector('[data-testid^="message-"], .font-claude-message', { timeout: 15000 });
    } catch (e) {
      console.warn(`⚠️  Timeout waiting for messages in conversation ${id}.`);
    }

    // Give page time to load messages
    await this.page.waitForTimeout(2000);

    // Extract conversation data
    const data = await this.page.evaluate(() => {
      const messages: Message[] = [];

      // Find all message elements
      const messageElements = document.querySelectorAll('[data-testid^="message-"], .font-claude-message');

      messageElements.forEach(msgEl => {
        // Try to determine role
        const isUser = msgEl.getAttribute('data-testid')?.includes('user') || 
                       msgEl.closest('.flex-row-reverse') ||
                       msgEl.innerHTML.includes('User');
        const role = isUser ? 'user' : 'assistant';

        // Get message content
        const contentEl = msgEl.querySelector('[data-testid="message-content"], .prose') || msgEl;
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

    if (!this.context) {
      await this.init(options);
    }

    try {
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

      return conversations;
    } finally {
      await this.close();
    }
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
      this.page = undefined;
      console.log('🔒 Claude browser closed');
    }
  }
}