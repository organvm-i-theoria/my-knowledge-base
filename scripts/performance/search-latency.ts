import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';
import { KnowledgeDatabase } from '../../src/database.js';
import { AtomicUnit } from '../../src/types.js';

const tempRoot = mkdtempSync(join(tmpdir(), 'kb-search-latency-'));
const dbPath = join(tempRoot, 'knowledge.db');

const unitCount = Number(process.env.UNIT_COUNT ?? 500);
const queryCount = Number(process.env.QUERY_COUNT ?? 30);
const queries = ['graph', 'cache', 'search', 'token', 'export', 'index'];

const db = new KnowledgeDatabase(dbPath);

for (let i = 0; i < unitCount; i += 1) {
  const keyword = queries[i % queries.length];
  const unit: AtomicUnit = {
    id: `unit-${i}`,
    type: 'message',
    timestamp: new Date(),
    title: `Note ${i} about ${keyword}`,
    content: `This unit mentions ${keyword} and other details for search.`,
    context: 'Performance harness.',
    tags: [keyword],
    category: 'perf',
    relatedUnits: [],
    keywords: [keyword],
  };

  db.insertAtomicUnit(unit);
}

const durations: number[] = [];
for (let i = 0; i < queryCount; i += 1) {
  const query = queries[i % queries.length];
  const start = performance.now();
  db.searchText(query);
  durations.push(performance.now() - start);
}

const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
const max = Math.max(...durations);

console.log('Search latency results');
console.log(`Units: ${unitCount}`);
console.log(`Queries: ${queryCount}`);
console.log(`Average: ${avg.toFixed(2)}ms`);
console.log(`Max: ${max.toFixed(2)}ms`);

db.close();
rmSync(tempRoot, { recursive: true, force: true });
