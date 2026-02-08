import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

type Mode = 'dry-run' | 'apply';

type OperationStatus = 'planned' | 'applied' | 'skipped' | 'failed';

interface CliOptions {
  mode: Mode;
  root: string;
  reportDir: string;
  includeGlobs: string[];
  excludeGlobs: string[];
  noHardlink: boolean;
  deleteDsStore: boolean;
}

interface FileSnapshot {
  abs: string;
  rel: string;
  size: number;
  mtimeMs: number;
}

interface DirectorySnapshot {
  abs: string;
  rel: string;
}

interface InventoryEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

interface MoveOperation {
  operation: 'move';
  kind: 'top-level' | 'secret' | 'artifact-dir';
  sourcePath: string;
  destinationPath: string;
  status: OperationStatus;
  reason?: string;
}

interface ArtifactOperation {
  operation: 'artifact-move' | 'delete-ds-store';
  kind: 'directory' | 'file';
  sourcePath: string;
  destinationPath?: string;
  status: OperationStatus;
  reason?: string;
}

interface DedupeOperation {
  operation: 'dedupe-hardlink';
  hash: string;
  primaryPath: string;
  duplicatePath: string;
  size: number;
  status: OperationStatus;
  reason?: string;
}

interface ApplyEvent {
  operation:
    | 'move-top-level'
    | 'move-secret'
    | 'move-artifact-dir'
    | 'delete-ds-store'
    | 'dedupe-hardlink';
  sourcePath?: string;
  destinationPath?: string;
  status: OperationStatus;
  checksum?: string;
  reason?: string;
}

interface RollbackEntry {
  operation: 'move-file' | 'move-dir' | 'dedupe-hardlink' | 'delete-file';
  fromPath?: string;
  toPath?: string;
  path?: string;
  primaryPath?: string;
  checksum?: string;
  status: OperationStatus;
  reason?: string;
}

interface SummaryReport {
  mode: Mode;
  root: string;
  startedAt: string;
  finishedAt: string;
  inventory: {
    files: number;
    bytes: number;
  };
  operations: {
    topLevelMoves: number;
    secretMoves: number;
    artifactMoves: number;
    dsStoreDeletes: number;
    dedupeActions: number;
    duplicateSets: number;
    estimatedSavingsBytes: number;
  };
  statuses: {
    planned: number;
    applied: number;
    skipped: number;
    failed: number;
  };
  notes: string[];
}

const TOP_LEVEL_MOVE_MAP: Record<string, string> = {
  'Takeout 3': 'archive-batches/google-takeout/batch-0003',
  'Takeout 4': 'archive-batches/google-takeout/batch-0004',
  'Takeout 5': 'archive-batches/google-takeout/batch-0005',
  'Takeout 6': 'archive-batches/google-takeout/batch-0006',
  'Takeout 7': 'archive-batches/google-takeout/batch-0007',
  'Takeout 8': 'archive-batches/google-takeout/batch-0008',
  Archive: 'archive-batches/legacy/archive',
  _Archives: 'archive-batches/legacy/archives',
  sources: 'canonical/sources/curated-sources',
  ttl: 'canonical/sources/ttl',
  'data-2026-01-27-00-26-30-batch-0000':
    'canonical/sources/chat-export-batches/data-2026-01-27-00-26-30-batch-0000',
  'omni-root-import': 'canonical/sources/omni-root-import',
  exports: 'canonical/exports/exports',
  'absorb-alchemize': 'canonical/reference-tools/absorb-alchemize',
  thread_synthesizer: 'canonical/reference-tools/thread-synthesizer',
  'extract-unique': 'canonical/reference-tools/extract-unique',
};

const ARTIFACT_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.cache',
  '__pycache__',
]);

const DEFAULT_INCLUDE_GLOBS = ['**/*'];
const DEFAULT_EXCLUDE_GLOBS: string[] = [];

