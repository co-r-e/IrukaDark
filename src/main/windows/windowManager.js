const { BrowserWindow, shell } = require('electron');
const path = require('path');
const { setMainWindow, getMainWindow, setPopupWindow, getPopupWindow } = require('../context');
const {
  WINDOW_DIMENSIONS,
  WINDOW_OPTIONS,
  WINDOW_EVENTS,
  IPC_EVENTS,
  WINDOW_LEVELS,
} = require('./windowConfig');
const WindowPositioner = require('./WindowPositioner');

class WindowManager {
  constructor({ getPref, initialShowMain = true }) {
    this.getPref = getPref;
    this.initialShowMain = initialShowMain;
    this.popupPointerDown = false;
    this.popupMovedSinceDown = false;
    this.popupDownBounds = null;
    this.mainInitiallyShown = false;
    this.mainWindowWidth = WINDOW_DIMENSIONS.MAIN.DEFAULT_WIDTH;
    this.mainWindowHeight = WINDOW_DIMENSIONS.MAIN.DEFAULT_HEIGHT;
    this.isRepositioning = false;
    this.savedOpacity = WINDOW_OPTIONS.MAIN.DEFAULT_OPACITY;

    // Re-entry guard state for positionMainAbovePopup
    this.repositionPending = false;

    // Position calculator
    this.positioner = new WindowPositioner();
  }

