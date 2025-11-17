const { BrowserWindow, screen, shell } = require('electron');
const path = require('path');
const { setMainWindow, getMainWindow, setPopupWindow, getPopupWindow } = require('../context');

class WindowManager {
  constructor({ getPref, initialShowMain = true }) {
    this.getPref = getPref;
    this.initialShowMain = initialShowMain;
    this.popupPointerDown = false;
    this.popupMovedSinceDown = false;
    this.popupDownBounds = null;
    this.mainInitiallyShown = false;
    this.mainWindowWidth = 260;
    this.mainWindowHeight = 280;
    this.isRepositioning = false;
    this.mainPopupOffsetX = null;
    this.mainPopupOffsetY = null;
    this.savedOpacity = 1.0; // Store the user-configured opacity

    // Re-entry guard state for positionMainAbovePopup
    this.repositionPending = false;
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
      roundedCorners: true,
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

    // Update stored size when user manually resizes the window
    mainWindow.on('resize', () => {
      try {
        // Ignore resize events during programmatic repositioning
        if (this.isRepositioning) return;
        const [width, height] = mainWindow.getSize();
        this.mainWindowWidth = width;
        this.mainWindowHeight = height;
        // Reset offset when size changes so it's recalculated with new size
        this.mainPopupOffsetX = null;
        this.mainPopupOffsetY = null;
      } catch {}
    });

    // Handle focus/blur for opacity management
    mainWindow.on('focus', () => {
      try {
        // Send opacity to renderer when focused
        mainWindow.webContents.send('window-opacity-changed', this.savedOpacity);
      } catch {}
    });

    mainWindow.on('blur', () => {
      try {
        // No special handling needed
      } catch {}
    });

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

    const popupWidth = 84;
    const popupHeight = 84;
    const primary = screen.getPrimaryDisplay();
    const wa =
      primary && primary.workArea ? primary.workArea : { x: 0, y: 0, width: 1200, height: 800 };

    // Position main window at bottom right
    const marginRight = 16;
    const marginBottom = 12;
    const mainX = Math.round(wa.x + wa.width - this.mainWindowWidth - marginRight);
    const mainY = Math.round(wa.y + wa.height - this.mainWindowHeight - marginBottom);

    // Position popup centered below main window
    const popupX = Math.round(mainX + (this.mainWindowWidth - popupWidth) / 2);
    const popupY = Math.round(mainY + this.mainWindowHeight - 10);

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
    mainWindow.setPosition(Math.round(mainX), Math.round(mainY));

    popupWindow.on('closed', () => {
      setPopupWindow(null);
    });

    // Position main window when popup moves
    // Direct call for responsive tracking (re-entry guard prevents issues)
    popupWindow.on('move', () => {
      // Track movement state for click detection
      if (this.popupPointerDown) this.popupMovedSinceDown = true;

      // Immediate repositioning for responsive tracking
      this.positionMainAbovePopup();
    });

    popupWindow.on('resize', () => {
      // Resize should trigger immediate repositioning
      this.positionMainAbovePopup();
    });

    // Initial positioning
    this.positionMainAbovePopup();

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

  setDraggingState(isDragging) {
    const mainWindow = getMainWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // When dragging, temporarily set to highest level to prevent window from going behind
        if (isDragging) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        } else {
          // Restore to original level based on pin preference
          const pinEnabled = this.readPinAllSpacesPref();
          mainWindow.setAlwaysOnTop(true, pinEnabled ? 'screen-saver' : 'floating');
        }
      }
    } catch (err) {
      console.error('Error setting dragging state:', err);
    }
  }

  setOpacityForWindows(opacity) {
    this.savedOpacity = opacity; // Update saved opacity
    const mainWindow = getMainWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Send opacity to renderer instead of using setOpacity()
        try {
          mainWindow.webContents.send('window-opacity-changed', opacity);
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

  resetPopupToInitialPosition() {
    try {
      const popupWindow = getPopupWindow();
      const mainWindow = getMainWindow();
      if (!popupWindow || popupWindow.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) {
        return false;
      }

      // Get primary display work area
      const primary = screen.getPrimaryDisplay();
      const wa =
        primary && primary.workArea ? primary.workArea : { x: 0, y: 0, width: 1200, height: 800 };

      // Window dimensions
      const popupWidth = 84;
      const popupHeight = 84;
      const mainWidth = this.mainWindowWidth;
      const mainHeight = this.mainWindowHeight;

      // Layout constants
      const marginRight = 16;
      const marginBottom = 12;
      const gap = -10; // Negative value means windows overlap by 10px

      // Calculate main window position (bottom right corner)
      const totalHeight = mainHeight + popupHeight + gap;
      let mainX = wa.x + wa.width - mainWidth - marginRight;
      let mainY = wa.y + wa.height - totalHeight - marginBottom;

      // Constrain main window to screen bounds
      mainX = Math.min(Math.max(mainX, wa.x), wa.x + wa.width - mainWidth);
      mainY = Math.min(Math.max(mainY, wa.y), wa.y + wa.height - mainHeight);

      // Calculate popup position (centered below main window)
      let popupX = mainX + (mainWidth - popupWidth) / 2;
      let popupY = mainY + mainHeight + gap;

      // Constrain popup window to screen bounds
      popupX = Math.min(Math.max(popupX, wa.x), wa.x + wa.width - popupWidth);
      popupY = Math.min(Math.max(popupY, wa.y), wa.y + wa.height - popupHeight);

      // Apply positions
      popupWindow.setPosition(Math.round(popupX), Math.round(popupY));
      mainWindow.setPosition(Math.round(mainX), Math.round(mainY));

      // Reset offset for recalculation on next popup move
      this.mainPopupOffsetX = null;
      this.mainPopupOffsetY = null;

      // Bring popup window to front
      if (!popupWindow.isVisible()) {
        popupWindow.show();
      }
      popupWindow.focus();

      return true;
    } catch (e) {
      return false;
    }
  }

  applySavedOpacity(win) {
    if (!win || win.isDestroyed?.()) return;
    if (win === getPopupWindow()) return;
    const savedOpacity = parseFloat(this.getPref('WINDOW_OPACITY') || '1');
    if (!Number.isNaN(savedOpacity)) {
      this.savedOpacity = savedOpacity; // Store the opacity value
      try {
        // Send opacity to renderer instead of using setOpacity()
        win.webContents.send('window-opacity-changed', savedOpacity);
      } catch {}
    }
  }

  readPinAllSpacesPref() {
    return !['0', 'false', 'off'].includes(
      String(this.getPref('PIN_ALL_SPACES') || '1').toLowerCase()
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

  /**
   * Helper to get constrained bounds for a window on the nearest screen
   * @param {Object} popupBounds - Popup window bounds
   * @returns {Object} Screen work area
   */
  getConstrainedScreenBounds(popupBounds) {
    const nearest = screen.getDisplayNearestPoint({ x: popupBounds.x, y: popupBounds.y });
    return nearest.workArea;
  }

  /**
   * Position main window above popup window
   * Uses re-entry guard to prevent concurrent execution while allowing responsive tracking
   */
  positionMainAbovePopup() {
    // Re-entry guard: prevent concurrent execution
    if (this.isRepositioning) {
      this.repositionPending = true;
      return;
    }

    try {
      const popupWindow = getPopupWindow();
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed() || !popupWindow || popupWindow.isDestroyed()) {
        return;
      }

      this.isRepositioning = true;
      this.repositionPending = false;

      const popupBounds = popupWindow.getBounds();
      const mainWidth = this.mainWindowWidth;
      const mainHeight = this.mainWindowHeight;

      // Get screen bounds once (eliminates duplicate getDisplayNearestPoint calls)
      const workArea = this.getConstrainedScreenBounds(popupBounds);

      // Calculate target position
      let targetX, targetY;

      // First time: calculate and store the offset
      if (this.mainPopupOffsetX === null || this.mainPopupOffsetY === null) {
        const gap = -10; // Negative value means windows overlap by 10px
        targetX = popupBounds.x + Math.round((popupBounds.width - mainWidth) / 2);
        targetY = popupBounds.y - mainHeight - gap;

        // Apply screen bounds constraints
        targetX = Math.min(Math.max(targetX, workArea.x), workArea.x + workArea.width - mainWidth);
        targetY = Math.min(
          Math.max(targetY, workArea.y),
          workArea.y + workArea.height - mainHeight
        );

        // Store the offset (main position relative to popup position)
        this.mainPopupOffsetX = targetX - popupBounds.x;
        this.mainPopupOffsetY = targetY - popupBounds.y;
      } else {
        // Use stored offset to maintain fixed distance
        targetX = popupBounds.x + this.mainPopupOffsetX;
        targetY = popupBounds.y + this.mainPopupOffsetY;

        // Apply screen bounds constraints
        targetX = Math.min(Math.max(targetX, workArea.x), workArea.x + workArea.width - mainWidth);
        targetY = Math.min(
          Math.max(targetY, workArea.y),
          workArea.y + workArea.height - mainHeight
        );
      }

      mainWindow.setBounds({
        x: Math.round(targetX),
        y: Math.round(targetY),
        width: mainWidth,
        height: mainHeight,
      });

      if (!this.mainInitiallyShown && this.initialShowMain) {
        mainWindow.show();
        this.mainInitiallyShown = true;
      }
    } catch (error) {
      console.error('Error positioning main window above popup:', error);
    } finally {
      this.isRepositioning = false;

      // If another reposition was requested while we were executing, run it now
      if (this.repositionPending) {
        this.repositionPending = false;
        // Use setImmediate to avoid deep recursion
        setImmediate(() => this.positionMainAbovePopup());
      }
    }
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
