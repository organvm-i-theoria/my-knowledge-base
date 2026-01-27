/**
 * Data Export Module
 * Supports CSV, Excel, JSON-LD, and other formats
 */

import { AtomicUnit } from './types.js';
import { RSSHelper } from './rss-builder.js';
import JSZip from 'jszip';
import { renderHtmlToPng, PngExportOptions } from './exporters/png-export.js';

// Logger setup (note: Logger constructor may need adjustment)
const logger = {
  info: (msg: string) => console.log(`[data-export] ${msg}`),
  error: (msg: string) => console.error(`[data-export] ${msg}`),
};

/**
 * Export format types
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  JSON_LD = 'jsonld',
  MARKDOWN = 'markdown',
  NDJSON = 'ndjson',
  RSS = 'rss',
  HTML = 'html',
  PNG = 'png',
  ZIP = 'zip',
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
  baseUrl?: string;
  png?: PngExportOptions & {
    renderer?: (html: string, options: PngExportOptions) => Promise<Buffer>;
  };
  zip?: {
    formats?: ExportFormat[];
    prefix?: string;
    includeIndex?: boolean;
  };
}

/**
 * Export result
 */
export interface ExportResult {
  format: ExportFormat;
  content: string | Buffer;
  size: number;
  mimeType: string;
  timestamp: Date;
  unitCount: number;
  isBinary?: boolean;
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
      size: Buffer.byteLength(content, (options.encoding || 'utf8') as BufferEncoding),
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
      size: Buffer.byteLength(content, (options.encoding || 'utf8') as BufferEncoding),
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
      size: Buffer.byteLength(content, (options.encoding || 'utf8') as BufferEncoding),
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
      size: Buffer.byteLength(content, (options.encoding || 'utf8') as BufferEncoding),
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
      size: Buffer.byteLength(content, (options.encoding || 'utf8') as BufferEncoding),
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
      case ExportFormat.RSS:
        return this.toRSS(units, options);
      case ExportFormat.HTML:
        return this.toHTML(units, options);
      case ExportFormat.PNG:
      case ExportFormat.ZIP:
        throw new Error('Use exportAsync for PNG/ZIP exports');
      default:
        throw new Error('Unsupported format: ' + options.format);
    }
  }

  /**
   * Export to any format, including async formats like PNG/ZIP
   */
  static async exportAsync(
    units: any[],
    options: ExportOptions
  ): Promise<ExportResult> {
    switch (options.format) {
      case ExportFormat.PNG:
        return this.toPNG(units, options);
      case ExportFormat.ZIP:
        return this.toZIP(units, options);
      default:
        return this.export(units, options);
    }
  }

  /**
   * Export units as RSS 2.0 feed
   */
  static toRSS(units: any[], options: Partial<ExportOptions> = {}): ExportResult {
    const baseUrl = options.baseUrl || 'http://localhost:3000';
    
    const content = RSSHelper.createFeedFromUnits(
      units as AtomicUnit[],
      'Knowledge Base Feed',
      baseUrl
    );

    logger.info(`Exported ${units.length} units to RSS`);

    return {
      format: ExportFormat.RSS,
      content,
      size: Buffer.byteLength(content, 'utf8'),
      mimeType: 'application/rss+xml',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }
  
  /**
   * Export units as styled HTML
   */
  static toHTML(units: any[], options: Partial<ExportOptions> = {}): ExportResult {
    const exportDate = new Date().toISOString();
    const escapeHTML = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const typeColors: Record<string, string> = {
      insight: '#2a9d8f',
      code: '#e9c46a',
      question: '#f4a261',
      reference: '#3a86ff',
      decision: '#e76f51',
    };

    const unitsHTML = units.map((unit, index) => {
      const typeColor = typeColors[unit.type] || '#264653';
      const tags = (unit.tags || [])
        .map((t: string) => `<span class="tag">${escapeHTML(t)}</span>`)
        .join(' ');
      const keywords = (unit.keywords || []).join(', ');

      return `
    <article class="unit-card">
      <header>
        <h2>${escapeHTML(unit.title || 'Untitled')}</h2>
        <span class="type-badge" style="background-color: ${typeColor};">${escapeHTML(unit.type || 'unknown')}</span>
      </header>
      <div class="meta">
        <span><strong>Category:</strong> ${escapeHTML(unit.category || 'general')}</span>
        <span><strong>Date:</strong> ${escapeHTML(unit.timestamp ? new Date(unit.timestamp).toLocaleString() : 'Unknown')}</span>
      </div>
      <div class="content">
        <pre>${escapeHTML(unit.content || '')}</pre>
      </div>
      ${unit.context ? `<div class="context"><strong>Context:</strong> ${escapeHTML(unit.context)}</div>` : ''}
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      ${keywords ? `<div class="keywords"><strong>Keywords:</strong> ${escapeHTML(keywords)}</div>` : ''}
    </article>`;
    }).join('\n');

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Knowledge Base Export">
  <meta name="exported-at" content="${exportDate}">
  <title>Knowledge Base Export - ${units.length} Units</title>
  <style>
    :root {
      --bg: #f4f0e8;
      --surface: #fff8f0;
      --ink: #1f2933;
      --ink-muted: #52616b;
      --accent: #e76f51;
      --accent-2: #2a9d8f;
      --accent-3: #264653;
      --border: rgba(31, 41, 51, 0.15);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --ink: #f1f5f9;
        --ink-muted: #94a3b8;
        --accent: #f97316;
        --accent-2: #14b8a6;
        --accent-3: #38bdf8;
        --border: rgba(148, 163, 184, 0.2);
      }
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.6;
      padding: 2rem;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    header.page-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid var(--border);
    }

    header.page-header h1 {
      font-size: 2rem;
      color: var(--accent-3);
      margin-bottom: 0.5rem;
    }

    header.page-header .meta {
      color: var(--ink-muted);
      font-size: 0.9rem;
    }

    .unit-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .unit-card header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
      gap: 1rem;
    }

    .unit-card h2 {
      font-size: 1.2rem;
      color: var(--accent-3);
    }

    .type-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      color: white;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 600;
    }

    .unit-card .meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.85rem;
      color: var(--ink-muted);
      margin-bottom: 1rem;
    }

    .unit-card .content {
      margin-bottom: 1rem;
    }

    .unit-card .content pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: inherit;
      font-size: 0.95rem;
    }

    .unit-card .context {
      font-size: 0.9rem;
      color: var(--ink-muted);
      padding: 0.75rem;
      background: var(--bg);
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .unit-card .tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.5rem;
    }

    .tag {
      padding: 0.2rem 0.6rem;
      background: rgba(42, 157, 143, 0.15);
      color: var(--accent-2);
      border-radius: 999px;
      font-size: 0.8rem;
    }

    .keywords {
      font-size: 0.85rem;
      color: var(--ink-muted);
    }

    footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--ink-muted);
      font-size: 0.85rem;
    }

    @media print {
      body { padding: 0; }
      .unit-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="page-header">
      <h1>Knowledge Base Export</h1>
      <div class="meta">
        <strong>Exported:</strong> ${exportDate} |
        <strong>Total Units:</strong> ${units.length}
      </div>
    </header>

    <main>
${unitsHTML}
    </main>

    <footer>
      Generated by Knowledge Base | ${exportDate}
    </footer>
  </div>
</body>
</html>`;

    logger.info(`Exported ${units.length} units to HTML`);

    return {
      format: ExportFormat.HTML,
      content,
      size: Buffer.byteLength(content, 'utf8'),
      mimeType: 'text/html',
      timestamp: new Date(),
      unitCount: units.length,
    };
  }

  /**
   * Export units as PNG (renders HTML to image)
   */
  static async toPNG(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): Promise<ExportResult> {
    const htmlResult = this.toHTML(units, options);
    const renderer = options.png?.renderer ?? renderHtmlToPng;
    const pngBuffer = await renderer(String(htmlResult.content), options.png ?? {});

    logger.info(`Exported ${units.length} units to PNG`);

    return {
      format: ExportFormat.PNG,
      content: pngBuffer,
      size: pngBuffer.byteLength,
      mimeType: 'image/png',
      timestamp: new Date(),
      unitCount: units.length,
      isBinary: true,
    };
  }

  /**
   * Export units as ZIP archive
   */
  static async toZIP(
    units: any[],
    options: Partial<ExportOptions> = {}
  ): Promise<ExportResult> {
    const zip = new JSZip();
    const formats =
      options.zip?.formats && options.zip.formats.length > 0
        ? options.zip.formats.filter((format) => format !== ExportFormat.ZIP)
        : [ExportFormat.JSON];
    const prefix = options.zip?.prefix ?? 'export';
    const index: Array<{ format: ExportFormat; filename: string; size: number }> = [];

    for (const format of formats) {
      let result: ExportResult;
      if (format === ExportFormat.PNG) {
        result = await this.toPNG(units, options);
      } else {
        result = this.export(units, { ...options, format });
      }

      const filename = `${prefix}.${ExportUtils.getFileExtension(format)}`;
      zip.file(filename, result.content);
      index.push({ format, filename, size: result.size });
    }

    if (options.zip?.includeIndex !== false) {
      zip.file(
        `${prefix}.index.json`,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            unitCount: units.length,
            files: index,
          },
          null,
          2
        )
      );
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    logger.info(`Exported ${units.length} units to ZIP`);

    return {
      format: ExportFormat.ZIP,
      content: zipBuffer,
      size: zipBuffer.byteLength,
      mimeType: 'application/zip',
      timestamp: new Date(),
      unitCount: units.length,
      isBinary: true,
    };
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
      [ExportFormat.RSS]: 'application/rss+xml',
      [ExportFormat.HTML]: 'text/html',
      [ExportFormat.PNG]: 'image/png',
      [ExportFormat.ZIP]: 'application/zip',
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
      [ExportFormat.RSS]: 'rss',
      [ExportFormat.HTML]: 'html',
      [ExportFormat.PNG]: 'png',
      [ExportFormat.ZIP]: 'zip',
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
