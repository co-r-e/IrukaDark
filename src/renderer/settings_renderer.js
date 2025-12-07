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
    this.hiddenShortcutActions = new Set(['reply']);
    this.languageChangeHandler = null; // Language change event handler
    this.themeChangeHandler = null; // Theme change event handler
    this.opacityChangeHandler = null; // Opacity change event handler

    // Appearance settings
    this.currentTheme = 'dark';
    this.currentOpacity = 1;
    this.syncPopupWithMain = false;
    this.customPopupIcon = null;

    // Language list for settings
    this.languageList = [
      { code: 'en', label: 'English' },
      { code: 'ja', label: '日本語' },
      { code: 'es', label: 'Español' },
      { code: 'es-419', label: 'Español (Latinoamérica)' },
      { code: 'zh-Hans', label: '简体中文' },
      { code: 'zh-Hant', label: '繁體中文' },
      { code: 'pt-BR', label: 'Português (Brasil)' },
      { code: 'fr', label: 'Français' },
      { code: 'de', label: 'Deutsch' },
      { code: 'ru', label: 'Русский' },
      { code: 'ko', label: '한국어' },
      { code: 'id', label: 'Bahasa Indonesia' },
      { code: 'vi', label: 'Tiếng Việt' },
      { code: 'th', label: 'ไทย' },
      { code: 'it', label: 'Italiano' },
      { code: 'tr', label: 'Türkçe' },
    ];

    // Opacity options (50% to 100%)
    this.opacityOptions = [
      { value: 0.5, label: '50%' },
      { value: 0.6, label: '60%' },
      { value: 0.7, label: '70%' },
      { value: 0.8, label: '80%' },
      { value: 0.9, label: '90%' },
      { value: 1.0, label: '100%' },
    ];

    // Default shortcut assignments (internal format uses "Alt")
    // Note: These are defined in src/shared/shortcutDefaults.js as well
    this.defaultShortcuts = {
      explain: 'Alt+A',
      explainDetailed: 'Alt+Shift+A',
      slideImage: 'Control+Alt+A',
      urlSummary: 'Alt+Q',
      urlDetailed: 'Alt+Shift+Q',
      translate: 'Alt+R',
      reply: 'Alt+T',
      screenshot: 'Alt+S',
      screenshotDetailed: 'Alt+Shift+S',
      moveToCursor: 'Alt+Z',
      resetPosition: 'Alt+Shift+Z',
      clipboardPopup: 'Command+Shift+V',
      snippetPopup: 'Alt+Shift+V',
      toggleMainWindow: 'Alt+Space',
    };

    this.init();
  }

  async init() {
    await this.initI18n();
    await this.loadShortcuts();
    await this.loadAppearanceSettings();
    this.render();
    this.bindEvents();
    this.setupLanguageChangeListener();
    this.setupThemeChangeListener();
    this.setupOpacityChangeListener();
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
      this.shortcuts = { ...this.defaultShortcuts };

      // Notify user if i18n is available
      if (this.i18n && this.i18n.settings && this.i18n.settings.loadError) {
        this.showToast(this.i18n.settings.loadError, 'error');
      }
    }
  }

  async loadAppearanceSettings() {
    try {
      if (window.electronAPI) {
        // Load theme
        if (window.electronAPI.getUITheme) {
          this.currentTheme = (await window.electronAPI.getUITheme()) || 'dark';
        }
        // Load opacity
        if (window.electronAPI.getWindowOpacity) {
          const opacity = await window.electronAPI.getWindowOpacity();
          this.currentOpacity = parseFloat(opacity) || 1;
        }
        // Load sync popup with main setting
        if (window.electronAPI.getSyncPopupWithMain) {
          this.syncPopupWithMain = await window.electronAPI.getSyncPopupWithMain();
        }
        // Load custom popup icon
        if (window.electronAPI.getCustomPopupIcon) {
          this.customPopupIcon = await window.electronAPI.getCustomPopupIcon();
        }
      }
    } catch (err) {}
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
      return;
    }

    const t = this.i18n.settings;

    const html = `
      ${this.renderUpdatesSection()}
      ${this.renderLanguageSection()}
      ${this.renderAppearanceSection()}
      ${this.renderSnippetsSection()}
      <div class="settings-section">
        <div class="settings-section-title" data-i18n="settings.shortcuts">
          ${t.shortcuts || 'Keyboard Shortcuts'}
        </div>
        ${this.renderShortcutItems()}
      </div>
      ${this.renderFooterSection()}
    `;

    this.container.innerHTML = html;
  }

  renderUpdatesSection() {
    const t = this.i18n.settings;

    return `
      <div class="settings-section">
        <div class="settings-section-title">
          ${this.escapeHtml(t.updates || 'Updates')}
        </div>

        <div class="settings-item">
          <div class="settings-item-controls">
            <button id="checkForUpdatesBtn" class="settings-btn">
              ${this.escapeHtml(t.startUpdate || 'Start Update')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderAppearanceSection() {
    const t = this.i18n.settings;

    return `
      <div class="settings-section">
        <div class="settings-section-title">
          ${this.escapeHtml(t.appearance || 'Appearance')}
        </div>

        <!-- Theme -->
        <div class="settings-item">
          <div class="settings-item-label">${this.escapeHtml(t.theme || 'Theme')}</div>
          <div class="settings-item-controls">
            <select id="themeSelect" class="settings-select">
              <option value="light" ${this.currentTheme === 'light' ? 'selected' : ''}>
                ${this.escapeHtml(t.themeLight || 'Light')}
              </option>
              <option value="dark" ${this.currentTheme === 'dark' ? 'selected' : ''}>
                ${this.escapeHtml(t.themeDark || 'Dark')}
              </option>
            </select>
          </div>
        </div>

        <!-- Window Opacity -->
        <div class="settings-item">
          <div class="settings-item-label">${this.escapeHtml(t.windowOpacity || 'Window Opacity')}</div>
          <div class="settings-item-controls">
            <select id="opacitySelect" class="settings-select">
              ${this.opacityOptions
                .map(
                  (opt) => `
                <option value="${opt.value}" ${Math.abs(this.currentOpacity - opt.value) < 0.05 ? 'selected' : ''}>
                  ${this.escapeHtml(opt.label)}
                </option>
              `
                )
                .join('')}
            </select>
          </div>
        </div>

        <!-- Sync Popup with Main Window -->
        <div class="settings-item">
          <div class="settings-item-label">${this.escapeHtml(t.syncPopupWithMain || 'Toggle Logo Popup with Main Window')}</div>
          <div class="settings-item-controls">
            <label class="settings-toggle">
              <input type="checkbox" id="syncPopupToggle" ${this.syncPopupWithMain ? 'checked' : ''}>
              <span class="settings-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Custom Popup Icon -->
        <div class="settings-item">
          <div class="settings-item-label">${this.escapeHtml(t.popupIcon || 'Logo Popup Icon')}</div>
          <div class="settings-item-controls popup-icon-controls">
            <div class="popup-icon-preview-container">
              <img src="${this.customPopupIcon ? this.escapeHtml(this.customPopupIcon) : 'assets/icons/irukadark_logo.svg'}" class="popup-icon-preview" alt="Popup icon">
            </div>
            <div class="popup-icon-actions">
              <button id="selectPopupIconBtn" class="settings-btn settings-btn-secondary">
                ${this.escapeHtml(t.popupIconChange || 'Change')}
              </button>
              ${
                this.customPopupIcon
                  ? `<button id="resetPopupIconBtn" class="settings-btn settings-btn-danger-outline">
                  ${this.escapeHtml(t.popupIconReset || 'Reset')}
                </button>`
                  : ''
              }
            </div>
          </div>
          <div class="popup-icon-hint">${this.escapeHtml(t.popupIconHint || 'Recommended: 70x70px')}</div>
        </div>
      </div>
    `;
  }

  renderLanguageSection() {
    const t = this.i18n.settings;

    return `
      <div class="settings-section">
        <div class="settings-section-title">
          ${this.escapeHtml(t.language || 'Language')}
        </div>

        <div class="settings-item">
          <div class="settings-item-label">${this.escapeHtml(t.language || 'Language')}</div>
          <div class="settings-item-controls">
            <select id="languageSelect" class="settings-select">
              ${this.languageList
                .map(
                  (lang) => `
                <option value="${lang.code}" ${this.currentLang === lang.code ? 'selected' : ''}>
                  ${this.escapeHtml(lang.label)}
                </option>
              `
                )
                .join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  renderSnippetsSection() {
    const t = this.i18n.settings;
    return `
      <div class="settings-section">
        <div class="settings-section-title">
          ${this.escapeHtml(t.snippetsTitle || 'Snippets')}
        </div>
        <div class="settings-item snippet-buttons-vertical">
          <button id="exportSnippetsBtn" class="snippet-action-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            ${this.escapeHtml(t.snippetsExport || 'Export')}
          </button>
          <button id="importSnippetsBtn" class="snippet-action-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ${this.escapeHtml(t.snippetsImport || 'Import')}
          </button>
        </div>
      </div>
    `;
  }

  renderShortcutItems() {
    if (!this.i18n || !this.i18n.settings) return '';

    const t = this.i18n.settings;
    const actions = Object.keys(this.shortcuts).filter(
      (action) => !this.hiddenShortcutActions.has(action)
    );

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

  renderFooterSection() {
    return `
      <div class="settings-footer">
        <a href="#" class="settings-footer-link" data-url="https://co-r-e.net">Company</a>
        <span class="settings-footer-separator">|</span>
        <a href="#" class="settings-footer-link" data-url="https://x.com/okuwaki_m">Developer</a>
      </div>
    `;
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

    // Check for updates button
    const checkUpdatesBtn = document.getElementById('checkForUpdatesBtn');
    if (checkUpdatesBtn) {
      checkUpdatesBtn.addEventListener('click', () => this.handleCheckForUpdates());
    }

    // Theme select
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => this.handleThemeSelect(e.target.value));
    }

    // Opacity select
    const opacitySelect = document.getElementById('opacitySelect');
    if (opacitySelect) {
      opacitySelect.addEventListener('change', (e) =>
        this.handleOpacitySelect(parseFloat(e.target.value))
      );
    }

    // Sync popup with main toggle
    const syncPopupToggle = document.getElementById('syncPopupToggle');
    if (syncPopupToggle) {
      syncPopupToggle.addEventListener('change', (e) =>
        this.handleSyncPopupToggle(e.target.checked)
      );
    }

    // Popup icon select button
    const selectPopupIconBtn = document.getElementById('selectPopupIconBtn');
    if (selectPopupIconBtn) {
      selectPopupIconBtn.addEventListener('click', () => this.handleSelectPopupIcon());
    }

    // Popup icon reset button
    const resetPopupIconBtn = document.getElementById('resetPopupIconBtn');
    if (resetPopupIconBtn) {
      resetPopupIconBtn.addEventListener('click', () => this.handleResetPopupIcon());
    }

    // Language select
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => this.handleLanguageSelect(e.target.value));
    }

    // Snippet export button
    const exportSnippetsBtn = document.getElementById('exportSnippetsBtn');
    if (exportSnippetsBtn) {
      exportSnippetsBtn.addEventListener('click', () => this.handleExportSnippets());
    }

    // Snippet import button
    const importSnippetsBtn = document.getElementById('importSnippetsBtn');
    if (importSnippetsBtn) {
      importSnippetsBtn.addEventListener('click', () => this.handleImportSnippets());
    }

    // Footer links (open external URLs)
    const footerLinks = this.container.querySelectorAll('.settings-footer-link');
    footerLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('data-url');
        if (url && window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(url);
        }
      });
    });
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

  /**
   * Setup language change listener for real-time UI updates
   */
  setupLanguageChangeListener() {
    if (window.electronAPI && window.electronAPI.onLanguageChanged) {
      // Store the listener reference for cleanup
      this.languageChangeHandler = async (lang) => {
        await this.updateLanguage(lang);
      };
      window.electronAPI.onLanguageChanged(this.languageChangeHandler);
    }
  }

  /**
   * Update UI language when language changes
   * @param {string} lang - New language code
   */
  async updateLanguage(lang) {
    try {
      // Update current language
      this.currentLang = lang || 'en';

      // Update i18n data
      if (window.IRUKADARK_I18N && window.IRUKADARK_I18N[this.currentLang]) {
        this.i18n = window.IRUKADARK_I18N[this.currentLang];
      } else {
        // Fallback to English
        this.i18n = window.IRUKADARK_I18N['en'] || {};
      }

      // Re-render the UI with new language
      this.render();
      this.bindEvents();
    } catch (err) {}
  }

  /**
   * Setup theme change listener for real-time UI updates
   */
  setupThemeChangeListener() {
    if (window.electronAPI && window.electronAPI.onThemeChanged) {
      this.themeChangeHandler = (theme) => {
        this.currentTheme = theme || 'dark';
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
          themeSelect.value = this.currentTheme;
        }
      };
      window.electronAPI.onThemeChanged(this.themeChangeHandler);
    }
  }

  /**
   * Setup opacity change listener for real-time UI updates
   */
  setupOpacityChangeListener() {
    if (window.electronAPI && window.electronAPI.onWindowOpacityChanged) {
      this.opacityChangeHandler = (opacity) => {
        this.currentOpacity = parseFloat(opacity) || 1;
        const opacitySelect = document.getElementById('opacitySelect');
        if (opacitySelect) {
          // Find the closest option value
          const closest = this.opacityOptions.find(
            (opt) => Math.abs(opt.value - this.currentOpacity) < 0.05
          );
          if (closest) {
            opacitySelect.value = closest.value;
          }
        }
      };
      window.electronAPI.onWindowOpacityChanged(this.opacityChangeHandler);
    }
  }

  /**
   * Handle check for updates button click
   */
  async handleCheckForUpdates() {
    const btn = document.getElementById('checkForUpdatesBtn');
    const t = this.i18n.settings;

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = t.checking || 'Checking...';
      }

      if (window.electronAPI && window.electronAPI.checkForUpdates) {
        await window.electronAPI.checkForUpdates();
      }
    } catch (err) {
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = t.startUpdate || 'Start Update';
      }
    }
  }

  /**
   * Handle theme selection change
   * @param {string} theme - Selected theme ('light' or 'dark')
   */
  async handleThemeSelect(theme) {
    try {
      if (window.electronAPI && window.electronAPI.setUITheme) {
        await window.electronAPI.setUITheme(theme);
        this.currentTheme = theme;
        this.showToast(this.i18n.settings.settingSaved || 'Setting saved', 'success');
      }
    } catch (err) {
      this.showToast(this.i18n.errorOccurred || 'An error occurred', 'error');
    }
  }

  /**
   * Handle opacity selection change
   * @param {number} opacity - Selected opacity (0.1 to 1.0)
   */
  async handleOpacitySelect(opacity) {
    try {
      if (window.electronAPI && window.electronAPI.setWindowOpacity) {
        await window.electronAPI.setWindowOpacity(opacity);
        this.currentOpacity = opacity;
        this.showToast(this.i18n.settings.settingSaved || 'Setting saved', 'success');
      }
    } catch (err) {
      this.showToast(this.i18n.errorOccurred || 'An error occurred', 'error');
    }
  }

  /**
   * Handle sync popup with main window toggle
   * @param {boolean} enabled - Whether to sync popup with main window
   */
  async handleSyncPopupToggle(enabled) {
    try {
      if (window.electronAPI && window.electronAPI.setSyncPopupWithMain) {
        await window.electronAPI.setSyncPopupWithMain(enabled);
        this.syncPopupWithMain = enabled;
        this.showToast(this.i18n.settings.settingSaved || 'Setting saved', 'success');
      }
    } catch (err) {
      this.showToast(this.i18n.errorOccurred || 'An error occurred', 'error');
    }
  }

  /**
   * Update popup icon state and refresh UI
   * @param {string|null} icon - Base64 data URL or null
   * @private
   */
  updatePopupIconUI(icon) {
    this.customPopupIcon = icon;
    this.render();
    this.bindEvents();
    this.showToast(this.i18n.settings.settingSaved || 'Setting saved', 'success');
  }

  /**
   * Handle popup icon selection
   */
  async handleSelectPopupIcon() {
    try {
      const result = await window.electronAPI.selectPopupIconImage();
      if (!result) return;

      const saveResult = await window.electronAPI.setCustomPopupIcon(result.base64);
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save');
      }
      this.updatePopupIconUI(result.base64);
    } catch (err) {
      this.showToast(this.i18n.errorOccurred || 'An error occurred', 'error');
    }
  }

  /**
   * Handle popup icon reset to default
   */
  async handleResetPopupIcon() {
    try {
      const result = await window.electronAPI.resetCustomPopupIcon();
      if (!result.success) {
        throw new Error('Failed to reset');
      }
      this.updatePopupIconUI(null);
    } catch (err) {
      this.showToast(this.i18n.errorOccurred || 'An error occurred', 'error');
    }
  }

  /**
   * Handle language selection change
   * @param {string} lang - Selected language code
   */
  async handleLanguageSelect(lang) {
    try {
      if (window.electronAPI && window.electronAPI.setUILanguage) {
        await window.electronAPI.setUILanguage(lang);
        // Note: updateLanguage will be triggered by the language-changed event
        this.showToast(this.i18n.settings.settingSaved || 'Setting saved', 'success');
      }
    } catch (err) {
      this.showToast(this.i18n.errorOccurred || 'An error occurred', 'error');
    }
  }

  /**
   * Handle export snippets button click
   */
  async handleExportSnippets() {
    const t = this.i18n.settings;
    this.showSnippetProgress(t.snippetsExporting || 'Exporting...');

    // Remove previous listeners to prevent memory leak
    window.electronAPI?.removeSnippetExportProgress?.();
    window.electronAPI?.onSnippetExportProgress?.((data) => {
      this.updateSnippetProgress(data.current, data.total);
    });

    try {
      const result = await window.electronAPI.exportSnippets();
      this.hideSnippetProgress();

      if (result.success) {
        const msg =
          typeof t.snippetsExportSuccess === 'function'
            ? t.snippetsExportSuccess(result.count)
            : `Exported ${result.count} snippets`;
        this.showToast(msg, 'success');
      } else if (!result.canceled) {
        // Handle specific error cases
        if (result.error === 'NO_SNIPPETS') {
          this.showToast(t.snippetsNoData || 'No snippets to export', 'error');
        } else {
          this.showToast(t.snippetsExportError || 'Export failed', 'error');
        }
      }
    } catch (err) {
      this.hideSnippetProgress();
      this.showToast(t.snippetsExportError || 'Export failed', 'error');
    }
  }

  /**
   * Handle import snippets button click
   */
  handleImportSnippets() {
    this.showImportOptionsDialog();
  }

  /**
   * Show import options dialog
   */
  showImportOptionsDialog() {
    document.getElementById('snippetImportOptionsOverlay').style.display = 'flex';
  }

  /**
   * Hide import options dialog
   */
  hideImportOptionsDialog() {
    document.getElementById('snippetImportOptionsOverlay').style.display = 'none';
  }

  /**
   * Execute import with selected mode
   * @param {string} mode - 'merge' or 'replace'
   */
  async executeImport(mode) {
    this.hideImportOptionsDialog();
    const t = this.i18n.settings;

    // Validate mode - default to 'merge' if invalid
    const validMode = mode === 'replace' ? 'replace' : 'merge';

    // Setup event listeners for progress tracking
    const cleanupListeners = () => {
      window.electronAPI?.removeSnippetImportStarted?.();
      window.electronAPI?.removeSnippetImportProgress?.();
    };

    cleanupListeners(); // Remove previous listeners

    // Show progress only after file is selected (not during file dialog)
    window.electronAPI?.onSnippetImportStarted?.(() => {
      this.showSnippetProgress(t.snippetsImporting || 'Importing...');
    });
    window.electronAPI?.onSnippetImportProgress?.((data) => {
      this.updateSnippetProgress(data.current, data.total);
    });

    try {
      const result = await window.electronAPI.importSnippets(validMode);
      this.hideSnippetProgress();
      cleanupListeners();

      if (result.success) {
        const msg =
          typeof t.snippetsImportSuccess === 'function'
            ? t.snippetsImportSuccess(result.count)
            : `Imported ${result.count} snippets`;
        this.showToast(msg, 'success');

        // Reload snippets in clipboard_renderer if available
        if (window.clipboardUI?.loadSnippets) {
          await window.clipboardUI.loadSnippets();
          window.clipboardUI.renderSnippets();
        }
      } else if (!result.canceled) {
        const errorKey =
          result.error === 'INVALID_FORMAT' ? 'snippetsInvalidFile' : 'snippetsImportError';
        this.showToast(t[errorKey] || 'Import failed', 'error');
      }
    } catch (err) {
      this.hideSnippetProgress();
      cleanupListeners();
      this.showToast(t.snippetsImportError || 'Import failed', 'error');
    }
  }

  /**
   * Show snippet progress modal
   * @param {string} title - Progress title
   */
  showSnippetProgress(title) {
    document.getElementById('snippetProgressTitle').textContent = title;
    document.getElementById('snippetProgressDetail').textContent = '';
    document.getElementById('snippetProgressBarFill').style.width = '0%';
    document.getElementById('snippetProgressOverlay').style.display = 'flex';
  }

  /**
   * Update snippet progress
   * @param {number} current - Current progress
   * @param {number} total - Total items
   */
  updateSnippetProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('snippetProgressDetail').textContent = `${current} / ${total}`;
    document.getElementById('snippetProgressBarFill').style.width = `${pct}%`;
  }

  /**
   * Hide snippet progress modal
   */
  hideSnippetProgress() {
    document.getElementById('snippetProgressOverlay').style.display = 'none';
  }

  destroy() {
    this.unbindEvents();
    this.stopListening();
    // Clean up event listeners
    this.languageChangeHandler = null;
    this.themeChangeHandler = null;
    this.opacityChangeHandler = null;
  }
}

// Export for use in index.html tab switching logic
window.SettingsUI = SettingsUI;
