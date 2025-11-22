const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// PERFORMANCE: In-memory cache for preferences
// Avoids repeated file I/O which is slow especially from asar
let prefsCache = null;
let prefsCacheLoaded = false;

function getPrefsPath() {
  try {
    return path.join(app.getPath('userData'), 'irukadark.prefs.json');
  } catch {
    return '';
  }
}

function loadPrefs() {
  // Return cached preferences if already loaded
  if (prefsCacheLoaded && prefsCache !== null) {
    return prefsCache;
  }

  const prefsPath = getPrefsPath();
  try {
    if (prefsPath && fs.existsSync(prefsPath)) {
      const raw = fs.readFileSync(prefsPath, 'utf8');
      prefsCache = JSON.parse(raw || '{}') || {};
    } else {
      prefsCache = {};
    }
  } catch {
    prefsCache = {};
  }
  prefsCacheLoaded = true;
  return prefsCache;
}

function savePrefs(prefs) {
  try {
    const prefsPath = getPrefsPath();
    if (!prefsPath) return;
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
    fs.writeFileSync(prefsPath, JSON.stringify(prefs || {}, null, 2), 'utf8');
    // Update in-memory cache after saving
    prefsCache = prefs || {};
    prefsCacheLoaded = true;
  } catch {}
}

function setPref(key, value) {
  try {
    const p = loadPrefs();
    if (value === undefined || value === null || value === '') {
      delete p[key];
    } else {
      p[key] = value;
    }
    savePrefs(p);
    return true;
  } catch {
    return false;
  }
}

function getPref(key) {
  try {
    const p = loadPrefs();
    return p ? p[key] : undefined;
  } catch {
    return undefined;
  }
}

// Force reload preferences from disk (useful after external changes)
function reloadPrefs() {
  prefsCacheLoaded = false;
  prefsCache = null;
  return loadPrefs();
}

module.exports = {
  getPrefsPath,
  loadPrefs,
  savePrefs,
  setPref,
  getPref,
  reloadPrefs,
};
