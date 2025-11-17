/**
 * Default keyboard shortcut assignments for IrukaDark
 * Shared between main and renderer processes
 *
 * @module shortcutDefaults
 */

/**
 * Default shortcut assignments (internal format uses "Alt" not "Option")
 * @type {Object.<string, string>}
 */
const DEFAULT_SHORTCUTS = {
  explain: 'Alt+A',
  explainDetailed: 'Alt+Shift+A',
  urlSummary: 'Alt+Q',
  urlDetailed: 'Alt+Shift+Q',
  translate: 'Alt+R',
  reply: 'Alt+T',
  screenshot: 'Alt+S',
  screenshotDetailed: 'Alt+Shift+S',
  moveToCursor: 'Alt+Z',
  resetPosition: 'Alt+Shift+Z',
  clipboardPopup: 'Command+Shift+V',
};

/**
 * System-reserved shortcuts that users should not be able to override
 * These are critical system or application shortcuts
 * @type {Array<string>}
 */
const RESERVED_SHORTCUTS = [
  // macOS system shortcuts
  'Command+Q', // Quit application
  'Command+W', // Close window
  'Command+Tab', // Application switcher
  'Command+Space', // Spotlight
  'Command+`', // Cycle through windows
  'Command+Shift+Q', // Logout
  'Command+Option+Esc', // Force quit

  // Application critical shortcuts
  'Command+,', // Preferences
  'Command+H', // Hide window
  'Command+M', // Minimize
];

/**
 * Shortcut format validation regex
 * Matches patterns like: "Command+A", "Control+Shift+X", "Alt+Command+D"
 * @type {RegExp}
 */
const SHORTCUT_FORMAT_REGEX = /^(Command|Control|Alt|Shift)(\+(Command|Control|Alt|Shift))*\+\w+$/;

/**
 * Maximum allowed length for shortcut strings (防止 DoS attacks)
 * @type {number}
 */
const MAX_SHORTCUT_LENGTH = 50;

/**
 * Maximum allowed length for action names
 * @type {number}
 */
const MAX_ACTION_LENGTH = 50;

/**
 * Check if a shortcut is reserved by the system
 * @param {string} shortcut - Shortcut string to check
 * @returns {boolean} True if shortcut is reserved
 */
function isReservedShortcut(shortcut) {
  return RESERVED_SHORTCUTS.includes(shortcut);
}

/**
 * Validate shortcut format
 * @param {string} shortcut - Shortcut string to validate
 * @returns {boolean} True if format is valid
 */
function isValidShortcutFormat(shortcut) {
  if (!shortcut || typeof shortcut !== 'string') return false;
  if (shortcut.length > MAX_SHORTCUT_LENGTH) return false;
  return SHORTCUT_FORMAT_REGEX.test(shortcut);
}

/**
 * Validate action name
 * @param {string} action - Action name to validate
 * @returns {boolean} True if action is valid
 */
function isValidAction(action) {
  if (!action || typeof action !== 'string') return false;
  if (action.length > MAX_ACTION_LENGTH) return false;
  return DEFAULT_SHORTCUTS.hasOwnProperty(action);
}

// Export for CommonJS (main process)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SHORTCUTS,
    RESERVED_SHORTCUTS,
    SHORTCUT_FORMAT_REGEX,
    MAX_SHORTCUT_LENGTH,
    MAX_ACTION_LENGTH,
    isReservedShortcut,
    isValidShortcutFormat,
    isValidAction,
  };
}

// Export for ES modules/renderer process (if needed)
if (typeof window !== 'undefined') {
  window.SHORTCUT_DEFAULTS = {
    DEFAULT_SHORTCUTS,
    RESERVED_SHORTCUTS,
    isReservedShortcut,
    isValidShortcutFormat,
    isValidAction,
  };
}
