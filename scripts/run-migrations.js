#!/usr/bin/env node

/**
 * Run database migrations for Skills Toolkit
 * Sets up the schema in the Supabase database
 */

import DirectDatabaseClient from '../lib/direct-database-client.js';
import DirectMigrationRunner from '../lib/direct-migration-runner.js';

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

async function runMigrations() {
  console.log(`${colors.cyan}🗃️  Skills Toolkit Database Migration${colors.reset}`);
  console.log('='.repeat(50));

  try {
    // Initialize database client
    console.log('Connecting to database...');
    const db = new DirectDatabaseClient();

    if (!db.connected) {
      throw new Error('Failed to connect to database. Check credentials.');
    }

    console.log(`${colors.green}✅ Database connected${colors.reset}`);
    console.log(`User ID: ${db.userId}`);

    // Test connection
    const health = await db.healthCheck();
    if (!health.connection.success) {
      throw new Error('Database health check failed');
    }

    console.log(`${colors.green}✅ Database health check passed${colors.reset}`);

    // Initialize migration runner
    const migrationRunner = new DirectMigrationRunner(db);

    // Initialize database (create migration table)
    console.log('');
    console.log('Initializing migration system...');
    await migrationRunner.initializeDatabase();

    // Check for pending migrations
    const pendingMigrations = migrationRunner.getMigrationFiles();
    const appliedMigrations = await migrationRunner.getAppliedMigrations();

    console.log('');
    console.log('Migration Status:');
    console.log(`Available migrations: ${pendingMigrations.length}`);
    console.log(`Applied migrations: ${appliedMigrations.length}`);

    if (appliedMigrations.length > 0) {
      console.log('Applied:');
      appliedMigrations.forEach(migration => {
        console.log(`  ✅ ${migration}`);
      });
    }

    // Run pending migrations
    console.log('');
    console.log('Running pending migrations...');
    const results = await migrationRunner.runPendingMigrations();

    if (results.applied.length > 0) {
      console.log(`${colors.green}✅ Successfully applied ${results.applied.length} migrations${colors.reset}`);
      results.applied.forEach(result => {
        console.log(`  ✅ ${result.migration}`);
      });
    }

    if (results.failed.length > 0) {
      console.log(`${colors.red}❌ Failed to apply ${results.failed.length} migrations${colors.reset}`);
      results.failed.forEach(result => {
        console.log(`  ❌ ${result.migration}: ${result.error}`);
      });
    }

    // Verify schema
    console.log('');
    console.log('Verifying schema...');

    try {
      await db.query('SELECT COUNT(*) FROM skills WHERE user_id = $1', [db.userId]);
      console.log(`${colors.green}✅ Skills table verified${colors.reset}`);
    } catch (error) {
      console.log(`${colors.red}❌ Skills table verification failed: ${error.message}${colors.reset}`);
    }

    try {
      await db.query('SELECT COUNT(*) FROM skill_installations');
      console.log(`${colors.green}✅ Skill installations table verified${colors.reset}`);
    } catch (error) {
      console.log(`${colors.red}❌ Skill installations table verification failed: ${error.message}${colors.reset}`);
    }

    console.log('');
    console.log(`${colors.green}🎉 Database migration completed successfully!${colors.reset}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Test with: npm run skills:status');
    console.log('2. Migrate existing skills: npm run skills:migrate local-to-db');

    // Close database connection
    await db.close();

  } catch (error) {
    console.error(`${colors.red}❌ Migration failed: ${error.message}${colors.reset}`);

    if (error.message.includes('credentials')) {
      console.log('');
      console.log('Setup help:');
      console.log('1. Ensure Doppler is configured: doppler setup --project knowledgebase --config dev');
      console.log('2. Check credentials: doppler secrets --project knowledgebase --config dev');
    }

    process.exit(1);
  }
}

// Run migrations if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export default runMigrations;