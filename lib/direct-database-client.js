/**
 * Direct Database Client - PostgreSQL connection using database URL
 * Uses direct postgres connection instead of Supabase client
 */

import pkg from 'pg';
const { Pool } = pkg;
import { execSync } from 'child_process';
import { homedir } from 'os';
import crypto from 'crypto';

export class DirectDatabaseClient {
  constructor() {
    this.pool = null;
    this.userId = null;
    this.connected = false;

    this._initializeClient();
  }

  /**
   * Initialize PostgreSQL client with database URL from Doppler
   */
  _initializeClient() {
    try {
      // Get database URL from Doppler
      const databaseUrl = this._getDopplerDatabaseUrl();

      if (!databaseUrl) {
        // Fallback to environment variable
        const envUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
        if (!envUrl) {
          throw new Error('Database URL not found. Check Doppler configuration or environment variables.');
        }
        this._setupConnection(envUrl);
      } else {
        this._setupConnection(databaseUrl);
      }

      this.userId = this._getUserId();
      this.connected = true;
      console.log(`Direct database client initialized for user: ${this.userId}`);

    } catch (error) {
      console.warn(`Database initialization failed: ${error.message}`);
      this.connected = false;
    }
  }

  /**
   * Setup PostgreSQL connection pool
   */
  _setupConnection(databaseUrl) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: {
        rejectUnauthorized: false // Required for Supabase
      }
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Get database URL from Doppler
   */
  _getDopplerDatabaseUrl() {
    try {
      // Check if doppler is available
      execSync('which doppler', { stdio: 'pipe' });

      // Get database URL from Doppler
      const url = execSync(
        'doppler secrets get SUPABASE_DATABASE_URL --project knowledgebase --config dev --plain',
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();

      return url || null;
    } catch (error) {
      console.warn('Could not retrieve database URL from Doppler:', error.message);
      return null;
    }
  }

  /**
   * Generate or retrieve user ID
   */
  _getUserId() {
    // Try to get from Doppler first
    try {
      const result = execSync(
        'doppler secrets get USER_ID --project knowledgebase --config dev --plain',
        { encoding: 'utf8', stdio: 'pipe' }
      );
      if (result.trim()) {
        return result.trim();
      }
    } catch (error) {
      // Ignore error, will generate one
    }

    // Try environment variable
    if (process.env.USER_ID) {
      return process.env.USER_ID;
    }

    // Generate from system info
    const username = process.env.USER || process.env.USERNAME || 'unknown';
    const hostname = process.env.HOSTNAME || 'localhost';
    const homeDir = homedir();

    const userString = `${username}@${hostname}:${homeDir}`;
    const userId = crypto.createHash('sha256').update(userString).digest('hex').substring(0, 16);

    return `user_${userId}`;
  }

  /**
   * Test database connection
   */
  async testConnection() {
    if (!this.connected || !this.pool) {
      return { success: false, error: 'Pool not initialized' };
    }

    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT 1 as test');
      client.release();

      return {
        success: true,
        message: 'Connection successful',
        result: result.rows[0]
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a parameterized query
   */
  async query(text, params = []) {
    if (!this.connected || !this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const client = await this.pool.connect();

      try {
        const result = await client.query(text, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries) {
    if (!this.connected || !this.pool) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const results = [];
      for (const { text, params = [] } of queries) {
        const result = await client.query(text, params);
        results.push(result.rows);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Skills-specific query helpers
   */

  async getSkills(userId, filters = {}) {
    let query = 'SELECT * FROM skills WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (filters.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    if (filters.installed !== null && filters.installed !== undefined) {
      query += ` AND installed = $${paramIndex}`;
      params.push(filters.installed);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1})`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
      paramIndex += 2;
    }

    query += ' ORDER BY name';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    return await this.query(query, params);
  }

  async getSkill(userId, skillName) {
    const result = await this.query(
      'SELECT * FROM skills WHERE user_id = $1 AND name = $2',
      [userId, skillName]
    );

    if (result.length === 0) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    return result[0];
  }

  async createSkill(skillData) {
    const {
      name, type, description, user_id, installed = false,
      path, install_command, install_args, custom_install = false,
      metadata = {}, tags = [], version, source_url
    } = skillData;

    const result = await this.query(`
      INSERT INTO skills (
        name, type, description, user_id, installed, path,
        install_command, install_args, custom_install, metadata,
        tags, version, source_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name, type, description, user_id, installed, path,
      install_command, JSON.stringify(install_args), custom_install,
      JSON.stringify(metadata), tags, version, source_url
    ]);

    return result[0];
  }

  async updateSkill(userId, skillName, updates) {
    // Build dynamic UPDATE query
    const setClause = [];
    const params = [userId, skillName];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      if (['description', 'type', 'installed', 'metadata', 'tags', 'version', 'source_url'].includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        params.push(key === 'metadata' || key === 'install_args' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);

    const query = `
      UPDATE skills
      SET ${setClause.join(', ')}
      WHERE user_id = $1 AND name = $2
      RETURNING *
    `;

    const result = await this.query(query, params);

    if (result.length === 0) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    return result[0];
  }

  async deleteSkill(userId, skillName) {
    const result = await this.query(
      'DELETE FROM skills WHERE user_id = $1 AND name = $2 RETURNING name',
      [userId, skillName]
    );

    if (result.length === 0) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    return result[0];
  }

  async getSkillStats(userId) {
    const result = await this.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE installed = true) as installed,
        COUNT(*) FILTER (WHERE type = 'npx') as npx,
        COUNT(*) FILTER (WHERE type = 'skillport') as skillport,
        COUNT(*) FILTER (WHERE type = 'local') as local
      FROM skills
      WHERE user_id = $1
    `, [userId]);

    const stats = result[0];
    return {
      total: parseInt(stats.total),
      installed: parseInt(stats.installed),
      byType: {
        npx: parseInt(stats.npx),
        skillport: parseInt(stats.skillport),
        local: parseInt(stats.local)
      }
    };
  }

  async logInstallation(skillId, success, method = 'cli', errorMessage = null) {
    const logData = {
      skill_id: skillId,
      success,
      install_method: method,
      environment: JSON.stringify({
        node_version: process.version,
        platform: process.platform,
        user_id: this.userId
      })
    };

    let query = `
      INSERT INTO skill_installations (skill_id, success, install_method, environment
    `;
    let params = [skillId, success, method, logData.environment];

    if (!success && errorMessage) {
      query += ', error_message, uninstalled_at';
      params.push(errorMessage, new Date().toISOString());
    }

    query += ') VALUES ($1, $2, $3, $4';

    if (!success && errorMessage) {
      query += ', $5, $6';
    }

    query += ')';

    await this.query(query, params);
  }

  /**
   * Health check for the database connection
   */
  async healthCheck() {
    const connectionTest = await this.testConnection();

    return {
      connected: this.connected,
      userId: this.userId,
      connection: connectionTest,
      timestamp: new Date().toISOString(),
      type: 'direct_database'
    };
  }

  /**
   * Close database connection pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }
}

export default DirectDatabaseClient;