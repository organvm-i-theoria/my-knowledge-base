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

export type SectionType = 'list' | 'table' | 'blockquote' | 'heading' | 'code' | 'paragraph';

/**
 * Typed relationship between entities (OpenMetadata pattern)
 * Replaces generic 'related' string with semantic relationship types
 */
export type RelationshipType =
  | 'references'      // One unit cites or links to another
  | 'builds_on'       // One unit extends/elaborates on another (was 'expands-on')
  | 'contradicts'     // Units present conflicting information
  | 'implements'      // One unit shows implementation of another's concept
  | 'derived_from'    // One unit is derived/extracted from another
  | 'prerequisite'    // One concept is needed to understand the other
  | 'related';        // General topical relationship (fallback)

/**
 * Source of the relationship detection
 */
export type RelationshipSource = 'manual' | 'auto_detected' | 'ai_inferred';

/**
 * Typed relationship between atomic units
 * Based on OpenMetadata's entityLineage pattern
 */
export interface EntityRelationship {
  /** Source unit ID */
  fromEntity: string;
  /** Target unit ID */
  toEntity: string;
  /** Semantic relationship type */
  relationshipType: RelationshipType;
  /** How the relationship was determined */
  source: RelationshipSource;
  /** Confidence score (0-1), primarily for AI-inferred relationships */
  confidence?: number;
  /** Human-readable explanation of the relationship */
  explanation?: string;
  /** When the relationship was created */
  createdAt?: Date;
}

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

  // Document hierarchy (Phase 1, Task 1)
  sectionType?: SectionType;
  hierarchyLevel?: number;
  parentSectionId?: string;
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
