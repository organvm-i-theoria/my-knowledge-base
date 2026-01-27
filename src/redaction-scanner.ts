/**
 * Redaction Scanner for batch file processing
 *
 * Scans directories of JSON files for secrets and PII,
 * generates reports, and applies redactions with backup support.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import { RedactionService, RedactionResult, DetectedItem, RedactionConfig } from './redaction-service.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface ScanResult {
  filePath: string;
  relativePath: string;
  detectedItems: DetectedItem[];
  hasSecrets: boolean;
  hasPII: boolean;
  realItemCount: number;
  falsePositiveCount: number;
  error?: string;
}

export interface ScanReport {
  scanPath: string;
  timestamp: Date;
  totalFiles: number;
  scannedFiles: number;
  filesWithIssues: number;
  filesWithSecrets: number;
  filesWithPII: number;
  totalDetections: number;
  totalRealDetections: number;
  totalFalsePositives: number;
  results: ScanResult[];
  errors: Array<{ file: string; error: string }>;
  duration: number;
}

export interface ApplyOptions {
  dryRun: boolean;
  createBackup: boolean;
  backupDir: string;
}

export interface ApplyResult {
  totalFiles: number;
  filesModified: number;
  filesSkipped: number;
  backupDir?: string;
  errors: Array<{ file: string; error: string }>;
  modifications: Array<{
    file: string;
    itemsRedacted: number;
    originalSize: number;
    newSize: number;
  }>;
}

export interface ScanOptions {
  /** File extensions to scan (default: ['.json']) */
  extensions?: string[];
  /** Maximum files to scan (default: unlimited) */
  maxFiles?: number;
  /** Concurrency for parallel scanning (default: 10) */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (scanned: number, total: number, current: string) => void;
  /** Redaction config */
  redactionConfig?: RedactionConfig;
  /** Only report files with actual issues (non-false-positive detections) */
  realIssuesOnly?: boolean;
}

// ============================================================================
// Redaction Scanner Implementation
// ============================================================================

export class RedactionScanner {
  private service: RedactionService;

  constructor(config?: RedactionConfig) {
    this.service = new RedactionService(config);
  }

