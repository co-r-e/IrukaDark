/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const {
  app,
  ipcMain,
  systemPreferences,
  Menu,
  globalShortcut,
  BrowserWindow,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const { loadPrefs, savePrefs, setPref, getPref } = require('../services/preferences');
const { WindowManager } = require('../windows/windowManager');
const { SettingsController } = require('../services/settingsController');
const menuBuilder = require('../menu');
const {
  showWindowNonActivating,
  tryCopySelectedText,
  captureInteractiveArea,
} = require('../shortcuts');
const { fetchUrlContent } = require('../services/urlContent');
const {
  getGenAIClientForKey,
  modelCandidates,
  restGenerateText,
  restGenerateImage,
  restGenerateImageFromText,
  restGenerateImageFromTextWithReference,
  sdkGenerateText,
  sdkGenerateImage,
} = require('../ai');
const { getMainWindow, setMainWindow, setPopupWindow } = require('../context');
const { setupAutoUpdates, manualCheckForUpdates } = require('../updates');

const isDev = process.env.NODE_ENV === 'development';

function resolveAppLogPath() {
  try {
    const logsDir = app?.getPath?.('logs');
    if (!logsDir) return undefined;
    fs.mkdirSync(logsDir, { recursive: true });
    return path.join(logsDir, 'automation.log');
  } catch {
    return undefined;
  }
}

function logShortcutEvent(event, payload = {}) {
  try {
    const target = resolveAppLogPath();
    if (!target) return;
    const record = { ts: new Date().toISOString(), event, ...payload };
    fs.appendFile(target, JSON.stringify(record) + '\n', () => {});
  } catch {}
}

function extractFirstValidUrl(rawText) {
  if (!rawText) return '';
  const sanitize = (token) =>
    String(token || '')
      .trim()
      .replace(/^[\s<\[("'`“”‘’]+/, '')
      .replace(/[>\])"'`“”‘’]+$/u, '')
      .replace(/[,.;:!?、。]+$/u, '');
  const tokens = String(rawText).split(/\s+/).map(sanitize).filter(Boolean);
  for (const token of tokens) {
    let candidate = token;
    if (!/^https?:\/\//i.test(candidate) && /^www\./i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString();
      }
    } catch {}
  }
  return '';
}

function bootstrapApp() {
  const initialShowMain = true;

  const windowManager = new WindowManager({
    getPref,
    initialShowMain,
  });

  const settingsController = new SettingsController({
    windowManager,
    menuRefresher: () => createAppMenu(),
    setPref,
    getPref,
  });

  function getCurrentLanguage() {
    try {
      const prefLang = getPref('MENU_LANGUAGE');
      if (prefLang) return String(prefLang);
    } catch {}
    return 'en';
  }

  async function openInputDialog({
    title = 'Input',
    label = '',
    placeholder = '',
    value = '',
    password = false,
    lang = 'en',
  } = {}) {
    const { BrowserWindow, ipcMain } = require('electron');
    const mainWindow = getMainWindow();
    return await new Promise((resolve) => {
      try {
        const win = new BrowserWindow({
          width: 480,
          height: 200,
          resizable: false,
          minimizable: false,
          maximizable: false,
          modal: true,
          parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
          show: false,
          alwaysOnTop: true,
          title,
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
          visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, '../../prompt_preload.js'),
          },
        });
        try {
          win.setMenuBarVisibility(false);
        } catch {}

        const htmlPath = path.join(__dirname, '../../prompt.html');
        win
          .loadFile(htmlPath)
          .then(() => {
            try {
              win.show();
            } catch {}
            try {
              const theme = String(getPref('UI_THEME') || 'dark');
              win.webContents.send('prompt:init', {
                title,
                label,
                placeholder,
                value,
                password,
                lang,
                theme,
              });
            } catch {}
          })
          .catch(() => resolve(null));

        const cleanup = () => {
          try {
            win.close();
          } catch {}
        };

        const submitHandler = (_e, payload) => {
          try {
            ipcMain.removeListener('prompt:submit', submitHandler);
          } catch {}
          try {
            ipcMain.removeListener('prompt:cancel', cancelHandler);
          } catch {}
          cleanup();
          resolve(typeof payload?.value === 'string' ? payload.value : '');
        };
        const cancelHandler = () => {
          try {
            ipcMain.removeListener('prompt:submit', submitHandler);
          } catch {}
          try {
            ipcMain.removeListener('prompt:cancel', cancelHandler);
          } catch {}
          cleanup();
          resolve(null);
        };
        ipcMain.once('prompt:submit', submitHandler);
        ipcMain.once('prompt:cancel', cancelHandler);

        win.on('closed', () => {
          try {
            ipcMain.removeListener('prompt:submit', submitHandler);
          } catch {}
          try {
            ipcMain.removeListener('prompt:cancel', cancelHandler);
          } catch {}
          resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function createAppMenu() {
    try {
      const ctx = {
        currentLang: getCurrentLanguage(),
        getPref,
        setPref,
        openInputDialog,
        checkForUpdates: () => manualCheckForUpdates(),
        handleLanguageChange: (lang) => settingsController.handleLanguageChange(lang),
        handleThemeChange: (theme) => settingsController.handleThemeChange(theme),
        handleToneChange: (tone) => settingsController.handleToneChange(tone),
        handleWindowOpacityChange: (opacity) =>
          settingsController.handleWindowOpacityChange(opacity),
        handlePinAllSpacesChange: (enabled) => settingsController.handlePinAllSpacesChange(enabled),
        hasPopupWindow: () => windowManager.hasPopupWindow(),
        togglePopupWindow: () => windowManager.togglePopupWindow(),
        rebuild: () => createAppMenu(),
      };
      menuBuilder(ctx);
    } catch (error) {
      if (isDev) console.warn('Failed to create menu:', error?.message);
      try {
        const fallback = Menu.buildFromTemplate([{ role: 'editMenu' }, { role: 'windowMenu' }]);
        Menu.setApplicationMenu(fallback);
      } catch {}
    }
  }

  function resolveApiKeys() {
    const out = [];
    try {
      const prefs = loadPrefs();
      const key = prefs?.GEMINI_API_KEY;
      if (key && String(key).trim()) {
        out.push(String(key).trim());
      }
    } catch {}
    return out;
  }

  let currentAIController = null;
  let currentAIKind = null;
  let currentAICancelFlag = null;

  // Response cache with TTL (5 minutes) and LRU eviction
  class ResponseCache {
    constructor(maxSize = 100, ttlMs = 300000) {
      this.cache = new Map();
      this.maxSize = maxSize;
      this.ttlMs = ttlMs;
    }

    _cleanup() {
      const now = Date.now();
      const toDelete = [];
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          toDelete.push(key);
        }
      }
      for (const key of toDelete) {
        this.cache.delete(key);
      }
    }

    get(key) {
      this._cleanup();
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }
      // Move to end (LRU)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.value;
    }

    set(key, value) {
      this._cleanup();
      // Evict oldest if at capacity
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(key, {
        value,
        expiresAt: Date.now() + this.ttlMs,
      });
    }

    clear() {
      this.cache.clear();
    }
  }

  const responseCache = new ResponseCache();

  function bringMainWindowToFront(mainWindow) {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    try {
      // Reset alwaysOnTop to bring window to front of other alwaysOnTop windows
      const pinAllSpaces = windowManager.readPinAllSpacesPref();
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setAlwaysOnTop(true, pinAllSpaces ? 'screen-saver' : 'floating');

      if (!mainWindow.isVisible()) {
        try {
          showWindowNonActivating(mainWindow);
        } catch {
          mainWindow.show();
        }
      }
      mainWindow.focus();
      return true;
    } catch (err) {
      if (isDev) console.warn('Failed to bring main window to front:', err?.message);
      return false;
    }
  }

  function registerGlobalShortcuts() {
    const registerShortcut = (accel, detailed = false) => {
      try {
        const ok = globalShortcut.register(accel, () => {
          logShortcutEvent('shortcut.trigger', {
            accel,
            kind: detailed ? 'explain_detailed' : 'explain',
          });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();

              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send(
                  detailed ? 'explain-clipboard-detailed' : 'explain-clipboard',
                  text
                );
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {
              if (isDev) console.warn('Clipboard explain failed:', e?.message);
            }
          })();
        });
        return ok;
      } catch (e) {
        logShortcutEvent('shortcut.register.error', { accel, error: e?.message || '' });
        return false;
      }
    };

    const registerUrlShortcut = (accel, detailed = false) => {
      try {
        const ok = globalShortcut.register(accel, () => {
          logShortcutEvent('shortcut.trigger', { accel, kind: detailed ? 'url_detailed' : 'url' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              const url = extractFirstValidUrl(text);
              if (url) {
                mainWindow.webContents.send(
                  detailed ? 'summarize-url-context-detailed' : 'summarize-url-context',
                  url
                );
              } else {
                mainWindow.webContents.send('explain-clipboard-error', 'INVALID_URL_SELECTION');
              }
            } catch (e) {
              if (isDev) console.warn('URL context shortcut failed:', e?.message);
            }
          })();
        });
        return ok;
      } catch (e) {
        logShortcutEvent('shortcut.register.error', { accel, error: e?.message || '' });
        return false;
      }
    };

    const registerEmpathyShortcut = (accel) => {
      try {
        const ok = globalShortcut.register(accel, () => {
          logShortcutEvent('shortcut.trigger', { accel, kind: 'empathy' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('empathize-clipboard', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {
              if (isDev) console.warn('Empathy shortcut failed:', e?.message);
            }
          })();
        });
        return ok;
      } catch (e) {
        logShortcutEvent('shortcut.register.error', { accel, error: e?.message || '' });
        return false;
      }
    };

    const registerReplyShortcut = (accel) => {
      try {
        const ok = globalShortcut.register(accel, () => {
          logShortcutEvent('shortcut.trigger', { accel, kind: 'reply_variations' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('reply-clipboard-variations', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {
              if (isDev) console.warn('Reply variations shortcut failed:', e?.message);
            }
          })();
        });
        return ok;
      } catch (e) {
        logShortcutEvent('shortcut.register.error', { accel, error: e?.message || '' });
        return false;
      }
    };

    const registerSnsPostShortcut = (accel) => {
      try {
        const ok = globalShortcut.register(accel, () => {
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              const url = extractFirstValidUrl(text);
              if (url) {
                mainWindow.webContents.send('sns-post-from-url', url);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', 'INVALID_URL_SELECTION');
              }
            } catch (e) {
              if (isDev) console.warn('SNS post shortcut failed:', e?.message);
            }
          })();
        });
        return ok;
      } catch (e) {
        return false;
      }
    };

    const baseCandidates = ['Alt+A'];
    let baseUsed = '';
    for (const c of baseCandidates) {
      if (registerShortcut(c, false)) {
        baseUsed = c;
        break;
      }
    }

    const detailedCandidates = ['Alt+Shift+A'];
    let detailedUsed = '';
    for (const c of detailedCandidates) {
      if (registerShortcut(c, true)) {
        detailedUsed = c;
        break;
      }
    }

    const urlSummaryCandidates = ['Alt+1'];
    let urlSummaryUsed = '';
    for (const c of urlSummaryCandidates) {
      if (registerUrlShortcut(c, false)) {
        urlSummaryUsed = c;
        break;
      }
    }

    const urlDetailedCandidates = ['Alt+Shift+1'];
    let urlDetailedUsed = '';
    for (const c of urlDetailedCandidates) {
      if (registerUrlShortcut(c, true)) {
        urlDetailedUsed = c;
        break;
      }
    }

    const snsPostCandidates = ['Control+Alt+1', 'Alt+Control+1'];
    let snsPostUsed = '';
    for (const c of snsPostCandidates) {
      if (registerSnsPostShortcut(c)) {
        snsPostUsed = c;
        break;
      }
    }

    const translateCandidates = ['Alt+R'];
    let translateUsed = '';
    for (const c of translateCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'translate' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('translate-clipboard', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {
              if (isDev) console.warn('Clipboard translate failed:', e?.message);
            }
          })();
        });
        if (ok) {
          translateUsed = c;
          break;
        }
      } catch {}
    }

    const empathyCandidates = ['Alt+Command+Z', 'Command+Alt+Z'];
    let empathyUsed = '';
    for (const c of empathyCandidates) {
      if (registerEmpathyShortcut(c)) {
        empathyUsed = c;
        break;
      }
    }

    const replyCandidates = ['Alt+Z'];
    let replyUsed = '';
    for (const c of replyCandidates) {
      if (registerReplyShortcut(c)) {
        replyUsed = c;
        break;
      }
    }

    const pronounceCandidates = ['Alt+Q'];
    let pronounceUsed = '';
    for (const c of pronounceCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'pronounce' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front (especially when clipboard window is active)
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('pronounce-clipboard', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {
              if (isDev) console.warn('Clipboard pronunciation failed:', e?.message);
            }
          })();
        });
        if (ok) {
          pronounceUsed = c;
          break;
        }
      } catch {}
    }

    const screenshotCandidates = ['Alt+S'];
    for (const c of screenshotCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'screenshot' });
          (async () => {
            try {
              const { data, mimeType } = await captureInteractiveArea();
              if (!data) return;
              const mainWindow = getMainWindow();
              if (mainWindow && !mainWindow.isDestroyed()) {
                // Bring window to front (especially when clipboard window is active)
                bringMainWindowToFront(mainWindow);
                mainWindow.webContents.send('explain-screenshot', { data, mimeType });
              }
            } catch (e) {
              if (isDev) console.warn('Screenshot explain failed:', e?.message);
            }
          })();
        });
        if (ok) break;
      } catch {}
    }

    const screenshotDetailedCandidates = ['Alt+Shift+S'];
    for (const c of screenshotDetailedCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'screenshot_detailed' });
          (async () => {
            try {
              const { data, mimeType } = await captureInteractiveArea();
              if (!data) return;
              const mainWindow = getMainWindow();
              if (mainWindow && !mainWindow.isDestroyed()) {
                // Bring window to front (especially when clipboard window is active)
                bringMainWindowToFront(mainWindow);
                mainWindow.webContents.send('explain-screenshot-detailed', { data, mimeType });
              }
            } catch (e) {
              if (isDev) console.warn('Screenshot detailed explain failed:', e?.message);
            }
          })();
        });
        if (ok) break;
      } catch {}
    }

    try {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shortcut-registered', baseUsed);
        mainWindow.webContents.send('shortcut-detailed-registered', detailedUsed);
        mainWindow.webContents.send('shortcut-translate-registered', translateUsed);
        mainWindow.webContents.send('shortcut-pronounce-registered', pronounceUsed);
        mainWindow.webContents.send('shortcut-empathy-registered', empathyUsed);
        mainWindow.webContents.send('shortcut-reply-registered', replyUsed);
        mainWindow.webContents.send('shortcut-url-summary-registered', urlSummaryUsed);
        mainWindow.webContents.send('shortcut-url-detailed-registered', urlDetailedUsed);
        mainWindow.webContents.send('shortcut-sns-post-registered', snsPostUsed);
      }
      logShortcutEvent('shortcut.register.summary', {
        baseUsed,
        detailedUsed,
        translateUsed,
        pronounceUsed,
        empathyUsed,
        replyUsed,
        urlSummaryUsed,
        urlDetailedUsed,
        snsPostUsed,
      });
    } catch {}

    if (!baseUsed && !detailedUsed) {
      if (isDev) console.warn('Failed to register any global shortcut');
    } else if (!baseUsed) {
      if (isDev) console.warn('Base shortcut registration failed; detailed only');
    } else if (!detailedUsed) {
      if (isDev) console.warn('Detailed shortcut registration failed; base only');
    }
  }

  function setupPopupIpcHandlers() {
    ipcMain.handle('popup:pointer', (_e, phase) => {
      return windowManager.handlePopupPointer(phase);
    });
    ipcMain.handle('popup:get-bounds', () => windowManager.getPopupBounds());
    ipcMain.handle('popup:set-position', (_e, pos) => windowManager.setPopupPosition(pos));
  }

  function setupCaptureHandlers() {
    ipcMain.handle('capture:interactive', async () => {
      try {
        const data = await captureInteractiveArea();
        return data;
      } catch (e) {
        return { data: '', mimeType: '', error: e?.message || 'Failed to capture area' };
      }
    });
  }

  function setupUiHandlers() {
    ipcMain.handle('get-model', () => {
      return getPref('GEMINI_MODEL') || 'gemini-flash-lite-latest';
    });

    ipcMain.handle('get-tone', () => {
      return getPref('TONE') || 'casual';
    });

    ipcMain.handle('get-ui-theme', () => {
      return getPref('UI_THEME') || 'dark';
    });

    ipcMain.handle('open-external', (_e, url) => {
      try {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
          shell.openExternal(url);
          return true;
        }
      } catch {}
      return false;
    });

    ipcMain.handle('ui:ensure-visible', (_e, opts) => {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      try {
        const wantFocus = !!(opts && opts.focus);
        if (!mainWindow.isVisible()) {
          try {
            if (wantFocus) mainWindow.show();
            else showWindowNonActivating(mainWindow);
          } catch {
            mainWindow.show();
          }
        }
        if (wantFocus) {
          try {
            mainWindow.focus();
          } catch {}
        }
        return true;
      } catch {}
      return false;
    });

    ipcMain.handle('ui:show-app-menu', (event, pos) => {
      try {
        let menu = Menu.getApplicationMenu();
        if (!menu) {
          createAppMenu();
          menu = Menu.getApplicationMenu();
        }
        if (!menu) return false;
        const win = BrowserWindow.fromWebContents(event.sender);
        const x = Math.max(0, Math.round((pos && pos.x) || 0));
        const y = Math.max(0, Math.round((pos && pos.y) || 0));
        menu.popup({ window: win, x, y });
        return true;
      } catch {
        return false;
      }
    });

    ipcMain.handle('get-ui-language', () => {
      return getPref('MENU_LANGUAGE') || 'en';
    });

    ipcMain.handle('save-web-search-setting', (_e, enabled) => {
      settingsController.handleWebSearchToggle(!!enabled);
      return true;
    });

    ipcMain.handle('save-translate-mode', (_e, mode) => {
      const normalized = String(mode || '').toLowerCase() === 'free' ? 'free' : 'literal';
      settingsController.handleTranslateModeChange(normalized);
      return normalized;
    });

    ipcMain.handle('get-glass-level', () => {
      return getPref('GLASS_LEVEL') || 'medium';
    });

    ipcMain.handle('get-web-search-enabled', () => {
      const v = String(getPref('ENABLE_GOOGLE_SEARCH') || '1');
      return v !== '0' && v.toLowerCase() !== 'false' && v.toLowerCase() !== 'off';
    });

    ipcMain.handle('get-translate-mode', () => {
      const raw = String(getPref('TRANSLATE_MODE') || 'free').toLowerCase();
      return raw === 'free' ? 'free' : 'literal';
    });

    ipcMain.handle('save-image-size', (_e, size) => {
      const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
      const normalized = validSizes.includes(size) ? size : '1:1';
      setPref('IMAGE_SIZE', normalized);
      return normalized;
    });

    ipcMain.handle('get-image-size', () => {
      const raw = String(getPref('IMAGE_SIZE') || '1:1');
      const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
      return validSizes.includes(raw) ? raw : '1:1';
    });

    ipcMain.handle('save-image-count', (_e, count) => {
      const validCounts = [1, 2, 3, 4];
      const normalized = validCounts.includes(count) ? count : 1;
      setPref('IMAGE_COUNT', normalized);
      return normalized;
    });

    ipcMain.handle('get-image-count', () => {
      const raw = parseInt(getPref('IMAGE_COUNT') || '1', 10);
      const validCounts = [1, 2, 3, 4];
      return validCounts.includes(raw) ? raw : 1;
    });

    ipcMain.handle('get-window-opacity', () => {
      const v = parseFloat(getPref('WINDOW_OPACITY') || '1');
      return Number.isFinite(v) ? v : 1;
    });
  }

  function setupUrlContentHandlers() {
    ipcMain.handle('url:fetch-content', async (_event, payload = {}) => {
      try {
        const raw = typeof payload === 'string' ? payload : payload?.url;
        const timeoutMs = Number.isFinite(payload?.timeoutMs)
          ? Number(payload.timeoutMs)
          : undefined;
        const maxLength = Number.isFinite(payload?.maxLength)
          ? Number(payload.maxLength)
          : undefined;
        const result = await fetchUrlContent(raw, { timeoutMs, maxLength });
        return result;
      } catch (error) {
        return { error: error?.message || 'Failed to fetch URL content' };
      }
    });
  }

  function setupClipboardHandlers() {
    const { getClipboardHistoryService } = require('../services/clipboardHistory');
    const clipboardService = getClipboardHistoryService();

    // Start monitoring clipboard on app start
    clipboardService.startMonitoring();

    // Listen for history updates and notify all clipboard windows
    clipboardService.on('history-updated', (history) => {
      try {
        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach((win) => {
          try {
            if (!win.isDestroyed() && win.webContents) {
              const url = win.webContents.getURL();
              if (url && url.includes('clipboard.html')) {
                win.webContents.send('clipboard:history-updated', history);
              }
            }
          } catch (err) {
            // Ignore errors for individual windows
          }
        });
      } catch (err) {
        console.error('Error notifying clipboard windows:', err);
      }
    });

    ipcMain.handle('clipboard:get-history', () => {
      return clipboardService.getHistory();
    });

    ipcMain.handle('clipboard:clear-history', () => {
      clipboardService.clearHistory();
      return true;
    });

    ipcMain.handle('clipboard:copy', (_e, item) => {
      return clipboardService.copyToClipboard(item);
    });

    ipcMain.handle('clipboard:delete-item', (_e, id) => {
      clipboardService.deleteItem(id);
      return true;
    });

    ipcMain.handle('clipboard:open-window', () => {
      try {
        windowManager.createClipboardWindow();
        return true;
      } catch (err) {
        console.error('Error opening clipboard window:', err);
        return false;
      }
    });

    ipcMain.handle('clipboard:hide-windows', () => {
      try {
        windowManager.hideClipboardWindows();
        return true;
      } catch (err) {
        console.error('Error hiding clipboard windows:', err);
        return false;
      }
    });

    ipcMain.handle('clipboard:show-windows', () => {
      try {
        windowManager.showClipboardWindows();
        return true;
      } catch (err) {
        console.error('Error showing clipboard windows:', err);
        return false;
      }
    });

    ipcMain.handle('clipboard:show-context-menu', (event) => {
      const menu = Menu.buildFromTemplate([
        {
          label: 'Clear All',
          click: () => {
            clipboardService.clearHistory();
          },
        },
      ]);
      menu.popup(BrowserWindow.fromWebContents(event.sender));
    });

    // Snippet data persistence
    const snippetDataPath = path.join(app.getPath('userData'), 'snippets.json');

    ipcMain.handle('snippet:get-data', () => {
      try {
        if (fs.existsSync(snippetDataPath)) {
          const data = fs.readFileSync(snippetDataPath, 'utf8');
          return JSON.parse(data);
        }
        return null;
      } catch (err) {
        console.error('Error loading snippet data:', err);
        return null;
      }
    });

    ipcMain.handle('snippet:save-data', (_e, data) => {
      try {
        fs.writeFileSync(snippetDataPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
      } catch (err) {
        console.error('Error saving snippet data:', err);
        return false;
      }
    });

    // Clipboard window state persistence
    const clipboardStatePath = path.join(app.getPath('userData'), 'clipboard-state.json');

    ipcMain.handle('clipboard:get-state', () => {
      try {
        if (fs.existsSync(clipboardStatePath)) {
          const data = fs.readFileSync(clipboardStatePath, 'utf8');
          return JSON.parse(data);
        }
        return null;
      } catch (err) {
        console.error('Error loading clipboard state:', err);
        return null;
      }
    });

    ipcMain.handle('clipboard:save-state', (_e, state) => {
      try {
        fs.writeFileSync(clipboardStatePath, JSON.stringify(state, null, 2), 'utf8');
        return true;
      } catch (err) {
        console.error('Error saving clipboard state:', err);
        return false;
      }
    });
  }

  function setupAiHandlers() {
    ipcMain.handle('cancel-ai', (_e, payload = {}) => {
      const { fromShortcut } = payload || {};
      try {
        if (currentAIController) {
          if (fromShortcut && currentAIKind === 'shortcut') {
            if (currentAICancelFlag) currentAICancelFlag.user = true;
            currentAIController.abort();
            return true;
          }
          if (!fromShortcut) {
            currentAIController.abort();
            return true;
          }
        }
      } catch {}
      return false;
    });

    // Common AI generation handler for both text and image
    async function handleAIGeneration(payload, imageData = null) {
      try {
        const keys = resolveApiKeys();
        if (!keys.length) {
          return 'API key is not set. Please set GEMINI_API_KEY.';
        }
        const prompt = String(payload?.prompt ?? '');
        const hasImage = imageData && imageData.imageBase64;
        if (!prompt || (hasImage && !imageData.imageBase64)) return '';

        const source = String(payload?.source || 'chat');
        const isShortcut = source === 'shortcut' || payload?.fromShortcut === true;
        const requestedModel = String(
          payload?.model || getPref('GEMINI_MODEL') || 'gemini-flash-lite-latest'
        );
        const useGoogleSearch = payload?.useWebSearch === true;

        // Check cache for non-shortcut requests
        if (!isShortcut) {
          const imageHash = hasImage ? imageData.imageBase64.substring(0, 32) : 'no-image';
          const cacheKey = `${prompt}-${requestedModel}-${useGoogleSearch}-${imageHash}`;
          const cached = responseCache.get(cacheKey);
          if (cached) {
            return cached;
          }
        }
        let generationConfig = payload?.generationConfig || {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        };
        if (isShortcut) {
          const cap = 2048;
          generationConfig = {
            ...generationConfig,
            maxOutputTokens: Math.min(cap, Number(generationConfig.maxOutputTokens || 2048)),
            topK: Math.min(40, Number(generationConfig.topK || 40)),
            topP: Math.min(0.95, Number(generationConfig.topP || 0.95)),
          };
        }
        const searchPreferred = getPref('WEB_SEARCH_MODEL') || 'gemini-2.5-flash';
        const modelsToTry =
          requestedModel === searchPreferred ? [requestedModel] : [requestedModel, searchPreferred];

        const isInvalid = (msg) => /API_KEY_INVALID|API key not valid/i.test(String(msg || ''));
        const errorLog = [];

        const tryOne = async (key) => {
          let client = null;
          try {
            client = await getGenAIClientForKey(key);
          } catch (e) {
            if (isDev) console.log('SDK client creation failed:', e?.message);
          }

          const controller = new AbortController();
          const cancelFlag = { user: false };
          const timeoutMs = useGoogleSearch ? 60000 : hasImage ? 45000 : 30000;
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          currentAIController = controller;
          currentAIKind = isShortcut ? 'shortcut' : 'chat';
          currentAICancelFlag = cancelFlag;

          try {
            for (const modelName of modelsToTry) {
              const bare = modelCandidates(modelName)[0].replace(/^models\//, '');

              // Try SDK first (for all requests including shortcuts)
              if (client) {
                try {
                  const r1 = hasImage
                    ? await sdkGenerateImage(
                        client,
                        modelName,
                        prompt,
                        imageData.imageBase64,
                        imageData.mimeType,
                        generationConfig,
                        { useGoogleSearch }
                      )
                    : await sdkGenerateText(client, modelName, prompt, generationConfig, {
                        useGoogleSearch,
                      });
                  if (r1) {
                    clearTimeout(timeoutId);
                    return r1;
                  }
                } catch (e) {
                  errorLog.push({
                    model: modelName,
                    method: 'SDK',
                    error: e?.message || 'Unknown',
                  });
                  if (isDev) console.log(`SDK failed for ${modelName}:`, e?.message);
                }
              }

              // Try REST as fallback only (if SDK failed or unavailable)
              try {
                const r2 = hasImage
                  ? await restGenerateImage(
                      key,
                      bare,
                      prompt,
                      imageData.imageBase64,
                      imageData.mimeType,
                      generationConfig,
                      { useGoogleSearch, signal: controller.signal }
                    )
                  : await restGenerateText(key, bare, prompt, generationConfig, {
                      useGoogleSearch,
                      signal: controller.signal,
                    });
                if (r2) {
                  clearTimeout(timeoutId);
                  return r2;
                }
              } catch (e) {
                const m = e?.message || '';
                if (isInvalid(m)) {
                  clearTimeout(timeoutId);
                  throw new Error('API_KEY_INVALID');
                }
                if (e.name === 'AbortError') {
                  clearTimeout(timeoutId);
                  if (cancelFlag.user) throw new Error('CANCELLED');
                  throw new Error('Request timed out');
                }
                errorLog.push({ model: modelName, method: 'REST', error: m });
                if (isDev) console.log(`REST failed for ${modelName}:`, m);
              }
            }

            clearTimeout(timeoutId);
            // Generate detailed error message
            const errorTypes = {
              timeout: errorLog.filter((e) => /timed? ?out|timeout/i.test(e.error)).length,
              rateLimit: errorLog.filter((e) => /rate limit|quota|too many requests/i.test(e.error))
                .length,
              modelNotFound: errorLog.filter((e) => /model.*not found|404/i.test(e.error)).length,
              permission: errorLog.filter((e) => /permission|403|forbidden/i.test(e.error)).length,
            };
            const models = [...new Set(errorLog.map((e) => e.model))].join(', ');
            let suggestion = 'Please check your API key and model settings.';
            if (errorTypes.timeout > 0) {
              suggestion =
                'The request timed out. Try again later, or disable web search if enabled.';
            } else if (errorTypes.rateLimit > 0) {
              suggestion = 'API rate limit exceeded. Please wait a moment and try again.';
            } else if (errorTypes.modelNotFound > 0) {
              suggestion = `Model(s) not found: ${models}. Check your GEMINI_MODEL setting.`;
            } else if (errorTypes.permission > 0) {
              suggestion = 'Permission denied. Verify your API key has access to the model.';
            }
            throw new Error(`All model attempts failed. Tried: ${models}. ${suggestion}`);
          } catch (e) {
            clearTimeout(timeoutId);
            throw e;
          } finally {
            try {
              if (currentAIController === controller) {
                currentAIController = null;
                currentAIKind = null;
                currentAICancelFlag = null;
              }
            } catch {}
          }
        };

        // Try keys in parallel (max 2 at a time for efficiency)
        const maxParallel = Math.min(2, keys.length);
        for (let i = 0; i < keys.length; i += maxParallel) {
          const batch = keys.slice(i, i + maxParallel);
          const promises = batch.map((key) =>
            tryOne(key)
              .then((result) => ({ status: 'fulfilled', value: result }))
              .catch((error) => ({ status: 'rejected', reason: error }))
          );

          const results = await Promise.all(promises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              // Cache successful non-shortcut responses
              if (!isShortcut) {
                const imageHash = hasImage ? imageData.imageBase64.substring(0, 32) : 'no-image';
                const cacheKey = `${prompt}-${requestedModel}-${useGoogleSearch}-${imageHash}`;
                responseCache.set(cacheKey, result.value);
              }
              return result.value;
            }
          }

          // Check if we should stop early due to non-auth errors
          for (const result of results) {
            if (result.status === 'rejected') {
              const errMsg = String(result.reason?.message || '');
              if (errMsg !== 'API_KEY_INVALID') {
                return `API error occurred: ${errMsg || 'Unknown error'}`;
              }
            }
          }
        }
        return 'API error occurred: No valid Gemini API key found. Please set a valid key (e.g., GEMINI_API_KEY).';
      } catch (err) {
        return `API error occurred: ${err?.message || 'Unknown error'}`;
      }
    }

    ipcMain.handle('ai:generate', async (_e, payload) => {
      return handleAIGeneration(payload, null);
    });

    ipcMain.handle('ai:generate-with-image', async (_e, payload) => {
      const imageBase64 = String(payload?.imageBase64 || '');
      const mimeType = String(payload?.mimeType || 'image/png');
      return handleAIGeneration(payload, { imageBase64, mimeType });
    });

    ipcMain.handle('ai:generate-image-from-text', async (_e, payload) => {
      try {
        const keys = resolveApiKeys();
        if (!keys.length) {
          return { error: 'API key is not set. Please set GEMINI_API_KEY.' };
        }

        const prompt = String(payload?.prompt ?? '');
        if (!prompt) {
          return { error: 'Prompt is required.' };
        }

        const aspectRatio = String(payload?.aspectRatio || '1:1');
        const generationConfig = payload?.generationConfig || {
          temperature: 0.95,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        };

        // Check if reference image is provided
        const referenceImage = payload?.referenceImage;
        const referenceMimeType = payload?.referenceMimeType;
        const hasReferenceImage = referenceImage && referenceMimeType;

        const modelName = 'gemini-2.5-flash-image';
        const errorLog = [];

        // Create AbortController for cancellation and timeout
        const controller = new AbortController();
        const timeoutMs = 60000; // 60 seconds for image generation
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // Set as current AI controller for cancel functionality
        currentAIController = controller;
        currentAIKind = 'chat';

        try {
          for (const key of keys) {
            try {
              let result;

              if (hasReferenceImage) {
                // Use reference image-based generation
                result = await restGenerateImageFromTextWithReference(
                  key,
                  modelName,
                  prompt,
                  referenceImage,
                  referenceMimeType,
                  generationConfig,
                  {
                    aspectRatio,
                    signal: controller.signal,
                  }
                );
              } else {
                // Standard text-to-image generation
                result = await restGenerateImageFromText(key, modelName, prompt, generationConfig, {
                  aspectRatio,
                  signal: controller.signal,
                });
              }

              if (result && result.imageData) {
                clearTimeout(timeoutId);
                return {
                  imageBase64: result.imageData,
                  mimeType: result.mimeType || 'image/png',
                };
              }
            } catch (err) {
              const msg = String(err?.message || 'Unknown error');
              errorLog.push(`Key ${key.substring(0, 8)}...: ${msg}`);

              if (/API_KEY_INVALID|API key not valid/i.test(msg)) {
                continue;
              }

              // If aborted, return error immediately
              if (err.name === 'AbortError') {
                clearTimeout(timeoutId);
                return { error: 'Image generation was cancelled or timed out.' };
              }

              throw err;
            }
          }

          clearTimeout(timeoutId);
          return {
            error: `Image generation failed: ${errorLog.join('; ')}`,
          };
        } finally {
          clearTimeout(timeoutId);
          currentAIController = null;
        }
      } catch (err) {
        return {
          error: `Image generation error: ${err?.message || 'Unknown error'}`,
        };
      }
    });
  }

  function setupRendererSync() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const payload = {
      menuLanguage: getPref('MENU_LANGUAGE') || 'en',
      uiTheme: getPref('UI_THEME') || 'dark',
      tone: getPref('TONE') || 'casual',
      translateMode: (() => {
        const raw = String(getPref('TRANSLATE_MODE') || 'free').toLowerCase();
        return raw === 'free' ? 'free' : 'literal';
      })(),
    };
    const send = () => {
      try {
        mainWindow.webContents.send('app-config', payload);
      } catch {}
    };
    try {
      if (mainWindow.webContents.isLoading && mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', send);
      } else {
        send();
      }
    } catch {
      send();
    }
  }

  app.whenReady().then(async () => {
    try {
      if (process.platform === 'darwin' && typeof app.setAboutPanelOptions === 'function') {
        app.setAboutPanelOptions({
          applicationName: 'IrukaDark',
          applicationVersion: app.getVersion(),
          iconPath: path.resolve(__dirname, '../../renderer/assets/icons/icon.png'),
        });
      }
    } catch {}

    windowManager.createMainWindow();
    createAppMenu();
    registerGlobalShortcuts();
    setupPopupIpcHandlers();
    setupCaptureHandlers();
    setupUiHandlers();
    setupUrlContentHandlers();
    setupClipboardHandlers();
    setupAiHandlers();
    setupRendererSync();
    try {
      setupAutoUpdates();
    } catch {}

    try {
      const { preflightPermissionsOnce } = require('../permissions');
      setTimeout(() => {
        try {
          preflightPermissionsOnce({
            loadPrefs,
            savePrefs,
            bringAppToFront: () => windowManager.bringAppToFront(),
          });
        } catch {}
      }, 400);
    } catch {}

    try {
      const trusted = systemPreferences.isTrustedAccessibilityClient(false);
      const mainWindow = getMainWindow();
      if (!trusted && mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          try {
            mainWindow.webContents.send('accessibility-warning');
          } catch {}
        }, 800);
      }
    } catch {}

    try {
      setTimeout(async () => {
        try {
          const keys = resolveApiKeys();
          if (keys && keys.length) {
            await getGenAIClientForKey(keys[0]).catch(() => {});
          }
        } catch {}
      }, 0);
    } catch {}
  });

  app.on('window-all-closed', () => {
    // macOS apps typically stay open until explicitly quit
  });

  app.on('before-quit', () => {
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
      for (const w of wins) {
        try {
          w.removeAllListeners('close');
        } catch {}
        try {
          if (!w.isDestroyed()) w.close();
        } catch {}
      }
    } catch {}
  });

  app.on('will-quit', () => {
    try {
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
      for (const w of wins) {
        try {
          if (!w.isDestroyed()) w.destroy();
        } catch {}
      }
    } catch {}
    try {
      globalShortcut.unregisterAll();
    } catch {}
  });

  app.on('quit', () => {
    try {
      setPopupWindow(null);
    } catch {}
    try {
      setMainWindow(null);
    } catch {}
  });

  app.on('activate', () => {
    if (!getMainWindow() || getMainWindow().isDestroyed()) {
      windowManager.createMainWindow();
    }
  });
}

module.exports = {
  bootstrapApp,
};
