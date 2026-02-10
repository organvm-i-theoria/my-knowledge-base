/**
 * Gemini Knowledge Source
 */

import { chromium, BrowserContext, Page } from 'playwright';
import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { KnowledgeItem, ExportOptions, Conversation, Message } from '../types.js';
import { KnowledgeSource, SourceItemReference } from './interface.js';

export class GeminiSource implements KnowledgeSource {
  id = 'gemini';
  name = 'Google Gemini';
  type: 'chat' = 'chat';

  private context?: BrowserContext;
  private page?: Page;

  async init(options: ExportOptions = {}) {
    const headless = options.headless !== false;
    const userDataDir = join(process.cwd(), '.playwright', 'gemini');
    
    if (!existsSync(userDataDir)) {
      mkdirSync(userDataDir, { recursive: true });
    }

    console.log(`🚀 Launching browser for Gemini (session: ${userDataDir})...`);
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

    console.log('🔐 Navigating to gemini.google.com...');
    await this.page.goto('https://gemini.google.com/app');

    // Wait for user to log in manually
    console.log('\n⏳ Please log in to gemini.google.com in the browser window...');
    console.log('   Note: You may need to click through some welcome screens.');
    console.log('   The crawler will start once it detects the conversation list.');

    // Wait for the main app to load (conversation list or main chat area)
    try {
      console.log('⏳ Waiting for you to log in and sidebar to appear...');
      
      // Wait for either a conversation link OR the absence of the signed-out nudge
      await this.page.waitForFunction(() => {
          const signedOut = document.querySelector('conversations-list-signed-out');
          const hasChats = !!document.querySelector('a[href*="/app/"]:not([href*="download"])');
          const recentChatsHeader = Array.from(document.querySelectorAll('h1, h2, h3')).some(el => el.textContent?.includes('Recent'));
          return (hasChats || recentChatsHeader) && !signedOut;
      }, { timeout: 120000 });
      
      console.log('✅ Logged in successfully');
      
      // Additional wait for sidebar to expand and load items
      await this.page.waitForTimeout(5000);
    } catch (e) {
      console.log('⚠️  Detection timed out. Current URL:', this.page.url());
      const isApp = this.page.url().includes('gemini.google.com/app');
      if (isApp) {
        console.log('✅ App detected despite timeout, proceeding...');
      } else {
        throw new Error('Failed to detect logged-in state. Please ensure you are logged in and past all welcome screens.');
      }
    }
  }

  async listItems(): Promise<SourceItemReference[]> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log('📋 Fetching Gemini conversation list...');

    // Wait for a few seconds to ensure everything is loaded
    await this.page.waitForTimeout(5000);

    // Take a screenshot for debugging
    const debugPath = join(process.cwd(), 'raw', 'gemini');
    if (!existsSync(debugPath)) mkdirSync(debugPath, { recursive: true });
    await this.page.screenshot({ path: join(debugPath, 'debug_list.png') });
    console.log(`📸 Debug screenshot saved to ${join(debugPath, 'debug_list.png')}`);

