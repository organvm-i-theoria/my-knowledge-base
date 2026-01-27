import { KnowledgeItem, ExportOptions, KnowledgeDocument } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { join } from 'path';

const execAsync = promisify(exec);

interface AppleNote {
  id: string;
  name: string;
  body: string;
  creationDate: string;
  modificationDate: string;
  folder: string;
  error?: string;
}

export class AppleNotesSource implements KnowledgeSource {
  id = 'apple-notes';
  name = 'Apple Notes';
  type: 'file' = 'file';

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    console.log('🍎 Scanning Apple Notes...');
    
    // Note: This requires the user to grant permission to "Terminal" or "iTerm" 
    // to control "Notes" in System Settings > Privacy & Security > Automation.
    // We should fail gracefully if permission is denied.

    try {
      // Run the JXA script using tsx to executing the JS file
      // We assume the script is at 'scripts/export-apple-notes.js' relative to project root
      const scriptPath = join(process.cwd(), 'scripts', 'export-apple-notes.js');
      
      // We run it with 'node' directly as it's a standalone JS file now
      // Max buffer increased for large note libraries (500MB)
      const { stdout } = await execAsync(`node "${scriptPath}"`, {
        maxBuffer: 1024 * 1024 * 500 
      });

      const notes: AppleNote[] = JSON.parse(stdout);

      if (notes.length > 0 && notes[0].error) {
        throw new Error(notes[0].error);
      }

      console.log(`   ✅ Found ${notes.length} notes.`);

      return notes.map(note => {
        // Create stable ID from Apple's ID (x-coredata://...)
        const fileId = createHash('md5').update(note.id).digest('hex');
        
        // HTML content comes from note.body(). 
        // We might want to convert HTML to Markdown later, but raw HTML is fine for FTS.
        
        return {
          id: fileId,
          title: note.name || 'Untitled Note',
          content: note.body, // This is HTML
          created: new Date(note.creationDate),
          modified: new Date(note.modificationDate),
          url: `applenotes://${note.id}`,
          format: 'html',
          metadata: {
            sourceId: this.id,
            sourceName: this.name,
            folder: note.folder,
            originalId: note.id
          }
        } as KnowledgeDocument;
      });

    } catch (error: any) {
      console.warn(`   ⚠️  Apple Notes access failed. Make sure Terminal has automation permissions.`);
      console.warn(`   Error details: ${error.message}`);
      return [];
    }
  }
}
