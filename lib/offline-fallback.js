/**
 * Offline Fallback Manager
 * Handles graceful degradation when database is unavailable
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

export class OfflineFallback {
  constructor() {
    this.cacheDir = path.join(homedir(), '.opencli', 'skills', 'cache');
    this.localRegistryPath = path.join(homedir(), '.opencli', 'skills', 'registry.json');

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Execute operation with fallback to local cache/registry
   */
  async withFallback(operation, fallbackOperation, operationName = 'operation') {
    try {
      // Try the primary operation first
      const result = await operation();

      // If successful, cache the result for future offline use
      await this.cacheResult(operationName, result);

      return {
        success: true,
        data: result,
        source: 'database'
      };
    } catch (error) {
      console.warn(`${operationName} failed, trying fallback:`, error.message);

      try {
        // Try fallback operation
        const fallbackResult = await fallbackOperation();

        return {
          success: true,
          data: fallbackResult,
          source: 'fallback',
          warning: `Using cached/local data due to database error: ${error.message}`
        };
      } catch (fallbackError) {
        console.error(`Both ${operationName} and fallback failed:`, fallbackError.message);

        // Try to get cached data as last resort
        const cachedResult = await this.getCachedResult(operationName);
        if (cachedResult) {
          return {
            success: true,
            data: cachedResult,
            source: 'cache',
            warning: `Using stale cached data. Database and local fallback unavailable.`
          };
        }

        throw new Error(`All fallback mechanisms failed for ${operationName}`);
      }
    }
  }

  /**
   * Cache operation result for offline use
   */
  async cacheResult(operationName, result) {
    try {
      const cacheFile = path.join(this.cacheDir, `${operationName}.json`);
      const cacheData = {
        timestamp: new Date().toISOString(),
        data: result
      };

      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn(`Failed to cache ${operationName} result:`, error.message);
    }
  }

  /**
   * Get cached result
   */
  async getCachedResult(operationName) {
    try {
      const cacheFile = path.join(this.cacheDir, `${operationName}.json`);

      if (!fs.existsSync(cacheFile)) {
        return null;
      }

      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

      // Check if cache is too old (older than 24 hours)
      const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      if (cacheAge > maxAge) {
        console.warn(`Cached ${operationName} data is stale (${Math.round(cacheAge / (1000 * 60 * 60))} hours old)`);
      }

      return cacheData.data;
    } catch (error) {
      console.warn(`Failed to read cached ${operationName} data:`, error.message);
      return null;
    }
  }

  /**
   * Check if local registry is available as fallback
   */
  hasLocalRegistryFallback() {
    return fs.existsSync(this.localRegistryPath);
  }

  /**
   * Load local registry for fallback operations
   */
  loadLocalRegistry() {
    if (!this.hasLocalRegistryFallback()) {
      throw new Error('Local registry not available');
    }

    try {
      const content = fs.readFileSync(this.localRegistryPath, 'utf8');
      const registry = JSON.parse(content);

      if (!registry.skills || !Array.isArray(registry.skills)) {
        throw new Error('Invalid local registry structure');
      }

      return registry;
    } catch (error) {
      throw new Error(`Failed to load local registry: ${error.message}`);
    }
  }

  /**
   * Create read-only fallback operations for skills
   */
  createSkillFallbacks() {
    return {
      /**
       * List skills from local registry
       */
      listSkills: async (options = {}) => {
        const registry = this.loadLocalRegistry();
        let skills = registry.skills;

        // Apply filters (same logic as database version)
        if (options.type) {
          skills = skills.filter(skill => skill.type === options.type);
        }

        if (options.installed !== null) {
          skills = skills.filter(skill => skill.installed === options.installed);
        }

        if (options.search) {
          const searchLower = options.search.toLowerCase();
          skills = skills.filter(skill =>
            skill.name.toLowerCase().includes(searchLower) ||
            (skill.description && skill.description.toLowerCase().includes(searchLower))
          );
        }

        // Sort by name
        skills.sort((a, b) => a.name.localeCompare(b.name));

        return skills;
      },

      /**
       * Get specific skill from local registry
       */
      getSkill: async (skillName) => {
        const registry = this.loadLocalRegistry();
        const skill = registry.skills.find(skill => skill.name === skillName);

        if (!skill) {
          throw new Error(`Skill '${skillName}' not found`);
        }

        return skill;
      },

      /**
       * Get stats from local registry
       */
      getStats: async () => {
        const registry = this.loadLocalRegistry();
        const skills = registry.skills || [];

        const stats = {
          total: skills.length,
          installed: skills.filter(s => s.installed).length,
          byType: {}
        };

        // Count by type
        for (const skill of skills) {
          stats.byType[skill.type] = (stats.byType[skill.type] || 0) + 1;
        }

        return stats;
      },

      /**
       * Search skills in local registry
       */
      searchSkills: async (query, options = {}) => {
        const registry = this.loadLocalRegistry();
        let skills = registry.skills || [];

        // Simple text search
        const searchLower = query.toLowerCase();
        skills = skills.filter(skill =>
          skill.name.toLowerCase().includes(searchLower) ||
          (skill.description && skill.description.toLowerCase().includes(searchLower))
        );

        // Apply type filter
        if (options.type) {
          skills = skills.filter(skill => skill.type === options.type);
        }

        // Apply limit
        if (options.limit) {
          skills = skills.slice(0, options.limit);
        }

        return skills;
      }
    };
  }

  /**
   * Get offline mode status
   */
  getOfflineStatus() {
    return {
      hasLocalRegistry: this.hasLocalRegistryFallback(),
      cacheDirectory: this.cacheDir,
      cachedOperations: this.getCachedOperations()
    };
  }

  /**
   * List available cached operations
   */
  getCachedOperations() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const operationName = file.replace('.json', '');
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);

          try {
            const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return {
              operation: operationName,
              cached_at: cacheData.timestamp,
              age_hours: Math.round((Date.now() - new Date(cacheData.timestamp).getTime()) / (1000 * 60 * 60)),
              file_size: stats.size
            };
          } catch (error) {
            return {
              operation: operationName,
              error: 'Failed to read cache data'
            };
          }
        });
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let cleared = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        fs.unlinkSync(filePath);
        cleared++;
      }

      return { cleared, message: `Cleared ${cleared} cache files` };
    } catch (error) {
      throw new Error(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Check if operation is supported in offline mode
   */
  isOperationSupportedOffline(operationName) {
    const readOnlyOperations = ['listSkills', 'getSkill', 'getStats', 'searchSkills'];
    return readOnlyOperations.includes(operationName);
  }

  /**
   * Create error for unsupported offline operations
   */
  createOfflineError(operationName) {
    return new Error(
      `Operation '${operationName}' requires database connection. ` +
      `Only read operations are available offline.`
    );
  }
}

export default OfflineFallback;