#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const distDir = path.resolve(root, 'dist');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(p);
    } else if (entry.isFile()) {
      yield p;
    }
  }
}

function rel(p) {
  return path.relative(distDir, p) || path.basename(p);
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('dist/ not found');
    process.exit(1);
  }
  const outputs = [];
  for (const file of walk(distDir)) {
    if (file.endsWith('.sha256') || file.endsWith('SHA256SUMS.txt')) continue;
    // Skip metadata files we don't ship
    if (/(^|\.)latest.*\.yml$/i.test(file)) continue;
    if (/\.yml$/i.test(file)) continue; // builder-debug.yml, etc.
    if (/\.blockmap(\.zip)?$/i.test(file)) continue;
    const hex = await hashFile(file);
    outputs.push({ file, hex });
    // Write sidecar .sha256 (hex  filename)
    try {
      fs.writeFileSync(file + '.sha256', `${hex}  ${path.basename(file)}\n`, 'utf8');
    } catch (e) {}
    console.log(hex, rel(file));
  }
  // Write manifest
  const manifest = outputs.map((o) => `${o.hex}  ${rel(o.file)}`).join('\n') + '\n';
  fs.writeFileSync(path.join(distDir, 'SHA256SUMS.txt'), manifest, 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
