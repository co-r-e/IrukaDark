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

function isPortableMode() {
  const v = String(process.env.PORTABLE_MODE || '')
    .trim()
    .toLowerCase();
  return v && v !== '0' && v !== 'false' && v !== 'off';
}

function getPortableEnvPath() {
  try {
    const inAsar = /app\.asar/i.test(String(app.getAppPath && app.getAppPath()));
    if (inAsar) {
      return path.join(app.getPath('userData'), '.env.local');
    }
  } catch {}
  return path.join(__dirname, '../../../.env.local');
}

function upsertEnvVar(envPath, key, value) {
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = envContent.split('\n').filter(Boolean);
  const idx = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
}

function setPref(key, value) {
  try {
    if (isPortableMode()) {
      const envPath = getPortableEnvPath();
      if (value === undefined || value === null || value === '') {
        const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const lines = envContent
          .split('\n')
          .filter(Boolean)
          .filter((line) => !line.startsWith(`${key}=`));
        fs.writeFileSync(envPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
      } else {
        upsertEnvVar(envPath, key, String(value));
      }
      return true;
    }
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
  isPortableMode,
  getPortableEnvPath,
  upsertEnvVar,
};
