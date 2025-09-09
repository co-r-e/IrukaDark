// Updates (notification-only) helpers for Electron main process
const { app } = require('electron');

function getUpdateRepo() {
  const repo = process.env.UPDATE_REPO || 'co-r-e/IrukaDark';
  return String(repo).trim();
}

function parseVersion(v) {
  try {
    const s = String(v || '').replace(/^v/, '');
    const parts = s.split('.').map((n) => parseInt(n, 10));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  } catch {
    return [0, 0, 0];
  }
}

function isNewer(a, b) {
  const A = parseVersion(a);
  const B = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] !== B[i]) return A[i] > B[i];
  }
  return false;
}

async function fetchLatestRelease() {
  const repo = getUpdateRepo();
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const tag = String(j.tag_name || '').trim();
  const version = tag ? tag.replace(/^v/, '') : '';
  const html = String(j.html_url || `https://github.com/${repo}/releases/latest`);
  const body = String(j.body || '');
  return { version, url: html, notes: body };
}

async function checkForUpdates({ manual = false, mainWindow, getPref, setPref }) {
  try {
    const skip = String(getPref('UPDATE_SKIP_VERSION') || '').trim();
    const last = Number(getPref('UPDATE_LAST_CHECK') || 0);
    const now = Date.now();
    if (!manual && last && now - last < 60 * 60 * 1000) return; // throttle 1h
    const latest = await fetchLatestRelease();
    try {
      setPref('UPDATE_LAST_CHECK', String(now));
    } catch {}
    const current = app.getVersion();
    if (latest.version && isNewer(latest.version, current) && latest.version !== skip) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:available', latest);
        }
      } catch {}
    } else if (manual) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:none');
      } catch {}
    }
  } catch (e) {
    if (manual) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:none');
      } catch {}
    }
  }
}

module.exports = { getUpdateRepo, checkForUpdates };
