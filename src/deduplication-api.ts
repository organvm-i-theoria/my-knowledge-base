/**
 * Deduplication API Routes
 * REST endpoints for duplicate detection and unit merging
 */

import { Router } from 'express';
import { Logger } from './logger.js';
import { UnitDeduplicator, BatchDeduplicator, DeduplicationReport } from './deduplication.js';

const logger = new Logger({ context: 'deduplication-api' });

/**
 * Create deduplication routes
 */
export function createDeduplicationRoutes(): Router {
  const router = Router();

  // POST /api/dedup/detect - Detect duplicate units
  router.post('/detect', (req, res) => {
    try {
      const { units, threshold } = req.body;
      
      if (!units || !Array.isArray(units)) {
        return res.status(400).json({
          success: false,
          error: 'Units array required',
        });
      }
      
      const deduplicator = new UnitDeduplicator(threshold || 0.7);
      const duplicates = deduplicator.findDuplicates(units);
      
      res.json({
        success: true,
        data: {
          duplicates,
          total: duplicates.length,
          highConfidence: duplicates.filter(d => d.similarity > 0.9).length,
          mediumConfidence: duplicates.filter(d => d.similarity > 0.75 && d.similarity <= 0.9).length,
        },
      });
      
      logger.info('Detected ' + duplicates.length + ' potential duplicates');
    } catch (error) {
      logger.error('Error detecting duplicates: ' + error);
      res.status(500).json({
        success: false,
        error: 'Detection failed',
      });
    }
  });

  // POST /api/dedup/merge - Merge two units
  router.post('/merge', (req, res) => {
    try {
      const { unit1, unit2, keepUnit1 } = req.body;
      
      if (!unit1 || !unit2) {
        return res.status(400).json({
          success: false,
          error: 'Both units required',
        });
      }
      
      const deduplicator = new UnitDeduplicator();
      const result = deduplicator.merge(unit1, unit2, keepUnit1 !== false);
      
      res.json({
        success: true,
        data: result,
      });
      
      logger.info('Merged units ' + unit1.id + ' and ' + unit2.id);
    } catch (error) {
      logger.error('Error merging units: ' + error);
      res.status(500).json({
        success: false,
        error: 'Merge failed',
      });
    }
  });

  // POST /api/dedup/batch - Batch deduplication
  router.post('/batch', (req, res) => {
    try {
      const { units, threshold, autoMerge } = req.body;
      
      if (!units || !Array.isArray(units)) {
        return res.status(400).json({
          success: false,
          error: 'Units array required',
        });
      }
      
      const batchDedup = new BatchDeduplicator(threshold || 0.7);
      const result = batchDedup.deduplicate(units, autoMerge || false);
      
      const report = DeduplicationReport.generate(
        units.length,
        result.duplicates,
        result.merges,
        result.cleaned.length
      );
      
      res.json({
        success: true,
        data: {
          report,
          cleaned: result.cleaned,
          duplicates: result.duplicates,
          merges: result.merges,
        },
      });
      
      logger.info('Batch deduplication: ' + units.length + ' units -> ' + result.cleaned.length + ' units');
    } catch (error) {
      logger.error('Error batch deduplication: ' + error);
      res.status(500).json({
        success: false,
        error: 'Batch deduplication failed',
      });
    }
  });

  // GET /api/dedup/report - Get deduplication report
  router.post('/report', (req, res) => {
    try {
      const { units, threshold } = req.body;
      
      if (!units || !Array.isArray(units)) {
        return res.status(400).json({
          success: false,
          error: 'Units array required',
        });
      }
      
      const deduplicator = new UnitDeduplicator(threshold || 0.7);
      const duplicates = deduplicator.findDuplicates(units);
      
      const report = DeduplicationReport.generate(
        units.length,
        duplicates,
        [],
        units.length - Math.floor(duplicates.length / 2)
      );
      
      res.json({
        success: true,
        data: report,
      });
      
      logger.info('Generated deduplication report');
    } catch (error) {
      logger.error('Error generating report: ' + error);
      res.status(500).json({
        success: false,
        error: 'Report generation failed',
      });
    }
  });

  return router;
}

/**
 * Deduplication Service for background processing
 */
export class DeduplicationService {
  private batchDedup: BatchDeduplicator;
  
  constructor(similarityThreshold: number = 0.7) {
    this.batchDedup = new BatchDeduplicator(similarityThreshold);
  }
  
  /**
   * Deduplicate units with progress tracking
   */
  async deduplicateWithProgress(
    units: any[],
    onProgress?: (current: number, total: number) => void
  ): Promise<any[]> {
    const result = this.batchDedup.deduplicate(units, true);
    
    if (onProgress) {
      onProgress(result.cleaned.length, units.length);
    }
    
    logger.info('Deduplication complete: ' + result.cleaned.length + ' units');
    return result.cleaned;
  }
  
  /**
   * Get deduplication statistics
   */
  getStatistics(units: any[]): Record<string, any> {
    const dedup = new UnitDeduplicator();
    const duplicates = dedup.findDuplicates(units);
    
    return {
      totalUnits: units.length,
      potentialDuplicates: duplicates.length,
      highConfidence: duplicates.filter(d => d.similarity > 0.9).length,
      mediumConfidence: duplicates.filter(d => d.similarity > 0.75 && d.similarity <= 0.9).length,
      lowConfidence: duplicates.filter(d => d.similarity <= 0.75).length,
      averageSimilarity: duplicates.length > 0 
        ? duplicates.reduce((a, b) => a + b.similarity, 0) / duplicates.length
        : 0,
    };
  }
}
