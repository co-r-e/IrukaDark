const { getMainWindow, getPopupWindow } = require('../context');

class SettingsController {
  constructor({ windowManager, menuRefresher, setPref, getPref }) {
    this.windowManager = windowManager;
    this.menuRefresher = typeof menuRefresher === 'function' ? menuRefresher : () => {};
    this.setPref = setPref;
    this.getPref = getPref;
  }

  handleLanguageChange(language) {
    try {
      this.setPref('MENU_LANGUAGE', language);
    } catch {}
    this.broadcastToWindows('language-changed', language);
    this.menuRefresher();
  }

  handleThemeChange(theme) {
    const value = String(theme || 'dark');
    try {
      this.setPref('UI_THEME', value);
    } catch {}
    this.broadcastToWindows('theme-changed', value);
    this.menuRefresher();
  }

  handleToneChange(tone) {
    const v = String(tone || 'casual').toLowerCase() === 'formal' ? 'formal' : 'casual';
    try {
      this.setPref('TONE', v);
    } catch {}
    this.broadcastToWindows('tone-changed', v);
    this.menuRefresher();
  }

  handleWindowOpacityChange(opacity) {
    try {
      this.setPref('WINDOW_OPACITY', String(opacity));
    } catch {}
    this.windowManager.setOpacityForWindows(opacity);
    this.menuRefresher();
  }

  handlePinAllSpacesChange(enabled) {
    try {
      this.setPref('PIN_ALL_SPACES', enabled ? '1' : '0');
    } catch {}
    this.windowManager.applyPinAllSpaces(enabled);
    this.menuRefresher();
  }

  handleWebSearchToggle(enabled) {
    try {
      this.setPref('ENABLE_GOOGLE_SEARCH', enabled ? '1' : '0');
    } catch {}
    this.menuRefresher();
  }

  handleTranslateModeChange(mode) {
    const normalized = String(mode === 'free' ? 'free' : 'literal');
    try {
      this.setPref('TRANSLATE_MODE', normalized);
    } catch {}
    this.broadcastToWindows('translate-mode-changed', normalized);
    this.menuRefresher();
  }

  broadcastToWindows(channel, payload) {
    const mainWindow = getMainWindow();
    const popupWindow = getPopupWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
      }
    } catch {}
    try {
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.webContents.send(channel, payload);
      }
    } catch {}
  }
}

module.exports = { SettingsController };
