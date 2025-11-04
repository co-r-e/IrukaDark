#!/usr/bin/env node

/**
 * Build the Swift automation bridge binary for macOS.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageDir = path.resolve(__dirname, '../native/macos/IrukaAutomation');
const distDir = path.join(packageDir, 'dist');
const buildDir = path.join(packageDir, '.build');
const cacheDir = path.join(packageDir, '.cache', 'clang');
const sharedCacheDir = path.join(packageDir, '.swift-cache');
const configDir = path.join(packageDir, '.swift-config');
const securityDir = path.join(packageDir, '.swift-security');
const outputBinary = path.join(distDir, 'IrukaAutomation');

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(sharedCacheDir, { recursive: true });
fs.mkdirSync(configDir, { recursive: true });
fs.mkdirSync(securityDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

const env = {
  ...process.env,
  CLANG_MODULE_CACHE_PATH: cacheDir,
};

function normalizeArch(value) {
  if (!value) return null;
  const token = String(value).trim().toLowerCase();
  if (!token) return null;
  if (token === 'universal' || token === 'fat' || token === 'both') {
    return ['arm64', 'x86_64'];
  }
  if (token.includes(',')) {
    const pieces = token
      .split(',')
      .map((part) => normalizeArch(part))
      .flat()
      .filter(Boolean);
    if (pieces.length > 0) return Array.from(new Set(pieces));
    return null;
  }
  if (token === 'arm64' || token === 'aarch64') return ['arm64'];
  if (token === 'x64' || token === 'x86_64' || token === 'amd64') return ['x86_64'];
  return null;
}

const explicitArchsRaw =
  normalizeArch(process.env.IRUKA_AUTOMATION_ARCHS) ||
  normalizeArch(process.env.IRUKA_AUTOMATION_ARCH);
const npmArch =
  normalizeArch(process.env.npm_config_arch) ||
  normalizeArch(process.env.npm_config_target_arch) ||
  normalizeArch(process.env.ELECTRON_BUILDER_ARCH);
const hostArch = normalizeArch(process.env.IRUKA_AUTOMATION_HOST_ARCH || process.arch) || [];

let requestedArchs = explicitArchsRaw || npmArch;
if (!requestedArchs || requestedArchs.length === 0) {
  const wantsHostOnly = String(process.env.IRUKA_AUTOMATION_HOST_ONLY || '').toLowerCase();
  if (wantsHostOnly === '1' || wantsHostOnly === 'true') {
    requestedArchs = hostArch;
  } else {
    requestedArchs = ['arm64', 'x86_64'];
  }
}

const uniqueArchs = Array.from(new Set((requestedArchs || []).flat().filter(Boolean)));
if (uniqueArchs.length === 0) {
  console.error('Unable to determine architectures for Swift bridge build.');
  process.exit(1);
}

function findProductBinary(baseDir) {
  const candidates = [
    path.join(baseDir, 'release', 'IrukaAutomation'),
    path.join(baseDir, 'Release', 'IrukaAutomation'),
    path.join(baseDir, 'apple', 'Products', 'Release', 'IrukaAutomation'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const archBinaries = [];
for (const arch of uniqueArchs) {
  const archScratch = path.join(buildDir, arch);
  fs.mkdirSync(archScratch, { recursive: true });

  const args = [
    'build',
    '-c',
    'release',
    '--disable-sandbox',
    '--cache-path',
    sharedCacheDir,
    '--config-path',
    configDir,
    '--security-path',
    securityDir,
    '--scratch-path',
    archScratch,
    '--arch',
    arch,
  ];

  console.log(`Building Swift automation bridge for ${arch}...`);
  const result = spawnSync('swift', args, {
    cwd: packageDir,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`Swift bridge build failed for ${arch}.`);
    process.exit(result.status || 1);
  }

  const archBinary = findProductBinary(archScratch);
  if (!archBinary) {
    console.error(`Swift bridge binary not found for ${arch} in ${archScratch}`);
    process.exit(1);
  }
  archBinaries.push({ arch, path: archBinary });
}

if (archBinaries.length === 0) {
  console.error('Swift bridge build produced no binaries.');
  process.exit(1);
}

if (archBinaries.length === 1) {
  fs.copyFileSync(archBinaries[0].path, outputBinary);
  fs.chmodSync(outputBinary, 0o755);
  console.log(`Swift bridge binary ready (${archBinaries[0].arch}) at ${outputBinary}`);
} else {
  const lipoArgs = ['-create', ...archBinaries.map((entry) => entry.path), '-output', outputBinary];
  console.log(`Creating universal Swift bridge binary via lipo...`);
  const lipoResult = spawnSync('lipo', lipoArgs, {
    stdio: 'inherit',
  });

  if (lipoResult.status !== 0) {
    console.error('lipo failed while creating universal Swift bridge binary.');
    process.exit(lipoResult.status || 1);
  }

  fs.chmodSync(outputBinary, 0o755);
  console.log(`Universal Swift bridge binary ready at ${outputBinary}`);
}
