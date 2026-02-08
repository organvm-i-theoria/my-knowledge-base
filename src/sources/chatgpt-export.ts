import { KnowledgeItem, ExportOptions, Conversation, Message } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import glob from 'fast-glob';

interface ChatGPTMessageNode {
  id: string;
  message?: {
    author: {
      role: 'user' | 'assistant' | 'system' | 'tool';
    };
    content: {
      content_type: string;
      parts?: string[];
    };
    create_time?: number;
  };
  parent?: string;
}

interface ChatGPTExportConversation {
  title: string;
  create_time: number;
  mapping: Record<string, ChatGPTMessageNode>;
}

export class ChatGPTExportSource implements KnowledgeSource {
  id = 'chatgpt-export';
  name = 'ChatGPT Export Ingestor';
  type: 'chat' = 'chat';
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const intakePath = join(this.baseDir, 'intake');
    if (!existsSync(intakePath)) return [];

    console.log(`📂 Scanning for ChatGPT exports in ${intakePath}...`);
    
    // Find all conversations.json files that ARE NOT Claude exports
    // (We'll differentiate by looking for "mapping" in the content if needed, 
    // but ChatGPT exports often have different folder structures)
    const files = await glob('**/conversations.json', {
      cwd: intakePath,
      absolute: true
    });

    const allConversations: Conversation[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        // Quick check for ChatGPT format
        if (!content.includes('"mapping":')) continue;

        const rawConversations = JSON.parse(content) as ChatGPTExportConversation[];
        console.log(`   Processing ChatGPT file ${file} (${rawConversations.length} conversations)...`);

        for (const raw of rawConversations) {
          const messages: Message[] = this.extractMessages(raw);
          
          if (messages.length === 0) continue;

          allConversations.push({
            id: `chatgpt-${raw.create_time}-${raw.title.slice(0, 20)}`,
            title: raw.title || 'Untitled ChatGPT Conversation',
            created: new Date(raw.create_time * 1000),
            url: 'chatgpt-export://local',
            messages,
            artifacts: []
          });
        }
      } catch (error) {
        console.error(`   ❌ Failed to parse ChatGPT export ${file}:`, error);
      }
    }

    return allConversations;
  }

  private extractMessages(conv: ChatGPTExportConversation): Message[] {
    const messages: Message[] = [];
    
    // ChatGPT mapping is a tree. We want to flatten it in order.
    // A simple way is to find nodes that have messages and sort by time,
    // or traverse from root.
    
    const nodes = Object.values(conv.mapping).filter(n => n.message && n.message.content.parts);
    
    // Sort by create_time to get chronological order
    nodes.sort((a, b) => (a.message!.create_time || 0) - (b.message!.create_time || 0));

    for (const node of nodes) {
      const msg = node.message!;
      if (msg.author.role === 'user' || msg.author.role === 'assistant') {
        const text = msg.content.parts?.join('\n').trim();
        if (text) {
          messages.push({
            role: msg.author.role === 'user' ? 'user' : 'assistant',
            content: text,
            timestamp: msg.create_time ? new Date(msg.create_time * 1000) : new Date()
          });
        }
      }
    }

    return messages;
  }
}
