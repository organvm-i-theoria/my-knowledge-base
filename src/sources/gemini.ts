/**
 * Gemini Knowledge Source
 */

import { KnowledgeItem, ExportOptions, Conversation } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export class GeminiSource implements KnowledgeSource {
  id = 'gemini';
  name = 'Google Gemini';
  type: 'chat' = 'chat';

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const exportPath = options.exportPath || './raw/gemini';
    
    if (!existsSync(exportPath)) {
      console.log(`ℹ️  No Gemini raw data found at ${exportPath}. Skipping.`);
      return [];
    }

    console.log(`📂 Ingesting Gemini data from ${exportPath}...`);
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
}