    // Extract conversation data from the sidebar
    const conversations = await this.page.evaluate(() => {
      const results: { id: string; title: string; url: string }[] = [];
      
      // Look for links that point to conversations
      // Gemini's sidebar usually has these in a specific container
      // They are often within <nav> or a specific sidebar component
      // We look for any link containing /app/ that isn't a known utility page
      const links = Array.from(document.querySelectorAll('a[href*="/app/"]'));

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.includes('/app/')) {
          const parts = href.split('/');
          const id = parts[parts.length - 1];
          
          // ID should look like a long alphanumeric string
          const isProbablyId = id && id.length >= 8 && /^[a-z0-9_-]+$/i.test(id);
          const blackList = ['app', 'download', 'faq', 'help', 'updates', 'settings', 'prompts', 'waitingroom'];
          
          if (isProbablyId && !blackList.includes(id) && !results.find(r => r.id === id)) {
            // Find the title - often in the text content or a sibling span
            // Gemini often has titles in a <span> or just the <a> text
            let title = '';
            
            // Try to find a title element first
            const titleEl = link.querySelector('.conversation-title, span');
            title = titleEl?.textContent?.trim() || link.textContent?.trim() || '';
            
            // Clean up titles
            title = title.split('\n')[0].trim();
            title = title.replace(/^Chat with /i, '').trim() || 'Untitled Gemini Conversation';

            results.push({
              id,
              title,
              url: `https://gemini.google.com${href}`
            });
          }
        }
      });

      return results;
    });

    console.log(`✅ Found ${conversations.length} potential conversations`);
    
    if (conversations.length === 0) {
        const html = await this.page.content();
        writeFileSync(join(debugPath, 'debug_list.html'), html);
        console.log(`📝 Debug HTML saved to ${join(debugPath, 'debug_list.html')}`);
    }
    
    return conversations;
  }

  async exportItem(id: string): Promise<Conversation> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log(`📥 Exporting Gemini conversation: ${id}`);

    const url = `https://gemini.google.com/app/${id}`;
    await this.page.goto(url);
    
    // Wait for messages to load - use more generic wait
    try {
      await this.page.waitForSelector('.conversation-container, [role="main"]', { timeout: 15000 });
    } catch (e) {
      console.warn(`⚠️  Timeout waiting for main content in conversation ${id}.`);
    }

    // Give page time to load all content
    await this.page.waitForTimeout(3000);
    
    const debugPath = join(process.cwd(), 'raw', 'gemini');
    await this.page.screenshot({ path: join(debugPath, `debug_conv_${id}.png`) });

    // Extract messages
    const data = await this.page.evaluate(() => {
      const messages: { role: 'user' | 'assistant'; content: string }[] = [];

      // Strategy: Find all elements that contain text and are likely messages
      // User queries are often in a container with "user-query" or similar classes
      // Model responses are often in a container with "model-response" or similar classes
      
      // Try to find by content/role markers
      const chatContent = document.querySelector('.chat-content, .conversation-container, [role="main"]');
      if (!chatContent) return { messages: [], title: 'No content found' };

      // Find all elements that look like message bubbles
      // Gemini uses a very complex DOM. We'll look for specific patterns.
      
      // User queries
      const userElements = Array.from(document.querySelectorAll('.query-content, .user-query-text'));
      const assistantElements = Array.from(document.querySelectorAll('.model-response-text, .response-content'));

      // If we found them via classes, great.
      if (userElements.length > 0 || assistantElements.length > 0) {
        // We need to order them by their position in the DOM
        const all = Array.from(document.querySelectorAll('.query-content, .user-query-text, .model-response-text, .response-content'));
        
        // Sort by position in DOM
        all.sort((a, b) => {
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        all.forEach(el => {
          const isUser = el.classList.contains('query-content') || el.classList.contains('user-query-text');
          const content = (el as HTMLElement).innerText.trim();
          if (content) {
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content
            });
          }
        });
      } else {
        // Fallback: try to find anything that looks like a message
        // Look for common patterns in Gemini
        const possibleMessages = Array.from(document.querySelectorAll('div')).filter(div => {
           const text = (div as HTMLElement).innerText.trim();
           return text.length > 20 && (div.classList.contains('message') || div.innerHTML.includes('model-response') || div.innerHTML.includes('query-content'));
        });

        // This is a last resort and might be messy
        possibleMessages.forEach(el => {
            const isUser = (el as HTMLElement).innerText.includes('User') || el.classList.contains('query');
            messages.push({
                role: isUser ? 'user' : 'assistant',
                content: (el as HTMLElement).innerText.trim()
            });
        });
      }

      // Get conversation title
      const titleEl = document.querySelector('h1, h2, .conversation-title');
      const title = (titleEl as HTMLElement)?.innerText?.trim() || 'Untitled Gemini Conversation';

      return { messages, title };
    });

    return {
      id: id,
      title: data.title,
      created: new Date(),
      url,
      messages: data.messages.map(m => ({
        ...m,
        timestamp: new Date()
      })),
      artifacts: []
    };
  }

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const exportPath = options.exportPath || './raw/gemini';
    
    // Check if we already have files and we're NOT in a crawler context
    const hasFiles = existsSync(exportPath) && readdirSync(exportPath).filter(f => f.endsWith('.json')).length > 0;
    
    if (hasFiles && options.headless === undefined) {
      console.log(`📂 Ingesting existing Gemini data from ${exportPath}...`);
      const files = readdirSync(exportPath).filter(f => f.endsWith('.json'));
      const conversations: Conversation[] = [];

      for (const file of files) {
        try {
          const content = JSON.parse(readFileSync(join(exportPath, file), 'utf-8'));
          conversations.push(content);
        } catch (error) {
          console.error(`❌ Failed to parse Gemini file ${file}:`, error);
        }
      }
      return conversations;
    }

    // Otherwise, start the crawler
    console.log('🤖 Starting Gemini Crawler...');
    
    if (!this.context) {
      await this.init(options);
    }

    try {
      if (!existsSync(exportPath)) {
        mkdirSync(exportPath, { recursive: true });
      }

      const conversationListResult = await this.listItems();
      const conversationList = Array.isArray(conversationListResult) ? conversationListResult : [];
      if (!Array.isArray(conversationListResult)) {
        console.warn('⚠️ Gemini listItems() returned non-array result; treating as empty list');
      }
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
          await this.page!.waitForTimeout(2000);
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
      console.log('🔒 Gemini browser closed');
    }
  }
}
