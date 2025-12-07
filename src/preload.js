/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getModel: () => ipcRenderer.invoke('get-model'),
  setModel: (model) => ipcRenderer.invoke('set-model', model),
  getWebSearchModel: () => ipcRenderer.invoke('get-web-search-model'),
  setWebSearchModel: (model) => ipcRenderer.invoke('set-web-search-model', model),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUILanguage: () => ipcRenderer.invoke('get-ui-language'),
  setUILanguage: (lang) => ipcRenderer.invoke('set-ui-language', lang),
  getUITheme: () => ipcRenderer.invoke('get-ui-theme'),
  setUITheme: (theme) => ipcRenderer.invoke('set-ui-theme', theme),
  // Tone (formal/casual)
  getTone: () => ipcRenderer.invoke('get-tone'),
  getGlassLevel: () => ipcRenderer.invoke('get-glass-level'),
  getWindowOpacity: () => ipcRenderer.invoke('get-window-opacity'),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),
  getPinAllSpaces: () => ipcRenderer.invoke('get-pin-all-spaces'),
  setPinAllSpaces: (enabled) => ipcRenderer.invoke('set-pin-all-spaces', enabled),
  getSyncPopupWithMain: () => ipcRenderer.invoke('get-sync-popup-with-main'),
  setSyncPopupWithMain: (enabled) => ipcRenderer.invoke('set-sync-popup-with-main', enabled),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  fetchUrlContent: (url, options = {}) =>
    ipcRenderer.invoke('url:fetch-content', { url, ...options }),
  aiGenerate: (prompt, options = {}) => ipcRenderer.invoke('ai:generate', { prompt, ...options }),
  aiGenerateWithImage: (prompt, imageBase64, mimeType = 'image/png', options = {}) =>
    ipcRenderer.invoke('ai:generate-with-image', { prompt, imageBase64, mimeType, ...options }),
  generateTerminalCommand: (prompt, options = {}) =>
    ipcRenderer.invoke('ai:generate-command', { prompt, ...options }),
  generateImageFromText: (prompt, options = {}) =>
    ipcRenderer.invoke('ai:generate-image-from-text', { prompt, ...options }),
  generateVideoFromText: (prompt, options = {}) =>
    ipcRenderer.invoke('ai:generate-video-from-text', { prompt, ...options }),
  // Cancel current in-flight AI request (shortcut-only)
  cancelAI: () => ipcRenderer.invoke('cancel-ai'),
  onLanguageChanged: (cb) => ipcRenderer.on('language-changed', (_e, lang) => cb(lang)),
  onWindowOpacityChanged: (cb) => ipcRenderer.on('window-opacity-changed', (_e, v) => cb(v)),
  onExplainClipboard: (cb) => ipcRenderer.on('explain-clipboard', (_e, t) => cb(t)),
  onExplainClipboardDetailed: (cb) =>
    ipcRenderer.on('explain-clipboard-detailed', (_e, t) => cb(t)),
  onTranslateClipboard: (cb) => ipcRenderer.on('translate-clipboard', (_e, t) => cb(t)),
  onRephraseClipboard: (cb) => ipcRenderer.on('rephrase-clipboard', (_e, t) => cb(t)),
  onExplainClipboardError: (cb) => ipcRenderer.on('explain-clipboard-error', (_e, msg) => cb(msg)),
  onReplyClipboard: (cb) => ipcRenderer.on('reply-clipboard-variations', (_e, t) => cb(t)),
  onSummarizeUrlContext: (cb) => ipcRenderer.on('summarize-url-context', (_e, url) => cb(url)),
  onSummarizeUrlContextDetailed: (cb) =>
    ipcRenderer.on('summarize-url-context-detailed', (_e, url) => cb(url)),
  onAccessibilityWarning: (cb) => ipcRenderer.on('accessibility-warning', () => cb()),
  onShortcutRegistered: (cb) => ipcRenderer.on('shortcut-registered', (_e, a) => cb(a)),
  onShortcutDetailedRegistered: (cb) =>
    ipcRenderer.on('shortcut-detailed-registered', (_e, a) => cb(a)),
  onShortcutTranslateRegistered: (cb) =>
    ipcRenderer.on('shortcut-translate-registered', (_e, a) => cb(a)),
  onShortcutReplyRegistered: (cb) => ipcRenderer.on('shortcut-reply-registered', (_e, a) => cb(a)),
  onShortcutUrlSummaryRegistered: (cb) =>
    ipcRenderer.on('shortcut-url-summary-registered', (_e, a) => cb(a)),
  onShortcutUrlDetailedRegistered: (cb) =>
    ipcRenderer.on('shortcut-url-detailed-registered', (_e, a) => cb(a)),
  onShortcutSlideImageRegistered: (cb) =>
    ipcRenderer.on('shortcut-slide-image-registered', (_e, a) => cb(a)),
  onGenerateSlideImage: (cb) => ipcRenderer.on('generate-slide-image', (_e, text) => cb(text)),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_e, theme) => cb(theme)),
  onToneChanged: (cb) => ipcRenderer.on('tone-changed', (_e, tone) => cb(tone)),
  onAppConfig: (cb) => ipcRenderer.on('app-config', (_e, cfg) => cb(cfg)),
  showAppMenu: (pos) => ipcRenderer.invoke('ui:show-app-menu', pos),
  onExplainScreenshot: (cb) => ipcRenderer.on('explain-screenshot', (_e, p) => cb(p)),
  onExplainScreenshotDetailed: (cb) =>
    ipcRenderer.on('explain-screenshot-detailed', (_e, p) => cb(p)),
  // Voice query events
  onVoiceQueryComplete: (cb) => ipcRenderer.on('voice-query-complete', (_e, p) => cb(p)),
  onVoiceOnlyComplete: (cb) => ipcRenderer.on('voice-only-complete', (_e, p) => cb(p)),
  onVoiceQueryError: (cb) => ipcRenderer.on('voice-query-error', (_e, err) => cb(err)),
  saveWebSearchSetting: (enabled) => ipcRenderer.invoke('save-web-search-setting', enabled),
  getWebSearchEnabled: () => ipcRenderer.invoke('get-web-search-enabled'),
  saveTranslateMode: (mode) => ipcRenderer.invoke('save-translate-mode', mode),
  getTranslateMode: () => ipcRenderer.invoke('get-translate-mode'),
  onTranslateModeChanged: (cb) => ipcRenderer.on('translate-mode-changed', (_e, mode) => cb(mode)),
  saveImageSize: (size) => ipcRenderer.invoke('save-image-size', size),
  getImageSize: () => ipcRenderer.invoke('get-image-size'),
  saveImageCount: (count) => ipcRenderer.invoke('save-image-count', count),
  getImageCount: () => ipcRenderer.invoke('get-image-count'),
  saveVideoAspectRatio: (ratio) => ipcRenderer.invoke('save-video-aspect-ratio', ratio),
  getVideoAspectRatio: () => ipcRenderer.invoke('get-video-aspect-ratio'),
  saveVideoDuration: (duration) => ipcRenderer.invoke('save-video-duration', duration),
  getVideoDuration: () => ipcRenderer.invoke('get-video-duration'),
  saveVideoCount: (count) => ipcRenderer.invoke('save-video-count', count),
  getVideoCount: () => ipcRenderer.invoke('get-video-count'),
  saveVideoResolution: (resolution) => ipcRenderer.invoke('save-video-resolution', resolution),
  getVideoResolution: () => ipcRenderer.invoke('get-video-resolution'),
  // Slide image settings
  saveSlideSize: (ratio) => ipcRenderer.invoke('save-slide-size', ratio),
  getSlideSize: () => ipcRenderer.invoke('get-slide-size'),
  saveSlideCount: (count) => ipcRenderer.invoke('save-slide-count', count),
  getSlideCount: () => ipcRenderer.invoke('get-slide-count'),
  // Slide template management
  getSlideTemplates: () => ipcRenderer.invoke('slide-template:get-all'),
  saveSlideTemplate: (template) => ipcRenderer.invoke('slide-template:save', template),
  deleteSlideTemplate: (id) => ipcRenderer.invoke('slide-template:delete', id),
  setActiveSlideTemplate: (id) => ipcRenderer.invoke('slide-template:set-active', id),
  selectSlideTemplateImage: () => ipcRenderer.invoke('slide-template:select-image'),
  // Image template management
  getImageTemplates: () => ipcRenderer.invoke('image-template:get-all'),
  saveImageTemplate: (template) => ipcRenderer.invoke('image-template:save', template),
  deleteImageTemplate: (id) => ipcRenderer.invoke('image-template:delete', id),
  setActiveImageTemplate: (id) => ipcRenderer.invoke('image-template:set-active', id),
  selectImageTemplateImage: () => ipcRenderer.invoke('image-template:select-image'),
  // Popup interactions
  notifyPopupPointer: (phase) => ipcRenderer.invoke('popup:pointer', String(phase || '')),
  getPopupBounds: () => ipcRenderer.invoke('popup:get-bounds'),
  setPopupPosition: (x, y) =>
    ipcRenderer.invoke('popup:set-position', { x: Number(x) || 0, y: Number(y) || 0 }),
  // Popup custom icon
  getCustomPopupIcon: () => ipcRenderer.invoke('popup-icon:get'),
  setCustomPopupIcon: (base64) => ipcRenderer.invoke('popup-icon:set', base64),
  resetCustomPopupIcon: () => ipcRenderer.invoke('popup-icon:reset'),
  selectPopupIconImage: () => ipcRenderer.invoke('popup-icon:select-image'),
  invalidatePopupShadow: () => ipcRenderer.invoke('popup-icon:invalidate-shadow'),
  onPopupIconChanged: (cb) => ipcRenderer.on('popup-icon-changed', (_e, icon) => cb(icon)),
  // Unhide the main window; pass true to also focus
  ensureVisible: (focus = false) => ipcRenderer.invoke('ui:ensure-visible', { focus }),
  // Set dragging state (for window level adjustment)
  setDragging: (isDragging) => ipcRenderer.invoke('ui:set-dragging', isDragging),
  // Clipboard history
  getClipboardHistory: () => ipcRenderer.invoke('clipboard:get-history'),
  clearClipboardHistory: () => ipcRenderer.invoke('clipboard:clear-history'),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:copy', text),
  deleteClipboardItem: (id) => ipcRenderer.invoke('clipboard:delete-item', id),
  startClipboardMonitoring: () => ipcRenderer.invoke('clipboard:start-monitoring'),
  stopClipboardMonitoring: () => ipcRenderer.invoke('clipboard:stop-monitoring'),
  getClipboardMonitoringStatus: () => ipcRenderer.invoke('clipboard:get-status'),
  onClipboardHistoryUpdated: (cb) =>
    ipcRenderer.on('clipboard:history-updated', (_e, history) => cb(history)),
  getTheme: () => ipcRenderer.invoke('get-ui-theme'),
  showClipboardContextMenu: () => ipcRenderer.invoke('clipboard:show-context-menu'),
  // Snippet operations
  getSnippetData: () => ipcRenderer.invoke('snippet:get-data'),
  saveSnippetData: (data) => ipcRenderer.invoke('snippet:save-data', data),
  selectImageFile: () => ipcRenderer.invoke('snippet:select-image-file'),
  saveSnippetImage: (snippetId, imageBase64) =>
    ipcRenderer.invoke('snippet:save-image', { snippetId, imageBase64 }),
  deleteSnippetImage: (imagePath) => ipcRenderer.invoke('snippet:delete-image', imagePath),
  copySnippetImage: (imagePath) => ipcRenderer.invoke('snippet:copy-image', imagePath),
  // Snippet export/import
  exportSnippets: () => ipcRenderer.invoke('snippet:export'),
  importSnippets: (mode) => ipcRenderer.invoke('snippet:import', { mode }),
  onSnippetExportProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('snippet:export-progress', handler);
    return handler;
  },
  removeSnippetExportProgress: () => {
    ipcRenderer.removeAllListeners('snippet:export-progress');
  },
  onSnippetImportProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('snippet:import-progress', handler);
    return handler;
  },
  removeSnippetImportProgress: () => {
    ipcRenderer.removeAllListeners('snippet:import-progress');
  },
  onSnippetImportStarted: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('snippet:import-started', handler);
    return handler;
  },
  removeSnippetImportStarted: () => {
    ipcRenderer.removeAllListeners('snippet:import-started');
  },
  // Launcher
  launcher: {
    searchApps: (query) => ipcRenderer.invoke('launcher:search-apps', query),
    launchApp: (appPath) => ipcRenderer.invoke('launcher:launch-app', appPath),
    searchFiles: (query) => ipcRenderer.invoke('launcher:search-files', query),
    openFile: (filePath) => ipcRenderer.invoke('launcher:open-file', filePath),
    searchSystemCommands: (query) => ipcRenderer.invoke('launcher:search-system-commands', query),
    executeSystemCommand: (commandId) =>
      ipcRenderer.invoke('launcher:execute-system-command', commandId),
  },
  // Schedule
  schedule: {
    selectApp: () => ipcRenderer.invoke('schedule:select-app'),
  },
  // Shortcut settings
  getShortcutAssignments: () => ipcRenderer.invoke('settings:get-shortcut-assignments'),
  saveShortcutAssignment: (action, key) =>
    ipcRenderer.invoke('settings:save-shortcut-assignment', action, key),
  validateShortcut: (key, excludeAction) =>
    ipcRenderer.invoke('settings:validate-shortcut', key, excludeAction),
  resetShortcutAssignments: () => ipcRenderer.invoke('settings:reset-shortcut-assignments'),
  // Gemini API Key
  getGeminiApiKey: () => ipcRenderer.invoke('settings:get-gemini-api-key'),
  saveGeminiApiKey: (apiKey) => ipcRenderer.invoke('settings:save-gemini-api-key', apiKey),
});

// Terminal API
contextBridge.exposeInMainWorld('api', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
});
