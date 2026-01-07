/**
 * Data Export Module
 * Supports CSV, Excel, JSON-LD, and other formats
 */

import { Logger } from './logger.js';

const logger = new Logger({ context: 'data-export' });

/**
 * Export format types
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  JSON_LD = 'jsonld',
  MARKDOWN = 'markdown',
  NDJSON = 'ndjson',
}

/**
 * Export configuration
 */
export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeRelationships?: boolean;
  fields?: string[];
  delimiter?: string;
  encoding?: string;
}

/**
 * Export result
 */
export interface ExportResult {
  format: ExportFormat;
  content: string;
  size: number;
  mimeType: string;
  timestamp: Date;
  unitCount: number;
}

/**
 * Data Exporter
 */
export class DataExporter {
  /**
   * Export units as CSV
   */
  static toCSV(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): ExportResult {
    const delimiter = options.delimiter || ',';
    const fields = options.fields || ['id', 'title', 'type', 'category', 'timestamp'];
    
    const lines: string[] = [];
    
    lines.push(fields.map(f => this.escapeCSV(f)).join(delimiter));
    
    units.forEach(unit => {
      const values = fields.map(field => {
        const value = this.getNestedValue(unit, field);
        return this.escapeCSV(String(value || ''));
      });
      lines.push(values.join(delimiter));
    });
    
    const content = lines.join('\n');
    
    logger.info('Exported ' + units.length + ' units to CSV');
    
    return {
      format: ExportFormat.CSV,
      content,
      size: Buffer.byteLength(content, options.encoding || 'utf8'),
      mimeType: 'text/csv',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }
  
  /**
   * Export units as JSON
   */
  static toJSON(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): ExportResult {
    const data = options.includeMetadata
      ? {
          version: '1.0',
          exportedAt: new Date(),
          totalUnits: units.length,
          units,
        }
      : units;
    
    const content = JSON.stringify(data, null, 2);
    
    logger.info('Exported ' + units.length + ' units to JSON');
    
    return {
      format: ExportFormat.JSON,
      content,
      size: Buffer.byteLength(content, options.encoding || 'utf8'),
      mimeType: 'application/json',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }
  
  /**
   * Export units as JSON-LD (Linked Data)
   */
  static toJSONLD(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): ExportResult {
    const context = {
      '@context': {
        '@vocab': 'https://schema.org/',
        knowledgeBase: 'https://knowledge-base.local/vocab/',
        id: '@id',
        type: '@type',
        title: 'name',
        content: 'description',
        category: 'knowledgeBase:category',
        keywords: 'knowledgeBase:keywords',
        timestamp: 'datePublished',
        relatedUnits: '@reverse knowledgeBase:related',
      },
      '@graph': units.map((unit, index) => ({
        '@id': 'https://knowledge-base.local/units/' + unit.id,
        '@type': 'CreativeWork',
        id: unit.id,
        title: unit.title,
        content: unit.content,
        category: unit.category,
        keywords: unit.keywords,
        timestamp: unit.timestamp,
        ...(options.includeRelationships && unit.relatedUnits && {
          relatedUnits: unit.relatedUnits.map((id: string) => ({
            '@id': 'https://knowledge-base.local/units/' + id,
          })),
        }),
      })),
    };
    
    const content = JSON.stringify(context, null, 2);
    
    logger.info('Exported ' + units.length + ' units to JSON-LD');
    
    return {
      format: ExportFormat.JSON_LD,
      content,
      size: Buffer.byteLength(content, options.encoding || 'utf8'),
      mimeType: 'application/ld+json',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }
  
  /**
   * Export units as Markdown
   */
  static toMarkdown(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): ExportResult {
    const lines: string[] = [];
    
    lines.push('# Knowledge Base Export');
    lines.push('');
    lines.push('**Exported:** ' + new Date().toISOString());
    lines.push('**Total Units:** ' + units.length);
    lines.push('');
    lines.push('---');
    lines.push('');
    
    units.forEach((unit, index) => {
      lines.push('## ' + (index + 1) + '. ' + unit.title);
      lines.push('');
      lines.push('**Type:** ' + unit.type);
      lines.push('**Category:** ' + unit.category);
      lines.push('**Date:** ' + unit.timestamp);
      lines.push('');
      
      if (unit.keywords && unit.keywords.length > 0) {
        lines.push('**Keywords:** ' + unit.keywords.join(', '));
        lines.push('');
      }
      
      if (unit.content) {
        lines.push('### Content');
        lines.push('');
        lines.push(unit.content);
        lines.push('');
      }
      
      if (unit.tags && unit.tags.length > 0) {
        lines.push('**Tags:** ' + unit.tags.map((t: string) => '`' + t + '`').join(' '));
        lines.push('');
      }
      
      lines.push('---');
      lines.push('');
    });
    
    const content = lines.join('\n');
    
    logger.info('Exported ' + units.length + ' units to Markdown');
    
    return {
      format: ExportFormat.MARKDOWN,
      content,
      size: Buffer.byteLength(content, options.encoding || 'utf8'),
      mimeType: 'text/markdown',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }
  
  /**
   * Export units as NDJSON (newline-delimited JSON)
   */
  static toNDJSON(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): ExportResult {
    const lines = units.map(unit => JSON.stringify(unit));
    const content = lines.join('\n');
    
    logger.info('Exported ' + units.length + ' units to NDJSON');
    
    return {
      format: ExportFormat.NDJSON,
      content,
      size: Buffer.byteLength(content, options.encoding || 'utf8'),
      mimeType: 'application/x-ndjson',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }
  
  /**
   * Export to any format
   */
  static export(
    units: any[],
    options: ExportOptions
  ): ExportResult {
    switch (options.format) {
      case ExportFormat.CSV:
        return this.toCSV(units, options);
      case ExportFormat.JSON:
        return this.toJSON(units, options);
      case ExportFormat.JSON_LD:
        return this.toJSONLD(units, options);
      case ExportFormat.MARKDOWN:
        return this.toMarkdown(units, options);
      case ExportFormat.NDJSON:
        return this.toNDJSON(units, options);
      default:
        throw new Error('Unsupported format: ' + options.format);
    }
  }
  
  /**
   * Helper: escape CSV field
   */
  private static escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }
  
  /**
   * Helper: get nested object value
   */
  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => {
      return current?.[prop];
    }, obj);
  }
}

/**
 * Batch Exporter for large datasets
 */
export class BatchExporter {
  private batchSize: number = 1000;
  
  constructor(batchSize: number = 1000) {
    this.batchSize = batchSize;
  }
  
  /**
   * Export large dataset in batches
   */
  async exportBatches(
    units: any[],
    format: ExportFormat,
    onBatch: (result: ExportResult, batchIndex: number) => Promise<void>
  ): Promise<void> {
    const totalBatches = Math.ceil(units.length / this.batchSize);
    
    for (let i = 0; i < totalBatches; i++) {
      const start = i * this.batchSize;
      const end = Math.min(start + this.batchSize, units.length);
      const batchUnits = units.slice(start, end);
      
      const result = DataExporter.export(batchUnits, {
        format,
        includeMetadata: i === 0,
      });
      
      await onBatch(result, i);
      logger.info('Exported batch ' + (i + 1) + ' of ' + totalBatches);
    }
  }
}

/**
 * Export utilities
 */
export const ExportUtils = {
  /**
   * Get MIME type for format
   */
  getMimeType(format: ExportFormat): string {
    const mimeTypes: Record<ExportFormat, string> = {
      [ExportFormat.CSV]: 'text/csv',
      [ExportFormat.JSON]: 'application/json',
      [ExportFormat.JSON_LD]: 'application/ld+json',
      [ExportFormat.MARKDOWN]: 'text/markdown',
      [ExportFormat.NDJSON]: 'application/x-ndjson',
    };
    return mimeTypes[format];
  },
  
  /**
   * Get file extension for format
   */
  getFileExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      [ExportFormat.CSV]: 'csv',
      [ExportFormat.JSON]: 'json',
      [ExportFormat.JSON_LD]: 'jsonld',
      [ExportFormat.MARKDOWN]: 'md',
      [ExportFormat.NDJSON]: 'ndjson',
    };
    return extensions[format];
  },
  
  /**
   * Get filename for export
   */
  getFilename(format: ExportFormat, prefix: string = 'export'): string {
    return prefix + '_' + new Date().toISOString().slice(0, 10) + '.' + this.getFileExtension(format);
  },
};
