/**
 * Spell Checker - Levenshtein distance-based spell correction
 * Corrects misspellings in search queries using dictionary from database terms
 */

import { logger } from '../logger.js';
import Database from 'better-sqlite3';

export interface SpellSuggestion {
  original: string;
  term: string;
  correction: string;
  confidence: number;
  distance: number;
  frequency: number;
}

/**
 * SpellChecker class using Levenshtein distance
 */
export class SpellChecker {
  private dictionary: Map<string, number> = new Map();
  private maxDistance: number = 2;
  private maxCandidates: number = 5;
  private db: Database.Database;

  constructor(dbPathOrInstance: string | Database.Database = './db/knowledge.db') {
    this.db = typeof dbPathOrInstance === 'string' ? new Database(dbPathOrInstance) : dbPathOrInstance;
  }

  /**
   * Build dictionary from terms (tags, keywords, titles)
   */
  buildDictionary(terms?: Array<{ term: string; frequency: number }>): void {
    this.dictionary.clear();
    const entries = terms ?? this.loadTermsFromDatabase();

    for (const item of entries) {
      const normalized = item.term.toLowerCase();
      const existing = this.dictionary.get(normalized) || 0;
      this.dictionary.set(normalized, existing + item.frequency);
    }

    logger.info('Built spell dictionary with ' + this.dictionary.size + ' terms');
  }

  /**
   * Get dictionary entry count
   */
  getDictionarySize(): number {
    return this.dictionary.size;
  }

  private loadTermsFromDatabase(): Array<{ term: string; frequency: number }> {
    try {
      return this.db.prepare('SELECT term, frequency FROM spell_dictionary').all() as Array<{
        term: string;
        frequency: number;
      }>;
    } catch (error) {
      logger.warn('Failed to load spell dictionary terms from database', error);
      return [];
    }
  }

  /**
   * Check a query for spelling errors
   */
  checkQuery(query: string): SpellSuggestion[] {
    const words = query.toLowerCase().split(/\s+/);
    const suggestions: SpellSuggestion[] = [];

    for (const word of words) {
      // Find candidates
      const candidates = this.findCandidates(word);

      if (candidates.length > 0) {
        suggestions.push({
          original: word,
          term: candidates[0].term,
          correction: candidates[0].term,
          confidence: candidates[0].confidence,
          distance: candidates[0].distance,
          frequency: candidates[0].frequency
        });
      }
    }

    return suggestions;
  }

  /**
   * Find correction candidates using Levenshtein distance
   */
  private findCandidates(word: string): Array<{
    term: string;
    distance: number;
    frequency: number;
    confidence: number;
  }> {
    const candidates = [];

    for (const [term, frequency] of this.dictionary.entries()) {
      // Quick filter: length difference
      if (Math.abs(term.length - word.length) > this.maxDistance) {
        continue;
      }

      const distance = this.levenshteinDistance(word, term);

      if (distance <= this.maxDistance) {
        // Confidence scoring
        const distanceFactor = 1 - (distance / this.maxDistance);
        const frequencyFactor = Math.log(frequency + 1) / 10;
        const confidence = distanceFactor * (0.7 + 0.3 * frequencyFactor);

        candidates.push({
          term,
          distance,
          frequency,
          confidence
        });
      }
    }

    // Sort by confidence and return top N
    return candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxCandidates);
  }

  /**
   * Levenshtein distance implementation (edit distance)
   */
  public levenshteinDistance(a: string, b: string): number {
    const lenA = a.length;
    const lenB = b.length;

    const matrix: number[][] = Array.from({ length: lenA + 1 }, () =>
      Array(lenB + 1).fill(0)
    );

    for (let i = 0; i <= lenA; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= lenB; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );

        if (
          i > 1 &&
          j > 1 &&
          a[i - 1] === b[j - 2] &&
          a[i - 2] === b[j - 1]
        ) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
        }
      }
    }

    return matrix[lenA][lenB];
  }

  /**
   * Get dictionary statistics
   */
  getStats(): { totalTerms: number; totalFrequency: number; avgFrequency: number } {
    let totalFrequency = 0;

    for (const freq of this.dictionary.values()) {
      totalFrequency += freq;
    }

    return {
      totalTerms: this.dictionary.size,
      totalFrequency,
      avgFrequency: this.dictionary.size > 0 ? totalFrequency / this.dictionary.size : 0
    };
  }
}

export function createSpellChecker(): SpellChecker {
  return new SpellChecker();
}
