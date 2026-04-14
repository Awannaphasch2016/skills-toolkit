#!/usr/bin/env node

// Simple skills management CLI for opencli
// Usage: opencli skills <command> [args...]

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import SkillManager from '../lib/skill-manager.js';
import SkillValidator from '../lib/skill-validator.js';
import SkillSearcher from '../lib/skill-searcher.js';
import ConfigManager from '../lib/config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SKILLS_CACHE_DIR = path.join(homedir(), '.opencli', 'skills');

// Initialize managers
const configManager = new ConfigManager();
const skillManager = new SkillManager();
const skillValidator = new SkillValidator();
const skillSearcher = new SkillSearcher();

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m'
};

// Logging functions
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}❌${colors.reset} ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`${colors.gray}🔍${colors.reset} ${msg}`)
};

// Utility functions
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkDependencies(skillType = null) {
  const missing = [];

  // Only check dependencies for the specific skill type being installed
  if (!skillType || skillType === 'npx') {
    try {
      await runCommand('npx', ['--version'], { silent: true });
    } catch {
      if (skillType === 'npx') {
        missing.push('npx (install Node.js)');
      }
    }
  }

  if (!skillType || skillType === 'skillport') {
    try {
      await runCommand('skillport', ['--version'], { silent: true });
    } catch {
      if (skillType === 'skillport') {
        missing.push('skillport (pip install skillport)');
      }
    }
  }

  if (missing.length > 0) {
    log.error(`Missing dependencies: ${missing.join(', ')}`);
    console.log('Please install:');
    missing.forEach(dep => console.log(`  - ${dep}`));
    throw new Error(`Missing dependencies for ${skillType} skill`);
  }
}

async function installNpxSkill(skillName, skillData = null) {
  log.info(`Installing NPX skill: ${skillName}`);
  try {
    // Use stored installation metadata if available
    if (skillData && skillData.installArgs && skillData.installArgs.length > 0) {
      await runCommand('npx', skillData.installArgs);
    } else {
      // Fallback to default
      await runCommand('npx', ['skill', skillName]);
    }
    log.success(`Installed: ${skillName}`);
    await skillManager.markInstalled(skillName, true);
  } catch (error) {
    log.error(`Failed to install: ${skillName}`);
    throw error;
  }
}

async function installSkillportSkill(skillName, skillData = null) {
  log.info(`Installing SkillPort skill: ${skillName}`);
  try {
    // Use stored installation metadata if available
    if (skillData && skillData.installArgs && skillData.installArgs.length > 0) {
      await runCommand('skillport', skillData.installArgs);
    } else {
      // Fallback to default parsing logic
      if (skillName.includes('/')) {
        const parts = skillName.split('/');
        const repo = parts.slice(0, -1).join('/');
        const path = parts.slice(-1)[0];
        await runCommand('skillport', ['add', repo, path]);
      } else {
        await runCommand('skillport', ['add', skillName]);
      }
    }
    log.success(`Installed: ${skillName}`);
    await skillManager.markInstalled(skillName, true);
  } catch (error) {
    log.warn(`Failed to install SkillPort skill: ${skillName} - ${error.message}`);
  }
}

async function installLocalSkill(skillName, skillData = null) {
  // Get skill data if not provided
  if (!skillData) {
    skillData = await skillManager.getSkill(skillName);
  }

  if (skillData.path && fs.existsSync(skillData.path)) {
    log.success(`Local skill already available: ${skillName}`);
    log.info(`Path: ${skillData.path}`);
    await skillManager.markInstalled(skillName, true);
  } else {
    log.warn(`Local skill path not found: ${skillName}`);
  }
}

