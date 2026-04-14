/**
 * Data Migrator - Handle migration from local JSON to Supabase database
 * Safely migrates existing skill registries with backup and validation
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import SkillManager from './skill-manager.js';

export class DataMigrator {
  constructor(databaseClient) {
    this.db = databaseClient;
    this.localRegistryPath = path.join(homedir(), '.opencli', 'skills', 'registry.json');
    this.backupPath = path.join(homedir(), '.opencli', 'skills', 'backup');
  }

  /**
   * Check if local registry exists and has data
   */
  hasLocalRegistry() {
    return fs.existsSync(this.localRegistryPath) && this._getLocalSkillCount() > 0;
  }

  /**
   * Get count of skills in local registry
   */
  _getLocalSkillCount() {
    try {
      if (!fs.existsSync(this.localRegistryPath)) return 0;

      const content = fs.readFileSync(this.localRegistryPath, 'utf8');
      const registry = JSON.parse(content);
      return registry.skills?.length || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Create backup of local registry before migration
   */
  createBackup() {
    if (!this.hasLocalRegistry()) {
      return { created: false, reason: 'No local registry to backup' };
    }

    try {
      // Ensure backup directory exists
      if (!fs.existsSync(this.backupPath)) {
        fs.mkdirSync(this.backupPath, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupPath, `registry-backup-${timestamp}.json`);

      // Copy registry file
      fs.copyFileSync(this.localRegistryPath, backupFile);

      // Create backup metadata
      const metadata = {
        backup_time: new Date().toISOString(),
        original_file: this.localRegistryPath,
        backup_file: backupFile,
        skill_count: this._getLocalSkillCount(),
        migration_version: '1.0.0'
      };

      fs.writeFileSync(
        path.join(this.backupPath, `metadata-${timestamp}.json`),
        JSON.stringify(metadata, null, 2)
      );

      return {
        created: true,
        backupFile,
        metadata,
        skillCount: metadata.skill_count
      };
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Validate local registry structure
   */
  validateLocalRegistry() {
    if (!this.hasLocalRegistry()) {
      return { valid: false, error: 'No local registry found' };
    }

    try {
      const content = fs.readFileSync(this.localRegistryPath, 'utf8');
      const registry = JSON.parse(content);

      const issues = [];

      // Check basic structure
      if (!registry.skills || !Array.isArray(registry.skills)) {
        issues.push('Invalid skills array');
      }

      // Validate each skill
      for (const [index, skill] of (registry.skills || []).entries()) {
        if (!skill.name) {
          issues.push(`Skill at index ${index} missing name`);
        }
        if (!skill.type || !['npx', 'skillport', 'local'].includes(skill.type)) {
          issues.push(`Skill ${skill.name || index} has invalid type: ${skill.type}`);
        }
      }

      return {
        valid: issues.length === 0,
        issues,
        skillCount: registry.skills?.length || 0,
        registry
      };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to parse registry: ${error.message}`
      };
    }
  }

  /**
   * Check if skills already exist in database for this user
   */
  async checkExistingSkillsInDatabase() {
    if (!this.db.connected) {
      return { hasSkills: false, count: 0 };
    }

    try {
      let skills;
      if (this.db.query) {
        // Direct database client
        skills = await this.db.query('SELECT name FROM skills WHERE user_id = $1', [this.db.userId]);
      } else {
        // Supabase client fallback
        skills = await this.db.query('skills', 'select', {
          select: 'name',
          eq: { user_id: this.db.userId }
        });
      }

      return {
        hasSkills: skills.length > 0,
        count: skills.length,
        skillNames: skills.map(s => s.name)
      };
    } catch (error) {
      console.warn('Could not check existing skills:', error.message);
      return { hasSkills: false, count: 0, error: error.message };
    }
  }

  /**
   * Migrate skills from local registry to database
   */
  async migrateToDatabase(options = {}) {
    const {
      dryRun = false,
      overwrite = false,
      skipBackup = false
    } = options;

    // Validate prerequisites
    if (!this.db.connected) {
      throw new Error('Database not connected');
    }

    const validation = this.validateLocalRegistry();
    if (!validation.valid) {
      throw new Error(`Invalid local registry: ${validation.error || validation.issues.join(', ')}`);
    }

    // Check for existing skills
    const existingCheck = await this.checkExistingSkillsInDatabase();
    if (existingCheck.hasSkills && !overwrite) {
      throw new Error(`Database already contains ${existingCheck.count} skills. Use overwrite=true to replace them.`);
    }

    // Create backup unless skipped
    let backup = null;
    if (!skipBackup && !dryRun) {
      backup = this.createBackup();
    }

    const results = {
      backup,
      skills: {
        total: validation.skillCount,
        migrated: 0,
        failed: 0,
        skipped: 0
      },
      errors: [],
      dryRun
    };

    try {
      // If overwriting, clear existing skills
      if (overwrite && existingCheck.hasSkills && !dryRun) {
        if (this.db.query) {
          // Direct database client
          await this.db.query('DELETE FROM skills WHERE user_id = $1', [this.db.userId]);
        } else {
          // Supabase client fallback
          await this.db.query('skills', 'delete', {
            eq: { user_id: this.db.userId }
          });
        }
        console.log(`Cleared ${existingCheck.count} existing skills`);
      }

      // Migrate each skill
      for (const skill of validation.registry.skills) {
        try {
          const skillData = {
            name: skill.name,
            type: skill.type,
            description: skill.description || '',
            user_id: this.db.userId,
            installed: skill.installed || false,
            path: skill.path || null,
            install_command: skill.installCommand || null,
            install_args: skill.installArgs || null,
            custom_install: skill.customInstall || false,
            metadata: skill.metadata || {},
            version: skill.version || null,
            source_url: skill.sourceUrl || null,
            tags: skill.tags || []
          };

          if (!dryRun) {
            if (this.db.createSkill) {
              // Direct database client
              await this.db.createSkill(skillData);
            } else {
              // Supabase client fallback
              await this.db.query('skills', 'insert', { data: skillData });
            }
          }

          results.skills.migrated++;
          console.log(`${dryRun ? '[DRY RUN] ' : ''}Migrated: ${skill.name}`);
        } catch (error) {
          results.skills.failed++;
          results.errors.push({
            skill: skill.name,
            error: error.message
          });
          console.error(`Failed to migrate ${skill.name}:`, error.message);
        }
      }

      // Migration summary
      console.log('\n' + '='.repeat(50));
      console.log('MIGRATION SUMMARY');
      console.log('='.repeat(50));
      console.log(`Total skills: ${results.skills.total}`);
      console.log(`Migrated: ${results.skills.migrated}`);
      console.log(`Failed: ${results.skills.failed}`);
      if (backup) {
        console.log(`Backup created: ${backup.backupFile}`);
      }
      if (dryRun) {
        console.log('DRY RUN - No actual changes made');
      }

      return results;
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Restore from backup (rollback migration)
   */
  async restoreFromBackup(backupFile) {
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }

    try {
      // Clear current database skills for this user
      if (this.db.connected) {
        await this.db.query('skills', 'delete', {
          eq: { user_id: this.db.userId }
        });
        console.log('Cleared database skills');
      }

      // Restore local registry
      fs.copyFileSync(backupFile, this.localRegistryPath);
      console.log(`Restored local registry from: ${backupFile}`);

      return { restored: true, backupFile };
    } catch (error) {
      throw new Error(`Failed to restore from backup: ${error.message}`);
    }
  }

  /**
   * Get available backups
   */
  getAvailableBackups() {
    if (!fs.existsSync(this.backupPath)) {
      return [];
    }

    try {
      const files = fs.readdirSync(this.backupPath);
      const backups = [];

      for (const file of files) {
        if (file.startsWith('metadata-') && file.endsWith('.json')) {
          const metadataPath = path.join(this.backupPath, file);
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            backups.push({
              ...metadata,
              metadata_file: metadataPath
            });
          } catch (error) {
            console.warn(`Could not read backup metadata: ${file}`);
          }
        }
      }

      return backups.sort((a, b) => new Date(b.backup_time) - new Date(a.backup_time));
    } catch (error) {
      console.warn('Could not list backups:', error.message);
      return [];
    }
  }

  /**
   * Interactive migration with prompts
   */
  async interactiveMigration() {
    console.log('🔄 Skills Database Migration');
    console.log('=' .repeat(40));

    // Check local registry
    if (!this.hasLocalRegistry()) {
      console.log('❌ No local registry found - nothing to migrate');
      return { migrated: false, reason: 'No local registry' };
    }

    const validation = this.validateLocalRegistry();
    if (!validation.valid) {
      console.log('❌ Local registry is invalid:', validation.error || validation.issues.join(', '));
      return { migrated: false, reason: 'Invalid registry' };
    }

    console.log(`✅ Found ${validation.skillCount} skills in local registry`);

    // Check database connection
    if (!this.db.connected) {
      console.log('❌ Database not connected');
      return { migrated: false, reason: 'Database not connected' };
    }

    const existingCheck = await this.checkExistingSkillsInDatabase();
    if (existingCheck.hasSkills) {
      console.log(`⚠️  Database already contains ${existingCheck.count} skills`);
      console.log('Continue anyway? This will overwrite existing skills.');
      // In a real CLI, you'd prompt the user here
      // For now, we'll just proceed with overwrite
    }

    console.log('🚀 Starting migration...');

    try {
      const results = await this.migrateToDatabase({
        overwrite: existingCheck.hasSkills
      });

      if (results.skills.failed === 0) {
        console.log('✅ Migration completed successfully!');
      } else {
        console.log('⚠️  Migration completed with errors');
      }

      return { migrated: true, results };
    } catch (error) {
      console.log('❌ Migration failed:', error.message);
      return { migrated: false, error: error.message };
    }
  }
}

export default DataMigrator;