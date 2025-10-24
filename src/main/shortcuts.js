/* Clipboard, shortcuts and capture utilities for Electron main process */
const { app } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fetchSelectedText } = require('./services/macAutomationBridge');

const isDev = process.env.NODE_ENV === 'development';
const DEFAULT_CLIPBOARD_TIMEOUT_MS = 1500;

function showWindowNonActivating(win) {
  try {
    if (!win || win.isDestroyed()) return;
    if (typeof win.showInactive === 'function') {
      win.showInactive();
    } else {
      win.show();
    }

    try {
      if (typeof win.moveTop === 'function') {
        win.moveTop();
      }
    } catch {}

    try {
      if (!win.isFocused()) {
        win.focus();
      }
    } catch {}
  } catch {}
}

function resolveClipboardTimeout() {
  const envMaxWait = Number.parseInt(process.env.CLIPBOARD_MAX_WAIT_MS || '', 10);
  if (Number.isFinite(envMaxWait) && envMaxWait > 0) {
    return envMaxWait;
  }
  return DEFAULT_CLIPBOARD_TIMEOUT_MS;
}

async function tryCopySelectedText() {
  if (process.platform !== 'darwin') {
    return '';
  }

  const timeoutMs = resolveClipboardTimeout();
  const response = await fetchSelectedText({ timeoutMs });

  if (response.status === 'ok' && response.text) {
    return response.text.trim();
  }

  if (isDev) {
    console.warn(
      'Swift automation bridge failed to retrieve selected text:',
      response.code || response.status,
      response.message || ''
    );
  }

  return '';
}

async function captureInteractiveArea() {
  if (process.platform !== 'darwin') {
    return { data: '', mimeType: '' };
  }

  try {
    const tmpDir = app.getPath('temp');
    const file = path.join(tmpDir, `irukadark_capture_${Date.now()}.png`);
    const cmd = `screencapture -i -x "${file}"`;
    const code = await new Promise((resolve) => exec(cmd, (error) => resolve(error ? 1 : 0)));
    if (code !== 0) {
      try {
        fs.existsSync(file) && fs.unlinkSync(file);
      } catch {}
      return { data: '', mimeType: '' };
    }
    try {
      const buf = fs.readFileSync(file);
      try {
        fs.unlinkSync(file);
      } catch {}
      return { data: buf.toString('base64'), mimeType: 'image/png' };
    } catch {
      return { data: '', mimeType: '' };
    }
  } catch {
    return { data: '', mimeType: '' };
  }
}

module.exports = {
  showWindowNonActivating,
  tryCopySelectedText,
  captureInteractiveArea,
};
