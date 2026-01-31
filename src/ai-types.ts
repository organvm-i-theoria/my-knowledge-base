/**
 * Unified AI Provider Types
 */

export type AIProviderId = 'anthropic' | 'openai' | 'ollama' | 'custom';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  stop?: string[];
}

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export interface AIProvider {
  id: string;
  name: string;
  
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  embed(text: string | string[], options?: EmbeddingOptions): Promise<number[][]>;
  
  getModels(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}
