#!/usr/bin/env node
/*
 Auto-bump version, tag, and push to trigger GitHub Release.
 Usage:
   node scripts/release-bump.js [patch|minor|major]
   (default: patch)
*/
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function fmtVersion(obj) {
  return `${obj.major}.${obj.minor}.${obj.patch}`;
}

function bump(v, kind) {
  const o = { ...v };
  if (kind === 'major') {
    o.major += 1;
    o.minor = 0;
    o.patch = 0;
  } else if (kind === 'minor') {
    o.minor += 1;
    o.patch = 0;
  } else {
    o.patch += 1;
  }
  return o;
}

(async () => {
  const kind = (process.argv[2] || 'patch').toLowerCase();
  if (!['patch', 'minor', 'major'].includes(kind)) {
    console.error(`Invalid bump kind: ${kind}`);
    process.exit(1);
  }

  // Ensure working tree clean
  try {
    const st = run('git status --porcelain');
    if (st) {
      console.error('Working tree not clean. Commit or stash changes first.');
      process.exit(1);
    }
  } catch (e) {}

  try {
    run('git fetch --tags --quiet');
  } catch {}
  const tagsRaw = run('git tag --list "v*" || true');
  const tags = tagsRaw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ t, v: parseVersion(t.startsWith('v') ? t.slice(1) : t) }))
    .filter((x) => x.v);

  let base = { major: 1, minor: 0, patch: 0 }; // default base 1.0.0
  if (tags.length) {
    // find max by semver
    tags.sort((a, b) => {
      const A = a.v,
        B = b.v;
      if (A.major !== B.major) return A.major - B.major;
      if (A.minor !== B.minor) return A.minor - B.minor;
      return A.patch - B.patch;
    });
    base = tags[tags.length - 1].v;
  }
  const next = bump(base, kind);
  const nextStr = fmtVersion(next);
  const tag = `v${nextStr}`;

  // Update package.json version
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = nextStr;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Commit, tag, push
  run('git add package.json');
  run(`git commit -m "chore(release): ${tag}"`);
  run(`git tag ${tag}`);
  const currentBranch = run('git rev-parse --abbrev-ref HEAD');
  console.log(`[release] Bumped to ${tag}. Pushing ${currentBranch} and tag…`);
  run(`git push origin ${currentBranch}`);
  run(`git push origin ${tag}`);
  console.log('[release] Done. GitHub Actions will build and publish the release.');
})();
