/**
 * windowConfig.js - Window configuration constants
 * Central configuration file for all window-related dimensions and layout settings
 */

/**
 * Main and popup window dimensions
 */
const WINDOW_DIMENSIONS = {
  MAIN: {
    DEFAULT_WIDTH: 260,
    DEFAULT_HEIGHT: 280,
    MIN_WIDTH: 260,
    MIN_HEIGHT: 140,
  },
  POPUP: {
    WIDTH: 84,
    HEIGHT: 84,
  },
};

/**
 * Screen margins for window positioning
 * Used when positioning windows at screen edges
 */
const WINDOW_MARGINS = {
  RIGHT: 16,
  BOTTOM: 12,
};

/**
 * Layout configuration for window arrangement
 */
const WINDOW_LAYOUT = {
  // Negative value means windows overlap by this many pixels
  // Positive value means gap between windows
  POPUP_MAIN_OVERLAP: -10,
};

/**
 * Fallback screen dimensions
 * Used when screen detection fails
 */
const FALLBACK_SCREEN = {
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
};

/**
 * Window options and settings
 */
const WINDOW_OPTIONS = {
  MAIN: {
    FRAME: false,
    TRANSPARENT: true,
    ALWAYS_ON_TOP: true,
    BACKGROUND_COLOR: '#00000000',
    FOCUSABLE: true,
    RESIZABLE: true,
    DEFAULT_OPACITY: 1.0,
  },
  POPUP: {
    FRAME: false,
    TRANSPARENT: true,
    ALWAYS_ON_TOP: true,
    BACKGROUND_COLOR: '#00000000',
    RESIZABLE: false,
    SKIP_TASKBAR: true,
    MINIMIZABLE: false,
    MAXIMIZABLE: false,
    CLOSABLE: true,
  },
};

/**
 * Event names for window events
 */
const WINDOW_EVENTS = {
  READY_TO_SHOW: 'ready-to-show',
  DID_FINISH_LOAD: 'did-finish-load',
  CLOSED: 'closed',
  MOVE: 'move',
  RESIZE: 'resize',
  FOCUS: 'focus',
  BLUR: 'blur',
  WILL_NAVIGATE: 'will-navigate',
};

/**
 * IPC event names
 */
const IPC_EVENTS = {
  OPACITY_CHANGED: 'window-opacity-changed',
};

/**
 * Always-on-top levels for different modes
 */
const WINDOW_LEVELS = {
  FLOATING: 'floating',
  SCREEN_SAVER: 'screen-saver',
};

module.exports = {
  WINDOW_DIMENSIONS,
  WINDOW_MARGINS,
  WINDOW_LAYOUT,
  FALLBACK_SCREEN,
  WINDOW_OPTIONS,
  WINDOW_EVENTS,
  IPC_EVENTS,
  WINDOW_LEVELS,
};
