'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath, override = false) {
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && (override || process.env[match[1]] === undefined)) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // env files are optional
  }
}

function loadEnv() {
  const rootDir = path.join(__dirname, '..');
  loadEnvFile(path.join(rootDir, '.env'));
  loadEnvFile(path.join(rootDir, '.env.local'), true);
}

module.exports = { loadEnv };
