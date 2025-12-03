/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const {
  app,
  ipcMain,
  systemPreferences,
  Menu,
  Tray,
  globalShortcut,
  BrowserWindow,
  shell,
  screen,
  nativeImage,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');

const { loadPrefs, savePrefs, setPref, getPref } = require('../services/preferences');
const { WindowManager } = require('../windows/windowManager');
const { SettingsController } = require('../services/settingsController');
const { createAppMenu, createTrayMenu } = require('../menu');
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
  sdkGenerateText,
  sdkGenerateImage,
  sdkGenerateImageFromText,
  sdkGenerateImageFromTextWithReference,
  restGenerateVideoFromText,
} = require('../ai');
const { getMainWindow, setMainWindow, setPopupWindow, getPopupWindow } = require('../context');
const { setupAutoUpdates, manualCheckForUpdates } = require('../updates');
const { AppScanner } = require('../services/appScanner');
const { FileSearchService } = require('../services/fileSearch');
const { SystemCommandsService } = require('../services/systemCommands');
const TerminalService = require('../services/terminalService');
const {
  isClipboardPopupActive,
  closeClipboardPopup,
  updateClipboardPopup,
  startClipboardDaemon,
  stopClipboardDaemon,
  getDaemonState,
  showClipboardPopupFast,
  hideClipboardPopupFast,
  spawnVoiceQuery,
  isVoiceQueryActive,
} = require('../services/macAutomationBridge');
const { getClipboardHistoryService } = require('../services/clipboardHistory');

// Import shared shortcut constants and validation functions
const {
  DEFAULT_SHORTCUTS,
  isReservedShortcut,
  isValidShortcutFormat,
  isValidAction,
} = require('../../shared/shortcutDefaults');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// PERFORMANCE: V8 optimization flags
// - In production: larger heap for smoother operation, no --expose-gc overhead
// - In development: expose-gc for debugging memory issues
if (isDev) {
  app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=2048');
} else {
  // Production: faster startup, no GC exposure overhead
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=2048');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding'); // Keep renderer active
app.commandLine.appendSwitch('disable-background-timer-throttling'); // No throttling

