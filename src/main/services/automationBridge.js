/*!
 * Platform-agnostic automation bridge.
 * Routes to platform-specific implementations (macOS/Windows).
 */

const platform = process.platform;

let bridge;

if (platform === 'darwin') {
  bridge = require('./macAutomationBridge');
} else if (platform === 'win32') {
  bridge = require('./winAutomationBridge');
} else {
  // Linux/other platforms: stub implementation
  bridge = {
    fetchSelectedText: async () => ({
      status: 'error',
      code: 'platform_not_supported',
      text: '',
    }),
    spawnClipboardPopup: async () => ({
      error: 'PLATFORM_NOT_SUPPORTED',
    }),
    isClipboardPopupActive: () => false,
    closeClipboardPopup: () => false,
    updateClipboardPopup: () => false,
    startClipboardDaemon: () => {},
    stopClipboardDaemon: () => {},
    isDaemonReady: () => false,
    getDaemonState: () => 'stopped',
    showClipboardPopupFast: async () => ({
      error: 'PLATFORM_NOT_SUPPORTED',
    }),
    hideClipboardPopupFast: () => false,
    isDaemonPopupShowing: () => false,
    setClipboardChangedHandler: () => {},
    setItemPastedHandler: () => {},
  };
}

module.exports = {
  fetchSelectedText: bridge.fetchSelectedText,
  spawnClipboardPopup: bridge.spawnClipboardPopup,
  isClipboardPopupActive: bridge.isClipboardPopupActive,
  closeClipboardPopup: bridge.closeClipboardPopup,
  updateClipboardPopup: bridge.updateClipboardPopup,
  startClipboardDaemon: bridge.startClipboardDaemon,
  stopClipboardDaemon: bridge.stopClipboardDaemon,
  isDaemonReady: bridge.isDaemonReady,
  getDaemonState: bridge.getDaemonState,
  showClipboardPopupFast: bridge.showClipboardPopupFast,
  hideClipboardPopupFast: bridge.hideClipboardPopupFast,
  isDaemonPopupShowing: bridge.isDaemonPopupShowing,
  setClipboardChangedHandler: bridge.setClipboardChangedHandler,
  setItemPastedHandler: bridge.setItemPastedHandler,
};
