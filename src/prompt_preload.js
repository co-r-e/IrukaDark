/*!
 * IrukaDark Prompt Preload — small bridge for modal input dialog
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPrompt', {
  onInit: (cb) => ipcRenderer.on('prompt:init', (_e, payload) => { try { cb && cb(payload || {}); } catch {} }),
  submit: (value) => ipcRenderer.send('prompt:submit', { value: String(value ?? '') }),
  cancel: () => ipcRenderer.send('prompt:cancel')
});

