/**
 * Smart Unit Deduplication and Merging
 * Detects and intelligently merges duplicate or similar knowledge units
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'deduplication' });

/**
 * Similarity score and details
 */
export interface SimilarityResult {
  unit1Id: string;
  unit2Id: string;
  similarity: number;
  type: 'duplicate' | 'very-similar' | 'related';
  reason: string;
  details: {
    titleSimilarity: number;
    keywordOverlap: number;
    contentLength: number;
    categoryMatch: boolean;
  };
}

/**
 * Merge operation result
 */
export interface MergeResult {
  survivingId: string;
  removedId: string;
  mergedUnit: any;
  mergeStrategy: string;
  timestamp: Date;
  preserved: {
    fromUnit1: string[];
    fromUnit2: string[];
  };
}

/**
 * Unit Deduplicator
 */
export class UnitDeduplicator {
  private similarityThreshold: number = 0.7;
  private mergeHistory: MergeResult[] = [];
  
  constructor(similarityThreshold: number = 0.7) {
    this.similarityThreshold = similarityThreshold;
  }
  
  /**
   * Find all potential duplicates in a unit set
   */
  findDuplicates(units: any[]): SimilarityResult[] {
    const duplicates: SimilarityResult[] = [];
    
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const similarity = this.calculateSimilarity(units[i], units[j]);
        
        if (similarity.similarity >= this.similarityThreshold) {
          duplicates.push(similarity);
        }
      }
    }
    
    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }
  
  /**
   * Calculate similarity between two units
   */
  private calculateSimilarity(unit1: any, unit2: any): SimilarityResult {
    const titleSimilarity = this.stringSimilarity(unit1.title, unit2.title);
    const contentSimilarity = this.stringSimilarity(unit1.content || '', unit2.content || '');
    const keywordOverlap = this.jacardSimilarity(
      unit1.keywords || [],
      unit2.keywords || []
    );
    const categoryMatch = unit1.category === unit2.category ? 1 : 0;

    let overallSimilarity = (titleSimilarity * 0.5 + keywordOverlap * 0.3 + categoryMatch * 0.2);
    if (titleSimilarity >= 0.95 && contentSimilarity >= 0.9) {
      overallSimilarity = Math.max(overallSimilarity, 1);
    }

    let type: 'duplicate' | 'very-similar' | 'related' = 'related';
    if (overallSimilarity >= 0.9) {
      type = 'duplicate';
    } else if (overallSimilarity >= 0.7) {
      type = 'very-similar';
    }
    
    return {
      unit1Id: unit1.id,
      unit2Id: unit2.id,
      similarity: overallSimilarity,
      type,
      reason: this.generateReason(unit1, unit2, overallSimilarity),
      details: {
        titleSimilarity,
        keywordOverlap,
        contentLength: (unit1.content || '').length,
        categoryMatch: categoryMatch === 1,
      },
    };
  }
  
  /**
   * String similarity using Levenshtein distance
   */
  private stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1;
    if (!s1 || !s2) return 0;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }
    
    return costs[s2.length];
  }
  
  /**
   * Jaccard similarity for arrays
   */
  private jacardSimilarity(arr1: string[], arr2: string[]): number {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
  
  /**
   * Generate human-readable reason for similarity
   */
  private generateReason(unit1: any, unit2: any, similarity: number): string {
    if (similarity >= 0.9) {
      return 'Likely duplicate: very similar titles and keywords';
    } else if (similarity >= 0.7) {
      return 'Likely duplicate with minor variations';
    } else {
      return 'Related units with overlapping content';
    }
  }
  
  /**
   * Merge two units
   */
  merge(unit1: any, unit2: any, keepUnit1: boolean = true): MergeResult {
    const survivingUnit = keepUnit1 ? unit1 : unit2;
    const removedUnit = keepUnit1 ? unit2 : unit1;
    
    const mergedUnit = {
      ...survivingUnit,
      keywords: Array.from(new Set([
        ...(survivingUnit.keywords || []),
        ...(removedUnit.keywords || []),
      ])),
      tags: Array.from(new Set([
        ...(survivingUnit.tags || []),
        ...(removedUnit.tags || []),
      ])),
      relatedUnits: Array.from(new Set([
        ...(survivingUnit.relatedUnits || []),
        ...(removedUnit.relatedUnits || []),
      ])).filter(id => id !== removedUnit.id),
      content: this.mergeContent(survivingUnit.content, removedUnit.content),
      mergedFrom: [survivingUnit.id, removedUnit.id],
      mergedAt: new Date(),
    };
    
    const result: MergeResult = {
      survivingId: survivingUnit.id,
      removedId: removedUnit.id,
      mergedUnit,
      mergeStrategy: 'smart-merge-with-deduplication',
      timestamp: new Date(),
      preserved: {
        fromUnit1: ['title', 'category', 'type'],
        fromUnit2: ['keywords', 'tags', 'related units'],
      },
    };
    
    this.mergeHistory.push(result);
    logger.info('Merged unit ' + removedUnit.id + ' into ' + survivingUnit.id);
    
    return result;
  }
  
  /**
   * Intelligently merge content
   */
  private mergeContent(content1: string | undefined, content2: string | undefined): string {
    if (!content1) return content2 || '';
    if (!content2) return content1;
    
    if (content1.length >= content2.length) {
      return content1;
    }
    return content2;
  }
  
  /**
   * Get merge history
   */
  getMergeHistory(): MergeResult[] {
    return this.mergeHistory;
  }
  
  /**
   * Clear merge history
   */
  clearHistory(): void {
    this.mergeHistory = [];
  }
}

