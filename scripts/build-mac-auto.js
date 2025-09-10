#!/usr/bin/env node
const { execSync } = require('child_process');

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

const arch = process.env.ARCH || 'arm64';
const publish = process.env.PUBLISH || 'never';
const sandbox = process.env.SANDBOX === '1' || process.env.SANDBOX === 'true';

// Always ensure icons are present (script handles tool fallbacks)
try {
  sh('npm run icons');
} catch (e) {
  console.warn('icons step failed (continuing):', e.message);
}

function build(target) {
  sh(`npx electron-builder -m ${target} --${arch} --publish ${publish}`);
}

(async () => {
  if (sandbox) {
    console.log('[sandbox] Forcing ZIP target (DMG requires hdiutil).');
    return build('zip');
  }
  try {
    console.log('Trying DMG build...');
    build('dmg');
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.warn('DMG build failed, falling back to ZIP. Reason:', msg.split('\n')[0]);
    build('zip');
  }
})();
