/**
 * ChatGPT Knowledge Source (Placeholder for Playwright scraper or Data Export ingestion)
 */

import { KnowledgeItem, ExportOptions, Conversation } from '../types.js';
import { KnowledgeSource, SourceItemReference } from './interface.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export class ChatGPTSource implements KnowledgeSource {
  id = 'chatgpt';
  name = 'ChatGPT';
  type: 'chat' = 'chat';

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const exportPath = options.exportPath || './raw/chatgpt';
    
    if (!existsSync(exportPath)) {
      console.log(`ℹ️  No ChatGPT raw data found at ${exportPath}. Skipping.`);
      return [];
    }

    console.log(`📂 Ingesting ChatGPT data from ${exportPath}...`);
    const files = readdirSync(exportPath).filter(f => f.endsWith('.json'));
    const conversations: Conversation[] = [];

    for (const file of files) {
      try {
        const content = JSON.parse(readFileSync(join(exportPath, file), 'utf-8'));
        // Mapping ChatGPT format to our Conversation format if needed
        // For now assuming compatible format for demo
        conversations.push(content);
      } catch (error) {
        console.error(`❌ Failed to parse ChatGPT file ${file}:`, error);
      }
    }

    return conversations;
  }
}
