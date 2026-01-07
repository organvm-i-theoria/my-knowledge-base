/**
 * Atomize conversations into knowledge units
 */

import { randomUUID } from 'crypto';
import { AtomicUnit, Conversation, Message, AtomicUnitType, KnowledgeItem, KnowledgeDocument } from './types.js';

export class KnowledgeAtomizer {

  /**
   * Universal atomization entry point
   */
  atomize(item: KnowledgeItem): AtomicUnit[] {
    if ('messages' in item) {
      return this.atomizeConversation(item);
    } else {
      return this.atomizeDocument(item);
    }
  }

  /**
   * Atomize a conversation
   */
  atomizeConversation(conversation: Conversation): AtomicUnit[] {
    const messageUnits = this.atomizeByMessage(conversation);
    const codeUnits = this.atomizeCodeBlocks(conversation);
    return [...messageUnits, ...codeUnits];
  }

  /**
   * Atomize a document (Phase 5 strategy)
   */
  atomizeDocument(doc: KnowledgeDocument): AtomicUnit[] {
    const units: AtomicUnit[] = [];
    
    // Strategy 1: Header-based splitting (H1, H2, H3)
    const headerRegex = /^#+ .+/gm;
    const content = doc.content;
    const matches = [...content.matchAll(headerRegex)];
    
    if (matches.length > 1) {
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index!;
        const end = i < matches.length - 1 ? matches[i + 1].index! : content.length;
        const section = content.slice(start, end).trim();
        
        if (section.length < 50) continue;
        
        const title = matches[i][0].replace(/^#+ /, '');
        
        units.push({
          id: randomUUID(),
          type: 'insight',
          timestamp: doc.created,
          title,
          content: section,
          context: `From document: ${doc.title}`,
          tags: ['document', doc.format],
          category: this.categorize(section),
          documentId: doc.id,
          relatedUnits: [],
          keywords: this.extractKeywords(section)
        });
      }
    } else {
      // Fallback: Paragraph-based splitting if no headers
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 100);
      
      for (const p of paragraphs) {
        units.push({
          id: randomUUID(),
          type: 'insight',
          timestamp: doc.created,
          title: this.generateTitle(p),
          content: p,
          context: `From document: ${doc.title}`,
          tags: ['document', doc.format, 'paragraph'],
          category: this.categorize(p),
          documentId: doc.id,
          relatedUnits: [],
          keywords: this.extractKeywords(p)
        });
      }
    }
    
    return units;
  }

  /**
   * Message-level atomization (Phase 1 strategy)
   */
  atomizeByMessage(conversation: Conversation): AtomicUnit[] {
    const units: AtomicUnit[] = [];

    for (let i = 0; i < conversation.messages.length; i++) {
      const message = conversation.messages[i];

      if (message.content.length < 20) continue;

      const context = i > 0
        ? conversation.messages[i - 1].content.slice(0, 200)
        : '';

      const type = this.inferType(message);
      const title = this.generateTitle(message.content);
      const keywords = this.extractKeywords(message.content);
      const tags = this.autoTag(message.content, type);

      const unit: AtomicUnit = {
        id: randomUUID(),
        type,
        timestamp: message.timestamp || new Date(),
        title,
        content: message.content,
        context,
        tags,
        category: this.categorize(message.content),
        conversationId: conversation.id,
        relatedUnits: [],
        keywords
      };

      units.push(unit);
    }

    return units;
  }

  /**
   * Code extraction atomization
   */
  atomizeCodeBlocks(conversation: Conversation): AtomicUnit[] {
    const units: AtomicUnit[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]+?)```/g;

    for (const message of conversation.messages) {
      const matches = [...message.content.matchAll(codeBlockRegex)];

      for (const match of matches) {
        const language = match[1] || 'text';
        const code = match[2];

        const unit: AtomicUnit = {
          id: randomUUID(),
          type: 'code',
          timestamp: message.timestamp || new Date(),
          title: `Code: ${language}`,
          content: code,
          context: message.content.slice(0, 200),
          tags: [language, 'code'],
          category: 'programming',
          conversationId: conversation.id,
          relatedUnits: [],
          keywords: [language, 'code', 'snippet']
        };

        units.push(unit);
      }
    }

    return units;
  }

  private inferType(message: Message): AtomicUnitType {
    const content = message.content.toLowerCase();

    if (message.role === 'user' && (
      content.includes('?') ||
      content.startsWith('how') ||
      content.startsWith('what') ||
      content.startsWith('why') ||
      content.startsWith('when')
    )) {
      return 'question';
    }

    if (content.includes('```') ||
        content.includes('function') ||
        content.includes('class ') ||
        content.includes('const ')) {
      return 'code';
    }

    if (content.includes('decide') ||
        content.includes('choose') ||
        content.includes('recommend') ||
        content.includes('should we')) {
      return 'decision';
    }

    if (content.includes('see ') ||
        content.includes('refer to') ||
        content.includes('docs') ||
        content.includes('documentation')) {
      return 'reference';
    }

    return 'insight';
  }

  private generateTitle(content: string): string {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const firstLine = lines[0] || 'Untitled';

    if (firstLine.length > 80) {
      return firstLine.slice(0, 77) + '...';
    }

    return firstLine;
  }

  private extractKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4);

    const uniqueWords = [...new Set(words)];
    const wordCounts = new Map<string, number>();
    words.forEach(w => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));

    return uniqueWords
      .sort((a, b) => (wordCounts.get(b) || 0) - (wordCounts.get(a) || 0))
      .slice(0, 10);
  }

  private autoTag(content: string, type: AtomicUnitType): string[] {
    const tags: string[] = [type];
    const lower = content.toLowerCase();

    const languages = ['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'sql'];
    languages.forEach(lang => {
      if (lower.includes(lang)) tags.push(lang);
    });

    const technologies = ['react', 'node', 'express', 'oauth', 'api', 'database', 'auth'];
    technologies.forEach(tech => {
      if (lower.includes(tech)) tags.push(tech);
    });

    if (lower.includes('security') || lower.includes('auth')) tags.push('security');
    if (lower.includes('performance') || lower.includes('optimize')) tags.push('performance');
    if (lower.includes('bug') || lower.includes('fix')) tags.push('bugfix');
    if (lower.includes('feature') || lower.includes('implement')) tags.push('feature');

    return [...new Set(tags)];
  }

  private categorize(content: string): string {
    const lower = content.toLowerCase();

    if (lower.includes('code') || lower.includes('function') || lower.includes('class')) {
      return 'programming';
    }

    if (lower.includes('write') || lower.includes('article') || lower.includes('essay')) {
      return 'writing';
    }

    if (lower.includes('research') || lower.includes('study') || lower.includes('analyze')) {
      return 'research';
    }

    if (lower.includes('design') || lower.includes('ui') || lower.includes('ux')) {
      return 'design';
    }

    return 'general';
  }
}
