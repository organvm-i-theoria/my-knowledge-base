#!/usr/bin/env node
/**
 * Redaction CLI - Scan and redact secrets/PII from knowledge base files
 *
 * Usage:
 *   npm run redact:scan [options]           - Scan and report
 *   npm run redact:apply [options]          - Apply redactions
 *   npm run redact:validate "text"          - Validate single text
 */

import { RedactionScanner, ScanReport, ApplyResult } from './redaction-scanner.js';
import { RedactionService, redactText, RedactionConfig } from './redaction-service.js';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  command: 'scan' | 'apply' | 'validate' | 'help';
  path: string;
  output?: string;
  json: boolean;
  verbose: boolean;
  dryRun: boolean;
  backup: boolean;
  backupDir: string;
  maxFiles: number;
  piiOnly: boolean;
  secretsOnly: boolean;
  confidence: number;
  text?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const result: CliArgs = {
    command: 'help',
    path: './atomized/json/units',
    json: false,
    verbose: false,
    dryRun: false,
    backup: true,
    backupDir: './backups',
    maxFiles: Infinity,
    piiOnly: false,
    secretsOnly: false,
    confidence: 0.5,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Commands
    if (arg === 'scan') {
      result.command = 'scan';
    } else if (arg === 'apply') {
      result.command = 'apply';
    } else if (arg === 'validate') {
      result.command = 'validate';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.text = args[++i];
      }
    } else if (arg === 'help' || arg === '--help' || arg === '-h') {
      result.command = 'help';
    }

    // Options
    else if (arg === '--path' || arg === '-p') {
      result.path = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--no-backup') {
      result.backup = false;
    } else if (arg === '--backup-dir') {
      result.backupDir = args[++i];
    } else if (arg === '--max-files') {
      result.maxFiles = parseInt(args[++i], 10);
    } else if (arg === '--pii-only') {
      result.piiOnly = true;
    } else if (arg === '--secrets-only') {
      result.secretsOnly = true;
    } else if (arg === '--confidence') {
      result.confidence = parseFloat(args[++i]);
    }

    i++;
  }

  // Default to scan if path is provided but no command
  if (result.command === 'help' && args.some(a => a.startsWith('--path') || a === '-p')) {
    result.command = 'scan';
  }

  return result;
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleScan(args: CliArgs): Promise<void> {
  const config: RedactionConfig = {
    detectSecrets: !args.piiOnly,
    detectPII: !args.secretsOnly,
    confidenceThreshold: args.confidence,
  };

  const scanner = new RedactionScanner(config);
  const fullPath = resolve(args.path);

  if (!existsSync(fullPath)) {
    console.error(`Error: Path does not exist: ${fullPath}`);
    process.exit(1);
  }

  console.log(`Scanning ${fullPath}...`);
  console.log('');

  let lastProgress = 0;
  const report = await scanner.scanDirectory(fullPath, {
    maxFiles: args.maxFiles,
    onProgress: (scanned, total, current) => {
      const pct = Math.floor((scanned / total) * 100);
      if (pct > lastProgress) {
        lastProgress = pct;
        process.stdout.write(`\r  Progress: ${pct}% (${scanned}/${total})`);
      }
    },
  });

  console.log('');
  console.log('');

  if (args.json) {
    const jsonOutput = JSON.stringify(report, null, 2);
    if (args.output) {
      writeFileSync(args.output, jsonOutput);
      console.log(`Report written to: ${args.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    const textReport = scanner.formatReport(report, args.verbose);
    if (args.output) {
      writeFileSync(args.output, textReport);
      console.log(`Report written to: ${args.output}`);
    } else {
      console.log(textReport);
    }
  }

  // Exit with error code if issues found
  if (report.totalRealDetections > 0) {
    process.exit(1);
  }
}

async function handleApply(args: CliArgs): Promise<void> {
  const config: RedactionConfig = {
    detectSecrets: !args.piiOnly,
    detectPII: !args.secretsOnly,
    confidenceThreshold: args.confidence,
  };

  const scanner = new RedactionScanner(config);
  const fullPath = resolve(args.path);

  if (!existsSync(fullPath)) {
    console.error(`Error: Path does not exist: ${fullPath}`);
    process.exit(1);
  }

  console.log(`Scanning ${fullPath}...`);
  console.log('');

  // First scan
  const report = await scanner.scanDirectory(fullPath, {
    maxFiles: args.maxFiles,
  });

  if (report.filesWithIssues === 0) {
    console.log('No issues found. Nothing to redact.');
    return;
  }

  console.log(scanner.formatReport(report, false));
  console.log('');

  if (args.dryRun) {
    console.log('DRY RUN MODE - No files will be modified');
  }

  console.log(`Applying redactions to ${report.filesWithIssues} files...`);
  console.log('');

  const result = await scanner.applyRedactions(report, {
    dryRun: args.dryRun,
    createBackup: args.backup,
    backupDir: args.backupDir,
  });

  console.log(scanner.formatApplyResult(result, args.dryRun));

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

function handleValidate(args: CliArgs): void {
  if (!args.text) {
    console.error('Error: No text provided to validate');
    console.log('Usage: npm run redact:validate "text to validate"');
    process.exit(1);
  }

  const config: RedactionConfig = {
    detectSecrets: !args.piiOnly,
    detectPII: !args.secretsOnly,
    confidenceThreshold: args.confidence,
  };

  const service = new RedactionService(config);
  const result = service.redact(args.text);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    REDACTION VALIDATION                        ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('ORIGINAL TEXT:');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(args.text);
  console.log('');
  console.log('REDACTED TEXT:');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(result.redactedText);
  console.log('');
  console.log('DETECTIONS:');
  console.log('───────────────────────────────────────────────────────────────');

  if (result.detectedItems.length === 0) {
    console.log('  No secrets or PII detected.');
  } else {
    for (const item of result.detectedItems) {
      const status = item.isFalsePositive ? '[FP]' : '[!!]';
      const preview = item.value.length > 40
        ? item.value.slice(0, 20) + '...' + item.value.slice(-15)
        : item.value;
      console.log(`  ${status} ${item.type}`);
      console.log(`      Value: ${preview}`);
      console.log(`      Confidence: ${(item.confidence * 100).toFixed(0)}%`);
      if (item.isFalsePositive && item.falsePositiveReason) {
        console.log(`      Reason: ${item.falsePositiveReason}`);
      }
      console.log('');
    }
  }

  console.log('STATS:');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Total Detected:    ${result.stats.totalDetected}`);
  console.log(`  Secrets:           ${result.stats.secretsDetected}`);
  console.log(`  PII:               ${result.stats.piiDetected}`);
  console.log(`  False Positives:   ${result.stats.falsePositives}`);
  console.log(`  Items Redacted:    ${result.stats.itemsRedacted}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (result.stats.itemsRedacted > 0) {
    process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
Redaction CLI - Scan and redact secrets/PII from knowledge base files

COMMANDS:
  scan        Scan files and generate report
  apply       Scan and apply redactions to files
  validate    Validate a single text string
  help        Show this help message

OPTIONS:
  --path, -p <path>       Path to scan (default: ./atomized/json/units)
  --output, -o <file>     Write report to file
  --json                  Output report as JSON
  --verbose, -v           Include detailed detection info
  --dry-run               Preview changes without modifying files
  --no-backup             Don't create backups before modifying
  --backup-dir <path>     Backup directory (default: ./backups)
  --max-files <n>         Limit number of files to scan
  --pii-only              Only detect PII (not secrets)
  --secrets-only          Only detect secrets (not PII)
  --confidence <n>        Minimum confidence threshold (0-1, default: 0.5)

EXAMPLES:
  # Scan atomized files and show report
  npm run redact:scan

  # Scan with JSON output
  npm run redact:scan -- --json --output scan-report.json

  # Preview redactions (dry run)
  npm run redact:apply -- --dry-run

  # Apply redactions with backup
  npm run redact:apply

  # Validate specific text
  npm run redact:validate "sk-abc123def456ghi789jkl012"

  # Scan specific directory
  npm run redact:scan -- --path ./raw/conversations

  # Scan only for secrets (ignore PII)
  npm run redact:scan -- --secrets-only
`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  switch (args.command) {
    case 'scan':
      await handleScan(args);
      break;
    case 'apply':
      await handleApply(args);
      break;
    case 'validate':
      handleValidate(args);
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
