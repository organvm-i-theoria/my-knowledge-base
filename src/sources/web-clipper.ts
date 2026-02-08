
import { KnowledgeItem, ExportOptions } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export class WebClipperSource implements KnowledgeSource {
  id = 'web-clipper';
  name = 'Web Clipper';
  type: 'file' = 'file';

  // This source is primarily triggered manually via CLI args or a specific "clip" command,
  // rather than a bulk export. However, we can implement exportAll to perhaps read a "queue" file.
  
  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    // For now, this is a placeholder. 
    // In a real implementation, this could read a 'urls-to-index.txt' file.
    return [];
  }

  /**
   * Public method to clip a specific URL
   */
  async clipUrl(url: string): Promise<KnowledgeItem | null> {
    console.log(`✂️  Clipping URL: ${url}...`);
    
    let browser;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const content = await page.content();
      const title = await page.title();
      
      // Use Readability to extract main content
      const doc = new JSDOM(content, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();

      if (!article) {
        console.warn('   ⚠️  Could not extract article content.');
        return null;
      }

      return {
        id: `web-${Date.now()}`, // Simple ID for now
        title: article.title || title || 'Untitled Web Page',
        content: article.content || '', // This is HTML
        created: new Date(),
        modified: new Date(),
        url: url,
        format: 'html',
        metadata: {
          sourceId: this.id,
          sourceName: this.name,
          excerpt: article.excerpt,
          byline: article.byline
        }
      };

    } catch (error) {
      console.error(`   ❌ Failed to clip ${url}:`, error);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }
}
