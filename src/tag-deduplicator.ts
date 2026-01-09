/**
 * Tag Deduplication System
 * Finds and merges duplicate/similar tags across the knowledge base
 */

import { KnowledgeDatabase } from './database.js';
import { logger } from './logger.js';

export interface TagSimilarity {
  canonical: string;
  variant: string;
  similarity: number;        // 0-1 score
  reason: 'edit-distance' | 'synonym' | 'case-variant';
  unitCount: number;        // How many units use this variant
}

export interface TagMergeSuggestion {
  canonical: string;
  variants: string[];
  totalUnitsAffected: number;
  confidence: number;       // 0-1
  savings: number;         // How many duplicate tag entries would be removed
}

/**
 * Find and merge duplicate/similar tags
 */
export class TagDeduplicator {
  constructor(private db: KnowledgeDatabase) {}

  /**
   * Find similar tags using Levenshtein distance
   */
  findSimilarTags(threshold: number = 0.8): TagSimilarity[] {
    const allTags = this.getAllTags();
    const similarities: TagSimilarity[] = [];

    // Compare each pair of tags
    for (let i = 0; i < allTags.length; i++) {
      for (let j = i + 1; j < allTags.length; j++) {
        const tag1 = allTags[i];
        const tag2 = allTags[j];

        const distance = this.levenshteinDistance(tag1.name, tag2.name);
        const maxLen = Math.max(tag1.name.length, tag2.name.length);
        const similarity = 1 - distance / maxLen;

        if (similarity >= threshold) {
          // Determine which is canonical (longer, more common)
          const canonical = tag1.count >= tag2.count ? tag1.name : tag2.name;
          const variant = canonical === tag1.name ? tag2.name : tag1.name;
          const variantCount = canonical === tag1.name ? tag2.count : tag1.count;

          similarities.push({
            canonical,
            variant,
            similarity,
            reason: 'edit-distance',
            unitCount: variantCount,
          });
        }
      }
    }

    // Also check for case variants
    const caseVariants = this.findCaseVariants(allTags);
    similarities.push(...caseVariants);

    // Sort by similarity descending
    return similarities.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Find tags that differ only by case
   */
  private findCaseVariants(tags: Array<{ name: string; count: number }>): TagSimilarity[] {
    const normalized = new Map<string, Array<{ name: string; count: number }>>();

    // Group by normalized (lowercase) version
    for (const tag of tags) {
      const key = tag.name.toLowerCase();
      if (!normalized.has(key)) {
        normalized.set(key, []);
      }
      normalized.get(key)!.push(tag);
    }

    const variants: TagSimilarity[] = [];

    // Find groups with multiple case variants
    for (const [, group] of normalized) {
      if (group.length > 1) {
        // Use the most common variant as canonical
        const canonical = group.reduce((a, b) => (a.count > b.count ? a : b));

        for (const variant of group) {
          if (variant.name !== canonical.name) {
            variants.push({
              canonical: canonical.name,
              variant: variant.name,
              similarity: 1.0,
              reason: 'case-variant',
              unitCount: variant.count,
            });
          }
        }
      }
    }

    return variants;
  }

  /**
   * Get all tags with their usage counts
   */
  private getAllTags(): Array<{ name: string; count: number }> {
    const stmt = this.db['db'].prepare(`
      SELECT t.name, COUNT(ut.unit_id) as count
      FROM tags t
      LEFT JOIN unit_tags ut ON t.id = ut.tag_id
      GROUP BY t.id
      ORDER BY count DESC
    `);

    return stmt.all() as Array<{ name: string; count: number }>;
  }

  /**
   * Suggest tag merges above confidence threshold
   */
  suggestMerges(threshold: number = 0.85): TagMergeSuggestion[] {
    const similarities = this.findSimilarTags(threshold);
    const suggestions = new Map<string, TagMergeSuggestion>();

    for (const sim of similarities) {
      const key = sim.canonical;

      if (!suggestions.has(key)) {
        suggestions.set(key, {
          canonical: sim.canonical,
          variants: [],
          totalUnitsAffected: 0,
          confidence: sim.similarity,
          savings: 0,
        });
      }

      const suggestion = suggestions.get(key)!;
      suggestion.variants.push(sim.variant);
      suggestion.totalUnitsAffected += sim.unitCount;
      suggestion.savings += sim.unitCount;
      // Update confidence to minimum of all variants
      suggestion.confidence = Math.min(suggestion.confidence, sim.similarity);
    }

    return Array.from(suggestions.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Merge variant tags into canonical tag
   */
  mergeTags(canonical: string, variants: string[]): { merged: number; errors: string[] } {
    const errors: string[] = [];
    let mergedCount = 0;

    try {
      const getCanonicalId = this.db['db'].prepare(`SELECT id FROM tags WHERE name = ?`);
      const getVariantId = this.db['db'].prepare(`SELECT id FROM tags WHERE name = ?`);
      const updateUnits = this.db['db'].prepare(`
        UPDATE unit_tags
        SET tag_id = ?
        WHERE tag_id = ?
      `);
      const deleteTag = this.db['db'].prepare(`DELETE FROM tags WHERE id = ?`);

      const canonicalRow = getCanonicalId.get(canonical) as { id: number } | undefined;
      if (!canonicalRow) {
        errors.push(`Canonical tag "${canonical}" not found`);
        return { merged: mergedCount, errors };
      }

      const canonicalId = canonicalRow.id;

      for (const variant of variants) {
        const variantRow = getVariantId.get(variant) as { id: number } | undefined;
        if (!variantRow) {
          errors.push(`Variant tag "${variant}" not found`);
          continue;
        }

        try {
          // Update all unit_tags references to point to canonical
          const result = updateUnits.run(canonicalId, variantRow.id);
          mergedCount += (result.changes as number) || 0;

          // Delete the variant tag
          deleteTag.run(variantRow.id);

          logger.info(`✅ Merged tag "${variant}" into "${canonical}" (${(result.changes as number) || 0} units)`);
        } catch (e) {
          errors.push(`Failed to merge "${variant}": ${(e as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`Merge operation failed: ${(e as Error).message}`);
    }

    return { merged: mergedCount, errors };
  }

  /**
   * Batch merge multiple tag groups
   */
  batchMergeTags(suggestions: TagMergeSuggestion[], dryRun: boolean = false): {
    totalMerged: number;
    mergeOperations: number;
    errors: string[];
  } {
    const errors: string[] = [];
    let totalMerged = 0;
    let operations = 0;

    for (const suggestion of suggestions) {
      if (!dryRun) {
        const result = this.mergeTags(suggestion.canonical, suggestion.variants);
        totalMerged += result.merged;
        errors.push(...result.errors);
      }
      operations += suggestion.variants.length;
    }

    return {
      totalMerged: dryRun ? 0 : totalMerged,
      mergeOperations: operations,
      errors,
    };
  }

  /**
   * Levenshtein distance algorithm for string similarity
   */
  private levenshteinDistance(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= bLower.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= aLower.length; j++) {
      matrix[0][j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= bLower.length; i++) {
      for (let j = 1; j <= aLower.length; j++) {
        const cost = aLower[j - 1] === bLower[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,      // deletion
          matrix[i - 1][j] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[bLower.length][aLower.length];
  }

  /**
   * Get statistics about tag redundancy
   */
  getTagStats(): {
    totalTags: number;
    usedTags: number;
    unusedTags: number;
    potentialDuplicates: number;
    estimatedDuplicationPercent: number;
  } {
    const allTags = this.getAllTags();
    const used = allTags.filter(t => t.count > 0);
    const unused = allTags.filter(t => t.count === 0);
    const suggestions = this.suggestMerges(0.85);

    const potentialDuplicates = suggestions.reduce((sum, s) => sum + s.variants.length, 0);
    const duplicatedUnits = suggestions.reduce((sum, s) => sum + s.totalUnitsAffected, 0);
    const totalUnits = this.db['db'].prepare(`
      SELECT COUNT(*) as count FROM atomic_units
    `).get() as { count: number };

    return {
      totalTags: allTags.length,
      usedTags: used.length,
      unusedTags: unused.length,
      potentialDuplicates,
      estimatedDuplicationPercent: totalUnits.count > 0 
        ? Math.round((duplicatedUnits / totalUnits.count) * 100) 
        : 0,
    };
  }
}
