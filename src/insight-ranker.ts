/**
 * Insight ranking and categorization system
 * Ranks insights by importance, recency, relevance, and uniqueness
 */

import { AtomicUnit } from './types.js';

export interface InsightScore {
  unitId: string;
  importance: number;      // 0-1 (from ExtractedInsight)
  recency: number;        // 0-1 (newer is higher)
  relevance: number;      // 0-1 (based on keyword match)
  uniqueness: number;     // 0-1 (less common topics)
  combined: number;       // Weighted average
}

export interface RankedInsight {
  unit: AtomicUnit;
  score: InsightScore;
  category: string;       // Categorized by topic
  rationale: string;      // Why this insight is ranked this way
}

export type InsightCategory = 
  | 'technical'
  | 'architectural'
  | 'best-practice'
  | 'tooling'
  | 'decision'
  | 'performance'
  | 'security'
  | 'other';

/**
 * Rank and categorize insights based on multiple criteria
 */
export class InsightRanker {
  private importanceWeight = 0.4;    // 40%
  private recencyWeight = 0.2;       // 20%
  private relevanceWeight = 0.25;    // 25%
  private uniquenessWeight = 0.15;   // 15%

  /**
   * Rank insights with combined scoring
   */
  rankInsights(insights: AtomicUnit[], query?: string): RankedInsight[] {
    const scores = insights.map((unit) => this.calculateInsightScore(unit, query));

    // Sort by combined score descending
    const ranked = scores.sort((a, b) => b.combined - a.combined);

    // Map back to RankedInsight with categorization
    return ranked.map((score) => {
      const unit = insights.find((u) => u.id === score.unitId)!;
      const category = this.categorizeInsight(unit);
      const rationale = this.generateRationale(score, category);

      return {
        unit,
        score,
        category,
        rationale,
      };
    });
  }

  /**
   * Calculate composite score for an insight
   */
  private calculateInsightScore(unit: AtomicUnit, query?: string): InsightScore {
    // Extract importance from tags (importance-high/medium/low)
    const importance = this.extractImportance(unit.tags);

    // Calculate recency (0-1, normalized from timestamp)
    const recency = this.calculateRecency(unit.timestamp);

    // Calculate relevance to query (0-1)
    const relevance = query ? this.calculateRelevance(unit, query) : 0.5;

    // Calculate uniqueness based on tag diversity
    const uniqueness = this.calculateUniqueness(unit.keywords, unit.tags);

    // Calculate weighted combined score
    const combined =
      importance * this.importanceWeight +
      recency * this.recencyWeight +
      relevance * this.relevanceWeight +
      uniqueness * this.uniquenessWeight;

    return {
      unitId: unit.id,
      importance,
      recency,
      relevance,
      uniqueness,
      combined,
    };
  }

  /**
   * Extract importance level from tags
   */
  private extractImportance(tags: string[]): number {
    if (tags.includes('importance-high')) return 1.0;
    if (tags.includes('importance-medium')) return 0.6;
    if (tags.includes('importance-low')) return 0.3;
    return 0.5; // Default
  }

  /**
   * Calculate recency score (0-1)
   */
  private calculateRecency(timestamp: Date): number {
    const now = Date.now();
    const unitTime = timestamp.getTime();
    const ageMs = now - unitTime;

    // Normalize: 0 days = 1.0, 90 days = 0.0
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const maxAgeDays = 90;

    return Math.max(0, 1 - ageDays / maxAgeDays);
  }

