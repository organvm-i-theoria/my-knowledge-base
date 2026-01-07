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

  async exportAll(options: ExportOptions = {}): Promise<KnowledgeItem[]> {
    const configPath = join(process.cwd(), 'config', 'sources.yaml');
    
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

    return entries.map(entry => {
      // Use crypto hash of path for stable ID
      const fileId = createHash('md5').update(entry.path).digest('hex');
      const ext = extname(entry.path).toLowerCase();
      
      let format: 'markdown' | 'txt' | 'pdf' | 'html' = 'txt';
      if (['.md', '.markdown'].includes(ext)) format = 'markdown';
      if (ext === '.pdf') format = 'pdf';
      if (ext === '.html') format = 'html';

      // For now, we skip reading binary contents (PDFs) until we have a parser
      // But we still index the metadata
      let content = '';
      if (format === 'markdown' || format === 'txt' || format === 'html') {
        try {
          content = readFileSync(entry.path, 'utf-8');
        } catch (e) {
          console.error(`   ❌ Error reading ${entry.path}:`, e);
        }
      } else {
        content = `[Binary File] ${basename(entry.path)}`;
      }

      return {
        id: fileId,
        title: basename(entry.path, ext),
        content,
        created: entry.stats?.birthtime || new Date(),
        modified: entry.stats?.mtime || new Date(),
        url: `file://${entry.path}`,
        format,
        metadata: {
          sourceId: source.id,
          sourceName: source.name,
          path: entry.path,
          size: entry.stats?.size
        }
      };
    });
  }
}