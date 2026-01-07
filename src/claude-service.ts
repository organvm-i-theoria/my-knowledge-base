/**
 * Claude service with prompt caching for token optimization
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

config();

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  useCache?: boolean;
  systemPrompt?: string;
  cachedContext?: string;
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
  private client: Anthropic;
  private model: string;
  private tokenStats: TokenUsage;

  constructor(apiKey?: string, model: string = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
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
   * Send a message to Claude with optional prompt caching
   */
  async chat(
    userMessage: string,
    options: ClaudeOptions = {}
  ): Promise<string> {
    const {
      model = this.model,
      maxTokens = 4096,
      temperature = 1,
      useCache = false,
      systemPrompt,
      cachedContext,
    } = options;

    // Build system messages with caching
    const systemMessages: Anthropic.Messages.MessageCreateParams['system'] = [];

    if (systemPrompt) {
      systemMessages.push({
        type: 'text',
        text: systemPrompt,
        ...(useCache && { cache_control: { type: 'ephemeral' } }),
      });
    }

    if (cachedContext) {
      systemMessages.push({
        type: 'text',
        text: cachedContext,
        ...(useCache && { cache_control: { type: 'ephemeral' } }),
      });
    }

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessages.length > 0 ? systemMessages : undefined,
        messages: [{ role: 'user', content: userMessage }],
      });

      // Track token usage
      this.updateTokenStats(response.usage);

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      return textContent ? (textContent as any).text : '';
    } catch (error) {
      console.error('Error calling Claude:', error);
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
    const {
      model = this.model,
      maxTokens = 4096,
      temperature = 1,
      useCache = false,
      systemPrompt,
      cachedContext,
    } = options;

    const systemMessages: Anthropic.Messages.MessageCreateParams['system'] = [];

    if (systemPrompt) {
      systemMessages.push({
        type: 'text',
        text: systemPrompt,
        ...(useCache && { cache_control: { type: 'ephemeral' } }),
      });
    }

    if (cachedContext) {
      systemMessages.push({
        type: 'text',
        text: cachedContext,
        ...(useCache && { cache_control: { type: 'ephemeral' } }),
      });
    }

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessages.length > 0 ? systemMessages : undefined,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });

      this.updateTokenStats(response.usage);

      const textContent = response.content.find(c => c.type === 'text');
      return textContent ? (textContent as any).text : '';
    } catch (error) {
      console.error('Error calling Claude:', error);
      throw error;
    }
  }

  /**
   * Batch processing with prompt caching
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
   * Update token usage statistics
   */
  private updateTokenStats(usage: any) {
    this.tokenStats.inputTokens += usage.input_tokens || 0;
    this.tokenStats.outputTokens += usage.output_tokens || 0;
    this.tokenStats.cacheCreationTokens! += usage.cache_creation_input_tokens || 0;
    this.tokenStats.cacheReadTokens! += usage.cache_read_input_tokens || 0;

    // Calculate costs (Claude Sonnet 4.5 pricing)
    const inputCost = (usage.input_tokens || 0) * (3 / 1_000_000); // $3/MTok
    const outputCost = (usage.output_tokens || 0) * (15 / 1_000_000); // $15/MTok
    const cacheWriteCost = (usage.cache_creation_input_tokens || 0) * (3.75 / 1_000_000); // $3.75/MTok
    const cacheReadCost = (usage.cache_read_input_tokens || 0) * (0.3 / 1_000_000); // $0.30/MTok

    this.tokenStats.totalCost += inputCost + outputCost + cacheWriteCost + cacheReadCost;

    // Calculate cache savings (compared to non-cached)
    const wouldHaveCost = (usage.cache_read_input_tokens || 0) * (3 / 1_000_000);
    const actualCost = cacheReadCost;
    this.tokenStats.cacheSavings += wouldHaveCost - actualCost;
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
    console.log('\n📊 Token Usage Statistics:');
    console.log(`  Input tokens: ${this.tokenStats.inputTokens.toLocaleString()}`);
    console.log(`  Output tokens: ${this.tokenStats.outputTokens.toLocaleString()}`);
    console.log(`  Cache writes: ${this.tokenStats.cacheCreationTokens!.toLocaleString()}`);
    console.log(`  Cache reads: ${this.tokenStats.cacheReadTokens!.toLocaleString()}`);
    console.log(`  Total cost: $${this.tokenStats.totalCost.toFixed(4)}`);
    console.log(`  Cache savings: $${this.tokenStats.cacheSavings.toFixed(4)} (${this.getCacheSavingsPercent()}%)`);
  }

  /**
   * Calculate cache savings percentage
   */
  private getCacheSavingsPercent(): number {
    if (this.tokenStats.totalCost === 0) return 0;
    return ((this.tokenStats.cacheSavings / (this.tokenStats.totalCost + this.tokenStats.cacheSavings)) * 100).toFixed(1) as any;
  }
}
