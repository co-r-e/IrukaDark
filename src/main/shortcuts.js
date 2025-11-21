/* Clipboard, shortcuts and capture utilities for Electron main process */
const { app } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fetchSelectedText } = require('./services/macAutomationBridge');

// Constants
const isDev = process.env.NODE_ENV === 'development';
const DEFAULT_CLIPBOARD_TIMEOUT_MS = 1500;
const WINDOW_ALWAYS_ON_TOP_DELAY_MS = 100;

/**
 * Shows a window and brings it to the front without stealing focus from other applications.
 * Uses setAlwaysOnTop temporarily to ensure the window appears on top.
 *
 * @param {BrowserWindow} win - The Electron BrowserWindow instance to show
 */
function showWindowNonActivating(win) {
  try {
    if (!win || win.isDestroyed()) {
      return;
    }

    // Ensure window is visible
    if (!win.isVisible()) {
      win.show();
    }

    // Temporarily set always-on-top to bring window to front
    const wasAlwaysOnTop = win.isAlwaysOnTop();
    if (!wasAlwaysOnTop) {
      win.setAlwaysOnTop(true);
    }

    // Focus the window
    try {
      if (!win.isFocused()) {
        win.focus();
      }
    } catch (focusError) {
      if (isDev) {
      }
    }

    // Restore original always-on-top state
    if (!wasAlwaysOnTop) {
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) {
            win.setAlwaysOnTop(false);
          }
        } catch (restoreError) {
          if (isDev) {
          }
        }
      }, WINDOW_ALWAYS_ON_TOP_DELAY_MS);
    }
  } catch (error) {
    if (isDev) {
    }
  }
}

/**
 * Resolves the clipboard timeout value from environment variable or default.
 *
 * @returns {number} Timeout in milliseconds
 */
function resolveClipboardTimeout() {
  const envMaxWait = Number.parseInt(process.env.CLIPBOARD_MAX_WAIT_MS || '', 10);
  if (Number.isFinite(envMaxWait) && envMaxWait > 0) {
    return envMaxWait;
  }
  return DEFAULT_CLIPBOARD_TIMEOUT_MS;
}

/**
 * Attempts to retrieve selected text from the active application using Swift automation bridge.
 * Returns empty string if the operation fails.
 *
 * @returns {Promise<string>} The selected text, trimmed, or empty string on failure
 */
async function tryCopySelectedText() {
  const timeoutMs = resolveClipboardTimeout();
  const response = await fetchSelectedText({ timeoutMs });

  if (response.status === 'ok' && response.text) {
    return response.text.trim();
  }

  if (isDev) {
  }

  return '';
}

/**
 * Captures a user-selected screen area using macOS screencapture utility.
 * The captured image is returned as base64-encoded PNG data.
 *
 * @returns {Promise<{data: string, mimeType: string}>} Object containing base64 image data and MIME type
 */
async function captureInteractiveArea() {
  try {
    const tmpDir = app.getPath('temp');
    const file = path.join(tmpDir, `irukadark_capture_${Date.now()}.png`);
    const cmd = `screencapture -i -x "${file}"`;

    // Execute screencapture command
    const code = await new Promise((resolve) => {
      exec(cmd, (error) => resolve(error ? 1 : 0));
    });

    // Check if capture was successful
    if (code !== 0) {
      // Clean up temporary file if it exists
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (cleanupError) {
        if (isDev) {
        }
      }
      return { data: '', mimeType: '' };
    }

    // Read and encode the captured image
    try {
      const buf = fs.readFileSync(file);

      // Clean up temporary file
      try {
        fs.unlinkSync(file);
      } catch (cleanupError) {
        if (isDev) {
        }
      }

      return { data: buf.toString('base64'), mimeType: 'image/png' };
    } catch (readError) {
      if (isDev) {
      }
      return { data: '', mimeType: '' };
    }
  } catch (error) {
    if (isDev) {
    }
    return { data: '', mimeType: '' };
  }
}

module.exports = {
  showWindowNonActivating,
  tryCopySelectedText,
  captureInteractiveArea,
};