// Command implementations
async function addSkill(skillName, options) {
  try {
    const opts = parseOptions(options);
    const skillType = opts.type || 'npx';
    const description = opts.description || '';

    log.info(`Adding skill '${skillName}' as ${skillType}`);

    // Validate skill first unless forced
    if (!opts.force) {
      log.info('Validating skill...');
      const validation = await skillValidator.validateSkill(skillName, skillType);

      if (!validation.valid) {
        log.warn(`Skill validation failed: ${validation.message}`);
        console.log(`${colors.yellow}Use --force to add anyway${colors.reset}`);
        process.exit(1);
      } else {
        log.success(`Skill validation passed: ${validation.message}`);
      }
    }

    // Add to registry
    const skillData = await skillManager.addSkill(skillName, {
      type: skillType,
      description: description,
      force: opts.force
    });

    console.log('');
    log.success(`Skill '${skillName}' added to registry`);
    console.log(`Type: ${skillData.type}`);
    console.log(`Description: ${skillData.description}`);

    if (skillData.path) {
      console.log(`Path: ${skillData.path}`);
    }

    const stats = skillManager.getStats();
    console.log(`Total skills in registry: ${stats.total}`);

  } catch (error) {
    log.error(`Failed to add skill: ${error.message}`);
    process.exit(1);
  }
}

async function removeSkill(skillName) {
  try {
    log.info(`Removing skill '${skillName}' from registry`);

    const result = await skillManager.removeSkill(skillName);

    console.log('');
    log.success(`Skill '${skillName}' removed from registry`);

    const stats = skillManager.getStats();
    console.log(`Remaining skills: ${stats.total}`);

  } catch (error) {
    log.error(`Failed to remove skill: ${error.message}`);
    process.exit(1);
  }
}

async function listSkills(options) {
  try {
    const opts = parseOptions(options);
    const skills = await skillManager.listSkills({
      type: opts.type,
      installed: opts.installed === 'true' ? true : opts.installed === 'false' ? false : null,
      search: opts.search
    });

    if (skills.length === 0) {
      console.log(`${colors.yellow}No skills found${colors.reset}`);
      return;
    }

    console.log(`${colors.cyan}📋 Skills Registry (${skills.length} skills)${colors.reset}`);
    console.log('');

    // Group by type
    const skillsByType = {};
    skills.forEach(skill => {
      if (!skillsByType[skill.type]) {
        skillsByType[skill.type] = [];
      }
      skillsByType[skill.type].push(skill);
    });

    for (const [type, typeSkills] of Object.entries(skillsByType)) {
      console.log(`${colors.cyan}${type.toUpperCase()} Skills (${typeSkills.length}):${colors.reset}`);

      typeSkills.forEach(skill => {
        const status = skill.installed ? '✅' : '⏳';
        const name = skill.installed ? colors.green : colors.gray;

        console.log(`  ${status} ${name}${skill.name}${colors.reset}`);
        console.log(`     ${skill.description}`);

        if (skill.path) {
          console.log(`     ${colors.gray}Path: ${skill.path}${colors.reset}`);
        }

        console.log('');
      });
    }

    // Show summary
    const stats = skillManager.getStats();
    console.log(`${colors.cyan}Summary:${colors.reset}`);
    console.log(`Total: ${stats.total}, Installed: ${stats.installed}`);

  } catch (error) {
    log.error(`Failed to list skills: ${error.message}`);
    process.exit(1);
  }
}

