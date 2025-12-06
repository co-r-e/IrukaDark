/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Receive state updates from main process (use once to prevent memory leaks)
  onRephraseLoading: (cb) => {
    const handler = () => cb();
    ipcRenderer.removeAllListeners('rephrase:loading');
    ipcRenderer.on('rephrase:loading', handler);
  },
  onRephraseResult: (cb) => {
    const handler = (_e, text) => cb(text);
    ipcRenderer.removeAllListeners('rephrase:result');
    ipcRenderer.on('rephrase:result', handler);
  },
  onRephraseError: (cb) => {
    const handler = (_e, message) => cb(message);
    ipcRenderer.removeAllListeners('rephrase:error');
    ipcRenderer.on('rephrase:error', handler);
  },

  // Actions from popup
  copyToClipboard: (text) => ipcRenderer.invoke('rephrase:copy', text),
  closePopup: () => ipcRenderer.invoke('rephrase:close'),

  // Get theme for styling
  getTheme: () => ipcRenderer.invoke('get-ui-theme'),
});
