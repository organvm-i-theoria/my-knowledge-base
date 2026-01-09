/**
 * Spell Checker - Levenshtein distance-based spell correction
 * Corrects misspellings in search queries using dictionary from database terms
 */

import { logger } from '../logger.js';

export interface SpellSuggestion {
  original: string;
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

  /**
   * Build dictionary from terms (tags, keywords, titles)
   */
  buildDictionary(terms: Array<{ term: string; frequency: number }>): void {
    this.dictionary.clear();

    for (const item of terms) {
      const normalized = item.term.toLowerCase();
      const existing = this.dictionary.get(normalized) || 0;
      this.dictionary.set(normalized, existing + item.frequency);
    }

    logger.info('Built spell dictionary with ' + this.dictionary.size + ' terms');
  }

  /**
   * Check a query for spelling errors
   */
  checkQuery(query: string): SpellSuggestion[] {
    const words = query.toLowerCase().split(/\s+/);
    const suggestions: SpellSuggestion[] = [];

    for (const word of words) {
      // Skip if word is in dictionary
      if (this.dictionary.has(word)) continue;

      // Find candidates
      const candidates = this.findCandidates(word);

      if (candidates.length > 0) {
        suggestions.push({
          original: word,
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

      if (distance <= this.maxDistance && distance > 0) {
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
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix using dynamic programming
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
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