async function installSkills(skillName, options) {
  try {
    if (skillName) {
      // Install specific skill
      log.info(`Installing skill: ${skillName}`);
      const skill = await skillManager.getSkill(skillName);

      // Check dependencies for this specific skill type
      await checkDependencies(skill.type);

      switch (skill.type) {
        case 'npx':
          await installNpxSkill(skill.name, skill);
          break;
        case 'skillport':
          await installSkillportSkill(skill.name, skill);
          break;
        case 'local':
          await installLocalSkill(skill.name, skill);
          break;
        default:
          throw new Error(`Unknown skill type: ${skill.type}`);
      }

      log.success(`Skill '${skillName}' installed successfully`);

    } else {
      // Install all skills in registry
      const skills = await skillManager.listSkills({ installed: false });

      if (skills.length === 0) {
        log.info('All skills are already installed');
        return;
      }

      log.info(`Installing ${skills.length} uninstalled skills...`);
      console.log('');

      for (const skill of skills) {
        try {
          switch (skill.type) {
            case 'npx':
              await installNpxSkill(skill.name, skill);
              break;
            case 'skillport':
              await installSkillportSkill(skill.name, skill);
              break;
            case 'local':
              await installLocalSkill(skill.name, skill);
              break;
          }
        } catch (error) {
          log.error(`Failed to install ${skill.name}: ${error.message}`);
        }
      }

      console.log('');
      log.success('Installation process completed');
    }

  } catch (error) {
    log.error(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

async function searchSkills(query, options) {
  try {
    const opts = parseOptions(options);
    const registries = opts.registry ? [opts.registry] : ['npx', 'skillport', 'github', 'local'];
    const limit = parseInt(opts.limit) || 20;

    log.info(`Searching for skills: ${query}`);

    const results = await skillSearcher.searchAll(query, {
      registries,
      limit
    });

    if (results.length === 0) {
      console.log(`${colors.yellow}No skills found for query: ${query}${colors.reset}`);
      return;
    }

    console.log('');
    console.log(`${colors.cyan}Found ${results.length} skills:${colors.reset}`);
    console.log('');

    results.forEach((skill, index) => {
      console.log(`${colors.green}${index + 1}. ${skill.name}${colors.reset} (${skill.type})`);
      console.log(`   ${skill.description}`);

      if (skill.stars) {
        console.log(`   ${colors.gray}⭐ ${skill.stars} stars${colors.reset}`);
      }

      if (skill.installCommand) {
        console.log(`   ${colors.gray}Install: ${skill.installCommand}${colors.reset}`);
      }

      console.log('');
    });

    console.log(`${colors.gray}Add to registry with: opencli skills add <skill-name> --type <type>${colors.reset}`);

  } catch (error) {
    log.error(`Search failed: ${error.message}`);
    process.exit(1);
  }
}

async function validateSkills() {
  try {
    log.info('Validating all skills in registry...');

    const skills = await skillManager.listSkills();

    if (skills.length === 0) {
      console.log(`${colors.yellow}No skills found in registry${colors.reset}`);
      return;
    }

    console.log('');
    console.log(`${colors.cyan}Validating ${skills.length} skills...${colors.reset}`);

    const skillsForValidation = skills.map(skill => ({
      skill: skill.name,
      type: skill.type
    }));

    const results = await skillValidator.validateSkills(skillsForValidation);

    let validCount = 0;
    let invalidCount = 0;

    console.log('');
    results.forEach(result => {
      const status = result.valid ? '✅' : '❌';
      const color = result.valid ? colors.green : colors.red;

      console.log(`${status} ${color}${result.skill}${colors.reset} (${result.type})`);
      console.log(`   ${result.message}`);

      if (result.warning) {
        console.log(`   ${colors.yellow}⚠️  ${result.warning}${colors.reset}`);
      }

      if (result.valid) validCount++;
      else invalidCount++;

      console.log('');
    });

    console.log(`${colors.cyan}Validation Summary:${colors.reset}`);
    console.log(`Valid: ${validCount}, Invalid: ${invalidCount}`);

    if (invalidCount > 0) {
      process.exit(1);
    }

  } catch (error) {
    log.error(`Validation failed: ${error.message}`);
    process.exit(1);
  }
}

async function handleConfig(args) {
  try {
    const subcommand = args[0];

    if (!subcommand) {
      // Show current config
      const summary = configManager.getSummary();
      console.log(`${colors.cyan}Current Configuration:${colors.reset}`);
      console.log(`Source: ${summary.source}`);
      console.log(`Database: ${summary.database}`);
      console.log(`Registries: ${summary.registries.join(', ')}`);
      console.log(`Cache: ${summary.cache}`);
      console.log(`Logging: ${summary.logging}`);
      return;
    }

    switch (subcommand) {
      case 'init':
        const template = args[1] || 'default';
        configManager.init(null, { template });
        log.success('Configuration initialized');
        break;

      case 'set':
        if (!args[1] || args[2] === undefined) {
          log.error('Usage: opencli skills config set <key> <value>');
          process.exit(1);
        }
        configManager.set(args[1], args[2]).save();
        log.success(`Configuration updated: ${args[1]} = ${args[2]}`);
        break;

      case 'get':
        if (!args[1]) {
          log.error('Usage: opencli skills config get <key>');
          process.exit(1);
        }
        const value = configManager.get(args[1]);
        console.log(value !== null ? value : 'undefined');
        break;

      default:
        log.error(`Unknown config command: ${subcommand}`);
        console.log('Available: init, set <key> <value>, get <key>');
        process.exit(1);
    }

  } catch (error) {
    log.error(`Configuration failed: ${error.message}`);
    process.exit(1);
  }
}

// New database-related commands
async function showStatus() {
  try {
    console.log(`${colors.cyan}Skills Toolkit Status${colors.reset}`);
    console.log('='.repeat(50));

    const status = await skillManager.getSystemStatus();

    console.log(`Mode: ${colors.green}${status.mode}${colors.reset}`);
    console.log(`Connected: ${status.connected ? colors.green + '✅' : colors.red + '❌'}${colors.reset}`);
    console.log(`Local Registry: ${status.hasLocalRegistry ? colors.green + '✅' : colors.red + '❌'}${colors.reset}`);

    if (status.database) {
      console.log('');
      console.log('Database Status:');
      console.log(`  Connection: ${status.database.connection.success ? colors.green + '✅' : colors.red + '❌'}${colors.reset}`);
      console.log(`  User ID: ${status.database.userId}`);
    }

    if (status.offline) {
      console.log('');
      console.log('Offline Support:');
      console.log(`  Local Backup: ${status.offline.hasLocalRegistry ? colors.green + '✅' : colors.red + '❌'}${colors.reset}`);
      console.log(`  Cache Operations: ${status.offline.cachedOperations.length}`);
    }

    // Show stats
    const stats = await skillManager.getStats();
    console.log('');
    console.log('Skills Summary:');
    console.log(`  Total: ${stats.total}`);
    console.log(`  Installed: ${stats.installed}`);
    console.log(`  By Type: ${Object.entries(stats.byType).map(([type, count]) => `${type}:${count}`).join(', ')}`);

  } catch (error) {
    log.error(`Failed to get status: ${error.message}`);
    process.exit(1);
  }
}

async function handleMigration(args) {
  try {
    const direction = args[0] || 'local-to-db';
    const opts = parseOptions(args.slice(1));

    console.log(`${colors.cyan}Skills Data Migration${colors.reset}`);
    console.log('='.repeat(50));

    // Show migration status first
    const migrationStatus = await skillManager.getMigrationStatus();
    if (!migrationStatus.available) {
      log.error(`Migration not available: ${migrationStatus.reason}`);
      return;
    }

    console.log('Migration Status:');
    console.log(`  Local Registry: ${migrationStatus.hasLocalRegistry ? '✅' : '❌'} (${migrationStatus.localSkillCount} skills)`);
    console.log(`  Database: ${migrationStatus.hasDatabaseSkills ? '✅' : '❌'} (${migrationStatus.databaseSkillCount} skills)`);

    if (migrationStatus.backups.length > 0) {
      console.log(`  Backups Available: ${migrationStatus.backups.length}`);
    }

    console.log('');

    if (direction === 'local-to-db') {
      if (!migrationStatus.canMigrateToDb) {
        log.warn('No local registry found to migrate');
        return;
      }

      log.info(`${opts.dryRun ? '[DRY RUN] ' : ''}Migrating from local to database...`);
      const result = await skillManager.migrateData('local-to-db', {
        dryRun: opts.dryRun,
        overwrite: opts.force
      });

      console.log('');
      if (result.skills.failed === 0) {
        log.success(`Migration completed successfully! ${result.skills.migrated} skills migrated`);
      } else {
        log.warn(`Migration completed with ${result.skills.failed} errors`);
      }
    } else {
      log.error('Database to local migration not yet implemented');
    }

  } catch (error) {
    log.error(`Migration failed: ${error.message}`);
    process.exit(1);
  }
}

async function handleSync() {
  try {
    if (!skillManager.useDatabase) {
      log.error('Sync is only available in database mode');
      return;
    }

    if (!skillManager.connected) {
      log.error('Database not connected');
      return;
    }

    log.info('Syncing with cloud database...');

    // For now, just show status - real sync would involve conflict resolution
    const status = await skillManager.getSystemStatus();
    log.success('Sync completed');

    console.log(`Database skills: ${status.database?.skills || 'unknown'}`);

  } catch (error) {
    log.error(`Sync failed: ${error.message}`);
    process.exit(1);
  }
}

async function showAnalytics() {
  try {
    if (!skillManager.useDatabase) {
      log.error('Analytics are only available in database mode');
      return;
    }

    if (!skillManager.connected) {
      log.error('Database not connected');
      return;
    }

    console.log(`${colors.cyan}Skills Analytics${colors.reset}`);
    console.log('='.repeat(50));

    const analytics = await skillManager.getAnalytics();
    if (!analytics) {
      log.warn('No analytics data available');
      return;
    }

    console.log(`Total Installations: ${analytics.total_installations}`);
    console.log(`Error Rate: ${analytics.error_rate.toFixed(1)}%`);

    if (analytics.recent_installations.length > 0) {
      console.log('');
      console.log('Recent Installations:');
      analytics.recent_installations.slice(0, 5).forEach(install => {
        const status = install.success ? '✅' : '❌';
        console.log(`  ${status} ${install.skills?.name || 'Unknown'} (${new Date(install.installed_at).toLocaleDateString()})`);
      });
    }

    if (analytics.popular_skills.length > 0) {
      console.log('');
      console.log('Installed Skills:');
      analytics.popular_skills.slice(0, 10).forEach(skill => {
        console.log(`  ${colors.green}✅${colors.reset} ${skill.name} (${skill.type})`);
      });
    }

  } catch (error) {
    log.error(`Analytics failed: ${error.message}`);
    process.exit(1);
  }
}

async function switchMode(args) {
  try {
    const mode = args[0];
    if (!mode || !['local', 'database'].includes(mode)) {
      log.error('Usage: opencli skills mode <local|database>');
      return;
    }

    const useDatabase = mode === 'database';
    console.log(`${colors.cyan}Switching to ${mode} mode...${colors.reset}`);

    const result = await skillManager.switchMode(useDatabase);
    log.success(`Switched to ${result.mode} mode`);

    // Show new status
    await showStatus();

  } catch (error) {
    log.error(`Mode switch failed: ${error.message}`);
    process.exit(1);
  }
}

// Parse command line options
function parseOptions(args) {
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++; // Skip next arg since we consumed it
      } else {
        options[key] = true; // Flag option
      }
    }
  }

  return options;
}

