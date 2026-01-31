import { AIProvider, ChatMessage, ChatOptions, EmbeddingOptions, ProviderConfig } from './ai-types.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig, LlmConfig } from './config.js';

/**
 * OpenAI Provider (Cloud or Compatible Local/Ollama)
 */
class OpenAIProvider implements AIProvider {
  id: string = 'openai';
  name: string = 'OpenAI Compatible';
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey || 'not-needed-for-local',
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
    });
    this.defaultModel = config.model || 'gpt-4o';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      stop: options?.stop,
    });
    return response.choices[0].message.content || '';
  }

  async embed(text: string | string[], options?: EmbeddingOptions): Promise<number[][]> {
    const input = Array.isArray(text) ? text : [text];
    const response = await this.client.embeddings.create({
      model: options?.model || 'text-embedding-3-small',
      input,
      dimensions: options?.dimensions,
    });
    return response.data.map(d => d.embedding);
  }

  async getModels(): Promise<string[]> {
    try {
      const list = await this.client.models.list();
      return list.data.map(m => m.id);
    } catch (e) {
      console.warn('Failed to fetch OpenAI models:', e);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Anthropic Provider
 */
class AnthropicProvider implements AIProvider {
  id: string = 'anthropic';
  name: string = 'Anthropic';
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
    });
    this.defaultModel = config.model || 'claude-3-5-sonnet-20241022';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    // Convert system message if present
    const systemMsg = messages.find(m => m.role === 'system');
    const conversation = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: options?.model || this.defaultModel,
      messages: conversation.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: systemMsg?.content,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens || 4096,
      stop_sequences: options?.stop,
    });

    const content = response.content[0];
    if (content.type === 'text') return content.text;
    return '';
  }

  async embed(text: string | string[], options?: EmbeddingOptions): Promise<number[][]> {
    throw new Error('Anthropic does not support embeddings directly.');
  }

  async getModels(): Promise<string[]> {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Ollama Provider
 */
class OllamaProvider extends OpenAIProvider {
  override id: string = 'ollama';
  override name: string = 'Ollama (Local)';

  constructor(config: ProviderConfig) {
    super({
      apiKey: 'ollama',
      baseUrl: config.baseUrl || 'http://localhost:11434/v1',
      model: config.model,
      timeoutMs: config.timeoutMs,
    });
  }
}

/**
 * AI Factory
 */
export class AIFactory {
  static createProvider(type: 'openai' | 'anthropic' | 'ollama' | 'local' | 'custom', config: ProviderConfig): AIProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'ollama':
      case 'local':
        return new OllamaProvider(config);
      case 'custom':
        return new OpenAIProvider(config);
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  static getConfiguredProvider(): AIProvider {
    const conf = getConfig().getAll();
    const llm = (conf.llm || { provider: 'anthropic' }) as Partial<LlmConfig>;
    
    let apiKey = llm.apiKey;
    if (!apiKey) {
      if (llm.provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY;
      if (llm.provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
    }

    return AIFactory.createProvider(llm.provider as any || 'anthropic', {
      apiKey,
      baseUrl: llm.baseUrl,
      model: llm.model,
    });
  }

  static getEmbeddingProvider(): AIProvider {
    const conf = getConfig().getAll();
    const emb = conf.embedding || { provider: 'openai' };

    let apiKey = undefined;
    if (emb.provider === 'openai') apiKey = process.env.OPENAI_API_KEY;

    if (emb.provider === 'local') {
      return new OllamaProvider({
        baseUrl: 'http://localhost:11434/v1'
      });
    }

    return AIFactory.createProvider(emb.provider as any || 'openai', {
      apiKey,
      baseUrl: undefined
    });
  }
}
