/**
 * Centralized logging system with multiple output levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, any>;
  error?: Error;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private minLevel: LogLevel = 'info';
  private enableFile = false;
  private logFile = './logs/app.log';

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const minIndex = levels.indexOf(this.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= minIndex;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const context = entry.context ? `[${entry.context}]` : '';
    
    let message = `${timestamp} ${level} ${context} ${entry.message}`;
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      message += '\n  ' + JSON.stringify(entry.data, null, 2).split('\n').join('\n  ');
    }
    
    if (entry.error) {
      message += `\n  Error: ${entry.error.message}\n  Stack: ${entry.error.stack}`;
    }
    
    return message;
  }

  private getConsoleColor(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m',    // Cyan
      info: '\x1b[32m',     // Green
      warn: '\x1b[33m',     // Yellow
      error: '\x1b[31m'     // Red
    };
    return colors[level];
  }

  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    const formatted = this.formatMessage(entry);
    const color = this.getConsoleColor(entry.level);
    const reset = '\x1b[0m';

    switch (entry.level) {
      case 'error':
        console.error(`${color}${formatted}${reset}`);
        break;
      case 'warn':
        console.warn(`${color}${formatted}${reset}`);
        break;
      default:
        console.log(`${color}${formatted}${reset}`);
    }
  }

  debug(message: string, data?: Record<string, any>, context?: string): void {
    this.log({ timestamp: new Date(), level: 'debug', message, data, context });
  }

  info(message: string, data?: Record<string, any>, context?: string): void {
    this.log({ timestamp: new Date(), level: 'info', message, data, context });
  }

  warn(message: string, data?: Record<string, any>, context?: string): void {
    this.log({ timestamp: new Date(), level: 'warn', message, data, context });
  }

  error(message: string, error?: Error, context?: string): void {
    this.log({
      timestamp: new Date(),
      level: 'error',
      message,
      error,
      context
    });
  }

  success(message: string, context?: string): void {
    const formatted = `✅ ${message}`;
    console.log(`\x1b[32m${formatted}\x1b[0m`);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    return level ? this.logs.filter(log => log.level === level) : this.logs;
  }

  clear(): void {
    this.logs = [];
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

// Singleton instance
export const logger = new Logger(process.env.LOG_LEVEL as LogLevel || 'info');

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler wrapper for async functions
 */
export function handleError(error: unknown, context?: string): AppError {
  if (error instanceof AppError) {
    logger.error(error.message, error, context);
    return error;
  }

  if (error instanceof Error) {
    const appError = new AppError(error.message, 'INTERNAL_ERROR', 500);
    logger.error(error.message, error, context);
    return appError;
  }

  const appError = new AppError(String(error), 'UNKNOWN_ERROR', 500);
  logger.error(String(error), undefined, context);
  return appError;
}

/**
 * Retry logic with exponential backoff
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000,
  context?: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug(
        `Attempt ${attempt}/${maxAttempts}`,
        undefined,
        context
      );
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxAttempts) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        logger.warn(
          `Attempt ${attempt} failed, retrying in ${delayMs}ms`,
          { error: lastError.message },
          context
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new AppError(
    `Failed after ${maxAttempts} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    500,
    { context, lastError: lastError?.message }
  );
}