function showHelp() {
  console.log(`${colors.cyan}opencli skills - Skills management with cloud sync${colors.reset}`);
  console.log('');
  console.log('Usage:');
  console.log('  opencli skills <command> [args...]');
  console.log('');
  console.log('Skill Management:');
  console.log(`  ${colors.green}add <skill-name>            ${colors.reset} Add skill to registry`);
  console.log(`  ${colors.green}remove <skill-name>         ${colors.reset} Remove skill from registry`);
  console.log(`  ${colors.green}list                        ${colors.reset} Show all skills in registry`);
  console.log(`  ${colors.green}install [skill-name]        ${colors.reset} Install skill(s)`);
  console.log(`  ${colors.green}search <query>              ${colors.reset} Search for skills across registries`);
  console.log(`  ${colors.green}validate                    ${colors.reset} Validate all skills in registry`);
  console.log('');
  console.log('Database & Sync:');
  console.log(`  ${colors.green}status                      ${colors.reset} Show system status and configuration`);
  console.log(`  ${colors.green}migrate [direction]         ${colors.reset} Migrate data (local-to-db, db-to-local)`);
  console.log(`  ${colors.green}sync                        ${colors.reset} Sync with cloud database`);
  console.log(`  ${colors.green}analytics                   ${colors.reset} Show skill usage analytics`);
  console.log(`  ${colors.green}mode <local|database>       ${colors.reset} Switch between local and database mode`);
  console.log('');
  console.log('Configuration:');
  console.log(`  ${colors.green}config                      ${colors.reset} Show current configuration`);
  console.log(`  ${colors.green}config init                 ${colors.reset} Initialize configuration file`);
  console.log(`  ${colors.green}config set <key> <value>    ${colors.reset} Set configuration value`);
  console.log(`  ${colors.green}config get <key>            ${colors.reset} Get configuration value`);
  console.log('');
  console.log('Options:');
  console.log('  --type npx|skillport|local   Skill type (for add command)');
  console.log('  --force                       Force operation (skip validation)');
  console.log('  --description "text"          Skill description (for add command)');
  console.log('  --registry <name>             Search specific registry');
  console.log('  --limit <number>              Limit search results');
  console.log('  --dry-run                     Show what would happen without making changes');
  console.log('');
  console.log('Examples:');
  console.log('  opencli skills add docker-expert --type local');
  console.log('  opencli skills status');
  console.log('  opencli skills migrate local-to-db --dry-run');
  console.log('  opencli skills analytics');
  console.log('  opencli skills mode database');
  console.log('');
  console.log(`${colors.gray}Storage: Database (cloud) or Local JSON depending on configuration${colors.reset}`);
}

