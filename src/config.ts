/**
 * Configuration system with YAML and JSON support
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import YAML from 'js-yaml';
import { logger } from './logger.js';

export interface ExportConfig {
  headless?: boolean;
  exportPath?: string;
  incremental?: boolean;
  withEmbeddings?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  navigationTimeoutMs?: number;
  loginTimeoutMs?: number;
  timeoutMs?: number;
}

export interface EmbeddingConfig {
  model?: string;
  provider?: 'openai' | 'local';
  batchSize?: number;
  cachePath?: string;
  useCache?: boolean;
}

export interface ClaudeConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  useCache?: boolean;
  cacheSavingsTarget?: number; // percent, 0-100
}

export interface DatabaseConfig {
  path?: string;
  type?: 'sqlite' | 'postgres';
  connectionPool?: number;
}

export interface ApiConfig {
  port?: number;
  host?: string;
  rateLimit?: {
    windowMs?: number;
    maxRequests?: number;
  };
}

export interface AppConfig {
  export?: ExportConfig;
  embedding?: EmbeddingConfig;
  embeddings?: EmbeddingConfig;
  claude?: ClaudeConfig;
  database?: DatabaseConfig;
  api?: ApiConfig;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  costTrackingEnabled?: boolean;
  [key: string]: any;
}

export const DEFAULT_CONFIG: AppConfig = {
  export: {
    headless: true,
    exportPath: './raw/claude-app',
    incremental: false,
    withEmbeddings: false,
    maxRetries: 3,
    retryDelayMs: 1000,
    navigationTimeoutMs: 60000,
    loginTimeoutMs: 30000,
    timeoutMs: 30000
  },
  embedding: {
    model: 'text-embedding-3-small',
    provider: 'openai',
    batchSize: 100,
    cachePath: './cache/embeddings',
    useCache: true
  },
  claude: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 2000,
    useCache: true,
    cacheSavingsTarget: 80
  },
  database: {
    path: './db/knowledge.db',
    type: 'sqlite',
    connectionPool: 5
  },
  api: {
    port: 3000,
    host: 'localhost',
    rateLimit: {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    }
  },
  logLevel: 'info',
  costTrackingEnabled: true
};

function cloneConfig(config: AppConfig): AppConfig {
  if (typeof structuredClone === 'function') {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

/**
 * Configuration manager
 */
export class ConfigManager {
  private config: AppConfig;
  private configPath: string;
  private isDirty = false;