  /**
   * Calculate relevance to query (0-1)
   */
  private calculateRelevance(unit: AtomicUnit, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const content = `${unit.title} ${unit.content} ${unit.keywords.join(' ')}`.toLowerCase();

    let matchCount = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchCount++;
      }
    }

    return Math.min(1, matchCount / queryTerms.length);
  }

  /**
   * Calculate uniqueness based on keyword diversity
   */
  private calculateUniqueness(keywords: string[], tags: string[]): number {
    const allTerms = [...keywords, ...tags];
    const uniqueTerms = new Set(allTerms);

    // Higher diversity = higher uniqueness
    const diversity = uniqueTerms.size / Math.max(allTerms.length, 1);

    // Also factor in how specific tags are (longer tags = more specific = more unique)
    const specificity =
      tags.filter((tag) => tag.length > 10).length / Math.max(tags.length, 1);

    return (diversity + specificity) / 2;
  }

  /**
   * Categorize insight by topic
   */
  private categorizeInsight(unit: AtomicUnit): InsightCategory {
    const content = `${unit.title} ${unit.content} ${unit.tags.join(' ')}`.toLowerCase();

    // Technical patterns
    if (
      /^code|snippet|implementation|algorithm|pattern|data-structure|api/.test(
        unit.type
      ) ||
      /code|implementation|algorithm|syntax|function|method/.test(content)
    ) {
      return 'technical';
    }

    // Architectural patterns
    if (/architecture|design|system|scale|infrastructure|pattern/.test(content)) {
      return 'architectural';
    }

    // Best practices
    if (
      /best-practice|convention|standard|guideline|principle|pattern|idiom/.test(
        content
      )
    ) {
      return 'best-practice';
    }

    // Tooling and libraries
    if (/tool|library|framework|package|library|plugin|extension/.test(content)) {
      return 'tooling';
    }

    // Decisions and trade-offs
    if (unit.type === 'decision' || /decision|tradeoff|trade-off|chose|selected/.test(content)) {
      return 'decision';
    }

    // Performance optimizations
    if (/performance|optimization|speed|efficiency|throughput|latency/.test(content)) {
      return 'performance';
    }

    // Security
    if (/security|encryption|authentication|authorization|vulnerability|attack/.test(content)) {
      return 'security';
    }

    return 'other';
  }

  /**
   * Generate rationale for ranking
   */
  private generateRationale(score: InsightScore, category: InsightCategory): string {
    const factors: string[] = [];

    if (score.importance >= 0.8) {
      factors.push('high importance');
    }

    if (score.recency >= 0.7) {
      factors.push('recently added');
    }

    if (score.uniqueness >= 0.7) {
      factors.push('unique perspective');
    }

    if (score.combined >= 0.8) {
      factors.push('highly relevant');
    }

    const factorStr = factors.length > 0 ? factors.join(', ') : 'solid match';
    return `${category} insight: ${factorStr}`;
  }

  /**
   * Group insights by category
   */
  categorizeInsights(insights: AtomicUnit[]): Map<InsightCategory, AtomicUnit[]> {
    const categorized = new Map<InsightCategory, AtomicUnit[]>();

    for (const insight of insights) {
      const category = this.categorizeInsight(insight);

      if (!categorized.has(category)) {
        categorized.set(category, []);
      }

      categorized.get(category)!.push(insight);
    }

    return categorized;
  }

  /**
   * Get statistics about insight distribution
   */
  getInsightStats(insights: AtomicUnit[]): {
    total: number;
    byCategory: Record<InsightCategory, number>;
    averageScore: number;
    topScores: number[];
  } {
    const categorized = this.categorizeInsights(insights);
    const scores = insights.map((u) => this.calculateInsightScore(u).combined);

    return {
      total: insights.length,
      byCategory: {
        technical: categorized.get('technical')?.length || 0,
        architectural: categorized.get('architectural')?.length || 0,
        'best-practice': categorized.get('best-practice')?.length || 0,
        tooling: categorized.get('tooling')?.length || 0,
        decision: categorized.get('decision')?.length || 0,
        performance: categorized.get('performance')?.length || 0,
        security: categorized.get('security')?.length || 0,
        other: categorized.get('other')?.length || 0,
      },
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      topScores: scores.sort((a, b) => b - a).slice(0, 5),
    };
  }

  /**
   * Set custom weights for scoring
   */
  setWeights(weights: {
    importance?: number;
    recency?: number;
    relevance?: number;
    uniqueness?: number;
  }): void {
    if (weights.importance !== undefined) this.importanceWeight = weights.importance;
    if (weights.recency !== undefined) this.recencyWeight = weights.recency;
    if (weights.relevance !== undefined) this.relevanceWeight = weights.relevance;
    if (weights.uniqueness !== undefined) this.uniquenessWeight = weights.uniqueness;

    // Normalize weights
    const total =
      this.importanceWeight +
      this.recencyWeight +
      this.relevanceWeight +
      this.uniquenessWeight;
    this.importanceWeight /= total;
    this.recencyWeight /= total;
    this.relevanceWeight /= total;
    this.uniquenessWeight /= total;
  }
}
