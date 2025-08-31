/*!
 * IrukaDark — (c) 2025 CORe Inc (コーレ株式会社).
 * License: MIT. See https://github.com/mokuwaki0517/IrukaDark/blob/HEAD/LICENSE
 */
const { app, BrowserWindow, ipcMain, screen, systemPreferences, Menu, globalShortcut, clipboard, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');

const fs = require('fs');
const dotenv = require('dotenv');

const envPaths = [
  path.join(__dirname, '../.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, '../../.env.local')
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    if (process.env.NODE_ENV === 'development') console.log('Loading .env.local from:', envPath);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('No .env.local file found in any of the expected locations');
    console.log('Tried paths:', envPaths);
  }
}

// Only .env.local and OS env vars are loaded (no .env.example at runtime)

const isDev = process.env.NODE_ENV === 'development';

// Track current in-flight AI request for cancellation (shortcut-only)
let currentAIController = null;        // AbortController of the active REST call
let currentAIKind = null;              // 'shortcut' | 'chat' | null

// Track clipboard text freshness (trimmed text + last change time)
let clipboardTextSnapshot = '';
let clipboardChangedAt = 0; // 0 means unknown age
let clipboardWatcher = null;

function startClipboardWatcher() {
  try {
    // Initialize snapshot without setting changedAt, so old content is treated as unknown (stale)
    try { clipboardTextSnapshot = (clipboard.readText() || '').trim(); } catch { clipboardTextSnapshot = ''; }
    clipboardChangedAt = 0;
    if (clipboardWatcher) { try { clearInterval(clipboardWatcher); } catch {} }
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
    // Only judge age if the provided text matches current clipboard text
    if (!text || text.trim() !== current) return false;
  } catch { /* if cannot read, fall through to conservative check */ }
  // Unknown age -> treat as stale
  if (!clipboardChangedAt) return true;
  return (Date.now() - clipboardChangedAt) >= thresholdMs;
}
let currentAICancelFlag = null;        // { user: boolean } when cancel requested by user

function resolveApiKeys() {
  // Prefer explicit Gemini/GenAI keys; try generic/public keys last
  const order = [
    'GEMINI_API_KEY',
    'GOOGLE_GENAI_API_KEY',
    'GENAI_API_KEY',
    // Less specific keys at the end (may be for other Google APIs)
    'GOOGLE_API_KEY',
    'NEXT_PUBLIC_GEMINI_API_KEY',
    'NEXT_PUBLIC_GOOGLE_API_KEY'
  ];
  const seen = new Set();
  const result = [];
  for (const name of order) {
    const v = process.env[name];
    if (v && String(v).trim()) {
      const val = String(v).trim();
      if (!seen.has(val)) { seen.add(val); result.push(val); }
    }
  }
  return result;
}

if (isDev) {
  const hasAnyKey = resolveApiKeys().length > 0;
  console.log('Any GenAI API key loaded:', hasAnyKey ? 'Yes' : 'No');
  console.log('GEMINI_MODEL set:', process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
  console.log('MENU_LANGUAGE set:', process.env.MENU_LANGUAGE || 'en');
  console.log('UI_THEME set:', process.env.UI_THEME || 'dark');
}

// Lazy-load Google GenAI SDK (@google/genai) in CommonJS context (Electron main)
async function getGenAIClientForKey(apiKey) {
  if (!global.__irukadark_genai_clients) global.__irukadark_genai_clients = new Map();
  const cache = global.__irukadark_genai_clients;
  if (cache.has(apiKey)) return cache.get(apiKey);
  try {
    // @google/genai is ESM; use dynamic import from CJS
    const mod = await import('@google/genai');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

    // New SDK may export GoogleAI or GoogleGenerativeAI
    let Ctor = mod.GoogleAI || mod.GoogleGenerativeAI || mod.default || null;
    if (!Ctor) {
      // try to discover a likely constructor
      for (const k of Object.keys(mod)) {
        const val = mod[k];
        if (typeof val === 'function' && /Google|Gen|AI/i.test(k)) { Ctor = val; break; }
      }
    }
    if (!Ctor) throw new Error('Unable to find Google GenAI client export.');

    let client = null;
    // Try both construction patterns: (apiKey) and ({ apiKey })
    try { client = new Ctor(apiKey); } catch {}
    if (!client) {
      try { client = new Ctor({ apiKey }); } catch {}
    }
    if (!client) throw new Error('Failed to create Google GenAI client instance.');

    cache.set(apiKey, client);
    return client;
  } catch (e) {
    // Re-throw with a friendly message; callers catch and present to UI
    const msg = e && e.message ? e.message : String(e);
    // Attempt a transparent fallback to older SDK if available
    try {
      const legacy = await import('@google/generative-ai');
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
      const L = legacy.GoogleGenerativeAI || legacy.default;
      if (!L) throw new Error(msg);
      const client = new L(apiKey);
      cache.set(apiKey, client);
      return client;
    } catch (_) {
      throw new Error(`Failed to initialize Google GenAI SDK (@google/genai). ${msg}`);
    }
  }
}

function extractTextFromSDKResult(result) {
  try {
    if (!result) return '';
    // Normalize common access point
    const r = result.response || result;

    // Convenience text() (older style)
    if (r && typeof r.text === 'function') {
      try { const t = r.text(); if (t) return t; } catch {}
    }

    // New Responses API convenience field
    if (typeof r?.output_text === 'string' && r.output_text) {
      return r.output_text;
    }

    // Candidates -> content -> parts -> text
    const candidates = r?.candidates || result?.candidates || [];
    if (Array.isArray(candidates) && candidates.length) {
      const parts = candidates[0]?.content?.parts || candidates[0]?.content || [];
      if (Array.isArray(parts)) {
        const text = parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('');
        if (text) return text;
      } else if (typeof parts?.text === 'string') {
        return parts.text;
      }
    }

    // outputs/output shape
    const outputs = r?.outputs || r?.output || null;
    if (Array.isArray(outputs) && outputs.length) {
      const content = outputs[0]?.content || outputs[0] || [];
      if (Array.isArray(content)) {
        const t = content.map(p => (typeof p?.text === 'string' ? p.text : '')).join('');
        if (t) return t;
      } else if (typeof content?.text === 'string') {
        return content.text;
      }
    }
  } catch {}
  return '';
}

function extractSourcesFromSDKResult(result) {
  try {
    const r = result?.response || result || {};
    // Candidates-level grounding metadata
    const cand = (r.candidates && r.candidates[0]) || (result.candidates && result.candidates[0]) || {};
    const gm = cand.groundingMetadata || cand.grounding_metadata || r.groundingMetadata || r.grounding_metadata || {};
    let attrs = gm.groundingAttributions || gm.grounding_attributions || [];
    if (!Array.isArray(attrs)) attrs = [];
    const out = [];
    for (const a of attrs) {
      const web = a?.web || a?.webSearchResult || a?.source || a?.site || null;
      if (!web) continue;
      const url = web.uri || web.url || web.link || '';
      const title = web.title || web.pageTitle || web.name || url || '';
      if (url) out.push({ url, title: String(title || url) });
    }
    // Fallback: try generic citations field
    const cites = r.citations || r.citationMetadata || cand.citationMetadata || null;
    const citeItems = cites?.citations || cites?.sources || [];
    if (Array.isArray(citeItems)) {
      for (const c of citeItems) {
        const url = c?.uri || c?.url || '';
        const title = c?.title || c?.publicationTitle || url || '';
        if (url) out.push({ url, title: String(title || url) });
      }
    }
    // Deduplicate by url
    const seen = new Set();
    return out.filter(s => {
      if (!s || !s.url) return false;
      const key = String(s.url).trim();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  } catch {
    return [];
  }
}

function extractSourcesFromRESTData(data) {
  try {
    const cand = data?.candidates?.[0] || {};
    const gm = cand.groundingMetadata || cand.grounding_metadata || data?.groundingMetadata || {};
    let attrs = gm.groundingAttributions || gm.grounding_attributions || [];
    if (!Array.isArray(attrs)) attrs = [];
    const out = [];
    for (const a of attrs) {
      const web = a?.web || a?.webSearchResult || a?.source || null;
      if (!web) continue;
      const url = web.uri || web.url || '';
      const title = web.title || web.pageTitle || url || '';
      if (url) out.push({ url, title: String(title || url) });
    }
    const cites = cand.citationMetadata || data?.citationMetadata || null;
    const citeItems = cites?.citations || [];
    if (Array.isArray(citeItems)) {
      for (const c of citeItems) {
        const url = c?.uri || c?.url || '';
        const title = c?.title || url || '';
        if (url) out.push({ url, title: String(title || url) });
      }
    }
    const seen = new Set();
    return out.filter(s => {
      if (!s || !s.url) return false;
      const key = String(s.url).trim();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  } catch {
    return [];
  }
}

function modelCandidates(original) {
  const raw = String(original || '').trim();
  const bare = raw.replace(/^models\//, '');
  const withPrefix = `models/${bare}`;
  return Array.from(new Set([bare, withPrefix]));
}

async function restGenerateText(apiKey, modelBare, prompt, generationConfig, { useGoogleSearch = false, signal } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    generationConfig: generationConfig || undefined,
    // Enable Google Search grounding when requested (API supports tools)
    tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal || undefined
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API Error: ${res.status} - ${t}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const sources = extractSourcesFromRESTData(data);
  const outText = (typeof text === 'string' && text.length) ? text : 'Unexpected response from API.';
  return { text: outText, sources };
}

async function restGenerateImage(apiKey, modelBare, prompt, imageBase64, mimeType, generationConfig, { useGoogleSearch = false, signal } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      parts: [ { text: String(prompt || '') }, { inlineData: { data: String(imageBase64 || ''), mimeType: String(mimeType || 'image/png') } } ]
    }],
    generationConfig: generationConfig || undefined,
    tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal || undefined
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API Error: ${res.status} - ${t}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const sources = extractSourcesFromRESTData(data);
  const outText = (typeof text === 'string' && text.length) ? text : 'Unexpected response from API.';
  return { text: outText, sources };
}

async function sdkGenerateText(genAI, modelName, prompt, generationConfig, { useGoogleSearch = false } = {}) {
  const candidates = modelCandidates(modelName);
  // Try getGenerativeModel path first
  if (genAI && typeof genAI.getGenerativeModel === 'function') {
    for (const m of candidates) {
      try {
        const model = genAI.getGenerativeModel({ model: m, generationConfig });
        // Attempt call-level tools payload (newer pattern)
        try {
          const r0 = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
            tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
            generationConfig,
          });
          const t0 = extractTextFromSDKResult(r0);
          const s0 = extractSourcesFromSDKResult(r0);
          if (t0) return { text: t0, sources: s0 };
        } catch {}
        try {
          const r1 = await model.generateContent(String(prompt));
          const t1 = extractTextFromSDKResult(r1);
          const s1 = extractSourcesFromSDKResult(r1);
          if (t1) return { text: t1, sources: s1 };
        } catch {}
        try {
          const r2 = await model.generateContent({ input: String(prompt) });
          const t2 = extractTextFromSDKResult(r2);
          const s2 = extractSourcesFromSDKResult(r2);
          if (t2) return { text: t2, sources: s2 };
        } catch {}
      } catch {}
    }
  }
  // Try Responses API
  if (genAI && genAI.responses && typeof genAI.responses.generate === 'function') {
    for (const m of candidates) {
      try {
        const r = await genAI.responses.generate({
          model: m,
          input: String(prompt),
          tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
          // groundingConfig omitted for compatibility
        });
        const t = extractTextFromSDKResult(r);
        const s = extractSourcesFromSDKResult(r);
        if (t) return { text: t, sources: s };
      } catch {}
    }
  }
  return '';
}

async function sdkGenerateImage(genAI, modelName, prompt, imageBase64, mimeType, generationConfig, { useGoogleSearch = false } = {}) {
  const candidates = modelCandidates(modelName);
  const imagePart = { inlineData: { data: String(imageBase64 || ''), mimeType: String(mimeType || 'image/png') } };
  if (genAI && typeof genAI.getGenerativeModel === 'function') {
    for (const m of candidates) {
      try {
        const model = genAI.getGenerativeModel({ model: m, generationConfig });
        // Attempt call-level tools payload
        try {
          const r0 = await model.generateContent({
            contents: [{ role: 'user', parts: [ { text: String(prompt) }, imagePart ] }],
            tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
            generationConfig,
          });
          const t0 = extractTextFromSDKResult(r0);
          const s0 = extractSourcesFromSDKResult(r0);
          if (t0) return { text: t0, sources: s0 };
        } catch {}
        try {
          const r1 = await model.generateContent([ { text: String(prompt) }, imagePart ]);
          const t1 = extractTextFromSDKResult(r1);
          const s1 = extractSourcesFromSDKResult(r1);
          if (t1) return { text: t1, sources: s1 };
        } catch {}
        try {
          const r2 = await model.generateContent({ input: [ { text: String(prompt) }, imagePart ] });
          const t2 = extractTextFromSDKResult(r2);
          const s2 = extractSourcesFromSDKResult(r2);
          if (t2) return { text: t2, sources: s2 };
        } catch {}
      } catch {}
    }
  }
  if (genAI && genAI.responses && typeof genAI.responses.generate === 'function') {
    for (const m of candidates) {
      try {
        const r = await genAI.responses.generate({
          model: m,
          input: [ { text: String(prompt) }, imagePart ],
          tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
          // groundingConfig omitted
        });
        const t = extractTextFromSDKResult(r);
        const s = extractSourcesFromSDKResult(r);
        if (t) return { text: t, sources: s };
      } catch {}
    }
  }
  return '';
}

try {
  app.setName('IrukaDark');
} catch {}

let mainWindow;

function getCurrentLanguage() {
  return process.env.MENU_LANGUAGE || 'en';
}

const menuTranslations = {
  en: {
    irukadark: 'IrukaDark',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    appearance: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    windowOpacity: 'Window Opacity',
    opacity100: '100% (Solid)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Background Transparency',
    transparencyHigh: 'More Transparent',
    transparencyMedium: 'Standard',
    transparencyLow: 'Less Transparent',
    about: 'About',
    hide: 'Hide',
    unhide: 'Show All',
    quit: 'Quit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    pasteAndMatchStyle: 'Paste and Match Style',
    delete: 'Delete',
    selectAll: 'Select All',
    
    
    language: 'Language',
    languageEnglish: 'English',
    languageJapanese: '日本語',
    showLogoPopup: 'Show Logo Popup',
    pinAllSpaces: 'Show Over All Apps/Spaces'
  },
  ja: {
    irukadark: 'IrukaDark',
    edit: '編集',
    view: '表示',
    window: 'ウィンドウ',
    appearance: '外観',
    themeLight: 'ライト',
    themeDark: 'ダーク',
    windowOpacity: 'ウィンドウの不透明度',
    opacity100: '100%（不透明）',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: '背景の透過',
    transparencyHigh: '強（よく透ける）',
    transparencyMedium: '標準',
    transparencyLow: '弱（ほぼ不透過）',
    about: 'IrukaDarkについて',
    hide: 'IrukaDarkを隠す',
    unhide: 'すべて表示',
    quit: 'IrukaDarkを終了',
    undo: '元に戻す',
    redo: 'やり直す',
    cut: '切り取り',
    copy: 'コピー',
    paste: '貼り付け',
    pasteAndMatchStyle: 'スタイルを合わせて貼り付け',
    delete: '削除',
    selectAll: 'すべてを選択',
    
    
    language: '言語',
    languageEnglish: 'English',
    languageJapanese: '日本語',
    showLogoPopup: 'ロゴ別窓を表示',
    pinAllSpaces: '全アプリ・全スペースで表示'
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 260,
    height: 280,
    minWidth: 260,
    // Allow shrinking the window vertically up to the chat input area
    minHeight: 140,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
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
      devTools: false
    }
  });

  try {
    // Respect env setting (default: enabled)
    const pinAll = !['0','false','off'].includes(String(process.env.PIN_ALL_SPACES || '1').toLowerCase());
    mainWindow.setAlwaysOnTop(true, pinAll ? 'screen-saver' : 'floating');
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(!!pinAll, { visibleOnFullScreen: !!pinAll });
    }
  } catch {}

  const savedOpacity = parseFloat(process.env.WINDOW_OPACITY || '1');
  if (!Number.isNaN(savedOpacity)) {
    try { mainWindow.setOpacity(savedOpacity); } catch {}
  }

  // Place main window at bottom-right of the primary display
  try {
    const d = screen.getPrimaryDisplay();
    const wa = d && d.workArea ? d.workArea : { x: 0, y: 0, width: 0, height: 0 };
    const [w, h] = mainWindow.getSize();
    const rightOverhang = 40;
    const bottomMargin = 0;
    const posX = Math.round(wa.x + wa.width - w + rightOverhang);
    const posY = Math.round(wa.y + wa.height - h - bottomMargin);
    mainWindow.setPosition(posX, posY);
  } catch {}

  mainWindow.loadFile('src/renderer/index.html');
  try { mainWindow.once('ready-to-show', () => mainWindow.show()); } catch {}
  mainWindow.webContents.once('did-finish-load', () => {
    createPopupWindow();
  });

  const iconPath = path.resolve(__dirname, 'renderer/assets/icons/icon.png');
  mainWindow.setIcon(iconPath);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function triggerMacCopyShortcut() {
  try {
    exec("osascript -e 'tell application \"System Events\" to keystroke \"c\" using {command down}'", (error) => {
      if (error && isDev) console.warn('osascript error:', error.message);
    });
  } catch (e) {
    if (isDev) console.warn('Failed to invoke osascript:', e?.message);
  }
}

// Bring our main window to foreground (best-effort) without changing UI layout
function bringAppToFront() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  } catch {}
}

