/**
 * Config Manager - Centralized configuration management for skills toolkit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigManager {
  constructor() {
    this.configPaths = {
      global: path.join(homedir(), '.opencli', 'skills', 'config.json'),
      local: path.join(process.cwd(), '.skills-config.json'),
      project: path.join(__dirname, '..', 'config.json')
    };

    this.defaultConfig = {
      useDatabase: false,
      databaseUrl: null,
      registries: {
        npx: {
          enabled: true,
          priority: 1,
          timeout: 30000
        },
        skillport: {
          enabled: true,
          priority: 2,
          timeout: 30000
        },
        github: {
          enabled: true,
          priority: 3,
          timeout: 15000,
          token: null
        },
        local: {
          enabled: true,
          priority: 0,
          paths: [
            path.join(homedir(), '.opencli', 'skills', 'local'),
            path.join(process.cwd(), '.claude', 'skills')
          ]
        }
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
        directory: path.join(homedir(), '.opencli', 'skills', 'cache')
      },
      profiles: {
        directory: path.join(homedir(), '.opencli', 'skills', 'profiles'),
        autoSync: true,
        remoteUrl: 'https://raw.githubusercontent.com/Awannaphasch2016/skills-toolkit/master/profiles'
      },
      validation: {
        strict: false,
        skipUnreachable: true,
        warnOnFailure: true
      },
      logging: {
        level: 'info',
        file: null,
        console: true
      }
    };

    this._config = null;
    this._configPath = null;
  }

  /**
   * Load configuration with precedence: local > project > global > defaults
   */
  loadConfig() {
    if (this._config) return this._config;

    // Try loading in order of precedence
    const configSources = [
      { path: this.configPaths.local, name: 'local' },
      { path: this.configPaths.project, name: 'project' },
      { path: this.configPaths.global, name: 'global' }
    ];

    let loadedConfig = { ...this.defaultConfig };
    let configSource = 'defaults';

    for (const source of configSources) {
      if (fs.existsSync(source.path)) {
        try {
          const fileConfig = JSON.parse(fs.readFileSync(source.path, 'utf8'));
          loadedConfig = this.mergeConfigs(loadedConfig, fileConfig);
          this._configPath = source.path;
          configSource = source.name;
          break;
        } catch (error) {
          console.warn(`Failed to load config from ${source.path}:`, error.message);
        }
      }
    }

    // Override with environment variables
    this.applyEnvironmentOverrides(loadedConfig);

    this._config = loadedConfig;
    this.validateConfig(this._config);

    console.debug(`Loaded configuration from: ${configSource}`);
    return this._config;
  }

  /**
   * Get configuration value with dot notation support
   */
  get(key, defaultValue = null) {
    const config = this.loadConfig();

    if (!key) return config;

    const keys = key.split('.');
    let value = config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set configuration value with dot notation support
   */
  set(key, value) {
    const config = this.loadConfig();

    if (!key) {
      throw new Error('Configuration key is required');
    }

    const keys = key.split('.');
    let current = config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }

    current[keys[keys.length - 1]] = value;
    this._config = config;

    return this;
  }

  /**
   * Save current configuration to file
   */
  save(configPath = null) {
    if (!this._config) {
      throw new Error('No configuration loaded to save');
    }

    const targetPath = configPath || this._configPath || this.configPaths.project;

    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, JSON.stringify(this._config, null, 2));
    this._configPath = targetPath;

    return this;
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this._config = { ...this.defaultConfig };
    return this;
  }

  /**
   * Initialize configuration file with defaults
   */
  init(configPath = null, options = {}) {
    const targetPath = configPath || this.configPaths.project;
    const { force = false, template = 'default' } = options;

    if (!force && fs.existsSync(targetPath)) {
      throw new Error(`Configuration file already exists: ${targetPath}`);
    }

    const config = this.getTemplate(template);

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));

    console.log(`Initialized configuration: ${targetPath}`);
    return this;
  }

  /**
   * Get configuration template
   */
  getTemplate(templateName) {
    const templates = {
      default: this.defaultConfig,

      minimal: {
        useDatabase: false,
        registries: {
          npx: { enabled: true },
          local: { enabled: true }
        }
      },

      development: {
        ...this.defaultConfig,
        logging: { level: 'debug', console: true },
        validation: { strict: false, warnOnFailure: true },
        cache: { enabled: false }
      },

      production: {
        ...this.defaultConfig,
        logging: { level: 'warn', console: false },
        validation: { strict: true, skipUnreachable: false },
        cache: { enabled: true, ttl: 3600000 } // 1 hour
      },

      database: {
        ...this.defaultConfig,
        useDatabase: true,
        databaseUrl: process.env.DATABASE_URL || null
      }
    };

    if (!(templateName in templates)) {
      throw new Error(`Unknown template: ${templateName}. Available: ${Object.keys(templates).join(', ')}`);
    }

    return JSON.parse(JSON.stringify(templates[templateName])); // Deep clone
  }

  /**
   * Merge two configuration objects deeply
   */
  mergeConfigs(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfigs(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Apply environment variable overrides
   */
  applyEnvironmentOverrides(config) {
    // Map environment variables to config keys
    const envMappings = {
      'OPENCLI_SKILLS_USE_DATABASE': 'useDatabase',
      'OPENCLI_SKILLS_DATABASE_URL': 'databaseUrl',
      'SKILLS_GITHUB_TOKEN': 'registries.github.token',
      'SKILLS_CACHE_TTL': 'cache.ttl',
      'SKILLS_LOG_LEVEL': 'logging.level'
    };

    for (const [envVar, configKey] of Object.entries(envMappings)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.setNestedValue(config, configKey, this.parseEnvValue(envValue));
      }
    }

    // Special handling for database URL
    if (process.env.DATABASE_URL) {
      config.databaseUrl = process.env.DATABASE_URL;
      config.useDatabase = true;
    }
  }

  /**
   * Parse environment variable value to appropriate type
   */
  parseEnvValue(value) {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Numeric values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);

    // String value
    return value;
  }

  /**
   * Set nested configuration value
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Validate configuration structure and values
   */
  validateConfig(config) {
    const errors = [];

    // Required fields
    if (typeof config.useDatabase !== 'boolean') {
      errors.push('useDatabase must be a boolean');
    }

    if (config.useDatabase && !config.databaseUrl) {
      errors.push('databaseUrl is required when useDatabase is true');
    }

    // Validate registries
    if (!config.registries || typeof config.registries !== 'object') {
      errors.push('registries must be an object');
    } else {
      for (const [name, registry] of Object.entries(config.registries)) {
        if (typeof registry.enabled !== 'boolean') {
          errors.push(`registries.${name}.enabled must be a boolean`);
        }
      }
    }

    // Validate cache settings
    if (config.cache) {
      if (typeof config.cache.enabled !== 'boolean') {
        errors.push('cache.enabled must be a boolean');
      }
      if (typeof config.cache.ttl !== 'number' || config.cache.ttl < 0) {
        errors.push('cache.ttl must be a positive number');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }

  /**
   * Export configuration for debugging
   */
  export() {
    const config = this.loadConfig();

    // Remove sensitive data
    const exported = JSON.parse(JSON.stringify(config));
    if (exported.registries?.github?.token) {
      exported.registries.github.token = '[REDACTED]';
    }
    if (exported.databaseUrl) {
      exported.databaseUrl = '[REDACTED]';
    }

    return exported;
  }

  /**
   * Get configuration summary for display
   */
  getSummary() {
    const config = this.loadConfig();

    const enabledRegistries = Object.entries(config.registries || {})
      .filter(([_, registry]) => registry.enabled)
      .map(([name]) => name);

    return {
      source: this._configPath || 'defaults',
      database: config.useDatabase ? 'enabled' : 'disabled',
      registries: enabledRegistries,
      cache: config.cache?.enabled ? 'enabled' : 'disabled',
      logging: config.logging?.level || 'info'
    };
  }
}

export default ConfigManager;