// PERFORMANCE: Periodic garbage collection to prevent memory leaks (dev only)
let gcInterval = null;
function setupPeriodicGC() {
  // Only run periodic GC in development mode when --expose-gc is available
  if (!isDev || !global.gc) return;
  if (gcInterval) return;

  gcInterval = setInterval(() => {
    try {
      const memUsage = process.memoryUsage();
      // Only run GC if heap usage exceeds 500MB
      if (memUsage.heapUsed > 500 * 1024 * 1024) {
        global.gc();
      }
    } catch (err) {}
  }, 120000); // Every 2 minutes (less aggressive)
}

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

  // PERFORMANCE: Wrapper for setPref to invalidate cache
  const setPrefWithCacheInvalidation = (key, value) => {
    setPref(key, value);
    prefCache.invalidate(key);
  };

  const settingsController = new SettingsController({
    windowManager,
    menuRefresher: () => buildAppMenu(),
    setPref: setPrefWithCacheInvalidation,
    getPref,
  });

  // PERFORMANCE: Lazy-load launcher services (defer initialization until first use)
  let appScanner = null;
  let fileSearch = null;
  let systemCommands = null;
  let terminalService = null;

  async function getAppScanner() {
    if (!appScanner) {
      appScanner = new AppScanner();
      // Start background scanning only when first accessed
      try {
        await appScanner.scanApplications();
      } catch (err) {}
    }
    return appScanner;
  }

  function getFileSearch() {
    if (!fileSearch) {
      fileSearch = new FileSearchService();
    }
    return fileSearch;
  }

  function getSystemCommands() {
    if (!systemCommands) {
      systemCommands = new SystemCommandsService();
    }
    return systemCommands;
  }

  function getTerminalService() {
    if (!terminalService) {
      terminalService = new TerminalService();
    }
    return terminalService;
  }

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

  function buildAppMenu() {
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
        handleAutoStartChange: (enabled) => settingsController.handleAutoStartChange(enabled),
        hasPopupWindow: () => windowManager.hasPopupWindow(),
        togglePopupWindow: () => windowManager.togglePopupWindow(),
        showMainWindow: () => windowManager.bringAppToFront(),
        rebuild: () => buildAppMenu(),
      };
      createAppMenu(ctx);
    } catch (error) {
      try {
        const fallback = Menu.buildFromTemplate([{ role: 'editMenu' }, { role: 'windowMenu' }]);
        Menu.setApplicationMenu(fallback);
      } catch {}
    }
  }

  let tray = null;

  function createTrayIcon() {
    const iconPath = path.join(__dirname, '../../renderer/assets/icons/icon.png');

    if (process.platform === 'darwin') {
      let icon;
      if (fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      } else {
        icon = nativeImage.createFromNamedImage('NSApplicationIcon', [16, 16, 32, 32]);
      }
      icon.setTemplateImage(true);
      return icon;
    }

    return nativeImage.createFromPath(iconPath);
  }

  function buildTrayMenuContext() {
    return {
      getPref,
      handleAutoStartChange: (enabled) => {
        settingsController.handleAutoStartChange(enabled);
        buildAppMenu();
        updateTrayMenu();
      },
      showMainWindow: () => {
        windowManager.bringAppToFront();
        // Update tray menu after showing to display "Hide" option
        updateTrayMenu();
      },
      hideMainWindow: () => {
        try {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.hide();
            // Update tray menu after hiding to show "Show" option
            updateTrayMenu();
          }
        } catch (err) {}
      },
      isMainWindowVisible: () => {
        try {
          const mainWindow = getMainWindow();
          return mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
        } catch (err) {
          return false;
        }
      },
    };
  }

  function initializeTray() {
    try {
      if (tray && !tray.isDestroyed()) return;

      tray = new Tray(createTrayIcon());
      tray.setToolTip('IrukaDark');
      tray.setContextMenu(createTrayMenu(buildTrayMenuContext()));

      // Removed automatic window showing on tray click
      // Users can use the tray menu to show/hide the window
    } catch (error) {}
  }

  function updateTrayMenu() {
    try {
      if (!tray || tray.isDestroyed()) return;
      tray.setContextMenu(createTrayMenu(buildTrayMenuContext()));
    } catch (error) {}
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

  // PERFORMANCE: Preference cache to reduce IPC overhead (TTL: 2 seconds)
  class PreferenceCache {
    constructor(ttlMs = 2000) {
      this.cache = new Map();
      this.ttlMs = ttlMs;
    }

    get(key) {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }
      return entry.value;
    }

    set(key, value) {
      this.cache.set(key, {
        value,
        expiresAt: Date.now() + this.ttlMs,
      });
    }

    invalidate(key) {
      if (key) {
        this.cache.delete(key);
      } else {
        this.cache.clear();
      }
    }
  }

  // Performance optimization: extend TTL to 5 seconds for faster shortcut responses
  const prefCache = new PreferenceCache(5000);

  function bringMainWindowToFront(mainWindow) {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    try {
      // Performance optimization: skip if already focused and visible on top
      if (mainWindow.isVisible() && mainWindow.isFocused() && mainWindow.isAlwaysOnTop()) {
        return true; // Already in desired state
      }

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

      // Also show popup if sync setting is enabled
      windowManager.showPopupIfSyncEnabled();

      return true;
    } catch (err) {
      return false;
    }
  }

  function registerGlobalShortcuts(silent = false) {
    // Load shortcut assignments from preferences
    const savedAssignments = getPref('SHORTCUT_ASSIGNMENTS') || {};
    const shortcuts = { ...DEFAULT_SHORTCUTS, ...savedAssignments };

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

              // Bring window to front
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send(
                  detailed ? 'explain-clipboard-detailed' : 'explain-clipboard',
                  text
                );
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {}
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

              // Bring window to front
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
            } catch (e) {}
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

              // Bring window to front
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('reply-clipboard-variations', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {}
          })();
        });
        return ok;
      } catch (e) {
        logShortcutEvent('shortcut.register.error', { accel, error: e?.message || '' });
        return false;
      }
    };

    // Register shortcuts from settings
    const baseUsed =
      shortcuts.explain && registerShortcut(shortcuts.explain, false) ? shortcuts.explain : '';
    const detailedUsed =
      shortcuts.explainDetailed && registerShortcut(shortcuts.explainDetailed, true)
        ? shortcuts.explainDetailed
        : '';
    const urlSummaryUsed =
      shortcuts.urlSummary && registerUrlShortcut(shortcuts.urlSummary, false)
        ? shortcuts.urlSummary
        : '';
    const urlDetailedUsed =
      shortcuts.urlDetailed && registerUrlShortcut(shortcuts.urlDetailed, true)
        ? shortcuts.urlDetailed
        : '';

    // Register translate shortcut
    let translateUsed = '';
    if (shortcuts.translate) {
      try {
        const c = shortcuts.translate;
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'translate' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              // Bring window to front
              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('translate-clipboard', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {}
          })();
        });
        if (ok) translateUsed = c;
      } catch {}
    }

    const replyUsed =
      shortcuts.reply && registerReplyShortcut(shortcuts.reply) ? shortcuts.reply : '';

    // Register screenshot shortcut
    if (shortcuts.screenshot) {
      try {
        const c = shortcuts.screenshot;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'screenshot' });
          (async () => {
            try {
              const { data, mimeType } = await captureInteractiveArea();
              if (!data) return;
              const mainWindow = getMainWindow();
              if (mainWindow && !mainWindow.isDestroyed()) {
                // Bring window to front
                bringMainWindowToFront(mainWindow);
                mainWindow.webContents.send('explain-screenshot', { data, mimeType });
              }
            } catch (e) {}
          })();
        });
      } catch {}
    }

    // Register screenshot detailed shortcut
    if (shortcuts.screenshotDetailed) {
      try {
        const c = shortcuts.screenshotDetailed;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'screenshot_detailed' });
          (async () => {
            try {
              const { data, mimeType } = await captureInteractiveArea();
              if (!data) return;
              const mainWindow = getMainWindow();
              if (mainWindow && !mainWindow.isDestroyed()) {
                // Bring window to front
                bringMainWindowToFront(mainWindow);
                mainWindow.webContents.send('explain-screenshot-detailed', { data, mimeType });
              }
            } catch (e) {}
          })();
        });
      } catch {}
    }

    // Register slide image generation shortcut
    let slideImageUsed = '';
    if (shortcuts.slideImage) {
      try {
        const c = shortcuts.slideImage;
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'slide_image' });
          (async () => {
            try {
              const mainWindow = getMainWindow();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;

              bringMainWindowToFront(mainWindow);

              if (text) {
                mainWindow.webContents.send('generate-slide-image', text);
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {}
          })();
        });
        if (ok) slideImageUsed = c;
      } catch {}
    }

    // Move popup window to cursor position shortcut
    if (shortcuts.moveToCursor) {
      try {
        const c = shortcuts.moveToCursor;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'move_to_cursor' });
          try {
            const popupWindow = getPopupWindow();
            if (!popupWindow || popupWindow.isDestroyed()) return;

            // Get cursor position
            const cursorPoint = screen.getCursorScreenPoint();

            // Get window size
            const [width, height] = popupWindow.getSize();

            // Calculate position so window center is at cursor
            const x = Math.round(cursorPoint.x - width / 2);
            const y = Math.round(cursorPoint.y - height / 2);

            // Move popup window to cursor position
            popupWindow.setPosition(x, y);

            // Bring popup window to front
            if (!popupWindow.isVisible()) {
              popupWindow.show();
            }
            popupWindow.focus();
          } catch (e) {}
        });
      } catch {}
    }

    // Reset popup to initial position shortcut
    if (shortcuts.resetPosition) {
      try {
        const c = shortcuts.resetPosition;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'reset_to_initial' });
          try {
            windowManager.resetPopupToInitialPosition();
          } catch (e) {}
        });
      } catch {}
    }

    // Clipboard history popup shortcut (toggle behavior)
    if (shortcuts.clipboardPopup) {
      try {
        const c = shortcuts.clipboardPopup;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'clipboard_popup_toggle' });
          (async () => {
            try {
              // Only on macOS
              if (process.platform !== 'darwin') return;

              const daemonState = getDaemonState();

              // Toggle behavior: if daemon popup is showing, hide it
              if (daemonState === 'showing') {
                hideClipboardPopupFast();
                return;
              }

              // Check if legacy popup is already active
              if (isClipboardPopupActive()) {
                // Close the popup
                closeClipboardPopup();
                return;
              }

              // Get clipboard history
              const clipboardService = getClipboardHistoryService();
              const history = clipboardService.getHistory();

              if (!history || history.length === 0) {
                return;
              }

              // Get theme and opacity settings
              const theme = getPref('UI_THEME') || 'dark';
              const isDarkMode = theme === 'dark';
              const opacity = parseFloat(getPref('WINDOW_OPACITY') || '1');

              const result = await showClipboardPopupFast(history, {
                isDarkMode,
                opacity,
              });

              // If an item was pasted (from legacy spawn), track it to prevent re-adding to history
              if (result && result.payload && result.payload.code === 'item_pasted') {
                const pastedText = result.payload.text;
                const pastedImageOriginal = result.payload.imageDataOriginal;

                clipboardService.lastProgrammaticText = pastedText || null;

                // Calculate image hash if image was pasted
                if (pastedImageOriginal) {
                  clipboardService.lastProgrammaticImageHash =
                    clipboardService.getImageHash(pastedImageOriginal);
                } else {
                  clipboardService.lastProgrammaticImageHash = null;
                }

                clipboardService.programmaticSetTime = Date.now();
              }
            } catch (e) {}
          })();
        });
      } catch (e) {}
    }

    // Snippet popup shortcut (toggle behavior, opens snippet tab)
    if (shortcuts.snippetPopup) {
      try {
        const c = shortcuts.snippetPopup;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'snippet_popup_toggle' });
          (async () => {
            try {
              // Only on macOS
              if (process.platform !== 'darwin') return;

              const daemonState = getDaemonState();

              // Toggle behavior: if daemon popup is showing, hide it
              if (daemonState === 'showing') {
                hideClipboardPopupFast();
                return;
              }

              // Check if legacy popup is already active
              if (isClipboardPopupActive()) {
                // Close the popup
                closeClipboardPopup();
                return;
              }

              // Get clipboard history
              const clipboardService = getClipboardHistoryService();
              const history = clipboardService.getHistory();

              // Get theme and opacity settings
              const theme = getPref('UI_THEME') || 'dark';
              const isDarkMode = theme === 'dark';
              const opacity = parseFloat(getPref('WINDOW_OPACITY') || '1');

              // Show popup with snippet tab active and focused
              const result = await showClipboardPopupFast(history, {
                isDarkMode,
                opacity,
                activeTab: 'snippet',
              });

              // If an item was pasted (from legacy spawn), track it to prevent re-adding to history
              if (result && result.payload && result.payload.code === 'item_pasted') {
                const pastedText = result.payload.text;
                const pastedImageOriginal = result.payload.imageDataOriginal;

                clipboardService.lastProgrammaticText = pastedText || null;

                // Calculate image hash if image was pasted
                if (pastedImageOriginal) {
                  clipboardService.lastProgrammaticImageHash =
                    clipboardService.getImageHash(pastedImageOriginal);
                } else {
                  clipboardService.lastProgrammaticImageHash = null;
                }

                clipboardService.programmaticSetTime = Date.now();
              }
            } catch (e) {}
          })();
        });
      } catch (e) {}
    }

    // Toggle main window shortcut
    if (shortcuts.toggleMainWindow) {
      try {
        const c = shortcuts.toggleMainWindow;
        globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'toggle_main_window' });
          try {
            windowManager.toggleBothWindows();
          } catch (e) {}
        });
      } catch (e) {}
    }

    // Voice query shortcut (screen capture + voice input)
    let voiceQueryUsed = '';
    if (shortcuts.voiceQuery) {
      try {
        const c = shortcuts.voiceQuery;
        const ok = globalShortcut.register(c, () => {
          logShortcutEvent('shortcut.trigger', { accel: c, kind: 'voice_query' });
          (async () => {
            try {
              // Only on macOS
              if (process.platform !== 'darwin') return;

              // Prevent rapid triggers - ignore if already active
              if (isVoiceQueryActive()) {
                logShortcutEvent('shortcut.voiceQuery.alreadyActive');
                return;
              }

              // Get popup bounds for indicator positioning (may be null if popup not visible)
              const popupBounds = windowManager.getPopupBounds();

              await spawnVoiceQuery({
                popupBounds: popupBounds || null,
                onComplete: ({ screenshotBase64, mimeType, transcribedText }) => {
                  const mainWindow = getMainWindow();
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    bringMainWindowToFront(mainWindow);
                    mainWindow.webContents.send('voice-query-complete', {
                      data: screenshotBase64,
                      mimeType,
                      query: transcribedText,
                    });
                  }
                },
                onError: (error) => {
                  const mainWindow = getMainWindow();
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('voice-query-error', error);
                  }
                },
              });
            } catch (e) {
              logShortcutEvent('shortcut.voiceQuery.error', { error: e?.message || '' });
            }
          })();
        });
        if (ok) {
          voiceQueryUsed = c;
          logShortcutEvent('shortcut.register.voiceQuery.success', { accel: c });
        } else {
          logShortcutEvent('shortcut.register.voiceQuery.failed', { accel: c });
        }
      } catch (e) {
        logShortcutEvent('shortcut.register.voiceQuery.exception', { error: e?.message || '' });
      }
    }

    try {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && !silent) {
        mainWindow.webContents.send('shortcut-registered', baseUsed);
        mainWindow.webContents.send('shortcut-detailed-registered', detailedUsed);
        mainWindow.webContents.send('shortcut-translate-registered', translateUsed);
        mainWindow.webContents.send('shortcut-reply-registered', replyUsed);
        mainWindow.webContents.send('shortcut-url-summary-registered', urlSummaryUsed);
        mainWindow.webContents.send('shortcut-url-detailed-registered', urlDetailedUsed);
        mainWindow.webContents.send('shortcut-slide-image-registered', slideImageUsed);
      }
      logShortcutEvent('shortcut.register.summary', {
        baseUsed,
        detailedUsed,
        translateUsed,
        replyUsed,
        urlSummaryUsed,
        urlDetailedUsed,
        slideImageUsed,
        voiceQueryUsed,
      });
    } catch {}

    if (!baseUsed && !detailedUsed) {
    } else if (!baseUsed) {
    } else if (!detailedUsed) {
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
    // PERFORMANCE: Batched preference getter to reduce IPC calls
    ipcMain.handle('get-preferences-batch', (_e, keys) => {
      const result = {};
      const keysArray = Array.isArray(keys) ? keys : [];

      for (const key of keysArray) {
        // Check cache first
        const cached = prefCache.get(key);
        if (cached !== null) {
          result[key] = cached;
        } else {
          // Get from preferences and cache
          const value = getPref(key);
          prefCache.set(key, value);
          result[key] = value;
        }
      }

      return result;
    });

    ipcMain.handle('get-model', () => {
      const cached = prefCache.get('GEMINI_MODEL');
      if (cached !== null) return cached || 'gemini-flash-lite-latest';

      const value = getPref('GEMINI_MODEL') || 'gemini-flash-lite-latest';
      prefCache.set('GEMINI_MODEL', value);
      return value;
    });

    ipcMain.handle('set-model', (_e, model) => {
      const value = String(model || 'gemini-flash-lite-latest').trim();
      setPref('GEMINI_MODEL', value);
      prefCache.invalidate('GEMINI_MODEL');
      return value;
    });

    ipcMain.handle('get-web-search-model', () => {
      const cached = prefCache.get('WEB_SEARCH_MODEL');
      if (cached !== null) return cached || 'gemini-flash-latest';

      const value = getPref('WEB_SEARCH_MODEL') || 'gemini-flash-latest';
      prefCache.set('WEB_SEARCH_MODEL', value);
      return value;
    });

    ipcMain.handle('set-web-search-model', (_e, model) => {
      const value = String(model || 'gemini-flash-latest').trim();
      setPref('WEB_SEARCH_MODEL', value);
      prefCache.invalidate('WEB_SEARCH_MODEL');
      return value;
    });

    ipcMain.handle('get-tone', () => {
      const cached = prefCache.get('TONE');
      if (cached !== null) return cached || 'casual';

      const value = getPref('TONE') || 'casual';
      prefCache.set('TONE', value);
      return value;
    });

    ipcMain.handle('get-ui-theme', () => {
      const cached = prefCache.get('UI_THEME');
      if (cached !== null) return cached || 'dark';

      const value = getPref('UI_THEME') || 'dark';
      prefCache.set('UI_THEME', value);
      return value;
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

    ipcMain.handle('ui:set-dragging', (_e, isDragging) => {
      try {
        if (windowManager) {
          windowManager.setDraggingState(!!isDragging);
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    });

    ipcMain.handle('ui:show-app-menu', (event, pos) => {
      try {
        let menu = Menu.getApplicationMenu();
        if (!menu) {
          buildAppMenu();
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

    ipcMain.handle('check-for-updates', async () => {
      try {
        await manualCheckForUpdates();
        return { success: true };
      } catch (err) {
        return { success: false, error: err?.message || 'Unknown error' };
      }
    });

    ipcMain.handle('get-ui-language', () => {
      return getPref('MENU_LANGUAGE') || 'en';
    });

    ipcMain.handle('set-ui-language', (_e, lang) => {
      const validLangs = [
        'en',
        'ja',
        'es',
        'es-419',
        'zh-Hans',
        'zh-Hant',
        'hi',
        'pt-BR',
        'fr',
        'de',
        'ar',
        'ru',
        'ko',
        'id',
        'vi',
        'th',
        'it',
        'tr',
      ];
      const normalized = validLangs.includes(lang) ? lang : 'en';
      settingsController.handleLanguageChange(normalized);
      prefCache.invalidate('MENU_LANGUAGE');
      return normalized;
    });

    ipcMain.handle('set-ui-theme', (_e, theme) => {
      const normalized = theme === 'light' ? 'light' : 'dark';
      settingsController.handleThemeChange(normalized);
      prefCache.invalidate('UI_THEME');
      return normalized;
    });

    ipcMain.handle('set-window-opacity', (_e, opacity) => {
      const num = parseFloat(opacity);
      const normalized = isNaN(num) ? 1 : Math.max(0.1, Math.min(1, num));
      settingsController.handleWindowOpacityChange(normalized);
      prefCache.invalidate('WINDOW_OPACITY');
      return normalized;
    });

    ipcMain.handle('get-pin-all-spaces', () => {
      const v = String(getPref('PIN_ALL_SPACES') || '0');
      return v === '1' || v.toLowerCase() === 'true';
    });

    ipcMain.handle('set-pin-all-spaces', (_e, enabled) => {
      settingsController.handlePinAllSpacesChange(!!enabled);
      prefCache.invalidate('PIN_ALL_SPACES');
      return !!enabled;
    });

    ipcMain.handle('get-sync-popup-with-main', () => {
      const v = String(getPref('SYNC_POPUP_WITH_MAIN') || '0');
      return v === '1' || v.toLowerCase() === 'true';
    });

    ipcMain.handle('set-sync-popup-with-main', (_e, enabled) => {
      settingsController.handleSyncPopupWithMainChange(!!enabled);
      prefCache.invalidate('SYNC_POPUP_WITH_MAIN');
      return !!enabled;
    });

    ipcMain.handle('save-web-search-setting', (_e, enabled) => {
      settingsController.handleWebSearchToggle(!!enabled);
      prefCache.invalidate('ENABLE_GOOGLE_SEARCH');
      return true;
    });

    ipcMain.handle('save-translate-mode', (_e, mode) => {
      const normalized = String(mode || '').toLowerCase() === 'free' ? 'free' : 'literal';
      settingsController.handleTranslateModeChange(normalized);
      prefCache.invalidate('TRANSLATE_MODE');
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
      setPrefWithCacheInvalidation('IMAGE_SIZE', normalized);
      return normalized;
    });

    ipcMain.handle('get-image-size', () => {
      const cached = prefCache.get('IMAGE_SIZE');
      if (cached !== null) {
        const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
        return validSizes.includes(cached) ? cached : '1:1';
      }

      const raw = String(getPref('IMAGE_SIZE') || '1:1');
      const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
      const result = validSizes.includes(raw) ? raw : '1:1';
      prefCache.set('IMAGE_SIZE', result);
      return result;
    });

    ipcMain.handle('save-image-count', (_e, count) => {
      const validCounts = [1, 2, 3, 4];
      const normalized = validCounts.includes(count) ? count : 1;
      setPrefWithCacheInvalidation('IMAGE_COUNT', normalized);
      return normalized;
    });

    ipcMain.handle('get-image-count', () => {
      const cached = prefCache.get('IMAGE_COUNT');
      if (cached !== null) {
        const validCounts = [1, 2, 3, 4];
        return validCounts.includes(cached) ? cached : 1;
      }

      const raw = parseInt(getPref('IMAGE_COUNT') || '1', 10);
      const validCounts = [1, 2, 3, 4];
      const result = validCounts.includes(raw) ? raw : 1;
      prefCache.set('IMAGE_COUNT', result);
      return result;
    });

    ipcMain.handle('save-video-aspect-ratio', (_e, ratio) => {
      const validRatios = ['16:9', '9:16'];
      const normalized = validRatios.includes(ratio) ? ratio : '16:9';
      setPrefWithCacheInvalidation('VIDEO_ASPECT_RATIO', normalized);
      return normalized;
    });

    ipcMain.handle('get-video-aspect-ratio', () => {
      const cached = prefCache.get('VIDEO_ASPECT_RATIO');
      if (cached !== null) {
        const validRatios = ['16:9', '9:16'];
        return validRatios.includes(cached) ? cached : '16:9';
      }

      const raw = getPref('VIDEO_ASPECT_RATIO') || '16:9';
      const validRatios = ['16:9', '9:16'];
      const result = validRatios.includes(raw) ? raw : '16:9';
      prefCache.set('VIDEO_ASPECT_RATIO', result);
      return result;
    });

    ipcMain.handle('save-video-duration', (_e, duration) => {
      const validDurations = [4, 5, 6, 7, 8];
      const normalized = validDurations.includes(duration) ? duration : 4;
      setPrefWithCacheInvalidation('VIDEO_DURATION', normalized);
      return normalized;
    });

    ipcMain.handle('get-video-duration', () => {
      const cached = prefCache.get('VIDEO_DURATION');
      if (cached !== null) {
        const validDurations = [4, 5, 6, 7, 8];
        return validDurations.includes(cached) ? cached : 4;
      }

      const raw = parseInt(getPref('VIDEO_DURATION') || '4', 10);
      const validDurations = [4, 5, 6, 7, 8];
      const result = validDurations.includes(raw) ? raw : 4;
      prefCache.set('VIDEO_DURATION', result);
      return result;
    });

    ipcMain.handle('save-video-count', (_e, count) => {
      const validCounts = [1, 2, 3, 4];
      const normalized = validCounts.includes(count) ? count : 1;
      setPrefWithCacheInvalidation('VIDEO_COUNT', normalized);
      return normalized;
    });

    ipcMain.handle('get-video-count', () => {
      const cached = prefCache.get('VIDEO_COUNT');
      if (cached !== null) {
        const validCounts = [1, 2, 3, 4];
        return validCounts.includes(cached) ? cached : 1;
      }

      const raw = parseInt(getPref('VIDEO_COUNT') || '1', 10);
      const validCounts = [1, 2, 3, 4];
      const result = validCounts.includes(raw) ? raw : 1;
      prefCache.set('VIDEO_COUNT', result);
      return result;
    });

    ipcMain.handle('save-video-resolution', (_e, resolution) => {
      const validResolutions = ['720p', '1080p'];
      const normalized = validResolutions.includes(resolution) ? resolution : '720p';
      setPrefWithCacheInvalidation('VIDEO_RESOLUTION', normalized);
      return normalized;
    });

    ipcMain.handle('get-video-resolution', () => {
      const cached = prefCache.get('VIDEO_RESOLUTION');
      if (cached !== null) {
        const validResolutions = ['720p', '1080p'];
        return validResolutions.includes(cached) ? cached : '720p';
      }

      const raw = getPref('VIDEO_RESOLUTION') || '720p';
      const validResolutions = ['720p', '1080p'];
      const result = validResolutions.includes(raw) ? raw : '720p';
      prefCache.set('VIDEO_RESOLUTION', result);
      return result;
    });

    // Slide image settings
    ipcMain.handle('save-slide-size', (_e, ratio) => {
      const validRatios = ['16:9', '9:16', '4:3', '3:4', '1:1'];
      const normalized = validRatios.includes(ratio) ? ratio : '16:9';
      setPrefWithCacheInvalidation('SLIDE_SIZE', normalized);
      return normalized;
    });

    ipcMain.handle('get-slide-size', () => {
      const validRatios = ['16:9', '9:16', '4:3', '3:4', '1:1'];
      const cached = prefCache.get('SLIDE_SIZE');
      if (cached !== null) {
        return validRatios.includes(cached) ? cached : '16:9';
      }
      const raw = getPref('SLIDE_SIZE') || '16:9';
      const result = validRatios.includes(raw) ? raw : '16:9';
      prefCache.set('SLIDE_SIZE', result);
      return result;
    });

    ipcMain.handle('save-slide-count', (_e, count) => {
      const validCounts = [1, 2, 3, 4];
      const normalized = validCounts.includes(count) ? count : 1;
      setPrefWithCacheInvalidation('SLIDE_COUNT', normalized);
      return normalized;
    });

    ipcMain.handle('get-slide-count', () => {
      const validCounts = [1, 2, 3, 4];
      const cached = prefCache.get('SLIDE_COUNT');
      if (cached !== null) {
        return validCounts.includes(cached) ? cached : 1;
      }
      const raw = getPref('SLIDE_COUNT') || 1;
      const result = validCounts.includes(raw) ? raw : 1;
      prefCache.set('SLIDE_COUNT', result);
      return result;
    });

    // Slide Template Management
    const SLIDE_TEMPLATES_FILE = path.join(app.getPath('userData'), 'slide-templates.json');
    const SLIDE_TEMPLATE_IMAGES_DIR = path.join(app.getPath('userData'), 'slide-template-images');

    const loadSlideTemplatesData = () => {
      let data = { version: '1.0', activeTemplateId: null, templates: [] };
      let needsSave = false;
      try {
        if (fs.existsSync(SLIDE_TEMPLATES_FILE)) {
          data = JSON.parse(fs.readFileSync(SLIDE_TEMPLATES_FILE, 'utf8'));
        }
      } catch {}

      // Ensure Default template exists
      const hasDefault = (data.templates || []).some((t) => t.id === 'default');
      if (!hasDefault) {
        data.templates = data.templates || [];
        data.templates.unshift({
          id: 'default',
          name: 'Default',
          prompt: '',
          imageFilename: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        needsSave = true;
      }

      // Ensure activeTemplateId defaults to 'default'
      if (!data.activeTemplateId) {
        data.activeTemplateId = 'default';
        needsSave = true;
      }

      // Save if default was added
      if (needsSave) {
        try {
          fs.writeFileSync(SLIDE_TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch {}
      }

      return data;
    };

    const saveSlideTemplatesData = (data) => {
      try {
        fs.writeFileSync(SLIDE_TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf8');
      } catch {}
    };

    // Helper to reconstruct thumbnailBase64 from image file
    const loadTemplateImage = (imageFilename) => {
      if (!imageFilename) return null;
      try {
        const imagePath = path.join(SLIDE_TEMPLATE_IMAGES_DIR, imageFilename);
        if (fs.existsSync(imagePath)) {
          const buffer = fs.readFileSync(imagePath);
          const ext = path.extname(imageFilename).toLowerCase().slice(1);
          const mimeType = ext === 'jpg' ? 'jpeg' : ext;
          return `data:image/${mimeType};base64,${buffer.toString('base64')}`;
        }
      } catch {}
      return null;
    };

    // Helper to add thumbnailBase64 to templates array
    const withThumbnails = (templates) =>
      templates.map((tpl) => ({ ...tpl, thumbnailBase64: loadTemplateImage(tpl.imageFilename) }));

    ipcMain.handle('slide-template:get-all', () => {
      const data = loadSlideTemplatesData();
      return {
        templates: withThumbnails(data.templates || []),
        activeTemplateId: data.activeTemplateId,
      };
    });

    ipcMain.handle('slide-template:save', (_e, template) => {
      const data = loadSlideTemplatesData();
      const now = Date.now();

      // Prevent editing of default template (but allow initial creation)
      if (template.id === 'default') {
        const existingDefault = data.templates.find((t) => t.id === 'default');
        if (existingDefault) {
          return withThumbnails(data.templates);
        }
      }

      // Ensure images directory exists
      if (!fs.existsSync(SLIDE_TEMPLATE_IMAGES_DIR)) {
        fs.mkdirSync(SLIDE_TEMPLATE_IMAGES_DIR, { recursive: true });
      }

      // Use provided ID or generate new one
      const templateId = template.id || `tpl-${now}-${Math.random().toString(36).substr(2, 9)}`;
      const existingIndex = data.templates.findIndex((t) => t.id === templateId);

      // Handle image: save to file and store only filename (not base64 in JSON)
      let imageFilename = null;

      if (template.thumbnailBase64) {
        // Extract mimeType and base64 data
        const match = template.thumbnailBase64.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          imageFilename = `${templateId}.${ext}`;
          const filePath = path.join(SLIDE_TEMPLATE_IMAGES_DIR, imageFilename);
          fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
        }
      } else if (existingIndex >= 0 && data.templates[existingIndex].imageFilename) {
        // Image was removed - delete the file
        try {
          const oldPath = path.join(
            SLIDE_TEMPLATE_IMAGES_DIR,
            data.templates[existingIndex].imageFilename
          );
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {}
      }

      const savedTemplate = {
        id: templateId,
        name: template.name,
        prompt: template.prompt || '',
        imageFilename,
        createdAt: existingIndex >= 0 ? data.templates[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        data.templates[existingIndex] = savedTemplate;
      } else {
        data.templates.push(savedTemplate);
      }

      saveSlideTemplatesData(data);
      return withThumbnails(data.templates);
    });

    ipcMain.handle('slide-template:delete', (_e, templateId) => {
      const data = loadSlideTemplatesData();

      // Prevent deletion of default template
      if (templateId === 'default') {
        return withThumbnails(data.templates);
      }

      const template = data.templates.find((t) => t.id === templateId);

      // Delete associated image file
      if (template?.imageFilename) {
        try {
          const imagePath = path.join(SLIDE_TEMPLATE_IMAGES_DIR, template.imageFilename);
          if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        } catch {}
      }

      data.templates = data.templates.filter((t) => t.id !== templateId);
      if (data.activeTemplateId === templateId) data.activeTemplateId = 'default';
      saveSlideTemplatesData(data);
      return withThumbnails(data.templates);
    });

    ipcMain.handle('slide-template:set-active', (_e, templateId) => {
      const data = loadSlideTemplatesData();
      data.activeTemplateId = templateId;
      saveSlideTemplatesData(data);
      return templateId;
    });

    ipcMain.handle('slide-template:select-image', async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });

      if (result.canceled || !result.filePaths.length) return null;

      const filePath = result.filePaths[0];
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      return {
        base64: `data:${mimeType};base64,${buffer.toString('base64')}`,
        mimeType,
        originalPath: filePath,
      };
    });

    // Image Template Management
    const IMAGE_TEMPLATES_FILE = path.join(app.getPath('userData'), 'image-templates.json');
    const IMAGE_TEMPLATE_IMAGES_DIR = path.join(app.getPath('userData'), 'image-template-images');

    const loadImageTemplatesData = () => {
      let data = { version: '1.0', activeTemplateId: null, templates: [] };
      let needsSave = false;
      try {
        if (fs.existsSync(IMAGE_TEMPLATES_FILE)) {
          data = JSON.parse(fs.readFileSync(IMAGE_TEMPLATES_FILE, 'utf8'));
        }
      } catch {}

      // Ensure Default template exists
      const hasDefault = (data.templates || []).some((t) => t.id === 'default');
      if (!hasDefault) {
        data.templates = data.templates || [];
        data.templates.unshift({
          id: 'default',
          name: 'Default',
          prompt: '',
          imageFilename: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        needsSave = true;
      }

      // Ensure activeTemplateId defaults to 'default'
      if (!data.activeTemplateId) {
        data.activeTemplateId = 'default';
        needsSave = true;
      }

      // Save if default was added
      if (needsSave) {
        try {
          fs.writeFileSync(IMAGE_TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch {}
      }

      return data;
    };

    const saveImageTemplatesData = (data) => {
      try {
        fs.writeFileSync(IMAGE_TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf8');
      } catch {}
    };

    const loadImageTemplateImage = (imageFilename) => {
      if (!imageFilename) return null;
      try {
        const imagePath = path.join(IMAGE_TEMPLATE_IMAGES_DIR, imageFilename);
        if (fs.existsSync(imagePath)) {
          const buffer = fs.readFileSync(imagePath);
          const ext = path.extname(imageFilename).toLowerCase().slice(1);
          const mimeType = ext === 'jpg' ? 'jpeg' : ext;
          return `data:image/${mimeType};base64,${buffer.toString('base64')}`;
        }
      } catch {}
      return null;
    };

    const withImageThumbnails = (templates) =>
      templates.map((tpl) => ({
        ...tpl,
        thumbnailBase64: loadImageTemplateImage(tpl.imageFilename),
      }));

    ipcMain.handle('image-template:get-all', () => {
      const data = loadImageTemplatesData();
      return {
        templates: withImageThumbnails(data.templates || []),
        activeTemplateId: data.activeTemplateId,
      };
    });

    ipcMain.handle('image-template:save', (_e, template) => {
      const data = loadImageTemplatesData();
      const now = Date.now();

      // Prevent editing of default template (but allow initial creation)
      if (template.id === 'default') {
        const existingDefault = data.templates.find((t) => t.id === 'default');
        if (existingDefault) {
          return withImageThumbnails(data.templates);
        }
      }

      // Ensure images directory exists
      if (!fs.existsSync(IMAGE_TEMPLATE_IMAGES_DIR)) {
        fs.mkdirSync(IMAGE_TEMPLATE_IMAGES_DIR, { recursive: true });
      }

      // Use provided ID or generate new one
      const templateId = template.id || `img-tpl-${now}-${Math.random().toString(36).substr(2, 9)}`;
      const existingIndex = data.templates.findIndex((t) => t.id === templateId);

      // Handle image: save to file and store only filename (not base64 in JSON)
      let imageFilename = null;

      if (template.thumbnailBase64) {
        // Extract mimeType and base64 data
        const match = template.thumbnailBase64.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          imageFilename = `${templateId}.${ext}`;
          const filePath = path.join(IMAGE_TEMPLATE_IMAGES_DIR, imageFilename);
          fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
        }
      } else if (existingIndex >= 0 && data.templates[existingIndex].imageFilename) {
        // Image was removed - delete the file
        try {
          const oldPath = path.join(
            IMAGE_TEMPLATE_IMAGES_DIR,
            data.templates[existingIndex].imageFilename
          );
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {}
      }

      const templateToSave = {
        id: templateId,
        name: template.name,
        prompt: template.prompt || '',
        imageFilename,
        createdAt: existingIndex >= 0 ? data.templates[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        data.templates[existingIndex] = templateToSave;
      } else {
        data.templates.push(templateToSave);
      }

      saveImageTemplatesData(data);
      return withImageThumbnails(data.templates);
    });

    ipcMain.handle('image-template:delete', (_e, templateId) => {
      const data = loadImageTemplatesData();

      // Prevent deletion of default template
      if (templateId === 'default') {
        return withImageThumbnails(data.templates);
      }

      const template = data.templates.find((t) => t.id === templateId);

      // Delete associated image file
      if (template?.imageFilename) {
        try {
          const imagePath = path.join(IMAGE_TEMPLATE_IMAGES_DIR, template.imageFilename);
          if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        } catch {}
      }

      data.templates = data.templates.filter((t) => t.id !== templateId);
      if (data.activeTemplateId === templateId) data.activeTemplateId = 'default';
      saveImageTemplatesData(data);
      return withImageThumbnails(data.templates);
    });

    ipcMain.handle('image-template:set-active', (_e, templateId) => {
      const data = loadImageTemplatesData();
      data.activeTemplateId = templateId;
      saveImageTemplatesData(data);
      return templateId;
    });

    ipcMain.handle('image-template:select-image', async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });

      if (result.canceled || !result.filePaths.length) return null;

      const filePath = result.filePaths[0];
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      return {
        base64: `data:${mimeType};base64,${buffer.toString('base64')}`,
        mimeType,
        originalPath: filePath,
      };
    });

    // Popup custom icon handlers
    const notifyPopupIconChange = (icon) => {
      const popupWin = getPopupWindow();
      if (!popupWin || popupWin.isDestroyed()) return;

      popupWin.webContents.send('popup-icon-changed', icon);

      // Invalidate shadow to update macOS window shadow cache
      if (process.platform === 'darwin') {
        setTimeout(() => {
          if (popupWin && !popupWin.isDestroyed()) {
            popupWin.invalidateShadow();
          }
        }, 50);
      }
    };

    ipcMain.handle('popup-icon:get', () => getPref('POPUP_CUSTOM_ICON') || null);

    ipcMain.handle('popup-icon:invalidate-shadow', () => {
      if (process.platform !== 'darwin') return;
      const popupWin = getPopupWindow();
      if (popupWin && !popupWin.isDestroyed()) {
        popupWin.invalidateShadow();
      }
    });

    ipcMain.handle('popup-icon:set', (_e, base64DataUrl) => {
      try {
        if (!base64DataUrl || typeof base64DataUrl !== 'string') {
          return { success: false, error: 'Invalid data' };
        }
        setPref('POPUP_CUSTOM_ICON', base64DataUrl);
        notifyPopupIconChange(base64DataUrl);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('popup-icon:reset', () => {
      try {
        setPref('POPUP_CUSTOM_ICON', null);
        notifyPopupIconChange(null);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('popup-icon:select-image', async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
      });

      if (result.canceled || !result.filePaths.length) return null;

      const filePath = result.filePaths[0];
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      return {
        base64: `data:${mimeType};base64,${buffer.toString('base64')}`,
        mimeType,
      };
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
        // PDF-specific options
        const extractPdfImages = payload?.extractPdfImages === true;
        const maxPdfPages = Number.isFinite(payload?.maxPdfPages)
          ? Number(payload.maxPdfPages)
          : 10;
        const pdfImageScale = Number.isFinite(payload?.pdfImageScale)
          ? Number(payload.pdfImageScale)
          : 1.5;
        const result = await fetchUrlContent(raw, {
          timeoutMs,
          maxLength,
          extractPdfImages,
          maxPdfPages,
          pdfImageScale,
        });
        return result;
      } catch (error) {
        return { error: error?.message || 'Failed to fetch URL content' };
      }
    });
  }

  function setupTerminalHandlers() {
    ipcMain.handle('terminal:create', (event, { id, cols, rows, cwd }) => {
      try {
        return getTerminalService().createTerminal(event.sender, id, cols, rows, cwd);
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.on('terminal:input', (event, { id, data }) => {
      try {
        getTerminalService().writeInput(id, data);
      } catch (error) {}
    });

    ipcMain.on('terminal:resize', (_event, { id, cols, rows }) => {
      try {
        getTerminalService().resizeTerminal(id, cols, rows);
      } catch (error) {}
    });

    ipcMain.handle('terminal:kill', (_event, { id }) => {
      try {
        return getTerminalService().killTerminal(id);
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  function setupClipboardHandlers() {
    const { getClipboardHistoryService } = require('../services/clipboardHistory');
    const clipboardService = getClipboardHistoryService();

    // Debounce popup updates to avoid excessive IPC
    let popupUpdateTimeout = null;
    // Lazy開始: 初回アクセスまで監視を開始しない
    const ensureMonitoring = () => {
      try {
        clipboardService.startMonitoring();
      } catch (err) {}
    };

    // Listen for history updates and notify main window
    clipboardService.on('history-updated', (history) => {
      try {
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('clipboard:history-updated', history);
        }
      } catch (err) {}

      // Debounce popup updates (only update every 500ms max)
      try {
        if (isClipboardPopupActive()) {
          if (popupUpdateTimeout) {
            clearTimeout(popupUpdateTimeout);
          }
          popupUpdateTimeout = setTimeout(() => {
            try {
              const theme = getPref('UI_THEME') || 'dark';
              const isDarkMode = theme === 'dark';
              const opacity = parseFloat(getPref('WINDOW_OPACITY') || '1');
              if (!isClipboardPopupActive()) return;
              updateClipboardPopup(history, { isDarkMode, opacity });
            } catch (err) {}
          }, 500);
        }
      } catch (err) {}
    });

    ipcMain.handle('clipboard:get-history', () => {
      ensureMonitoring();
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

    ipcMain.handle('clipboard:start-monitoring', () => {
      ensureMonitoring();
      return { monitoring: clipboardService.isMonitoringActive() };
    });

    ipcMain.handle('clipboard:stop-monitoring', () => {
      clipboardService.stopMonitoring();
      return { monitoring: clipboardService.isMonitoringActive() };
    });

    ipcMain.handle('clipboard:get-status', () => {
      return { monitoring: clipboardService.isMonitoringActive() };
    });

    // ========== Snippet Handlers ==========
    const snippetDataPath = path.join(app.getPath('userData'), 'snippets.json');
    const snippetImagesDir = path.join(app.getPath('userData'), 'snippet-images');

    /** Create thumbnail from image (max 200x200, preserving aspect ratio) */
    function createSnippetThumbnail(image) {
      if (!image || image.isEmpty()) return null;
      const size = image.getSize();
      const maxSize = 200;
      if (size.width <= maxSize && size.height <= maxSize) {
        return image.toDataURL();
      }
      const aspectRatio = size.width / size.height;
      const [newWidth, newHeight] =
        aspectRatio > 1
          ? [maxSize, Math.round(maxSize / aspectRatio)]
          : [Math.round(maxSize * aspectRatio), maxSize];
      return image.resize({ width: newWidth, height: newHeight, quality: 'good' }).toDataURL();
    }

    // Get snippet data from JSON file
    ipcMain.handle('snippet:get-data', () => {
      try {
        if (fs.existsSync(snippetDataPath)) {
          return JSON.parse(fs.readFileSync(snippetDataPath, 'utf8'));
        }
        return null;
      } catch {
        return null;
      }
    });

    // Save snippet data to JSON file
    ipcMain.handle('snippet:save-data', (_e, data) => {
      try {
        fs.writeFileSync(snippetDataPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
      } catch {
        return false;
      }
    });

    // Open file dialog to select an image
    ipcMain.handle('snippet:select-image-file', async () => {
      const { dialog, BrowserWindow } = require('electron');
      try {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const result = await dialog.showOpenDialog(focusedWindow, {
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
        });
        if (result.canceled || !result.filePaths.length) {
          return { success: false, canceled: true };
        }
        const filePath = result.filePaths[0];
        const buffer = fs.readFileSync(filePath);
        return {
          success: true,
          imageBase64: buffer.toString('base64'),
          fileName: path.basename(filePath),
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Save image file and generate thumbnail
    ipcMain.handle('snippet:save-image', async (_e, { snippetId, imageBase64 }) => {
      try {
        if (!fs.existsSync(snippetImagesDir)) {
          fs.mkdirSync(snippetImagesDir, { recursive: true });
        }
        const imagePath = `${snippetId}.png`;
        const buffer = Buffer.from(imageBase64, 'base64');
        fs.writeFileSync(path.join(snippetImagesDir, imagePath), buffer);
        const thumbnailDataUrl = createSnippetThumbnail(nativeImage.createFromBuffer(buffer));
        return {
          success: true,
          imagePath,
          thumbnailBase64: thumbnailDataUrl?.split(',')[1] ?? null,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Delete image file
    ipcMain.handle('snippet:delete-image', async (_e, imagePath) => {
      try {
        const fullPath = path.join(snippetImagesDir, imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Copy image to clipboard (excluded from clipboard history)
    ipcMain.handle('snippet:copy-image', async (_e, imagePath) => {
      const { clipboard } = require('electron');
      try {
        const fullPath = path.join(snippetImagesDir, imagePath);
        if (!fs.existsSync(fullPath)) {
          return { success: false, error: 'Image not found' };
        }
        const image = nativeImage.createFromPath(fullPath);
        clipboard.writeImage(image);
        // Prevent adding to clipboard history
        const { getClipboardHistoryService } = require('../services/clipboardHistory');
        const clipboardService = getClipboardHistoryService();
        clipboardService.lastProgrammaticText = null;
        clipboardService.lastProgrammaticImageHash = clipboardService.getImageHash(
          image.toDataURL()
        );
        clipboardService.programmaticSetTime = Date.now();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // ========== Snippet Export/Import ==========
    ipcMain.handle('snippet:export', async () => {
      const AdmZip = require('adm-zip');
      try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const result = await dialog.showSaveDialog(focusedWindow, {
          defaultPath: `IrukaDark-Snippets-${dateStr}.zip`,
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });
        if (result.canceled) return { success: false, canceled: true };

        if (!fs.existsSync(snippetDataPath)) {
          return { success: false, error: 'NO_SNIPPETS' };
        }

        const snippetData = JSON.parse(fs.readFileSync(snippetDataPath, 'utf8'));
        const zip = new AdmZip();

        // manifest.json
        const manifest = {
          version: '1.0',
          exportedAt: now.toISOString(),
          folderCount: (snippetData.folders || []).length,
          snippetCount: (snippetData.snippets || []).length,
          imageCount: (snippetData.snippets || []).filter((s) => s.type === 'image').length,
        };
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

        // snippets.json
        zip.addFile('snippets.json', Buffer.from(JSON.stringify(snippetData, null, 2)));

        // 画像ファイル
        let processedImages = 0;
        const imageSnippets = (snippetData.snippets || []).filter(
          (s) => s.type === 'image' && s.imagePath
        );
        for (const snippet of imageSnippets) {
          const imagePath = path.join(snippetImagesDir, snippet.imagePath);
          if (fs.existsSync(imagePath)) {
            zip.addLocalFile(imagePath, 'images');
          }
          processedImages++;
          BrowserWindow.getFocusedWindow()?.webContents.send('snippet:export-progress', {
            current: processedImages,
            total: imageSnippets.length,
          });
        }

        zip.writeZip(result.filePath);
        return { success: true, count: snippetData.snippets?.length || 0 };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('snippet:import', async (_e, { mode }) => {
      const AdmZip = require('adm-zip');
      const validMode = mode === 'replace' ? 'replace' : 'merge';
      const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

      try {
        const result = await dialog.showOpenDialog(mainWindow, {
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
          properties: ['openFile'],
        });
        if (result.canceled) return { success: false, canceled: true };

        const zip = new AdmZip(result.filePaths[0]);
        const entries = zip.getEntries();

        // Validate ZIP structure
        const snippetsEntry = entries.find((e) => e.entryName === 'snippets.json');
        if (!snippetsEntry) {
          return { success: false, error: 'INVALID_FORMAT' };
        }

        const importData = JSON.parse(snippetsEntry.getData().toString('utf8'));

        // Notify renderer that import has started
        mainWindow?.webContents.send('snippet:import-started', {
          total: importData.snippets?.length || 0,
        });

        // Ensure images directory exists
        if (!fs.existsSync(snippetImagesDir)) {
          fs.mkdirSync(snippetImagesDir, { recursive: true });
        }

        // Prepare existing data based on mode
        let existingData;
        if (validMode === 'replace') {
          // Replace mode: clear existing images
          if (fs.existsSync(snippetImagesDir)) {
            for (const file of fs.readdirSync(snippetImagesDir)) {
              fs.unlinkSync(path.join(snippetImagesDir, file));
            }
          }
          existingData = { folders: [], snippets: [], nextFolderId: 1, nextSnippetId: 1 };
        } else {
          // Merge mode: load existing data
          existingData = fs.existsSync(snippetDataPath)
            ? JSON.parse(fs.readFileSync(snippetDataPath, 'utf8'))
            : { folders: [], snippets: [], nextFolderId: 1, nextSnippetId: 1 };
        }

        // Create ID mapping for folders
        const folderIdMap = new Map();
        for (const folder of importData.folders || []) {
          const newId = `folder-${existingData.nextFolderId++}`;
          folderIdMap.set(folder.id, newId);
          existingData.folders.push({
            ...folder,
            id: newId,
            parentId: folder.parentId ? folderIdMap.get(folder.parentId) || null : null,
            editing: false,
          });
        }

        // Import snippets and extract images
        const imageSnippets = (importData.snippets || []).filter((s) => s.type === 'image');
        let processedImages = 0;

        for (const snippet of importData.snippets || []) {
          const newId = `snippet-${existingData.nextSnippetId++}`;
          let newImagePath = null;

          if (snippet.type === 'image' && snippet.imagePath) {
            const imageEntry = entries.find((e) => e.entryName === `images/${snippet.imagePath}`);
            if (imageEntry) {
              const ext = path.extname(snippet.imagePath) || '.png';
              newImagePath = `${newId}${ext}`;
              fs.writeFileSync(path.join(snippetImagesDir, newImagePath), imageEntry.getData());
            }
            processedImages++;
            mainWindow?.webContents.send('snippet:import-progress', {
              current: processedImages,
              total: imageSnippets.length,
            });
          }

          existingData.snippets.push({
            ...snippet,
            id: newId,
            folderId: folderIdMap.get(snippet.folderId) || null,
            imagePath: newImagePath || (snippet.type !== 'image' ? undefined : null),
            editing: false,
          });
        }

        fs.writeFileSync(snippetDataPath, JSON.stringify(existingData, null, 2));
        return { success: true, count: importData.snippets?.length || 0 };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  }

  function setupLauncherHandlers() {
    // Application search - lazy load on first use
    ipcMain.handle('launcher:search-apps', async (_e, query, limit = 20, offset = 0) => {
      try {
        const scanner = await getAppScanner();
        return scanner.searchApps(query, limit, offset);
      } catch (err) {
        return { results: [], total: 0, hasMore: false };
      }
    });

    // Launch application
    ipcMain.handle('launcher:launch-app', async (_e, appPath) => {
      try {
        const { exec } = require('child_process');
        exec(`open -a "${appPath}"`, (error) => {
          if (error) {
          }
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // File search - lazy load on first use
    ipcMain.handle('launcher:search-files', async (_e, query, limit = 20, offset = 0) => {
      try {
        return await getFileSearch().searchFiles(query, { limit, offset });
      } catch (err) {
        return { results: [], total: 0, hasMore: false };
      }
    });

    // Open file
    ipcMain.handle('launcher:open-file', async (_e, filePath) => {
      try {
        await shell.openPath(filePath);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // System commands search - lazy load on first use
    ipcMain.handle('launcher:search-system-commands', async (_e, query, limit = 20, offset = 0) => {
      try {
        return getSystemCommands().searchCommands(query, limit, offset);
      } catch (err) {
        return { results: [], total: 0, hasMore: false };
      }
    });

    // Execute system command - lazy load on first use
    ipcMain.handle('launcher:execute-system-command', async (_e, commandId) => {
      try {
        return await getSystemCommands().executeCommand(commandId);
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
  }

  function setupSettingsHandlers() {
    // Get current shortcut assignments
    ipcMain.handle('settings:get-shortcut-assignments', () => {
      try {
        const saved = getPref('SHORTCUT_ASSIGNMENTS');
        if (saved && typeof saved === 'object') {
          return { ...DEFAULT_SHORTCUTS, ...saved };
        }
        return DEFAULT_SHORTCUTS;
      } catch (err) {
        return DEFAULT_SHORTCUTS;
      }
    });

    // Save a single shortcut assignment
    ipcMain.handle('settings:save-shortcut-assignment', async (_e, action, key) => {
      try {
        // === Input Validation (Security: Prevent injection attacks) ===

        // Check for required parameters
        if (!action || !key) {
          throw new Error('Action and key are required');
        }

        // Validate parameter types
        if (typeof action !== 'string' || typeof key !== 'string') {
          throw new Error('Invalid parameter types. Expected strings.');
        }

        // Validate action is a known shortcut
        if (!isValidAction(action)) {
          throw new Error(`Unknown shortcut action: ${action}`);
        }

        // Validate shortcut format
        if (!isValidShortcutFormat(key)) {
          throw new Error(`Invalid shortcut format: ${key}`);
        }

        // Check if shortcut is reserved by the system
        if (isReservedShortcut(key)) {
          throw new Error(`Shortcut ${key} is reserved by the system and cannot be overridden`);
        }

        const current = getPref('SHORTCUT_ASSIGNMENTS') || {};
        const allAssignments = { ...DEFAULT_SHORTCUTS, ...current };

        // Remove the same shortcut from other actions (overwrite behavior)
        for (const [existingAction, existingKey] of Object.entries(allAssignments)) {
          if (existingAction !== action && existingKey === key) {
            // Remove shortcut from conflicting action
            current[existingAction] = '';
          }
        }

        // Assign new shortcut
        const updated = { ...current, [action]: key };
        setPref('SHORTCUT_ASSIGNMENTS', updated);

        // Re-register all shortcuts with new assignments (silent mode to avoid notifications)
        try {
          globalShortcut.unregisterAll();
          registerGlobalShortcuts(true);
        } catch (regErr) {
          // Even if re-registration partially fails, the preference was saved
        }

        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Validate shortcut for conflicts
    ipcMain.handle('settings:validate-shortcut', (_e, key, excludeAction) => {
      try {
        const assignments = getPref('SHORTCUT_ASSIGNMENTS') || {};
        const allAssignments = { ...DEFAULT_SHORTCUTS, ...assignments };

        // Check if the key is already assigned to another action
        for (const [action, assignedKey] of Object.entries(allAssignments)) {
          if (action !== excludeAction && assignedKey === key) {
            return action; // Return the conflicting action
          }
        }

        return null; // No conflict
      } catch (err) {
        return null;
      }
    });

    // Reset all shortcuts to defaults
    ipcMain.handle('settings:reset-shortcut-assignments', () => {
      try {
        setPref('SHORTCUT_ASSIGNMENTS', {});

        // Re-register all shortcuts with defaults (silent mode to avoid notifications)
        try {
          globalShortcut.unregisterAll();
          registerGlobalShortcuts(true);
        } catch (regErr) {
          // Even if re-registration partially fails, the preference was cleared
        }

        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Gemini API Key handlers
    ipcMain.handle('settings:get-gemini-api-key', () => {
      try {
        const apiKey = getPref('GEMINI_API_KEY') || '';
        return { success: true, apiKey };
      } catch (err) {
        return { success: false, error: err.message, apiKey: '' };
      }
    });

    ipcMain.handle('settings:save-gemini-api-key', (_e, apiKey) => {
      try {
        if (!apiKey || typeof apiKey !== 'string') {
          return { success: false, error: 'Invalid API key' };
        }

        const trimmedKey = apiKey.trim();
        if (!trimmedKey) {
          return { success: false, error: 'API key cannot be empty' };
        }

        setPref('GEMINI_API_KEY', trimmedKey);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
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
        const searchPreferred = getPref('WEB_SEARCH_MODEL') || 'gemini-flash-latest';
        const modelsToTry =
          requestedModel === searchPreferred ? [requestedModel] : [requestedModel, searchPreferred];

        const isInvalid = (msg) => /API_KEY_INVALID|API key not valid/i.test(String(msg || ''));
        const errorLog = [];

        const tryOne = async (key) => {
          let client = null;
          try {
            client = await getGenAIClientForKey(key);
          } catch (e) {}

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

    ipcMain.handle('ai:generate-command', async (_e, payload) => {
      try {
        const keys = resolveApiKeys();
        if (!keys.length) {
          return { error: 'API key is not set. Please set GEMINI_API_KEY.' };
        }

        const naturalLanguage = String(payload?.prompt ?? '');
        if (!naturalLanguage) {
          return { error: 'Prompt is required.' };
        }

        // Get shell type, OS info, and terminal context
        const shell = payload?.shell || 'bash';
        const os = payload?.os || process.platform;
        const terminalContext = String(payload?.context || '');

        // Construct command generation prompt with context
        let prompt = `You are a terminal command expert. Convert natural language to shell commands.

User request: ${naturalLanguage}

Shell: ${shell}
OS: ${os}`;

        // Add terminal context if available
        if (terminalContext && terminalContext.trim().length > 0) {
          prompt += `

Current terminal output (last 300 lines):
\`\`\`
${terminalContext}
\`\`\`

Based on the terminal output above, understand the current state (directory, errors, running processes, etc.) and generate the appropriate command.`;
        }

        prompt += `

Rules:
- Output ONLY the command, no explanations or markdown
- Use common, safe commands appropriate for ${shell}
- Consider the current terminal state shown above
- If multiple commands needed, use && or ; separators
- For dangerous operations, add --dry-run or similar flags when possible
- Return a single line command ready to execute

Command:`;

        const generationConfig = {
          temperature: 0.3, // Lower for more deterministic output
          topK: 20,
          topP: 0.8,
          maxOutputTokens: 512, // Increased for context-aware responses
        };

        const result = await handleAIGeneration(
          {
            prompt,
            generationConfig,
            source: 'terminal',
            model: 'gemini-3-pro-preview', // Use Gemini 3 Pro for terminal commands
          },
          null
        );

        // Clean up the response (remove any markdown or extra formatting)
        const command =
          typeof result === 'string'
            ? result
                .replace(/```[a-z]*\n?/g, '')
                .replace(/`/g, '')
                .trim()
            : result?.text
                ?.replace(/```[a-z]*\n?/g, '')
                .replace(/`/g, '')
                .trim() || '';

        // Check for dangerous patterns
        const dangerousPatterns = [
          // System destruction
          /:\(\)\{\s*:\|:&\s*\};:/, // Fork bomb
          /(sudo\s+)?dd\s+if=/i, // Raw disk operations
          /(sudo\s+)?mkfs/i, // Format filesystem
          />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme)/i, // Writing to disk devices

          // Dangerous permissions and remote execution
          /(sudo\s+)?chmod\s+(-R\s+)?777/i, // chmod 777
          /(wget|curl).*\|\s*(sh|bash|python|perl)/i, // Piping remote scripts
        ];

        // Check for dangerous rm commands
        // Any rm command is considered potentially dangerous
        const hasRm = /\brm\b/i.test(command);

        const isDangerous = dangerousPatterns.some((pattern) => pattern.test(command)) || hasRm;

        return {
          command,
          warning: isDangerous ? 'dangerous' : null,
        };
      } catch (err) {
        return { error: `Command generation error: ${err?.message || 'Unknown error'}` };
      }
    });

    ipcMain.handle('ai:generate-image-from-text', async (_e, payload) => {
      const IMAGE_MODEL = 'gemini-3-pro-image-preview';
      const TIMEOUT_MS = 60000;

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
        const referenceImages = payload?.referenceImages;
        const hasReferences = Array.isArray(referenceImages) && referenceImages.length > 0;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        currentAIController = controller;
        currentAIKind = 'chat';

        const errorLog = [];

        try {
          for (const key of keys) {
            try {
              const genAI = await getGenAIClientForKey(key);
              const result = hasReferences
                ? await sdkGenerateImageFromTextWithReference(
                    genAI,
                    IMAGE_MODEL,
                    prompt,
                    referenceImages,
                    { aspectRatio, signal: controller.signal }
                  )
                : await sdkGenerateImageFromText(genAI, IMAGE_MODEL, prompt, {
                    aspectRatio,
                    signal: controller.signal,
                  });

              if (result?.imageData) {
                return { imageBase64: result.imageData, mimeType: result.mimeType || 'image/png' };
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                return { error: 'Image generation was cancelled or timed out.' };
              }
              const msg = err?.message || 'Unknown error';
              errorLog.push(`Key ${key.substring(0, 8)}...: ${msg}`);
              // Continue to next key
            }
          }

          return { error: `Image generation failed: ${errorLog.join('; ')}` };
        } finally {
          clearTimeout(timeoutId);
          currentAIController = null;
        }
      } catch (err) {
        return { error: `Image generation error: ${err?.message || 'Unknown error'}` };
      }
    });

    ipcMain.handle('ai:generate-video-from-text', async (_e, payload) => {
      try {
        const keys = resolveApiKeys();
        if (!keys.length) {
          return { error: 'API key is not set. Please set GEMINI_API_KEY.' };
        }

        const prompt = String(payload?.prompt ?? '');
        if (!prompt) {
          return { error: 'Prompt is required.' };
        }

        const aspectRatio = String(payload?.aspectRatio || '16:9');
        const durationSeconds = Number(payload?.durationSeconds || 4);
        const resolution = String(payload?.resolution || '720p');
        const generationConfig = payload?.generationConfig || {};
        const referenceImage = payload?.referenceImage || null;
        const modelName = 'veo-3.1-fast-generate-preview';
        const errorLog = [];

        // Create AbortController for cancellation and timeout
        const controller = new AbortController();
        const timeoutMs = 600000; // 10 minutes for video generation
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // Set as current AI controller for cancel functionality
        currentAIController = controller;
        currentAIKind = 'chat';

        try {
          for (const key of keys) {
            try {
              const options = {
                aspectRatio,
                durationSeconds,
                resolution,
                signal: controller.signal,
              };

              // Add reference image if provided
              if (referenceImage) {
                options.referenceImage = referenceImage;
              }

              const result = await restGenerateVideoFromText(
                key,
                modelName,
                prompt,
                generationConfig,
                options
              );

              if (result && result.videoData) {
                clearTimeout(timeoutId);
                return {
                  videoBase64: result.videoData,
                  mimeType: result.mimeType || 'video/mp4',
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
                return { error: 'Video generation was cancelled or timed out.' };
              }

              throw err;
            }
          }

          clearTimeout(timeoutId);
          return {
            error: `Video generation failed: ${errorLog.join('; ')}`,
          };
        } finally {
          clearTimeout(timeoutId);
          currentAIController = null;
          currentAIKind = null;
        }
      } catch (err) {
        return {
          error: `Video generation error: ${err?.message || 'Unknown error'}`,
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
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('app-config', payload);
        }
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

  // Clean shutdown hooks
  app.on('before-quit', () => {
    try {
      const { getClipboardHistoryService } = require('../services/clipboardHistory');
      const svc = getClipboardHistoryService();
      if (svc && typeof svc.stopMonitoring === 'function') {
        svc.stopMonitoring();
      }
    } catch (err) {}

    // Cancel any active voice query session
    try {
      const { cancelVoiceQuery } = require('../services/macAutomationBridge');
      cancelVoiceQuery();
    } catch (err) {}
  });

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

    try {
      const autoStartEnabled = !['0', 'false', 'off'].includes(
        String(getPref('AUTO_START_ENABLED') || '0').toLowerCase()
      );
      app.setLoginItemSettings({
        openAtLogin: autoStartEnabled,
        openAsHidden: false,
      });
    } catch (err) {}

    windowManager.createMainWindow();
    buildAppMenu();
    initializeTray();

    // Update tray menu when window visibility changes
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.on('show', () => {
        try {
          updateTrayMenu();
        } catch (err) {}
      });
      mainWindow.on('hide', () => {
        try {
          updateTrayMenu();
        } catch (err) {}
      });
    }

    registerGlobalShortcuts();
    setupPopupIpcHandlers();
    setupCaptureHandlers();
    setupUiHandlers();
    setupUrlContentHandlers();
    setupClipboardHandlers();
    setupTerminalHandlers();
    setupLauncherHandlers();
    setupSettingsHandlers();
    setupAiHandlers();
    setupRendererSync();

    // PERFORMANCE: Start periodic garbage collection
    setupPeriodicGC();

    // PERFORMANCE: Launcher services are now lazy-loaded on first use
    // No need to initialize appScanner, fileSearch, or systemCommands here

    try {
      setupAutoUpdates();
    } catch {}

    // Start clipboard daemon for fast popup display
    if (process.platform === 'darwin') {
      setTimeout(() => {
        try {
          startClipboardDaemon();
        } catch {}
      }, 2000);
    }

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
    try {
      if (terminalService) {
        terminalService.cleanup();
      }
    } catch {}
    try {
      stopClipboardDaemon();
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
