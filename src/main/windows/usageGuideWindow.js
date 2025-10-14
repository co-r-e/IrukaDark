const { BrowserWindow } = require('electron');
const path = require('path');
const { getMainWindow } = require('../context');

let usageGuideWindow = null;

function openUsageGuideWindow(options = {}) {
  const lang = String(options.lang || 'en');
  const theme = options.theme === 'light' ? 'light' : 'dark';

  if (usageGuideWindow && !usageGuideWindow.isDestroyed()) {
    try {
      usageGuideWindow.show();
      usageGuideWindow.focus();
    } catch {}
    try {
      usageGuideWindow.webContents.executeJavaScript(
        `window.IRUKADARK_USAGE_UPDATE && window.IRUKADARK_USAGE_UPDATE(${JSON.stringify(
          lang
        )}, ${JSON.stringify(theme)});`,
        true
      );
    } catch {}
    return usageGuideWindow;
  }

  const parent = getMainWindow();

  usageGuideWindow = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    modal: false,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    title: 'IrukaDark Usage Guide',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    usageGuideWindow.setMenuBarVisibility(false);
  } catch {}

  usageGuideWindow.on('closed', () => {
    usageGuideWindow = null;
  });

  const htmlPath = path.join(__dirname, '../../renderer/usage-guide.html');
  const query = new URLSearchParams({ lang, theme }).toString();

  usageGuideWindow
    .loadFile(htmlPath, { query })
    .then(() => {
      try {
        usageGuideWindow.show();
      } catch {}
    })
    .catch(() => {});

  return usageGuideWindow;
}

module.exports = {
  openUsageGuideWindow,
};
