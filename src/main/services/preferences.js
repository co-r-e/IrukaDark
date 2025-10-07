const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function getPrefsPath() {
  try {
    return path.join(app.getPath('userData'), 'irukadark.prefs.json');
  } catch {
    return '';
  }
}

function loadPrefs() {
  const prefsPath = getPrefsPath();
  try {
    if (prefsPath && fs.existsSync(prefsPath)) {
      const raw = fs.readFileSync(prefsPath, 'utf8');
      return JSON.parse(raw || '{}') || {};
    }
  } catch {}
  return {};
}

function savePrefs(prefs) {
  try {
    const prefsPath = getPrefsPath();
    if (!prefsPath) return;
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
    fs.writeFileSync(prefsPath, JSON.stringify(prefs || {}, null, 2), 'utf8');
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

module.exports = {
  getPrefsPath,
  loadPrefs,
  savePrefs,
  setPref,
  getPref,
};
