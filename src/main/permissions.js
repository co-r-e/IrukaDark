// Permissions preflight helpers
const { app, systemPreferences, clipboard } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function preflightAccessibility() {
  try {
    // Only check status, do NOT prompt. Prompts should only appear when user
    // actually triggers an action that needs the permission.
    systemPreferences.isTrustedAccessibilityClient(false);
  } catch {}
}

function preflightAutomationHelper() {
  try {
    const resources = process.resourcesPath || path.resolve(__dirname, '../../..');
    const helper = path.join(resources, 'mac-automation', 'IrukaAutomation');
    try {
      fs.accessSync(helper, fs.constants.X_OK);
    } catch {
      return; // Helper not present; nothing to prompt
    }
    // Fire-and-forget a short ensure-accessibility to register helper with OS permissions.
    // Do NOT pass --prompt-accessibility here - prompts should only appear when user
    // actually triggers an action (Option+A, Option+S) that needs the permission.
    const child = spawn(helper, ['ensure-accessibility', '--timeout-ms', '200'], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
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
  const prefs = loadPrefs();
  if (prefs && prefs.PERMISSIONS_PREFLIGHT_DONE) return;
  try {
    preflightAccessibility();
  } catch {}
  try {
    preflightAutomationHelper();
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
};
