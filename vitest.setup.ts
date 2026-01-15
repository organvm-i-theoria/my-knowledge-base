import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

// Setup test directories
const TEST_DIR = join(process.cwd(), '.test-tmp');
process.env.NODE_ENV = 'test';

beforeAll(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (!process.env.VITEST_CLEANUP) {
    return;
  }
  if (existsSync(TEST_DIR)) {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup to avoid races across parallel workers.
    }
  }
});

// Global test utilities
global.TEST_DIR = TEST_DIR;

declare global {
  var TEST_DIR: string;
}
