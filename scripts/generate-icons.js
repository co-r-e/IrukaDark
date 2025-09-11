#!/usr/bin/env node
/*
 Generates platform icons from root-level icon.png using electron-icon-builder.
 - macOS: build/icons/icon.icns
 - Windows: build/icons/icon.ico
 - Linux: build/icons/png/* (electron-builder will pick the folder)
 Fails with a helpful message if icon.png is missing.
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const inputPng = path.join(root, 'icon.png');
const outDir = path.join(root, 'build', 'icons');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function fail(msg) {
  console.error(`\n[generate-icons] ${msg}`);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(inputPng)) {
    fail(
      'icon.png が見つかりません。プロジェクト直下に 1024x1024 以上の icon.png を配置してください。' +
        '\n(例) /path/to/repo/icon.png'
    );
  }
  ensureDir(outDir);

  // Lazy import so the dependency is only required in CI/dev
  const eib = require('electron-icon-builder');
  /**
   * electron-icon-builder options
   * - input: source png
   * - output: destination directory (creates mac .icns, win .ico, linux png set)
   */
  await eib({ input: inputPng, output: outDir });

  // Normalize filenames to what electron-builder config expects
  const icnsSrc = path.join(outDir, 'icons.icns');
  const icnsDst = path.join(outDir, 'icon.icns');
  if (fs.existsSync(icnsSrc) && !fs.existsSync(icnsDst)) {
    fs.renameSync(icnsSrc, icnsDst);
  }
  const icoSrc = path.join(outDir, 'icons.ico');
  const icoDst = path.join(outDir, 'icon.ico');
  if (fs.existsSync(icoSrc) && !fs.existsSync(icoDst)) {
    fs.renameSync(icoSrc, icoDst);
  }

  console.log('[generate-icons] icons generated in build/icons');
}

main().catch((err) => {
  console.error('[generate-icons] failed:', err?.stack || String(err));
  process.exit(1);
});
