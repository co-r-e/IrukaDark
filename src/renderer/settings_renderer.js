/* global electronAPI */

// Constants
const TOAST_ANIMATION_DELAY = 10;
const TOAST_FADE_OUT_DURATION = 300;
const TOAST_DISPLAY_DURATION = 2000;
const MIN_SHORTCUT_PARTS = 2; // Modifier + Key
const KEY_CODE_LETTER_LENGTH = 4; // "KeyA", "KeyZ", etc.
const KEY_CODE_DIGIT_LENGTH = 6; // "Digit0", "Digit9", etc.
const IPC_TIMEOUT_MS = 5000; // Timeout for IPC calls (5 seconds)
const KEY_DEBOUNCE_MS = 100; // Debounce time for keyboard events

const MODIFIER_KEY_CODES = [
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
];

// Settings UI class for managing keyboard shortcut settings
class SettingsUI {
  constructor() {
    this.container = document.querySelector('.settings-content');
    this.i18n = null;
    this.currentLang = 'en';
    this.currentListening = null; // Currently listening shortcut action
    this.pendingShortcut = null; // Pending shortcut to be applied
    this.shortcuts = {};
    this.boundKeyHandler = null;
    this.boundClickHandler = null;
    this.assignmentInProgress = false; // Prevent concurrent shortcut assignments
    this.popupAbortController = null; // For automatic event listener cleanup
    this.lastKeyTime = 0; // For keyboard event debouncing

    // Default shortcut assignments (internal format uses "Alt")
    // Note: These are defined in src/shared/shortcutDefaults.js as well
    this.defaultShortcuts = {
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
      clipboardPopup: 'Alt+C',
    };

    this.init();
  }

  async init() {
    await this.initI18n();
    await this.loadShortcuts();
    this.render();
    this.bindEvents();
  }

  async initI18n() {
    try {
      // Get current language from main process
      if (window.electronAPI && window.electronAPI.getUILanguage) {
        this.currentLang = await window.electronAPI.getUILanguage();
      }

      // Get i18n data
      if (window.IRUKADARK_I18N && window.IRUKADARK_I18N[this.currentLang]) {
        this.i18n = window.IRUKADARK_I18N[this.currentLang];
      } else {
        // Fallback to English
        this.i18n = window.IRUKADARK_I18N['en'] || {};
      }
    } catch (err) {
      console.error('Error initializing i18n:', err);
      this.i18n = window.IRUKADARK_I18N['en'] || {};
    }
  }

  async loadShortcuts() {
    try {
      const assignments = await electronAPI.getShortcutAssignments();
      if (assignments && typeof assignments === 'object') {
        this.shortcuts = { ...this.defaultShortcuts, ...assignments };
      } else {
        throw new Error('Invalid shortcuts data received');
      }
    } catch (err) {
      console.error('Failed to load shortcut assignments:', err);
      this.shortcuts = { ...this.defaultShortcuts };

      // Notify user if i18n is available
      if (this.i18n && this.i18n.settings && this.i18n.settings.loadError) {
        this.showToast(this.i18n.settings.loadError, 'error');
      }
    }
  }

  /**
   * Escape HTML special characters to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} HTML-safe text
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Convert internal key format to display format for macOS
   * @param {string} key - Internal format (e.g., "Alt+A", "Command+Shift+X")
   * @returns {string} Display format (e.g., "Option+A", "⌘⇧X")
   */
  displayKey(key) {
    if (!key) return '';
    return key
      .replace(/\bAlt\b/g, 'Option')
      .replace(/\bControl\b/g, '⌃')
      .replace(/\bShift\b/g, '⇧')
      .replace(/\bCommand\b/g, '⌘')
      .replace(/\bCmd\b/g, '⌘');
  }

  /**
   * Convert display format to internal key format
   * @param {string} key - Display format (e.g., "Option+A", "⌘⇧X")
   * @returns {string} Internal format (e.g., "Alt+A", "Command+Shift+X")
   */
  normalizeKey(key) {
    if (!key) return '';
    return key
      .replace(/\bOption\b/gi, 'Alt')
      .replace(/⌃/g, 'Control')
      .replace(/⇧/g, 'Shift')
      .replace(/⌘/g, 'Command');
  }

  render() {
    if (!this.i18n || !this.i18n.settings) {
      console.error('i18n not loaded properly');
      return;
    }

    const t = this.i18n.settings;

    const html = `
      <div class="settings-section">
        <div class="settings-section-title" data-i18n="settings.shortcuts">
          ${t.shortcuts || 'Keyboard Shortcuts'}
        </div>
        ${this.renderShortcutItems()}
      </div>
    `;

    this.container.innerHTML = html;
  }

