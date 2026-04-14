/**
 * Profile Manager - CRUD operations for skills profiles
 * Supports both file-based and database-backed storage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProfileManager {
  constructor(useDatabase = false) {
    this.useDatabase = useDatabase || process.env.USE_DATABASE === 'true';
    this.profilesDir = path.join(__dirname, '..', 'profiles');

    // Ensure profiles directory exists
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }
  }

  /**
   * Create a new skills profile
   */
  async createProfile(name, options = {}) {
    const {
      description = '',
      categories = [],
      phases = {}
    } = options;

    if (this.useDatabase) {
      return this.createProfileInDatabase(name, description, categories, phases);
    }

    return this.createProfileInFile(name, description, categories, phases);
  }

  /**
   * Add a skill to an existing profile
   */
  async addSkillToProfile(profileName, skill, options = {}) {
    const {
      type = 'npx', // 'npx', 'skillport', 'github'
      phase = null,
      description = ''
    } = options;

    if (this.useDatabase) {
      return this.addSkillToProfileInDatabase(profileName, skill, type, phase, description);
    }

    return this.addSkillToProfileInFile(profileName, skill, type, phase);
  }

  /**
   * Remove a skill from a profile
   */
  async removeSkillFromProfile(profileName, skill, phase = null) {
    if (this.useDatabase) {
      return this.removeSkillFromProfileInDatabase(profileName, skill, phase);
    }

    return this.removeSkillFromProfileInFile(profileName, skill, phase);
  }

  /**
   * List all available profiles
   */
  async listProfiles() {
    if (this.useDatabase) {
      return this.listProfilesFromDatabase();
    }

    return this.listProfilesFromFiles();
  }

  /**
   * Get profile details
   */
  async getProfile(profileName) {
    if (this.useDatabase) {
      return this.getProfileFromDatabase(profileName);
    }

    return this.getProfileFromFile(profileName);
  }

  /**
   * Update profile metadata
   */
  async updateProfile(profileName, updates) {
    if (this.useDatabase) {
      return this.updateProfileInDatabase(profileName, updates);
    }

    return this.updateProfileInFile(profileName, updates);
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileName) {
    if (this.useDatabase) {
      return this.deleteProfileFromDatabase(profileName);
    }

    return this.deleteProfileFromFile(profileName);
  }

  /**
   * Validate profile structure
   */
  validateProfile(profile) {
    const required = ['name', 'description', 'categories', 'all_skills'];

    for (const field of required) {
      if (!profile[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate skill arrays
    const skillTypes = ['npx-skills', 'skillport-skills', 'local-skills'];
    if (!profile.all_skills || typeof profile.all_skills !== 'object') {
      throw new Error('all_skills must be an object');
    }

    for (const type of skillTypes) {
      if (profile.all_skills[type] && !Array.isArray(profile.all_skills[type])) {
        throw new Error(`${type} must be an array`);
      }
    }

    return true;
  }

  // ================== FILE-BASED OPERATIONS ==================

  createProfileInFile(name, description, categories, phases) {
    const profilePath = path.join(this.profilesDir, `${name}.json`);

    if (fs.existsSync(profilePath)) {
      throw new Error(`Profile '${name}' already exists`);
    }

    const profile = {
      name,
      description,
      version: "1.0.0",
      categories: Array.isArray(categories) ? categories : [categories].filter(Boolean),
      purpose: description,
      phases: phases || {
        essential: {
          description: "Essential skills",
          "npx-skills": [],
          "skillport-skills": [],
          "local-skills": []
        }
      },
      all_skills: {
        "npx-skills": [],
        "skillport-skills": [],
        "local-skills": []
      },
      environment: {
        recommended: [],
        optional: []
      },
      workflow_examples: []
    };

    this.validateProfile(profile);
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

    return profile;
  }

  addSkillToProfileInFile(profileName, skill, type, phase) {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);

    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const skillKey = this.getSkillKey(type);

    // Add to all_skills
    if (!profile.all_skills[skillKey]) {
      profile.all_skills[skillKey] = [];
    }

    if (!profile.all_skills[skillKey].includes(skill)) {
      profile.all_skills[skillKey].push(skill);
    }

    // Add to specific phase if provided
    if (phase && profile.phases && profile.phases[phase]) {
      if (!profile.phases[phase][skillKey]) {
        profile.phases[phase][skillKey] = [];
      }

      if (!profile.phases[phase][skillKey].includes(skill)) {
        profile.phases[phase][skillKey].push(skill);
      }
    }

    this.validateProfile(profile);
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

    return profile;
  }

  removeSkillFromProfileInFile(profileName, skill, phase) {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);

    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    let removed = false;

    // Remove from all skill arrays
    for (const skillType of ['npx-skills', 'skillport-skills', 'local-skills']) {
      if (profile.all_skills[skillType]) {
        const index = profile.all_skills[skillType].indexOf(skill);
        if (index > -1) {
          profile.all_skills[skillType].splice(index, 1);
          removed = true;
        }
      }

      // Remove from phases
      if (profile.phases) {
        for (const phaseName in profile.phases) {
          if (phase && phaseName !== phase) continue;

          if (profile.phases[phaseName][skillType]) {
            const phaseIndex = profile.phases[phaseName][skillType].indexOf(skill);
            if (phaseIndex > -1) {
              profile.phases[phaseName][skillType].splice(phaseIndex, 1);
              removed = true;
            }
          }
        }
      }
    }

    if (!removed) {
      throw new Error(`Skill '${skill}' not found in profile '${profileName}'`);
    }

    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    return profile;
  }

  listProfilesFromFiles() {
    const files = fs.readdirSync(this.profilesDir).filter(file => file.endsWith('.json'));

    return files.map(file => {
      const profilePath = path.join(this.profilesDir, file);
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

      return {
        name: profile.name,
        description: profile.description,
        categories: profile.categories,
        skillCount: this.countSkills(profile)
      };
    });
  }

  getProfileFromFile(profileName) {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);

    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  }

  updateProfileInFile(profileName, updates) {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);

    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    // Update allowed fields
    const allowedUpdates = ['description', 'categories', 'purpose'];
    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        profile[field] = updates[field];
      }
    }

    this.validateProfile(profile);
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

    return profile;
  }

  deleteProfileFromFile(profileName) {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);

    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    fs.unlinkSync(profilePath);
    return { deleted: true, profileName };
  }

  // ================== DATABASE OPERATIONS (STUBS) ==================

  async createProfileInDatabase(name, description, categories, phases) {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  async addSkillToProfileInDatabase(profileName, skill, type, phase, description) {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  async removeSkillFromProfileInDatabase(profileName, skill, phase) {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  async listProfilesFromDatabase() {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  async getProfileFromDatabase(profileName) {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  async updateProfileInDatabase(profileName, updates) {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  async deleteProfileFromDatabase(profileName) {
    // TODO: Implement database operations
    throw new Error('Database operations not yet implemented');
  }

  // ================== HELPER METHODS ==================

  getSkillKey(type) {
    switch (type) {
      case 'npx': return 'npx-skills';
      case 'skillport': return 'skillport-skills';
      case 'local': return 'local-skills';
      case 'github': return 'npx-skills'; // GitHub repos usually work with npx skills
      default: return 'npx-skills';
    }
  }

  countSkills(profile) {
    let count = 0;
    if (profile.all_skills) {
      for (const skillType in profile.all_skills) {
        if (Array.isArray(profile.all_skills[skillType])) {
          count += profile.all_skills[skillType].length;
        }
      }
    }
    return count;
  }
}

export default ProfileManager;