// Trim-safe clipboard text read
function readClipboardTextTrimmed() {
  try { return (clipboard.readText() || '').trim(); } catch { return ''; }
}

// Adaptive poll for clipboard change; returns new non-empty text or ''
async function pollClipboardChange(beforeText, maxWaitMs) {
  const start = Date.now();
  let last = beforeText;
  let attempts = 0;
  while (Date.now() - start < maxWaitMs) {
    const now = readClipboardTextTrimmed();
    attempts++;
    if (now && now !== beforeText) {
      if (isDev) console.log(`Clipboard changed after ${attempts} attempts:`, `"${now.substring(0, 50)}..."`);
      try { clipboardTextSnapshot = now; clipboardChangedAt = Date.now(); } catch {}
      return now;
    }
    last = now;
    const elapsed = Date.now() - start;
    const interval = elapsed < 240 ? 18 : (elapsed < 900 ? 45 : 90);
    await delay(interval);
  }
  return last && last.trim() ? last.trim() : '';
}

// Windows: send Ctrl+C to frontmost app (best-effort, no external deps)
function windowsSendCtrlC() {
  try {
    // Prefer COM WScript.Shell for SendKeys; fall back to WinForms
    const cmd = `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "try { $ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('^c'); exit 0 } catch { try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c'); exit 0 } catch { exit 1 } }"`;
    exec(cmd, () => {});
  } catch {}
}

