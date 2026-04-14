/**
 * Skill Searcher - Discover skills across multiple registries and formats
 */

export class SkillSearcher {
  constructor() {
    this.registryApis = {
      github: 'https://api.github.com',
      npm: 'https://registry.npmjs.org',
      skillssh: 'https://skills.sh/api',
      agentskills: 'https://agentskills.so/api'
    };
  }

  /**
   * Search for skills across all registries
   */
  async searchAll(query, options = {}) {
    const {
      registries = ['github', 'npm', 'skillssh'],
      includeLocal = true,
      limit = 20
    } = options;

    const results = [];

    // Search each registry in parallel
    const searchPromises = registries.map(async (registry) => {
      try {
        const registryResults = await this.searchRegistry(query, registry, limit);
        return registryResults.map(result => ({ ...result, source: registry }));
      } catch (error) {
        console.warn(`Failed to search ${registry}:`, error.message);
        return [];
      }
    });

    // Include local skills if requested
    if (includeLocal) {
      searchPromises.push(this.searchLocalSkills(query));
    }

    const allResults = await Promise.all(searchPromises);

    // Flatten and deduplicate results
    return allResults
      .flat()
      .slice(0, limit)
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  }

  /**
   * Search specific registry
   */
  async searchRegistry(query, registry, limit = 20) {
    switch (registry) {
      case 'github':
        return this.searchGitHub(query, limit);
      case 'npm':
        return this.searchNpm(query, limit);
      case 'skillssh':
        return this.searchSkillsSh(query, limit);
      case 'agentskills':
        return this.searchAgentSkills(query, limit);
      default:
        throw new Error(`Unknown registry: ${registry}`);
    }
  }

