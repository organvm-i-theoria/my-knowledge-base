
import { KnowledgeItem, ExportOptions, Conversation, Message } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import glob from 'fast-glob';

interface ClaudeExportMessage {
  uuid: string;
  text: string;
  sender: 'human' | 'assistant';
  created_at: string;
  updated_at: string;
}

interface ClaudeExportConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeExportMessage[];
}

export class ClaudeExportSource implements KnowledgeSource {
  id = 'claude-export';
  name = 'Claude Export Ingestor';
  type: 'chat' = 'chat';
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const intakePath = join(this.baseDir, 'intake');
    if (!existsSync(intakePath)) {
      console.warn(`⚠️  Intake directory not found at ${intakePath}`);
      return [];
    }

    console.log(`📂 Scanning for Claude exports in ${intakePath}...`);
    
    // Find all conversations.json files
    const files = await glob('**/conversations.json', {
      cwd: intakePath,
      absolute: true
    });

    console.log(`   Found ${files.length} export files.`);
    const allConversations: Conversation[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const rawConversations = JSON.parse(content) as ClaudeExportConversation[];
        
        console.log(`   Processing ${file} (${rawConversations.length} conversations)...`);
        
        for (const raw of rawConversations) {
          const conversation: Conversation = {
            id: raw.uuid,
            title: raw.name || 'Untitled Conversation',
            created: this.safeDate(raw.created_at),
            url: `claude-export://${raw.uuid}`,
            messages: (raw.chat_messages || []).map(msg => ({
              role: msg.sender === 'human' ? 'user' : 'assistant',
              content: msg.text,
              timestamp: this.safeDate(msg.created_at)
            })),
            artifacts: []
          };
          
          allConversations.push(conversation);
        }
      } catch (error) {
        console.error(`   ❌ Failed to parse export file ${file}:`, error);
      }
    }

    return allConversations;
  }

  private safeDate(dateStr: string): Date {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return new Date();
      return d;
    } catch {
      return new Date();
    }
  }
}
