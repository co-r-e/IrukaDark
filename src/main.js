/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: MIT. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  systemPreferences,
  Menu,
  globalShortcut,
  shell,
} = require('electron');
// child_process exec usage moved to modules
const path = require('path');

const fs = require('fs');
try {
  const portableFlag = String(process.env.PORTABLE_MODE || process.env.ALLOW_ENV_LOCAL || '')
    .trim()
    .toLowerCase();
  const allowEnvLocal =
    portableFlag && portableFlag !== '0' && portableFlag !== 'false' && portableFlag !== 'off';
  if (allowEnvLocal) {
    const dotenv = require('dotenv');
    const envPaths = [
      path.join(__dirname, '../.env.local'),
      path.join(process.cwd(), '.env.local'),
      path.join(__dirname, '../../.env.local'),
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        break;
      }
    }
  }
} catch {}

const isDev = process.env.NODE_ENV === 'development';
// Clipboard/shortcut helpers
const {
  startClipboardWatcher,
  showWindowNonActivating,
  tryCopySelectedText,
  captureInteractiveArea,
} = require('./main/shortcuts');
// Initial layout
const INITIAL_SHOW_MAIN = ['1', 'true', 'on'].includes(
  String(process.env.SHOW_MAIN_ON_START || '1').toLowerCase()
);
const INITIAL_POPUP_MARGIN_RIGHT = Number.isFinite(
  parseInt(process.env.POPUP_MARGIN_RIGHT || '', 10)
)
  ? parseInt(process.env.POPUP_MARGIN_RIGHT, 10)
  : 0;

// Track current in-flight AI request for cancellation (shortcut-only)
let currentAIController = null; // AbortController of the active REST call
let currentAIKind = null; // 'shortcut' | 'chat' | null

// Clipboard watcher moved to shortcuts.js

// startClipboardWatcher moved to shortcuts.js

// isClipboardTextStale moved to shortcuts.js
let currentAICancelFlag = null; // { user: boolean } when cancel requested by user

function resolveApiKeys() {
  const order = [
    'GEMINI_API_KEY',
    'GOOGLE_GENAI_API_KEY',
    'GENAI_API_KEY',
    'GOOGLE_API_KEY',
    'NEXT_PUBLIC_GEMINI_API_KEY',
    'NEXT_PUBLIC_GOOGLE_API_KEY',
  ];
  const seen = new Set();
  const out = [];
  // 1) userData prefs first
  try {
    const prefs = loadPrefs();
    for (const k of order) {
      const v = prefs?.[k];
      if (v && String(v).trim() && !seen.has(String(v).trim())) {
        seen.add(String(v).trim());
        out.push(String(v).trim());
      }
    }
  } catch {}
  // 2) process.env (OS/.env.local/migrated)
  for (const k of order) {
    const v = process.env[k];
    if (v && String(v).trim() && !seen.has(String(v).trim())) {
      seen.add(String(v).trim());
      out.push(String(v).trim());
    }
  }
  return out;
}

const {
  getGenAIClientForKey,
  modelCandidates,
  restGenerateText,
  restGenerateImage,
  sdkGenerateText,
  sdkGenerateImage,
} = require('./main/ai');

try {
  app.setName('IrukaDark');
} catch {}

let mainWindow;
let closingAllWindows = false; // guard for cascading close

function getCurrentLanguage() {
  return process.env.MENU_LANGUAGE || 'en';
}

