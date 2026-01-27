/**
 * Smart auto-tagging using Claude with batch processing support
 */

import { ClaudeService } from './claude-service.js';
import { BatchProcessor } from './batch-processor.js';
import { AtomicUnit } from './types.js';
import { normalizeCategory, normalizeKeywords, normalizeTags } from './taxonomy.js';

export interface TagSuggestions {
  tags: string[];
  category: string;
  keywords: string[];
  confidence: number;
}

export class SmartTagger {
  private claude: ClaudeService;
  private batchProcessor?: BatchProcessor;
  private systemPrompt = `You are an expert at categorizing and tagging technical content.

Your task is to analyze content and generate relevant, useful tags.

Guidelines for tags:
- Use lowercase, hyphenated format (e.g., "error-handling", "react-hooks")
- Include programming languages, frameworks, and technologies
- Add conceptual tags (e.g., "security", "performance", "best-practices")
- Be specific but not overly granular
- 3-8 tags per item

Categories:
- programming: Code, algorithms, software development
- writing: Documentation, articles, communication
- research: Analysis, investigation, learning
- design: UI/UX, architecture, system design
- devops: Deployment, infrastructure, CI/CD
- data: Databases, data structures, analytics
- general: Anything that doesn't clearly fit above

Output JSON format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "category": "programming",
  "keywords": ["keyword1", "keyword2"],
  "confidence": 0.95
}`;

  constructor(claude?: ClaudeService, batchProcessor?: BatchProcessor) {
    this.claude = claude || new ClaudeService();
    const isTest = process.env.NODE_ENV === 'test';
    this.batchProcessor = batchProcessor || new BatchProcessor('.batch-checkpoints', {
      concurrency: 1,
      delayMs: isTest ? 0 : 200,
      retries: 0,
      checkpointInterval: 20,
      progressBar: !isTest,
    });
  }

  /**
   * Generate smart tags for a single atomic unit
   */
  async tagUnit(unit: AtomicUnit, options?: { allowFallback?: boolean }): Promise<TagSuggestions> {
    const prompt = `Analyze this content and suggest tags:

Title: ${unit.title}
Content: ${unit.content.slice(0, 1000)}

Provide tags, category, keywords, and confidence (0-1).`;

    const allowFallback = options?.allowFallback ?? true;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: this.systemPrompt,
        maxTokens: 500,
        temperature: 0.2,
        useCache: true,
      });

      return this.parseTagResponse(response);
    } catch (error) {
      console.error('Failed to generate tags:', error);
      if (allowFallback) {
        return {
          tags: [],
          category: normalizeCategory('general'),
          keywords: [],
          confidence: 0,
        };
      }
      throw error;
    }
  }

  /**
   * Tag multiple units in batch with progress tracking
   */
  async tagBatch(units: AtomicUnit[]): Promise<Map<string, TagSuggestions>> {
    const results = new Map<string, TagSuggestions>();

    console.log(`\n🏷️  Generating smart tags for ${units.length} units...\n`);

    // Check for checkpoint and resume if needed
    let startIndex = 0;
    if (this.batchProcessor?.hasCheckpoint()) {
      console.log('📂 Found checkpoint, resuming from previous progress...\n');
      const { results: checkpointResults } = this.batchProcessor.loadCheckpoint<AtomicUnit>();
      checkpointResults.forEach((result) => {
        if (result.success) {
          results.set(result.item.id, result.result);
        }
      });
      startIndex = checkpointResults.size;
    }

    // Process remaining units with batch processor
    const unitsToProcess = units.slice(startIndex);

    if (unitsToProcess.length > 0) {
      const batchResults = await this.batchProcessor!.process(
        unitsToProcess,
        async (unit) => {
          return await this.tagUnit(unit, { allowFallback: false });
        }
      );

      // Merge batch results
      batchResults.forEach((result) => {
        if (result.success) {
          results.set(result.item.id, result.result);
        }
      });
    }

    console.log(`\n✅ Tagged ${results.size} units`);
    this.claude.printStats();

    return results;
  }

  /**
   * Update an atomic unit with smart tags
   */
  async enhanceUnit(unit: AtomicUnit): Promise<AtomicUnit> {
    const suggestions = await this.tagUnit(unit);
    const suggestedCategory = normalizeCategory(suggestions.category);
    const shouldUpdateCategory =
      suggestedCategory !== 'general' || !unit.category || unit.category === 'general';

    return {
      ...unit,
      tags: [...new Set([...unit.tags, ...suggestions.tags])],
      category: shouldUpdateCategory ? suggestedCategory : unit.category,
      keywords: [...new Set([...unit.keywords, ...suggestions.keywords])],
    };
  }

  /**
   * Parse Claude's tag response
   */
  private parseTagResponse(response: string): TagSuggestions {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          tags: [],
          category: normalizeCategory('general'),
          keywords: [],
          confidence: 0,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<TagSuggestions>;
      const tags = normalizeTags(parsed.tags || []);
      const category = normalizeCategory(parsed.category || 'general');
      const keywords = normalizeKeywords(parsed.keywords || []);
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

      return { tags, category, keywords, confidence };
    } catch (error) {
      return {
        tags: [],
        category: normalizeCategory('general'),
        keywords: [],
        confidence: 0,
      };
    }
  }

  /**
   * Suggest tags from raw content (for API use without full AtomicUnit)
   */
  async suggestTags(input: { content: string; title?: string; type?: string }): Promise<TagSuggestions> {
    const prompt = `Analyze this content and suggest tags:

Title: ${input.title || 'Untitled'}
Content: ${input.content.slice(0, 1000)}

Respond with JSON containing:
- tags: array of 3-7 relevant tags
- category: programming/writing/research/design/general
- keywords: key technical terms
- confidence: 0-1 score`;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: this.systemPrompt,
        maxTokens: 1024,
        temperature: 0.2,
        useCache: true,
      });

      return this.parseTagResponse(response);
    } catch (error) {
      console.error('Failed to suggest tags:', error);
      return {
        tags: [],
        category: normalizeCategory('general'),
        keywords: [],
        confidence: 0,
      };
    }
  }

  /**
   * Get token usage statistics
   */
  getStats() {
    const stats =
      typeof this.claude.getTokenStats === 'function'
        ? this.claude.getTokenStats()
        : undefined;

    return (
      stats || {
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cacheSavings: 0,
      }
    );
  }
}
