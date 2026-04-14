#!/usr/bin/env node

/**
 * Skills CLI launcher for OpenCLI integration
 * This launcher ensures compatibility with opencli's external CLI system
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the main skills CLI
const skillsCliPath = join(__dirname, 'bin', 'skills.mjs');

// Forward all arguments to the main CLI
const args = process.argv.slice(2);

// Spawn the main CLI process
const child = spawn('node', [skillsCliPath, ...args], {
  stdio: 'inherit',
  shell: false
});

// Handle process events
child.on('error', (error) => {
  console.error('Failed to start skills CLI:', error.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code);
});

// Handle termination signals
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});