async function openInputDialog({
  title = 'Input',
  label = '',
  placeholder = '',
  value = '',
  password = false,
  lang = 'en',
} = {}) {
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
          preload: path.join(__dirname, 'prompt_preload.js'),
        },
      });
      try {
        win.setMenuBarVisibility(false);
      } catch {}

      const htmlPath = path.join(__dirname, 'prompt.html');
      win
        .loadFile(htmlPath)
        .then(() => {
          try {
            win.show();
          } catch {}
          try {
            const theme = String(process.env.UI_THEME || 'dark');
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
// Menu translations are loaded in src/main/menu.js

function createWindow() {
  const baseOpts = {
    width: 260,
    height: 280,
    minWidth: 260,
    // Allow shrinking the window vertically up to the chat input area
    minHeight: 140,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    // Ensure size refers to webContents area
    useContentSize: true,
    // Transparent background for macOS glass effect
    backgroundColor: '#00000000',
    // Make sure the window can take focus (some Win setups need this explicit)
    focusable: true,
    resizable: true,
    show: false,
    icon: path.resolve(__dirname, 'renderer/assets/icons/icon.png'),
    opacity: 1.0,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: true,
      devTools: false,
    },
  };
  mainWindow = new BrowserWindow(baseOpts);

  try {
    mainWindow.setMinimumSize(260, 140);
  } catch {}

  // Always open external HTTP(S) links in the user's default browser
  try {
    const isExternalHttpUrl = (u) => {
      try {
        return /^https?:\/\//i.test(String(u || ''));
      } catch {
        return false;
      }
    };
    // Links that would open a new window (target=_blank, window.open)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalHttpUrl(url)) {
        try {
          shell.openExternal(url);
        } catch {}
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    // In-page navigations to external URLs
    mainWindow.webContents.on('will-navigate', (e, url) => {
      if (isExternalHttpUrl(url)) {
        try {
          e.preventDefault();
        } catch {}
        try {
          shell.openExternal(url);
        } catch {}
      }
    });
  } catch {}

  try {
    const pinAll = !['0', 'false', 'off'].includes(
      String(getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase()
    );
    mainWindow.setAlwaysOnTop(true, pinAll ? 'screen-saver' : 'floating');
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(!!pinAll, { visibleOnFullScreen: !!pinAll });
    }
  } catch {}

  const savedOpacity = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
  if (!Number.isNaN(savedOpacity)) {
    try {
      mainWindow.setOpacity(savedOpacity);
    } catch {}
  }

  // Provisional placement (keep within work area)
  try {
    const d = screen.getPrimaryDisplay();
    const wa = d && d.workArea ? d.workArea : { x: 0, y: 0, width: 0, height: 0 };
    const [w, h] = mainWindow.getSize();
    const marginRight = 16;
    const marginBottom = 12;
    const posX = Math.round(wa.x + wa.width - w - marginRight);
    const posY = Math.round(wa.y + wa.height - h - marginBottom);
    mainWindow.setPosition(posX, posY);
  } catch {}

  mainWindow.loadFile('src/renderer/index.html');
  try {
    // Do not show automatically; popup controls visibility and user actions/shortcuts unhide as needed
    mainWindow.once('ready-to-show', () => {
      if (INITIAL_SHOW_MAIN) mainWindow.show();
    });
  } catch {}
  mainWindow.webContents.once('did-finish-load', () => {
    createPopupWindow();
  });

  const iconPath = path.resolve(__dirname, 'renderer/assets/icons/icon.png');
  mainWindow.setIcon(iconPath);

  // macOS only: no special taskbar handling
}

// delay helper moved to shortcuts.js

// Updates helpers removed (GitHub Releases discontinued)

// triggerMacCopyShortcut / macReadSelectedTextViaAX moved to shortcuts.js

// Show a window without stealing focus when possible
// showWindowNonActivating moved to shortcuts.js

// Safe wrapper to get all BrowserWindows
// getAllWindowsSafe moved to shortcuts.js

// Bring our main window to foreground (best-effort) without changing UI layout
function bringAppToFront() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  } catch {}
}

// readClipboardTextTrimmed / pollClipboardChange moved to shortcuts.js

// Clipboard helpers moved to shortcuts.js

// tryCopySelectedText moved to shortcuts.js

// Cross-platform interactive area screenshot
// captureInteractiveArea moved to shortcuts.js