/**
 * Batch Deduplicator for large unit sets
 */
export class BatchDeduplicator {
  private deduplicator: UnitDeduplicator;
  
  constructor(similarityThreshold: number = 0.7) {
    this.deduplicator = new UnitDeduplicator(similarityThreshold);
  }
  
  /**
   * Deduplicate a set of units
   */
  deduplicate(
    units: any[],
    autoMerge: boolean = false
  ): {
    cleaned: any[];
    duplicates: SimilarityResult[];
    merges: MergeResult[];
  } {
    const duplicates = this.deduplicator.findDuplicates(units);
    const merges: MergeResult[] = [];
    const unitMap = new Map(units.map(u => [u.id, u]));
    
    if (autoMerge) {
      const processed = new Set<string>();
      
      for (const dup of duplicates) {
        if (!processed.has(dup.unit1Id) && !processed.has(dup.unit2Id)) {
          const unit1 = unitMap.get(dup.unit1Id);
          const unit2 = unitMap.get(dup.unit2Id);
          
          if (unit1 && unit2) {
            const merge = this.deduplicator.merge(unit1, unit2, true);
            merges.push(merge);
            
            unitMap.set(dup.unit1Id, merge.mergedUnit);
            unitMap.delete(dup.unit2Id);
            processed.add(dup.unit1Id);
            processed.add(dup.unit2Id);
          }
        }
      }
    }
    
    const cleaned = Array.from(unitMap.values());
    
    logger.info('Deduplication complete: ' + cleaned.length + ' units remaining from ' + units.length);
    
    return {
      cleaned,
      duplicates,
      merges,
    };
  }
}

/**
 * Deduplication Report
 */
export class DeduplicationReport {
  /**
   * Generate deduplication report
   */
  static generate(
    originalCount: number,
    duplicates: SimilarityResult[],
    merges: MergeResult[],
    finalCount: number
  ): Record<string, any> {
    const highConfidence = duplicates.filter(d => d.similarity > 0.9).length;
    const mediumConfidence = duplicates.filter(d => d.similarity > 0.75 && d.similarity <= 0.9).length;
    
    return {
      summary: {
        originalUnits: originalCount,
        finalUnits: finalCount,
        deduplicatedCount: originalCount - finalCount,
        deduplicationRate: ((originalCount - finalCount) / originalCount * 100).toFixed(2) + '%',
      },
      duplicates: {
        total: duplicates.length,
        highConfidence,
        mediumConfidence,
        lowConfidence: duplicates.length - highConfidence - mediumConfidence,
      },
      merges: {
        total: merges.length,
        byStrategy: merges.reduce((acc, m) => {
          acc[m.mergeStrategy] = (acc[m.mergeStrategy] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      recommendations: generateRecommendations(duplicates, merges),
    };
  }
}

/**
 * Generate deduplication recommendations
 */
function generateRecommendations(
  duplicates: SimilarityResult[],
  merges: MergeResult[]
): string[] {
  const recommendations: string[] = [];
  
  if (duplicates.length > merges.length) {
    const unmerged = duplicates.length - merges.length;
    recommendations.push('Review ' + unmerged + ' similar units that were not auto-merged');
  }
  
  const highConfidence = duplicates.filter(d => d.similarity > 0.95);
  if (highConfidence.length > 0) {
    recommendations.push('Found ' + highConfidence.length + ' very high-confidence duplicates for manual review');
  }
  
  return recommendations;
}
