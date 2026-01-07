/**
 * Export API Routes
 * Provides REST endpoints for data export in multiple formats
 */

import { Router } from 'express';
import { Logger } from './logger.js';
import { DataExporter, ExportFormat, ExportUtils } from './data-export.js';

const logger = new Logger({ context: 'export-api' });

/**
 * Create export routes
 */
export function createExportRoutes(): Router {
  const router = Router();

  // POST /api/export - Export data in specified format
  router.post('/', (req, res) => {
    try {
      const { units, format, options } = req.body;
      
      if (!units || !Array.isArray(units)) {
        return res.status(400).json({
          success: false,
          error: 'Units array required',
        });
      }
      
      if (!format) {
        return res.status(400).json({
          success: false,
          error: 'Format required (csv, json, jsonld, markdown, ndjson)',
        });
      }
      
      const result = DataExporter.export(units, {
        format: format as ExportFormat,
        ...options,
      });
      
      const filename = ExportUtils.getFilename(format);
      
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', 'attachment; filename=' + filename);
      res.setHeader('Content-Length', result.size);
      
      res.send(result.content);
      
      logger.info('Exported ' + result.unitCount + ' units to ' + format);
    } catch (error) {
      logger.error('Export error: ' + error);
      res.status(500).json({
        success: false,
        error: 'Export failed',
      });
    }
  });

  // GET /api/export/formats - Get available export formats
  router.get('/formats', (req, res) => {
    try {
      const formats = Object.values(ExportFormat).map(format => ({
        name: format,
        mimeType: ExportUtils.getMimeType(format as ExportFormat),
        extension: ExportUtils.getFileExtension(format as ExportFormat),
        description: getFormatDescription(format),
      }));
      
      res.json({
        success: true,
        data: formats,
      });
    } catch (error) {
      logger.error('Error fetching formats: ' + error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch formats',
      });
    }
  });

  // POST /api/export/csv - Quick export to CSV
  router.post('/csv', (req, res) => {
    exportToFormat(req, res, ExportFormat.CSV);
  });

  // POST /api/export/json - Quick export to JSON
  router.post('/json', (req, res) => {
    exportToFormat(req, res, ExportFormat.JSON);
  });

  // POST /api/export/jsonld - Quick export to JSON-LD
  router.post('/jsonld', (req, res) => {
    exportToFormat(req, res, ExportFormat.JSON_LD);
  });

  // POST /api/export/markdown - Quick export to Markdown
  router.post('/markdown', (req, res) => {
    exportToFormat(req, res, ExportFormat.MARKDOWN);
  });

  // POST /api/export/ndjson - Quick export to NDJSON
  router.post('/ndjson', (req, res) => {
    exportToFormat(req, res, ExportFormat.NDJSON);
  });

  return router;
}

/**
 * Helper function to export to specific format
 */
function exportToFormat(req: any, res: any, format: ExportFormat): void {
  try {
    const { units, options } = req.body;
    
    if (!units || !Array.isArray(units)) {
      return res.status(400).json({
        success: false,
        error: 'Units array required',
      });
    }
    
    const result = DataExporter.export(units, {
      format,
      ...options,
    });
    
    const filename = ExportUtils.getFilename(format);
    
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', 'attachment; filename=' + filename);
    res.setHeader('Content-Length', result.size);
    
    res.send(result.content);
    
    logger.info('Exported ' + result.unitCount + ' units to ' + format);
  } catch (error) {
    logger.error('Export error: ' + error);
    res.status(500).json({
      success: false,
      error: 'Export failed',
    });
  }
}

/**
 * Get format description
 */
function getFormatDescription(format: string): string {
  const descriptions: Record<string, string> = {
    [ExportFormat.CSV]: 'Comma-separated values, suitable for spreadsheets',
    [ExportFormat.JSON]: 'JSON format, best for web applications',
    [ExportFormat.JSON_LD]: 'JSON-LD linked data format for semantic web',
    [ExportFormat.MARKDOWN]: 'Markdown format, human-readable documentation',
    [ExportFormat.NDJSON]: 'Newline-delimited JSON for streaming',
  };
  
  return descriptions[format] || 'Unknown format';
}

/**
 * Stream Export Service
 * For handling large exports with streaming
 */
export class StreamExportService {
  /**
   * Stream CSV to response
   */
  static streamCSV(
    units: any[],
    res: any,
    onChunk?: (chunk: string) => void
  ): void {
    const result = DataExporter.toCSV(units);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    
    if (onChunk) {
      onChunk(result.content);
    }
    
    res.send(result.content);
  }
  
  /**
   * Stream JSON to response
   */
  static streamJSON(
    units: any[],
    res: any,
    onChunk?: (chunk: string) => void
  ): void {
    const result = DataExporter.toJSON(units, { includeMetadata: true });
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=export.json');
    
    if (onChunk) {
      onChunk(result.content);
    }
    
    res.send(result.content);
  }
  
  /**
   * Stream NDJSON to response (best for large datasets)
   */
  static streamNDJSON(
    units: any[],
    res: any,
    chunkSize: number = 100
  ): void {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename=export.ndjson');
    
    for (let i = 0; i < units.length; i += chunkSize) {
      const chunk = units.slice(i, i + chunkSize);
      const result = DataExporter.toNDJSON(chunk);
      res.write(result.content);
    }
    
    res.end();
  }
}