app.whenReady().then(async () => {
  // Start clipboard watcher (non-critical)
  startClipboardWatcher();
  try {
    const userData = app.getPath('userData');
    const prefsPath = path.join(userData, 'irukadark.prefs.json');
    if (fs.existsSync(prefsPath)) {
      const raw = fs.readFileSync(prefsPath, 'utf8');
      const prefs = JSON.parse(raw || '{}') || {};
      if (prefs.MENU_LANGUAGE) {
        process.env.MENU_LANGUAGE = String(prefs.MENU_LANGUAGE);
      }
      if (prefs.UI_THEME) {
        process.env.UI_THEME = String(prefs.UI_THEME);
      }
      if (typeof prefs.PIN_ALL_SPACES !== 'undefined') {
        process.env.PIN_ALL_SPACES = String(prefs.PIN_ALL_SPACES);
      }
      if (typeof prefs.WINDOW_OPACITY !== 'undefined') {
        process.env.WINDOW_OPACITY = String(prefs.WINDOW_OPACITY);
      }
      if (typeof prefs.ENABLE_GOOGLE_SEARCH !== 'undefined') {
        process.env.ENABLE_GOOGLE_SEARCH = String(prefs.ENABLE_GOOGLE_SEARCH);
      }
      if (prefs.GLASS_LEVEL) {
        process.env.GLASS_LEVEL = String(prefs.GLASS_LEVEL);
      }
      if (prefs.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = String(prefs.GEMINI_API_KEY);
      }
      if (prefs.GEMINI_MODEL) {
        process.env.GEMINI_MODEL = String(prefs.GEMINI_MODEL);
      }
      if (prefs.WEB_SEARCH_MODEL) {
        process.env.WEB_SEARCH_MODEL = String(prefs.WEB_SEARCH_MODEL);
      }
      if (prefs.TONE) {
        process.env.TONE = String(prefs.TONE);
      }
    }
  } catch {}

  // One-time migration: if .env.local provided values and prefs are empty, copy them into prefs
  try {
    const p = loadPrefs();
    let changed = false;
    const maybeCopy = (k) => {
      if (!p[k] && process.env[k]) {
        p[k] = String(process.env[k]);
        changed = true;
      }
    };
    maybeCopy('GEMINI_API_KEY');
    maybeCopy('GEMINI_MODEL');
    maybeCopy('WEB_SEARCH_MODEL');
    maybeCopy('UI_THEME');
    maybeCopy('PIN_ALL_SPACES');
    maybeCopy('ENABLE_GOOGLE_SEARCH');
    maybeCopy('WINDOW_OPACITY');
    maybeCopy('GLASS_LEVEL');
    maybeCopy('TONE');
    if (changed) savePrefs(p);
  } catch {}
  try {
    if (process.platform === 'darwin' && typeof app.setAboutPanelOptions === 'function') {
      app.setAboutPanelOptions({
        applicationName: 'IrukaDark',
        applicationVersion: app.getVersion(),
        iconPath: path.resolve(__dirname, 'renderer/assets/icons/icon.png'),
      });
    }
  } catch {}
  createAppMenu();

  createWindow();

  // Update checks removed

  // Preflight permissions on first launch (macOS): Accessibility + Screen Recording
  try {
    const { preflightPermissionsOnce } = require('./main/permissions');
    setTimeout(() => {
      try {
        preflightPermissionsOnce({ loadPrefs, savePrefs, bringAppToFront });
      } catch {}
    }, 400);
  } catch {}

  try {
    const registerShortcut = (accel, detailed = false) => {
      try {
        const ok = globalShortcut.register(accel, () => {
          (async () => {
            try {
              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;
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
        return false;
      }
    };

    const baseCandidates = ['Alt+A']; // mac: Option+A
    let baseUsed = '';
    for (const c of baseCandidates) {
      if (registerShortcut(c, false)) {
        baseUsed = c;
        break;
      }
    }

    const detailedCandidates = ['Alt+Shift+A']; // mac: Option+Shift+A
    let detailedUsed = '';
    for (const c of detailedCandidates) {
      if (registerShortcut(c, true)) {
        detailedUsed = c;
        break;
      }
    }

    // Pure translation: Option+R
    const translateCandidates = ['Alt+R'];
    let translateUsed = '';
    for (const c of translateCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          (async () => {
            try {
              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;
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

    // Screenshot explain: Option+S
    const screenshotCandidates = ['Alt+S'];
    for (const c of screenshotCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          (async () => {
            try {
              const { data, mimeType } = await captureInteractiveArea();
              if (!data) return; // user likely canceled or not supported
              if (mainWindow && !mainWindow.isDestroyed()) {
                if (!mainWindow.isVisible()) mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('explain-screenshot', { data, mimeType });
              }
            } catch (e) {
              if (isDev) console.warn('Screenshot explain failed:', e?.message);
            }
          })();
        });
        if (ok) {
          break;
        }
      } catch {}
    }

    // Screenshot explain (detailed): Option+Shift+S
    const screenshotDetailedCandidates = ['Alt+Shift+S'];
    for (const c of screenshotDetailedCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          (async () => {
            try {
              const { data, mimeType } = await captureInteractiveArea();
              if (!data) return;
              if (mainWindow && !mainWindow.isDestroyed()) {
                if (!mainWindow.isVisible()) mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.send('explain-screenshot-detailed', { data, mimeType });
              }
            } catch (e) {
              if (isDev) console.warn('Screenshot detailed explain failed:', e?.message);
            }
          })();
        });
        if (ok) {
          break;
        }
      } catch {}
    }

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shortcut-registered', baseUsed);
        mainWindow.webContents.send('shortcut-detailed-registered', detailedUsed);
        mainWindow.webContents.send('shortcut-translate-registered', translateUsed);
      }
    } catch {}

    if (!baseUsed && !detailedUsed) {
      if (isDev) console.warn('Failed to register any global shortcut');
    } else if (!baseUsed) {
      if (isDev) console.warn('Base shortcut registration failed; detailed only');
    } else if (!detailedUsed) {
      if (isDev) console.warn('Detailed shortcut registration failed; base only');
    }
  } catch (e) {
    if (isDev) console.warn('Global shortcut registration error:', e?.message);
  }

  if (process.platform === 'darwin') {
    try {
      const trusted = systemPreferences.isTrustedAccessibilityClient(false);
      if (!trusted && mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          mainWindow.webContents.send('accessibility-warning');
        }, 800);
      }
    } catch {}
  }

  // Warm up SDK module and client once (non-blocking) to avoid first-call cold start
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

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {}
});

// --- Permissions preflight (macOS) ---
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

function getPref(key) {
  try {
    const p = loadPrefs();
    return p ? p[key] : undefined;
  } catch {
    return undefined;
  }
}

