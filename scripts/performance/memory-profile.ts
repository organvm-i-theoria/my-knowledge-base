import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { KnowledgeDatabase } from '../../src/database.js';
import { AtomicUnit } from '../../src/types.js';

const tempRoot = mkdtempSync(join(tmpdir(), 'kb-memory-profile-'));
const dbPath = join(tempRoot, 'knowledge.db');
const unitCount = Number(process.env.UNIT_COUNT ?? 1000);

function formatMb(value: number) {
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function snapshot(label: string) {
  const usage = process.memoryUsage();
  console.log(label);
  console.log(`  RSS: ${formatMb(usage.rss)}`);
  console.log(`  Heap Used: ${formatMb(usage.heapUsed)}`);
  console.log(`  Heap Total: ${formatMb(usage.heapTotal)}`);
}

snapshot('Memory before');

const db = new KnowledgeDatabase(dbPath);
for (let i = 0; i < unitCount; i += 1) {
  const unit: AtomicUnit = {
    id: `unit-${i}`,
    type: 'message',
    timestamp: new Date(),
    title: `Memory Unit ${i}`,
    content: `Memory profiling unit ${i} with sample text content.`,
    context: 'Performance harness.',
    tags: ['memory'],
    category: 'perf',
    relatedUnits: [],
    keywords: ['memory'],
  };

  db.insertAtomicUnit(unit);
}

snapshot('Memory after inserts');

db.close();
rmSync(tempRoot, { recursive: true, force: true });

snapshot('Memory after cleanup');