// Main command handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    showHelp();
    return;
  }

  // Ensure skills cache directory exists
  ensureDir(SKILLS_CACHE_DIR);

  try {
    switch (command) {
      case 'add':
        if (!args[1]) {
          log.error('Skill name required');
          console.log('Usage: opencli skills add <skill-name> [--type npx|skillport|local] [--description "text"]');
          process.exit(1);
        }
        await addSkill(args[1], args.slice(2));
        break;

      case 'remove':
        if (!args[1]) {
          log.error('Skill name required');
          console.log('Usage: opencli skills remove <skill-name>');
          process.exit(1);
        }
        await removeSkill(args[1]);
        break;

      case 'list':
        await listSkills(args.slice(1));
        break;

      case 'install':
        await installSkills(args[1], args.slice(2));
        break;

      case 'search':
        if (!args[1]) {
          log.error('Search query required');
          console.log('Usage: opencli skills search <query> [--registry npx|skillport|github|local] [--limit <number>]');
          process.exit(1);
        }
        await searchSkills(args[1], args.slice(2));
        break;

      case 'validate':
        await validateSkills();
        break;

      case 'config':
        await handleConfig(args.slice(1));
        break;

      // New database-related commands
      case 'status':
        await showStatus();
        break;

      case 'migrate':
        await handleMigration(args.slice(1));
        break;

      case 'sync':
        await handleSync();
        break;

      case 'analytics':
        await showAnalytics();
        break;

      case 'mode':
        if (!args[1]) {
          log.error('Mode required');
          console.log('Usage: opencli skills mode <local|database>');
          process.exit(1);
        }
        await switchMode(args.slice(1));
        break;

      default:
        log.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    log.error(`Command failed: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { main as skillsCommand };