function setPref(key, value) {
  try {
    if (isPortableMode()) {
      const envPath = getPortableEnvPath();
      if (value === undefined || value === null || value === '') {
        // remove line
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

function getPortableEnvPath() {
  try {
    const inAsar = /app\.asar/i.test(String(app.getAppPath && app.getAppPath()));
    if (inAsar) {
      return path.join(app.getPath('userData'), '.env.local');
    }
  } catch {}
  return path.join(__dirname, '../.env.local');
}

// moved to ./main/permissions

// 言語設定の保存
function upsertEnvVar(envPath, key, value) {
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = envContent.split('\n').filter(Boolean);
  const idx = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
}

function saveLanguageSetting(language) {
  try {
    setPref('MENU_LANGUAGE', language);
  } catch {}
}

// メニュー言語切り替えハンドラー
function handleLanguageChange(language) {
  saveLanguageSetting(language);
  // 環境変数を更新
  process.env.MENU_LANGUAGE = language;
  // レンダラへ言語変更イベントを通知
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('language-changed', language);
    }
    if (typeof popupWindow !== 'undefined' && popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('language-changed', language);
    }
  } catch {}
  // メニューを再構築
  createAppMenu();
}

// テーマ設定の保存
function saveThemeSetting(theme) {
  try {
    setPref('UI_THEME', String(theme));
  } catch {}
}

function handleThemeChange(theme) {
  saveThemeSetting(theme);
  process.env.UI_THEME = theme;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme-changed', theme);
    }
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('theme-changed', theme);
    }
  } catch {}
  createAppMenu();
}

// トーン設定の取得/保存/適用
//

function saveToneSetting(tone) {
  try {
    setPref('TONE', String(tone));
  } catch {}
}

function handleToneChange(tone) {
  const v = String(tone || 'casual').toLowerCase() === 'formal' ? 'formal' : 'casual';
  saveToneSetting(v);
  process.env.TONE = v;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tone-changed', v);
    }
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('tone-changed', v);
    }
  } catch {}
  createAppMenu();
}

// 全アプリ・全スペース表示の保存/適用
function savePinAllSpacesSetting(enabled) {
  try {
    setPref('PIN_ALL_SPACES', enabled ? '1' : '0');
  } catch {}
}

function applyPinAllSpaces(enabled) {
  process.env.PIN_ALL_SPACES = enabled ? '1' : '0';
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, enabled ? 'screen-saver' : 'floating');
      if (process.platform === 'darwin') {
        mainWindow.setVisibleOnAllWorkspaces(!!enabled, { visibleOnFullScreen: !!enabled });
      }
    }
    if (typeof popupWindow !== 'undefined' && popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.setAlwaysOnTop(true, enabled ? 'screen-saver' : 'floating');
      if (process.platform === 'darwin') {
        popupWindow.setVisibleOnAllWorkspaces(!!enabled, { visibleOnFullScreen: !!enabled });
      }
    }
  } catch {}
}

function handlePinAllSpacesChange(enabled) {
  savePinAllSpacesSetting(enabled);
  applyPinAllSpaces(enabled);
  createAppMenu();
}

// Web検索設定の保存
function saveWebSearchSetting(enabled) {
  try {
    setPref('ENABLE_GOOGLE_SEARCH', enabled ? '1' : '0');
  } catch {}
}

// アプリメニュー（Edit ロールを含む）- 多言語対応
function createAppMenu() {
  try {
    const buildMenu = require('./main/menu');
    const ctx = {
      currentLang: getCurrentLanguage(),
      getPref,
      setPref,
      openInputDialog,
      handleLanguageChange,
      handleThemeChange,
      handleToneChange,
      handleWindowOpacityChange,
      handlePinAllSpacesChange,
      hasPopupWindow: () =>
        !!(typeof popupWindow !== 'undefined' && popupWindow && !popupWindow.isDestroyed()),
      togglePopupWindow: () => {
        try {
          if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
          else createPopupWindow();
        } catch {}
      },
      // Updates removed
      rebuild: () => createAppMenu(),
    };
    buildMenu(ctx);
  } catch (e) {
    try {
      const minimal = Menu.buildFromTemplate([{ role: 'editMenu' }, { role: 'windowMenu' }]);
      Menu.setApplicationMenu(minimal);
    } catch {}
  }
}

function handleWindowOpacityChange(opacity) {
  try {
    try {
      setPref('WINDOW_OPACITY', String(opacity));
    } catch {}
    process.env.WINDOW_OPACITY = String(opacity);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(opacity);
      try {
        mainWindow.webContents.send('window-opacity-changed', opacity);
      } catch {}
    }
    if (typeof popupWindow !== 'undefined' && popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.setOpacity(opacity);
      try {
        popupWindow.webContents.send('window-opacity-changed', opacity);
      } catch {}
    }
    createAppMenu();
  } catch (e) {
    if (isDev) console.warn('Failed to change window opacity:', e?.message);
  }
}

