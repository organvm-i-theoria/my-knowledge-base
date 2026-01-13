import { performance } from 'perf_hooks';
import { EmbeddingsService } from '../../src/embeddings-service.js';

const sampleCount = Number(process.env.EMBEDDING_COUNT ?? 20);
const apiKey = process.env.OPENAI_API_KEY; // allow-secret

if (!apiKey) {
  console.error('OPENAI_API_KEY is required for embedding throughput runs.');
  process.exit(1);
}

const service = new EmbeddingsService(apiKey);
const texts = Array.from({ length: sampleCount }, (_, i) => `Embedding performance sample ${i}`);

const start = performance.now();
await service.generateEmbeddings(texts);
const duration = performance.now() - start;

console.log('Embedding throughput results');
console.log(`Samples: ${sampleCount}`);
console.log(`Duration: ${duration.toFixed(2)}ms`);
console.log(`Avg/sample: ${(duration / sampleCount).toFixed(2)}ms`);
