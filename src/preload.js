/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: MIT. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getModel: () => ipcRenderer.invoke('get-model'),
  getUILanguage: () => ipcRenderer.invoke('get-ui-language'),
  getUITheme: () => ipcRenderer.invoke('get-ui-theme'),
  // Tone (formal/casual)
  getTone: () => ipcRenderer.invoke('get-tone'),
  getGlassLevel: () => ipcRenderer.invoke('get-glass-level'),
  getWindowOpacity: () => ipcRenderer.invoke('get-window-opacity'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  fetchUrlContent: (url, options = {}) =>
    ipcRenderer.invoke('url:fetch-content', { url, ...options }),
  aiGenerate: (prompt, options = {}) => ipcRenderer.invoke('ai:generate', { prompt, ...options }),
  aiGenerateWithImage: (prompt, imageBase64, mimeType = 'image/png', options = {}) =>
    ipcRenderer.invoke('ai:generate-with-image', { prompt, imageBase64, mimeType, ...options }),
  generateImageFromText: (prompt, options = {}) =>
    ipcRenderer.invoke('ai:generate-image-from-text', { prompt, ...options }),
  // Cancel current in-flight AI request (shortcut-only)
  cancelAI: () => ipcRenderer.invoke('cancel-ai'),
  onLanguageChanged: (cb) => ipcRenderer.on('language-changed', (_e, lang) => cb(lang)),
  onWindowOpacityChanged: (cb) => ipcRenderer.on('window-opacity-changed', (_e, v) => cb(v)),
  onExplainClipboard: (cb) => ipcRenderer.on('explain-clipboard', (_e, t) => cb(t)),
  onExplainClipboardDetailed: (cb) =>
    ipcRenderer.on('explain-clipboard-detailed', (_e, t) => cb(t)),
  onTranslateClipboard: (cb) => ipcRenderer.on('translate-clipboard', (_e, t) => cb(t)),
  onPronounceClipboard: (cb) => ipcRenderer.on('pronounce-clipboard', (_e, t) => cb(t)),
  onExplainClipboardError: (cb) => ipcRenderer.on('explain-clipboard-error', (_e, msg) => cb(msg)),
  onReplyClipboard: (cb) => ipcRenderer.on('reply-clipboard-variations', (_e, t) => cb(t)),
  onSummarizeUrlContext: (cb) => ipcRenderer.on('summarize-url-context', (_e, url) => cb(url)),
  onSummarizeUrlContextDetailed: (cb) =>
    ipcRenderer.on('summarize-url-context-detailed', (_e, url) => cb(url)),
  onSnsPostFromUrl: (cb) => ipcRenderer.on('sns-post-from-url', (_e, url) => cb(url)),
  onEmpathizeClipboard: (cb) => ipcRenderer.on('empathize-clipboard', (_e, t) => cb(t)),
  onAccessibilityWarning: (cb) => ipcRenderer.on('accessibility-warning', () => cb()),
  onShortcutRegistered: (cb) => ipcRenderer.on('shortcut-registered', (_e, a) => cb(a)),
  onShortcutDetailedRegistered: (cb) =>
    ipcRenderer.on('shortcut-detailed-registered', (_e, a) => cb(a)),
  onShortcutTranslateRegistered: (cb) =>
    ipcRenderer.on('shortcut-translate-registered', (_e, a) => cb(a)),
  onShortcutPronounceRegistered: (cb) =>
    ipcRenderer.on('shortcut-pronounce-registered', (_e, a) => cb(a)),
  onShortcutEmpathyRegistered: (cb) =>
    ipcRenderer.on('shortcut-empathy-registered', (_e, a) => cb(a)),
  onShortcutReplyRegistered: (cb) => ipcRenderer.on('shortcut-reply-registered', (_e, a) => cb(a)),
  onShortcutUrlSummaryRegistered: (cb) =>
    ipcRenderer.on('shortcut-url-summary-registered', (_e, a) => cb(a)),
  onShortcutUrlDetailedRegistered: (cb) =>
    ipcRenderer.on('shortcut-url-detailed-registered', (_e, a) => cb(a)),
  onShortcutSnsPostRegistered: (cb) =>
    ipcRenderer.on('shortcut-sns-post-registered', (_e, a) => cb(a)),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_e, theme) => cb(theme)),
  onToneChanged: (cb) => ipcRenderer.on('tone-changed', (_e, tone) => cb(tone)),
  onAppConfig: (cb) => ipcRenderer.on('app-config', (_e, cfg) => cb(cfg)),
  showAppMenu: (pos) => ipcRenderer.invoke('ui:show-app-menu', pos),
  onExplainScreenshot: (cb) => ipcRenderer.on('explain-screenshot', (_e, p) => cb(p)),
  onExplainScreenshotDetailed: (cb) =>
    ipcRenderer.on('explain-screenshot-detailed', (_e, p) => cb(p)),
  saveWebSearchSetting: (enabled) => ipcRenderer.invoke('save-web-search-setting', enabled),
  getWebSearchEnabled: () => ipcRenderer.invoke('get-web-search-enabled'),
  saveTranslateMode: (mode) => ipcRenderer.invoke('save-translate-mode', mode),
  getTranslateMode: () => ipcRenderer.invoke('get-translate-mode'),
  onTranslateModeChanged: (cb) => ipcRenderer.on('translate-mode-changed', (_e, mode) => cb(mode)),
  saveImageSize: (size) => ipcRenderer.invoke('save-image-size', size),
  getImageSize: () => ipcRenderer.invoke('get-image-size'),
  saveImageCount: (count) => ipcRenderer.invoke('save-image-count', count),
  getImageCount: () => ipcRenderer.invoke('get-image-count'),
  // Popup interactions
  notifyPopupPointer: (phase) => ipcRenderer.invoke('popup:pointer', String(phase || '')),
  getPopupBounds: () => ipcRenderer.invoke('popup:get-bounds'),
  setPopupPosition: (x, y) =>
    ipcRenderer.invoke('popup:set-position', { x: Number(x) || 0, y: Number(y) || 0 }),
  // Unhide the main window; pass true to also focus
  ensureVisible: (focus = false) => ipcRenderer.invoke('ui:ensure-visible', { focus }),
  // Clipboard history
  getClipboardHistory: () => ipcRenderer.invoke('clipboard:get-history'),
  clearClipboardHistory: () => ipcRenderer.invoke('clipboard:clear-history'),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:copy', text),
  deleteClipboardItem: (id) => ipcRenderer.invoke('clipboard:delete-item', id),
  openClipboardWindow: () => ipcRenderer.invoke('clipboard:open-window'),
  onClipboardHistoryUpdated: (cb) =>
    ipcRenderer.on('clipboard:history-updated', (_e, history) => cb(history)),
  getTheme: () => ipcRenderer.invoke('get-ui-theme'),
  showClipboardContextMenu: () => ipcRenderer.invoke('clipboard:show-context-menu'),
  // Snippet data persistence
  getSnippetData: () => ipcRenderer.invoke('snippet:get-data'),
  saveSnippetData: (data) => ipcRenderer.invoke('snippet:save-data', data),
});
