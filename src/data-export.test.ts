import { describe, it, expect } from 'vitest';
import { DataExporter, ExportFormat, BatchExporter, ExportUtils } from './data-export.js';

const sampleUnits = [
  {
    id: 'u1',
    title: 'Unit 1: TypeScript Basics',
    type: 'code',
    category: 'programming',
    keywords: ['typescript', 'javascript'],
    content: 'TypeScript is a strongly typed programming language...',
    timestamp: new Date('2024-01-15'),
    tags: ['typescript', 'learning'],
  },
  {
    id: 'u2',
    title: 'Unit 2: React Hooks',
    type: 'code',
    category: 'programming',
    keywords: ['react', 'hooks', 'javascript'],
    content: 'Hooks allow you to use state and other React features...',
    timestamp: new Date('2024-01-16'),
    tags: ['react', 'frontend'],
  },
  {
    id: 'u3',
    title: 'Unit 3: Design Patterns',
    type: 'insight',
    category: 'design',
    keywords: ['patterns', 'architecture'],
    content: 'Design patterns are reusable solutions...',
    timestamp: new Date('2024-01-17'),
    tags: ['patterns', 'architecture'],
  },
];

describe('DataExporter', () => {
  describe('CSV Export', () => {
    it('should export to CSV format', () => {
      const result = DataExporter.toCSV(sampleUnits);
      
      expect(result.format).toBe(ExportFormat.CSV);
      expect(result.content).toContain('id');
      expect(result.content).toContain('u1');
      expect(result.unitCount).toBe(3);
    });

    it('should handle CSV special characters', () => {
      const units = [
        {
          id: 'u1',
          title: 'Title with, comma',
          content: 'Content with "quotes"',
        },
      ];
      
      const result = DataExporter.toCSV(units, { fields: ['id', 'title', 'content'] });
      
      expect(result.content).toContain('"Title with, comma"');
      expect(result.content).toContain('"Content with ""quotes"""');
    });

    it('should allow custom delimiter', () => {
      const result = DataExporter.toCSV(sampleUnits, { delimiter: '|' });
      
      expect(result.content).toContain('|');
    });

    it('should allow custom fields', () => {
      const result = DataExporter.toCSV(sampleUnits, {
        fields: ['id', 'title'],
      });
      
      expect(result.content).toContain('id');
      expect(result.content).toContain('title');
      expect(result.content).not.toContain('type');
    });
  });

  describe('JSON Export', () => {
    it('should export to JSON format', () => {
      const result = DataExporter.toJSON(sampleUnits);
      
      expect(result.format).toBe(ExportFormat.JSON);
      expect(result.content).toContain('"id"');
      expect(result.content).toContain('"title"');
      expect(result.unitCount).toBe(3);
    });

    it('should include metadata when requested', () => {
      const result = DataExporter.toJSON(sampleUnits, {
        includeMetadata: true,
      });
      
      expect(result.content).toContain('"version"');
      expect(result.content).toContain('"exportedAt"');
      expect(result.content).toContain('"totalUnits"');
    });

    it('should parse valid JSON', () => {
      const result = DataExporter.toJSON(sampleUnits);
      const parsed = JSON.parse(result.content);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });
  });

  describe('JSON-LD Export', () => {
    it('should export to JSON-LD format', () => {
      const result = DataExporter.toJSONLD(sampleUnits);
      
      expect(result.format).toBe(ExportFormat.JSON_LD);
      expect(result.content).toContain('@context');
      expect(result.content).toContain('@graph');
      expect(result.unitCount).toBe(3);
    });

    it('should include context vocabulary', () => {
      const result = DataExporter.toJSONLD(sampleUnits);
      const parsed = JSON.parse(result.content);
      
      expect(parsed['@context']).toBeDefined();
      expect(parsed['@context']['@vocab']).toBe('https://schema.org/');
    });

    it('should include relationships when requested', () => {
      const unitsWithRelations = sampleUnits.map(u => ({
        ...u,
        relatedUnits: ['u1', 'u2'],
      }));
      
      const result = DataExporter.toJSONLD(unitsWithRelations, {
        includeRelationships: true,
      });
      
      expect(result.content).toContain('relatedUnits');
    });
  });

  describe('Markdown Export', () => {
    it('should export to Markdown format', () => {
      const result = DataExporter.toMarkdown(sampleUnits);
      
      expect(result.format).toBe(ExportFormat.MARKDOWN);
      expect(result.content).toContain('# Knowledge Base Export');
      expect(result.content).toContain('## 1. Unit 1: TypeScript Basics');
      expect(result.unitCount).toBe(3);
    });

    it('should include unit metadata', () => {
      const result = DataExporter.toMarkdown(sampleUnits);
      
      expect(result.content).toContain('**Type:**');
      expect(result.content).toContain('**Category:**');
      expect(result.content).toContain('**Keywords:**');
      expect(result.content).toContain('**Tags:**');
    });

    it('should format content sections', () => {
      const result = DataExporter.toMarkdown(sampleUnits);
      
      expect(result.content).toContain('### Content');
      expect(result.content).toContain('TypeScript is a strongly typed');
    });
  });

  describe('NDJSON Export', () => {
    it('should export to NDJSON format', () => {
      const result = DataExporter.toNDJSON(sampleUnits);
      
      expect(result.format).toBe(ExportFormat.NDJSON);
      expect(result.unitCount).toBe(3);
    });

    it('should produce valid newline-delimited JSON', () => {
      const result = DataExporter.toNDJSON(sampleUnits);
      const lines = result.content.split('\n').filter(l => l.trim());
      
      expect(lines).toHaveLength(3);
      
      lines.forEach(line => {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('id');
        expect(parsed).toHaveProperty('title');
      });
    });
  });

  describe('Generic Export', () => {
    it('should export to any format', () => {
      const formats = [
        ExportFormat.CSV,
        ExportFormat.JSON,
        ExportFormat.JSON_LD,
        ExportFormat.MARKDOWN,
        ExportFormat.NDJSON,
      ];
      
      formats.forEach(format => {
        const result = DataExporter.export(sampleUnits, { format });
        expect(result.format).toBe(format);
        expect(result.unitCount).toBe(3);
      });
    });

    it('should throw for unsupported format', () => {
      expect(() => {
        DataExporter.export(sampleUnits, {
          format: 'unsupported' as any,
        });
      }).toThrow();
    });
  });

  describe('Export Results', () => {
    it('should calculate correct content size', () => {
      const result = DataExporter.toJSON(sampleUnits);
      
      expect(result.size).toBe(Buffer.byteLength(result.content, 'utf8'));
    });

    it('should include timestamp', () => {
      const result = DataExporter.toJSON(sampleUnits);
      
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should include correct MIME type', () => {
      const csvResult = DataExporter.toCSV(sampleUnits);
      const jsonResult = DataExporter.toJSON(sampleUnits);
      const jsonldResult = DataExporter.toJSONLD(sampleUnits);
      
      expect(csvResult.mimeType).toBe('text/csv');
      expect(jsonResult.mimeType).toBe('application/json');
      expect(jsonldResult.mimeType).toBe('application/ld+json');
    });
  });
});

