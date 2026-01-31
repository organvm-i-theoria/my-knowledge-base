import { config } from 'dotenv';
import { AIFactory } from './ai-factory.js';
import { AIProvider, ChatMessage } from './ai-types.js';
import { logger } from './logger.js';

config();

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  useCache?: boolean;
  systemPrompt?: string;
  cachedContext?: string;
  stop?: string[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalCost: number;
  cacheSavings: number;
}

export class ClaudeService {
  private provider: AIProvider;
  private model?: string;
  private tokenStats: TokenUsage;

  constructor(apiKey?: string, model?: string) {
    // If apiKey is provided, we create a specific provider, otherwise get configured one
    if (apiKey) {
      this.provider = AIFactory.createProvider('anthropic', { apiKey });
    } else {
      this.provider = AIFactory.getConfiguredProvider();
    }
    
    this.model = model;
    this.tokenStats = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
      cacheSavings: 0,
    };
  }

  /**
   * Send a message to the AI with optional prompt caching/system prompt
   */
  async chat(
    userMessage: string,
    options: ClaudeOptions = {}
  ): Promise<string> {
    const messages: ChatMessage[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    if (options.cachedContext) {
      // Append context to system prompt if provider doesn't support multiple system messages
      const lastMsg = messages.find(m => m.role === 'system');
      if (lastMsg) {
        lastMsg.content += '\n\nContext:\n' + options.cachedContext;
      } else {
        messages.push({ role: 'system', content: 'Context:\n' + options.cachedContext });
      }
    }

    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await this.provider.chat(messages, {
        model: options.model || this.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        stop: options.stop,
      });

      // Update estimated token stats (chars / 4)
      this.estimateTokenUsage(messages, response);

      return response;
    } catch (error) {
      logger.error('Error calling LLM Provider:', error instanceof Error ? error : new Error(String(error)), 'ClaudeService');
      throw error;
    }
  }

  /**
   * Multi-turn conversation with context
   */
  async conversation(
    messages: ClaudeMessage[],
    options: ClaudeOptions = {}
  ): Promise<string> {
    const chatMessages: ChatMessage[] = [];

    if (options.systemPrompt) {
      chatMessages.push({ role: 'system', content: options.systemPrompt });
    }

    chatMessages.push(...messages.map(m => ({ 
      role: m.role as any, 
      content: m.content 
    })));

    try {
      const response = await this.provider.chat(chatMessages, {
        model: options.model || this.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        stop: options.stop,
      });

      this.estimateTokenUsage(chatMessages, response);

      return response;
    } catch (error) {
      logger.error('Error calling LLM Provider:', error instanceof Error ? error : new Error(String(error)), 'ClaudeService');
      throw error;
    }
  }

  /**
   * Batch processing
   */
  async batchProcess(
    items: string[],
    processPrompt: (item: string) => string,
    options: ClaudeOptions = {}
  ): Promise<string[]> {
    const results: string[] = [];

    for (const item of items) {
      const userMessage = processPrompt(item);
      const result = await this.chat(userMessage, options);
      results.push(result);

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return results;
  }

  /**
   * Estimate token usage based on character counts
   */
  private estimateTokenUsage(messages: ChatMessage[], response: string) {
    const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const outputChars = response.length;

    // Standard heuristic: 1 token ~= 4 characters
    const inputTokens = Math.ceil(inputChars / 4);
    const outputTokens = Math.ceil(outputChars / 4);

    this.tokenStats.inputTokens += inputTokens;
    this.tokenStats.outputTokens += outputTokens;

    // Use Claude 3 Sonnet pricing for estimates if not local
    if (this.provider.id !== 'ollama') {
      const inputCost = (inputTokens / 1_000_000) * 3.00;
      const outputCost = (outputTokens / 1_000_000) * 15.00;
      this.tokenStats.totalCost += inputCost + outputCost;
    }
  }

  /**
   * Get token usage statistics
   */
  getTokenStats(): TokenUsage {
    return { ...this.tokenStats };
  }

  /**
   * Reset token statistics
   */
  resetStats() {
    this.tokenStats = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
      cacheSavings: 0,
    };
  }

  /**
   * Print token usage summary
   */
  printStats() {
    const isLocal = this.provider.id === 'ollama';
    console.log(`\n📊 Token Usage Statistics${isLocal ? ' (Estimated)' : ''}:`);
    console.log(`  Input tokens: ${this.tokenStats.inputTokens.toLocaleString()}`);
    console.log(`  Output tokens: ${this.tokenStats.outputTokens.toLocaleString()}`);
    if (!isLocal) {
      console.log(`  Total cost: $${this.tokenStats.totalCost.toFixed(4)}`);
    }
  }
}
