import { createHash } from 'crypto';
import { stat, readFile } from 'fs/promises';
import { basename, extname, resolve } from 'path';
import fg from 'fast-glob';
import pLimit from 'p-limit';
import { AppError } from '../logger.js';
import { FederatedSourceRecord, LocalFilesystemDocument } from './types.js';

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.csv': 'text/csv',
  '.ts': 'text/plain',
  '.tsx': 'text/plain',
  '.js': 'text/plain',
  '.jsx': 'text/plain',
  '.mjs': 'text/plain',
  '.cjs': 'text/plain',
  '.py': 'text/plain',
  '.java': 'text/plain',
  '.go': 'text/plain',
  '.rs': 'text/plain',
  '.css': 'text/css',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.sql': 'text/plain',
};

function isTextMime(ext: string): boolean {
  return Boolean(TEXT_MIME_BY_EXTENSION[ext.toLowerCase()]);
}

function toTitle(filePath: string): string {
  const ext = extname(filePath);
  return basename(filePath, ext).replace(/[-_]+/g, ' ').trim() || basename(filePath);
}

function hasBinaryMarker(value: string): boolean {
  return value.includes('\u0000');
}

export class LocalFilesystemProvider {
  async scan(source: FederatedSourceRecord): Promise<LocalFilesystemDocument[]> {
    const rootPath = resolve(source.rootPath);
    const includePatterns = source.includePatterns.length > 0 ? source.includePatterns : ['**/*'];
    const excludePatterns = source.excludePatterns;

    const sourceMaxSizeBytes = Number(source.metadata.maxFileSizeBytes ?? 1_000_000);
    const sourceMaxFiles = Number(source.metadata.maxFiles ?? 2_500);
    const maxFileSizeBytes = Number.isFinite(sourceMaxSizeBytes) && sourceMaxSizeBytes > 0 ? sourceMaxSizeBytes : 1_000_000;
    const maxFiles = Number.isFinite(sourceMaxFiles) && sourceMaxFiles > 0 ? sourceMaxFiles : 2_500;

    try {
      const rootStat = await stat(rootPath);
      if (!rootStat.isDirectory()) {
        throw new AppError(`Source path is not a directory: ${rootPath}`, 'INVALID_SOURCE_PATH', 400);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`Source path not accessible: ${rootPath}`, 'INVALID_SOURCE_PATH', 400);
    }

    const relativePaths = await fg(includePatterns, {
      cwd: rootPath,
      onlyFiles: true,
      ignore: excludePatterns,
      dot: false,
      followSymbolicLinks: false,
      unique: true,
      absolute: false,
    });

    const limitedPaths = relativePaths.slice(0, maxFiles);
    const readLimit = pLimit(12);
    const scanned = await Promise.all(
      limitedPaths.map((relativePath) => readLimit(() => this.readFileDocument(rootPath, relativePath, maxFileSizeBytes)))
    );

    return scanned.filter((entry): entry is LocalFilesystemDocument => entry !== null);
  }

  private async readFileDocument(
    rootPath: string,
    relativePath: string,
    maxFileSizeBytes: number
  ): Promise<LocalFilesystemDocument | null> {
    const extension = extname(relativePath).toLowerCase();
    if (!isTextMime(extension)) {
      return null;
    }

    const absolutePath = resolve(rootPath, relativePath);
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      return null;
    }

    if (!fileStat.isFile()) {
      return null;
    }
    if (fileStat.size > maxFileSizeBytes) {
      return null;
    }

    let content: string;
    try {
      content = await readFile(absolutePath, 'utf8');
    } catch {
      return null;
    }

    if (content.trim().length === 0 || hasBinaryMarker(content)) {
      return null;
    }

    const hash = createHash('sha256').update(content).digest('hex');
    const normalizedRelative = relativePath.replace(/\\/g, '/');
    const mimeType = TEXT_MIME_BY_EXTENSION[extension] ?? 'text/plain';

    return {
      externalId: normalizedRelative,
      path: normalizedRelative,
      title: toTitle(normalizedRelative),
      content,
      hash,
      sizeBytes: fileStat.size,
      mimeType,
      modifiedAt: fileStat.mtime.toISOString(),
      metadata: {
        absolutePath,
      },
    };
  }
}