  /**
   * Creates or returns the existing main application window
   *
   * @returns {BrowserWindow} The created or existing main window
   *
   * @description
   * Creates a frameless, transparent window positioned at the bottom right of the primary display.
   * If a main window already exists and is not destroyed, returns the existing instance.
   * Automatically sets up event listeners for resize, focus/blur, and external link handling.
   *
   * Window features:
   * - Frameless, transparent, always-on-top
   * - Resizable with minimum size constraints
   * - Context isolation enabled for security
   * - Positioned at bottom right of screen on creation
   *
   * @example
   * const mainWindow = windowManager.createMainWindow();
   * mainWindow.show();
   */
  createMainWindow() {
    if (getMainWindow() && !getMainWindow().isDestroyed()) {
      return getMainWindow();
    }

    const baseOpts = {
      width: WINDOW_DIMENSIONS.MAIN.DEFAULT_WIDTH,
      height: WINDOW_DIMENSIONS.MAIN.DEFAULT_HEIGHT,
      minWidth: WINDOW_DIMENSIONS.MAIN.MIN_WIDTH,
      minHeight: WINDOW_DIMENSIONS.MAIN.MIN_HEIGHT,
      alwaysOnTop: WINDOW_OPTIONS.MAIN.ALWAYS_ON_TOP,
      frame: WINDOW_OPTIONS.MAIN.FRAME,
      transparent: WINDOW_OPTIONS.MAIN.TRANSPARENT,
      useContentSize: true,
      backgroundColor: WINDOW_OPTIONS.MAIN.BACKGROUND_COLOR,
      focusable: WINDOW_OPTIONS.MAIN.FOCUSABLE,
      resizable: WINDOW_OPTIONS.MAIN.RESIZABLE,
      show: false,
      icon: path.resolve(__dirname, '../../renderer/assets/icons/icon.png'),
      opacity: WINDOW_OPTIONS.MAIN.DEFAULT_OPACITY,
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
      mainWindow.setMinimumSize(
        WINDOW_DIMENSIONS.MAIN.MIN_WIDTH,
        WINDOW_DIMENSIONS.MAIN.MIN_HEIGHT
      );
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
        this.positioner.resetOffset();
      } catch {}
    });

    // Handle focus/blur for opacity management
    mainWindow.on(WINDOW_EVENTS.FOCUS, () => {
      try {
        // Send opacity to renderer when focused
        mainWindow.webContents.send(IPC_EVENTS.OPACITY_CHANGED, this.savedOpacity);
      } catch {}
    });

    mainWindow.on(WINDOW_EVENTS.BLUR, () => {
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

    mainWindow.webContents.once(WINDOW_EVENTS.DID_FINISH_LOAD, () => {
      try {
        this.createPopupWindow();
      } catch {}
    });

    const iconPath = path.resolve(__dirname, '../../renderer/assets/icons/icon.png');
    mainWindow.setIcon(iconPath);

    return mainWindow;
  }

  /**
   * Creates or returns the existing popup logo window
   *
   * @returns {BrowserWindow|null} The created or existing popup window, or null if main window is invalid
   *
   * @description
   * Creates a small, frameless, non-resizable window displaying the IrukaDark logo.
   * If a popup window already exists and is not destroyed, focuses and returns it.
   * The popup is positioned below the main window with a slight overlap.
   *
   * Window features:
   * - Frameless, transparent, always-on-top
   * - Fixed size (84x84)
   * - Draggable to reposition main window
   * - Click to toggle main window visibility
   * - Skips taskbar
   *
   * @example
   * const popupWindow = windowManager.createPopupWindow();
   * if (popupWindow) {
   *   console.log('Popup created successfully');
   * }
   */
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

    const popupWidth = WINDOW_DIMENSIONS.POPUP.WIDTH;
    const popupHeight = WINDOW_DIMENSIONS.POPUP.HEIGHT;

    // Calculate initial positions for both windows
    const positions = this.positioner.calculateInitialPositions(
      this.mainWindowWidth,
      this.mainWindowHeight,
      popupWidth,
      popupHeight
    );

    const { mainX, mainY, popupX, popupY } = positions;

    const popupWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: popupX,
      y: popupY,
      alwaysOnTop: WINDOW_OPTIONS.POPUP.ALWAYS_ON_TOP,
      frame: WINDOW_OPTIONS.POPUP.FRAME,
      transparent: WINDOW_OPTIONS.POPUP.TRANSPARENT,
      useContentSize: true,
      backgroundColor: WINDOW_OPTIONS.POPUP.BACKGROUND_COLOR,
      resizable: WINDOW_OPTIONS.POPUP.RESIZABLE,
      skipTaskbar: WINDOW_OPTIONS.POPUP.SKIP_TASKBAR,
      minimizable: WINDOW_OPTIONS.POPUP.MINIMIZABLE,
      maximizable: WINDOW_OPTIONS.POPUP.MAXIMIZABLE,
      closable: WINDOW_OPTIONS.POPUP.CLOSABLE,
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

    popupWindow.on(WINDOW_EVENTS.CLOSED, () => {
      setPopupWindow(null);
    });

    // Position main window when popup moves
    // Direct call for responsive tracking (re-entry guard prevents issues)
    popupWindow.on(WINDOW_EVENTS.MOVE, () => {
      // Track movement state for click detection
      if (this.popupPointerDown) this.popupMovedSinceDown = true;

      // Immediate repositioning for responsive tracking
      this.positionMainAbovePopup();
    });

    popupWindow.on(WINDOW_EVENTS.RESIZE, () => {
      // Resize should trigger immediate repositioning
      this.positionMainAbovePopup();
    });

    // Initial positioning
    this.positionMainAbovePopup();

    return popupWindow;
  }

  /**
   * Brings the main application window to the front
   *
   * @description
   * Shows the main window if hidden and gives it focus.
   * Does nothing if the main window is destroyed or doesn't exist.
   *
   * @example
   * windowManager.bringAppToFront();
   */
  bringAppToFront() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } catch {}
  }

  /**
   * Check if a popup window exists and is valid
   *
   * @returns {boolean} True if popup window exists and is not destroyed
   *
   * @example
   * if (windowManager.hasPopupWindow()) {
   *   console.log('Popup is active');
   * }
   */
  hasPopupWindow() {
    const popupWindow = getPopupWindow();
    return !!(popupWindow && !popupWindow.isDestroyed());
  }

  /**
   * Toggle popup window visibility
   *
   * @description
   * Closes the popup window if it exists, otherwise creates it.
   * Useful for keyboard shortcuts or menu items.
   *
   * @example
   * // Toggle popup on shortcut
   * globalShortcut.register('CommandOrControl+Shift+L', () => {
   *   windowManager.togglePopupWindow();
   * });
   */
  togglePopupWindow() {
    const popupWindow = getPopupWindow();
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.close();
      return;
    }
    this.createPopupWindow();
  }

  /**
   * Apply "pin to all spaces/desktops" setting to both windows
   *
   * @param {boolean} enabled - True to pin windows to all workspaces
   *
   * @description
   * Sets the always-on-top level and workspace visibility for both main and popup windows.
   * When enabled, windows appear on all virtual desktops (macOS) and use screen-saver level.
   * When disabled, windows use floating level and stay on current workspace.
   *
   * @example
   * // Pin to all spaces
   * windowManager.applyPinAllSpaces(true);
   *
   * // Normal behavior
   * windowManager.applyPinAllSpaces(false);
   */
  applyPinAllSpaces(enabled) {
    const mainWindow = getMainWindow();
    const popupWindow = getPopupWindow();
    const level = enabled ? WINDOW_LEVELS.SCREEN_SAVER : WINDOW_LEVELS.FLOATING;

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, level);
        if (process.platform === 'darwin') {
          mainWindow.setVisibleOnAllWorkspaces(!!enabled, { visibleOnFullScreen: !!enabled });
        }
      }
    } catch {}
    try {
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.setAlwaysOnTop(true, level);
        if (process.platform === 'darwin') {
          popupWindow.setVisibleOnAllWorkspaces(!!enabled, { visibleOnFullScreen: !!enabled });
        }
      }
    } catch {}
  }

  /**
   * Set dragging state for main window z-order management
   *
   * @param {boolean} isDragging - True when starting drag, false when ending
   *
   * @description
   * Temporarily raises main window to highest level during drag to prevent it from
   * going behind other windows. Restores original level based on pin preference when done.
   *
   * @example
   * // Start dragging
   * windowManager.setDraggingState(true);
   *
   * // End dragging
   * windowManager.setDraggingState(false);
   */
  setDraggingState(isDragging) {
    const mainWindow = getMainWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // When dragging, temporarily set to highest level to prevent window from going behind
        if (isDragging) {
          mainWindow.setAlwaysOnTop(true, WINDOW_LEVELS.SCREEN_SAVER);
        } else {
          // Restore to original level based on pin preference
          const pinEnabled = this.readPinAllSpacesPref();
          const level = pinEnabled ? WINDOW_LEVELS.SCREEN_SAVER : WINDOW_LEVELS.FLOATING;
          mainWindow.setAlwaysOnTop(true, level);
        }
      }
    } catch (err) {
      console.error('Error setting dragging state:', err);
    }
  }

  /**
   * Set opacity for main window
   *
   * @param {number} opacity - Opacity value between 0 and 1
   *
   * @description
   * Updates the saved opacity value and sends it to the renderer process.
   * The renderer handles the actual opacity application.
   *
   * @example
   * // Set to 80% opacity
   * windowManager.setOpacityForWindows(0.8);
   */
  setOpacityForWindows(opacity) {
    this.savedOpacity = opacity; // Update saved opacity
    const mainWindow = getMainWindow();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Send opacity to renderer instead of using setOpacity()
        try {
          mainWindow.webContents.send(IPC_EVENTS.OPACITY_CHANGED, opacity);
        } catch {}
      }
    } catch {}
  }

  /**
   * Handle pointer events from popup window
   *
   * @param {string} phase - Pointer phase: 'down' or 'up'
   * @returns {boolean} True if handled successfully, false otherwise
   *
   * @description
   * Tracks pointer down/up events on the popup window to distinguish between
   * drag and click operations. Toggles main window visibility on click (no movement).
   *
   * Phase behavior:
   * - 'down': Records popup bounds for movement tracking
   * - 'up': Checks if popup moved; if not, toggles main window visibility
   *
   * @example
   * // From popup renderer process
   * electronAPI.notifyPopupPointer('down');  // On pointer down
   * electronAPI.notifyPopupPointer('up');    // On pointer up
   */
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

  /**
   * Get the current bounds of the popup window
   *
   * @returns {Object|null} Bounds object with x, y, width, height, or null if not available
   *
   * @description
   * Returns the popup window's position and size.
   * Returns null if the popup window doesn't exist or is destroyed.
   *
   * @example
   * const bounds = windowManager.getPopupBounds();
   * if (bounds) {
   *   console.log(`Popup is at (${bounds.x}, ${bounds.y})`);
   * }
   */
  getPopupBounds() {
    try {
      const popupWindow = getPopupWindow();
      if (popupWindow && !popupWindow.isDestroyed()) {
        return popupWindow.getBounds();
      }
    } catch {}
    return null;
  }

  /**
   * Set the position of the popup window
   *
   * @param {Object} pos - Position object
   * @param {number} pos.x - X coordinate
   * @param {number} pos.y - Y coordinate
   * @returns {boolean} True if position was set successfully
   *
   * @description
   * Moves the popup window to the specified coordinates.
   * Coordinates are rounded to integers automatically.
   *
   * @example
   * windowManager.setPopupPosition({ x: 100, y: 200 });
   */
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

  /**
   * Reset popup and main windows to their initial positions
   *
   * @returns {boolean} True if reset was successful
   *
   * @description
   * Moves both windows back to their default positions:
   * - Main window: bottom right of screen
   * - Popup: centered below main window with slight overlap
   *
   * Also resets the positioning offset cache and brings popup to front.
   *
   * @example
   * // Reset windows after user drags them around
   * windowManager.resetPopupToInitialPosition();
   */
  resetPopupToInitialPosition() {
    try {
      const popupWindow = getPopupWindow();
      const mainWindow = getMainWindow();
      if (!popupWindow || popupWindow.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) {
        return false;
      }

      // Window dimensions
      const popupWidth = WINDOW_DIMENSIONS.POPUP.WIDTH;
      const popupHeight = WINDOW_DIMENSIONS.POPUP.HEIGHT;

      // Calculate initial positions using positioner
      const positions = this.positioner.calculateInitialPositions(
        this.mainWindowWidth,
        this.mainWindowHeight,
        popupWidth,
        popupHeight
      );

      // Apply positions
      popupWindow.setPosition(positions.popupX, positions.popupY);
      mainWindow.setPosition(positions.mainX, positions.mainY);

      // Reset offset for recalculation on next popup move
      this.positioner.resetOffset();

      // Bring popup window to front
      if (!popupWindow.isVisible()) {
        popupWindow.show();
      }
      popupWindow.focus();

      return true;
    } catch (e) {
      console.error('[WindowManager] Failed to reset popup position:', e);
      return false;
    }
  }

  applySavedOpacity(win) {
    if (!win || win.isDestroyed?.()) return;
    if (win === getPopupWindow()) return;
    const defaultOpacity = WINDOW_OPTIONS.MAIN.DEFAULT_OPACITY;
    const savedOpacity = parseFloat(this.getPref('WINDOW_OPACITY') || defaultOpacity);
    if (!Number.isNaN(savedOpacity)) {
      this.savedOpacity = savedOpacity; // Store the opacity value
      try {
        // Send opacity to renderer instead of using setOpacity()
        win.webContents.send(IPC_EVENTS.OPACITY_CHANGED, savedOpacity);
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
      const [w, h] = mainWindow.getSize();
      const position = this.positioner.calculateMainWindowPosition(w, h);
      mainWindow.setPosition(position.x, position.y);
    } catch (error) {
      console.error('[WindowManager] Failed to position main window:', error);
    }
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

      // Calculate position using positioner
      const bounds = this.positioner.calculateMainAbovePopup(
        popupBounds,
        this.mainWindowWidth,
        this.mainWindowHeight
      );

      mainWindow.setBounds(bounds);

      if (!this.mainInitiallyShown && this.initialShowMain) {
        mainWindow.show();
        this.mainInitiallyShown = true;
      }
    } catch (error) {
      console.error('[WindowManager] Error positioning main window above popup:', error);
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
