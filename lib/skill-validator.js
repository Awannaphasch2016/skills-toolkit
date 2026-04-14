/**
 * Skill Validator - Verify skills exist in their respective registries
 */

import { spawn } from 'child_process';

export class SkillValidator {
  constructor() {
    this.cache = new Map(); // Cache validation results
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Validate if a skill exists and is installable
   */
  async validateSkill(skill, type = 'npx') {
    const cacheKey = `${type}:${skill}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.result;
      }
    }

    let result;
    try {
      switch (type) {
        case 'npx':
          result = await this.validateNpxSkill(skill);
          break;
        case 'skillport':
          result = await this.validateSkillportSkill(skill);
          break;
        case 'github':
          result = await this.validateGithubSkill(skill);
          break;
        case 'local':
          result = { valid: true, message: 'Local skills are always valid' };
          break;
        default:
          result = { valid: false, message: `Unknown skill type: ${type}` };
      }
    } catch (error) {
      result = { valid: false, message: error.message };
    }

    // Cache result
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Validate NPX skill
   */
  async validateNpxSkill(skill) {
    try {
      // Try to get skill info without installing
      const output = await this.runCommand('npx', ['skill', skill, '--info'], { timeout: 30000 });

      if (output.includes('not found') || output.includes('error')) {
        return {
          valid: false,
          message: `NPX skill '${skill}' not found in registry`,
          details: output
        };
      }

      return {
        valid: true,
        message: `NPX skill '${skill}' is available`,
        details: output
      };
    } catch (error) {
      // If --info flag doesn't work, try a dry-run approach
      try {
        const listOutput = await this.runCommand('npx', ['skill', '--help'], { timeout: 10000 });

        // For now, assume skill is valid if npx skills command works
        // TODO: Implement better validation when API is available
        return {
          valid: true,
          message: `NPX skill '${skill}' assumed valid (npx available)`,
          warning: 'Could not verify skill existence - validation incomplete'
        };
      } catch (helpError) {
        return {
          valid: false,
          message: 'NPX skills command not available',
          details: helpError.message
        };
      }
    }
  }

  /**
   * Validate SkillPort skill
   */
  async validateSkillportSkill(skill) {
    try {
      // Check if skillport is available
      await this.runCommand('skillport', ['--version'], { timeout: 10000 });

      // Try to check if skill exists
      const parts = skill.split(' ');
      if (parts.length < 2) {
        return {
          valid: false,
          message: `SkillPort skill '${skill}' invalid format. Expected: 'owner/repo skillname'`
        };
      }

      const [repo, skillName] = parts;

      // For now, assume valid if skillport command works
      // TODO: Implement proper skill existence check
      return {
        valid: true,
        message: `SkillPort skill '${skill}' assumed valid`,
        warning: 'Could not verify skill existence - validation incomplete'
      };
    } catch (error) {
      return {
        valid: false,
        message: 'SkillPort command not available',
        details: error.message
      };
    }
  }

  /**
   * Validate GitHub skill
   */
  async validateGithubSkill(skill) {
    try {
      // Extract owner/repo from skill path
      const parts = skill.split('/');
      if (parts.length < 2) {
        return {
          valid: false,
          message: `GitHub skill '${skill}' invalid format. Expected: 'owner/repo' or 'owner/repo/path'`
        };
      }

      const [owner, repo] = parts;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

      // Check if repository exists
      const response = await fetch(apiUrl);

      if (!response.ok) {
        return {
          valid: false,
          message: `GitHub repository '${owner}/${repo}' not found or not accessible`,
          details: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const repoData = await response.json();

      return {
        valid: true,
        message: `GitHub repository '${owner}/${repo}' is accessible`,
        details: {
          description: repoData.description,
          stars: repoData.stargazers_count,
          language: repoData.language,
          updated: repoData.updated_at
        }
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate GitHub skill '${skill}'`,
        details: error.message
      };
    }
  }

  /**
   * Batch validate multiple skills
   */
  async validateSkills(skills) {
    const results = [];

    for (const skillInfo of skills) {
      const { skill, type } = skillInfo;
      const result = await this.validateSkill(skill, type);
      results.push({
        skill,
        type,
        ...result
      });
    }

    return results;
  }

  /**
   * Search for skills in registries
   */
  async searchSkills(query, registries = ['npx', 'skillport']) {
    const results = [];

    for (const registry of registries) {
      try {
        const searchResult = await this.searchInRegistry(query, registry);
        results.push(...searchResult);
      } catch (error) {
        console.warn(`Failed to search in ${registry} registry:`, error.message);
      }
    }

    return results;
  }

  /**
   * Search in specific registry
   */
  async searchInRegistry(query, registry) {
    switch (registry) {
      case 'npx':
        return this.searchNpxRegistry(query);
      case 'skillport':
        return this.searchSkillportRegistry(query);
      case 'github':
        return this.searchGithubRegistry(query);
      default:
        throw new Error(`Unknown registry: ${registry}`);
    }
  }

  async searchNpxRegistry(query) {
    try {
      // Use npx skill find command if available
      const output = await this.runCommand('npx', ['skill', 'find', query], { timeout: 30000 });

      // Parse output to extract skill names
      // TODO: Implement proper parsing based on actual npx skill find output format
      return [{
        skill: `search-result-${query}`,
        type: 'npx',
        description: 'Search result from NPX registry',
        source: 'npx-registry'
      }];
    } catch (error) {
      return [];
    }
  }

  async searchSkillportRegistry(query) {
    // TODO: Implement SkillPort search
    return [];
  }

  async searchGithubRegistry(query) {
    try {
      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query + ' agent skills')}`;
      const response = await fetch(searchUrl);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      return data.items.slice(0, 10).map(repo => ({
        skill: repo.full_name,
        type: 'github',
        description: repo.description,
        stars: repo.stargazers_count,
        source: 'github-search'
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Run command with timeout
   */
  runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const { timeout = 30000, silent = true } = options;

      const proc = spawn(command, args, {
        stdio: silent ? 'pipe' : 'inherit'
      });

      let stdout = '';
      let stderr = '';

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command '${command}' timed out after ${timeout}ms`));
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);

        if (code === 0) {
          resolve(stdout || stderr);
        } else {
          reject(new Error(`Command '${command}' failed with exit code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        valid: value.result.valid,
        age: Date.now() - value.timestamp
      }))
    };
  }
}

export default SkillValidator;