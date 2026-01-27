import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { createExportRoutes } from './export-api.js';

const sampleUnits = [
  {
    id: 'u1',
    title: 'Unit 1',
    type: 'code',
    category: 'programming',
    keywords: ['typescript'],
    content: 'TypeScript is great',
    timestamp: new Date('2024-01-15'),
    tags: ['typescript'],
  },
];

describe('Export API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/export', createExportRoutes());
  });

  it('should list available export formats', async () => {
    const response = await request(app).get('/api/export/formats').expect(200);

    expect(response.body.success).toBe(true);
    const names = response.body.data.map((item: any) => item.name);
    expect(names).toContain('png');
    expect(names).toContain('zip');
  });

  it('should export JSON', async () => {
    const response = await request(app)
      .post('/api/export/json')
      .send({ units: sampleUnits })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/json');
    expect(response.text).toContain('"id"');
  });

  it('should export ZIP', async () => {
    const response = await request(app)
      .post('/api/export/zip')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Uint8Array[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .send({
        units: sampleUnits,
        options: { zip: { formats: ['json'], prefix: 'kb' } },
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
    const zip = await JSZip.loadAsync(response.body);
    expect(zip.file('kb.json')).toBeDefined();
  });
});