// Linux: try to read PRIMARY selection (X11/Wayland). Returns text or ''
async function linuxReadPrimarySelection() {
  const run = (cmd) => new Promise((resolve) => exec(cmd, (err, stdout) => resolve(err ? '' : String(stdout || ''))));
  try {
    // Wayland wl-clipboard
    let out = await run("sh -lc 'command -v wl-paste >/dev/null 2>&1 && wl-paste --no-newline --primary 2>/dev/null'");
    if (out && out.trim()) return out.trim();
    // xclip (X11)
    out = await run("sh -lc 'command -v xclip >/dev/null 2>&1 && xclip -selection primary -o 2>/dev/null'");
    if (out && out.trim()) return out.trim();
    // xsel (X11)
    out = await run("sh -lc 'command -v xsel >/dev/null 2>&1 && xsel -o -p 2>/dev/null'");
    if (out && out.trim()) return out.trim();
  } catch {}
  return '';
}

async function tryCopySelectedText() {
  const before = readClipboardTextTrimmed();
  if (isDev) console.log('Clipboard before copy:', before ? `"${before.substring(0, 50)}..."` : 'empty');

  const platform = process.platform;
  const envMaxWait = Number.parseInt(process.env.CLIPBOARD_MAX_WAIT_MS || '', 10);
  const defaultMaxWait = 1200; // unified default across OS
  const macMaxWait = Number.isFinite(envMaxWait) && envMaxWait > 0 ? envMaxWait : defaultMaxWait;
  const winMaxWait = Number.isFinite(envMaxWait) && envMaxWait > 0 ? envMaxWait : defaultMaxWait;
  const linMaxWait = Number.isFinite(envMaxWait) && envMaxWait > 0 ? envMaxWait : defaultMaxWait;

  if (platform === 'darwin') {
    let axTrusted = false;
    try { axTrusted = systemPreferences.isTrustedAccessibilityClient(false); } catch {}
    if (axTrusted) {
      triggerMacCopyShortcut();
    } else {
      try { systemPreferences.isTrustedAccessibilityClient(true); } catch {}
      if (isDev) console.log('Accessibility not trusted: requested OS permission prompt');
    }
    // Phase 1: fast poll for a short window before bringing our app frontmost
    const fastStart = Date.now();
    while (Date.now() - fastStart < Math.min(220, macMaxWait)) {
      const now = readClipboardTextTrimmed();
      if (now && now !== before) {
        try { clipboardTextSnapshot = now; clipboardChangedAt = Date.now(); } catch {}
        return now;
      }
      await delay(18);
    }
    // Phase 2: bring front (to surface paste permission dialog) and continue polling for the remainder
    bringAppToFront();
    const remaining = Math.max(0, macMaxWait - (Date.now() - fastStart));
    const polled = await pollClipboardChange(before, remaining);
    if (polled) return polled;
    if (isDev) console.log('No text found in clipboard (macOS)');
    return '';
  }

  if (platform === 'win32') {
    // Best effort: ask the foreground app to copy
    windowsSendCtrlC();
    const polled = await pollClipboardChange(before, winMaxWait);
    if (polled) return polled;
    // No change detected: treat as failure (do not reuse stale clipboard)
    return '';
  }

  // linux
  const polled = await pollClipboardChange(before, linMaxWait);
  if (polled) return polled;
  // Try PRIMARY selection (no copy required)
  const primary = await linuxReadPrimarySelection();
  if (primary) return primary;
  // No change and no PRIMARY selection: treat as failure
  return '';
}

