/*!
 * IrukaDark — (c) 2025 CORe Inc (コーレ株式会社).
 * License: MIT. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { app, BrowserWindow, ipcMain, screen, systemPreferences, Menu, globalShortcut, clipboard, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');

const fs = require('fs');
let envLoaded = false;
try {
  const portableFlag = String(process.env.PORTABLE_MODE || process.env.ALLOW_ENV_LOCAL || '').trim().toLowerCase();
  const allowEnvLocal = portableFlag && portableFlag !== '0' && portableFlag !== 'false' && portableFlag !== 'off';
  if (allowEnvLocal) {
    const dotenv = require('dotenv');
    const envPaths = [
      path.join(__dirname, '../.env.local'),
      path.join(process.cwd(), '.env.local'),
      path.join(__dirname, '../../.env.local')
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        envLoaded = true;
        break;
      }
    }
  }
} catch {}

const isDev = process.env.NODE_ENV === 'development';
// Timings for temporary hide/show during shortcut copy
const HIDE_DELAY_MS_MAC = 140;
const HIDE_DELAY_MS_WIN = 100;
const HIDE_DELAY_MS_LIN = 80;
// Initial layout
const INITIAL_SHOW_MAIN = ['1','true','on'].includes(String(process.env.SHOW_MAIN_ON_START || '1').toLowerCase());
const INITIAL_POPUP_MARGIN_RIGHT = Number.isFinite(parseInt(process.env.POPUP_MARGIN_RIGHT || '', 10)) ? parseInt(process.env.POPUP_MARGIN_RIGHT, 10) : 0;

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
  const order = [
    'GEMINI_API_KEY',
    'GOOGLE_GENAI_API_KEY',
    'GENAI_API_KEY',
    'GOOGLE_API_KEY',
    'NEXT_PUBLIC_GEMINI_API_KEY',
    'NEXT_PUBLIC_GOOGLE_API_KEY'
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: String(prompt || '') }] }],
    generationConfig: generationConfig || undefined,
    // Enable Google Search grounding when requested (API supports tools)
    tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(apiKey || '').trim() },
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelBare}:generateContent`;
  const body = {
    contents: [{
      parts: [ { text: String(prompt || '') }, { inlineData: { data: String(imageBase64 || ''), mimeType: String(mimeType || 'image/png') } } ]
    }],
    generationConfig: generationConfig || undefined,
    tools: useGoogleSearch ? [{ googleSearch: {} }] : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(apiKey || '').trim() },
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

 
async function openInputDialog({ title = 'Input', label = '', placeholder = '', value = '', password = false, lang = 'en' } = {}) {
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
          preload: path.join(__dirname, 'prompt_preload.js')
        }
      });
      try { win.setMenuBarVisibility(false); } catch {}

      const htmlPath = path.join(__dirname, 'prompt.html');
      win.loadFile(htmlPath).then(() => {
        try { win.show(); } catch {}
        try {
          const theme = String(process.env.UI_THEME || 'dark');
          win.webContents.send('prompt:init', { title, label, placeholder, value, password, lang, theme });
        } catch {}
      }).catch(() => resolve(null));

      const cleanup = () => {
        try { win.close(); } catch {}
      };

      const submitHandler = (_e, payload) => {
        try { ipcMain.removeListener('prompt:submit', submitHandler); } catch {}
        try { ipcMain.removeListener('prompt:cancel', cancelHandler); } catch {}
        cleanup();
        resolve(typeof payload?.value === 'string' ? payload.value : '');
      };
      const cancelHandler = () => {
        try { ipcMain.removeListener('prompt:submit', submitHandler); } catch {}
        try { ipcMain.removeListener('prompt:cancel', cancelHandler); } catch {}
        cleanup();
        resolve(null);
      };

      ipcMain.once('prompt:submit', submitHandler);
      ipcMain.once('prompt:cancel', cancelHandler);

      win.on('closed', () => {
        try { ipcMain.removeListener('prompt:submit', submitHandler); } catch {}
        try { ipcMain.removeListener('prompt:cancel', cancelHandler); } catch {}
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

const menuTranslations = {
  en: {
    irukadark: 'IrukaDark',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    close: 'Close',
    bringAllToFront: 'Bring All to Front',
    aiSettings: 'AI Settings',
    setGeminiApiKey: 'Set Gemini API Key…',
    setGeminiModel: 'Set Gemini Model…',
    setWebSearchModel: 'Set Web Search Model…',
    tone: 'Tone',
    toneFormal: 'Formal',
    toneCasual: 'Casual',
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
    pinAllSpaces: 'Show Over All Apps/Spaces',
    help: 'Help',
    checkForUpdates: 'Check for Updates…',
    openDownloadsPage: 'Open Downloads Page'
  },
  ja: {
    irukadark: 'IrukaDark',
    edit: '編集',
    view: '表示',
    window: 'ウィンドウ',
    minimize: '最小化',
    zoom: '拡大/縮小',
    close: '閉じる',
    bringAllToFront: 'すべてを手前に移動',
    aiSettings: 'AI設定',
    setGeminiApiKey: 'Gemini APIキーを設定…',
    setGeminiModel: 'Geminiモデルを設定…',
    setWebSearchModel: 'Web検索モデルを設定…',
    tone: 'トーン',
    toneFormal: 'フォーマル',
    toneCasual: 'カジュアル',
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
    pinAllSpaces: '全アプリ・全スペースで表示',
    help: 'ヘルプ',
    checkForUpdates: 'アップデートを確認…',
    openDownloadsPage: 'ダウンロードページを開く'
  }
  ,
  es: {
    irukadark: 'IrukaDark',
    edit: 'Editar',
    view: 'Ver',
    window: 'Ventana',
    minimize: 'Minimizar',
    zoom: 'Zoom',
    close: 'Cerrar',
    bringAllToFront: 'Traer todo al frente',
    appearance: 'Apariencia',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    windowOpacity: 'Opacidad de la ventana',
    opacity100: '100% (Sólido)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Transparencia de fondo',
    transparencyHigh: 'Más transparente',
    transparencyMedium: 'Estándar',
    transparencyLow: 'Menos transparente',
    about: 'Acerca de',
    hide: 'Ocultar',
    unhide: 'Mostrar todo',
    quit: 'Salir',
    undo: 'Deshacer',
    redo: 'Rehacer',
    cut: 'Cortar',
    copy: 'Copiar',
    paste: 'Pegar',
    pasteAndMatchStyle: 'Pegar y coincidir estilo',
    delete: 'Eliminar',
    selectAll: 'Seleccionar todo',
    language: 'Idioma',
    showLogoPopup: 'Mostrar ventana del logo',
    pinAllSpaces: 'Mostrar en todas las apps/espacios',
    aiSettings: 'Configuración de IA',
    setGeminiApiKey: 'Configurar clave de API de Gemini…',
    setGeminiModel: 'Configurar modelo de Gemini…',
    setWebSearchModel: 'Configurar modelo de Búsqueda web…',
    tone: 'Tono',
    toneFormal: 'Formal',
    toneCasual: 'Informal',
    help: 'Ayuda',
    checkForUpdates: 'Buscar actualizaciones…',
    openDownloadsPage: 'Abrir página de descargas'
  },
  'es-419': {
    irukadark: 'IrukaDark',
    edit: 'Editar',
    view: 'Ver',
    window: 'Ventana',
    minimize: 'Minimizar',
    zoom: 'Zoom',
    close: 'Cerrar',
    bringAllToFront: 'Traer todo al frente',
    appearance: 'Apariencia',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    windowOpacity: 'Opacidad de la ventana',
    opacity100: '100% (Sólido)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Transparencia de fondo',
    transparencyHigh: 'Más transparente',
    transparencyMedium: 'Estándar',
    transparencyLow: 'Menos transparente',
    about: 'Acerca de',
    hide: 'Ocultar',
    unhide: 'Mostrar todo',
    quit: 'Salir',
    undo: 'Deshacer',
    redo: 'Rehacer',
    cut: 'Cortar',
    copy: 'Copiar',
    paste: 'Pegar',
    pasteAndMatchStyle: 'Pegar y coincidir estilo',
    delete: 'Eliminar',
    selectAll: 'Seleccionar todo',
    language: 'Idioma',
    showLogoPopup: 'Mostrar ventana del logo',
    pinAllSpaces: 'Mostrar en todas las apps/espacios',
    aiSettings: 'Configuración de IA',
    setGeminiApiKey: 'Configurar clave de API de Gemini…',
    setGeminiModel: 'Configurar modelo de Gemini…',
    setWebSearchModel: 'Configurar modelo de búsqueda web…',
    tone: 'Tono',
    toneFormal: 'Formal',
    toneCasual: 'Informal',
    help: 'Ayuda',
    checkForUpdates: 'Buscar actualizaciones…',
    openDownloadsPage: 'Abrir página de descargas'
  },
  'zh-Hans': {
    irukadark: 'IrukaDark',
    edit: '编辑',
    view: '查看',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    close: '关闭',
    bringAllToFront: '全部置于最前面',
    appearance: '外观',
    themeLight: '明亮',
    themeDark: '深色',
    windowOpacity: '窗口不透明度',
    opacity100: '100%（不透明）',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: '背景透明度',
    transparencyHigh: '更透明',
    transparencyMedium: '标准',
    transparencyLow: '较不透明',
    about: '关于',
    hide: '隐藏',
    unhide: '全部显示',
    quit: '退出',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    pasteAndMatchStyle: '粘贴并匹配样式',
    delete: '删除',
    selectAll: '全选',
    language: '语言',
    showLogoPopup: '显示徽标窗口',
    pinAllSpaces: '置顶显示（所有应用/空间）',
    aiSettings: 'AI 设置',
    setGeminiApiKey: '设置 Gemini API 密钥…',
    setGeminiModel: '设置 Gemini 模型…',
    setWebSearchModel: '设置网页搜索模型…',
    tone: '语气',
    toneFormal: '正式',
    toneCasual: '口语',
    help: '帮助',
    checkForUpdates: '检查更新…',
    openDownloadsPage: '打开下载页面'
  },
  'zh-Hant': {
    irukadark: 'IrukaDark',
    edit: '編輯',
    view: '檢視',
    window: '視窗',
    minimize: '最小化',
    zoom: '縮放',
    close: '關閉',
    bringAllToFront: '全部移到最前',
    appearance: '外觀',
    themeLight: '淺色',
    themeDark: '深色',
    windowOpacity: '視窗不透明度',
    opacity100: '100%（不透明）',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: '背景透明度',
    transparencyHigh: '更透明',
    transparencyMedium: '標準',
    transparencyLow: '較不透明',
    about: '關於',
    hide: '隱藏',
    unhide: '全部顯示',
    quit: '結束',
    undo: '復原',
    redo: '重做',
    cut: '剪下',
    copy: '複製',
    paste: '貼上',
    pasteAndMatchStyle: '以相同樣式貼上',
    delete: '刪除',
    selectAll: '全選',
    language: '語言',
    showLogoPopup: '顯示標誌視窗',
    pinAllSpaces: '顯示於所有 App/空間之上',
    aiSettings: 'AI 設定',
    setGeminiApiKey: '設定 Gemini API 金鑰…',
    setGeminiModel: '設定 Gemini 模型…',
    setWebSearchModel: '設定網頁搜尋模型…',
    tone: '語氣',
    toneFormal: '正式',
    toneCasual: '口語',
    help: '說明',
    checkForUpdates: '檢查更新…',
    openDownloadsPage: '開啟下載頁面'
  },
  hi: {
    irukadark: 'IrukaDark',
    edit: 'संपादन',
    view: 'दृश्य',
    window: 'विंडो',
    minimize: 'मिनिमाइज़',
    zoom: 'ज़ूम',
    close: 'बंद करें',
    bringAllToFront: 'सभी को आगे लाएँ',
    appearance: 'स्वरूप',
    themeLight: 'हल्का',
    themeDark: 'गहरा',
    windowOpacity: 'विंडो अपारदर्शिता',
    opacity100: '100% (अपारदर्शी)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'पृष्ठभूमि पारदर्शिता',
    transparencyHigh: 'अधिक पारदर्शी',
    transparencyMedium: 'मानक',
    transparencyLow: 'कम पारदर्शी',
    about: 'के बारे में',
    hide: 'छिपाएँ',
    unhide: 'सब दिखाएँ',
    quit: 'बंद करें',
    undo: 'पूर्ववत',
    redo: 'फिर से करें',
    cut: 'कट',
    copy: 'कॉपी',
    paste: 'पेस्ट',
    pasteAndMatchStyle: 'शैली मिलाकर पेस्ट करें',
    delete: 'हटाएँ',
    selectAll: 'सब चुनें',
    language: 'भाषा',
    showLogoPopup: 'लोगो विंडो दिखाएँ',
    pinAllSpaces: 'सभी ऐप/स्पेस के ऊपर दिखाएँ',
    aiSettings: 'AI सेटिंग्स',
    setGeminiApiKey: 'Gemini API कुंजी सेट करें…',
    setGeminiModel: 'Gemini मॉडल सेट करें…',
    setWebSearchModel: 'वेब सर्च मॉडल सेट करें…',
    tone: 'टोन',
    toneFormal: 'औपचारिक',
    toneCasual: 'अनौपचारिक',
    help: 'सहायता',
    checkForUpdates: 'अपडेट जाँचें…',
    openDownloadsPage: 'डाउनलोड पेज खोलें'
  },
  'pt-BR': {
    irukadark: 'IrukaDark',
    edit: 'Editar',
    view: 'Exibir',
    window: 'Janela',
    minimize: 'Minimizar',
    zoom: 'Zoom',
    close: 'Fechar',
    bringAllToFront: 'Trazer tudo para frente',
    appearance: 'Aparência',
    themeLight: 'Claro',
    themeDark: 'Escuro',
    windowOpacity: 'Opacidade da janela',
    opacity100: '100% (Sólido)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Transparência do fundo',
    transparencyHigh: 'Mais transparente',
    transparencyMedium: 'Padrão',
    transparencyLow: 'Menos transparente',
    about: 'Sobre',
    hide: 'Ocultar',
    unhide: 'Mostrar tudo',
    quit: 'Sair',
    undo: 'Desfazer',
    redo: 'Refazer',
    cut: 'Recortar',
    copy: 'Copiar',
    paste: 'Colar',
    pasteAndMatchStyle: 'Colar e manter estilo',
    delete: 'Excluir',
    selectAll: 'Selecionar tudo',
    language: 'Idioma',
    showLogoPopup: 'Mostrar janela do logotipo',
    pinAllSpaces: 'Mostrar sobre todos os apps/espaços',
    aiSettings: 'Configurações de IA',
    setGeminiApiKey: 'Definir chave da API do Gemini…',
    setGeminiModel: 'Definir modelo do Gemini…',
    setWebSearchModel: 'Definir modelo de Pesquisa na Web…',
    tone: 'Tom',
    toneFormal: 'Formal',
    toneCasual: 'Informal',
    help: 'Ajuda',
    checkForUpdates: 'Verificar atualizações…',
    openDownloadsPage: 'Abrir página de downloads'
  },
  fr: {
    irukadark: 'IrukaDark',
    edit: 'Édition',
    view: 'Affichage',
    window: 'Fenêtre',
    minimize: 'Réduire',
    zoom: 'Zoom',
    close: 'Fermer',
    bringAllToFront: 'Tout ramener au premier plan',
    appearance: 'Apparence',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    windowOpacity: 'Opacité de la fenêtre',
    opacity100: '100 % (opaque)',
    opacity95: '95 %',
    opacity90: '90 %',
    opacity85: '85 %',
    opacity80: '80 %',
    backgroundTransparency: 'Transparence du fond',
    transparencyHigh: 'Plus transparent',
    transparencyMedium: 'Standard',
    transparencyLow: 'Moins transparent',
    about: 'À propos',
    hide: 'Masquer',
    unhide: 'Tout afficher',
    quit: 'Quitter',
    undo: 'Annuler',
    redo: 'Rétablir',
    cut: 'Couper',
    copy: 'Copier',
    paste: 'Coller',
    pasteAndMatchStyle: 'Coller en adaptant le style',
    delete: 'Supprimer',
    selectAll: 'Tout sélectionner',
    language: 'Langue',
    showLogoPopup: 'Afficher la fenêtre du logo',
    pinAllSpaces: 'Afficher au‑dessus de toutes les apps/espaces',
    aiSettings: 'Paramètres IA',
    setGeminiApiKey: 'Définir la clé API Gemini…',
    setGeminiModel: 'Définir le modèle Gemini…',
    setWebSearchModel: 'Définir le modèle de recherche Web…',
    tone: 'Ton',
    toneFormal: 'Formel',
    toneCasual: 'Décontracté',
    help: 'Aide',
    checkForUpdates: 'Rechercher des mises à jour…',
    openDownloadsPage: 'Ouvrir la page des téléchargements'
  },
  de: {
    irukadark: 'IrukaDark',
    edit: 'Bearbeiten',
    view: 'Ansicht',
    window: 'Fenster',
    minimize: 'Minimieren',
    zoom: 'Zoomen',
    close: 'Schließen',
    bringAllToFront: 'Alle nach vorne bringen',
    appearance: 'Erscheinungsbild',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    windowOpacity: 'Fenstertransparenz',
    opacity100: '100 % (Deckend)',
    opacity95: '95 %',
    opacity90: '90 %',
    opacity85: '85 %',
    opacity80: '80 %',
    backgroundTransparency: 'Hintergrundtransparenz',
    transparencyHigh: 'Stärker transparent',
    transparencyMedium: 'Standard',
    transparencyLow: 'Weniger transparent',
    about: 'Über',
    hide: 'Ausblenden',
    unhide: 'Alle einblenden',
    quit: 'Beenden',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einfügen',
    pasteAndMatchStyle: 'Einsetzen und Stil anpassen',
    delete: 'Löschen',
    selectAll: 'Alles auswählen',
    language: 'Sprache',
    showLogoPopup: 'Logo‑Fenster anzeigen',
    pinAllSpaces: 'Über allen Apps/Spaces anzeigen',
    aiSettings: 'KI-Einstellungen',
    setGeminiApiKey: 'Gemini-API-Schlüssel festlegen…',
    setGeminiModel: 'Gemini-Modell festlegen…',
    setWebSearchModel: 'Websuchmodell festlegen…',
    tone: 'Ton',
    toneFormal: 'Förmlich',
    toneCasual: 'Locker',
    help: 'Hilfe',
    checkForUpdates: 'Nach Updates suchen…',
    openDownloadsPage: 'Downloadseite öffnen'
  },
  ar: {
    irukadark: 'IrukaDark',
    edit: 'تحرير',
    view: 'عرض',
    window: 'نافذة',
    minimize: 'تصغير',
    zoom: 'تكبير',
    close: 'إغلاق',
    bringAllToFront: 'إحضار الكل إلى الأمام',
    appearance: 'المظهر',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    windowOpacity: 'شفافية النافذة',
    opacity100: '100% (صلب)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'شفافية الخلفية',
    transparencyHigh: 'أكثر شفافية',
    transparencyMedium: 'قياسي',
    transparencyLow: 'أقل شفافية',
    about: 'حول',
    hide: 'إخفاء',
    unhide: 'إظهار الكل',
    quit: 'إنهاء',
    undo: 'تراجع',
    redo: 'إعادة',
    cut: 'قص',
    copy: 'نسخ',
    paste: 'لصق',
    pasteAndMatchStyle: 'لصق مع مطابقة النمط',
    delete: 'حذف',
    selectAll: 'تحديد الكل',
    language: 'اللغة',
    showLogoPopup: 'عرض نافذة الشعار',
    pinAllSpaces: 'العرض فوق جميع التطبيقات/المساحات',
    aiSettings: 'إعدادات الذكاء الاصطناعي',
    setGeminiApiKey: 'تعيين مفتاح Gemini API…',
    setGeminiModel: 'تعيين نموذج Gemini…',
    setWebSearchModel: 'تعيين نموذج البحث على الويب…',
    tone: 'النبرة',
    toneFormal: 'رسمي',
    toneCasual: 'غير رسمي',
    help: 'مساعدة',
    checkForUpdates: 'التحقق من وجود تحديثات…',
    openDownloadsPage: 'فتح صفحة التنزيلات'
  },
  ru: {
    irukadark: 'IrukaDark',
    edit: 'Правка',
    view: 'Вид',
    window: 'Окно',
    minimize: 'Свернуть',
    zoom: 'Масштаб',
    close: 'Закрыть',
    bringAllToFront: 'Вывести всё на передний план',
    appearance: 'Оформление',
    themeLight: 'Светлая',
    themeDark: 'Тёмная',
    windowOpacity: 'Прозрачность окна',
    opacity100: '100% (непрозр.)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Прозрачность фона',
    transparencyHigh: 'Более прозрачно',
    transparencyMedium: 'Стандарт',
    transparencyLow: 'Менее прозрачно',
    about: 'О программе',
    hide: 'Скрыть',
    unhide: 'Показать все',
    quit: 'Выйти',
    undo: 'Отменить',
    redo: 'Повторить',
    cut: 'Вырезать',
    copy: 'Копировать',
    paste: 'Вставить',
    pasteAndMatchStyle: 'Вставить и сохранить стиль',
    delete: 'Удалить',
    selectAll: 'Выделить все',
    language: 'Язык',
    showLogoPopup: 'Показать окно логотипа',
    pinAllSpaces: 'Поверх всех приложений/раб. столов',
    aiSettings: 'Настройки ИИ',
    setGeminiApiKey: 'Указать ключ API Gemini…',
    setGeminiModel: 'Выбрать модель Gemini…',
    setWebSearchModel: 'Выбрать модель веб‑поиска…',
    tone: 'Тон',
    toneFormal: 'Официальный',
    toneCasual: 'Разговорный',
    help: 'Справка',
    checkForUpdates: 'Проверить обновления…',
    openDownloadsPage: 'Открыть страницу загрузок'
  },
  ko: {
    irukadark: 'IrukaDark',
    edit: '편집',
    view: '보기',
    window: '창',
    minimize: '최소화',
    zoom: '줌',
    close: '닫기',
    bringAllToFront: '모두 앞으로 가져오기',
    appearance: '모양',
    themeLight: '라이트',
    themeDark: '다크',
    windowOpacity: '창 불투명도',
    opacity100: '100% (불투명)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: '배경 투명도',
    transparencyHigh: '더 투명하게',
    transparencyMedium: '표준',
    transparencyLow: '덜 투명하게',
    about: '정보',
    hide: '숨기기',
    unhide: '모두 보기',
    quit: '종료',
    undo: '실행 취소',
    redo: '다시 실행',
    cut: '잘라내기',
    copy: '복사',
    paste: '붙여넣기',
    pasteAndMatchStyle: '스타일 맞춰 붙여넣기',
    delete: '삭제',
    selectAll: '모두 선택',
    language: '언어',
    showLogoPopup: '로고 창 표시',
    pinAllSpaces: '모든 앱/스페이스 위에 표시',
    aiSettings: 'AI 설정',
    setGeminiApiKey: 'Gemini API 키 설정…',
    setGeminiModel: 'Gemini 모델 설정…',
    setWebSearchModel: '웹 검색 모델 설정…',
    tone: '말투',
    toneFormal: '격식체',
    toneCasual: '캐주얼',
    help: '도움말',
    checkForUpdates: '업데이트 확인…',
    openDownloadsPage: '다운로드 페이지 열기'
  },
  id: {
    irukadark: 'IrukaDark',
    edit: 'Edit',
    view: 'Tampilan',
    window: 'Jendela',
    minimize: 'Minimalkan',
    zoom: 'Perbesar',
    close: 'Tutup',
    bringAllToFront: 'Bawa Semua ke Depan',
    appearance: 'Tampilan',
    themeLight: 'Terang',
    themeDark: 'Gelap',
    windowOpacity: 'Opasitas jendela',
    opacity100: '100% (Solid)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Transparansi latar',
    transparencyHigh: 'Lebih transparan',
    transparencyMedium: 'Standar',
    transparencyLow: 'Kurang transparan',
    about: 'Tentang',
    hide: 'Sembunyikan',
    unhide: 'Tampilkan semua',
    quit: 'Keluar',
    undo: 'Urungkan',
    redo: 'Ulangi',
    cut: 'Potong',
    copy: 'Salin',
    paste: 'Tempel',
    pasteAndMatchStyle: 'Tempel dan sesuaikan gaya',
    delete: 'Hapus',
    selectAll: 'Pilih semua',
    language: 'Bahasa',
    showLogoPopup: 'Tampilkan jendela logo',
    pinAllSpaces: 'Tampilkan di atas semua aplikasi/space',
    aiSettings: 'Pengaturan AI',
    setGeminiApiKey: 'Atur Kunci API Gemini…',
    setGeminiModel: 'Atur Model Gemini…',
    setWebSearchModel: 'Atur Model Pencarian Web…',
    tone: 'Nada',
    toneFormal: 'Resmi',
    toneCasual: 'Santai',
    help: 'Bantuan',
    checkForUpdates: 'Periksa pembaruan…',
    openDownloadsPage: 'Buka halaman unduhan'
  },
  vi: {
    irukadark: 'IrukaDark',
    edit: 'Chỉnh sửa',
    view: 'Xem',
    window: 'Cửa sổ',
    minimize: 'Thu nhỏ',
    zoom: 'Thu phóng',
    close: 'Đóng',
    bringAllToFront: 'Đưa tất cả lên trước',
    appearance: 'Giao diện',
    themeLight: 'Sáng',
    themeDark: 'Tối',
    windowOpacity: 'Độ mờ cửa sổ',
    opacity100: '100% (Đặc)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Độ trong suốt nền',
    transparencyHigh: 'Trong suốt hơn',
    transparencyMedium: 'Tiêu chuẩn',
    transparencyLow: 'Ít trong suốt hơn',
    about: 'Giới thiệu',
    hide: 'Ẩn',
    unhide: 'Hiển thị tất cả',
    quit: 'Thoát',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    cut: 'Cắt',
    copy: 'Sao chép',
    paste: 'Dán',
    pasteAndMatchStyle: 'Dán và khớp kiểu',
    delete: 'Xóa',
    selectAll: 'Chọn tất cả',
    language: 'Ngôn ngữ',
    showLogoPopup: 'Hiển thị cửa sổ logo',
    pinAllSpaces: 'Hiển thị trên mọi ứng dụng/không gian',
    aiSettings: 'Cài đặt AI',
    setGeminiApiKey: 'Đặt khóa API Gemini…',
    setGeminiModel: 'Đặt mô hình Gemini…',
    setWebSearchModel: 'Đặt mô hình Tìm kiếm web…',
    tone: 'Giọng điệu',
    toneFormal: 'Trang trọng',
    toneCasual: 'Thân mật',
    help: 'Trợ giúp',
    checkForUpdates: 'Kiểm tra cập nhật…',
    openDownloadsPage: 'Mở trang tải xuống'
  },
  th: {
    irukadark: 'IrukaDark',
    edit: 'แก้ไข',
    view: 'มุมมอง',
    window: 'หน้าต่าง',
    minimize: 'ย่อ',
    zoom: 'ซูม',
    close: 'ปิด',
    bringAllToFront: 'นำทั้งหมดมาไว้ด้านหน้า',
    appearance: 'ลักษณะ',
    themeLight: 'สว่าง',
    themeDark: 'มืด',
    windowOpacity: 'ความทึบของหน้าต่าง',
    opacity100: '100% (ทึบ)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'ความโปร่งใสของพื้นหลัง',
    transparencyHigh: 'โปร่งใสขึ้น',
    transparencyMedium: 'มาตรฐาน',
    transparencyLow: 'โปร่งใสน้อยลง',
    about: 'เกี่ยวกับ',
    hide: 'ซ่อน',
    unhide: 'แสดงทั้งหมด',
    quit: 'ออกจากโปรแกรม',
    undo: 'เลิกทำ',
    redo: 'ทำซ้ำ',
    cut: 'ตัด',
    copy: 'คัดลอก',
    paste: 'วาง',
    pasteAndMatchStyle: 'วางและใช้รูปแบบเดียวกัน',
    delete: 'ลบ',
    selectAll: 'เลือกทั้งหมด',
    language: 'ภาษา',
    showLogoPopup: 'แสดงหน้าต่างโลโก้',
    pinAllSpaces: 'แสดงเหนือทุกแอป/พื้นที่ทำงาน',
    aiSettings: 'การตั้งค่า AI',
    setGeminiApiKey: 'ตั้งค่าคีย์ API ของ Gemini…',
    setGeminiModel: 'ตั้งค่าโมเดล Gemini…',
    setWebSearchModel: 'ตั้งค่าโมเดลการค้นหาเว็บ…',
    tone: 'น้ำเสียง',
    toneFormal: 'ทางการ',
    toneCasual: 'ไม่เป็นทางการ',
    help: 'วิธีใช้',
    checkForUpdates: 'ตรวจสอบการอัปเดต…',
    openDownloadsPage: 'เปิดหน้าดาวน์โหลด'
  },
  it: {
    irukadark: 'IrukaDark',
    edit: 'Modifica',
    view: 'Vista',
    window: 'Finestra',
    minimize: 'Riduci a icona',
    zoom: 'Zoom',
    close: 'Chiudi',
    bringAllToFront: 'Porta tutto in primo piano',
    appearance: 'Aspetto',
    themeLight: 'Chiaro',
    themeDark: 'Scuro',
    windowOpacity: 'Opacità finestra',
    opacity100: '100% (Opaco)',
    opacity95: '95%',
    opacity90: '90%',
    opacity85: '85%',
    opacity80: '80%',
    backgroundTransparency: 'Trasparenza sfondo',
    transparencyHigh: 'Più trasparente',
    transparencyMedium: 'Standard',
    transparencyLow: 'Meno trasparente',
    about: 'Informazioni',
    hide: 'Nascondi',
    unhide: 'Mostra tutto',
    quit: 'Esci',
    undo: 'Annulla',
    redo: 'Ripeti',
    cut: 'Taglia',
    copy: 'Copia',
    paste: 'Incolla',
    pasteAndMatchStyle: 'Incolla mantenendo lo stile',
    delete: 'Elimina',
    selectAll: 'Seleziona tutto',
    language: 'Lingua',
    showLogoPopup: 'Mostra finestra logo',
    pinAllSpaces: 'Mostra sopra tutte le app/spazi',
    aiSettings: 'Impostazioni IA',
    setGeminiApiKey: 'Imposta chiave API di Gemini…',
    setGeminiModel: 'Imposta modello Gemini…',
    setWebSearchModel: 'Imposta modello di Ricerca Web…',
    tone: 'Tono',
    toneFormal: 'Formale',
    toneCasual: 'Informale',
    help: 'Aiuto',
    checkForUpdates: 'Controlla aggiornamenti…',
    openDownloadsPage: 'Apri pagina dei download'
  },
  tr: {
    irukadark: 'IrukaDark',
    edit: 'Düzenle',
    view: 'Görünüm',
    window: 'Pencere',
    minimize: 'Simge Durumuna Küçült',
    zoom: 'Yakınlaştır',
    close: 'Kapat',
    bringAllToFront: 'Tümünü Öne Getir',
    appearance: 'Görünüm',
    themeLight: 'Açık',
    themeDark: 'Koyu',
    windowOpacity: 'Pencere opaklığı',
    opacity100: '%100 (Katı)',
    opacity95: '%95',
    opacity90: '%90',
    opacity85: '%85',
    opacity80: '%80',
    backgroundTransparency: 'Arka plan saydamlığı',
    transparencyHigh: 'Daha saydam',
    transparencyMedium: 'Standart',
    transparencyLow: 'Daha az saydam',
    about: 'Hakkında',
    hide: 'Gizle',
    unhide: 'Tümünü göster',
    quit: 'Çıkış',
    undo: 'Geri al',
    redo: 'Yinele',
    cut: 'Kes',
    copy: 'Kopyala',
    paste: 'Yapıştır',
    pasteAndMatchStyle: 'Stili koruyarak yapıştır',
    delete: 'Sil',
    selectAll: 'Tümünü seç',
    language: 'Dil',
    showLogoPopup: 'Logo penceresini göster',
    pinAllSpaces: 'Tüm uygulamalar/alanların üzerinde göster',
    aiSettings: 'Yapay Zeka Ayarları',
    setGeminiApiKey: 'Gemini API Anahtarını Ayarla…',
    setGeminiModel: 'Gemini Modelini Ayarla…',
    setWebSearchModel: 'Web Arama Modelini Ayarla…',
    tone: 'Ton',
    toneFormal: 'Resmî',
    toneCasual: 'Gündelik',
    help: 'Yardım',
    checkForUpdates: 'Güncellemeleri denetle…',
    openDownloadsPage: 'İndirme sayfasını aç'
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
    icon: path.resolve(__dirname, 'renderer/assets/icons/IrukaDark_desktopicon.png'),
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

  // Always open external HTTP(S) links in the user's default browser
  try {
    const isExternalHttpUrl = (u) => {
      try { return /^https?:\/\//i.test(String(u || '')); } catch { return false; }
    };
    // Links that would open a new window (target=_blank, window.open)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalHttpUrl(url)) {
        try { shell.openExternal(url); } catch {}
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    // In-page navigations to external URLs
    mainWindow.webContents.on('will-navigate', (e, url) => {
      if (isExternalHttpUrl(url)) {
        try { e.preventDefault(); } catch {}
        try { shell.openExternal(url); } catch {}
      }
    });
  } catch {}

  try {
    const pinAll = !['0','false','off'].includes(String(getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase());
    mainWindow.setAlwaysOnTop(true, pinAll ? 'screen-saver' : 'floating');
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(!!pinAll, { visibleOnFullScreen: !!pinAll });
    }
  } catch {}

  const savedOpacity = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
  if (!Number.isNaN(savedOpacity)) {
    try { mainWindow.setOpacity(savedOpacity); } catch {}
  }

  // Provisional placement (kept inside the work area to avoid Windows auto-snap)
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
    mainWindow.once('ready-to-show', () => { if (INITIAL_SHOW_MAIN) mainWindow.show(); });
  } catch {}
  mainWindow.webContents.once('did-finish-load', () => {
    createPopupWindow();
  });

  const iconPath = path.resolve(__dirname, 'renderer/assets/icons/IrukaDark_desktopicon.png');
  mainWindow.setIcon(iconPath);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Updates: notification-only (no auto-update)
function getUpdateRepo() {
  const repo = process.env.UPDATE_REPO || 'co-r-e/IrukaDark';
  return String(repo).trim();
}

function parseVersion(v) {
  try {
    const s = String(v || '').replace(/^v/, '');
    const parts = s.split('.').map(n => parseInt(n, 10));
    return [parts[0]||0, parts[1]||0, parts[2]||0];
  } catch { return [0,0,0]; }
}

function isNewer(a, b) {
  const A = parseVersion(a);
  const B = parseVersion(b);
  for (let i=0;i<3;i++) { if (A[i] !== B[i]) return A[i] > B[i]; }
  return false;
}

async function fetchLatestRelease() {
  const repo = getUpdateRepo();
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const tag = String(j.tag_name || '').trim();
  const version = tag ? tag.replace(/^v/, '') : '';
  const html = String(j.html_url || `https://github.com/${repo}/releases/latest`);
  const body = String(j.body || '');
  return { version, url: html, notes: body };
}

async function checkForUpdates(manual = false) {
  try {
    const skip = String(getPref('UPDATE_SKIP_VERSION') || '').trim();
    const last = Number(getPref('UPDATE_LAST_CHECK') || 0);
    const now = Date.now();
    if (!manual && last && (now - last) < (60*60*1000)) return; // throttle 1h in case timer overlaps
    const latest = await fetchLatestRelease();
    try { setPref('UPDATE_LAST_CHECK', String(now)); } catch {}
    const current = app.getVersion();
    if (latest.version && isNewer(latest.version, current) && latest.version !== skip) {
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:available', latest); } catch {}
    } else if (manual) {
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:none'); } catch {}
    }
  } catch (e) {
    if (manual) {
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:none'); } catch {}
    }
  }
}

function triggerMacCopyShortcut() {
  try {
    exec("osascript -e 'tell application \"System Events\" to keystroke \"c\" using {command down}'", (error) => {
      if (error && isDev) console.warn('osascript error:', error.message);
    });
  } catch (e) {
    if (isDev) console.warn('Failed to invoke osascript:', e?.message);
  }
}

// macOS: read selected text via Accessibility (AX) without using the clipboard
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
        if (err) { resolve(''); return; }
        const out = String(stdout || '').replace(/\r/g, '').trim();
        resolve(out);
      });
    } catch { resolve(''); }
  });
}

// Show a window without stealing focus when possible
function showWindowNonActivating(win) {
  try {
    if (!win || win.isDestroyed()) return;
    if (typeof win.showInactive === 'function') win.showInactive(); else win.show();
  } catch {}
}

// Safe wrapper to get all BrowserWindows
function getAllWindowsSafe() {
  try { return (BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : []).filter(w => !!w && !w.isDestroyed()); } catch { return []; }
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
    // Make sure IrukaDark is not the active app while retrieving selection
    let didHideApp = false;
    try {
      if (typeof app?.isHidden === 'function' && !app.isHidden()) {
        didHideApp = true;
        try { app.hide(); } catch {}
        await delay(HIDE_DELAY_MS_MAC);
      }
    } catch {}

    try {
      // 1) Primary: Try Accessibility selected text without touching the clipboard
      const axText = (await macReadSelectedTextViaAX()) || '';
      if (axText && axText.trim()) {
        try { clipboardTextSnapshot = axText.trim(); clipboardChangedAt = Date.now(); } catch {}
        return axText.trim();
      }

      // Do not prompt or change focus during shortcut — avoid stealing focus.
      // Attempt keystroke regardless of AX trust; if not permitted, it will simply have no effect.
      try { triggerMacCopyShortcut(); } catch {}

      // Poll for the entire allowed window without ever bringing our app frontmost
      const polled = await pollClipboardChange(before, macMaxWait);
      if (polled) return polled;
      if (isDev) console.log('No text found in clipboard (macOS)');
      return '';
    } finally {
      // Unhide app non-activating (best-effort)
      if (didHideApp) {
        try {
          const wins = getAllWindowsSafe();
          for (const w of wins) { showWindowNonActivating(w); }
        } catch {}
      }
    }
  }

  if (platform === 'win32') {
    // If our app is focused, hide all its windows briefly so Ctrl+C targets the underlying app
    const appWindowFocused = !!BrowserWindow.getFocusedWindow();
    let windowsToRestore = [];
    if (appWindowFocused) {
      try {
        windowsToRestore = getAllWindowsSafe().filter(w => w.isVisible());
        for (const w of windowsToRestore) { try { w.hide(); } catch {} }
        await delay(HIDE_DELAY_MS_WIN);
      } catch {}
    }
    try {
      // Best effort: ask the (now foreground) app to copy
      windowsSendCtrlC();
      const polled = await pollClipboardChange(before, winMaxWait);
      if (polled) return polled;
      return '';
    } finally {
      if (windowsToRestore && windowsToRestore.length) {
        for (const w of windowsToRestore) { showWindowNonActivating(w); }
        // Do not refocus our window; keep user's focus on their app
      }
    }
  }

  // linux
  // If our app is focused, briefly hide windows to avoid swallowing focus
  const appWindowFocused = !!BrowserWindow.getFocusedWindow();
  let windowsToRestore = [];
  if (appWindowFocused) {
    try {
      windowsToRestore = getAllWindowsSafe().filter(w => w.isVisible());
      for (const w of windowsToRestore) { try { w.hide(); } catch {} }
      await delay(HIDE_DELAY_MS_LIN);
    } catch {}
  }
  try {
    const polled = await pollClipboardChange(before, linMaxWait);
    if (polled) return polled;
    // Try PRIMARY selection (no copy required)
    const primary = await linuxReadPrimarySelection();
    if (primary) return primary;
    return '';
  } finally {
    if (windowsToRestore && windowsToRestore.length) {
      for (const w of windowsToRestore) { showWindowNonActivating(w); }
      // Do not refocus our window; keep user's focus on their app
    }
  }
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
  const maybeCopy = (k) => { if (!p[k] && process.env[k]) { p[k] = String(process.env[k]); changed = true; } };
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
        iconPath: path.resolve(__dirname, 'renderer/assets/icons/IrukaDark_desktopicon.png')
      });
    }
  } catch {}
  createAppMenu();
  
  createWindow();

  // Schedule update checks (notification-only)
  try {
    setTimeout(() => { try { checkForUpdates(false); } catch {} }, 30000);
    setInterval(() => { try { checkForUpdates(false); } catch {} }, 24 * 60 * 60 * 1000);
  } catch {}

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

    // Pure translation (all OS): Option+R (fallback Cmd/Ctrl+Alt+R)
    const translateCandidates = ['Alt+R', 'CommandOrControl+Alt+R'];
    let translateUsed = '';
    for (const c of translateCandidates) {
      try {
        const ok = globalShortcut.register(c, () => {
          (async () => {
            try {
              const text = await tryCopySelectedText();
              if (!mainWindow || mainWindow.isDestroyed()) return;
              if (text) {
                if (isClipboardTextStale(text, 3000)) {
                  mainWindow.webContents.send('explain-clipboard-error', '');
                } else {
                  mainWindow.webContents.send('translate-clipboard', text);
                }
              } else {
                mainWindow.webContents.send('explain-clipboard-error', '');
              }
            } catch (e) {
              if (isDev) console.warn('Clipboard translate failed:', e?.message);
            }
          })();
        });
        if (ok) { translateUsed = c; break; }
      } catch {}
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

function isPortableMode() {
  const v = String(process.env.PORTABLE_MODE || '').trim().toLowerCase();
  return v && v !== '0' && v !== 'false' && v !== 'off';
}

function getPref(key) {
  try { const p = loadPrefs(); return p ? p[key] : undefined; } catch { return undefined; }
}

function setPref(key, value) {
  try {
    if (isPortableMode()) {
      const envPath = path.join(__dirname, '../.env.local');
      if (value === undefined || value === null || value === '') {
        // remove line
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const lines = envContent.split('\n').filter(Boolean).filter(line => !line.startsWith(`${key}=`));
        fs.writeFileSync(envPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
      } else {
        upsertEnvVar(envPath, key, String(value));
      }
      return true;
    }
    const p = loadPrefs();
    if (value === undefined || value === null || value === '') { delete p[key]; }
    else { p[key] = value; }
    savePrefs(p);
    return true;
  } catch { return false; }
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
  try { setPref('MENU_LANGUAGE', language); } catch {}
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
  try { setPref('UI_THEME', String(theme)); } catch {}
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
function getCurrentTone() {
  return getPref('TONE') || process.env.TONE || 'casual';
}

function saveToneSetting(tone) {
  try { setPref('TONE', String(tone)); } catch {}
}

function handleToneChange(tone) {
  const v = (String(tone || 'casual').toLowerCase() === 'formal') ? 'formal' : 'casual';
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
  try { setPref('PIN_ALL_SPACES', enabled ? '1' : '0'); } catch {}
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
  try { setPref('ENABLE_GOOGLE_SEARCH', enabled ? '1' : '0'); } catch {}
}

// アプリメニュー（Edit ロールを含む）- 多言語対応
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  const currentLang = getCurrentLanguage();
  const t = menuTranslations[currentLang] || menuTranslations.en;
  const windowOpacity = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
  const pinAllSpaces = !['0','false','off'].includes(String(getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase());
  const curTheme = String(getPref('UI_THEME') || process.env.UI_THEME || 'dark');
  const curTone = String(getPref('TONE') || process.env.TONE || 'casual');
  const lang = currentLang;

  const promptSetEnv = async (key, { title, label, placeholder = '', password = false, defaultValue = '' } = {}) => {
    const val = await openInputDialog({ title, label, placeholder, value: defaultValue, password, lang });
    if (val === null) return;
    try {
      setPref(key, String(val));
    } catch {}
    try { process.env[key] = String(val); } catch {}
    createAppMenu();
  };

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
            checked: curTheme === 'light',
            click: () => handleThemeChange('light')
          },
          {
            label: t.themeDark,
            type: 'radio',
            checked: curTheme === 'dark',
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
        submenu: (() => {
          const locales = [
            { code: 'en', label: 'English' },
            { code: 'ja', label: '日本語' },
            { code: 'es', label: 'Español' },
            { code: 'es-419', label: 'Español (Latinoamérica)' },
            { code: 'zh-Hans', label: '简体中文' },
            { code: 'zh-Hant', label: '繁體中文' },
            { code: 'hi', label: 'हिन्दी' },
            { code: 'pt-BR', label: 'Português (Brasil)' },
            { code: 'fr', label: 'Français' },
            { code: 'de', label: 'Deutsch' },
            { code: 'ar', label: 'العربية' },
            { code: 'ru', label: 'Русский' },
            { code: 'ko', label: '한국어' },
            { code: 'id', label: 'Bahasa Indonesia' },
            { code: 'vi', label: 'Tiếng Việt' },
            { code: 'th', label: 'ไทย' },
            { code: 'it', label: 'Italiano' },
            { code: 'tr', label: 'Türkçe' }
          ];
          return locales.map(loc => ({
            label: loc.label,
            type: 'radio',
            checked: currentLang === loc.code,
            click: () => handleLanguageChange(loc.code)
          }));
        })()
      }
    ]
  };

  if (process.platform !== 'darwin') {
    try {
      const aiSettingsMenu = {
        label: t.aiSettings || menuTranslations.en.aiSettings,
        submenu: [
          {
            label: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
            click: async () => {
              await promptSetEnv('GEMINI_API_KEY', {
                title: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
                label: 'GEMINI_API_KEY',
                placeholder: 'AIza… or AI… key',
                password: true,
                defaultValue: ''
              });
            }
          },
          {
            label: t.setGeminiModel || menuTranslations.en.setGeminiModel,
            click: async () => {
              await promptSetEnv('GEMINI_MODEL', {
                title: t.setGeminiModel || menuTranslations.en.setGeminiModel,
                label: 'GEMINI_MODEL',
                placeholder: 'e.g., gemini-2.5-flash-lite',
                password: false,
                defaultValue: String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite')
              });
            }
          },
          {
            label: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
            click: async () => {
              await promptSetEnv('WEB_SEARCH_MODEL', {
                title: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
                label: 'WEB_SEARCH_MODEL',
                placeholder: 'e.g., gemini-2.5-flash',
                password: false,
                defaultValue: String(process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash')
              });
            }
          }
          ,
          { // Tone submenu (formal/casual)
            label: t.tone || menuTranslations.en.tone,
            submenu: [
              {
                label: t.toneCasual || menuTranslations.en.toneCasual,
                type: 'radio',
                checked: curTone !== 'formal',
                click: () => handleToneChange('casual')
              },
              {
                label: t.toneFormal || menuTranslations.en.toneFormal,
                type: 'radio',
                checked: curTone === 'formal',
                click: () => handleToneChange('formal')
              }
            ]
          }
        ]
      };
      if (Array.isArray(viewMenu.submenu)) viewMenu.submenu.unshift(aiSettingsMenu, { type: 'separator' });
    } catch {}
  }

  // Window menu (fully localized instead of relying on OS defaults)
  const windowMenu = {
    label: t.window,
    submenu: [
      { role: 'minimize', label: t.minimize || (menuTranslations.en && menuTranslations.en.minimize) || 'Minimize' },
      { role: 'zoom',     label: t.zoom     || (menuTranslations.en && menuTranslations.en.zoom)     || 'Zoom' },
      // macOS typically has "Bring All to Front" in Window menu
      ...(process.platform === 'darwin'
        ? [{ role: 'front', label: t.bringAllToFront || (menuTranslations.en && menuTranslations.en.bringAllToFront) || 'Bring All to Front' }]
        : [{ role: 'close', label: t.close || (menuTranslations.en && menuTranslations.en.close) || 'Close' }])
    ]
  };

  const template = [];

  if (isMac) {
    template.push({
      label: t.irukadark,
      submenu: [
        { role: 'about', label: t.about },
        { type: 'separator' },
        { label: t.checkForUpdates || 'Check for Updates…', click: () => { try { checkForUpdates(true); } catch {} } },
        { label: t.openDownloadsPage || 'Open Downloads Page', click: () => { try { const repo = getUpdateRepo(); shell.openExternal(`https://github.com/${repo}/releases`); } catch {} } },
        { type: 'separator' },
        {
          label: t.aiSettings || menuTranslations.en.aiSettings,
          submenu: [
            {
              label: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
              click: async () => {
                await promptSetEnv('GEMINI_API_KEY', {
                  title: t.setGeminiApiKey || menuTranslations.en.setGeminiApiKey,
                  label: 'GEMINI_API_KEY',
                  placeholder: 'AIza… or AI… key',
                  password: true,
                  defaultValue: ''
                });
              }
            },
            {
              label: t.setGeminiModel || menuTranslations.en.setGeminiModel,
              click: async () => {
                await promptSetEnv('GEMINI_MODEL', {
                  title: t.setGeminiModel || menuTranslations.en.setGeminiModel,
                  label: 'GEMINI_MODEL',
                  placeholder: 'e.g., gemini-2.5-flash-lite',
                  password: false,
                  defaultValue: String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite')
                });
              }
            },
            {
              label: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
              click: async () => {
                await promptSetEnv('WEB_SEARCH_MODEL', {
                  title: t.setWebSearchModel || menuTranslations.en.setWebSearchModel,
                  label: 'WEB_SEARCH_MODEL',
                  placeholder: 'e.g., gemini-2.5-flash',
                  password: false,
                  defaultValue: String(process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash')
                });
              }
            }
            ,
            { // Tone submenu (formal/casual)
              label: t.tone || menuTranslations.en.tone,
              submenu: [
                {
                  label: t.toneCasual || menuTranslations.en.toneCasual,
                  type: 'radio',
                  checked: curTone !== 'formal',
                  click: () => handleToneChange('casual')
                },
                {
                  label: t.toneFormal || menuTranslations.en.toneFormal,
                  type: 'radio',
                  checked: curTone === 'formal',
                  click: () => handleToneChange('formal')
                }
              ]
            }
          ]
        },
        { type: 'separator' },
        { role: 'hide', label: t.hide },
        { role: 'unhide', label: t.unhide },
        { type: 'separator' },
        { role: 'quit', label: t.quit }
      ]
    });
  }

  // Keep Edit accelerators without showing the menu
  template.push(editMenu, viewMenu, windowMenu);

  if (!isMac) {
    template.push({
      label: t.help || 'Help',
      submenu: [
        { label: t.checkForUpdates || 'Check for Updates…', click: () => { try { checkForUpdates(true); } catch {} } },
        { label: t.openDownloadsPage || 'Open Downloads Page', click: () => { try { const repo = getUpdateRepo(); shell.openExternal(`https://github.com/${repo}/releases`); } catch {} } }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}


// ウィンドウ不透明度の保存/反映（ウィンドウレイヤー）
function handleWindowOpacityChange(opacity) {
  try {
    try { setPref('WINDOW_OPACITY', String(opacity)); } catch {}
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

// Update notifications (manual trigger + skip)
ipcMain.handle('update:manual-check', async () => { try { await checkForUpdates(true); } catch {}; return true; });
ipcMain.handle('update:skip', (_e, version) => { try { setPref('UPDATE_SKIP_VERSION', String(version||'')); return true; } catch { return false; } });

// Ensure main window becomes visible (optionally with focus)
ipcMain.handle('ui:ensure-visible', (_e, opts) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const wantFocus = !!(opts && opts.focus);
      if (!mainWindow.isVisible()) {
        try {
          if (!wantFocus) showWindowNonActivating(mainWindow); else mainWindow.show();
        } catch { mainWindow.show(); }
      }
      if (wantFocus) {
        try { mainWindow.focus(); } catch {}
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
    const requestedModel = String(process.env.GEMINI_MODEL || payload?.model || 'gemini-2.5-flash-lite');
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
    const searchPreferred = getPref('WEB_SEARCH_MODEL') || process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash';
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
    const requestedModel = String(process.env.GEMINI_MODEL || payload?.model || 'gemini-2.5-flash-lite');
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
    const searchPreferred = getPref('WEB_SEARCH_MODEL') || process.env.WEB_SEARCH_MODEL || 'gemini-2.5-flash';
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
  const popupWidth = 84;
  const popupHeight = 84;
  // 初期配置: 右端寄り・縦中央。ユーザー作業の邪魔にならない位置。
  const primary = screen.getPrimaryDisplay();
  const wa = primary && primary.workArea ? primary.workArea : { x: 0, y: 0, width: 1200, height: 800 };
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
    const pinAll = !['0','false','off'].includes(String(getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase());
    popupWindow.setAlwaysOnTop(true, pinAll ? 'screen-saver' : 'floating');
    if (process.platform === 'darwin') {
      popupWindow.setVisibleOnAllWorkspaces(!!pinAll, { visibleOnFullScreen: !!pinAll });
    }
  } catch {}

  popupWindow.loadFile(path.join(__dirname, 'renderer/popup.html'));
  const savedOpacity = parseFloat(getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1');
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
      if (!mainInitiallyShown && INITIAL_SHOW_MAIN) {
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