  /**
   * Search GitHub for skills repositories
   */
  async searchGitHub(query, limit = 20) {
    try {
      const searchQuery = encodeURIComponent(`${query} skills agent ai tool`);
      const url = `${this.registryApis.github}/search/repositories?q=${searchQuery}&sort=stars&order=desc&per_page=${limit}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      return data.items.map(repo => ({
        name: repo.full_name,
        description: repo.description,
        type: 'github',
        url: repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language,
        topics: repo.topics || [],
        relevance: this.calculateRelevance(query, repo.name + ' ' + repo.description),
        installCommand: `skillport add ${repo.full_name}`,
        metadata: {
          owner: repo.owner.login,
          updated: repo.updated_at,
          size: repo.size,
          forks: repo.forks_count
        }
      }));
    } catch (error) {
      throw new Error(`GitHub search failed: ${error.message}`);
    }
  }

  /**
   * Search NPM for skill packages
   */
  async searchNpm(query, limit = 20) {
    try {
      const searchQuery = encodeURIComponent(`${query} skill agent ai`);
      const url = `https://registry.npmjs.org/-/v1/search?text=${searchQuery}&size=${limit}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`NPM API error: ${response.status}`);
      }

      const data = await response.json();

      return data.objects.map(pkg => ({
        name: pkg.package.name,
        description: pkg.package.description,
        type: 'npm',
        url: pkg.package.links?.homepage || `https://npmjs.com/package/${pkg.package.name}`,
        version: pkg.package.version,
        keywords: pkg.package.keywords || [],
        relevance: this.calculateRelevance(query, pkg.package.name + ' ' + pkg.package.description),
        installCommand: `npx ${pkg.package.name}`,
        metadata: {
          author: pkg.package.author?.name,
          updated: pkg.package.date,
          downloads: pkg.searchScore
        }
      }));
    } catch (error) {
      throw new Error(`NPM search failed: ${error.message}`);
    }
  }

  /**
   * Search skills.sh registry (stub - would need actual API)
   */
  async searchSkillsSh(query, limit = 20) {
    // This would need to be implemented based on skills.sh actual API
    // For now, return known Docker/K8s skills from our research
    const knownSkills = [
      {
        name: 'docker-compose-wizard',
        description: 'Interactive Docker Compose file generator',
        type: 'skillssh',
        url: 'https://skills.sh/docker-compose-wizard',
        relevance: this.calculateRelevance(query, 'docker compose'),
        installCommand: 'skills install docker-compose-wizard',
        metadata: { category: 'docker' }
      },
      {
        name: 'k8s-deployment-helper',
        description: 'Kubernetes deployment configuration assistant',
        type: 'skillssh',
        url: 'https://skills.sh/k8s-deployment-helper',
        relevance: this.calculateRelevance(query, 'kubernetes deployment'),
        installCommand: 'skills install k8s-deployment-helper',
        metadata: { category: 'kubernetes' }
      }
    ];

    return knownSkills.filter(skill =>
      skill.relevance > 0.3 ||
      skill.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, limit);
  }

  /**
   * Search agentskills.so registry (stub)
   */
  async searchAgentSkills(query, limit = 20) {
    // Placeholder for agentskills.so API integration
    return [];
  }

  /**
   * Search local skills directory
   */
  async searchLocalSkills(query) {
    try {
      const localSkillsPath = '/home/anak/dev/social-media-monitoring/.claude/skills';
      const fs = await import('fs');
      const path = await import('path');

      if (!fs.existsSync(localSkillsPath)) {
        return [];
      }

      const skillDirs = fs.readdirSync(localSkillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const localSkills = [];

      for (const skillName of skillDirs) {
        const skillPath = path.join(localSkillsPath, skillName);
        const readmePath = path.join(skillPath, 'README.md');

        let description = 'Local skill';
        if (fs.existsSync(readmePath)) {
          try {
            const readmeContent = fs.readFileSync(readmePath, 'utf8');
            // Extract first line after heading as description
            const lines = readmeContent.split('\n');
            description = lines.find(line => line.trim() && !line.startsWith('#')) || description;
          } catch (error) {
            // Ignore read errors
          }
        }

        const relevance = this.calculateRelevance(query, skillName + ' ' + description);

        if (relevance > 0.2) {
          localSkills.push({
            name: skillName,
            description,
            type: 'local',
            url: `file://${skillPath}`,
            relevance,
            installCommand: `# Already available locally at ${skillPath}`,
            metadata: {
              path: skillPath,
              hasReadme: fs.existsSync(readmePath)
            }
          });
        }
      }

      return localSkills;
    } catch (error) {
      console.warn('Failed to search local skills:', error.message);
      return [];
    }
  }

  /**
   * Calculate relevance score (0-1) based on query match
   */
  calculateRelevance(query, text) {
    if (!text || !query) return 0;

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match gets highest score
    if (textLower.includes(queryLower)) {
      return 1.0;
    }

    // Split query into words and check individual matches
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);

    let matches = 0;
    for (const queryWord of queryWords) {
      for (const textWord of textWords) {
        if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
          matches++;
          break;
        }
      }
    }

    return matches / queryWords.length;
  }

  /**
   * Get skills by category
   */
  async getSkillsByCategory(category, options = {}) {
    const categoryQueries = {
      docker: 'docker containerization dockerfile',
      kubernetes: 'kubernetes k8s deployment orchestration',
      microservices: 'microservices api gateway service mesh',
      devops: 'devops ci cd automation deployment',
      monitoring: 'monitoring observability logging metrics',
      database: 'database sql nosql migration'
    };

    const query = categoryQueries[category.toLowerCase()] || category;
    return this.searchAll(query, options);
  }

  /**
   * Suggest skills based on profile analysis
   */
  async suggestSkills(profile, options = {}) {
    const suggestions = [];

    // Analyze current skills to suggest complementary ones
    const currentSkills = profile.all_skills || {};
    const categories = profile.categories || [];

    // Suggest based on categories
    for (const category of categories) {
      const categorySkills = await this.getSkillsByCategory(category, { limit: 5 });
      suggestions.push(...categorySkills);
    }

    // Remove duplicates and already installed skills
    const allCurrentSkills = [
      ...(currentSkills['npx-skills'] || []),
      ...(currentSkills['skillport-skills'] || []),
      ...(currentSkills['local-skills'] || [])
    ];

    return suggestions
      .filter(skill => !allCurrentSkills.includes(skill.name))
      .slice(0, options.limit || 10);
  }

  /**
   * Compare skill across registries
   */
  async compareSkill(skillName) {
    const results = await this.searchAll(skillName, { limit: 50 });

    // Group by similar names
    const comparison = {
      exact_matches: results.filter(r => r.name.toLowerCase() === skillName.toLowerCase()),
      similar_matches: results.filter(r =>
        r.name.toLowerCase().includes(skillName.toLowerCase()) ||
        skillName.toLowerCase().includes(r.name.toLowerCase())
      ),
      related_skills: results.filter(r => r.relevance > 0.5)
    };

    return comparison;
  }
}

export default SkillSearcher;