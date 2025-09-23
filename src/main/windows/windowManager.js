const { BrowserWindow, screen, shell } = require('electron');
const path = require('path');
const { setMainWindow, getMainWindow, setPopupWindow, getPopupWindow } = require('../context');

class WindowManager {
  constructor({ getPref, initialShowMain = true, initialPopupMarginRight = 0 }) {
    this.getPref = getPref;
    this.initialShowMain = initialShowMain;
    this.initialPopupMarginRight = initialPopupMarginRight;
    this.popupPointerDown = false;
    this.popupMovedSinceDown = false;
    this.popupDownBounds = null;
    this.mainInitiallyShown = false;
  }

  createMainWindow() {
    if (getMainWindow() && !getMainWindow().isDestroyed()) {
      return getMainWindow();
    }

    const baseOpts = {
      width: 260,
      height: 280,
      minWidth: 260,
      minHeight: 140,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      useContentSize: true,
      backgroundColor: '#00000000',
      focusable: true,
      resizable: true,
      show: false,
      icon: path.resolve(__dirname, '../../renderer/assets/icons/icon.png'),
      opacity: 1.0,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload.js'),
        enableRemoteModule: false,
        webSecurity: true,
        devTools: false,
      },
    };

    const mainWindow = new BrowserWindow(baseOpts);
    setMainWindow(mainWindow);

    try {
      mainWindow.setMinimumSize(260, 140);
    } catch {}

    this.wireExternalLinkHandling(mainWindow);
    this.applyPinAllSpaces(this.readPinAllSpacesPref());
    this.applySavedOpacity(mainWindow);
    this.positionMainWindow(mainWindow);

    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
    try {
      mainWindow.once('ready-to-show', () => {
        if (this.initialShowMain) {
          mainWindow.show();
          this.mainInitiallyShown = true;
        }
      });
    } catch {}

    mainWindow.webContents.once('did-finish-load', () => {
      try {
        this.createPopupWindow();
      } catch {}
    });

    const iconPath = path.resolve(__dirname, '../../renderer/assets/icons/icon.png');
    mainWindow.setIcon(iconPath);

