const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getModel: () => ipcRenderer.invoke('get-model'),
  getUILanguage: () => ipcRenderer.invoke('get-ui-language'),
  getUITheme: () => ipcRenderer.invoke('get-ui-theme'),
  getGlassLevel: () => ipcRenderer.invoke('get-glass-level'),
  getWindowOpacity: () => ipcRenderer.invoke('get-window-opacity'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  aiGenerate: (prompt, options = {}) => ipcRenderer.invoke('ai:generate', { prompt, ...options }),
  aiGenerateWithImage: (prompt, imageBase64, mimeType = 'image/png', options = {}) =>
    ipcRenderer.invoke('ai:generate-with-image', { prompt, imageBase64, mimeType, ...options }),
  cancelAI: () => ipcRenderer.invoke('ai:cancel'),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (_e, lang) => callback(lang)),
  onWindowOpacityChanged: (callback) => ipcRenderer.on('window-opacity-changed', (_e, value) => callback(value)),
  onExplainClipboard: (callback) => ipcRenderer.on('explain-clipboard', (_e, text) => callback(text)),
  onExplainClipboardDetailed: (callback) => ipcRenderer.on('explain-clipboard-detailed', (_e, text) => callback(text)),
  onExplainClipboardError: (callback) => ipcRenderer.on('explain-clipboard-error', (_e, msg) => callback(msg)),
  onAccessibilityWarning: (callback) => ipcRenderer.on('accessibility-warning', (_e) => callback()),
  onShortcutRegistered: (callback) => ipcRenderer.on('shortcut-registered', (_e, accel) => callback(accel)),
  onShortcutDetailedRegistered: (callback) => ipcRenderer.on('shortcut-detailed-registered', (_e, accel) => callback(accel)),
  onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (_e, theme) => callback(theme)),
  // Show the current application menu as a context menu at given coordinates
  showAppMenu: (pos) => ipcRenderer.invoke('ui:show-app-menu', pos),
  onExplainScreenshot: (callback) => ipcRenderer.on('explain-screenshot', (_e, payload) => callback(payload)),
  onExplainScreenshotDetailed: (callback) => ipcRenderer.on('explain-screenshot-detailed', (_e, payload) => callback(payload))
});