app.on('window-all-closed', () => {
  try {
    closingAllWindows = true;
  } catch {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure auxiliary windows are closed even when quitting from menu or other paths
app.on('before-quit', () => {
  try {
    closingAllWindows = true;
  } catch {}
  try {
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

// As a last resort, force-destroy any remaining windows
app.on('will-quit', () => {
  try {
    const wins = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
    for (const w of wins) {
      try {
        if (!w.isDestroyed()) w.destroy();
      } catch {}
    }
  } catch {}
});

app.on('quit', () => {
  try {
    popupWindow = null;
  } catch {}
  try {
    mainWindow = null;
  } catch {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Allow renderer to cancel the current in-flight shortcut AI request
ipcMain.handle('cancel-ai', () => {
  try {
    if (currentAIKind === 'shortcut' && currentAIController) {
      try {
        if (currentAICancelFlag) currentAICancelFlag.user = true;
      } catch {}
      try {
        currentAIController.abort();
      } catch {}
      return true;
    }
  } catch {}
  return false;
});

ipcMain.handle('get-model', () => {
  const model = getPref('GEMINI_MODEL') || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  return model;
});

ipcMain.handle('get-tone', () => {
  return getPref('TONE') || process.env.TONE || 'casual';
});

ipcMain.handle('get-ui-theme', () => {
  return getPref('UI_THEME') || process.env.UI_THEME || 'dark';
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

// Update notifications removed

// Ensure main window becomes visible (optionally with focus)
ipcMain.handle('ui:ensure-visible', (_e, opts) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const wantFocus = !!(opts && opts.focus);
      if (!mainWindow.isVisible()) {
        try {
          if (!wantFocus) showWindowNonActivating(mainWindow);
          else mainWindow.show();
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
    }
  } catch {}
  return false;
});

ipcMain.handle('ui:show-app-menu', (e, pos) => {
  try {
    let menu = Menu.getApplicationMenu();
    if (!menu) {
      createAppMenu();
      menu = Menu.getApplicationMenu();
    }
    if (!menu) return false;
    const win = BrowserWindow.fromWebContents(e.sender);
    const x = Math.max(0, Math.round((pos && pos.x) || 0));
    const y = Math.max(0, Math.round((pos && pos.y) || 0));
    menu.popup({ window: win, x, y });
    return true;
  } catch {
    return false;
  }
});

// 言語設定の取得
ipcMain.handle('get-ui-language', () => {
  return getPref('MENU_LANGUAGE') || process.env.MENU_LANGUAGE || 'en';
});

// Web検索設定の保存
ipcMain.handle('save-web-search-setting', (_e, enabled) => {
  saveWebSearchSetting(enabled);
  process.env.ENABLE_GOOGLE_SEARCH = enabled ? '1' : '0';
  return true;
});

// 背景透過レベル
ipcMain.handle('get-glass-level', () => {
  return getPref('GLASS_LEVEL') || process.env.GLASS_LEVEL || 'medium';
});

// Web検索設定の取得
ipcMain.handle('get-web-search-enabled', () => {
  // デフォルトはOFF ('0')
  const v = String(getPref('ENABLE_GOOGLE_SEARCH') || process.env.ENABLE_GOOGLE_SEARCH || '0');
  return v !== '0' && v.toLowerCase() !== 'false' && v.toLowerCase() !== 'off';
});

// ウィンドウ不透明度
ipcMain.handle('get-window-opacity', () => {
  const v = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
  return Number.isFinite(v) ? v : 1;
});

// Gemini API proxy: execute in main (renderer never sees API key)
ipcMain.handle('ai:generate', async (_e, payload) => {
  try {
    const keys = resolveApiKeys();
    if (!keys.length) return 'API key is not set. Please set GEMINI_API_KEY in .env.local file.';
    const prompt = String(payload?.prompt ?? '');
    if (!prompt) return '';
    const source = String(payload?.source || 'chat');
    const isShortcut = source === 'shortcut';
    const requestedModel = String(
      process.env.GEMINI_MODEL || payload?.model || 'gemini-2.5-flash-lite'
    );
    let generationConfig = payload?.generationConfig || {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    };
    // Speed up shortcut responses by clamping output and slightly narrower sampling
    if (isShortcut) {
      const maxTokEnv = Number.parseInt(process.env.SHORTCUT_MAX_TOKENS || '', 10);
      const cap = Number.isFinite(maxTokEnv) && maxTokEnv > 0 ? maxTokEnv : 1024;
      generationConfig = {
        ...generationConfig,
        maxOutputTokens: Math.min(cap, Number(generationConfig.maxOutputTokens || 2048)),
        topK: Math.min(32, Number(generationConfig.topK || 40)),
        topP: Math.min(0.9, Number(generationConfig.topP || 0.95)),
      };
    }
    // Prefer search only when explicitly enabled by the renderer
    const useGoogleSearch = payload?.useWebSearch === true; // Use frontend's preference

    // Try requested model first, then a search-capable model
    const searchPreferred =
      getPref('WEB_SEARCH_MODEL') || process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash';
    // Remove duplicates
    const modelsToTry =
      requestedModel === searchPreferred ? [requestedModel] : [requestedModel, searchPreferred];

    const isInvalid = (msg) => /API_KEY_INVALID|API key not valid/i.test(String(msg || ''));
    const tryOne = async (key) => {
      // Create client once for SDK attempts
      let client = null;
      try {
        client = await getGenAIClientForKey(key);
      } catch (e) {
        if (isDev) console.log('SDK client creation failed:', e?.message);
      }

      // AbortController for timeouts/cancel
      const controller = new AbortController();
      const cancelFlag = { user: false };
      // Timeout: Web検索ONなら60秒、OFFは従来（30秒）
      const timeoutMs = useGoogleSearch ? 60000 : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      // Expose as current for user-initiated cancel (shortcutのみ対象)
      currentAIController = controller;
      currentAIKind = isShortcut ? 'shortcut' : 'chat';
      currentAICancelFlag = cancelFlag;

      try {
        for (const modelName of modelsToTry) {
          const bare = modelCandidates(modelName)[0].replace(/^models\//, '');

          if (!isShortcut) {
            // 1) Try SDK with Google Search
            if (client) {
              try {
                const r1 = await sdkGenerateText(client, modelName, prompt, generationConfig, {
                  useGoogleSearch,
                });
                if (r1) {
                  clearTimeout(timeoutId);
                  return r1;
                }
              } catch (e) {
                if (isDev) console.log(`SDK with tools failed for ${modelName}:`, e?.message);
              }
            }
          }

          // 2) REST with Google Search
          try {
            const r3 = await restGenerateText(key, bare, prompt, generationConfig, {
              useGoogleSearch,
              signal: controller.signal,
            });
            if (r3) {
              clearTimeout(timeoutId);
              return r3;
            }
          } catch (e) {
            const m = e?.message || '';
            if (isInvalid(m)) {
              clearTimeout(timeoutId);
              throw new Error('API_KEY_INVALID');
            }
            if (e.name === 'AbortError') {
              clearTimeout(timeoutId);
              // Differentiate user-cancel vs timeout
              if (cancelFlag.user) throw new Error('CANCELLED');
              throw new Error('Request timed out');
            }
            if (isDev) console.log(`REST with tools failed for ${modelName}:`, m);
          }

          // Without tools only when search is OFF
          if (!useGoogleSearch) {
            if (!isShortcut && client) {
              try {
                const r2 = await sdkGenerateText(client, modelName, prompt, generationConfig, {
                  useGoogleSearch: false,
                });
                if (r2) {
                  clearTimeout(timeoutId);
                  return r2;
                }
              } catch {}
            }
            try {
              const r4 = await restGenerateText(key, bare, prompt, generationConfig, {
                useGoogleSearch: false,
                signal: controller.signal,
              });
              if (r4) {
                clearTimeout(timeoutId);
                return r4;
              }
            } catch (e) {
              const m = e?.message || '';
              if (isInvalid(m)) {
                clearTimeout(timeoutId);
                throw new Error('API_KEY_INVALID');
              }
            }
          }
        }

        clearTimeout(timeoutId);
        throw new Error('All model attempts failed');
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      } finally {
        // Clear current controller if it is ours
        try {
          if (currentAIController === controller) {
            currentAIController = null;
            currentAIKind = null;
            currentAICancelFlag = null;
          }
        } catch {}
      }
    };

    for (const key of keys) {
      try {
        const out = await tryOne(key);
        if (out) return out;
      } catch (e) {
        if (String(e?.message) === 'API_KEY_INVALID') {
          continue;
        } else {
          return `API error occurred: ${e?.message || 'Unknown error'}`;
        }
      }
    }
    return 'API error occurred: No valid Gemini API key found. Please set a valid key (e.g., GEMINI_API_KEY) in .env.local.';
  } catch (err) {
    return `API error occurred: ${err?.message || 'Unknown error'}`;
  }
});

// Image-capable Gemini API proxy
ipcMain.handle('ai:generate-with-image', async (_e, payload) => {
  try {
    const keys = resolveApiKeys();
    if (!keys.length) return 'API key is not set. Please set GEMINI_API_KEY in .env.local file.';
    const prompt = String(payload?.prompt ?? '');
    const imageBase64 = String(payload?.imageBase64 || '');
    const mimeType = String(payload?.mimeType || 'image/png');
    if (!prompt || !imageBase64) return '';
    const source = String(payload?.source || 'chat');
    const isShortcut = source === 'shortcut';
    const requestedModel = String(
      process.env.GEMINI_MODEL || payload?.model || 'gemini-2.5-flash-lite'
    );
    let generationConfig = payload?.generationConfig || {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    };
    if (isShortcut) {
      const maxTokEnv = Number.parseInt(process.env.SHORTCUT_MAX_TOKENS || '', 10);
      const cap = Number.isFinite(maxTokEnv) && maxTokEnv > 0 ? maxTokEnv : 1024;
      generationConfig = {
        ...generationConfig,
        maxOutputTokens: Math.min(cap, Number(generationConfig.maxOutputTokens || 2048)),
        topK: Math.min(32, Number(generationConfig.topK || 40)),
        topP: Math.min(0.9, Number(generationConfig.topP || 0.95)),
      };
    }
    // Search only when explicitly enabled by the renderer
    const useGoogleSearch = payload?.useWebSearch === true; // Use frontend's preference
    const searchPreferred =
      getPref('WEB_SEARCH_MODEL') || process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash';
    // Remove duplicates
    const modelsToTry =
      requestedModel === searchPreferred ? [requestedModel] : [requestedModel, searchPreferred];

    const isInvalid = (msg) => /API_KEY_INVALID|API key not valid/i.test(String(msg || ''));
    const tryOne = async (key) => {
      // Create client once for SDK attempts
      let client = null;
      try {
        client = await getGenAIClientForKey(key);
      } catch (e) {
        if (isDev) console.log('SDK client creation failed:', e?.message);
      }

      // AbortController for timeouts/cancel
      const controller = new AbortController();
      const cancelFlag = { user: false };
      // Timeout: Web検索ON=60秒、OFF=45秒
      const timeoutMs = useGoogleSearch ? 60000 : 45000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      currentAIController = controller;
      currentAIKind = isShortcut ? 'shortcut' : 'chat';
      currentAICancelFlag = cancelFlag;

      try {
        for (const modelName of modelsToTry) {
          const bare = modelCandidates(modelName)[0].replace(/^models\//, '');

          if (!isShortcut) {
            // 1) Try SDK with Google Search
            if (client) {
              try {
                const r1 = await sdkGenerateImage(
                  client,
                  modelName,
                  prompt,
                  imageBase64,
                  mimeType,
                  generationConfig,
                  { useGoogleSearch }
                );
                if (r1) {
                  clearTimeout(timeoutId);
                  return r1;
                }
              } catch (e) {
                if (isDev) console.log(`SDK with tools failed for ${modelName}:`, e?.message);
              }
            }
          }

          // 2) REST with Google Search
          try {
            const r3 = await restGenerateImage(
              key,
              bare,
              prompt,
              imageBase64,
              mimeType,
              generationConfig,
              { useGoogleSearch, signal: controller.signal }
            );
            if (r3) {
              clearTimeout(timeoutId);
              return r3;
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
            if (isDev) console.log(`REST with tools failed for ${modelName}:`, m);
          }

          if (!useGoogleSearch) {
            if (!isShortcut && client) {
              try {
                const r2 = await sdkGenerateImage(
                  client,
                  modelName,
                  prompt,
                  imageBase64,
                  mimeType,
                  generationConfig,
                  { useGoogleSearch: false }
                );
                if (r2) {
                  clearTimeout(timeoutId);
                  return r2;
                }
              } catch {}
            }
            try {
              const r4 = await restGenerateImage(
                key,
                bare,
                prompt,
                imageBase64,
                mimeType,
                generationConfig,
                { useGoogleSearch: false, signal: controller.signal }
              );
              if (r4) {
                clearTimeout(timeoutId);
                return r4;
              }
            } catch (e) {
              const m = e?.message || '';
              if (isInvalid(m)) {
                clearTimeout(timeoutId);
                throw new Error('API_KEY_INVALID');
              }
            }
          }
        }

        clearTimeout(timeoutId);
        throw new Error('All model attempts failed');
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

    for (const key of keys) {
      try {
        const out = await tryOne(key);
        if (out) return out;
      } catch (e) {
        if (String(e?.message) === 'API_KEY_INVALID') {
          continue;
        } else {
          return `API error occurred: ${e?.message || 'Unknown error'}`;
        }
      }
    }
    return 'API error occurred: No valid Gemini API key found. Please set a valid key (e.g., GEMINI_API_KEY) in .env.local.';
  } catch (err) {
    return `API error occurred: ${err?.message || 'Unknown error'}`;
  }
});

// 別窓（透明ロゴ窓）
let popupWindow = null;
let mainInitiallyShown = false;
let popupPointerDown = false;
let popupMovedSinceDown = false;
let popupDownBounds = null;

function createPopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.focus();
    return;
  }

  const mainBounds = mainWindow.getBounds();
  const popupWidth = 84;
  const popupHeight = 84;
  // 初期配置: 右端寄り・縦中央。ユーザー作業の邪魔にならない位置。
  const primary = screen.getPrimaryDisplay();
  const wa =
    primary && primary.workArea ? primary.workArea : { x: 0, y: 0, width: 1200, height: 800 };
  const popupX = Math.round(wa.x + wa.width - popupWidth - Math.max(0, INITIAL_POPUP_MARGIN_RIGHT));
  const popupY = Math.round(wa.y + Math.max(0, Math.floor((wa.height - popupHeight) / 2)));
  // メインはポップアップの少し上（重なり気味）に配置するが、初期表示は環境変数で制御
  const mainX = popupX + Math.round((popupWidth - mainBounds.width) / 2);
  const mainY = popupY - mainBounds.height + 10;

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: popupX,
    y: popupY,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    useContentSize: true,
    backgroundColor: '#00000000',
    resizable: false,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: false,
    },
  });

  try {
    const pinAll = !['0', 'false', 'off'].includes(
      String(getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase()
    );
    popupWindow.setAlwaysOnTop(true, pinAll ? 'screen-saver' : 'floating');
    if (process.platform === 'darwin') {
      popupWindow.setVisibleOnAllWorkspaces(!!pinAll, { visibleOnFullScreen: !!pinAll });
    }
  } catch {}

  popupWindow.loadFile(path.join(__dirname, 'renderer/popup.html'));
  const savedOpacity = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
  if (!Number.isNaN(savedOpacity)) {
    try {
      popupWindow.setOpacity(savedOpacity);
    } catch {}
  }

  mainWindow.setPosition(Math.round(mainX), Math.round(mainY));

  popupWindow.on('closed', () => {
    popupWindow = null;
  });

  const positionMainAbovePopup = () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed() || !popupWindow || popupWindow.isDestroyed()) {
        return;
      }

      const popupBounds = popupWindow.getBounds();
      const mainBounds = mainWindow.getBounds();
      const gap = -10; // アイコンからの隙間（px）- マイナスで重なる

      let targetX = popupBounds.x + Math.round((popupBounds.width - mainBounds.width) / 2);
      let targetY = popupBounds.y - mainBounds.height - gap;

      const nearest = screen.getDisplayNearestPoint({ x: popupBounds.x, y: popupBounds.y });
      const wa = nearest.workArea;
      targetX = Math.min(Math.max(targetX, wa.x), wa.x + wa.width - mainBounds.width);
      targetY = Math.min(Math.max(targetY, wa.y), wa.y + wa.height - mainBounds.height);

      mainWindow.setPosition(Math.round(targetX), Math.round(targetY));
      if (!mainInitiallyShown && INITIAL_SHOW_MAIN) {
        mainWindow.show();
        mainInitiallyShown = true;
      }
    } catch {}
  };
  popupWindow.on('move', positionMainAbovePopup);
  popupWindow.on('move', () => {
    if (popupPointerDown) popupMovedSinceDown = true;
  });
  popupWindow.on('resize', positionMainAbovePopup);
  // Avoid repositioning in response to main window resizing to prevent feedback loops
  if (mainWindow && !mainWindow.isDestroyed()) {
    // intentionally no 'resize' listener
  }
  positionMainAbovePopup();
}

// IPC from popup renderer: pointer phases to detect stationary click-release
ipcMain.handle('popup:pointer', (_e, phase) => {
  try {
    const p = String(phase || '').toLowerCase();
    if (!popupWindow || popupWindow.isDestroyed()) return false;
    if (p === 'down') {
      popupPointerDown = true;
      popupMovedSinceDown = false;
      try {
        popupDownBounds = popupWindow.getBounds();
      } catch {
        popupDownBounds = null;
      }
      return true;
    }
    if (p === 'up') {
      const wasDown = popupPointerDown;
      popupPointerDown = false;
      let moved = !!popupMovedSinceDown;
      popupMovedSinceDown = false;
      // Fallback precise check: compare bounds equality between down and current
      try {
        if (popupDownBounds) {
          const cur = popupWindow.getBounds();
          if (cur && typeof cur.x === 'number' && typeof cur.y === 'number') {
            const same = cur.x === popupDownBounds.x && cur.y === popupDownBounds.y;
            moved = moved || !same ? moved : false; // if same, keep moved as-is (likely false)
          }
        }
      } catch {}
      popupDownBounds = null;
      if (wasDown && !moved) {
        // Stationary click-release: toggle main window visibility
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isVisible()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
          }
        } catch {}
      }
      return true;
    }
  } catch {}
  return false;
});

// Popup window bounds helpers for manual drag
ipcMain.handle('popup:get-bounds', () => {
  try {
    if (popupWindow && !popupWindow.isDestroyed()) {
      return popupWindow.getBounds();
    }
  } catch {}
  return null;
});

ipcMain.handle('popup:set-position', (_e, pos) => {
  try {
    if (!popupWindow || popupWindow.isDestroyed()) return false;
    const x = Math.round(Number(pos?.x) || 0);
    const y = Math.round(Number(pos?.y) || 0);
    popupWindow.setPosition(x, y);
    return true;
  } catch {
    return false;
  }
});
