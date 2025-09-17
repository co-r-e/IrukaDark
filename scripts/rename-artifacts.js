#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const tag = process.argv[2];
if (!tag) {
  console.error('[rename-artifacts] Usage: node scripts/rename-artifacts.js <tag>');
  process.exit(1);
}

const pkg = require('../package.json');
const version = pkg.version || '';
if (!version) {
  console.error('[rename-artifacts] package.json version missing');
  process.exit(1);
}

const distRoot = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distRoot)) {
  console.warn('[rename-artifacts] dist/ does not exist, skipping');
  process.exit(0);
}

const renameExts = new Set(['.dmg', '.zip', '.blockmap']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(distRoot).filter((p) => renameExts.has(path.extname(p)));

if (!files.length) {
  console.warn('[rename-artifacts] No matching artifacts found');
  process.exit(0);
}

for (const filePath of files) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  let next = base;

  if (base.includes(`-${version}`)) {
    next = base.replace(`-${version}`, `-${tag}`);
  } else if (!base.includes(`-${tag}`)) {
    const ext = path.extname(base);
    const stem = base.slice(0, -ext.length);
    next = `${stem}-${tag}${ext}`;
  }

  if (next === base) {
    console.log(`[rename-artifacts] Skipping ${base} (already tagged)`);
    continue;
  }

  const targetPath = path.join(dir, next);
  fs.renameSync(filePath, targetPath);
  console.log(`[rename-artifacts] ${base} -> ${next}`);
}
