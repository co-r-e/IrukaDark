/* Clipboard, shortcuts and capture utilities for Electron main process */
const { app, BrowserWindow, clipboard } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Timings for temporary hide/show during shortcut copy
const HIDE_DELAY_MS_MAC = 140;

// Track clipboard text freshness (trimmed text + last change time)
let clipboardTextSnapshot = '';
let clipboardChangedAt = 0; // 0 means unknown age
let clipboardWatcher = null;

function startClipboardWatcher() {
  try {
    try {
      clipboardTextSnapshot = (clipboard.readText() || '').trim();
    } catch {
      clipboardTextSnapshot = '';
    }
    clipboardChangedAt = 0;
    if (clipboardWatcher) {
      try {
        clearInterval(clipboardWatcher);
      } catch {}
    }
    clipboardWatcher = setInterval(() => {
      try {
        const t = (clipboard.readText() || '').trim();
        if (t && t !== clipboardTextSnapshot) {
          clipboardTextSnapshot = t;
          clipboardChangedAt = Date.now();
        }
      } catch {}
    }, 250);
  } catch {}
}

function isClipboardTextStale(text, thresholdMs = 3000) {
  try {
    const current = (clipboard.readText() || '').trim();
    if (!text || text.trim() !== current) return false;
  } catch {}
  if (!clipboardChangedAt) return true;
  return Date.now() - clipboardChangedAt >= thresholdMs;
}

function showWindowNonActivating(win) {
  try {
    if (!win || win.isDestroyed()) return;
    if (typeof win.showInactive === 'function') win.showInactive();
    else win.show();
  } catch {}
}

function getAllWindowsSafe() {
  try {
    return (BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : []).filter(
      (w) => !!w && !w.isDestroyed()
    );
  } catch {
    return [];
  }
}

function readClipboardTextTrimmed() {
  try {
    return (clipboard.readText() || '').trim();
  } catch {
    return '';
  }
}

async function pollClipboardChange(beforeText, maxWaitMs) {
  const start = Date.now();
  let last = beforeText;
  let attempts = 0;
  while (Date.now() - start < maxWaitMs) {
    const now = readClipboardTextTrimmed();
    attempts++;
    if (now && now !== beforeText) {
      if (isDev) {
        console.log(
          `Clipboard changed after ${attempts} attempts:`,
          `"${now.substring(0, 50)}..."`
        );
      }
      try {
        clipboardTextSnapshot = now;
        clipboardChangedAt = Date.now();
      } catch {}
      return now;
    }
    last = now;
    const elapsed = Date.now() - start;
    const interval = elapsed < 240 ? 18 : elapsed < 900 ? 45 : 90;
    await delay(interval);
  }
  return last && last.trim() ? last.trim() : '';
}

function triggerMacCopyShortcut() {
  try {
    exec(
      'osascript -e \'tell application "System Events" to keystroke "c" using {command down}\'',
      (error) => {
        if (error && isDev) console.warn('osascript error:', error.message);
      }
    );
  } catch (e) {
    if (isDev) console.warn('Failed to invoke osascript:', e?.message);
  }
}

async function macReadSelectedTextViaAX() {
  return await new Promise((resolve) => {
    try {
      const script = `
        try
          tell application "System Events"
            set procs to (every process whose frontmost is true)
            if procs is {} then return ""
            set p to item 1 of procs
            set theFocused to missing value
            try
              set theFocused to value of attribute "AXFocusedUIElement" of p
            on error
              try
                set theFocused to value of attribute "AXFocusedUIElement" of window 1 of p
              on error
                return ""
              end try
            end try
            try
              set sel to value of attribute "AXSelectedText" of theFocused
              if sel is missing value then set sel to ""
              return sel as text
            on error
              try
                set val to value of theFocused
                if val is missing value then set val to ""
                return val as text
              on error
                return ""
              end try
            end try
          end tell
        on error
          return ""
        end try`;
      const cmd = `osascript -e '${script.replace(/\n/g, ' ')}'`;
      exec(cmd, (err, stdout) => {
        if (err) {
          resolve('');
          return;
        }
        const out = String(stdout || '')
          .replace(/\r/g, '')
          .trim();
        resolve(out);
      });
    } catch {
      resolve('');
    }
  });
}

async function tryCopySelectedText() {
  const before = readClipboardTextTrimmed();
  if (isDev) {
    console.log('Clipboard before copy:', before ? `"${before.substring(0, 50)}..."` : 'empty');
  }

  const platform = process.platform;
  const envMaxWait = Number.parseInt(process.env.CLIPBOARD_MAX_WAIT_MS || '', 10);
  const defaultMaxWait = 1200;
  const macMaxWait = Number.isFinite(envMaxWait) && envMaxWait > 0 ? envMaxWait : defaultMaxWait;
  // macOS only

  if (platform === 'darwin') {
    let didHideApp = false;
    try {
      if (typeof app?.isHidden === 'function' && !app.isHidden()) {
        didHideApp = true;
        try {
          app.hide();
        } catch {}
        await delay(HIDE_DELAY_MS_MAC);
      }
    } catch {}
    try {
      const axText = (await macReadSelectedTextViaAX()) || '';
      if (axText && axText.trim()) {
        try {
          clipboardTextSnapshot = axText.trim();
          clipboardChangedAt = Date.now();
        } catch {}
        return axText.trim();
      }
      try {
        triggerMacCopyShortcut();
      } catch {}
      const polled = await pollClipboardChange(before, macMaxWait);
      if (polled) return polled;
      if (isDev) console.log('No text found in clipboard (macOS)');
      return '';
    } finally {
      if (didHideApp) {
        try {
          const wins = getAllWindowsSafe();
          for (const w of wins) showWindowNonActivating(w);
        } catch {}
      }
    }
  }

  // non-macOS paths removed (app is mac-only)
  return '';
}

async function captureInteractiveArea() {
  const platform = process.platform;
  if (platform === 'darwin') {
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

  return { data: '', mimeType: '' };
}

module.exports = {
  startClipboardWatcher,
  isClipboardTextStale,
  getAllWindowsSafe,
  showWindowNonActivating,
  tryCopySelectedText,
  captureInteractiveArea,
};
