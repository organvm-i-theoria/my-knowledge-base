import { performance } from 'perf_hooks';

const targetUrl = process.env.TARGET_URL ?? 'http://localhost:3000/api/search?q=graph';
const totalRequests = Number(process.env.REQUESTS ?? 1000);
const concurrency = Number(process.env.CONCURRENCY ?? 50);

let nextIndex = 0;
let failures = 0;

async function runRequest() {
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      failures += 1;
    }
  } catch {
    failures += 1;
  }
}

async function worker() {
  while (true) {
    const current = nextIndex;
    nextIndex += 1;

    if (current >= totalRequests) {
      return;
    }

    await runRequest();
  }
}

const start = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const duration = performance.now() - start;

const rps = totalRequests / (duration / 1000);

console.log('Load test results');
console.log(`Target: ${targetUrl}`);
console.log(`Requests: ${totalRequests}`);
console.log(`Concurrency: ${concurrency}`);
console.log(`Failures: ${failures}`);
console.log(`Duration: ${duration.toFixed(2)}ms`);
console.log(`Throughput: ${rps.toFixed(2)} req/s`);
