/**
 * Smart auto-tagging using Claude
 */

import { ClaudeService } from './claude-service.js';
import { AtomicUnit } from './types.js';

export interface TagSuggestions {
  tags: string[];
  category: string;
  keywords: string[];
  confidence: number;
}

export class SmartTagger {
  private claude: ClaudeService;
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

Output JSON format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "category": "programming",
  "keywords": ["keyword1", "keyword2"],
  "confidence": 0.95
}`;

  constructor(claude?: ClaudeService) {
    this.claude = claude || new ClaudeService();
  }

  /**
   * Generate smart tags for a single atomic unit
   */
  async tagUnit(unit: AtomicUnit): Promise<TagSuggestions> {
    const prompt = `Analyze this content and suggest tags:

Title: ${unit.title}
Content: ${unit.content.slice(0, 1000)}

Provide tags, category, keywords, and confidence (0-1).`;

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
      return {
        tags: [],
        category: 'general',
        keywords: [],
        confidence: 0,
      };
    }
  }

  /**
   * Tag multiple units in batch
   */
  async tagBatch(units: AtomicUnit[]): Promise<Map<string, TagSuggestions>> {
    const results = new Map<string, TagSuggestions>();

    console.log(`\n🏷️  Generating smart tags for ${units.length} units...\n`);

    for (const unit of units) {
      console.log(`  Tagging: ${unit.title.slice(0, 50)}...`);
      const tags = await this.tagUnit(unit);
      results.set(unit.id, tags);

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
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

    return {
      ...unit,
      tags: [...new Set([...unit.tags, ...suggestions.tags])],
      category: suggestions.category || unit.category,
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
          category: 'general',
          keywords: [],
          confidence: 0,
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return {
        tags: [],
        category: 'general',
        keywords: [],
        confidence: 0,
      };
    }
  }

  /**
   * Get token usage statistics
   */
  getStats() {
    return this.claude.getTokenStats();
  }
}
