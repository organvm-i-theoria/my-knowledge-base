/**
 * Local File System Knowledge Source (Federated)
 * Indexes files "in-place" based on config/sources.yaml
 */

import { KnowledgeItem, ExportOptions, KnowledgeDocument } from '../types.js';
import { KnowledgeSource } from './interface.js';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { createHash } from 'crypto';
import yaml from 'js-yaml';
import glob from 'fast-glob';
import { homedir } from 'os';
import { createRequire } from 'module';
import chokidar from 'chokidar';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

interface SourceConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  patterns: string[];
  ignore?: string[];
}

interface ConfigFile {
  sources: SourceConfig[];
  settings: any;
}

export class LocalFileSource implements KnowledgeSource {
  id = 'local';
  name = 'Local File System';
  type: 'file' = 'file';
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const configPath = join(this.baseDir, 'config', 'sources.yaml');
    
    if (!existsSync(configPath)) {
      console.warn(`⚠️  No config found at ${configPath}. Skipping local ingest.`);
      return [];
    }

    const config = yaml.load(readFileSync(configPath, 'utf-8')) as ConfigFile;
    const allDocs: KnowledgeDocument[] = [];

    for (const source of config.sources) {
      if (!source.enabled) continue;

      console.log(`🔎 Scanning source: ${source.name} (${source.path})...`);
      
      const docs = await this.processSource(source);
      console.log(`   ✅ Found ${docs.length} files.`);
      allDocs.push(...docs);
    }

    return allDocs;
  }

  async watch(callback: (item: KnowledgeItem) => Promise<void>): Promise<void> {
    const configPath = join(this.baseDir, 'config', 'sources.yaml');
    if (!existsSync(configPath)) return;

    const config = yaml.load(readFileSync(configPath, 'utf-8')) as ConfigFile;

    for (const source of config.sources) {
      if (!source.enabled) continue;
      
      const basePath = source.path.replace('~', homedir());
      if (!existsSync(basePath)) continue;

      console.log(`👀 Watching source: ${source.name} (${basePath})...`);

      // Watcher for this source
      // We combine patterns with basePath
      const watchPaths = source.patterns.map(p => join(basePath, p));
      
      const watcher = chokidar.watch(watchPaths, {
        ignored: source.ignore,
        persistent: true,
        ignoreInitial: true // Don't re-emit existing files on startup
      });

      watcher.on('add', async (path) => {
        console.log(`📄 File added: ${path}`);
        const doc = await this.processFile(path, source);
        if (doc) await callback(doc);
      });

      watcher.on('change', async (path) => {
        console.log(`📝 File changed: ${path}`);
        const doc = await this.processFile(path, source);
        if (doc) await callback(doc);
      });
      
      // We could handle 'unlink' too if we want to delete items
    }
  }

  private async processSource(source: SourceConfig): Promise<KnowledgeDocument[]> {
    const basePath = source.path.replace('~', homedir());
    
    if (!existsSync(basePath)) {
      console.warn(`   ⚠️  Path not found: ${basePath}`);
      return [];
    }

    // Convert config patterns to absolute glob patterns
    // e.g., "**/*.md" -> "/Users/me/Dropbox/**/*.md"
    const entries = await glob(source.patterns, {
      cwd: basePath,
      absolute: true,
      ignore: source.ignore,
      stats: true
    });

    const docs = await Promise.all(entries.map(async entry => {
      return this.processFile(entry.path, source);
    }));

    return docs.filter((d): d is KnowledgeDocument => d !== null);
  }

  private async processFile(filePath: string, source: SourceConfig): Promise<KnowledgeDocument | null> {
    try {
      // Use crypto hash of path for stable ID
      const fileId = createHash('md5').update(filePath).digest('hex');
      const ext = extname(filePath).toLowerCase();
      
      let format: 'markdown' | 'txt' | 'pdf' | 'html' = 'txt';
      if (['.md', '.markdown'].includes(ext)) format = 'markdown';
      if (ext === '.pdf') format = 'pdf';
      if (ext === '.html') format = 'html';

      // Read content based on format
      let content = '';
      let stats;
      let pdfMeta: Record<string, unknown> = {};
      try {
        stats = statSync(filePath);
      } catch (e) {
        // File might have been deleted quickly or access denied
        return null;
      }

      if (format === 'markdown' || format === 'txt' || format === 'html') {
        try {
          content = readFileSync(filePath, 'utf-8');
        } catch (e) {
          console.error(`   ❌ Error reading ${filePath}:`, e);
          return null;
        }
      } else if (format === 'pdf') {
        try {
          const buffer = readFileSync(filePath);
          const data = await pdf(buffer);
          content = data.text;
          pdfMeta = {
            numpages: data.numpages,
            numrender: data.numrender,
            info: data.info,
            metadata: data.metadata,
            version: data.version,
          };
        } catch (e) {
          console.error(`   ❌ Error parsing PDF ${filePath}:`, e);
          content = `[PDF Error] Could not parse: ${basename(filePath)}`;
        }
      } else {
        content = `[Binary File] ${basename(filePath)}`;
      }

      return {
        id: fileId,
        title: basename(filePath, ext),
        content,
        created: stats.birthtime || new Date(),
        modified: stats.mtime || new Date(),
        url: `file://${filePath}`,
        format,
        metadata: {
          sourceId: source.id,
          sourceName: source.name,
          path: filePath,
          size: stats.size,
          ...pdfMeta,
        }
      };
    } catch (e) {
      console.error(`Error processing file ${filePath}:`, e);
      return null;
    }
  }
}
