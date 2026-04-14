/**
 * Skill Manager - Unified registry management with database and local support
 * Handles both local JSON and Supabase database backends with automatic fallback
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { execSync } from 'child_process';
import SkillManagerDB from './skill-manager-db.js';
import OfflineFallback from './offline-fallback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SkillManager {
  constructor(useDatabase = null) {
    // Auto-detect database mode
    this.useDatabase = this._shouldUseDatabase(useDatabase);

    this.registryPath = path.join(homedir(), '.opencli', 'skills', 'registry.json');
    this.localSkillsPath = path.join(process.cwd(), '.claude', 'skills');

    // Initialize database manager if using database mode
    if (this.useDatabase) {
      this.dbManager = new SkillManagerDB();
      this.offlineFallback = new OfflineFallback();
      this.connected = this.dbManager.connected;
    } else {
      this.dbManager = null;
      this.offlineFallback = null;
      this.connected = false;

      // Ensure registry directory exists for local mode
      const registryDir = path.dirname(this.registryPath);
      if (!fs.existsSync(registryDir)) {
        fs.mkdirSync(registryDir, { recursive: true });
      }
    }

    this._registry = null;
  }

  /**
   * Determine if database mode should be used
   */
  _shouldUseDatabase(useDatabase) {
    // Explicit override
    if (useDatabase !== null) {
      return useDatabase;
    }

    // Environment variable
    if (process.env.USE_DATABASE === 'true') {
      return true;
    }
    if (process.env.USE_DATABASE === 'false') {
      return false;
    }

    // Auto-detect: check if database credentials are available
    try {
      const hasSupabaseUrl = process.env.SUPABASE_URL || this._checkDopplerCredentials();
      const hasDirectDb = process.env.SUPABASE_DATABASE_URL || this._checkDopplerDatabaseUrl();
      return !!(hasSupabaseUrl || hasDirectDb);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Doppler credentials are available
   */
  _checkDopplerCredentials() {
    try {
      execSync('doppler secrets get SUPABASE_URL --project knowledgebase --config dev --plain', {
        stdio: 'pipe',
        timeout: 5000
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Doppler database URL is available
   */
  _checkDopplerDatabaseUrl() {
    try {
      const result = execSync('doppler secrets get SUPABASE_DATABASE_URL --project knowledgebase --config dev --plain', {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8'
      });
      return result.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load the skill registry
   */
  loadRegistry() {
    if (this._registry) return this._registry;

    if (!fs.existsSync(this.registryPath)) {
      // Create empty registry
      this._registry = {
        version: '1.0.0',
        created: new Date().toISOString(),
        skills: []
      };
      this.saveRegistry();
      return this._registry;
    }

    try {
      const content = fs.readFileSync(this.registryPath, 'utf8');
      this._registry = JSON.parse(content);

      // Ensure registry has required structure
      if (!this._registry.skills) {
        this._registry.skills = [];
      }

      return this._registry;
    } catch (error) {
      throw new Error(`Failed to load skill registry: ${error.message}`);
    }
  }

  /**
   * Save the skill registry
   */
  saveRegistry() {
    if (!this._registry) {
      throw new Error('No registry loaded to save');
    }

    this._registry.updated = new Date().toISOString();

    try {
      fs.writeFileSync(this.registryPath, JSON.stringify(this._registry, null, 2));
    } catch (error) {
      throw new Error(`Failed to save skill registry: ${error.message}`);
    }
  }

  /**
   * Add a skill to the registry
   */
  async addSkill(skillName, options = {}) {
    const {
      type = 'npx',
      description = '',
      force = false
    } = options;

    if (this.useDatabase) {
      if (!this.connected) {
        throw new Error('Database not connected. Use local mode or fix database connection.');
      }
      return await this.dbManager.addSkill(skillName, options);
    }

    const registry = this.loadRegistry();

    // Check if skill already exists
    const existingSkill = registry.skills.find(skill => skill.name === skillName);
    if (existingSkill && !force) {
      throw new Error(`Skill '${skillName}' already exists. Use --force to update.`);
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
      added: new Date().toISOString(),
      installed: false,
      path: skillPath,
      installCommand: this.generateInstallCommand(skillName, type),
      installArgs: this.generateInstallArgs(skillName, type),
      customInstall: false,
      metadata: {}
    };

    if (existingSkill) {
      // Update existing skill
      Object.assign(existingSkill, skillData, {
        updated: new Date().toISOString()
      });
    } else {
      // Add new skill
      registry.skills.push(skillData);
    }

    this.saveRegistry();
    return skillData;
  }

  /**
   * Remove a skill from the registry
   */
  async removeSkill(skillName) {
    if (this.useDatabase) {
      if (!this.connected) {
        throw new Error('Database not connected. Use local mode or fix database connection.');
      }
      return await this.dbManager.removeSkill(skillName);
    }

    const registry = this.loadRegistry();
    const initialLength = registry.skills.length;

    registry.skills = registry.skills.filter(skill => skill.name !== skillName);

    if (registry.skills.length === initialLength) {
      throw new Error(`Skill '${skillName}' not found in registry`);
    }

    this.saveRegistry();
    return { removed: true, skillName };
  }

  /**
   * List all skills in the registry
   */
  async listSkills(options = {}) {
    const {
      type = null,
      installed = null,
      search = null
    } = options;

    if (this.useDatabase) {
      if (!this.connected && this.offlineFallback) {
        // Use offline fallback
        console.warn('Database not connected, using offline fallback');
        const fallbacks = this.offlineFallback.createSkillFallbacks();
        return await this.offlineFallback.withFallback(
          async () => { throw new Error('Database not connected'); },
          async () => fallbacks.listSkills(options),
          'listSkills'
        ).then(result => {
          if (result.warning) console.warn(result.warning);
          return result.data;
        });
      }
      return await this.dbManager.listSkills(options);
    }

    const registry = this.loadRegistry();
    let skills = registry.skills;

    // Apply filters
    if (type) {
      skills = skills.filter(skill => skill.type === type);
    }

    if (installed !== null) {
      skills = skills.filter(skill => skill.installed === installed);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      skills = skills.filter(skill =>
        skill.name.toLowerCase().includes(searchLower) ||
        skill.description.toLowerCase().includes(searchLower)
      );
    }

    // Sort by name
    skills.sort((a, b) => a.name.localeCompare(b.name));

    return skills;
  }

  /**
   * Get a specific skill
   */
  async getSkill(skillName) {
    if (this.useDatabase) {
      if (!this.connected && this.offlineFallback) {
        console.warn('Database not connected, using offline fallback');
        const fallbacks = this.offlineFallback.createSkillFallbacks();
        return await this.offlineFallback.withFallback(
          async () => { throw new Error('Database not connected'); },
          async () => fallbacks.getSkill(skillName),
          'getSkill'
        ).then(result => {
          if (result.warning) console.warn(result.warning);
          return result.data;
        });
      }
      return await this.dbManager.getSkill(skillName);
    }

    const registry = this.loadRegistry();
    const skill = registry.skills.find(skill => skill.name === skillName);

    if (!skill) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    return skill;
  }

  /**
   * Update skill metadata
   */
  async updateSkill(skillName, updates) {
    if (this.useDatabase) {
      if (!this.connected) {
        throw new Error('Database not connected. Update operations require database connection.');
      }
      return await this.dbManager.updateSkill(skillName, updates);
    }

    const registry = this.loadRegistry();
    const skill = registry.skills.find(skill => skill.name === skillName);

    if (!skill) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    // Update allowed fields
    const allowedUpdates = ['description', 'type', 'installed', 'metadata'];
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        skill[field] = updates[field];
      }
    }

    skill.updated = new Date().toISOString();
    this.saveRegistry();

    return skill;
  }

  /**
   * Mark skill as installed/uninstalled
   */
  async markInstalled(skillName, installed = true) {
    if (this.useDatabase) {
      if (!this.connected) {
        throw new Error('Database not connected. Install tracking requires database connection.');
      }
      return await this.dbManager.markInstalled(skillName, installed);
    }
    return this.updateSkill(skillName, { installed });
  }

  /**
   * Get registry statistics
   */
  async getStats() {
    if (this.useDatabase) {
      if (!this.connected && this.offlineFallback) {
        console.warn('Database not connected, using offline fallback');
        const fallbacks = this.offlineFallback.createSkillFallbacks();
        return await this.offlineFallback.withFallback(
          async () => { throw new Error('Database not connected'); },
          async () => fallbacks.getStats(),
          'getStats'
        ).then(result => {
          if (result.warning) console.warn(result.warning);
          return result.data;
        });
      }
      return await this.dbManager.getStats();
    }

    const registry = this.loadRegistry();

    const stats = {
      total: registry.skills.length,
      installed: registry.skills.filter(s => s.installed).length,
      byType: {}
    };

    // Count by type
    for (const skill of registry.skills) {
      stats.byType[skill.type] = (stats.byType[skill.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Detect local skill path
   */
  detectLocalSkillPath(skillName) {
    // Check common locations
    const searchPaths = [
      this.localSkillsPath,
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
   * Generate install command for a skill
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
        return null; // Local skills don't have install commands
      default:
        return null;
    }
  }

  /**
   * Generate install arguments for a skill
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
   * Generate skill description based on name
   */
  generateDescription(skillName) {
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

    if (skillLower.includes('docker')) {
      if (keywords.includes('compose')) return 'Docker Compose orchestration';
      if (keywords.includes('fundamentals')) return 'Docker containerization fundamentals';
      if (keywords.includes('patterns') || keywords.includes('dockerfile')) return 'Dockerfile patterns and best practices';
      if (keywords.includes('debug')) return 'Docker container debugging and troubleshooting';
      if (keywords.includes('expert')) return 'Advanced Docker expertise';
      return 'Docker containerization skill';
    }

    if (skillLower.includes('kubernetes') || skillLower.includes('k8s')) {
      return 'Kubernetes orchestration and deployment';
    }

    if (skillLower.includes('anthropics')) {
      if (skillLower.includes('mcp-builder')) return 'Model Context Protocol (MCP) server builder';
      if (skillLower.includes('skill-creator')) return 'AI agent skill development toolkit';
      if (skillLower.includes('webapp-testing')) return 'Web application testing automation';
      return 'Anthropic AI development tool';
    }

    // Skill type specific
    if (keywords.includes('cicd') || keywords.includes('ci')) return 'CI/CD pipeline automation';
    if (keywords.includes('cache')) return 'Caching optimization and performance';
    if (keywords.includes('expert')) return 'Advanced expert-level skill';
    if (keywords.includes('debug') || keywords.includes('debugging')) return 'Debugging and troubleshooting';
    if (keywords.includes('testing')) return 'Testing and quality assurance';
    if (keywords.includes('patterns')) return 'Development patterns and best practices';
    if (keywords.includes('design') || keywords.includes('guidelines')) return 'Design guidelines and standards';
    if (keywords.includes('composition')) return 'Code composition patterns';
    if (keywords.includes('deploy') || keywords.includes('deployment')) return 'Deployment automation';

    // Web development specific
    if (skillLower.includes('web') && keywords.includes('design')) return 'Web design guidelines and standards';

    // Generic skill path fallback
    if (skillLower.startsWith('skills/')) {
      const skillPart = skillName.substring(7); // Remove 'skills/' prefix
      return this.generateDescription(skillPart);
    }

    // Default fallback
    return `${skillName} development skill`;
  }

  /**
   * Fix descriptions for all skills (remove profile references)
   */
  async fixAllSkillDescriptions() {
    const registry = this.loadRegistry();
    let updatedCount = 0;

    for (const skill of registry.skills) {
      // Check if description contains profile reference
      if (skill.description && skill.description.includes('Imported from') && skill.description.includes('profile')) {
        const newDescription = this.generateDescription(skill.name);
        const oldDescription = skill.description;

        skill.description = newDescription;
        skill.updated = new Date().toISOString();

        // Add installation metadata if missing
        if (!skill.installCommand) {
          skill.installCommand = this.generateInstallCommand(skill.name, skill.type);
        }
        if (!skill.installArgs) {
          skill.installArgs = this.generateInstallArgs(skill.name, skill.type);
        }
        if (skill.customInstall === undefined) {
          skill.customInstall = false;
        }

        console.log(`Updated: ${skill.name}`);
        console.log(`  Old: ${oldDescription}`);
        console.log(`  New: ${newDescription}`);
        console.log('');

        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      this.saveRegistry();
    }

    return {
      totalSkills: registry.skills.length,
      updatedCount,
      registry: this._registry
    };
  }

  /**
   * Import skills from profile data (migration helper)
   */
  async importFromProfile(profileData) {
    const importedSkills = [];

    for (const [skillType, skills] of Object.entries(profileData.all_skills || {})) {
      const type = skillType.replace('-skills', '');

      for (const skillName of skills || []) {
        try {
          const skillData = await this.addSkill(skillName, {
            type,
            description: `Imported from ${profileData.name} profile`,
            force: true
          });
          importedSkills.push(skillData);
        } catch (error) {
          console.warn(`Failed to import skill ${skillName}: ${error.message}`);
        }
      }
    }

    return importedSkills;
  }

  /**
   * Export skills to profile format (for backward compatibility)
   */
  async exportToProfile(profileName) {
    const registry = this.loadRegistry();

    const profileData = {
      name: profileName,
      description: `Exported skills from registry`,
      version: '1.0.0',
      categories: ['exported'],
      purpose: `Skills exported from flat registry`,
      phases: {},
      all_skills: {
        'npx-skills': [],
        'skillport-skills': [],
        'local-skills': []
      },
      environment: {
        recommended: [],
        optional: []
      },
      workflow_examples: []
    };

    // Group skills by type
    for (const skill of registry.skills) {
      const skillKey = `${skill.type}-skills`;
      if (profileData.all_skills[skillKey]) {
        profileData.all_skills[skillKey].push(skill.name);
      }
    }

    return profileData;
  }

  // ================== ENHANCED DATABASE FEATURES ==================

  /**
   * Get skill analytics (database mode only)
   */
  async getAnalytics() {
    if (!this.useDatabase) {
      throw new Error('Analytics require database mode');
    }
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    return await this.dbManager.getAnalytics();
  }

  /**
   * Search skills with advanced features
   */
  async searchSkills(query, options = {}) {
    if (this.useDatabase) {
      if (!this.connected && this.offlineFallback) {
        console.warn('Database not connected, using offline fallback');
        const fallbacks = this.offlineFallback.createSkillFallbacks();
        return await this.offlineFallback.withFallback(
          async () => { throw new Error('Database not connected'); },
          async () => fallbacks.searchSkills(query, options),
          'searchSkills'
        ).then(result => {
          if (result.warning) console.warn(result.warning);
          return result.data;
        });
      }
      return await this.dbManager.searchSkills(query, options);
    }

    // Local search implementation
    const registry = this.loadRegistry();
    const searchLower = query.toLowerCase();

    let skills = registry.skills.filter(skill =>
      skill.name.toLowerCase().includes(searchLower) ||
      (skill.description && skill.description.toLowerCase().includes(searchLower))
    );

    if (options.type) {
      skills = skills.filter(skill => skill.type === options.type);
    }

    if (options.limit) {
      skills = skills.slice(0, options.limit);
    }

    return skills;
  }

  /**
   * Get system status and configuration
   */
  async getSystemStatus() {
    const status = {
      mode: this.useDatabase ? 'database' : 'local',
      connected: this.connected,
      hasLocalRegistry: fs.existsSync(this.registryPath)
    };

    if (this.useDatabase && this.dbManager) {
      status.database = await this.dbManager.db.healthCheck();
    }

    if (this.offlineFallback) {
      status.offline = this.offlineFallback.getOfflineStatus();
    }

    return status;
  }

  /**
   * Switch between database and local mode (if possible)
   */
  async switchMode(useDatabase) {
    if (useDatabase && !this.dbManager) {
      throw new Error('Database mode not available. Check credentials and connection.');
    }

    if (!useDatabase && !fs.existsSync(this.registryPath)) {
      throw new Error('Local mode not available. No local registry found.');
    }

    this.useDatabase = useDatabase;
    return { switched: true, mode: useDatabase ? 'database' : 'local' };
  }

  /**
   * Migrate data between local and database modes
   */
  async migrateData(direction = 'local-to-db', options = {}) {
    if (!this.dbManager || !this.dbManager.dataMigrator) {
      throw new Error('Migration requires database support');
    }

    if (direction === 'local-to-db') {
      return await this.dbManager.dataMigrator.migrateToDatabase(options);
    } else if (direction === 'db-to-local') {
      throw new Error('Database to local migration not yet implemented');
    } else {
      throw new Error('Invalid migration direction. Use "local-to-db" or "db-to-local"');
    }
  }

  /**
   * Get available data migration options
   */
  async getMigrationStatus() {
    if (!this.dbManager || !this.dbManager.dataMigrator) {
      return { available: false, reason: 'Database support not available' };
    }

    const hasLocal = this.dbManager.dataMigrator.hasLocalRegistry();
    const dbCheck = await this.dbManager.dataMigrator.checkExistingSkillsInDatabase();

    return {
      available: true,
      hasLocalRegistry: hasLocal,
      localSkillCount: hasLocal ? this.dbManager.dataMigrator._getLocalSkillCount() : 0,
      hasDatabaseSkills: dbCheck.hasSkills,
      databaseSkillCount: dbCheck.count,
      canMigrateToDb: hasLocal,
      canMigrateToLocal: dbCheck.hasSkills,
      backups: this.dbManager.dataMigrator.getAvailableBackups()
    };
  }
}

export default SkillManager;