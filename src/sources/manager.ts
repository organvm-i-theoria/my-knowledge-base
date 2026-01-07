import { KnowledgeSource } from './interface.js';
import { ClaudeSource } from './claude.js';
import { ChatGPTSource } from './chatgpt.js';
import { GeminiSource } from './gemini.js';
import { LocalFileSource } from './local.js';
import { KnowledgeItem, ExportOptions } from '../types.js';

export class SourceManager {
  private sources: KnowledgeSource[] = [];

  constructor() {
    // Initialize with default sources
    this.sources.push(new ClaudeSource());
    this.sources.push(new ChatGPTSource());
    this.sources.push(new GeminiSource());
    this.sources.push(new LocalFileSource());
  }

  async ingestAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const allItems: KnowledgeItem[] = [];

    for (const source of this.sources) {
      console.log(`
--- Ingesting from: ${source.name} ---`);
      try {
        const items = await source.exportAll(options);
        allItems.push(...items);
      } catch (error) {
        console.error(`❌ Failed to ingest from ${source.name}:`, error);
      }
    }

    return allItems;
  }

  getSource(id: string): KnowledgeSource | undefined {
    return this.sources.find(s => s.id === id);
  }

  getSources(): KnowledgeSource[] {
    return this.sources;
  }
}