  constructor(configPath: string = './config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): AppConfig {
    if (!existsSync(this.configPath)) {
      logger.info(
        `Config file not found: ${this.configPath}, using defaults`,
        { path: this.configPath },
        'ConfigManager'
      );
      return cloneConfig(DEFAULT_CONFIG);
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      let config: any;

      if (this.configPath.endsWith('.json')) {
        config = JSON.parse(content);
      } else if (this.configPath.endsWith('.yaml') || this.configPath.endsWith('.yml')) {
        config = YAML.load(content);
      } else {
        throw new Error(`Unsupported config format: ${this.configPath}`);
      }

      if (config && typeof config === 'object') {
        const typed = config as Record<string, unknown>;
        if (!typed.embedding && typed.embeddings) {
          typed.embedding = typed.embeddings;
          delete typed.embeddings;
        }
        config = typed;
      }

      logger.info(
        `Loaded configuration from ${this.configPath}`,
        undefined,
        'ConfigManager'
      );

      // Merge with defaults
      return this.mergeConfigs(cloneConfig(DEFAULT_CONFIG), config);
    } catch (error) {
      logger.warn(
        `Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'ConfigManager'
      );
      return cloneConfig(DEFAULT_CONFIG);
    }
  }

  /**
   * Merge user config with defaults (user config takes precedence)
   */
  private mergeConfigs(defaults: AppConfig, user: Partial<AppConfig>): AppConfig {
    const merged: AppConfig = { ...defaults };

    for (const [key, value] of Object.entries(user)) {
      if (value === null || value === undefined) continue;

      if (typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = {
          ...((merged[key] as object) || {}),
          ...(value as object)
        };
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Get complete configuration
   */
  getAll(): AppConfig {
    return cloneConfig(this.config);
  }

  /**
   * Get complete configuration (legacy helper)
   */
  getConfig(): AppConfig {
    return this.getAll();
  }

  /**
   * Get nested configuration value
   */
  get<T = any>(path: string, defaultValue?: T): T {
    const parts = path.split('.');
    let value: any = this.config;

    for (const part of parts) {
      if (value === null || value === undefined) return defaultValue as T;
      value = value[part];
    }

    return value ?? (defaultValue as T);
  }

  /**
   * Set configuration value
   */
  set<T>(path: string, value: T): void {
    const parts = path.split('.');
    const lastKey = parts.pop();

    if (!lastKey) return;

    let obj = this.config;
    for (const part of parts) {
      if (!(part in obj)) {
        obj[part] = {};
      }
      obj = obj[part];
    }

    obj[lastKey] = value;
    this.isDirty = true;

    logger.debug(`Config updated: ${path}`, { value }, 'ConfigManager');
  }

  /**
   * Save configuration (legacy helper)
   */
  saveConfig(config: AppConfig): void {
    this.config = cloneConfig(config);
    this.isDirty = true;
    this.save();
  }

  /**
   * Save configuration to file
   */
  save(): void {
    if (!this.isDirty) return;

    try {
      mkdirSync(dirname(this.configPath), { recursive: true });
      let content: string;

      if (this.configPath.endsWith('.json')) {
        content = JSON.stringify(this.config, null, 2);
      } else {
        content = YAML.dump(this.config, { indent: 2 });
      }

      writeFileSync(this.configPath, content);
      this.isDirty = false;

      logger.info(
        `Configuration saved to ${this.configPath}`,
        undefined,
        'ConfigManager'
      );
    } catch (error) {
      logger.error(
        `Failed to save config: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
        'ConfigManager'
      );
    }
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = cloneConfig(DEFAULT_CONFIG);
    this.isDirty = true;
    logger.info('Configuration reset to defaults', undefined, 'ConfigManager');
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate port
    if (this.config.api?.port && (this.config.api.port < 1 || this.config.api.port > 65535)) {
      errors.push('Invalid port number (must be 1-65535)');
    }

    // Validate batch sizes
    if (this.config.embedding?.batchSize && this.config.embedding.batchSize < 1) {
      errors.push('Embedding batch size must be at least 1');
    }

    // Validate model
    if (this.config.claude?.model && typeof this.config.claude.model !== 'string') {
      errors.push('Claude model must be a string');
    }

    // Validate temperature
    if (
      this.config.claude?.temperature &&
      (this.config.claude.temperature < 0 || this.config.claude.temperature > 2)
    ) {
      errors.push('Temperature must be between 0 and 2');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export configuration as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Export configuration as YAML
   */
  toYAML(): string {
    return YAML.dump(this.config);
  }

  /**
   * Get config file path
   */
  getPath(): string {
    return this.configPath;
  }
}

/**
 * Global config instance
 */
let globalConfig: ConfigManager | null = null;

/**
 * Get or create global config instance
 */
export function getConfig(path?: string): ConfigManager {
  if (!globalConfig) {
    globalConfig = new ConfigManager(path);
  }
  return globalConfig;
}

/**
 * Create example config file
 */
export function createExampleConfig(outputPath: string = './config.example.yaml'): void {
  const exampleConfig = {
    export: {
      headless: true,
      exportPath: './raw/claude-app',
      incremental: false,
      withEmbeddings: false,
      maxRetries: 3,
      retryDelayMs: 1000,
      navigationTimeoutMs: 60000,
      loginTimeoutMs: 30000,
      timeoutMs: 30000
    },
    embedding: {
      model: 'text-embedding-3-small',
      provider: 'openai',
      batchSize: 100,
      cachePath: './cache/embeddings',
      useCache: true
    },
    claude: {
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 2000,
      useCache: true,
      cacheSavingsTarget: 80
    },
    database: {
      path: './db/knowledge.db',
      type: 'sqlite',
      connectionPool: 5
    },
    api: {
      port: 3000,
      host: 'localhost',
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100
      }
    },
    logLevel: 'info',
    costTrackingEnabled: true
  };

  const content = YAML.dump(exampleConfig);
  writeFileSync(outputPath, content);
  logger.info(`Example config created at ${outputPath}`, undefined, 'ConfigManager');
}