describe('ExportUtils', () => {
  it('should return correct MIME types', () => {
    expect(ExportUtils.getMimeType(ExportFormat.CSV)).toBe('text/csv');
    expect(ExportUtils.getMimeType(ExportFormat.JSON)).toBe('application/json');
    expect(ExportUtils.getMimeType(ExportFormat.JSON_LD)).toBe('application/ld+json');
    expect(ExportUtils.getMimeType(ExportFormat.MARKDOWN)).toBe('text/markdown');
    expect(ExportUtils.getMimeType(ExportFormat.NDJSON)).toBe('application/x-ndjson');
  });

  it('should return correct file extensions', () => {
    expect(ExportUtils.getFileExtension(ExportFormat.CSV)).toBe('csv');
    expect(ExportUtils.getFileExtension(ExportFormat.JSON)).toBe('json');
    expect(ExportUtils.getFileExtension(ExportFormat.JSON_LD)).toBe('jsonld');
    expect(ExportUtils.getFileExtension(ExportFormat.MARKDOWN)).toBe('md');
    expect(ExportUtils.getFileExtension(ExportFormat.NDJSON)).toBe('ndjson');
  });

  it('should generate proper filenames', () => {
    const filename = ExportUtils.getFilename(ExportFormat.CSV);
    
    expect(filename).toContain('export_');
    expect(filename).toContain('.csv');
  });

  it('should use custom prefix in filename', () => {
    const filename = ExportUtils.getFilename(ExportFormat.JSON, 'backup');
    
    expect(filename).toContain('backup_');
    expect(filename).toContain('.json');
  });
});

describe('BatchExporter', () => {
  it('should export in batches', async () => {
    const largeDataset = Array.from({ length: 2500 }, (_, i) => ({
      id: 'u' + i,
      title: 'Unit ' + i,
      type: 'code',
      category: 'test',
      keywords: [],
      content: 'Content ' + i,
      timestamp: new Date(),
    }));
    
    const batchExporter = new BatchExporter(1000);
    const batches: any[] = [];
    
    await batchExporter.exportBatches(
      largeDataset,
      ExportFormat.JSON,
      async (result) => {
        batches.push(result);
      }
    );
    
    expect(batches).toHaveLength(3);
    expect(batches[0].unitCount).toBe(1000);
    expect(batches[1].unitCount).toBe(1000);
    expect(batches[2].unitCount).toBe(500);
  });

  it('should handle empty dataset', async () => {
    const batchExporter = new BatchExporter(1000);
    const batches: any[] = [];
    
    await batchExporter.exportBatches(
      [],
      ExportFormat.CSV,
      async (result) => {
        batches.push(result);
      }
    );
    
    expect(batches).toHaveLength(0);
  });
});
