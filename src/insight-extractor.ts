/**
 * Intelligent insight extraction using Claude
 */

import { ClaudeService } from './claude-service.js';
import { Conversation, AtomicUnit, AtomicUnitType } from './types.js';
import { randomUUID } from 'crypto';

export interface ExtractedInsight {
  type: AtomicUnitType;
  title: string;
  content: string;
  tags: string[];
  category: string;
  keywords: string[];
  importance: 'high' | 'medium' | 'low';
  relatedTopics: string[];
}

export class InsightExtractor {
  private claude: ClaudeService;
  private systemPrompt = `You are an expert at extracting key insights from technical conversations.

Your task is to identify the most valuable, reusable knowledge from conversation transcripts.

Focus on:
- Technical insights and best practices
- Decision rationale and trade-offs
- Code patterns and solutions
- Important learnings and realizations
- Actionable recommendations

Output JSON format:
{
  "insights": [
    {
      "type": "insight" | "code" | "decision" | "reference",
      "title": "Brief descriptive title",
      "content": "The actual insight or learning",
      "tags": ["relevant", "tags"],
      "category": "programming" | "writing" | "research" | "design",
      "keywords": ["key", "terms"],
      "importance": "high" | "medium" | "low",
      "relatedTopics": ["related concepts"]
    }
  ]
}

Guidelines:
- Extract 3-10 insights per conversation (quality over quantity)
- Each insight should be self-contained and understandable
- Focus on what's reusable, not conversation-specific details
- Identify implicit knowledge, not just explicit statements`;

  constructor(claude?: ClaudeService) {
    this.claude = claude || new ClaudeService();
  }

  /**
   * Extract insights from a conversation
   */
  async extractInsights(conversation: Conversation): Promise<AtomicUnit[]> {
    console.log(`🔍 Extracting insights from: ${conversation.title}`);

    // Prepare conversation text
    const conversationText = this.prepareConversationText(conversation);

    // Use Claude to extract insights
    const prompt = `Analyze this conversation and extract the key technical insights:\n\n${conversationText}`;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: this.systemPrompt,
        maxTokens: 4096,
        temperature: 0.3, // Lower temp for more focused extraction
        useCache: true,
      });

      // Parse JSON response
      const parsed = this.parseInsightsResponse(response);

      // Convert to atomic units
      const units = parsed.insights.map(insight => this.insightToAtomicUnit(insight, conversation));

      console.log(`  ✅ Extracted ${units.length} insights`);
      return units;
    } catch (error) {
      console.error(`  ❌ Failed to extract insights:`, error);
      return [];
    }
  }

  /**
   * Extract insights from multiple conversations in batch
   */
  async extractBatch(conversations: Conversation[]): Promise<Map<string, AtomicUnit[]>> {
    const results = new Map<string, AtomicUnit[]>();

    console.log(`\n🔬 Extracting insights from ${conversations.length} conversations...\n`);

    for (const conv of conversations) {
      const insights = await this.extractInsights(conv);
      results.set(conv.id, insights);

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Print statistics
    this.claude.printStats();

    return results;
  }

  /**
   * Prepare conversation text for Claude
   */
  private prepareConversationText(conversation: Conversation): string {
    const messages = conversation.messages
      .map((msg, i) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
      .join('\n\n');

    return `Title: ${conversation.title}\n\n${messages}`;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseInsightsResponse(response: string): { insights: ExtractedInsight[] } {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in response');
        return { insights: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (error) {
      console.error('Failed to parse insights JSON:', error);
      return { insights: [] };
    }
  }

  /**
   * Convert extracted insight to atomic unit
   */
  private insightToAtomicUnit(
    insight: ExtractedInsight,
    conversation: Conversation
  ): AtomicUnit {
    return {
      id: randomUUID(),
      type: insight.type,
      timestamp: new Date(),
      title: insight.title,
      content: insight.content,
      context: `Extracted from: ${conversation.title}`,
      tags: [...insight.tags, 'claude-extracted', `importance-${insight.importance}`],
      category: insight.category,
      conversationId: conversation.id,
      relatedUnits: [],
      keywords: insight.keywords,
    };
  }

  /**
   * Get token usage statistics
   */
  getStats() {
    return this.claude.getTokenStats();
  }
}
