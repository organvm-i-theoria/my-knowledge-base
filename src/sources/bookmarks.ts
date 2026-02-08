
import { KnowledgeItem, ExportOptions } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Simple plist parser if needed for Safari, but Chrome is easier (JSON)
// For now let's implement Chrome as it's the most common.

interface ChromeBookmark {
  name: string;
  url?: string;
  type: 'url' | 'folder';
  children?: ChromeBookmark[];
  date_added: string;
}

export class BookmarkSource implements KnowledgeSource {
  id = 'bookmarks';
  name = 'Browser Bookmarks';
  type: 'file' = 'file';

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    if (process.platform !== 'darwin') {
      console.warn('⚠️  Bookmark source path detection currently only supports macOS.');
      return [];
    }

    const chromePath = join(
      homedir(),
      'Library/Application Support/Google/Chrome/Default/Bookmarks'
    );

    const items: KnowledgeItem[] = [];

    if (existsSync(chromePath)) {
      console.log(`🔖 Reading Chrome Bookmarks from ${chromePath}...`);
      try {
        const data = JSON.parse(readFileSync(chromePath, 'utf-8'));
        const roots = data.roots;
        
        this.processNode(roots.bookmark_bar, items);
        this.processNode(roots.other, items);
        this.processNode(roots.synced, items);
        
        console.log(`   ✅ Extracted ${items.length} bookmarks.`);
      } catch (e) {
        console.error('   ❌ Failed to parse Chrome bookmarks:', e);
      }
    } else {
      console.warn('   ⚠️  Chrome bookmarks file not found.');
    }

    return items;
  }

  private processNode(node: ChromeBookmark, items: KnowledgeItem[]) {
    if (!node) return;

    if (node.type === 'url' && node.url) {
      items.push({
        id: `bookmark-${Buffer.from(node.url).toString('base64').slice(0, 32)}`,
        title: node.name,
        content: `Bookmark: ${node.name}\nURL: ${node.url}`,
        created: this.webkitTimeToDate(node.date_added),
        modified: new Date(),
        url: node.url,
        format: 'txt',
        metadata: {
          sourceId: this.id,
          sourceName: this.name,
          originalName: node.name
        }
      });
    }

    if (node.children) {
      for (const child of node.children) {
        this.processNode(child, items);
      }
    }
  }

  /**
   * Chrome uses WebKit time (microseconds since Jan 1, 1601)
   */
  private webkitTimeToDate(webkitTime: string): Date {
    const microseconds = parseInt(webkitTime, 10);
    if (isNaN(microseconds)) return new Date();
    
    // Convert to milliseconds and subtract offset
    const msSince1601 = microseconds / 1000;
    const offset = 11644473600000; // ms between 1601 and 1970
    return new Date(msSince1601 - offset);
  }
}
