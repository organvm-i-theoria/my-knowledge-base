/**
 * Audit logging for security-sensitive actions.
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Logger } from './logger.js';

export interface AuditEvent {
  timestamp: string;
  action: string;
  method: string;
  path: string;
  statusCode: number;
  userId?: string;
  roles?: string[];
  ip?: string;
  userAgent?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export interface AuditLoggerOptions {
  enabled?: boolean;
  path?: string;
}

export class AuditLogger {
  private enabled: boolean;
  private path: string;
  private logger: Logger;

  constructor(options: AuditLoggerOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.path = options.path || './logs/audit.log';
    this.logger = new Logger({ context: 'audit-log' });

    if (this.enabled) {
      this.ensureLogDir();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  logEvent(event: AuditEvent): void {
    if (!this.enabled) return;

    try {
      this.ensureLogDir();
      appendFileSync(this.path, JSON.stringify(event) + '\n');
    } catch (error) {
      this.logger.warn('Failed to write audit log', { error }, 'audit-log');
    }
  }

  private ensureLogDir(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
