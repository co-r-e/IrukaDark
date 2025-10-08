#!/usr/bin/env node

/**
 * Build the Swift automation bridge binary for macOS.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  console.log('Skipping Swift bridge build: supported only on macOS.');
  process.exit(0);
}

const packageDir = path.resolve(__dirname, '../native/macos/IrukaAutomation');
const distDir = path.join(packageDir, 'dist');
const buildDir = path.join(packageDir, '.build');
const cacheDir = path.join(packageDir, '.cache', 'clang');
const sharedCacheDir = path.join(packageDir, '.swift-cache');
const configDir = path.join(packageDir, '.swift-config');
const securityDir = path.join(packageDir, '.swift-security');
const releaseBinary = path.join(buildDir, 'release', 'IrukaAutomation');
const outputBinary = path.join(distDir, 'IrukaAutomation');

const ensureDirs = [distDir, buildDir, cacheDir, sharedCacheDir, configDir, securityDir];
for (const dir of ensureDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

const env = {
  ...process.env,
  CLANG_MODULE_CACHE_PATH: cacheDir,
};

const args = [
  'build',
  '-c',
  'release',
  '--disable-sandbox',
  '--cache-path',
  path.join(packageDir, '.swift-cache'),
  '--config-path',
  path.join(packageDir, '.swift-config'),
  '--security-path',
  path.join(packageDir, '.swift-security'),
  '--scratch-path',
  buildDir,
];

console.log('Building Swift automation bridge...');
const result = spawnSync('swift', args, {
  cwd: packageDir,
  env,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('Swift bridge build failed.');
  process.exit(result.status || 1);
}

if (!fs.existsSync(releaseBinary)) {
  console.error(`Swift bridge binary not found at ${releaseBinary}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(releaseBinary, outputBinary);
fs.chmodSync(outputBinary, 0o755);

console.log(`Swift bridge binary ready at ${outputBinary}`);