// Cross-platform interactive area screenshot
async function captureInteractiveArea() {
  const platform = process.platform;
  if (platform === 'darwin') {
    try {
      const tmpDir = app.getPath('temp');
      const file = path.join(tmpDir, `irukadark_capture_${Date.now()}.png`);
      const cmd = `screencapture -i -x "${file}"`;
      const code = await new Promise((resolve) => exec(cmd, (error) => resolve(error ? 1 : 0)));
      if (code !== 0) { try { fs.existsSync(file) && fs.unlinkSync(file); } catch {}; return { data: '', mimeType: '' }; }
      try { const buf = fs.readFileSync(file); try { fs.unlinkSync(file); } catch {}; return { data: buf.toString('base64'), mimeType: 'image/png' }; } catch { return { data: '', mimeType: '' }; }
    } catch { return { data: '', mimeType: '' }; }
  }

  if (platform === 'win32') {
    try {
      // Launch snipping UI (Windows 10/11)
      await new Promise((resolve) => exec('explorer.exe ms-screenclip:', () => resolve()));
      // Poll clipboard for image
      const start = Date.now();
      const maxWait = 15000;
      let beforeBuf = Buffer.alloc(0);
      try {
        const beforeImg = clipboard.readImage();
        beforeBuf = beforeImg && !beforeImg.isEmpty() ? beforeImg.toPNG() : Buffer.alloc(0);
      } catch {}
      while (Date.now() - start < maxWait) {
        await delay(120);
        try {
          const img = clipboard.readImage();
          if (img && !img.isEmpty()) {
            const buf = img.toPNG();
            if (buf && buf.length && buf.length !== beforeBuf.length) {
              return { data: Buffer.from(buf).toString('base64'), mimeType: 'image/png' };
            }
          }
        } catch {}
      }
      return { data: '', mimeType: '' };
    } catch {
      return { data: '', mimeType: '' };
    }
  }

  if (platform === 'linux') {
    const tmpDir = app.getPath('temp');
    const file = path.join(tmpDir, `irukadark_capture_${Date.now()}.png`);
    const run = (cmd) => new Promise((resolve) => exec(cmd, (err) => resolve(err ? 1 : 0)));
    try {
      // GNOME
      let code = await run(`sh -lc 'command -v gnome-screenshot >/dev/null 2>&1 && gnome-screenshot -a -f "${file}"'`);
      if (code === 0 && fs.existsSync(file) && fs.statSync(file).size > 0) {
        const buf = fs.readFileSync(file); try { fs.unlinkSync(file); } catch {}; return { data: buf.toString('base64'), mimeType: 'image/png' };
      }
      // KDE Spectacle
      code = await run(`sh -lc 'command -v spectacle >/dev/null 2>&1 && spectacle -r -o "${file}"'`);
      if (code === 0 && fs.existsSync(file) && fs.statSync(file).size > 0) {
        const buf = fs.readFileSync(file); try { fs.unlinkSync(file); } catch {}; return { data: buf.toString('base64'), mimeType: 'image/png' };
      }
      // Wayland (grim + slurp)
      code = await run(`sh -lc 'command -v grim >/dev/null 2>&1 && command -v slurp >/dev/null 2>&1 && grim -g "$(slurp)" "${file}"'`);
      if (code === 0 && fs.existsSync(file) && fs.statSync(file).size > 0) {
        const buf = fs.readFileSync(file); try { fs.unlinkSync(file); } catch {}; return { data: buf.toString('base64'), mimeType: 'image/png' };
      }
      // X11 (maim)
      code = await run(`sh -lc 'command -v maim >/dev/null 2>&1 && maim -s "${file}"'`);
      if (code === 0 && fs.existsSync(file) && fs.statSync(file).size > 0) {
        const buf = fs.readFileSync(file); try { fs.unlinkSync(file); } catch {}; return { data: buf.toString('base64'), mimeType: 'image/png' };
      }
    } catch {}
    try { fs.existsSync(file) && fs.unlinkSync(file); } catch {}
    return { data: '', mimeType: '' };
  }

  return { data: '', mimeType: '' };
}

