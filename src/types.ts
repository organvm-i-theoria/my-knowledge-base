/**
 * Core types for the knowledge base system
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface Artifact {
  id: string;
  type: 'code' | 'text' | 'markdown' | 'mermaid' | 'html';
  language?: string;
  title?: string;
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  created: Date;
  url?: string;
  messages: Message[];
  artifacts: Artifact[];
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  created: Date;
  modified: Date;
  url?: string;
  format: 'markdown' | 'txt' | 'pdf' | 'html';
  metadata: Record<string, any>;
}

export type KnowledgeItem = Conversation | KnowledgeDocument;

export type AtomicUnitType = 'insight' | 'code' | 'question' | 'reference' | 'decision';

export interface AtomicUnit {
  id: string;
  type: AtomicUnitType;
  timestamp: Date;

  // Content
  title: string;
  content: string;
  context: string;

  // Metadata
  tags: string[];
  category: string;

  // Relationships
  conversationId?: string;
  documentId?: string;
  parentMessage?: string;
  relatedUnits: string[];

  // Search
  embedding?: number[];
  keywords: string[];
}

export interface ExportOptions {
  headless?: boolean;
  exportPath?: string;
  incremental?: boolean;
  lastExportDate?: Date;
}

export interface AtomizationOptions {
  strategies: ('message' | 'insight' | 'code' | 'semantic')[];
  maxTokensPerUnit?: number;
}
