#!/usr/bin/env node
/*
 Validates that src/i18n/menuTranslations.js contains exactly the keys used by src/main/menu.js.
 - Fails if any locale is missing a required key.
 - Warns (does not fail) if a locale has extra keys not referenced by the menu.
*/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const menuPath = path.join(root, 'src/main/menu.js');
const translationsPath = path.join(root, 'src/i18n/menuTranslations.js');

const menuCode = fs.readFileSync(menuPath, 'utf8');
const required = new Set();

// Gather keys referenced as t.key
for (const m of menuCode.matchAll(/\bt\.([a-zA-Z0-9_]+)/g)) {
  required.add(m[1]);
}
// Gather explicit fallbacks menuTranslations.en.key
for (const m of menuCode.matchAll(/menuTranslations\.en\.([a-zA-Z0-9_]+)/g)) {
  required.add(m[1]);
}

// Load translation object
// eslint-disable-next-line import/no-commonjs
const menuTranslations = require(translationsPath);

const locales = Object.keys(menuTranslations);
let ok = true;
for (const loc of locales) {
  const obj = menuTranslations[loc] || {};
  const keys = Object.keys(obj);
  // Missing keys
  const missing = [...required].filter((k) => !(k in obj));
  if (missing.length) {
    ok = false;
    console.error(`[${loc}] missing keys: ${missing.join(', ')}`);
  }
  // Extra keys
  const extra = keys.filter((k) => !required.has(k));
  if (extra.length) {
    console.warn(`[${loc}] extra keys (consider pruning): ${extra.join(', ')}`);
  }
}

if (!ok) {
  console.error(`\nTranslation check failed. Please add missing keys above.`);
  process.exit(1);
}
console.log('Menu translations OK.');

