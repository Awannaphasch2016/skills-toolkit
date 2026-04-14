/**
 * Skill Manager - Database Operations
 * Database-specific implementations for SkillManager
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import DirectDatabaseClient from './direct-database-client.js';
import DataMigrator from './data-migrator.js';

export class SkillManagerDB {
  constructor() {
    this.db = new DirectDatabaseClient();
    this.dataMigrator = new DataMigrator(this.db);
    this.connected = this.db.connected;

    // Auto-initialize database if connected
    if (this.connected) {
      this._autoInitialize();
    }
  }

  /**
   * Auto-initialize database (run migrations, check for local data)
   */
  async _autoInitialize() {
    try {
      // Test database connection
      const health = await this.db.healthCheck();
      if (!health.connection.success) {
        throw new Error('Database connection failed');
      }

      // Initialize database schema first - just check if skills table exists
      await this._ensureSchema();

      // Check if we should auto-migrate from local registry
      const hasLocal = this.dataMigrator.hasLocalRegistry();
      const dbCheck = await this.dataMigrator.checkExistingSkillsInDatabase();

      if (hasLocal && !dbCheck.hasSkills) {
        console.log('🔄 Auto-migrating local skills to database...');
        await this.dataMigrator.interactiveMigration();
      }
    } catch (error) {
      console.warn('Database auto-initialization failed:', error.message);
    }
  }

  /**
   * Ensure database schema exists (simplified approach)
   */
  async _ensureSchema() {
    try {
      // Check if skills table exists
      await this.db.query('SELECT 1 FROM skills LIMIT 1');
      console.log('Database schema verified');
    } catch (error) {
      if (error.message.includes('relation "skills" does not exist')) {
        console.log('Skills table not found. Please run database migrations manually.');
        console.log('The database exists but the schema needs to be created.');
        console.log('Please contact support for manual schema setup.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Add a skill to the database
   */
  async addSkill(skillName, options = {}) {
    const {
      type = 'npx',
      description = '',
      force = false
    } = options;

    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Check if skill already exists
    if (!force) {
      const existing = await this.getSkill(skillName).catch(() => null);
      if (existing) {
        throw new Error(`Skill '${skillName}' already exists. Use --force to update.`);
      }
    }

    // Detect skill path for local skills
    let skillPath = null;
    if (type === 'local') {
      skillPath = this.detectLocalSkillPath(skillName);
    }

    const skillData = {
      name: skillName,
      type: type,
      description: description || this.generateDescription(skillName),
      user_id: this.db.userId,
      installed: false,
      path: skillPath,
      install_command: this.generateInstallCommand(skillName, type),
      install_args: this.generateInstallArgs(skillName, type),
      custom_install: false,
      metadata: {},
      version: options.version || null,
      source_url: options.sourceUrl || null,
      tags: options.tags || []
    };

    if (force) {
      // Update if exists, insert if not
      try {
        const existing = await this.getSkill(skillName);
        return await this.db.updateSkill(this.db.userId, skillName, skillData);
      } catch (error) {
        // Skill doesn't exist, create new one
      }
    }

    return await this.db.createSkill(skillData);
  }

  /**
   * Remove a skill from the database
   */
  async removeSkill(skillName) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Check if skill exists and delete
    await this.db.deleteSkill(this.db.userId, skillName);

    return { removed: true, skillName };
  }

  /**
   * List skills from database
   */
  async listSkills(options = {}) {
    const {
      type = null,
      installed = null,
      search = null,
      limit = null
    } = options;

    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const filters = { type, installed, search, limit };
    return await this.db.getSkills(this.db.userId, filters);
  }

  /**
   * Get a specific skill from database
   */
  async getSkill(skillName) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return await this.db.getSkill(this.db.userId, skillName);
  }

  /**
   * Update skill in database
   */
  async updateSkill(skillName, updates) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return await this.db.updateSkill(this.db.userId, skillName, updates);
  }

  /**
   * Mark skill as installed/uninstalled
   */
  async markInstalled(skillName, installed = true) {
    const skill = await this.updateSkill(skillName, { installed });

    // Log installation event
    await this.logInstallation(skill.id, installed, 'cli');

    return skill;
  }

  /**
   * Log installation event
   */
  async logInstallation(skillId, success, method = 'cli', errorMessage = null) {
    if (!this.connected) return;

    try {
      await this.db.logInstallation(skillId, success, method, errorMessage);
    } catch (error) {
      console.warn('Failed to log installation:', error.message);
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return await this.db.getSkillStats(this.db.userId);
  }

  /**
   * Get skill analytics
   */
  async getAnalytics() {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      // Recent installations
      const recentInstalls = await this.db.query(`
        SELECT si.*, s.name as skill_name
        FROM skill_installations si
        JOIN skills s ON s.id = si.skill_id
        WHERE s.user_id = $1
        ORDER BY si.installed_at DESC
        LIMIT 10
      `, [this.db.userId]);

      // Popular skills (installed)
      const popularSkills = await this.db.query(`
        SELECT name, type, description
        FROM skills
        WHERE user_id = $1 AND installed = true
        ORDER BY created_at DESC
        LIMIT 10
      `, [this.db.userId]);

      // Error rate
      const errorStats = await this.db.query(`
        SELECT
          COUNT(*) as total_installations,
          COUNT(*) FILTER (WHERE success = false) as failed_installations
        FROM skill_installations si
        JOIN skills s ON s.id = si.skill_id
        WHERE s.user_id = $1
      `, [this.db.userId]);

      const stats = errorStats[0] || { total_installations: 0, failed_installations: 0 };
      const totalInstalls = parseInt(stats.total_installations);
      const failedInstalls = parseInt(stats.failed_installations);

      return {
        recent_installations: recentInstalls.map(install => ({
          ...install,
          skills: { name: install.skill_name }
        })),
        popular_skills: popularSkills,
        error_rate: totalInstalls > 0 ? (failedInstalls / totalInstalls) * 100 : 0,
        total_installations: totalInstalls
      };
    } catch (error) {
      console.warn('Failed to get analytics:', error.message);
      return null;
    }
  }

  /**
   * Search skills with advanced features
   */
  async searchSkills(query, options = {}) {
    const {
      type = null,
      limit = 50,
      includeMetadata = false
    } = options;

    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const filters = { search: query, type, limit };
    return await this.db.getSkills(this.db.userId, filters);
  }

  // ================== HELPER METHODS ==================

  /**
   * Detect local skill path (same as original)
   */
  detectLocalSkillPath(skillName) {
    // Implementation same as original SkillManager
    const searchPaths = [
      path.join(process.cwd(), '.claude', 'skills'),
      path.join(homedir(), '.claude', 'skills'),
      path.join(process.cwd(), 'skills'),
      path.join(__dirname, '..', '..', 'social-media-monitoring', '.claude', 'skills'),
      path.join(homedir(), 'dev', 'my-own-website', '.claude', 'skills')
    ];

    for (const searchPath of searchPaths) {
      const skillPath = path.join(searchPath, skillName);
      if (fs.existsSync(skillPath)) {
        return skillPath;
      }
    }

    return null;
  }

  /**
   * Generate install command for a skill (same as original)
   */
  generateInstallCommand(skillName, type) {
    switch (type) {
      case 'npx':
        return `npx skill ${skillName}`;
      case 'skillport':
        if (skillName.includes('/')) {
          const parts = skillName.split('/');
          const repo = parts.slice(0, -1).join('/');
          const path = parts.slice(-1)[0];
          return `skillport add ${repo} ${path}`;
        }
        return `skillport add ${skillName}`;
      case 'local':
        return null;
      default:
        return null;
    }
  }

  /**
   * Generate install arguments for a skill (same as original)
   */
  generateInstallArgs(skillName, type) {
    switch (type) {
      case 'npx':
        return ['skill', skillName];
      case 'skillport':
        if (skillName.includes('/')) {
          const parts = skillName.split('/');
          const repo = parts.slice(0, -1).join('/');
          const path = parts.slice(-1)[0];
          return ['add', repo, path];
        }
        return ['add', skillName];
      case 'local':
        return [];
      default:
        return [];
    }
  }

  /**
   * Generate skill description (same as original)
   */
  generateDescription(skillName) {
    // Implementation same as original SkillManager.generateDescription
    const skillLower = skillName.toLowerCase();
    const keywords = skillLower.split(/[-_/]/);

    // Framework/Technology specific
    if (skillLower.includes('react')) {
      if (keywords.includes('best') || keywords.includes('practices')) return 'React development best practices';
      if (keywords.includes('patterns')) return 'React composition patterns and design guidelines';
      if (keywords.includes('transitions')) return 'React view transitions and animations';
      return 'React development skill';
    }

    if (skillLower.includes('vercel')) {
      if (keywords.includes('deploy')) return 'Vercel deployment automation';
      if (keywords.includes('cli') || keywords.includes('tokens')) return 'Vercel CLI with authentication tokens';
      return 'Vercel platform integration';
    }

    // Default fallback
    return `${skillName} development skill`;
  }
}

export default SkillManagerDB;