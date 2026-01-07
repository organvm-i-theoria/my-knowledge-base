import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

// Setup test directories
const TEST_DIR = join(process.cwd(), '.test-tmp');

beforeAll(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// Global test utilities
global.TEST_DIR = TEST_DIR;

declare global {
  var TEST_DIR: string;
}
