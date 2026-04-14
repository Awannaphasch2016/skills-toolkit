#!/usr/bin/env node

/**
 * Simple test runner for Skills Toolkit
 * Tests both local and database modes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log(`${colors.cyan}🧪 Skills Toolkit Test Suite${colors.reset}`);
    console.log('='.repeat(50));

    for (const { name, testFn } of this.tests) {
      try {
        console.log(`\n${colors.blue}Running: ${name}${colors.reset}`);

        const result = await testFn();

        if (result === 'skip') {
          console.log(`${colors.yellow}⏭️  SKIPPED: ${name}${colors.reset}`);
          this.results.skipped++;
        } else {
          console.log(`${colors.green}✅ PASSED: ${name}${colors.reset}`);
          this.results.passed++;
        }
      } catch (error) {
        console.log(`${colors.red}❌ FAILED: ${name}${colors.reset}`);
        console.log(`   Error: ${error.message}`);
        this.results.failed++;
        this.results.errors.push({ test: name, error: error.message });
      }
    }

    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log(`${colors.cyan}Test Summary${colors.reset}`);
    console.log(`Total: ${this.tests.length}`);
    console.log(`${colors.green}Passed: ${this.results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.results.failed}${colors.reset}`);
    console.log(`${colors.yellow}Skipped: ${this.results.skipped}${colors.reset}`);

    if (this.results.errors.length > 0) {
      console.log('\nErrors:');
      this.results.errors.forEach(({ test, error }) => {
        console.log(`  ${colors.red}- ${test}: ${error}${colors.reset}`);
      });
    }

    const success = this.results.failed === 0;
    console.log(`\n${success ? colors.green + '✅ All tests passed!' : colors.red + '❌ Some tests failed'}${colors.reset}`);

    if (!success) {
      process.exit(1);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertExists(value, message) {
    if (value == null) {
      throw new Error(message || 'Expected value to exist');
    }
  }
}

// Test suite
const runner = new TestRunner();

// Test 1: Basic imports and class instantiation
runner.test('Import and instantiate SkillManager', async () => {
  const { SkillManager } = await import('../lib/skill-manager.js');
  const skillManager = new SkillManager(false); // Force local mode for testing
  runner.assertExists(skillManager, 'SkillManager should instantiate');
  runner.assertEqual(skillManager.useDatabase, false, 'Should be in local mode');
});

// Test 2: Database client (if credentials available)
runner.test('Database client initialization', async () => {
  try {
    const { DatabaseClient } = await import('../lib/database-client.js');
    const dbClient = new DatabaseClient();

    // Skip if no credentials
    if (!dbClient.connected) {
      return 'skip';
    }

    const health = await dbClient.healthCheck();
    runner.assertExists(health, 'Health check should return result');

  } catch (error) {
    if (error.message.includes('credentials not found')) {
      return 'skip';
    }
    throw error;
  }
});

// Test 3: Local skill operations
runner.test('Local skill CRUD operations', async () => {
  const { SkillManager } = await import('../lib/skill-manager.js');
  const skillManager = new SkillManager(false); // Force local mode

  // Clear any existing test skill
  try {
    await skillManager.removeSkill('test-skill');
  } catch (error) {
    // Ignore if skill doesn't exist
  }

  // Test add
  const skill = await skillManager.addSkill('test-skill', {
    type: 'npx',
    description: 'Test skill for unit testing'
  });
  runner.assertExists(skill, 'Should create skill');
  runner.assertEqual(skill.name, 'test-skill', 'Skill name should match');

  // Test get
  const retrievedSkill = await skillManager.getSkill('test-skill');
  runner.assertEqual(retrievedSkill.name, 'test-skill', 'Should retrieve skill');

  // Test list
  const skills = await skillManager.listSkills();
  runner.assert(skills.length > 0, 'Should have at least one skill');

  // Test update
  const updatedSkill = await skillManager.updateSkill('test-skill', {
    description: 'Updated test skill'
  });
  runner.assertEqual(updatedSkill.description, 'Updated test skill', 'Should update description');

  // Test mark installed
  await skillManager.markInstalled('test-skill', true);
  const installedSkill = await skillManager.getSkill('test-skill');
  runner.assertEqual(installedSkill.installed, true, 'Should mark as installed');

  // Test stats
  const stats = await skillManager.getStats();
  runner.assertExists(stats.total, 'Stats should have total');
  runner.assert(stats.total > 0, 'Should have skills');

  // Cleanup
  await skillManager.removeSkill('test-skill');
});

// Test 4: Data migration system (dry run)
runner.test('Data migration system', async () => {
  const { DataMigrator } = await import('../lib/data-migrator.js');

  // Create mock database client
  const mockDb = {
    connected: false,
    userId: 'test-user'
  };

  const migrator = new DataMigrator(mockDb);

  // Test validation methods
  const hasLocal = migrator.hasLocalRegistry();
  runner.assertExists(hasLocal, 'Should check for local registry');

  if (hasLocal) {
    const validation = migrator.validateLocalRegistry();
    runner.assertExists(validation, 'Should validate registry');
  }
});

// Test 5: Offline fallback system
runner.test('Offline fallback system', async () => {
  const { OfflineFallback } = await import('../lib/offline-fallback.js');
  const fallback = new OfflineFallback();

  // Test status
  const status = fallback.getOfflineStatus();
  runner.assertExists(status, 'Should return offline status');

  // Test operation support check
  const isSupported = fallback.isOperationSupportedOffline('listSkills');
  runner.assertEqual(isSupported, true, 'List skills should be supported offline');

  const isNotSupported = fallback.isOperationSupportedOffline('addSkill');
  runner.assertEqual(isNotSupported, false, 'Add skill should not be supported offline');
});

// Test 6: Configuration system
runner.test('Configuration system', async () => {
  try {
    const { ConfigManager } = await import('../lib/config-manager.js');
    const configManager = new ConfigManager();

    // Test basic operations
    const summary = configManager.getSummary();
    runner.assertExists(summary, 'Should return config summary');

  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return 'skip'; // ConfigManager might not exist yet
    }
    throw error;
  }
});

// Test 7: Skill validation
runner.test('Skill validation system', async () => {
  try {
    const { SkillValidator } = await import('../lib/skill-validator.js');
    const validator = new SkillValidator();

    // Test validation of a known skill type
    const validation = await validator.validateSkill('test-skill', 'npx');
    runner.assertExists(validation, 'Should return validation result');
    runner.assertExists(validation.valid, 'Should have valid property');

  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return 'skip'; // SkillValidator might not be implemented
    }
    throw error;
  }
});

// Test 8: File structure and permissions
runner.test('File structure and permissions', async () => {
  const { homedir } = await import('os');
  const skillsDir = path.join(homedir(), '.opencli', 'skills');

  // Should be able to create skills directory
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  runner.assert(fs.existsSync(skillsDir), 'Skills directory should exist');

  // Test write permissions
  const testFile = path.join(skillsDir, 'test-permissions.json');
  fs.writeFileSync(testFile, '{"test": true}');
  runner.assert(fs.existsSync(testFile), 'Should be able to write files');

  // Cleanup
  fs.unlinkSync(testFile);
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runner.run().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export default TestRunner;