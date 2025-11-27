#!/usr/bin/env node
/**
 * Build script for Windows C# automation bridge.
 * Requires .NET 8 SDK to be installed.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.resolve(__dirname, '../native/windows/IrukaAutomation/IrukaAutomation');
const distDir = path.resolve(__dirname, '../native/windows/IrukaAutomation/dist');
const outputBinary = path.join(distDir, 'IrukaAutomation.exe');

console.log('Building Windows C# automation bridge...');
console.log(`Project: ${projectDir}`);
console.log(`Output: ${distDir}`);

// Check if running on Windows or if dotnet is available for cross-compilation
const dotnetCheck = spawnSync('dotnet', ['--version'], { stdio: 'pipe' });
if (dotnetCheck.status !== 0) {
  console.log('⚠️  .NET SDK not found. Skipping Windows bridge build.');
  console.log('   Install .NET 8 SDK from https://dotnet.microsoft.com/download');
  process.exit(0);
}

console.log(`Using .NET SDK version: ${dotnetCheck.stdout.toString().trim()}`);

// Check if project exists
if (!fs.existsSync(path.join(projectDir, 'IrukaAutomation.csproj'))) {
  console.error('❌ Project file not found:', path.join(projectDir, 'IrukaAutomation.csproj'));
  process.exit(1);
}

// Create dist directory
fs.mkdirSync(distDir, { recursive: true });

// Build with dotnet publish
console.log('\nRunning dotnet publish...');
const buildResult = spawnSync(
  'dotnet',
  [
    'publish',
    '-c',
    'Release',
    '-r',
    'win-x64',
    '--self-contained',
    'true',
    '-p:PublishSingleFile=true',
    '-p:EnableCompressionInSingleFile=true',
    '-p:IncludeNativeLibrariesForSelfExtract=true',
    '-o',
    distDir,
  ],
  {
    cwd: projectDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (buildResult.status !== 0) {
  console.error('\n❌ Build failed with status:', buildResult.status);
  process.exit(buildResult.status);
}

// Verify output
if (fs.existsSync(outputBinary)) {
  const stats = fs.statSync(outputBinary);
  console.log(`\n✅ Build successful!`);
  console.log(`   Output: ${outputBinary}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} else {
  console.error('\n❌ Output binary not found:', outputBinary);
  process.exit(1);
}
