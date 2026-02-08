import { KnowledgeItem, ExportOptions } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AppleNote {
  id: string;
  account: string;
  title: string;
  htmlBody: string;
  created: string | null;
  modified: string | null;
}

export class AppleNotesSource implements KnowledgeSource {
  id = 'apple-notes';
  name = 'Apple Notes';
  type: 'file' = 'file';

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    if (process.platform !== 'darwin') {
      console.warn('⚠️  Apple Notes source only available on macOS.');
      return [];
    }

    console.log('🍎 Exporting Apple Notes (this may trigger a permission popup)...');

    const scriptPath = join(process.cwd(), 'scripts', 'export-apple-notes.js');

    try {
      const { stdout } = await execAsync(scriptPath, {
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer
      });
      
      const notes: AppleNote[] = JSON.parse(stdout);
      console.log(`   ✅ Found ${notes.length} notes.`);

      return notes.map(note => this.convertToKnowledgeItem(note));
    } catch (error) {
      console.error('   ❌ Failed to export Apple Notes:', error);
      return [];
    }
  }

  private convertToKnowledgeItem(note: AppleNote): KnowledgeItem {
    return {
      id: note.id,
      title: note.title || 'Untitled Note',
      content: note.htmlBody,
      created: note.created ? new Date(note.created) : new Date(),
      modified: note.modified ? new Date(note.modified) : new Date(),
      url: `applenotes://${note.id}`,
      format: 'html',
      metadata: {
        sourceId: this.id,
        sourceName: this.name,
        account: note.account,
        originalId: note.id
      }
    };
  }
}