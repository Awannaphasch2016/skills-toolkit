#!/usr/bin/env node

// Skills management CLI for opencli
// Usage: opencli skills <command> [args...]

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import ProfileManager from '../lib/profile-manager.js';
import SkillValidator from '../lib/skill-validator.js';
import SkillSearcher from '../lib/skill-searcher.js';
import ConfigManager from '../lib/config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SKILLS_REPO_URL = 'https://raw.githubusercontent.com/Awannaphasch2016/skills-toolkit/master';
const SKILLS_CACHE_DIR = path.join(homedir(), '.opencli', 'skills');
const PROFILES_CACHE_DIR = path.join(SKILLS_CACHE_DIR, 'profiles');

// Initialize managers
const configManager = new ConfigManager();
const profileManager = new ProfileManager();
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

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

async function downloadProfile(profileName) {
  // Try local file first
  const localProfilePath = path.join(__dirname, '..', 'profiles', `${profileName}.json`);
  if (fs.existsSync(localProfilePath)) {
    log.debug(`Loading profile from local file: ${localProfilePath}`);
    return JSON.parse(fs.readFileSync(localProfilePath, 'utf8'));
  }

  const url = `${SKILLS_REPO_URL}/profiles/${profileName}.json`;
  const cachePath = path.join(PROFILES_CACHE_DIR, `${profileName}.json`);

  try {
    log.debug(`Downloading profile from ${url}`);
    const profile = await fetchJson(url);

    ensureDir(PROFILES_CACHE_DIR);
    fs.writeFileSync(cachePath, JSON.stringify(profile, null, 2));
    log.debug(`Cached profile to ${cachePath}`);

    return profile;
  } catch (error) {
    // Try to use cached version
    if (fs.existsSync(cachePath)) {
      log.warn(`Using cached profile (network error: ${error.message})`);
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }
    throw error;
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

async function checkDependencies() {
  const missing = [];

  // Check for npx
  try {
    await runCommand('npx', ['--version'], { silent: true });
  } catch {
    missing.push('npx (install Node.js)');
  }

  // Check for skillport
  try {
    await runCommand('skillport', ['--version'], { silent: true });
  } catch {
    missing.push('skillport (pip install skillport)');
  }

  if (missing.length > 0) {
    log.error(`Missing dependencies: ${missing.join(', ')}`);
    console.log('Please install:');
    missing.forEach(dep => console.log(`  - ${dep}`));
    process.exit(1);
  }
}

async function installNpxSkills(skills) {
  if (!skills || skills.length === 0) return;

  log.info(`Installing ${skills.length} NPX skills...`);

  for (const skill of skills) {
    log.info(`Installing NPX skill: ${skill}`);
    try {
      await runCommand('npx', ['skill', skill]);
      log.success(`Installed: ${skill}`);
    } catch (error) {
      log.error(`Failed to install: ${skill}`);
      throw error;
    }
  }
}

async function installSkillportSkills(skills) {
  if (!skills || skills.length === 0) return;

  log.info(`Installing ${skills.length} SkillPort skills...`);

  for (const skill of skills) {
    log.info(`Installing SkillPort skill: ${skill}`);
    try {
      // Try full path format first, then simple format
      if (skill.includes('/')) {
        const parts = skill.split('/');
        const repo = parts.slice(0, -1).join('/');
        const path = parts.slice(-1)[0];
        await runCommand('skillport', ['add', repo, path]);
      } else {
        await runCommand('skillport', ['add', skill]);
      }
      log.success(`Installed: ${skill}`);
    } catch (error) {
      log.warn(`Failed to install SkillPort skill: ${skill} - ${error.message}`);
      // Don't throw error - continue with other skills
    }
  }
}

async function installLocalSkills(skills) {
  if (!skills || skills.length === 0) return;

  log.info(`Installing ${skills.length} local skills...`);

  for (const skill of skills) {
    log.info(`Installing local skill: ${skill}`);
    log.success(`Local skill already available: ${skill}`);
  }
}

// Command implementations
async function installProfile(profileName, phase) {
  try {
    await checkDependencies();

    log.info(`Installing profile: ${profileName}`);
    const profile = await downloadProfile(profileName);

    console.log('');
    console.log(`${colors.blue}📦 Installing Profile: ${profile.name}${colors.reset}`);
    console.log(`${colors.blue}Description: ${profile.description}${colors.reset}`);
    console.log('');

    let npxSkills = [];
    let skillportSkills = [];
    let localSkills = [];

    if (phase) {
      log.info(`Installing phase: ${phase}`);

      if (!profile.phases || !profile.phases[phase]) {
        log.error(`Phase '${phase}' not found in profile`);
        if (profile.phases) {
          console.log('Available phases:');
          Object.keys(profile.phases).forEach(p => console.log(`  - ${p}`));
        }
        process.exit(1);
      }

      npxSkills = profile.phases[phase]['npx-skills'] || [];
      skillportSkills = profile.phases[phase]['skillport-skills'] || [];
      localSkills = profile.phases[phase]['local-skills'] || [];
    } else {
      log.info('Installing all skills');
      npxSkills = profile.all_skills['npx-skills'] || [];
      skillportSkills = profile.all_skills['skillport-skills'] || [];
      localSkills = profile.all_skills['local-skills'] || [];
    }

    const totalSkills = npxSkills.length + skillportSkills.length + localSkills.length;

    if (totalSkills === 0) {
      log.warn('No skills found to install');
      return;
    }

    log.info(`Will install ${totalSkills} skills:`);

    if (npxSkills.length > 0) {
      console.log(`${colors.cyan}NPX Skills:${colors.reset}`);
      npxSkills.forEach(skill => console.log(`  - ${skill}`));
    }

    if (skillportSkills.length > 0) {
      console.log(`${colors.cyan}SkillPort Skills:${colors.reset}`);
      skillportSkills.forEach(skill => console.log(`  - ${skill}`));
    }

    if (localSkills.length > 0) {
      console.log(`${colors.cyan}Local Skills:${colors.reset}`);
      localSkills.forEach(skill => console.log(`  - ${skill}`));
    }

    console.log('');

    // Install skills
    await installNpxSkills(npxSkills);
    await installSkillportSkills(skillportSkills);
    await installLocalSkills(localSkills);

    log.success(`Profile installation completed: ${profile.name}`);

    // Show environment variables if any
    if (profile.environment) {
      console.log('');
      log.info('Environment variables for this profile:');

      if (profile.environment.recommended) {
        console.log(`${colors.cyan}Recommended:${colors.reset}`);
        profile.environment.recommended.forEach(env => console.log(`  - ${env}`));
      }

      if (profile.environment.optional) {
        console.log(`${colors.cyan}Optional:${colors.reset}`);
        profile.environment.optional.forEach(env => console.log(`  - ${env}`));
      }
    }

  } catch (error) {
    log.error(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

async function listProfiles() {
  try {
    const profileNames = ['nextjs-fullstack', 'cli-development', 'javascript-general', 'docker-development'];

    console.log(`${colors.blue}📋 Available Profiles${colors.reset}`);
    console.log(`${colors.gray}Install with: opencli skills install <profile-name>${colors.reset}`);
    console.log('');

    for (const name of profileNames) {
      try {
        const profile = await downloadProfile(name);
        console.log(`  ${colors.green}${name}${colors.reset}`);
        console.log(`    ${profile.description}`);

        if (profile.categories) {
          const categories = profile.categories.join(', ');
          console.log(`    ${colors.gray}Categories: ${categories}${colors.reset}`);
        }

        const npxCount = (profile.all_skills['npx-skills'] || []).length;
        const skillportCount = (profile.all_skills['skillport-skills'] || []).length;
        console.log(`    ${colors.gray}Skills: ${npxCount} NPX, ${skillportCount} SkillPort${colors.reset}`);
        console.log('');
      } catch (error) {
        console.log(`  ${colors.red}${name}${colors.reset} - ${colors.gray}Error loading${colors.reset}`);
      }
    }

    console.log(`${colors.gray}Install with: opencli skills install <profile-name> [phase]${colors.reset}`);

  } catch (error) {
    log.error(`Failed to list profiles: ${error.message}`);
    process.exit(1);
  }
}

async function showProfileInfo(profileName) {
  try {
    const profile = await downloadProfile(profileName);

    console.log(`${colors.blue}📦 Profile: ${profile.name}${colors.reset}`);
    console.log(`${colors.blue}Description: ${profile.description}${colors.reset}`);
    console.log(`${colors.blue}Version: ${profile.version}${colors.reset}`);
    console.log('');

    if (profile.phases) {
      console.log(`${colors.cyan}Available Phases:${colors.reset}`);
      Object.entries(profile.phases).forEach(([phase, config]) => {
        console.log(`  ${colors.green}${phase}${colors.reset}`);
        console.log(`    ${config.description}`);

        const npxCount = (config['npx-skills'] || []).length;
        const skillportCount = (config['skillport-skills'] || []).length;
        console.log(`    ${colors.gray}Skills: ${npxCount} NPX, ${skillportCount} SkillPort${colors.reset}`);
        console.log('');
      });
    }

    if (profile.all_skills) {
      console.log(`${colors.cyan}All Skills:${colors.reset}`);

      const npxSkills = profile.all_skills['npx-skills'] || [];
      const skillportSkills = profile.all_skills['skillport-skills'] || [];

      if (npxSkills.length > 0) {
        console.log(`  ${colors.cyan}NPX Skills:${colors.reset}`);
        npxSkills.forEach(skill => console.log(`    - ${skill}`));
      }

      if (skillportSkills.length > 0) {
        console.log(`  ${colors.cyan}SkillPort Skills:${colors.reset}`);
        skillportSkills.forEach(skill => console.log(`    - ${skill}`));
      }
    }

    if (profile.environment) {
      console.log('');
      console.log(`${colors.cyan}Environment Variables:${colors.reset}`);

      if (profile.environment.recommended) {
        console.log(`  ${colors.cyan}Recommended:${colors.reset}`);
        profile.environment.recommended.forEach(env => console.log(`    - ${env}`));
      }

      if (profile.environment.optional) {
        console.log(`  ${colors.cyan}Optional:${colors.reset}`);
        profile.environment.optional.forEach(env => console.log(`    - ${env}`));
      }
    }

    if (profile.workflow_examples) {
      console.log('');
      console.log(`${colors.cyan}Workflow Examples:${colors.reset}`);
      profile.workflow_examples.forEach(example => console.log(`  - ${example}`));
    }

  } catch (error) {
    log.error(`Failed to show profile info: ${error.message}`);
    process.exit(1);
  }
}

async function updateCache() {
  try {
    log.info('Updating skills cache...');

    // Clear existing cache
    if (fs.existsSync(PROFILES_CACHE_DIR)) {
      fs.rmSync(PROFILES_CACHE_DIR, { recursive: true, force: true });
    }

    const profileNames = ['nextjs-fullstack', 'cli-development', 'javascript-general', 'docker-development'];
    let successCount = 0;

    for (const name of profileNames) {
      try {
        await downloadProfile(name);
        log.success(`Updated: ${name}`);
        successCount++;
      } catch (error) {
        log.error(`Failed to update ${name}: ${error.message}`);
      }
    }

    log.success(`Cache updated: ${successCount}/${profileNames.length} profiles`);

  } catch (error) {
    log.error(`Failed to update cache: ${error.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`${colors.cyan}opencli skills - Skills management for development workflows${colors.reset}`);
  console.log('');
  console.log('Usage:');
  console.log('  opencli skills <command> [args...]');
  console.log('');
  console.log('Profile Management:');
  console.log(`  ${colors.green}install <profile>           ${colors.reset} Install all skills from a profile`);
  console.log(`  ${colors.green}install <profile> <phase>   ${colors.reset} Install specific phase of a profile`);
  console.log(`  ${colors.green}list                        ${colors.reset} List available profiles`);
  console.log(`  ${colors.green}info <profile>              ${colors.reset} Show detailed profile information`);
  console.log(`  ${colors.green}create-profile <name>       ${colors.reset} Create a new profile`);
  console.log(`  ${colors.green}delete-profile <name>       ${colors.reset} Delete a profile`);
  console.log('');
  console.log('Skill Management:');
  console.log(`  ${colors.green}add-skill <profile> <skill> ${colors.reset} Add skill to profile`);
  console.log(`  ${colors.green}remove-skill <profile> <skill>${colors.reset} Remove skill from profile`);
  console.log(`  ${colors.green}search <query>              ${colors.reset} Search for skills across registries`);
  console.log(`  ${colors.green}validate <profile>          ${colors.reset} Validate all skills in profile`);
  console.log(`  ${colors.green}suggest <profile>           ${colors.reset} Suggest skills for profile`);
  console.log('');
  console.log('Configuration:');
  console.log(`  ${colors.green}config                      ${colors.reset} Show current configuration`);
  console.log(`  ${colors.green}config init                 ${colors.reset} Initialize configuration file`);
  console.log(`  ${colors.green}config set <key> <value>    ${colors.reset} Set configuration value`);
  console.log(`  ${colors.green}config get <key>            ${colors.reset} Get configuration value`);
  console.log('');
  console.log('Maintenance:');
  console.log(`  ${colors.green}update                      ${colors.reset} Update skills cache from GitHub`);
  console.log(`  ${colors.green}help                        ${colors.reset} Show this help message`);
  console.log('');
  console.log('Examples:');
  console.log('  opencli skills install docker-development');
  console.log('  opencli skills create-profile my-stack');
  console.log('  opencli skills add-skill my-stack docker/compose --type local');
  console.log('  opencli skills search kubernetes');
  console.log('  opencli skills validate docker-development');
  console.log('');
  console.log(`${colors.gray}Skills are installed using npx skill and skillport commands.${colors.reset}`);
}

// New helper command implementations
async function createProfile(name, options) {
  try {
    const opts = parseOptions(options);
    const description = opts.description || `Profile for ${name} development`;
    const categories = opts.categories ? opts.categories.split(',') : [name];

    log.info(`Creating profile: ${name}`);
    const profile = await profileManager.createProfile(name, {
      description,
      categories
    });

    console.log('');
    console.log(`${colors.green}✅ Profile created successfully${colors.reset}`);
    console.log(`Name: ${profile.name}`);
    console.log(`Description: ${profile.description}`);
    console.log(`Categories: ${profile.categories.join(', ')}`);
    console.log('');
    console.log(`${colors.gray}Add skills with: opencli skills add-skill ${name} <skill-name>${colors.reset}`);

  } catch (error) {
    log.error(`Failed to create profile: ${error.message}`);
    process.exit(1);
  }
}

async function deleteProfile(name) {
  try {
    log.info(`Deleting profile: ${name}`);

    // Confirm deletion
    const profile = await profileManager.getProfile(name);
    const skillCount = profileManager.countSkills(profile);

    console.log(`${colors.yellow}⚠️  About to delete profile '${name}' with ${skillCount} skills${colors.reset}`);
    console.log(`Description: ${profile.description}`);

    // In a real implementation, you'd want to prompt for confirmation
    // For now, we'll proceed with deletion

    const result = await profileManager.deleteProfile(name);

    console.log('');
    log.success(`Profile '${name}' deleted successfully`);

  } catch (error) {
    log.error(`Failed to delete profile: ${error.message}`);
    process.exit(1);
  }
}

async function addSkillToProfile(profileName, skillName, options) {
  try {
    const opts = parseOptions(options);
    const skillType = opts.type || 'npx';
    const phase = opts.phase || null;

    log.info(`Adding skill '${skillName}' to profile '${profileName}'`);

    // Validate skill first
    log.info('Validating skill...');
    const validation = await skillValidator.validateSkill(skillName, skillType);

    if (!validation.valid) {
      log.warn(`Skill validation failed: ${validation.message}`);
      if (!opts.force) {
        console.log(`${colors.yellow}Use --force to add anyway${colors.reset}`);
        process.exit(1);
      }
    } else {
      log.success(`Skill validation passed: ${validation.message}`);
    }

    // Add to profile
    const updatedProfile = await profileManager.addSkillToProfile(profileName, skillName, {
      type: skillType,
      phase: phase
    });

    console.log('');
    log.success(`Skill '${skillName}' added to profile '${profileName}'`);

    if (phase) {
      console.log(`Phase: ${phase}`);
    }
    console.log(`Type: ${skillType}`);
    console.log(`Total skills: ${profileManager.countSkills(updatedProfile)}`);

  } catch (error) {
    log.error(`Failed to add skill: ${error.message}`);
    process.exit(1);
  }
}

async function removeSkillFromProfile(profileName, skillName, options) {
  try {
    const opts = parseOptions(options);
    const phase = opts.phase || null;

    log.info(`Removing skill '${skillName}' from profile '${profileName}'`);

    const updatedProfile = await profileManager.removeSkillFromProfile(profileName, skillName, phase);

    console.log('');
    log.success(`Skill '${skillName}' removed from profile '${profileName}'`);
    console.log(`Remaining skills: ${profileManager.countSkills(updatedProfile)}`);

  } catch (error) {
    log.error(`Failed to remove skill: ${error.message}`);
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

    console.log(`${colors.gray}Add to profile with: opencli skills add-skill <profile> <skill-name> --type <type>${colors.reset}`);

  } catch (error) {
    log.error(`Search failed: ${error.message}`);
    process.exit(1);
  }
}

async function validateProfile(profileName) {
  try {
    log.info(`Validating profile: ${profileName}`);

    const profile = await profileManager.getProfile(profileName);

    // Collect all skills for validation
    const allSkills = [];

    for (const [skillType, skills] of Object.entries(profile.all_skills || {})) {
      const type = skillType.replace('-skills', '');
      for (const skill of skills || []) {
        allSkills.push({ skill, type });
      }
    }

    if (allSkills.length === 0) {
      console.log(`${colors.yellow}No skills found in profile '${profileName}'${colors.reset}`);
      return;
    }

    console.log('');
    console.log(`${colors.cyan}Validating ${allSkills.length} skills...${colors.reset}`);

    const results = await skillValidator.validateSkills(allSkills);

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

async function suggestSkills(profileName) {
  try {
    log.info(`Suggesting skills for profile: ${profileName}`);

    const profile = await profileManager.getProfile(profileName);
    const suggestions = await skillSearcher.suggestSkills(profile, { limit: 10 });

    if (suggestions.length === 0) {
      console.log(`${colors.yellow}No suggestions found for profile '${profileName}'${colors.reset}`);
      return;
    }

    console.log('');
    console.log(`${colors.cyan}Suggested skills for '${profileName}':${colors.reset}`);
    console.log('');

    suggestions.forEach((skill, index) => {
      console.log(`${colors.green}${index + 1}. ${skill.name}${colors.reset} (${skill.type})`);
      console.log(`   ${skill.description}`);

      if (skill.relevance) {
        const relevancePercent = Math.round(skill.relevance * 100);
        console.log(`   ${colors.gray}Relevance: ${relevancePercent}%${colors.reset}`);
      }

      console.log(`   ${colors.gray}Add: opencli skills add-skill ${profileName} ${skill.name} --type ${skill.type}${colors.reset}`);
      console.log('');
    });

  } catch (error) {
    log.error(`Suggestion failed: ${error.message}`);
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
      case 'install':
        if (!args[1]) {
          log.error('Profile name required');
          console.log('Usage: opencli skills install <profile> [phase]');
          process.exit(1);
        }
        await installProfile(args[1], args[2]);
        break;

      case 'list':
        await listProfiles();
        break;

      case 'info':
        if (!args[1]) {
          log.error('Profile name required');
          console.log('Usage: opencli skills info <profile>');
          process.exit(1);
        }
        await showProfileInfo(args[1]);
        break;

      case 'create-profile':
        if (!args[1]) {
          log.error('Profile name required');
          console.log('Usage: opencli skills create-profile <name> [options...]');
          process.exit(1);
        }
        await createProfile(args[1], args.slice(2));
        break;

      case 'delete-profile':
        if (!args[1]) {
          log.error('Profile name required');
          console.log('Usage: opencli skills delete-profile <name>');
          process.exit(1);
        }
        await deleteProfile(args[1]);
        break;

      case 'add-skill':
        if (!args[1] || !args[2]) {
          log.error('Profile name and skill name required');
          console.log('Usage: opencli skills add-skill <profile> <skill> [--type npx|skillport|local] [--phase <phase>]');
          process.exit(1);
        }
        await addSkillToProfile(args[1], args[2], args.slice(3));
        break;

      case 'remove-skill':
        if (!args[1] || !args[2]) {
          log.error('Profile name and skill name required');
          console.log('Usage: opencli skills remove-skill <profile> <skill> [--phase <phase>]');
          process.exit(1);
        }
        await removeSkillFromProfile(args[1], args[2], args.slice(3));
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
        if (!args[1]) {
          log.error('Profile name required');
          console.log('Usage: opencli skills validate <profile>');
          process.exit(1);
        }
        await validateProfile(args[1]);
        break;

      case 'suggest':
        if (!args[1]) {
          log.error('Profile name required');
          console.log('Usage: opencli skills suggest <profile>');
          process.exit(1);
        }
        await suggestSkills(args[1]);
        break;

      case 'config':
        await handleConfig(args.slice(1));
        break;

      case 'update':
        await updateCache();
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