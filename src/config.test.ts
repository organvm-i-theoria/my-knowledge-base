import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager, DEFAULT_CONFIG } from './config';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('ConfigManager', () => {
  let configPath: string;
  let configDir: string;

  beforeEach(() => {
    configDir = join(process.cwd(), '.test-tmp', 'config');
    configPath = join(configDir, 'test-config.json');
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    try {
      unlinkSync(configPath);
    } catch (e) {
      // File might not exist
    }
  });

  describe('Initialization', () => {
    it('should create config manager with default path', () => {
      const manager = new ConfigManager();
      expect(manager).toBeDefined();
    });

    it('should create config manager with custom path', () => {
      const manager = new ConfigManager(configPath);
      expect(manager).toBeDefined();
    });

    it('should load default config if file does not exist', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();
      expect(config).toBeDefined();
      expect(config.export).toBeDefined();
    });
  });

  describe('JSON Configuration', () => {
    it('should load JSON configuration', () => {
      const testConfig = {
        export: { headless: false, maxRetries: 5 },
        embedding: { model: 'text-embedding-3-small' },
        claude: { model: 'claude-3-5-sonnet-20241022' },
      };
      writeFileSync(configPath, JSON.stringify(testConfig));

      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      expect(config.export.headless).toBe(false);
      expect(config.export.maxRetries).toBe(5);
    });

    it('should save JSON configuration', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();
      config.export.headless = false;

      manager.saveConfig(config);

      const manager2 = new ConfigManager(configPath);
      const loaded = manager2.getConfig();
      expect(loaded.export.headless).toBe(false);
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        export: { headless: true },
      };
      writeFileSync(configPath, JSON.stringify(customConfig));

      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      // Should have custom value
      expect(config.export.headless).toBe(true);
      // Should have default values for missing properties
      expect(config.embedding).toBeDefined();
      expect(config.claude).toBeDefined();
    });
  });

  describe('YAML Configuration', () => {
    it('should load YAML configuration', () => {
      const yamlPath = join(configDir, 'test-config.yaml');
      const yamlContent = `
export:
  headless: true
  navigationTimeoutMs: 60000
embedding:
  model: text-embedding-3-large
`;
      writeFileSync(yamlPath, yamlContent);

      const manager = new ConfigManager(yamlPath);
      const config = manager.getConfig();

      expect(config.export.headless).toBe(true);
      expect(config.export.navigationTimeoutMs).toBe(60000);
      expect(config.embedding.model).toBe('text-embedding-3-large');

      unlinkSync(yamlPath);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration structure', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      // Check required fields exist
      expect(config.export).toBeDefined();
      expect(config.embedding).toBeDefined();
      expect(config.claude).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.api).toBeDefined();
    });

    it('should validate export config', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      expect(config.export.headless).toBeTypeOf('boolean');
      expect(config.export.maxRetries).toBeTypeOf('number');
      expect(config.export.navigationTimeoutMs).toBeTypeOf('number');
    });

    it('should validate embedding config', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      expect(config.embedding.model).toBeTypeOf('string');
      expect(config.embedding.batchSize).toBeTypeOf('number');
    });

    it('should validate claude config', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      expect(config.claude.model).toBeTypeOf('string');
      expect(config.claude.maxTokens).toBeTypeOf('number');
    });

    it('should validate database config', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      expect(config.database.path).toBeTypeOf('string');
    });

    it('should validate API config', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      expect(config.api).toBeDefined();
      if (config.api.openai) {
        expect(config.api.openai.model).toBeTypeOf('string');
      }
    });
  });

  describe('Configuration Updates', () => {
    it('should update partial configuration', () => {
      const manager = new ConfigManager(configPath);
      const originalConfig = manager.getConfig();

      const updated = {
        ...originalConfig,
        export: {
          ...originalConfig.export,
          headless: false,
        },
      };

      manager.saveConfig(updated);
      const loaded = manager.getConfig();

      expect(loaded.export.headless).toBe(false);
    });

    it('should update nested configuration', () => {
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      config.embedding.batchSize = 50;
      manager.saveConfig(config);

      const loaded = manager.getConfig();
      expect(loaded.embedding.batchSize).toBe(50);
    });
  });

  describe('Default Configuration', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CONFIG.export.headless).toBe(true);
      expect(DEFAULT_CONFIG.embedding.model).toBe('text-embedding-3-small');
      expect(DEFAULT_CONFIG.claude.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should have timeout values', () => {
      expect(DEFAULT_CONFIG.export.navigationTimeoutMs).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.export.loginTimeoutMs).toBeGreaterThan(0);
    });

    it('should have retry configuration', () => {
      expect(DEFAULT_CONFIG.export.maxRetries).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.export.retryDelayMs).toBeGreaterThan(0);
    });

    it('should have batch sizes', () => {
      expect(DEFAULT_CONFIG.embedding.batchSize).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.claude.maxTokens).toBeGreaterThan(0);
    });
  });

  describe('Configuration File Operations', () => {
    it('should create directory if it does not exist', () => {
      const nestedPath = join(configDir, 'nested', 'config.json');
      const manager = new ConfigManager(nestedPath);
      const config = manager.getConfig();
      manager.saveConfig(config);

      const manager2 = new ConfigManager(nestedPath);
      const loaded = manager2.getConfig();
      expect(loaded).toBeDefined();
    });

    it('should handle invalid JSON gracefully', () => {
      writeFileSync(configPath, '{ invalid json ]');
      const manager = new ConfigManager(configPath);
      const config = manager.getConfig();

      // Should return defaults when JSON is invalid
      expect(config).toBeDefined();
      expect(config.export).toBeDefined();
    });
  });
});