  renderShortcutItems() {
    if (!this.i18n || !this.i18n.settings) return '';

    const t = this.i18n.settings;
    const actions = Object.keys(this.shortcuts);

    return actions
      .map((action) => {
        const key = this.shortcuts[action];
        const label = (t.actions && t.actions[action]) || action;
        const displayKey = this.displayKey(key);

        // Escape all user-controlled content to prevent XSS
        const safeAction = this.escapeHtml(action);
        const safeLabel = this.escapeHtml(label);
        const safeDisplayKey = this.escapeHtml(displayKey);
        const safeChangeText = this.escapeHtml(t.change || 'Change');

        return `
        <div class="settings-item" data-action="${safeAction}">
          <div class="settings-item-label">${safeLabel}</div>
          <div class="settings-item-controls">
            <div class="shortcut-key-display" data-action="${safeAction}">
              ${safeDisplayKey}
            </div>
            <button class="change-key-btn" data-action="${safeAction}" data-i18n="settings.change">
              ${safeChangeText}
            </button>
          </div>
        </div>
      `;
      })
      .join('');
  }

  bindEvents() {
    // Remove old listeners to prevent duplicates
    this.unbindEvents();

    // Change button clicks
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.change-key-btn');
      if (btn && !btn.classList.contains('listening')) {
        const action = btn.getAttribute('data-action');
        this.startListening(action);
      }
    });

    // Keyboard listener for capturing shortcuts
    this.boundKeyHandler = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.boundKeyHandler, true);

    // Stop listening when clicking outside
    this.boundClickHandler = (e) => {
      if (this.currentListening && !e.target.closest('.settings-item-controls')) {
        this.stopListening();
      }
    };
    document.addEventListener('click', this.boundClickHandler);

    // Reset all shortcuts button
    const resetBtn = document.getElementById('resetAllShortcutsBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAllShortcuts());
    }
  }

  unbindEvents() {
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler, true);
      this.boundKeyHandler = null;
    }
    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler);
      this.boundClickHandler = null;
    }
  }

  startListening(action) {
    if (!this.i18n || !this.i18n.settings) return;

    // Stop any previous listening
    if (this.currentListening) {
      this.stopListening();
    }

    this.currentListening = action;
    this.pendingShortcut = null;

    // Show popup
    const popup = document.getElementById('shortcutChangePopup');
    if (!popup) return;

    // Set current label
    const currentLabel = popup.querySelector('.shortcut-change-label');
    if (currentLabel && this.i18n.settings.currentLabel) {
      currentLabel.textContent = this.i18n.settings.currentLabel + ':';
    }

    // Set current shortcut display
    const currentKeyDisplay = popup.querySelector('.shortcut-change-current-key');
    if (currentKeyDisplay) {
      currentKeyDisplay.textContent = this.displayKey(this.shortcuts[action]);
    }

    // Set instruction text
    const instruction = popup.querySelector('.shortcut-change-instruction');
    if (instruction && this.i18n.settings.popupInstruction) {
      instruction.textContent = this.i18n.settings.popupInstruction;
    }

    // Clear preview
    const preview = popup.querySelector('.shortcut-change-preview');
    if (preview) {
      preview.textContent = '';
    }

    // Set apply button text and disable it initially
    const applyBtn = popup.querySelector('.shortcut-change-apply-btn');
    if (applyBtn && this.i18n.settings.apply) {
      applyBtn.textContent = this.i18n.settings.apply;
      applyBtn.disabled = true;
    }

    // Show popup
    popup.style.display = 'block';

    // Add popup event handlers
    this.setupPopupHandlers(popup);
  }

  stopListening() {
    if (!this.currentListening) return;

    this.currentListening = null;
    this.pendingShortcut = null;

    // Hide popup
    const popup = document.getElementById('shortcutChangePopup');
    if (popup) {
      popup.style.display = 'none';
      // AbortController automatically cleans up all event listeners
      this.removePopupHandlers();
    }
  }

  /**
   * Setup popup event handlers using AbortController for automatic cleanup
   * Prevents memory leaks by ensuring all listeners are properly removed
   * @param {HTMLElement} popup - The popup element
   */
  setupPopupHandlers(popup) {
    // Create new AbortController for this popup session
    this.popupAbortController = new AbortController();
    const signal = this.popupAbortController.signal;

    // Close button - automatically cleaned up when signal aborts
    const closeBtn = popup.querySelector('.shortcut-change-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.stopListening(), { signal });
    }

    // Apply button - automatically cleaned up when signal aborts
    const applyBtn = popup.querySelector('.shortcut-change-apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener(
        'click',
        () => {
          if (this.pendingShortcut && this.currentListening) {
            this.assignShortcut(this.currentListening, this.pendingShortcut);
          }
        },
        { signal }
      );
    }
  }

  /**
   * Remove popup event handlers using AbortController
   * All event listeners added with the signal will be automatically removed
   */
  removePopupHandlers() {
    if (this.popupAbortController) {
      this.popupAbortController.abort();
      this.popupAbortController = null;
    }
  }

  /**
   * Convert KeyboardEvent.code to key character
   * Avoids issues with macOS Option key converting characters
   * @param {string} code - KeyboardEvent.code value
   * @returns {string|null} Key character or null if not supported
   */
  getKeyFromCode(code) {
    // Letter keys: KeyA -> A
    if (code.startsWith('Key') && code.length === KEY_CODE_LETTER_LENGTH) {
      return code.charAt(3).toUpperCase();
    }

    // Digit keys: Digit0 -> 0
    if (code.startsWith('Digit') && code.length === KEY_CODE_DIGIT_LENGTH) {
      return code.charAt(5);
    }

    // Arrow keys
    const arrowMap = {
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
    };
    if (arrowMap[code]) {
      return arrowMap[code];
    }

    // Special keys
    const specialMap = {
      Space: 'Space',
      Enter: 'Enter',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Escape: 'Escape',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backquote: '`',
    };
    if (specialMap[code]) {
      return specialMap[code];
    }

    // F keys: F1-F12
    if (code.match(/^F\d{1,2}$/)) {
      return code;
    }

    return null;
  }

  handleKeyDown(e) {
    // Only handle when listening
    if (!this.currentListening) return;

    // Debounce: Prevent rapid-fire events from key repeats
    const now = Date.now();
    if (now - this.lastKeyTime < KEY_DEBOUNCE_MS) {
      e.preventDefault();
      return;
    }
    this.lastKeyTime = now;

    // Ignore if in input/textarea (but not in settings)
    const target = e.target;
    if (
      !target.closest('#settingsContainer') &&
      !target.closest('#shortcutChangePopup') &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
    ) {
      return;
    }

    // Handle Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.stopListening();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Build shortcut from keyboard event
    const shortcut = this.buildShortcutFromEvent(e);
    this.updateShortcutPreview(shortcut);
  }

  /**
   * Build shortcut string from keyboard event
   * @param {KeyboardEvent} e - Keyboard event
   * @returns {string|null} Shortcut string (e.g., "Command+A") or null if invalid
   */
  buildShortcutFromEvent(e) {
    const parts = this.getModifierParts(e);
    const mainKey = this.getMainKey(e);

    if (mainKey) {
      parts.push(mainKey);
    }

    // Need at least modifier + key
    return parts.length >= MIN_SHORTCUT_PARTS ? parts.join('+') : null;
  }

  /**
   * Get modifier key parts from keyboard event
   * @param {KeyboardEvent} e - Keyboard event
   * @returns {string[]} Array of modifier key names
   */
  getModifierParts(e) {
    const parts = [];
    if (e.metaKey) parts.push('Command');
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    return parts;
  }

  /**
   * Get main key (non-modifier) from keyboard event
   * @param {KeyboardEvent} e - Keyboard event
   * @returns {string|null} Key character or null
   */
  getMainKey(e) {
    if (!e.code || MODIFIER_KEY_CODES.includes(e.code)) {
      return null;
    }
    return this.getKeyFromCode(e.code);
  }

  /**
   * Update shortcut preview and apply button state
   * @param {string|null} shortcut - Shortcut string or null
   */
  updateShortcutPreview(shortcut) {
    const popup = document.getElementById('shortcutChangePopup');
    if (!popup) return;

    const preview = popup.querySelector('.shortcut-change-preview');
    const applyBtn = popup.querySelector('.shortcut-change-apply-btn');

    if (shortcut) {
      // Valid shortcut: update preview and enable apply button
      this.pendingShortcut = shortcut;
      if (preview) {
        preview.textContent = this.displayKey(shortcut);
      }
      if (applyBtn) {
        applyBtn.disabled = false;
      }
    } else {
      // Invalid shortcut: clear preview and disable button
      this.pendingShortcut = null;
      if (preview) {
        preview.textContent = '';
      }
      if (applyBtn) {
        applyBtn.disabled = true;
      }
    }
  }

  async assignShortcut(action, shortcut) {
    if (!this.i18n || !this.i18n.settings) return;

    // Prevent concurrent assignments (Race condition protection)
    if (this.assignmentInProgress) {
      console.warn('Assignment already in progress, ignoring request');
      return;
    }

    this.assignmentInProgress = true;

    try {
      // Save shortcut with timeout protection
      const result = await Promise.race([
        electronAPI.saveShortcutAssignment(action, shortcut),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), IPC_TIMEOUT_MS)
        ),
      ]);

      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to save shortcut');
      }

      // Reload all shortcuts to reflect changes (including conflicts removed)
      await this.loadShortcuts();

      // Update all shortcut displays in UI
      for (const [act, key] of Object.entries(this.shortcuts)) {
        const keyDisplay = this.container.querySelector(
          `.shortcut-key-display[data-action="${act}"]`
        );
        if (keyDisplay) {
          keyDisplay.textContent = this.displayKey(key);
        }
      }

      // Show success message
      this.showToast(this.i18n.settings.saved || 'Shortcut saved', 'success');

      // Stop listening
      this.stopListening();
    } catch (err) {
      console.error('Failed to assign shortcut:', err);
      this.showToast(err.message || this.i18n.settings.invalidKey || 'Invalid key', 'error');
      this.stopListening();
    } finally {
      // Always release the lock
      this.assignmentInProgress = false;
    }
  }

  async resetAllShortcuts() {
    if (!this.i18n || !this.i18n.settings) return;

    // Use the existing confirmation overlay
    this.showConfirmation(
      this.i18n.settings.resetConfirmTitle || 'Reset Shortcuts',
      this.i18n.settings.resetConfirmMessage ||
        'All shortcuts will be reset to their default values. This action cannot be undone. Continue?',
      async () => {
        // Store current shortcuts for rollback in case of failure
        const previousShortcuts = { ...this.shortcuts };

        try {
          // Reset with timeout protection
          const result = await Promise.race([
            electronAPI.resetShortcutAssignments(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Request timeout')), IPC_TIMEOUT_MS)
            ),
          ]);

          if (!result || !result.success) {
            throw new Error(result?.error || 'Failed to reset shortcuts');
          }

          // Reload shortcuts
          await this.loadShortcuts();
          this.render();
          this.bindEvents();

          this.showToast(this.i18n.settings.saved || 'Settings saved', 'success');
        } catch (err) {
          console.error('Failed to reset shortcuts:', err);

          // Rollback to previous state on failure
          this.shortcuts = previousShortcuts;
          this.render();
          this.bindEvents();

          // Show appropriate error message
          const errorMsg =
            err.message === 'Request timeout'
              ? this.i18n.settings?.timeout || 'Request timed out. Please try again.'
              : this.i18n.settings?.resetFailed || this.i18n.errorOccurred || 'An error occurred';

          this.showToast(errorMsg, 'error');
        }
      }
    );
  }

  showConfirmation(title, message, onConfirm) {
    const overlay = document.getElementById('confirmationOverlay');
    const titleText = document.getElementById('confirmationTitleText');
    const messageText = document.getElementById('confirmationMessage');
    const confirmBtn = document.getElementById('confirmationConfirm');
    const cancelBtn = document.getElementById('confirmationCancel');

    if (!overlay || !titleText || !messageText || !confirmBtn || !cancelBtn) {
      // Fallback to native confirm
      if (confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
      return;
    }

    titleText.textContent = title;
    messageText.textContent = message;
    overlay.style.display = 'flex';

    const handleConfirm = () => {
      overlay.style.display = 'none';
      cleanup();
      onConfirm();
    };

    const handleCancel = () => {
      overlay.style.display = 'none';
      cleanup();
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.textContent = message;

    toast.appendChild(div);

    setTimeout(() => {
      div.classList.add('show');
    }, TOAST_ANIMATION_DELAY);

    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), TOAST_FADE_OUT_DURATION);
    }, TOAST_DISPLAY_DURATION);
  }

  destroy() {
    this.unbindEvents();
    this.stopListening();
  }
}

// Export for use in index.html tab switching logic
window.SettingsUI = SettingsUI;
