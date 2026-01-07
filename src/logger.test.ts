import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, AppError, retryAsync } from './logger';
import { join } from 'path';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ context: 'test' });
  });

  describe('Basic Logging', () => {
    it('should create logger with context', () => {
      expect(logger).toBeDefined();
      expect(logger['context']).toBe('test');
    });

    it('should log info messages', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      logger.info('Test message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log debug messages', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      logger.debug('Debug message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log warning messages', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      logger.warn('Warning message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error messages', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      logger.error('Error message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Logging with Additional Context', () => {
    it('should log with extra context', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      logger.info('Message', { userId: '123' });
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('Message');
      consoleSpy.mockRestore();
    });

    it('should log errors with stack traces', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const error = new Error('Test error');
      logger.error('An error occurred', { error });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Log Levels', () => {
    it('should respect DEBUG level', () => {
      const debugLogger = new Logger({ context: 'test', level: 'DEBUG' });
      const consoleSpy = vi.spyOn(console, 'log');
      debugLogger.debug('Debug');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should respect ERROR level', () => {
      const errorLogger = new Logger({ context: 'test', level: 'ERROR' });
      const consoleSpy = vi.spyOn(console, 'log');
      errorLogger.info('Info');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('AppError', () => {
  it('should create custom error with code', () => {
    const error = new AppError('Test error', 'TEST_ERROR');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error instanceof Error).toBe(true);
  });

  it('should include status code', () => {
    const error = new AppError('Not found', 'NOT_FOUND', 404);
    expect(error.statusCode).toBe(404);
  });

  it('should include context', () => {
    const error = new AppError('Error', 'TEST', 500, { userId: '123' });
    expect(error.context).toEqual({ userId: '123' });
  });

  it('should serialize to JSON', () => {
    const error = new AppError('Test', 'CODE', 400, { detail: 'info' });
    const json = error.toJSON();
    expect(json.message).toBe('Test');
    expect(json.code).toBe('CODE');
    expect(json.statusCode).toBe(400);
  });

  it('should have default status code 500', () => {
    const error = new AppError('Error', 'CODE');
    expect(error.statusCode).toBe(500);
  });
});

describe('retryAsync', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn(async () => 'success');
    const result = await retryAsync(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error('Fail');
      return 'success';
    });

    const result = await retryAsync(fn, 3, 10);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect max attempts', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Always fails');
    });

    await expect(
      retryAsync(fn, 3, 10)
    ).rejects.toThrow('Failed after 3 attempts');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const delays: number[] = [];
    const originalSetTimeout = setTimeout;
    vi.spyOn(global, 'setTimeout').mockImplementation(
      (fn: any, delay: any) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0);
      }
    );

    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts <= 2) throw new Error('Fail');
      return 'success';
    };

    await retryAsync(fn, 3, 10);

    // Should have delays: 10ms, 20ms
    expect(delays.length).toBeGreaterThan(0);
    expect(delays[0]).toBe(10);
    if (delays[1]) {
      expect(delays[1]).toBe(20);
    }

    vi.restoreAllMocks();
  });

  it('should accept custom context', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await retryAsync(fn, 2, 10, 'customContext');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalled();
  });

  it('should pass through successful return values', async () => {
    const expectedObject = { data: [1, 2, 3] };
    const fn = async () => expectedObject;
    const result = await retryAsync(fn);
    expect(result).toBe(expectedObject);
  });

  it('should eventually throw if all attempts fail', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error(`Attempt ${callCount} failed`);
    };

    await expect(retryAsync(fn, 2, 5)).rejects.toThrow('Failed after 2 attempts');
    expect(callCount).toBe(2);
  });
});

describe('Logger Integration', () => {
  it('should create child loggers with extended context', () => {
    const parentLogger = new Logger({ context: 'parent' });
    const childLogger = parentLogger.child({ subContext: 'child' });
    expect(childLogger).toBeDefined();
  });

  it('should handle null/undefined values gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    logger.info('Message', { nullValue: null, undefinedValue: undefined });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should handle circular references in context', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const obj: any = { a: 1 };
    obj.self = obj;
    expect(() => logger.info('Message', obj)).not.toThrow();
    consoleSpy.mockRestore();
  });
});