  /**
   * Scan a directory for secrets and PII
   */
  async scanDirectory(dirPath: string, options: ScanOptions = {}): Promise<ScanReport> {
    const startTime = Date.now();
    const extensions = options.extensions ?? ['.json'];
    const maxFiles = options.maxFiles ?? Infinity;
    const realIssuesOnly = options.realIssuesOnly ?? true;

    // Collect all files
    const files = this.collectFiles(dirPath, extensions, maxFiles);
    const totalFiles = files.length;

    logger.info(`Scanning ${totalFiles} files in ${dirPath}`, undefined, 'RedactionScanner');

    const results: ScanResult[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    let filesWithSecrets = 0;
    let filesWithPII = 0;
    let totalDetections = 0;
    let totalRealDetections = 0;
    let totalFalsePositives = 0;

    // Process files
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const relativePath = relative(dirPath, filePath);

      if (options.onProgress) {
        options.onProgress(i + 1, totalFiles, relativePath);
      }

      try {
        const result = this.scanFile(filePath, dirPath);

        // Track totals
        totalDetections += result.detectedItems.length;
        totalRealDetections += result.realItemCount;
        totalFalsePositives += result.falsePositiveCount;

        if (result.hasSecrets) filesWithSecrets++;
        if (result.hasPII) filesWithPII++;

        // Only include files with real issues if configured
        if (!realIssuesOnly || result.realItemCount > 0) {
          results.push(result);
        }
      } catch (error) {
        errors.push({
          file: relativePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;

    return {
      scanPath: dirPath,
      timestamp: new Date(),
      totalFiles,
      scannedFiles: files.length,
      filesWithIssues: results.length,
      filesWithSecrets,
      filesWithPII,
      totalDetections,
      totalRealDetections,
      totalFalsePositives,
      results,
      errors,
      duration,
    };
  }

  /**
   * Scan a single file
   */
  scanFile(filePath: string, basePath?: string): ScanResult {
    const relativePath = basePath ? relative(basePath, filePath) : basename(filePath);

    const content = readFileSync(filePath, 'utf-8');
    const items = this.service.detect(content);

    const realItems = items.filter((i) => !i.isFalsePositive);
    const hasSecrets = realItems.some((i) => this.isSecretType(i.type));
    const hasPII = realItems.some((i) => this.isPIIType(i.type));

    return {
      filePath,
      relativePath,
      detectedItems: items,
      hasSecrets,
      hasPII,
      realItemCount: realItems.length,
      falsePositiveCount: items.length - realItems.length,
    };
  }

  /**
   * Apply redactions to files based on scan report
   */
  async applyRedactions(report: ScanReport, options: ApplyOptions): Promise<ApplyResult> {
    const errors: Array<{ file: string; error: string }> = [];
    const modifications: Array<{
      file: string;
      itemsRedacted: number;
      originalSize: number;
      newSize: number;
    }> = [];

    let filesModified = 0;
    let filesSkipped = 0;
    let backupDir: string | undefined;

    // Create backup directory if needed
    if (options.createBackup && !options.dryRun) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupDir = options.backupDir || `./backups/redaction-${timestamp}`;
      mkdirSync(backupDir, { recursive: true });
      logger.info(`Backup directory: ${backupDir}`, undefined, 'RedactionScanner');
    }

    // Process files with real issues
    const filesToProcess = report.results.filter((r) => r.realItemCount > 0);

    for (const result of filesToProcess) {
      try {
        const content = readFileSync(result.filePath, 'utf-8');
        const redactionResult = this.service.redact(content);

        if (redactionResult.stats.itemsRedacted === 0) {
          filesSkipped++;
          continue;
        }

        if (!options.dryRun) {
          // Create backup
          if (backupDir) {
            const backupPath = join(backupDir, result.relativePath);
            mkdirSync(dirname(backupPath), { recursive: true });
            copyFileSync(result.filePath, backupPath);
          }

          // Write redacted content
          writeFileSync(result.filePath, redactionResult.redactedText);
        }

        filesModified++;
        modifications.push({
          file: result.relativePath,
          itemsRedacted: redactionResult.stats.itemsRedacted,
          originalSize: content.length,
          newSize: redactionResult.redactedText.length,
        });
      } catch (error) {
        errors.push({
          file: result.relativePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      totalFiles: filesToProcess.length,
      filesModified,
      filesSkipped,
      backupDir,
      errors,
      modifications,
    };
  }

  /**
   * Generate a human-readable report
   */
  formatReport(report: ScanReport, verbose: boolean = false): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    REDACTION SCAN REPORT                       ');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Scan Path:     ${report.scanPath}`);
    lines.push(`Timestamp:     ${report.timestamp.toISOString()}`);
    lines.push(`Duration:      ${(report.duration / 1000).toFixed(2)}s`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('SUMMARY');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push(`Total Files:           ${report.totalFiles.toLocaleString()}`);
    lines.push(`Files Scanned:         ${report.scannedFiles.toLocaleString()}`);
    lines.push(`Files with Issues:     ${report.filesWithIssues.toLocaleString()}`);
    lines.push(`  - With Secrets:      ${report.filesWithSecrets.toLocaleString()}`);
    lines.push(`  - With PII:          ${report.filesWithPII.toLocaleString()}`);
    lines.push('');
    lines.push(`Total Detections:      ${report.totalDetections.toLocaleString()}`);
    lines.push(`  - Real Issues:       ${report.totalRealDetections.toLocaleString()}`);
    lines.push(`  - False Positives:   ${report.totalFalsePositives.toLocaleString()}`);

    const fpRate = report.totalDetections > 0
      ? ((report.totalFalsePositives / report.totalDetections) * 100).toFixed(1)
      : '0.0';
    lines.push(`  - FP Rate:           ${fpRate}%`);

    if (report.errors.length > 0) {
      lines.push('');
      lines.push('───────────────────────────────────────────────────────────────');
      lines.push(`ERRORS (${report.errors.length})`);
      lines.push('───────────────────────────────────────────────────────────────');
      for (const err of report.errors.slice(0, 10)) {
        lines.push(`  ${err.file}: ${err.error}`);
      }
      if (report.errors.length > 10) {
        lines.push(`  ... and ${report.errors.length - 10} more`);
      }
    }

    if (verbose && report.results.length > 0) {
      lines.push('');
      lines.push('───────────────────────────────────────────────────────────────');
      lines.push('DETAILS');
      lines.push('───────────────────────────────────────────────────────────────');

      for (const result of report.results.slice(0, 50)) {
        lines.push('');
        lines.push(`File: ${result.relativePath}`);
        lines.push(`  Real Issues: ${result.realItemCount}, False Positives: ${result.falsePositiveCount}`);

        const realItems = result.detectedItems.filter((i) => !i.isFalsePositive);
        for (const item of realItems.slice(0, 5)) {
          const preview = item.value.length > 30
            ? item.value.slice(0, 15) + '...' + item.value.slice(-10)
            : item.value;
          lines.push(`    - ${item.type}: ${preview} (${(item.confidence * 100).toFixed(0)}%)`);
        }
        if (realItems.length > 5) {
          lines.push(`    ... and ${realItems.length - 5} more`);
        }
      }

      if (report.results.length > 50) {
        lines.push('');
        lines.push(`... and ${report.results.length - 50} more files`);
      }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Format apply result as human-readable text
   */
  formatApplyResult(result: ApplyResult, dryRun: boolean): string {
    const lines: string[] = [];

    lines.push('───────────────────────────────────────────────────────────────');
    lines.push(dryRun ? 'REDACTION PREVIEW (DRY RUN)' : 'REDACTION APPLIED');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push(`Total Files:     ${result.totalFiles}`);
    lines.push(`Files Modified:  ${result.filesModified}`);
    lines.push(`Files Skipped:   ${result.filesSkipped}`);

    if (result.backupDir) {
      lines.push(`Backup Dir:      ${result.backupDir}`);
    }

    if (result.modifications.length > 0) {
      lines.push('');
      lines.push('Modifications:');
      for (const mod of result.modifications.slice(0, 20)) {
        const sizeDiff = mod.newSize - mod.originalSize;
        const sizeStr = sizeDiff < 0 ? `${sizeDiff}` : `+${sizeDiff}`;
        lines.push(`  ${mod.file}: ${mod.itemsRedacted} redactions (${sizeStr} bytes)`);
      }
      if (result.modifications.length > 20) {
        lines.push(`  ... and ${result.modifications.length - 20} more`);
      }
    }

    if (result.errors.length > 0) {
      lines.push('');
      lines.push('Errors:');
      for (const err of result.errors.slice(0, 10)) {
        lines.push(`  ${err.file}: ${err.error}`);
      }
    }

    lines.push('───────────────────────────────────────────────────────────────');

    return lines.join('\n');
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private collectFiles(dirPath: string, extensions: string[], maxFiles: number): string[] {
    const files: string[] = [];

    const walkDir = (dir: string) => {
      if (files.length >= maxFiles) return;

      const entries = readdirSync(dir);

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (!entry.startsWith('.') && entry !== 'node_modules') {
            walkDir(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = '.' + entry.split('.').pop();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    walkDir(dirPath);
    return files;
  }

  private isSecretType(type: string): boolean {
    return type.startsWith('api_key_') ||
      type === 'jwt_token' ||
      type === 'private_key' ||
      type === 'bearer_token' ||
      type === 'basic_auth' ||
      type === 'connection_string';
  }

  private isPIIType(type: string): boolean {
    return type === 'ssn' ||
      type === 'phone_number' ||
      type === 'email_address' ||
      type === 'credit_card' ||
      type.startsWith('ip_address_');
  }
}

// ============================================================================
// JSON Content Extractor
// ============================================================================

/**
 * Extract text content from JSON files for scanning
 * This handles the AtomicUnit JSON format specifically
 */
export function extractTextFromJson(jsonContent: string): string {
  try {
    const data = JSON.parse(jsonContent);

    // Handle AtomicUnit format
    if (data.content || data.title || data.context) {
      const parts: string[] = [];
      if (data.title) parts.push(data.title);
      if (data.content) parts.push(data.content);
      if (data.context) parts.push(data.context);
      return parts.join('\n');
    }

    // Handle array of units
    if (Array.isArray(data)) {
      return data
        .map((item) => {
          const parts: string[] = [];
          if (item.title) parts.push(item.title);
          if (item.content) parts.push(item.content);
          if (item.context) parts.push(item.context);
          return parts.join('\n');
        })
        .join('\n\n');
    }

    // Fallback: stringify entire object
    return JSON.stringify(data);
  } catch {
    // Not valid JSON, return as-is
    return jsonContent;
  }
}
