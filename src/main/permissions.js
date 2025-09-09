// Permissions preflight helpers
const { app, systemPreferences, clipboard } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function preflightAccessibility() {
  try {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      try {
        systemPreferences.isTrustedAccessibilityClient(true);
      } catch {}
    }
  } catch {}
}

function preflightScreenRecording() {
  try {
    const tmpDir = app.getPath('temp');
    const file = path.join(tmpDir, `irukadark_perm_${Date.now()}.png`);
    const cmd = `screencapture -x -R 0,0,1,1 "${file}"`;
    exec(cmd, () => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    });
  } catch {}
}

function preflightPermissionsOnce({ loadPrefs, savePrefs, bringAppToFront }) {
  if (process.platform !== 'darwin') return;
  const prefs = loadPrefs();
  if (prefs && prefs.PERMISSIONS_PREFLIGHT_DONE) return;
  try {
    preflightAccessibility();
  } catch {}
  try {
    preflightScreenRecording();
  } catch {}
  try {
    bringAppToFront && bringAppToFront();
    try {
      clipboard.readText();
    } catch {}
  } catch {}
  try {
    const p = loadPrefs();
    p.PERMISSIONS_PREFLIGHT_DONE = true;
    savePrefs(p);
  } catch {}
}

module.exports = {
  preflightPermissionsOnce,
  preflightAccessibility,
  preflightScreenRecording,
};