app.whenReady().then(async () => {
  // Start monitoring clipboard changes to determine freshness
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
    }
  } catch {}
  try {
    if (process.platform === 'darwin' && typeof app.setAboutPanelOptions === 'function') {
      app.setAboutPanelOptions({
        applicationName: 'IrukaDark',
        applicationVersion: app.getVersion(),
        iconPath: path.resolve(__dirname, 'renderer/assets/icons/icon.png')
      });
    }
  } catch {}
  createAppMenu();
  
  createWindow();

  // Preflight permissions on first launch (macOS): Accessibility + Screen Recording
  try {
    setTimeout(() => {
      preflightPermissionsOnce();
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
                // If clipboard text is older than threshold, show short system message only
                if (isClipboardTextStale(text, 3000)) {
                  mainWindow.webContents.send('explain-clipboard-error', '');
                } else {
                  mainWindow.webContents.send(detailed ? 'explain-clipboard-detailed' : 'explain-clipboard', text);
                }
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

    const baseCandidates = ['Alt+A', 'CommandOrControl+Alt+A'];
    let baseUsed = '';
    for (const c of baseCandidates) {
      if (registerShortcut(c, false)) { baseUsed = c; break; }
    }

    const detailedCandidates = ['Alt+Shift+A', 'CommandOrControl+Alt+Shift+A'];
    let detailedUsed = '';
    for (const c of detailedCandidates) {
      if (registerShortcut(c, true)) { detailedUsed = c; break; }
    }

    // Screenshot explain (all OS): Option+S (fallback Cmd/Ctrl+Option/Alt+S)
    const screenshotCandidates = ['Alt+S', 'CommandOrControl+Alt+S'];
    let screenshotUsed = '';
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
        if (ok) { screenshotUsed = c; break; }
      } catch {}
    }

    // Screenshot explain (detailed, all OS): Option+Shift+S (fallback Cmd/Ctrl+Alt+Shift+S)
    const screenshotDetailedCandidates = ['Alt+Shift+S', 'CommandOrControl+Alt+Shift+S'];
    let screenshotDetailedUsed = '';
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
        if (ok) { screenshotDetailedUsed = c; break; }
      } catch {}
    }

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shortcut-registered', baseUsed);
        mainWindow.webContents.send('shortcut-detailed-registered', detailedUsed);
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
  try { globalShortcut.unregisterAll(); } catch {}
});

