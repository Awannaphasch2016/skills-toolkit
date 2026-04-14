/**
 * Direct Database Migration Runner
 * Handles running SQL migrations against PostgreSQL using direct connection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DirectMigrationRunner {
  constructor(directDatabaseClient) {
    this.db = directDatabaseClient;
    this.migrationsDir = path.join(__dirname, '..', 'migrations');
  }

  /**
   * Get all migration files in order
   */
  getMigrationFiles() {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    return fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Lexicographic sort works for 001_, 002_, etc.
  }

  /**
   * Get applied migrations from database
   */
  async getAppliedMigrations() {
    try {
      const result = await this.db.query('SELECT version FROM schema_migrations ORDER BY version');
      return result.map(row => row.version);
    } catch (error) {
      // If table doesn't exist yet, no migrations have been applied
      if (error.message.includes('relation "schema_migrations" does not exist')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Run a single migration file
   */
  async runMigration(migrationFile) {
    const migrationPath = path.join(this.migrationsDir, migrationFile);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Running migration: ${migrationFile}`);

    try {
      // Split SQL into individual statements
      const statements = this.splitSqlStatements(migrationSql);

      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          await this.db.query(statement);
        }
      }

      // Record migration as applied (if schema_migrations table exists)
      const version = migrationFile.replace('.sql', '');
      try {
        await this.db.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
      } catch (insertError) {
        // Table might not exist yet on first migration
        console.warn('Could not record migration (table might not exist yet):', insertError.message);
      }

      console.log(`Migration completed: ${migrationFile}`);
      return true;
    } catch (error) {
      console.error(`Migration failed: ${migrationFile}`, error);
      throw error;
    }
  }

  /**
   * Split SQL file into individual statements
   */
  splitSqlStatements(sql) {
    // Remove comments and split by semicolon
    const statements = [];
    let currentStatement = '';
    let inQuotes = false;
    let inDollarQuote = false;
    let dollarQuoteTag = '';

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];

      // Handle dollar quoting ($$, $tag$, etc.)
      if (char === '$' && !inQuotes) {
        const dollarStart = i;
        let j = i + 1;
        while (j < sql.length && sql[j] !== '$') j++;

        if (j < sql.length) {
          const tag = sql.substring(dollarStart, j + 1);
          if (inDollarQuote && tag === dollarQuoteTag) {
            inDollarQuote = false;
            dollarQuoteTag = '';
            currentStatement += tag;
            i = j;
            continue;
          } else if (!inDollarQuote) {
            inDollarQuote = true;
            dollarQuoteTag = tag;
            currentStatement += tag;
            i = j;
            continue;
          }
        }
      }

      // Handle regular quotes
      if (char === "'" && !inDollarQuote) {
        inQuotes = !inQuotes;
        currentStatement += char;
        continue;
      }

      // Handle statement termination
      if (char === ';' && !inQuotes && !inDollarQuote) {
        currentStatement += char;
        statements.push(currentStatement.trim());
        currentStatement = '';
        continue;
      }

      // Handle comments (only outside quotes)
      if (char === '-' && nextChar === '-' && !inQuotes && !inDollarQuote) {
        // Skip to end of line
        while (i < sql.length && sql[i] !== '\n') i++;
        continue;
      }

      currentStatement += char;
    }

    // Add final statement if it doesn't end with semicolon
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements.filter(stmt => stmt && !stmt.match(/^\s*$/));
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations() {
    const allMigrations = this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();

    const pendingMigrations = allMigrations.filter(
      migration => !appliedMigrations.includes(migration.replace('.sql', ''))
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return { applied: [], skipped: allMigrations.length };
    }

    console.log(`Found ${pendingMigrations.length} pending migrations`);

    const results = [];
    for (const migration of pendingMigrations) {
      try {
        await this.runMigration(migration);
        results.push({ migration, status: 'success' });
      } catch (error) {
        results.push({ migration, status: 'failed', error: error.message });
        // Stop on first failure
        break;
      }
    }

    return {
      applied: results.filter(r => r.status === 'success'),
      failed: results.filter(r => r.status === 'failed'),
      total: pendingMigrations.length
    };
  }

  /**
   * Initialize database (ensure tables exist for migrations)
   */
  async initializeDatabase() {
    try {
      // Ensure schema_migrations table exists
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      console.log('Database initialization complete');
      return true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if database is ready for migrations
   */
  async isDatabaseReady() {
    try {
      await this.db.testConnection();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default DirectMigrationRunner;