import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DataExporter, ExportFormat, BatchExporter, ExportUtils } from './data-export.js';

const getContentString = (content: string | Buffer) =>
  typeof content === 'string' ? content : content.toString('utf8');

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
      const content = getContentString(result.content);
      
      expect(result.format).toBe(ExportFormat.CSV);
      expect(content).toContain('id');
      expect(content).toContain('u1');
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
      const content = getContentString(result.content);
      
      expect(content).toContain('"Title with, comma"');
      expect(content).toContain('"Content with ""quotes"""');
    });

    it('should allow custom delimiter', () => {
      const result = DataExporter.toCSV(sampleUnits, { delimiter: '|' });
      
      expect(getContentString(result.content)).toContain('|');
    });

    it('should allow custom fields', () => {
      const result = DataExporter.toCSV(sampleUnits, {
        fields: ['id', 'title'],
      });
      const content = getContentString(result.content);
      
      expect(content).toContain('id');
      expect(content).toContain('title');
      expect(content).not.toContain('type');
    });
  });

  describe('JSON Export', () => {
    it('should export to JSON format', () => {
      const result = DataExporter.toJSON(sampleUnits);
      const content = getContentString(result.content);
      
      expect(result.format).toBe(ExportFormat.JSON);
      expect(content).toContain('"id"');
      expect(content).toContain('"title"');
      expect(result.unitCount).toBe(3);
    });

    it('should include metadata when requested', () => {
      const result = DataExporter.toJSON(sampleUnits, {
        includeMetadata: true,
      });
      const content = getContentString(result.content);
      
      expect(content).toContain('"version"');
      expect(content).toContain('"exportedAt"');
      expect(content).toContain('"totalUnits"');
    });

    it('should parse valid JSON', () => {
      const result = DataExporter.toJSON(sampleUnits);
      const parsed = JSON.parse(getContentString(result.content));
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });
  });

  describe('JSON-LD Export', () => {
    it('should export to JSON-LD format', () => {
      const result = DataExporter.toJSONLD(sampleUnits);
      const content = getContentString(result.content);
      
      expect(result.format).toBe(ExportFormat.JSON_LD);
      expect(content).toContain('@context');
      expect(content).toContain('@graph');
      expect(result.unitCount).toBe(3);
    });

    it('should include context vocabulary', () => {
      const result = DataExporter.toJSONLD(sampleUnits);
      const parsed = JSON.parse(getContentString(result.content));
      
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
      
      expect(getContentString(result.content)).toContain('relatedUnits');
    });
  });

  describe('Markdown Export', () => {
    it('should export to Markdown format', () => {
      const result = DataExporter.toMarkdown(sampleUnits);
      const content = getContentString(result.content);
      
      expect(result.format).toBe(ExportFormat.MARKDOWN);
      expect(content).toContain('# Knowledge Base Export');
      expect(content).toContain('## 1. Unit 1: TypeScript Basics');
      expect(result.unitCount).toBe(3);
    });

    it('should include unit metadata', () => {
      const result = DataExporter.toMarkdown(sampleUnits);
      const content = getContentString(result.content);
      
      expect(content).toContain('**Type:**');
      expect(content).toContain('**Category:**');
      expect(content).toContain('**Keywords:**');
      expect(content).toContain('**Tags:**');
    });

    it('should format content sections', () => {
      const result = DataExporter.toMarkdown(sampleUnits);
      const content = getContentString(result.content);
      
      expect(content).toContain('### Content');
      expect(content).toContain('TypeScript is a strongly typed');
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
      const lines = getContentString(result.content).split('\n').filter(l => l.trim());

      expect(lines).toHaveLength(3);

      lines.forEach(line => {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('id');
        expect(parsed).toHaveProperty('title');
      });
    });
  });

  describe('HTML Export', () => {
    it('should export to HTML format', () => {
      const result = DataExporter.toHTML(sampleUnits);

      expect(result.format).toBe(ExportFormat.HTML);
      expect(result.mimeType).toBe('text/html');
      expect(result.unitCount).toBe(3);
    });

    it('should include HTML document structure', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html lang="en">');
      expect(content).toContain('<head>');
      expect(content).toContain('<body>');
      expect(content).toContain('</html>');
    });

    it('should include embedded CSS styles', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('<style>');
      expect(content).toContain(':root');
      expect(content).toContain('--bg:');
      expect(content).toContain('@media (prefers-color-scheme: dark)');
    });

    it('should include unit content', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('Unit 1: TypeScript Basics');
      expect(content).toContain('Unit 2: React Hooks');
      expect(content).toContain('Unit 3: Design Patterns');
    });

    it('should escape HTML special characters', () => {
      const unitsWithSpecialChars = [{
        id: 'u1',
        title: '<script>alert("xss")</script>',
        type: 'code',
        category: 'test',
        content: 'Content with <tags> & special chars',
        timestamp: new Date(),
        tags: [],
      }];

      const result = DataExporter.toHTML(unitsWithSpecialChars);
      const content = getContentString(result.content);

      expect(content).not.toContain('<script>alert');
      expect(content).toContain('&lt;script&gt;');
      expect(content).toContain('&amp;');
    });

    it('should include type badges with colors', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('type-badge');
      expect(content).toContain('background-color:');
    });

    it('should include export metadata', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('Knowledge Base Export');
      expect(content).toContain('Total Units:');
      expect(content).toContain('3');
    });

    it('should include tags when present', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('class="tag"');
      expect(content).toContain('typescript');
      expect(content).toContain('learning');
    });

    it('should include print styles', () => {
      const result = DataExporter.toHTML(sampleUnits);
      const content = getContentString(result.content);

      expect(content).toContain('@media print');
    });
  });

  describe('PNG Export', () => {
    it('should export to PNG with custom renderer', async () => {
      const renderer = async () => Buffer.from('png-data');
      const result = await DataExporter.toPNG(sampleUnits, {
        png: { renderer },
      });

      expect(result.format).toBe(ExportFormat.PNG);
      expect(result.mimeType).toBe('image/png');
      expect(Buffer.isBuffer(result.content)).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('ZIP Export', () => {
    it('should export to ZIP archive', async () => {
      const result = await DataExporter.toZIP(sampleUnits, {
        zip: {
          formats: [ExportFormat.JSON],
          prefix: 'kb',
        },
      });

      expect(result.format).toBe(ExportFormat.ZIP);
      expect(result.mimeType).toBe('application/zip');
      expect(Buffer.isBuffer(result.content)).toBe(true);

      const zip = await JSZip.loadAsync(result.content as Buffer);
      expect(zip.file('kb.json')).toBeDefined();
      expect(zip.file('kb.index.json')).toBeDefined();
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
        ExportFormat.HTML,
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

    it('should export async formats', async () => {
      const png = await DataExporter.exportAsync(sampleUnits, {
        format: ExportFormat.PNG,
        png: { renderer: async () => Buffer.from('png-data') },
      });

      expect(png.format).toBe(ExportFormat.PNG);

      const zip = await DataExporter.exportAsync(sampleUnits, {
        format: ExportFormat.ZIP,
        zip: { formats: [ExportFormat.JSON], prefix: 'kb' },
      });

      expect(zip.format).toBe(ExportFormat.ZIP);
    });
  });

  describe('Export Results', () => {
    it('should calculate correct content size', () => {
      const result = DataExporter.toJSON(sampleUnits);
      
      expect(result.size).toBe(Buffer.byteLength(getContentString(result.content), 'utf8'));
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
    expect(ExportUtils.getMimeType(ExportFormat.HTML)).toBe('text/html');
    expect(ExportUtils.getMimeType(ExportFormat.PNG)).toBe('image/png');
    expect(ExportUtils.getMimeType(ExportFormat.ZIP)).toBe('application/zip');
  });

  it('should return correct file extensions', () => {
    expect(ExportUtils.getFileExtension(ExportFormat.CSV)).toBe('csv');
    expect(ExportUtils.getFileExtension(ExportFormat.JSON)).toBe('json');
    expect(ExportUtils.getFileExtension(ExportFormat.JSON_LD)).toBe('jsonld');
    expect(ExportUtils.getFileExtension(ExportFormat.MARKDOWN)).toBe('md');
    expect(ExportUtils.getFileExtension(ExportFormat.NDJSON)).toBe('ndjson');
    expect(ExportUtils.getFileExtension(ExportFormat.HTML)).toBe('html');
    expect(ExportUtils.getFileExtension(ExportFormat.PNG)).toBe('png');
    expect(ExportUtils.getFileExtension(ExportFormat.ZIP)).toBe('zip');
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
