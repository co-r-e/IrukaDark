#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dist = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(dist)) {
  console.error('[sha256] dist/ not found, nothing to hash');
  process.exit(0);
}

const skipExt = new Set(['.yml', '.yaml', '.blockmap', '.sha512', '.json', '.txt', '.map']);
const files = fs
  .readdirSync(dist)
  .filter((f) => fs.statSync(path.join(dist, f)).isFile())
  .filter((f) => !skipExt.has(path.extname(f).toLowerCase()))
  .filter((f) => !f.endsWith('.sha256'));

for (const f of files) {
  const p = path.join(dist, f);
  const buf = fs.readFileSync(p);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const out = `${hash}  ${f}\n`;
  const outPath = path.join(dist, `${f}.sha256`);
  fs.writeFileSync(outPath, out);
  console.log(`[sha256] ${f} -> ${path.basename(outPath)}`);
}
