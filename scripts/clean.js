#!/usr/bin/env node
// IrukaDark cleanup utility
// - Removes generated artifacts and OS cruft safely
// - Supports --dry-run to preview actions

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('-n');

/** Recursively walk a directory */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

function rmDirSafe(rel) {
  const p = path.resolve(root, rel);
  if (!fs.existsSync(p)) return;
  if (dryRun) {
    console.log(`[dry-run] remove dir: ${rel}`);
    return;
  }
  fs.rmSync(p, { recursive: true, force: true });
  console.log(`removed dir: ${rel}`);
}

function rmFileSafe(rel) {
  const p = path.resolve(root, rel);
  if (!fs.existsSync(p)) return;
  if (dryRun) {
    console.log(`[dry-run] remove file: ${rel}`);
    return;
  }
  fs.rmSync(p, { force: true });
  console.log(`removed file: ${rel}`);
}

function removeDSStore(startDir = root) {
  if (!fs.existsSync(startDir)) return;
  for (const file of walk(startDir)) {
    if (path.basename(file) === '.DS_Store') {
      const rel = path.relative(root, file);
      if (dryRun) console.log(`[dry-run] remove file: ${rel}`);
      else {
        try {
          fs.rmSync(file, { force: true });
          console.log(`removed file: ${rel}`);
        } catch {}
      }
    }
  }
}

function main() {
  // Generated build artifacts — safely deletable
  rmDirSafe('dist');
  rmDirSafe('build');

  // OS cruft
  removeDSStore(root);

  // Common log files
  rmFileSafe('npm-debug.log');
  rmFileSafe('yarn-debug.log');
  rmFileSafe('yarn-error.log');

  // Do not touch node_modules or any env files here
}

main();