    return mainWindow;
  }

  createPopupWindow() {
    const existing = getPopupWindow();
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return null;
    }

    const mainBounds = mainWindow.getBounds();
    const popupWidth = 84;
    const popupHeight = 84;
    const primary = screen.getPrimaryDisplay();
    const wa =
      primary && primary.workArea ? primary.workArea : { x: 0, y: 0, width: 1200, height: 800 };
    const popupX = Math.round(
      wa.x + wa.width - popupWidth - Math.max(0, this.initialPopupMarginRight)
    );
    const popupY = Math.round(wa.y + Math.max(0, Math.floor((wa.height - popupHeight) / 2)));
    const mainX = popupX + Math.round((popupWidth - mainBounds.width) / 2);
    const mainY = popupY - mainBounds.height + 10;

    const popupWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: popupX,
      y: popupY,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      useContentSize: true,
      backgroundColor: '#00000000',
      resizable: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload.js'),
        devTools: false,
      },
    });

    setPopupWindow(popupWindow);

    this.applyPinAllSpaces(this.readPinAllSpacesPref());

    popupWindow.loadFile(path.join(__dirname, '../../renderer/popup.html'));
    this.applySavedOpacity(popupWindow);
    mainWindow.setPosition(Math.round(mainX), Math.round(mainY));

    popupWindow.on('closed', () => {
      setPopupWindow(null);
    });

    const reposition = () => this.positionMainAbovePopup();
    popupWindow.on('move', () => {
      reposition();
      if (this.popupPointerDown) this.popupMovedSinceDown = true;
    });
    popupWindow.on('resize', reposition);
    reposition();

    return popupWindow;
  }

  bringAppToFront() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } catch {}
  }

  hasPopupWindow() {
    const popupWindow = getPopupWindow();
    return !!(popupWindow && !popupWindow.isDestroyed());
  }

  togglePopupWindow() {
    const popupWindow = getPopupWindow();
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.close();
      return;
    }
    this.createPopupWindow();
  }

  applyPinAllSpaces(enabled) {
    const mainWindow = getMainWindow();
    const popupWindow = getPopupWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, enabled ? 'screen-saver' : 'floating');
        if (process.platform === 'darwin') {
          mainWindow.setVisibleOnAllWorkspaces(!!enabled, { visibleOnFullScreen: !!enabled });
        }
      }
    } catch {}
    try {
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.setAlwaysOnTop(true, enabled ? 'screen-saver' : 'floating');
        if (process.platform === 'darwin') {
          popupWindow.setVisibleOnAllWorkspaces(!!enabled, { visibleOnFullScreen: !!enabled });
        }
      }
    } catch {}
  }

  setOpacityForWindows(opacity) {
    const mainWindow = getMainWindow();
    const popupWindow = getPopupWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setOpacity(opacity);
        try {
          mainWindow.webContents.send('window-opacity-changed', opacity);
        } catch {}
      }
    } catch {}
    try {
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.setOpacity(opacity);
        try {
          popupWindow.webContents.send('window-opacity-changed', opacity);
        } catch {}
      }
    } catch {}
  }

  handlePopupPointer(phase) {
    try {
      const p = String(phase || '').toLowerCase();
      const popupWindow = getPopupWindow();
      if (!popupWindow || popupWindow.isDestroyed()) return false;
      if (p === 'down') {
        this.popupPointerDown = true;
        this.popupMovedSinceDown = false;
        try {
          this.popupDownBounds = popupWindow.getBounds();
        } catch {
          this.popupDownBounds = null;
        }
        return true;
      }
      if (p === 'up') {
        const wasDown = this.popupPointerDown;
        this.popupPointerDown = false;
        let moved = !!this.popupMovedSinceDown;
        this.popupMovedSinceDown = false;
        try {
          if (this.popupDownBounds) {
            const cur = popupWindow.getBounds();
            if (cur && typeof cur.x === 'number' && typeof cur.y === 'number') {
              const same = cur.x === this.popupDownBounds.x && cur.y === this.popupDownBounds.y;
              moved = moved || !same ? moved : false;
            }
          }
        } catch {}
        this.popupDownBounds = null;
        if (wasDown && !moved) {
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            try {
              if (mainWindow.isVisible()) {
                mainWindow.hide();
              } else {
                mainWindow.show();
                mainWindow.focus();
              }
            } catch {}
          }
        }
        return true;
      }
    } catch {}
    return false;
  }

  getPopupBounds() {
    try {
      const popupWindow = getPopupWindow();
      if (popupWindow && !popupWindow.isDestroyed()) {
        return popupWindow.getBounds();
      }
    } catch {}
    return null;
  }

  setPopupPosition(pos) {
    try {
      const popupWindow = getPopupWindow();
      if (!popupWindow || popupWindow.isDestroyed()) return false;
      const x = Math.round(Number(pos?.x) || 0);
      const y = Math.round(Number(pos?.y) || 0);
      popupWindow.setPosition(x, y);
      return true;
    } catch {
      return false;
    }
  }

  applySavedOpacity(win) {
    const savedOpacity = parseFloat(
      this.getPref('WINDOW_OPACITY') || process.env.WINDOW_OPACITY || '1'
    );
    if (!Number.isNaN(savedOpacity)) {
      try {
        win.setOpacity(savedOpacity);
      } catch {}
    }
  }

  readPinAllSpacesPref() {
    return !['0', 'false', 'off'].includes(
      String(this.getPref('PIN_ALL_SPACES') || process.env.PIN_ALL_SPACES || '1').toLowerCase()
    );
  }

  positionMainWindow(mainWindow) {
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
  }

  positionMainAbovePopup() {
    try {
      const popupWindow = getPopupWindow();
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed() || !popupWindow || popupWindow.isDestroyed()) {
        return;
      }
      const popupBounds = popupWindow.getBounds();
      const mainBounds = mainWindow.getBounds();
      const gap = -10;
      let targetX = popupBounds.x + Math.round((popupBounds.width - mainBounds.width) / 2);
      let targetY = popupBounds.y - mainBounds.height - gap;
      const nearest = screen.getDisplayNearestPoint({ x: popupBounds.x, y: popupBounds.y });
      const wa = nearest.workArea;
      targetX = Math.min(Math.max(targetX, wa.x), wa.x + wa.width - mainBounds.width);
      targetY = Math.min(Math.max(targetY, wa.y), wa.y + wa.height - mainBounds.height);
      mainWindow.setPosition(Math.round(targetX), Math.round(targetY));
      if (!this.mainInitiallyShown && this.initialShowMain) {
        mainWindow.show();
        this.mainInitiallyShown = true;
      }
    } catch {}
  }

  wireExternalLinkHandling(mainWindow) {
    try {
      const isExternalHttpUrl = (u) => {
        try {
          return /^https?:\/\//i.test(String(u || ''));
        } catch {
          return false;
        }
      };
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalHttpUrl(url)) {
          try {
            shell.openExternal(url);
          } catch {}
          return { action: 'deny' };
        }
        return { action: 'allow' };
      });
      mainWindow.webContents.on('will-navigate', (e, url) => {
        if (isExternalHttpUrl(url)) {
          try {
            e.preventDefault();
          } catch {}
          try {
            shell.openExternal(url);
          } catch {}
        }
      });
    } catch {}
  }
}

module.exports = {
  WindowManager,
};