// --- Permissions preflight (macOS) ---
function getPrefsPath() {
  try { return path.join(app.getPath('userData'), 'irukadark.prefs.json'); } catch { return ''; }
}

function loadPrefs() {
  const prefsPath = getPrefsPath();
  try {
    if (prefsPath && fs.existsSync(prefsPath)) {
      const raw = fs.readFileSync(prefsPath, 'utf8');
      return (JSON.parse(raw || '{}') || {});
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

function preflightPermissionsOnce() {
  if (process.platform !== 'darwin') return;
  const prefs = loadPrefs();
  if (prefs && prefs.PERMISSIONS_PREFLIGHT_DONE) return;
  try { preflightAccessibility(); } catch {}
  try { preflightScreenRecording(); } catch {}
  // Pasteboard permission (Ventura+) is prompted on access; ensure frontmost then read once
  try {
    bringAppToFront();
    try { clipboard.readText(); } catch {}
  } catch {}
  try {
    const p = loadPrefs();
    p.PERMISSIONS_PREFLIGHT_DONE = true;
    savePrefs(p);
  } catch {}
}

function preflightAccessibility() {
  try {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      // Request OS prompt; user may allow in System Settings
      try { systemPreferences.isTrustedAccessibilityClient(true); } catch {}
    }
  } catch {}
}

function preflightScreenRecording() {
  try {
    // Attempt a minimal offscreen capture to trigger permission prompt without saving user content
    const tmpDir = app.getPath('temp');
    const file = path.join(tmpDir, `irukadark_perm_${Date.now()}.png`);
    // Capture a 1x1 rectangle from (0,0) quietly; if permission is missing, OS will prompt
    const cmd = `screencapture -x -R 0,0,1,1 "${file}"`;
    exec(cmd, () => {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    });
  } catch {}
}



// 言語設定の保存
function upsertEnvVar(envPath, key, value) {
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = envContent.split('\n').filter(Boolean);
  const idx = lines.findIndex(line => line.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`; else lines.push(`${key}=${value}`);
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
}

function saveLanguageSetting(language) {
  const envPath = path.join(__dirname, '../.env.local');
  upsertEnvVar(envPath, 'MENU_LANGUAGE', language);
  // ユーザーデータにも保存
  try {
    const userData = app.getPath('userData');
    const prefsPath = path.join(userData, 'irukadark.prefs.json');
    let prefs = {};
    try {
      if (fs.existsSync(prefsPath)) prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8') || '{}') || {};
    } catch {}
    prefs.MENU_LANGUAGE = language;
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
  } catch {}
  if (isDev) console.log(`Language setting saved: ${language}`);
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
  const envPath = path.join(__dirname, '../.env.local');
  upsertEnvVar(envPath, 'UI_THEME', theme);
  if (isDev) console.log(`Theme setting saved: ${theme}`);
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

// 全アプリ・全スペース表示の保存/適用
function savePinAllSpacesSetting(enabled) {
  const envPath = path.join(__dirname, '../.env.local');
  upsertEnvVar(envPath, 'PIN_ALL_SPACES', enabled ? '1' : '0');
  if (isDev) console.log(`Pin all spaces saved: ${enabled}`);
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
  const envPath = path.join(__dirname, '../.env.local');
  upsertEnvVar(envPath, 'ENABLE_GOOGLE_SEARCH', enabled ? '1' : '0');
  if (isDev) console.log(`Web search setting saved: ${enabled}`);
}

// アプリメニュー（Edit ロールを含む）- 多言語対応
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  const currentLang = getCurrentLanguage();
  const t = menuTranslations[currentLang] || menuTranslations.en;
  const windowOpacity = parseFloat(process.env.WINDOW_OPACITY || '1');
  const pinAllSpaces = !['0','false','off'].includes(String(process.env.PIN_ALL_SPACES || '1').toLowerCase());

  const editMenu = {
    label: t.edit,
    submenu: [
      { role: 'undo', label: t.undo },
      { role: 'redo', label: t.redo },
      { type: 'separator' },
      { role: 'cut', label: t.cut },
      { role: 'copy', label: t.copy },
      { role: 'paste', label: t.paste },
      { role: 'pasteAndMatchStyle', label: t.pasteAndMatchStyle },
      { role: 'delete', label: t.delete },
      { role: 'selectAll', label: t.selectAll }
    ]
  };

  const viewMenu = {
    label: t.view,
    submenu: [
      
      {
        label: t.appearance,
        submenu: [
          {
            label: t.themeLight,
            type: 'radio',
            checked: (process.env.UI_THEME || 'dark') === 'light',
            click: () => handleThemeChange('light')
          },
          {
            label: t.themeDark,
            type: 'radio',
            checked: (process.env.UI_THEME || 'dark') === 'dark',
            click: () => handleThemeChange('dark')
          },
          { type: 'separator' },
          {
            label: t.windowOpacity,
            submenu: [
              { label: t.opacity100, type: 'radio', checked: (windowOpacity || 1) >= 0.999, click: () => handleWindowOpacityChange(1) },
              { label: t.opacity95,  type: 'radio', checked: Math.abs(windowOpacity - 0.95) < 0.005, click: () => handleWindowOpacityChange(0.95) },
              { label: t.opacity90,  type: 'radio', checked: Math.abs(windowOpacity - 0.90) < 0.005, click: () => handleWindowOpacityChange(0.90) },
              { label: t.opacity85,  type: 'radio', checked: Math.abs(windowOpacity - 0.85) < 0.005, click: () => handleWindowOpacityChange(0.85) },
              { label: t.opacity80,  type: 'radio', checked: Math.abs(windowOpacity - 0.80) < 0.005, click: () => handleWindowOpacityChange(0.80) }
            ]
          },
          { type: 'separator' },
          {
            label: t.pinAllSpaces,
            type: 'checkbox',
            checked: !!pinAllSpaces,
            click: (menuItem) => handlePinAllSpacesChange(!!menuItem.checked)
          },
          
          
        ]
      },
      { type: 'separator' },
      {
        label: t.showLogoPopup,
        type: 'checkbox',
        checked: !!(popupWindow && !popupWindow.isDestroyed()),
        click: () => {
          try {
            if (popupWindow && !popupWindow.isDestroyed()) {
              popupWindow.close();
            } else {
              createPopupWindow();
              
            }
          } catch {}
          // Rebuild menu to reflect new state
          createAppMenu();
        }
      },
      {
        label: t.language,
        submenu: [
          {
            label: t.languageEnglish,
            type: 'radio',
            checked: currentLang === 'en',
            click: () => handleLanguageChange('en')
          },
          {
            label: t.languageJapanese,
            type: 'radio',
            checked: currentLang === 'ja',
            click: () => handleLanguageChange('ja')
          }
        ]
      }
    ]
  };

  const windowMenu = { role: 'windowMenu', label: t.window };

  const template = [];

  if (isMac) {
    template.push({
      label: t.irukadark,
      submenu: [
        { role: 'about', label: t.about },
        { type: 'separator' },
        { role: 'hide', label: t.hide },
        { role: 'unhide', label: t.unhide },
        { type: 'separator' },
        { role: 'quit', label: t.quit }
      ]
    });
  }

  template.push(editMenu, viewMenu, windowMenu);

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}


// ウィンドウ不透明度の保存/反映（ウィンドウレイヤー）
function handleWindowOpacityChange(opacity) {
  try {
    const envPath = path.join(__dirname, '../.env.local');
    upsertEnvVar(envPath, 'WINDOW_OPACITY', String(opacity));
    process.env.WINDOW_OPACITY = String(opacity);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(opacity);
      try { mainWindow.webContents.send('window-opacity-changed', opacity); } catch {}
    }
    if (typeof popupWindow !== 'undefined' && popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.setOpacity(opacity);
      try { popupWindow.webContents.send('window-opacity-changed', opacity); } catch {}
    }
    createAppMenu();
  } catch (e) {
    if (isDev) console.warn('Failed to change window opacity:', e?.message);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
      try { if (currentAICancelFlag) currentAICancelFlag.user = true; } catch {}
      try { currentAIController.abort(); } catch {}
      return true;
    }
  } catch {}
  return false;
});

ipcMain.handle('get-model', () => {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  return model;
});

ipcMain.handle('get-ui-theme', () => {
  return process.env.UI_THEME || 'dark';
});

ipcMain.handle('open-external', (_e, url) => {
  try {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url);
      return true;
    }
  } catch {}
  return false;
});

// Show the application menu as a context menu at cursor position
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
  return process.env.MENU_LANGUAGE || 'en';
});

// Web検索設定の保存
ipcMain.handle('save-web-search-setting', (_e, enabled) => {
  saveWebSearchSetting(enabled);
  process.env.ENABLE_GOOGLE_SEARCH = enabled ? '1' : '0';
  return true;
});

// 背景透過レベル
ipcMain.handle('get-glass-level', () => {
  return process.env.GLASS_LEVEL || 'medium';
});

// Web検索設定の取得
ipcMain.handle('get-web-search-enabled', () => {
  // デフォルトはOFF ('0')
  return process.env.ENABLE_GOOGLE_SEARCH !== '0';
});

// ウィンドウ不透明度
ipcMain.handle('get-window-opacity', () => {
  const v = parseFloat(process.env.WINDOW_OPACITY || '1');
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
    const requestedModel = String(payload?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
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
        topP: Math.min(0.90, Number(generationConfig.topP || 0.95)),
      };
    }
    // Prefer search only when explicitly enabled by the renderer
    const useGoogleSearch = payload?.useWebSearch === true; // Use frontend's preference

    // Try requested model first, then a search-capable model
    const searchPreferred = process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash';
    // Remove duplicates
    const modelsToTry = requestedModel === searchPreferred ? [requestedModel] : [requestedModel, searchPreferred];

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
                const r1 = await sdkGenerateText(client, modelName, prompt, generationConfig, { useGoogleSearch });
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
            const r3 = await restGenerateText(key, bare, prompt, generationConfig, { useGoogleSearch, signal: controller.signal });
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
                const r2 = await sdkGenerateText(client, modelName, prompt, generationConfig, { useGoogleSearch: false });
                if (r2) {
                  clearTimeout(timeoutId);
                  return r2;
                }
              } catch {}
            }
            try {
              const r4 = await restGenerateText(key, bare, prompt, generationConfig, { useGoogleSearch: false, signal: controller.signal });
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
        try { if (currentAIController === controller) { currentAIController = null; currentAIKind = null; currentAICancelFlag = null; } } catch {}
      }
    };

    for (const key of keys) {
      try { const out = await tryOne(key); if (out) return out; } catch (e) { if (String(e?.message) === 'API_KEY_INVALID') { continue; } else { return `API error occurred: ${e?.message || 'Unknown error'}`; } }
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
    const requestedModel = String(payload?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');
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
        topP: Math.min(0.90, Number(generationConfig.topP || 0.95)),
      };
    }
    // Search only when explicitly enabled by the renderer
    const useGoogleSearch = payload?.useWebSearch === true; // Use frontend's preference
    const searchPreferred = process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash';
    // Remove duplicates
    const modelsToTry = requestedModel === searchPreferred ? [requestedModel] : [requestedModel, searchPreferred];

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
                const r1 = await sdkGenerateImage(client, modelName, prompt, imageBase64, mimeType, generationConfig, { useGoogleSearch });
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
            const r3 = await restGenerateImage(key, bare, prompt, imageBase64, mimeType, generationConfig, { useGoogleSearch, signal: controller.signal });
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
                const r2 = await sdkGenerateImage(client, modelName, prompt, imageBase64, mimeType, generationConfig, { useGoogleSearch: false });
                if (r2) {
                  clearTimeout(timeoutId);
                  return r2;
                }
              } catch {}
            }
            try {
              const r4 = await restGenerateImage(key, bare, prompt, imageBase64, mimeType, generationConfig, { useGoogleSearch: false, signal: controller.signal });
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
        try { if (currentAIController === controller) { currentAIController = null; currentAIKind = null; currentAICancelFlag = null; } } catch {}
      }
    };

    for (const key of keys) {
      try { const out = await tryOne(key); if (out) return out; } catch (e) { if (String(e?.message) === 'API_KEY_INVALID') { continue; } else { return `API error occurred: ${e?.message || 'Unknown error'}`; } }
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

  const popupX = mainBounds.x; // メインウィンドウと同じ水平位置
  const popupY = mainBounds.y + mainBounds.height - 10; // メインウィンドウの下側（-10pxで重なる）

  const popupWidth = 84;
  const popupHeight = 84;
  const mainX = popupX + Math.round((popupWidth - mainBounds.width) / 2);
  const mainY = popupY - mainBounds.height - 10;

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: popupX,
    y: popupY,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: false
    }
  });

  try {
    const pinAll = !['0','false','off'].includes(String(process.env.PIN_ALL_SPACES || '1').toLowerCase());
    popupWindow.setAlwaysOnTop(true, pinAll ? 'screen-saver' : 'floating');
    if (process.platform === 'darwin') {
      popupWindow.setVisibleOnAllWorkspaces(!!pinAll, { visibleOnFullScreen: !!pinAll });
    }
  } catch {}

  popupWindow.loadFile(path.join(__dirname, 'renderer/popup.html'));
  const savedOpacity = parseFloat(process.env.WINDOW_OPACITY || '1');
  if (!Number.isNaN(savedOpacity)) {
    try { popupWindow.setOpacity(savedOpacity); } catch {}
  }

  mainWindow.setPosition(Math.round(mainX), Math.round(mainY));
  

  popupWindow.on('closed', () => {
    popupWindow = null;
  });

  const positionMainAbovePopup = () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed() || !popupWindow || popupWindow.isDestroyed()) return;

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
      if (!mainInitiallyShown) {
        mainWindow.show();
        mainInitiallyShown = true;
      }
    } catch {}
  };
  popupWindow.on('move', positionMainAbovePopup);
  popupWindow.on('move', () => { if (popupPointerDown) popupMovedSinceDown = true; });
  popupWindow.on('resize', positionMainAbovePopup);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.on('resize', positionMainAbovePopup);
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
      try { popupDownBounds = popupWindow.getBounds(); } catch { popupDownBounds = null; }
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