const hashCache = new Map<string, string>();

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function splitCsvPatterns(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function normalizeSlugSegment(segment: string): string {
  const normalized = segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'x';
}

function normalizeMappedDestinationPath(destination: string): string {
  return destination
    .split('/')
    .filter(Boolean)
    .map(normalizeSlugSegment)
    .join('/');
}

const NORMALIZED_TOP_LEVEL_MAP = Object.entries(TOP_LEVEL_MOVE_MAP).map(([source, destination]) => ({
  source,
  destination: normalizeMappedDestinationPath(destination),
}));

function pathStartsWithPrefix(relativePath: string, prefix: string): boolean {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

export function applyTopLevelMappingToRelativePath(relativePath: string): string {
  for (const mapping of NORMALIZED_TOP_LEVEL_MAP) {
    if (relativePath === mapping.source) {
      return mapping.destination;
    }

    if (relativePath.startsWith(`${mapping.source}/`)) {
      return `${mapping.destination}${relativePath.slice(mapping.source.length)}`;
    }
  }

  return relativePath;
}

function parseArgs(argv: string[]): CliOptions {
  let mode: Mode | undefined;
  let root = 'intake';
  let reportDir = 'intake/reports';
  let includeGlobs: string[] = [];
  let excludeGlobs: string[] = [];
  let noHardlink = false;
  let deleteDsStore = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--mode') {
      const value = argv[++i];
      if (value !== 'dry-run' && value !== 'apply') {
        throw new Error(`Invalid --mode value: ${value}`);
      }
      mode = value;
      continue;
    }

    if (arg === '--root') {
      root = argv[++i] ?? root;
      continue;
    }

    if (arg === '--report-dir') {
      reportDir = argv[++i] ?? reportDir;
      continue;
    }

    if (arg === '--include-globs') {
      includeGlobs = splitCsvPatterns(argv[++i]);
      continue;
    }

    if (arg === '--exclude-globs') {
      excludeGlobs = splitCsvPatterns(argv[++i]);
      continue;
    }

    if (arg === '--no-hardlink') {
      noHardlink = true;
      continue;
    }

    if (arg === '--delete-ds-store') {
      deleteDsStore = true;
      continue;
    }

    if (arg === '--no-delete-ds-store') {
      deleteDsStore = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!mode) {
    throw new Error('Missing required argument: --mode dry-run|apply');
  }

  if (includeGlobs.length === 0) {
    includeGlobs = [...DEFAULT_INCLUDE_GLOBS];
  }

  if (excludeGlobs.length === 0) {
    excludeGlobs = [...DEFAULT_EXCLUDE_GLOBS];
  }

  return {
    mode,
    root,
    reportDir,
    includeGlobs,
    excludeGlobs,
    noHardlink,
    deleteDsStore,
  };
}

function isInside(parentAbs: string, candidateAbs: string): boolean {
  const relative = path.relative(parentAbs, candidateAbs);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveReportRunDirectory(rootAbs: string, reportDirArg: string): string {
  const resolvedReportDir = path.isAbsolute(reportDirArg)
    ? reportDirArg
    : path.resolve(process.cwd(), reportDirArg);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return path.join(resolvedReportDir, `organize-${timestamp}`);
}

function shouldIncludePath(
  relativePath: string,
  includeGlobs: string[],
  excludeGlobs: string[],
): boolean {
  const includeAll = includeGlobs.some(pattern => pattern === '**/*' || pattern === '*');
  const included = includeAll
    ? true
    : (includeGlobs.length === 0
      ? true
      : includeGlobs.some(pattern => path.posix.matchesGlob(relativePath, pattern)));

  if (!included) {
    return false;
  }

  const excluded = excludeGlobs.some(pattern => path.posix.matchesGlob(relativePath, pattern));
  return !excluded;
}

function scanFilesystem(
  rootAbs: string,
  includeGlobs: string[],
  excludeGlobs: string[],
  excludedDirectoryPrefixes: string[],
): { files: FileSnapshot[]; directories: DirectorySnapshot[] } {
  const files: FileSnapshot[] = [];
  const directories: DirectorySnapshot[] = [];
  const stack: string[] = [''];

  while (stack.length > 0) {
    const currentRelativeDirectory = stack.pop()!;
    const currentAbsoluteDirectory = currentRelativeDirectory
      ? path.join(rootAbs, currentRelativeDirectory)
      : rootAbs;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentAbsoluteDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const relativePath = currentRelativeDirectory
        ? `${currentRelativeDirectory}/${entry.name}`
        : entry.name;
      const relativePosixPath = toPosixPath(relativePath);
      const absolutePath = path.join(rootAbs, relativePath);

      const isExcludedPrefix = excludedDirectoryPrefixes.some(prefix =>
        pathStartsWithPrefix(relativePosixPath, prefix),
      );
      if (isExcludedPrefix) {
        continue;
      }

      if (entry.isDirectory()) {
        directories.push({ abs: absolutePath, rel: relativePosixPath });
        stack.push(relativePosixPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!shouldIncludePath(relativePosixPath, includeGlobs, excludeGlobs)) {
        continue;
      }

      let stats: fs.Stats;
      try {
        stats = fs.statSync(absolutePath);
      } catch {
        continue;
      }

      files.push({
        abs: absolutePath,
        rel: relativePosixPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  }

  return { files, directories };
}

function ensureDirectoryExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureLifecycleTopology(rootAbs: string): void {
  const requiredDirectories = [
    'incoming',
    'canonical',
    'archive-batches',
    'artifacts',
    'reports',
    'canonical/sources',
    'canonical/reference-tools',
    'canonical/exports',
    'archive-batches/google-takeout',
    'archive-batches/legacy',
    'artifacts/system',
    'artifacts/secrets',
  ];

  for (const relativePath of requiredDirectories) {
    ensureDirectoryExists(path.join(rootAbs, relativePath));
  }
}

function writeJsonl(filePath: string, records: unknown[]): void {
  const content = records.map(record => JSON.stringify(record)).join('\n');
  const final = content.length > 0 ? `${content}\n` : '';
  fs.writeFileSync(filePath, final, 'utf8');
}

function writeJson(filePath: string, payload: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isSecretFile(relativePath: string): boolean {
  return path.posix.basename(relativePath).startsWith('.env');
}

function isDsStore(relativePath: string): boolean {
  return path.posix.basename(relativePath) === '.DS_Store';
}

function isUnderArtifactsSystem(relativePath: string): boolean {
  return pathStartsWithPrefix(relativePath, 'artifacts/system');
}

function isUnderArtifactsSecrets(relativePath: string): boolean {
  return pathStartsWithPrefix(relativePath, 'artifacts/secrets');
}

function joinPosix(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/\/+/, '/');
}

function planTopLevelMovesFromSnapshot(directories: DirectorySnapshot[]): MoveOperation[] {
  const topLevelDirectories = new Set(
    directories
      .map(directory => directory.rel)
      .filter(relativePath => !relativePath.includes('/')),
  );

  const operations: MoveOperation[] = [];

  for (const mapping of NORMALIZED_TOP_LEVEL_MAP) {
    if (!topLevelDirectories.has(mapping.source)) {
      continue;
    }

    operations.push({
      operation: 'move',
      kind: 'top-level',
      sourcePath: mapping.source,
      destinationPath: mapping.destination,
      status: 'planned',
    });
  }

  return operations;
}

function planSecretMoves(files: FileSnapshot[]): MoveOperation[] {
  const operations: MoveOperation[] = [];

  for (const file of files) {
    if (!isSecretFile(file.rel)) {
      continue;
    }

    if (isUnderArtifactsSecrets(file.rel)) {
      continue;
    }

    operations.push({
      operation: 'move',
      kind: 'secret',
      sourcePath: file.rel,
      destinationPath: joinPosix('artifacts/secrets', file.rel),
      status: 'planned',
    });
  }

  return operations;
}

export function selectArtifactDirectoryMoves(directories: DirectorySnapshot[]): MoveOperation[] {
  const candidates = directories
    .filter(directory => ARTIFACT_DIRECTORY_NAMES.has(path.posix.basename(directory.rel)))
    .filter(directory => !isUnderArtifactsSystem(directory.rel))
    .sort((left, right) => {
      const depthDifference = left.rel.split('/').length - right.rel.split('/').length;
      if (depthDifference !== 0) {
        return depthDifference;
      }
      return left.rel.localeCompare(right.rel);
    });

  const selected: MoveOperation[] = [];

  for (const candidate of candidates) {
    const nested = selected.some(selectedOperation =>
      pathStartsWithPrefix(candidate.rel, selectedOperation.sourcePath),
    );

    if (nested) {
      continue;
    }

    selected.push({
      operation: 'move',
      kind: 'artifact-dir',
      sourcePath: candidate.rel,
      destinationPath: joinPosix('artifacts/system', candidate.rel),
      status: 'planned',
    });
  }

  return selected;
}

function planDsStoreDeletes(files: FileSnapshot[]): ArtifactOperation[] {
  return files
    .filter(file => isDsStore(file.rel))
    .map(file => ({
      operation: 'delete-ds-store',
      kind: 'file',
      sourcePath: file.rel,
      status: 'planned' as OperationStatus,
    }));
}

function replacePrefix(relativePath: string, oldPrefix: string, newPrefix: string): string {
  if (relativePath === oldPrefix) {
    return newPrefix;
  }

  if (relativePath.startsWith(`${oldPrefix}/`)) {
    return `${newPrefix}${relativePath.slice(oldPrefix.length)}`;
  }

  return relativePath;
}

function applyVirtualMoveOperations(
  files: FileSnapshot[],
  directories: DirectorySnapshot[],
  operations: MoveOperation[],
): void {
  for (const operation of operations) {
    if (operation.status === 'failed') {
      continue;
    }

    for (const file of files) {
      file.rel = replacePrefix(file.rel, operation.sourcePath, operation.destinationPath);
    }

    for (const directory of directories) {
      directory.rel = replacePrefix(directory.rel, operation.sourcePath, operation.destinationPath);
    }
  }
}

function applyVirtualDsDeletes(files: FileSnapshot[]): FileSnapshot[] {
  return files.filter(file => !isDsStore(file.rel));
}

function containerRoot(relativePath: string): string {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'root';
  }

  if (segments[0] === 'canonical' && segments.length >= 3) {
    return segments.slice(0, 3).join('/');
  }

  if (segments[0] === 'archive-batches' && segments.length >= 3) {
    return segments.slice(0, 3).join('/');
  }

  if (segments[0] === 'artifacts' && segments.length >= 2) {
    return segments.slice(0, 2).join('/');
  }

  if (segments[0] === 'incoming' && segments.length >= 2) {
    return segments.slice(0, 2).join('/');
  }

  return segments[0];
}

function tierRank(relativePath: string): number {
  if (pathStartsWithPrefix(relativePath, 'canonical')) return 0;
  if (pathStartsWithPrefix(relativePath, 'archive-batches')) return 1;
  if (pathStartsWithPrefix(relativePath, 'artifacts')) return 2;
  if (pathStartsWithPrefix(relativePath, 'incoming')) return 3;
  return 4;
}

function buildContainerRichness(files: FileSnapshot[]): Map<string, number> {
  const richness = new Map<string, number>();

  for (const file of files) {
    if (isDsStore(file.rel)) {
      continue;
    }

    if (pathStartsWithPrefix(file.rel, 'artifacts')) {
      continue;
    }

    const key = containerRoot(file.rel);
    const current = richness.get(key) ?? 0;
    richness.set(key, current + 1);
  }

  return richness;
}

export function choosePrimaryFile(files: FileSnapshot[], richness: Map<string, number>): FileSnapshot {
  return [...files].sort((left, right) => {
    const leftRichness = richness.get(containerRoot(left.rel)) ?? 0;
    const rightRichness = richness.get(containerRoot(right.rel)) ?? 0;
    if (leftRichness !== rightRichness) {
      return rightRichness - leftRichness;
    }

    const leftTier = tierRank(left.rel);
    const rightTier = tierRank(right.rel);
    if (leftTier !== rightTier) {
      return leftTier - rightTier;
    }

    if (left.mtimeMs !== right.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }

    if (left.rel.length !== right.rel.length) {
      return left.rel.length - right.rel.length;
    }

    return left.rel.localeCompare(right.rel);
  })[0];
}

async function sha256File(absolutePath: string): Promise<string> {
  const cached = hashCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  const hash = await new Promise<string>((resolve, reject) => {
    const digest = crypto.createHash('sha256');
    const stream = fs.createReadStream(absolutePath);

    stream.on('error', error => reject(error));
    stream.on('data', chunk => digest.update(chunk));
    stream.on('end', () => resolve(digest.digest('hex')));
  });

  hashCache.set(absolutePath, hash);
  return hash;
}

async function planDedupeActions(files: FileSnapshot[]): Promise<{ operations: DedupeOperation[]; duplicateSets: number }> {
  const sizeGroups = new Map<number, FileSnapshot[]>();

  for (const file of files) {
    if (isDsStore(file.rel)) {
      continue;
    }

    const group = sizeGroups.get(file.size) ?? [];
    group.push(file);
    sizeGroups.set(file.size, group);
  }

  const richness = buildContainerRichness(files);
  const dedupeOperations: DedupeOperation[] = [];
  let duplicateSetCount = 0;

  for (const [, sizeGroup] of sizeGroups.entries()) {
    if (sizeGroup.length < 2) {
      continue;
    }

    const hashGroups = new Map<string, FileSnapshot[]>();

    for (const file of sizeGroup) {
      let hash: string;
      try {
        hash = await sha256File(file.abs);
      } catch {
        continue;
      }

      const group = hashGroups.get(hash) ?? [];
      group.push(file);
      hashGroups.set(hash, group);
    }

    for (const [hash, hashGroup] of hashGroups.entries()) {
      if (hashGroup.length < 2) {
        continue;
      }

      duplicateSetCount += 1;
      const primary = choosePrimaryFile(hashGroup, richness);
      let primaryStats: fs.Stats | null = null;
      try {
        primaryStats = fs.statSync(primary.abs);
      } catch {
        primaryStats = null;
      }

      for (const duplicate of hashGroup) {
        if (duplicate.rel === primary.rel) {
          continue;
        }

        if (primaryStats) {
          try {
            const duplicateStats = fs.statSync(duplicate.abs);
            if (
              duplicateStats.ino === primaryStats.ino &&
              duplicateStats.dev === primaryStats.dev
            ) {
              continue;
            }
          } catch {
            // If stat fails, keep planning the operation so apply phase can decide.
          }
        }

        dedupeOperations.push({
          operation: 'dedupe-hardlink',
          hash,
          primaryPath: primary.rel,
          duplicatePath: duplicate.rel,
          size: duplicate.size,
          status: 'planned',
        });
      }
    }
  }

  dedupeOperations.sort((left, right) => left.duplicatePath.localeCompare(right.duplicatePath));
  return { operations: dedupeOperations, duplicateSets: duplicateSetCount };
}

function inventoryFromFiles(files: FileSnapshot[]): InventoryEntry[] {
  return files.map(file => ({
    path: file.rel,
    size: file.size,
    mtimeMs: file.mtimeMs,
  }));
}

function buildConflictPath(destinationAbsolutePath: string): string {
  const parsed = path.parse(destinationAbsolutePath);
  const stamp = Date.now().toString(36);
  let attempt = 1;

  while (attempt < 1000) {
    const candidate = path.join(
      parsed.dir,
      `${parsed.name}.conflict-${stamp}-${attempt}${parsed.ext}`,
    );
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    attempt += 1;
  }

  throw new Error(`Unable to build conflict path for ${destinationAbsolutePath}`);
}

function movePathWithMerge(sourceAbsolutePath: string, destinationAbsolutePath: string): string {
  if (!fs.existsSync(sourceAbsolutePath)) {
    return destinationAbsolutePath;
  }

  const sourceStats = fs.lstatSync(sourceAbsolutePath);

  if (!fs.existsSync(destinationAbsolutePath)) {
    ensureDirectoryExists(path.dirname(destinationAbsolutePath));
    fs.renameSync(sourceAbsolutePath, destinationAbsolutePath);
    return destinationAbsolutePath;
  }

  const destinationStats = fs.lstatSync(destinationAbsolutePath);

  if (sourceStats.isDirectory() && destinationStats.isDirectory()) {
    const entries = fs.readdirSync(sourceAbsolutePath);
    for (const entry of entries) {
      movePathWithMerge(
        path.join(sourceAbsolutePath, entry),
        path.join(destinationAbsolutePath, entry),
      );
    }

    try {
      fs.rmdirSync(sourceAbsolutePath);
    } catch {
      // ignore non-empty races
    }
    return destinationAbsolutePath;
  }

  const conflictPath = buildConflictPath(destinationAbsolutePath);
  ensureDirectoryExists(path.dirname(conflictPath));
  fs.renameSync(sourceAbsolutePath, conflictPath);
  return conflictPath;
}

async function moveFileSafely(
  sourceAbsolutePath: string,
  destinationAbsolutePath: string,
): Promise<{ status: OperationStatus; finalPath: string; reason?: string; checksum?: string }> {
  if (!fs.existsSync(sourceAbsolutePath)) {
    return {
      status: 'skipped',
      finalPath: destinationAbsolutePath,
      reason: 'Source file does not exist',
    };
  }

  const checksum = await sha256File(sourceAbsolutePath);

  if (!fs.existsSync(destinationAbsolutePath)) {
    ensureDirectoryExists(path.dirname(destinationAbsolutePath));
    fs.renameSync(sourceAbsolutePath, destinationAbsolutePath);
    return {
      status: 'applied',
      finalPath: destinationAbsolutePath,
      checksum,
    };
  }

  const destinationChecksum = await sha256File(destinationAbsolutePath);

  if (destinationChecksum === checksum) {
    fs.unlinkSync(sourceAbsolutePath);
    return {
      status: 'applied',
      finalPath: destinationAbsolutePath,
      checksum,
      reason: 'Destination already had identical content; removed source copy',
    };
  }

  const conflictPath = buildConflictPath(destinationAbsolutePath);
  ensureDirectoryExists(path.dirname(conflictPath));
  fs.renameSync(sourceAbsolutePath, conflictPath);
  return {
    status: 'applied',
    finalPath: conflictPath,
    checksum,
    reason: 'Destination collision; moved source to conflict path',
  };
}

function mapByRelativePath(files: FileSnapshot[]): Map<string, FileSnapshot> {
  const fileMap = new Map<string, FileSnapshot>();
  for (const file of files) {
    fileMap.set(file.rel, file);
  }
  return fileMap;
}

export async function replaceWithHardlink(
  primaryAbsolutePath: string,
  duplicateAbsolutePath: string,
): Promise<{ status: OperationStatus; reason?: string }> {
  if (!fs.existsSync(primaryAbsolutePath) || !fs.existsSync(duplicateAbsolutePath)) {
    return {
      status: 'skipped',
      reason: 'Primary or duplicate path missing',
    };
  }

  const primaryStats = fs.statSync(primaryAbsolutePath);
  const duplicateStats = fs.statSync(duplicateAbsolutePath);

  if (primaryStats.ino === duplicateStats.ino && primaryStats.dev === duplicateStats.dev) {
    return {
      status: 'skipped',
      reason: 'Already hardlinked',
    };
  }

  const backupPath = `${duplicateAbsolutePath}.hardlink-backup-${Date.now().toString(36)}`;
  fs.renameSync(duplicateAbsolutePath, backupPath);

  try {
    fs.linkSync(primaryAbsolutePath, duplicateAbsolutePath);
    fs.unlinkSync(backupPath);
    return { status: 'applied' };
  } catch (error) {
    fs.renameSync(backupPath, duplicateAbsolutePath);
    return {
      status: 'skipped',
      reason: error instanceof Error ? error.message : 'Hardlink operation failed',
    };
  }
}

function computeExcludedDirectoryPrefixes(rootAbs: string, reportRunDirectoryAbs: string): string[] {
  const prefixes: string[] = ['reports'];

  if (isInside(rootAbs, reportRunDirectoryAbs)) {
    const relative = toPosixPath(path.relative(rootAbs, reportRunDirectoryAbs));
    if (relative && !prefixes.includes(relative)) {
      prefixes.push(relative);
    }
  }

  return prefixes;
}

function setStatusCounts(
  statusCounts: Record<OperationStatus, number>,
  status: OperationStatus,
): void {
  statusCounts[status] += 1;
}

async function runDryRun(
  options: CliOptions,
  rootAbs: string,
  reportRunDirAbs: string,
): Promise<{
  inventoryEntries: InventoryEntry[];
  movePlan: MoveOperation[];
  artifactPlan: ArtifactOperation[];
  dedupePlan: DedupeOperation[];
  rollbackManifest: RollbackEntry[];
  duplicateSets: number;
}> {
  ensureDirectoryExists(reportRunDirAbs);

  const excludedPrefixes = computeExcludedDirectoryPrefixes(rootAbs, reportRunDirAbs);
  const snapshot = scanFilesystem(rootAbs, options.includeGlobs, options.excludeGlobs, excludedPrefixes);

  const virtualFiles = snapshot.files.map(file => ({ ...file }));
  const virtualDirectories = snapshot.directories.map(directory => ({ ...directory }));

  const topLevelMoves = planTopLevelMovesFromSnapshot(virtualDirectories);
  applyVirtualMoveOperations(virtualFiles, virtualDirectories, topLevelMoves);

  const secretMoves = planSecretMoves(virtualFiles);
  applyVirtualMoveOperations(virtualFiles, virtualDirectories, secretMoves);

  const artifactDirectoryMoves = selectArtifactDirectoryMoves(virtualDirectories);
  applyVirtualMoveOperations(virtualFiles, virtualDirectories, artifactDirectoryMoves);

  const dsDeletes = options.deleteDsStore ? planDsStoreDeletes(virtualFiles) : [];
  const filesAfterDsDelete = options.deleteDsStore ? applyVirtualDsDeletes(virtualFiles) : virtualFiles;

  const dedupe = await planDedupeActions(filesAfterDsDelete);

  const rollbackManifest: RollbackEntry[] = [
    ...topLevelMoves.map(move => ({
      operation: 'move-dir' as const,
      fromPath: move.destinationPath,
      toPath: move.sourcePath,
      status: 'planned' as OperationStatus,
    })),
    ...secretMoves.map(move => ({
      operation: 'move-file' as const,
      fromPath: move.destinationPath,
      toPath: move.sourcePath,
      status: 'planned' as OperationStatus,
    })),
    ...artifactDirectoryMoves.map(move => ({
      operation: 'move-dir' as const,
      fromPath: move.destinationPath,
      toPath: move.sourcePath,
      status: 'planned' as OperationStatus,
    })),
    ...dedupe.operations.map(operation => ({
      operation: 'dedupe-hardlink' as const,
      path: operation.duplicatePath,
      primaryPath: operation.primaryPath,
      checksum: operation.hash,
      status: 'planned' as OperationStatus,
    })),
  ];

  const inventoryEntries = inventoryFromFiles(snapshot.files);

  writeJsonl(path.join(reportRunDirAbs, 'inventory.jsonl'), inventoryEntries);
  writeJsonl(path.join(reportRunDirAbs, 'move-plan.jsonl'), [...topLevelMoves, ...secretMoves]);
  writeJsonl(path.join(reportRunDirAbs, 'artifact-plan.jsonl'), [
    ...artifactDirectoryMoves.map(move => ({
      operation: 'artifact-move',
      kind: 'directory',
      sourcePath: move.sourcePath,
      destinationPath: move.destinationPath,
      status: move.status,
    })),
    ...dsDeletes,
  ]);
  writeJsonl(path.join(reportRunDirAbs, 'dedupe-plan.jsonl'), dedupe.operations);
  writeJsonl(path.join(reportRunDirAbs, 'rollback-manifest.jsonl'), rollbackManifest);

  return {
    inventoryEntries,
    movePlan: [...topLevelMoves, ...secretMoves],
    artifactPlan: [
      ...artifactDirectoryMoves.map(move => ({
        operation: 'artifact-move',
        kind: 'directory',
        sourcePath: move.sourcePath,
        destinationPath: move.destinationPath,
        status: move.status,
      } as ArtifactOperation)),
      ...dsDeletes,
    ],
    dedupePlan: dedupe.operations,
    rollbackManifest,
    duplicateSets: dedupe.duplicateSets,
  };
}

async function runApply(
  options: CliOptions,
  rootAbs: string,
  reportRunDirAbs: string,
): Promise<{
  inventoryEntries: InventoryEntry[];
  movePlan: MoveOperation[];
  artifactPlan: ArtifactOperation[];
  dedupePlan: DedupeOperation[];
  applyEvents: ApplyEvent[];
  rollbackManifest: RollbackEntry[];
  duplicateSets: number;
}> {
  ensureDirectoryExists(reportRunDirAbs);
  ensureLifecycleTopology(rootAbs);

  const excludedPrefixes = computeExcludedDirectoryPrefixes(rootAbs, reportRunDirAbs);
  const applyEvents: ApplyEvent[] = [];
  const rollbackManifest: RollbackEntry[] = [];
  const allMovePlan: MoveOperation[] = [];
  const allArtifactPlan: ArtifactOperation[] = [];

  const initialSnapshot = scanFilesystem(rootAbs, options.includeGlobs, options.excludeGlobs, excludedPrefixes);
  const inventoryEntries = inventoryFromFiles(initialSnapshot.files);

  const topLevelMoves = planTopLevelMovesFromSnapshot(initialSnapshot.directories);
  allMovePlan.push(...topLevelMoves);

  for (const operation of topLevelMoves) {
    const sourceAbsolutePath = path.join(rootAbs, operation.sourcePath);
    const destinationAbsolutePath = path.join(rootAbs, operation.destinationPath);

    if (!fs.existsSync(sourceAbsolutePath)) {
      operation.status = 'skipped';
      operation.reason = 'Source directory does not exist';
      applyEvents.push({
        operation: 'move-top-level',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'skipped',
        reason: operation.reason,
      });
      continue;
    }

    ensureDirectoryExists(path.dirname(destinationAbsolutePath));

    try {
      const finalAbsolutePath = movePathWithMerge(sourceAbsolutePath, destinationAbsolutePath);
      const finalRelativePath = toPosixPath(path.relative(rootAbs, finalAbsolutePath));
      operation.status = 'applied';
      if (finalRelativePath !== operation.destinationPath) {
        operation.reason = `Collision resolved to ${finalRelativePath}`;
      }

      applyEvents.push({
        operation: 'move-top-level',
        sourcePath: operation.sourcePath,
        destinationPath: finalRelativePath,
        status: 'applied',
        reason: operation.reason,
      });
      rollbackManifest.push({
        operation: 'move-dir',
        fromPath: finalRelativePath,
        toPath: operation.sourcePath,
        status: 'applied',
        reason: operation.reason,
      });
    } catch (error) {
      operation.status = 'failed';
      operation.reason = error instanceof Error ? error.message : 'Top-level move failed';
      applyEvents.push({
        operation: 'move-top-level',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'failed',
        reason: operation.reason,
      });
    }
  }

  let currentSnapshot = scanFilesystem(rootAbs, options.includeGlobs, options.excludeGlobs, excludedPrefixes);

  const secretMoves = planSecretMoves(currentSnapshot.files);
  allMovePlan.push(...secretMoves);

  for (const operation of secretMoves) {
    const sourceAbsolutePath = path.join(rootAbs, operation.sourcePath);
    const destinationAbsolutePath = path.join(rootAbs, operation.destinationPath);

    try {
      const result = await moveFileSafely(sourceAbsolutePath, destinationAbsolutePath);
      operation.status = result.status;
      operation.reason = result.reason;
      const finalRelativePath = toPosixPath(path.relative(rootAbs, result.finalPath));

      applyEvents.push({
        operation: 'move-secret',
        sourcePath: operation.sourcePath,
        destinationPath: finalRelativePath,
        status: result.status,
        checksum: result.checksum,
        reason: result.reason,
      });

      if (result.status === 'applied') {
        rollbackManifest.push({
          operation: 'move-file',
          fromPath: finalRelativePath,
          toPath: operation.sourcePath,
          checksum: result.checksum,
          status: 'applied',
          reason: result.reason,
        });
      }
    } catch (error) {
      operation.status = 'failed';
      operation.reason = error instanceof Error ? error.message : 'Secret move failed';
      applyEvents.push({
        operation: 'move-secret',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'failed',
        reason: operation.reason,
      });
    }
  }

  currentSnapshot = scanFilesystem(rootAbs, options.includeGlobs, options.excludeGlobs, excludedPrefixes);

  const artifactDirectoryMoves = selectArtifactDirectoryMoves(currentSnapshot.directories);

  for (const operation of artifactDirectoryMoves) {
    const sourceAbsolutePath = path.join(rootAbs, operation.sourcePath);
    const destinationAbsolutePath = path.join(rootAbs, operation.destinationPath);

    if (!fs.existsSync(sourceAbsolutePath)) {
      operation.status = 'skipped';
      operation.reason = 'Artifact source directory does not exist';
      allArtifactPlan.push({
        operation: 'artifact-move',
        kind: 'directory',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'skipped',
        reason: operation.reason,
      });
      applyEvents.push({
        operation: 'move-artifact-dir',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'skipped',
        reason: operation.reason,
      });
      continue;
    }

    try {
      ensureDirectoryExists(path.dirname(destinationAbsolutePath));
      const finalAbsolutePath = movePathWithMerge(sourceAbsolutePath, destinationAbsolutePath);
      const finalRelativePath = toPosixPath(path.relative(rootAbs, finalAbsolutePath));
      operation.status = 'applied';
      if (finalRelativePath !== operation.destinationPath) {
        operation.reason = `Collision resolved to ${finalRelativePath}`;
      }

      allArtifactPlan.push({
        operation: 'artifact-move',
        kind: 'directory',
        sourcePath: operation.sourcePath,
        destinationPath: finalRelativePath,
        status: 'applied',
        reason: operation.reason,
      });
      applyEvents.push({
        operation: 'move-artifact-dir',
        sourcePath: operation.sourcePath,
        destinationPath: finalRelativePath,
        status: 'applied',
        reason: operation.reason,
      });
      rollbackManifest.push({
        operation: 'move-dir',
        fromPath: finalRelativePath,
        toPath: operation.sourcePath,
        status: 'applied',
        reason: operation.reason,
      });
    } catch (error) {
      operation.status = 'failed';
      operation.reason = error instanceof Error ? error.message : 'Artifact move failed';

      allArtifactPlan.push({
        operation: 'artifact-move',
        kind: 'directory',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'failed',
        reason: operation.reason,
      });
      applyEvents.push({
        operation: 'move-artifact-dir',
        sourcePath: operation.sourcePath,
        destinationPath: operation.destinationPath,
        status: 'failed',
        reason: operation.reason,
      });
    }
  }

  currentSnapshot = scanFilesystem(rootAbs, options.includeGlobs, options.excludeGlobs, excludedPrefixes);

  const dsDeletes = options.deleteDsStore ? planDsStoreDeletes(currentSnapshot.files) : [];

  for (const operation of dsDeletes) {
    const sourceAbsolutePath = path.join(rootAbs, operation.sourcePath);

    if (!fs.existsSync(sourceAbsolutePath)) {
      operation.status = 'skipped';
      operation.reason = 'File already removed';
      applyEvents.push({
        operation: 'delete-ds-store',
        sourcePath: operation.sourcePath,
        status: 'skipped',
        reason: operation.reason,
      });
      continue;
    }

    try {
      const checksum = await sha256File(sourceAbsolutePath);
      fs.unlinkSync(sourceAbsolutePath);
      operation.status = 'applied';

      applyEvents.push({
        operation: 'delete-ds-store',
        sourcePath: operation.sourcePath,
        status: 'applied',
        checksum,
      });
      rollbackManifest.push({
        operation: 'delete-file',
        path: operation.sourcePath,
        checksum,
        status: 'applied',
      });
    } catch (error) {
      operation.status = 'failed';
      operation.reason = error instanceof Error ? error.message : 'Delete operation failed';
      applyEvents.push({
        operation: 'delete-ds-store',
        sourcePath: operation.sourcePath,
        status: 'failed',
        reason: operation.reason,
      });
    }
  }

  allArtifactPlan.push(...dsDeletes);

  currentSnapshot = scanFilesystem(rootAbs, options.includeGlobs, options.excludeGlobs, excludedPrefixes);

  const dedupe = await planDedupeActions(currentSnapshot.files);
  const fileMap = mapByRelativePath(currentSnapshot.files);

  for (const operation of dedupe.operations) {
    const primaryFile = fileMap.get(operation.primaryPath);
    const duplicateFile = fileMap.get(operation.duplicatePath);

    if (!primaryFile || !duplicateFile) {
      operation.status = 'skipped';
      operation.reason = 'Primary or duplicate file missing after prior operations';
      applyEvents.push({
        operation: 'dedupe-hardlink',
        sourcePath: operation.duplicatePath,
        destinationPath: operation.primaryPath,
        status: 'skipped',
        reason: operation.reason,
      });
      continue;
    }

    if (options.noHardlink) {
      operation.status = 'skipped';
      operation.reason = '--no-hardlink set; no replacement performed';
      applyEvents.push({
        operation: 'dedupe-hardlink',
        sourcePath: operation.duplicatePath,
        destinationPath: operation.primaryPath,
        status: 'skipped',
        reason: operation.reason,
      });
      continue;
    }

    const result = await replaceWithHardlink(primaryFile.abs, duplicateFile.abs);
    operation.status = result.status;
    operation.reason = result.reason;

    applyEvents.push({
      operation: 'dedupe-hardlink',
      sourcePath: operation.duplicatePath,
      destinationPath: operation.primaryPath,
      status: result.status,
      checksum: operation.hash,
      reason: result.reason,
    });

    if (result.status === 'applied') {
      rollbackManifest.push({
        operation: 'dedupe-hardlink',
        path: operation.duplicatePath,
        primaryPath: operation.primaryPath,
        checksum: operation.hash,
        status: 'applied',
      });
    }
  }

  writeJsonl(path.join(reportRunDirAbs, 'inventory.jsonl'), inventoryEntries);
  writeJsonl(path.join(reportRunDirAbs, 'move-plan.jsonl'), allMovePlan);
  writeJsonl(path.join(reportRunDirAbs, 'artifact-plan.jsonl'), allArtifactPlan);
  writeJsonl(path.join(reportRunDirAbs, 'dedupe-plan.jsonl'), dedupe.operations);
  writeJsonl(path.join(reportRunDirAbs, 'apply-log.jsonl'), applyEvents);
  writeJsonl(path.join(reportRunDirAbs, 'rollback-manifest.jsonl'), rollbackManifest);

  return {
    inventoryEntries,
    movePlan: allMovePlan,
    artifactPlan: allArtifactPlan,
    dedupePlan: dedupe.operations,
    applyEvents,
    rollbackManifest,
    duplicateSets: dedupe.duplicateSets,
  };
}

function bytesFromInventory(entries: InventoryEntry[]): number {
  return entries.reduce((total, entry) => total + entry.size, 0);
}

function summarizeStatuses(
  movePlan: MoveOperation[],
  artifactPlan: ArtifactOperation[],
  dedupePlan: DedupeOperation[],
  applyEvents?: ApplyEvent[],
): Record<OperationStatus, number> {
  const counts: Record<OperationStatus, number> = {
    planned: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  if (applyEvents && applyEvents.length > 0) {
    for (const event of applyEvents) {
      setStatusCounts(counts, event.status);
    }
    return counts;
  }

  for (const operation of movePlan) {
    setStatusCounts(counts, operation.status);
  }

  for (const operation of artifactPlan) {
    setStatusCounts(counts, operation.status);
  }

  for (const operation of dedupePlan) {
    setStatusCounts(counts, operation.status);
  }

  return counts;
}

function buildSummaryReport(
  mode: Mode,
  rootAbs: string,
  startedAt: Date,
  inventoryEntries: InventoryEntry[],
  movePlan: MoveOperation[],
  artifactPlan: ArtifactOperation[],
  dedupePlan: DedupeOperation[],
  duplicateSets: number,
  notes: string[],
  applyEvents?: ApplyEvent[],
): SummaryReport {
  const dedupeSavings = dedupePlan.reduce((total, operation) => total + operation.size, 0);

  const topLevelMoves = movePlan.filter(operation => operation.kind === 'top-level').length;
  const secretMoves = movePlan.filter(operation => operation.kind === 'secret').length;
  const artifactMoves = artifactPlan.filter(operation => operation.operation === 'artifact-move').length;
  const dsStoreDeletes = artifactPlan.filter(operation => operation.operation === 'delete-ds-store').length;
  const dedupeActions = dedupePlan.length;

  return {
    mode,
    root: rootAbs,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    inventory: {
      files: inventoryEntries.length,
      bytes: bytesFromInventory(inventoryEntries),
    },
    operations: {
      topLevelMoves,
      secretMoves,
      artifactMoves,
      dsStoreDeletes,
      dedupeActions,
      duplicateSets,
      estimatedSavingsBytes: dedupeSavings,
    },
    statuses: summarizeStatuses(movePlan, artifactPlan, dedupePlan, applyEvents),
    notes,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  const rootAbs = path.resolve(process.cwd(), options.root);
  if (!fs.existsSync(rootAbs) || !fs.statSync(rootAbs).isDirectory()) {
    throw new Error(`Root directory not found or not a directory: ${rootAbs}`);
  }

  const reportRunDirectoryAbs = resolveReportRunDirectory(rootAbs, options.reportDir);
  ensureDirectoryExists(reportRunDirectoryAbs);

  const notes: string[] = [];
  notes.push('Dry-run mode does not mutate files; paths are projected in memory.');
  notes.push('Reports under intake/reports are excluded from organization and dedupe scope.');

  if (options.noHardlink) {
    notes.push('Hardlink replacement disabled via --no-hardlink.');
  }

  let inventoryEntries: InventoryEntry[] = [];
  let movePlan: MoveOperation[] = [];
  let artifactPlan: ArtifactOperation[] = [];
  let dedupePlan: DedupeOperation[] = [];
  let rollbackManifest: RollbackEntry[] = [];
  let applyEvents: ApplyEvent[] | undefined;
  let duplicateSets = 0;

  if (options.mode === 'dry-run') {
    const dryRunResults = await runDryRun(options, rootAbs, reportRunDirectoryAbs);
    inventoryEntries = dryRunResults.inventoryEntries;
    movePlan = dryRunResults.movePlan;
    artifactPlan = dryRunResults.artifactPlan;
    dedupePlan = dryRunResults.dedupePlan;
    rollbackManifest = dryRunResults.rollbackManifest;
    duplicateSets = dryRunResults.duplicateSets;

    const summary = buildSummaryReport(
      options.mode,
      rootAbs,
      startedAt,
      inventoryEntries,
      movePlan,
      artifactPlan,
      dedupePlan,
      duplicateSets,
      notes,
    );

    writeJson(path.join(reportRunDirectoryAbs, 'summary.json'), summary);

    console.log(`Dry-run complete. Report directory: ${reportRunDirectoryAbs}`);
    console.log(`Files scanned: ${summary.inventory.files}`);
    console.log(`Planned dedupe actions: ${summary.operations.dedupeActions}`);
    return;
  }

  const applyResults = await runApply(options, rootAbs, reportRunDirectoryAbs);
  inventoryEntries = applyResults.inventoryEntries;
  movePlan = applyResults.movePlan;
  artifactPlan = applyResults.artifactPlan;
  dedupePlan = applyResults.dedupePlan;
  rollbackManifest = applyResults.rollbackManifest;
  applyEvents = applyResults.applyEvents;
  duplicateSets = applyResults.duplicateSets;

  const summary = buildSummaryReport(
    options.mode,
    rootAbs,
    startedAt,
    inventoryEntries,
    movePlan,
    artifactPlan,
    dedupePlan,
    duplicateSets,
    notes,
    applyEvents,
  );

  writeJson(path.join(reportRunDirectoryAbs, 'summary.json'), summary);

  console.log(`Apply complete. Report directory: ${reportRunDirectoryAbs}`);
  console.log(`Files scanned: ${summary.inventory.files}`);
  console.log(`Dedupe actions evaluated: ${summary.operations.dedupeActions}`);
}

const currentScriptPath = fileURLToPath(import.meta.url);
const invokedScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedScriptPath && currentScriptPath === invokedScriptPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
