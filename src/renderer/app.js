/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const I18N_STRINGS = (typeof window !== 'undefined' && window.IRUKADARK_I18N) || {};
const STATE = (typeof window !== 'undefined' && window.IRUKADARK_STATE) || {
  getLanguage: () => 'en',
  setLanguage: () => {},
  getTone: () => 'casual',
  setTone: () => {},
};
const SLASHES = (typeof window !== 'undefined' && window.IRUKADARK_SLASHES) || {
  SLASH_TRANSLATE_TARGETS: [],
  SLASH_TRANSLATE_LOOKUP: {},
  SLASH_WEB_TARGETS: [],
  SLASH_IMAGE_TARGETS: [],
  SLASH_IMAGE_SIZE_TARGETS: [],
  SLASH_IMAGE_COUNT_TARGETS: [],
  SLASH_VIDEO_TARGETS: [],
  SLASH_VIDEO_SIZE_TARGETS: [],
  SLASH_VIDEO_QUALITY_TARGETS: [],
  SLASH_VIDEO_DURATION_TARGETS: [],
  SLASH_VIDEO_COUNT_TARGETS: [],
  SLASH_SLIDE_TARGETS: [],
  SLASH_SLIDE_SIZE_TARGETS: [],
  getLangMeta: (code) => ({ code, name: code, rtl: false }),
  normalizeTranslateCode: () => null,
  getLanguageDisplayName: (code) => code,
  LANG_NAMES: {},
};

// Build a set of possible "Sources" markers across languages
const SOURCE_MARKERS = (() => {
  const base = ['References', 'Citations', '出典', '参考', '参考文献', '参考資料'];
  try {
    const localized = Object.values(I18N_STRINGS)
      .map((v) => (v && typeof v.sourcesBadge === 'string' ? v.sourcesBadge : null))
      .filter(Boolean);
    return Array.from(new Set(base.concat(localized)));
  } catch {
    return base;
  }
})();
const SLASH_TRANSLATE_TARGETS = SLASHES.SLASH_TRANSLATE_TARGETS || [];
const SLASH_TRANSLATE_LOOKUP = SLASHES.SLASH_TRANSLATE_LOOKUP || {};
const SLASH_TRANSLATE_MODE_TARGETS = SLASHES.SLASH_TRANSLATE_MODE_TARGETS || [];
const SLASH_WEB_TARGETS = SLASHES.SLASH_WEB_TARGETS || [];
const SLASH_IMAGE_TARGETS = SLASHES.SLASH_IMAGE_TARGETS || [];
const SLASH_IMAGE_SIZE_TARGETS = SLASHES.SLASH_IMAGE_SIZE_TARGETS || [];
const SLASH_IMAGE_COUNT_TARGETS = SLASHES.SLASH_IMAGE_COUNT_TARGETS || [];
const SLASH_VIDEO_TARGETS = SLASHES.SLASH_VIDEO_TARGETS || [];
const SLASH_VIDEO_SIZE_TARGETS = SLASHES.SLASH_VIDEO_SIZE_TARGETS || [];
const SLASH_VIDEO_QUALITY_TARGETS = SLASHES.SLASH_VIDEO_QUALITY_TARGETS || [];
const SLASH_VIDEO_DURATION_TARGETS = SLASHES.SLASH_VIDEO_DURATION_TARGETS || [];
const SLASH_VIDEO_COUNT_TARGETS = SLASHES.SLASH_VIDEO_COUNT_TARGETS || [];
const SLASH_SLIDE_TARGETS = SLASHES.SLASH_SLIDE_TARGETS || [];
const SLASH_SLIDE_SIZE_TARGETS = SLASHES.SLASH_SLIDE_SIZE_TARGETS || [];

function getLangMeta(code) {
  if (SLASHES && typeof SLASHES.getLangMeta === 'function') {
    return SLASHES.getLangMeta(code);
  }
  const lang = String(code || 'en');
  const name = SLASHES.LANG_NAMES ? SLASHES.LANG_NAMES[lang] || 'English' : lang;
  const rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
  const rtl = rtlLocales.has(lang);
  return { code: lang, name, rtl };
}

function normalizeTranslateCode(code) {
  if (SLASHES && typeof SLASHES.normalizeTranslateCode === 'function') {
    return SLASHES.normalizeTranslateCode(code);
  }
  return code || null;
}

function getLanguageDisplayName(code) {
  if (SLASHES && typeof SLASHES.getLanguageDisplayName === 'function') {
    return SLASHES.getLanguageDisplayName(code, getCurrentUILanguage());
  }
  return code;
}

function getCurrentUILanguage() {
  return (STATE && typeof STATE.getLanguage === 'function' && STATE.getLanguage()) || 'en';
}

function setCurrentUILanguage(code) {
  if (STATE && typeof STATE.setLanguage === 'function') {
    STATE.setLanguage(code);
  }
}

function getCurrentTone() {
  return (STATE && typeof STATE.getTone === 'function' && STATE.getTone()) || 'casual';
}

function setCurrentTone(value) {
  if (STATE && typeof STATE.setTone === 'function') {
    STATE.setTone(value);
  }
}
function getUIText(key, ...args) {
  const lang = getCurrentUILanguage();
  const strings = I18N_STRINGS[lang] || I18N_STRINGS.en;
  let value = strings;

  for (const k of key.split('.')) {
    value = value?.[k];
  }

  if (typeof value === 'function') {
    return value(...args);
  }

  return value || key;
}

// Lazy-load language pack script when missing
async function ensureLangLoaded(lang) {
  try {
    if (I18N_STRINGS && I18N_STRINGS[lang]) return true;
    const head = document.head || document.documentElement;
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `./i18n/lang/${lang}.js`;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      head.appendChild(s);
    });
    return !!(I18N_STRINGS && I18N_STRINGS[lang]);
  } catch {
    return false;
  }
}

class IrukaDarkApp {
  // Constants
  static IME_DEBOUNCE_MS = 100; // Time to wait after IME composition ends before allowing Enter key

  constructor() {
    this.geminiService = new GeminiService();
    this.chatHistoryData = [];
    this.shortcutRequestId = 0;
    this.webSearchEnabled = false;
    this.translateMode = 'literal';
    this.pendingTranslateModeAck = null;
    this.imageSize = '1:1';
    this.imageCount = 1;
    this.videoAspectRatio = '16:9';
    this.videoDuration = 4;
    this.videoCount = 1;
    this.videoResolution = '720p';
    this.slideSize = '16:9';
    this.slidePrompt = '';
    this.isGenerating = false;
    this.cancelRequested = false;
    this.isSending = false; // Prevent duplicate sendMessage() execution

    // IME (Input Method Editor) state management for CJK languages
    this.ime = {
      isComposing: false,
      compositionEndTime: 0,
    };

    this.i18nElementsCache = null;
    this.historyContextCache = null;
    this.historyContextCacheTime = 0;
    this.historyContextCacheTTL = 500;
    // Memory leak prevention: Track FileReaders and AbortControllers for cleanup
    this.activeFileReaders = new Set();
    this.messageAbortControllers = new WeakMap(); // Map DOM elements to AbortControllers
    // Scroll control: Counter-based approach to prevent race conditions
    this.disableAutoScrollCount = 0;
    this.initializeElements();
    this.bindEvents();
    this.updateUILanguage();
    this.applyThemeFromSystem();
    this.applyGlassLevelFromSystem();
    this.applyWindowOpacityFromSystem();
    this.checkInitialState();
    this.createIconsEnhanced();
    this.initSlashSuggest();
    this.updateMonitoringUI();

    // Check API key on initial load (chat tab is default)
    setTimeout(() => {
      this.checkApiKey();
    }, 0);

    try {
      setTimeout(() => this.messageInput && this.messageInput.focus(), 0);
    } catch {}

    try {
      if (window.electronAPI && window.electronAPI.getTone) {
        window.electronAPI.getTone().then((tone) => {
          setCurrentTone(tone);
        });
      }
      if (window.electronAPI && window.electronAPI.onToneChanged) {
        window.electronAPI.onToneChanged((tone) => {
          setCurrentTone(tone);
        });
      }
    } catch {}
  }
  updateUILanguage() {
    const lang = getCurrentUILanguage();
    document.documentElement.lang = lang;
    const rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
    document.documentElement.dir = rtlLocales.has(lang) ? 'rtl' : 'ltr';
    this.updateStaticHTMLText();
    try {
      this.updateSendButtonIcon();
    } catch {}
  }

  updateStaticHTMLText() {
    if (!this.i18nElementsCache) {
      this.i18nElementsCache = {
        textContent: Array.from(document.querySelectorAll('[data-i18n]')),
        title: Array.from(document.querySelectorAll('[data-i18n-title]')),
        placeholder: Array.from(document.querySelectorAll('[data-i18n-placeholder]')),
      };
    }

    this.i18nElementsCache.textContent.forEach((el) => {
      if (el.isConnected) {
        const key = el.dataset.i18n;
        el.textContent = getUIText(key);
      }
    });
    this.i18nElementsCache.title.forEach((el) => {
      if (el.isConnected) {
        const key = el.dataset.i18nTitle;
        el.title = getUIText(key);
      }
    });
    this.i18nElementsCache.placeholder.forEach((el) => {
      if (el.isConnected && el.placeholder !== undefined) {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = getUIText(key);
      }
    });
  }

  /**
   * Check if an Enter key press should be blocked due to IME composition
   * @param {KeyboardEvent} event - The keyboard event
   * @returns {boolean} True if the Enter key should be blocked
   */
  isIMEComposing(event) {
    // Check multiple indicators for IME composition
    if (event.isComposing || this.ime.isComposing || event.keyCode === 229) {
      return true;
    }

    // Block Enter key shortly after composition ends to prevent accidental submission
    if (
      this.ime.compositionEndTime &&
      Date.now() - this.ime.compositionEndTime < IrukaDarkApp.IME_DEBOUNCE_MS
    ) {
      return true;
    }

    return false;
  }

  /**
   * Setup IME event listeners for an input element
   * @param {HTMLElement} inputElement - The input or textarea element
   */
  setupIMEHandlers(inputElement) {
    inputElement.addEventListener('compositionstart', () => {
      this.ime.isComposing = true;
    });

    inputElement.addEventListener('compositionend', () => {
      // Delay resetting isComposing to handle timing issues between
      // compositionend and keydown events in some browsers
      this.ime.compositionEndTime = Date.now();
      setTimeout(() => {
        this.ime.isComposing = false;
      }, IrukaDarkApp.IME_DEBOUNCE_MS);
    });
  }

  /**
   * Check if API key exists and show appropriate view
   * @returns {Promise<void>}
   */
  async checkApiKey() {
    if (!window.electronAPI || !window.electronAPI.getGeminiApiKey) {
      return;
    }

    try {
      const result = await window.electronAPI.getGeminiApiKey();
      if (result && result.success && result.apiKey && result.apiKey.trim()) {
        this.showChat();
      } else {
        this.showApiKeyForm();
      }
    } catch (err) {
      this.showApiKeyForm();
    }
  }

  /**
   * Show API key registration form
   */
  showApiKeyForm() {
    // Only change display if not already in the correct state
    if (this.apiKeyForm && this.apiKeyForm.style.display !== 'flex') {
      this.apiKeyForm.style.display = 'flex';
    }
    const chatHistory = this.chatHistory;
    if (chatHistory && chatHistory.isConnected && chatHistory.style.display !== 'none') {
      this.chatHistory.style.display = 'none';
    }
    setTimeout(() => {
      if (this.apiKeyInput) {
        this.apiKeyInput.focus();
      }
    }, 50);
  }

  /**
   * Show chat interface
   */
  showChat() {
    if (this.apiKeyForm && this.apiKeyForm.style.display !== 'none') {
      this.apiKeyForm.style.display = 'none';
    }
    if (
      this.chatHistory &&
      this.chatHistory.isConnected &&
      this.chatHistory.style.display !== 'block'
    ) {
      this.chatHistory.style.display = 'block';
    }
    this.showShortcutHints();
  }

  /**
   * Shortcut actions to display in hints
   */
  static HINT_ACTIONS = [
    'screenshot',
    'explain',
    'urlSummary',
    'translate',
    'moveToCursor',
    'clipboardPopup',
    'toggleMainWindow',
  ];

  /**
   * Display keyboard shortcut hints when chat is empty
   * @param {boolean} forceRefresh - If true, refresh hints even if already displayed
   */
  async showShortcutHints(forceRefresh = false) {
    if (!this.chatHistory || this._shortcutHintsLoading) return;
    if (this.apiKeyForm && this.apiKeyForm.style.display === 'flex') return;

    const hintsEl = this.chatHistory.querySelector('.shortcut-hints');
    const hasMessages = Array.from(this.chatHistory.children).some(
      (el) => !el.classList.contains('shortcut-hints')
    );

    if (hasMessages) {
      if (hintsEl) hintsEl.remove();
      return;
    }
    if (hintsEl && !forceRefresh) return;

    this._shortcutHintsLoading = true;
    try {
      if (hintsEl) hintsEl.remove();

      // Load shortcuts and language
      const [shortcuts, lang] = await Promise.all([this._loadShortcuts(), this._loadUILanguage()]);
      await ensureLangLoaded(lang);

      // Build and append hints element
      const element = this._buildShortcutHintsElement(shortcuts);
      this.chatHistory.appendChild(element);
    } finally {
      this._shortcutHintsLoading = false;
    }
  }

  /**
   * Load shortcut assignments from system
   * @returns {Promise<Object>}
   */
  async _loadShortcuts() {
    const defaults = window.SHORTCUT_DEFAULTS?.DEFAULT_SHORTCUTS || {
      explain: 'Alt+A',
      urlSummary: 'Alt+Q',
      translate: 'Alt+R',
      screenshot: 'Alt+S',
      moveToCursor: 'Alt+Z',
      clipboardPopup: 'Command+Shift+V',
      toggleMainWindow: 'Alt+Space',
    };
    try {
      const assignments = await window.electronAPI?.getShortcutAssignments?.();
      return { ...defaults, ...assignments };
    } catch {
      return defaults;
    }
  }

  /**
   * Load UI language, updating state if needed
   * @returns {Promise<string>}
   */
  async _loadUILanguage() {
    let lang = getCurrentUILanguage();
    try {
      const systemLang = await window.electronAPI?.getUILanguage?.();
      if (systemLang) {
        lang = systemLang;
        setCurrentUILanguage(lang);
      }
    } catch {
      // Use current language on error
    }
    return lang;
  }

  /**
   * Build shortcut hints DOM element
   * @param {Object} shortcuts - Shortcut assignments
   * @returns {HTMLElement}
   */
  _buildShortcutHintsElement(shortcuts) {
    const container = document.createElement('div');
    container.className = 'shortcut-hints';

    const title = document.createElement('div');
    title.className = 'shortcut-hints-title';
    title.textContent = getUIText('shortcutHints.title') || 'Shortcut Keys';
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'shortcut-hints-grid';

    for (const action of IrukaDarkApp.HINT_ACTIONS) {
      const key = shortcuts[action];
      if (!key) continue;

      const hint = document.createElement('div');
      hint.className = 'shortcut-hint';

      const keySpan = document.createElement('span');
      keySpan.className = 'shortcut-hint-key';
      keySpan.textContent = key
        .replace(/\bAlt\b/g, '⌥')
        .replace(/\bShift\b/g, '⇧')
        .replace(/\bCommand\b/g, '⌘')
        .replace(/\+/g, '');

      const labelSpan = document.createElement('span');
      labelSpan.className = 'shortcut-hint-label';
      labelSpan.textContent = getUIText(`settings.actions.${action}`) || action;

      hint.appendChild(keySpan);
      hint.appendChild(labelSpan);
      grid.appendChild(hint);
    }

    container.appendChild(grid);

    const shortcutDesc = document.createElement('div');
    shortcutDesc.className = 'shortcut-hints-desc';
    shortcutDesc.textContent =
      getUIText('shortcutHints.shortcutDesc') ||
      'Shortcut key assignments can be changed in the Settings tab.';
    container.appendChild(shortcutDesc);

    // @ Actions section
    const atTitle = document.createElement('div');
    atTitle.className = 'shortcut-hints-title';
    atTitle.textContent = getUIText('shortcutHints.atTitle') || '@ Actions';
    container.appendChild(atTitle);

    const atGrid = document.createElement('div');
    atGrid.className = 'shortcut-hints-grid';

    const atActions = [
      { key: '@image', label: getUIText('shortcutHints.atImage') || 'Generate image' },
      { key: '@video', label: getUIText('shortcutHints.atVideo') || 'Generate video' },
      { key: '@slide', label: getUIText('shortcutHints.atSlide') || 'Generate slide image' },
    ];

    for (const { key, label } of atActions) {
      const hint = document.createElement('div');
      hint.className = 'shortcut-hint';

      const keySpan = document.createElement('span');
      keySpan.className = 'shortcut-hint-key';
      keySpan.textContent = key;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'shortcut-hint-label';
      labelSpan.textContent = label;

      hint.appendChild(keySpan);
      hint.appendChild(labelSpan);
      atGrid.appendChild(hint);
    }

    container.appendChild(atGrid);

    // Slash commands section
    const slashTitle = document.createElement('div');
    slashTitle.className = 'shortcut-hints-title';
    slashTitle.textContent = getUIText('shortcutHints.slashTitle') || 'Chat: Slash Commands';
    container.appendChild(slashTitle);

    const slashDesc = document.createElement('div');
    slashDesc.className = 'shortcut-hints-desc';
    slashDesc.textContent =
      getUIText('shortcutHints.slashDesc') ||
      'Use slash commands to explore chat content and configure settings.';
    container.appendChild(slashDesc);

    return container;
  }

  /**
   * Hide keyboard shortcut hints
   */
  hideShortcutHints() {
    if (!this.chatHistory) return;
    const hintsEl = this.chatHistory.querySelector('.shortcut-hints');
    if (hintsEl) {
      hintsEl.remove();
    }
  }

  /**
   * Save API key to preferences
   * @returns {Promise<void>}
   */
  async saveApiKey() {
    if (!window.electronAPI || !window.electronAPI.saveGeminiApiKey) {
      alert(getUIText('apiKey.errorSavingUnavailable'));
      return;
    }

    const apiKey = this.apiKeyInput ? this.apiKeyInput.value.trim() : '';
    if (!apiKey) {
      alert(getUIText('apiKey.errorEmpty'));
      return;
    }

    try {
      if (this.saveApiKeyBtn) {
        this.saveApiKeyBtn.disabled = true;
        this.saveApiKeyBtn.textContent = getUIText('apiKey.saving');
      }

      const result = await window.electronAPI.saveGeminiApiKey(apiKey);
      if (result && result.success) {
        if (this.apiKeyInput) {
          this.apiKeyInput.value = '';
        }
        this.showChat();
        this.addMessage('system', getUIText('apiKey.successSaved'), [], { noScroll: true });
      } else {
        const errorMsg = result?.error || getUIText('apiKey.errorSaving');
        alert(errorMsg);
      }
    } catch (err) {
      alert(getUIText('apiKey.errorSaving'));
    } finally {
      if (this.saveApiKeyBtn) {
        this.saveApiKeyBtn.disabled = false;
        this.saveApiKeyBtn.textContent = getUIText('apiKey.save');
      }
    }
  }

  checkInitialState() {
    if (!window.electronAPI) {
      this.addMessage('system', getUIText('apiUnavailable'));
      return;
    }
  }

  initializeElements() {
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.plusBtn = document.getElementById('plusBtn');
    this.fileInput = document.getElementById('fileInput');
    this.attachmentArea = document.getElementById('attachmentArea');
    this.chatHistory = document.getElementById('chatHistory');
    this.apiKeyForm = document.getElementById('apiKeyForm');
    this.apiKeyInput = document.getElementById('apiKeyInput');
    this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    this.inputArea = document.getElementById('inputArea');
    this.inputCommandBadge = document.getElementById('inputCommandBadge');
    this.attachedFiles = [];
    this.currentCommandMode = null; // 'image' | 'video' | null
  }

  bindEvents() {
    // Send button: Dual function - send message or stop generation
    // - When AI is thinking (isGenerating=true): Acts as stop button
    // - When idle (isGenerating=false): Acts as send button
    this.sendBtn.addEventListener('click', () => {
      if (this.isGenerating) {
        this.cancelGeneration();
      } else {
        this.sendMessage();
      }
    });
    this.plusBtn.addEventListener('click', () => {
      this.handlePlusButtonClick();
    });
    this.fileInput.addEventListener('change', (e) => {
      this.handleFileSelection(e);
    });

    // API Key form events
    if (this.saveApiKeyBtn) {
      this.saveApiKeyBtn.addEventListener('click', () => {
        this.saveApiKey();
      });
    }
    if (this.apiKeyInput) {
      this.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveApiKey();
        }
      });
    }
    // Focus input when clicking on empty chat area
    this.chatHistory.addEventListener('click', (e) => {
      // Don't focus if clicking on interactive elements
      const target = e.target;
      if (
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('a') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea')
      ) {
        return;
      }
      // Focus the message input
      if (this.messageInput) {
        this.messageInput.focus();
      }
    });
    window.addEventListener(
      'contextmenu',
      (e) => {
        try {
          e.preventDefault();
          const pos = { x: e.clientX || e.x || 0, y: e.clientY || e.y || 0 };
          if (window?.electronAPI?.showAppMenu) {
            window.electronAPI.showAppMenu(pos);
          }
        } catch {}
      },
      { capture: true }
    );

    // Setup IME handling for message input
    this.setupIMEHandlers(this.messageInput);

    // Handle Enter key: Dual function - send message or stop generation
    // - Enter: Send message / Stop generation
    // - Shift+Enter: New line
    // - During IME composition: Do nothing (prevents premature submission during CJK input)
    const onEnterToSend = (e) => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey) return; // Shift+Enter for new line
      if (this.isIMEComposing(e)) return; // Ignore during IME composition

      e.preventDefault();
      e.stopPropagation();

      // Clean up trailing newlines
      if (this.messageInput && /\n$/.test(this.messageInput.value)) {
        this.messageInput.value = this.messageInput.value.replace(/\n+$/, '');
      }

      // Dual function: stop generation or send message
      if (this.isGenerating) {
        this.cancelGeneration(); // Stop button behavior
      } else {
        this.sendMessage(); // Send button behavior
      }
    };
    this.messageInput.addEventListener(
      'keydown',
      (e) => {
        if (this.handleSlashSuggestKeydown(e)) return;
        onEnterToSend(e);
      },
      { capture: true }
    );
    this.messageInput.addEventListener(
      'keypress',
      (e) => {
        if (this.suggestVisible && e.key === 'Enter') {
          e.preventDefault();
          return;
        }
        onEnterToSend(e);
      },
      { capture: true }
    );
    this.messageInput.addEventListener(
      'keyup',
      (e) => {
        if (this.suggestVisible && e.key === 'Enter') {
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey && !this.isIMEComposing(e)) {
          if (this.messageInput) {
            this.messageInput.value = this.messageInput.value.replace(/\n+$/, '');
          }
        }
      },
      { capture: true }
    );
    this.messageInput.addEventListener('input', () => {
      this.autosizeMessageInput();
      this.maybeShowSlashSuggest();
      this.updateInputCommandBadge();
    });
    this.messageInput.addEventListener('paste', (e) => {
      this.handlePaste(e);
    });
    this.autosizeMessageInput();

    // Click on input command badge to remove it
    if (this.inputCommandBadge) {
      this.inputCommandBadge.addEventListener('click', () => {
        this.clearInputCommandBadge();
        this.messageInput.focus();
      });
    }

    // Backspace on empty input clears command badge
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && this.currentCommandMode && this.messageInput.value === '') {
        e.preventDefault();
        this.clearInputCommandBadge();
      }
    });

    const on = (name, cb) => {
      try {
        return window.electronAPI && window.electronAPI[name]
          ? window.electronAPI[name](cb)
          : undefined;
      } catch {}
    };
    on('onAppConfig', async (config) => {
      try {
        const cfg = config || {};
        if (cfg.menuLanguage) {
          const lang = String(cfg.menuLanguage || 'en');
          await ensureLangLoaded(lang);
          setCurrentUILanguage(lang);
          this.updateUILanguage();
        }
        if (cfg.uiTheme) {
          this.applyTheme(cfg.uiTheme);
        }
        if (cfg.tone) {
          setCurrentTone(cfg.tone);
        }
        if (cfg.translateMode) {
          this.translateMode = cfg.translateMode === 'free' ? 'free' : 'literal';
          this.pendingTranslateModeAck = null;
        }
      } catch (error) {}
    });
    on('onThemeChanged', (theme) => this.applyTheme(theme));
    on('onTranslateModeChanged', (mode) => {
      const normalized = mode === 'free' ? 'free' : 'literal';
      const changed = this.translateMode !== normalized;
      this.translateMode = normalized;
      if (this.pendingTranslateModeAck === normalized) {
        this.pendingTranslateModeAck = null;
        return;
      }
      const key = changed ? 'translateModeUpdated' : 'translateModeAlready';
      const message = getUIText(key, this.getTranslateModeLabel());
      if (message) {
        this.addMessage('system', message);
      }
    });
    on('onLanguageChanged', async (lang) => {
      const next = lang || 'en';
      await ensureLangLoaded(next);
      setCurrentUILanguage(next);
      this.updateUILanguage();
    });
    on('onWindowOpacityChanged', (value) => this.applySolidWindowClass(value));
    on('onExplainClipboard', (text) => this.handleExplainClipboard(text));
    on('onExplainClipboardDetailed', (text) => this.handleExplainClipboardDetailed(text));
    on('onTranslateClipboard', (text) => this.handleTranslateClipboard(text));
    on('onReplyClipboard', (text) => this.handleReplyClipboard(text));
    on('onSummarizeUrlContext', (url) => this.handleSummarizeUrlContext(url));
    on('onSummarizeUrlContextDetailed', (url) => this.handleSummarizeUrlContextDetailed(url));
    on('onExplainClipboardError', (msg) => {
      const key = String(msg || '').trim();
      if (key === 'INVALID_URL_SELECTION') {
        this.showToast(getUIText('invalidUrlSelection'), 'error');
      } else if (key) {
        this.showToast(key, 'error');
      } else {
        this.showToast(getUIText('textNotRetrieved'), 'error');
      }
    });
    on('onExplainScreenshot', (payload) => this.handleExplainScreenshot(payload));
    on('onExplainScreenshotDetailed', (payload) => this.handleExplainScreenshotDetailed(payload));
    on('onGenerateSlideImage', (text) => this.handleGenerateSlideImage(text));
    on('onAccessibilityWarning', () => {
      /* no-op in chat UI */
    });
    on('onShortcutRegistered', (accel) => {
      if (!accel) {
        this.showToast(getUIText('failedToRegisterShortcut'), 'error', 3600);
        return;
      }
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+A') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutDetailedRegistered', (accel) => {
      if (!accel) return;
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+Shift+A') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutTranslateRegistered', (accel) => {
      if (!accel) return;
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+R') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutReplyRegistered', (accel) => {
      if (!accel) return;
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+T') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutUrlSummaryRegistered', (accel) => {
      if (!accel) return;
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+Q') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutUrlDetailedRegistered', (accel) => {
      if (!accel) return;
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+Shift+Q') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutSnsPostRegistered', (accel) => {
      if (!accel) return;
      const display = String(accel || '').replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Control+Alt+1') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });

    on('onUpdateAvailable', (p) => {
      try {
        const v = p && p.version ? p.version : '';
        const url = p && p.url ? p.url : '';
        const msg = getUIText('updateAvailable', v);
        if (url && typeof window.confirm === 'function') {
          if (confirm(msg)) {
            try {
              window.electronAPI.openExternal(url);
            } catch {}
          }
        } else {
          this.showToast(msg, 'info', 6000);
        }
      } catch {}
    });
    on('onUpdateNone', () => {
      try {
        this.showToast(getUIText('upToDate'), 'info', 2600);
      } catch {}
    });

    if (!window.electronAPI) {
      this.addMessage('system', getUIText('apiUnavailable'));
    }
    this.initializeLanguage();
    this.loadWebSearchSetting();
    this.loadTranslateMode();
    this.loadImageSize();
    this.loadImageCount();
    this.loadVideoAspectRatio();
    this.loadVideoDuration();
    this.loadVideoCount();
    this.loadVideoResolution();
    this.loadSlideSize();
    this.loadSlidePrompt();
  }

  async loadWebSearchSetting() {
    try {
      if (window.electronAPI && window.electronAPI.getWebSearchEnabled) {
        const enabled = await window.electronAPI.getWebSearchEnabled();
        this.webSearchEnabled = !!enabled;
      }
    } catch (error) {
      this.webSearchEnabled = false;
    }
  }

  async loadTranslateMode() {
    try {
      if (window.electronAPI && window.electronAPI.getTranslateMode) {
        const mode = await window.electronAPI.getTranslateMode();
        this.translateMode = mode === 'free' ? 'free' : 'literal';
        this.pendingTranslateModeAck = null;
      }
    } catch (error) {
      this.translateMode = 'literal';
      this.pendingTranslateModeAck = null;
    }
  }

  async loadImageSize() {
    try {
      if (window.electronAPI && window.electronAPI.getImageSize) {
        const size = await window.electronAPI.getImageSize();
        const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
        this.imageSize = validSizes.includes(size) ? size : '1:1';
      }
    } catch (error) {
      this.imageSize = '1:1';
    }
  }

  async loadImageCount() {
    try {
      if (window.electronAPI && window.electronAPI.getImageCount) {
        const count = await window.electronAPI.getImageCount();
        const validCounts = [1, 2, 3, 4];
        this.imageCount = validCounts.includes(count) ? count : 1;
      }
    } catch (error) {
      this.imageCount = 1;
    }
  }

  async loadVideoAspectRatio() {
    try {
      if (window.electronAPI && window.electronAPI.getVideoAspectRatio) {
        const ratio = await window.electronAPI.getVideoAspectRatio();
        const validRatios = ['16:9', '9:16'];
        this.videoAspectRatio = validRatios.includes(ratio) ? ratio : '16:9';
      }
    } catch (error) {
      this.videoAspectRatio = '16:9';
    }
  }

  async loadVideoDuration() {
    try {
      if (window.electronAPI && window.electronAPI.getVideoDuration) {
        const duration = await window.electronAPI.getVideoDuration();
        const validDurations = [4, 5, 6, 7, 8];
        this.videoDuration = validDurations.includes(duration) ? duration : 4;
      }
    } catch (error) {
      this.videoDuration = 4;
    }
  }

  async loadVideoCount() {
    try {
      if (window.electronAPI && window.electronAPI.getVideoCount) {
        const count = await window.electronAPI.getVideoCount();
        const validCounts = [1, 2, 3, 4];
        this.videoCount = validCounts.includes(count) ? count : 1;
      }
    } catch (error) {
      this.videoCount = 1;
    }
  }

  async loadVideoResolution() {
    try {
      if (window.electronAPI && window.electronAPI.getVideoResolution) {
        const resolution = await window.electronAPI.getVideoResolution();
        const validResolutions = ['720p', '1080p'];
        this.videoResolution = validResolutions.includes(resolution) ? resolution : '720p';
      }
    } catch (error) {
      this.videoResolution = '720p';
    }
  }

  async loadSlideSize() {
    try {
      if (window.electronAPI && window.electronAPI.getSlideSize) {
        const ratio = await window.electronAPI.getSlideSize();
        const validRatios = ['16:9', '9:16', '4:3', '3:4', '1:1'];
        this.slideSize = validRatios.includes(ratio) ? ratio : '16:9';
      }
    } catch (error) {
      this.slideSize = '16:9';
    }
  }

  async loadSlidePrompt() {
    try {
      if (window.electronAPI && window.electronAPI.getSlidePrompt) {
        const prompt = await window.electronAPI.getSlidePrompt();
        this.slidePrompt = prompt || '';
      }
    } catch (error) {
      this.slidePrompt = '';
    }
  }

  getTranslateModeLabel(mode = this.translateMode) {
    const m = mode === 'free' ? 'free' : 'literal';
    return m === 'free'
      ? getUIText('translateModeNameFree') || 'Free translation'
      : getUIText('translateModeNameLiteral') || 'Literal translation';
  }

  async persistTranslateMode(mode) {
    try {
      if (window.electronAPI && window.electronAPI.saveTranslateMode) {
        await window.electronAPI.saveTranslateMode(mode);
      }
    } catch (error) {}
  }

  async setTranslateMode(mode, { silentIfSame = false } = {}) {
    const normalized = mode === 'free' ? 'free' : 'literal';
    if (this.translateMode === normalized) {
      if (!silentIfSame) {
        const already = getUIText('translateModeAlready', this.getTranslateModeLabel());
        if (already) this.addMessage('system', already);
      }
      return;
    }
    this.translateMode = normalized;
    this.pendingTranslateModeAck = normalized;
    const updated = getUIText('translateModeUpdated', this.getTranslateModeLabel());
    if (updated) this.addMessage('system', updated);
    await this.persistTranslateMode(normalized);
  }

  showTranslateModeStatus() {
    const message = getUIText('translateModeStatus', this.getTranslateModeLabel());
    if (message) {
      this.addMessage('system', message);
    }
  }

  getImageSizeLabel(size = this.imageSize) {
    if (size === 'auto') {
      return getUIText('imageSizeNameAuto') || 'Auto';
    }
    return size;
  }

  async persistImageSize(size) {
    try {
      if (window.electronAPI && window.electronAPI.saveImageSize) {
        await window.electronAPI.saveImageSize(size);
      }
    } catch (error) {}
  }

  async setImageSize(size) {
    const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
    const normalized = validSizes.includes(size) ? size : '1:1';
    if (this.imageSize === normalized) {
      const already = getUIText('imageSizeAlready', this.getImageSizeLabel());
      if (already) this.addMessage('system', already);
      return;
    }
    this.imageSize = normalized;
    const updated = getUIText('imageSizeUpdated', this.getImageSizeLabel());
    if (updated) this.addMessage('system', updated);
    await this.persistImageSize(normalized);
  }

  showImageSizeStatus() {
    const message = getUIText('imageSizeStatus', this.getImageSizeLabel());
    if (message) {
      this.addMessage('system', message);
    }
  }

  async persistImageCount(count) {
    try {
      if (window.electronAPI && window.electronAPI.saveImageCount) {
        await window.electronAPI.saveImageCount(count);
      }
    } catch (error) {}
  }

  async setImageCount(count) {
    const validCounts = [1, 2, 3, 4];
    const normalized = validCounts.includes(count) ? count : 1;
    if (this.imageCount === normalized) {
      const already = getUIText('imageCountAlready', normalized);
      if (already) this.addMessage('system', already);
      return;
    }
    this.imageCount = normalized;
    const updated = getUIText('imageCountUpdated', normalized);
    if (updated) this.addMessage('system', updated);
    await this.persistImageCount(normalized);
  }

  showImageCountStatus() {
    const message = getUIText('imageCountStatus', this.imageCount);
    if (message) {
      this.addMessage('system', message);
    }
  }

  async persistVideoAspectRatio(ratio) {
    try {
      if (window.electronAPI && window.electronAPI.saveVideoAspectRatio) {
        await window.electronAPI.saveVideoAspectRatio(ratio);
      }
    } catch (error) {}
  }

  async setVideoAspectRatio(ratio) {
    const validRatios = ['16:9', '9:16'];
    const normalized = validRatios.includes(ratio) ? ratio : '16:9';
    if (this.videoAspectRatio === normalized) {
      const already = getUIText('videoAspectRatioAlready', normalized);
      if (already) this.addMessage('system', already);
      return;
    }
    this.videoAspectRatio = normalized;
    const updated = getUIText('videoAspectRatioUpdated', normalized);
    if (updated) this.addMessage('system', updated);
    await this.persistVideoAspectRatio(normalized);
  }

  async persistVideoResolution(resolution) {
    try {
      if (window.electronAPI && window.electronAPI.saveVideoResolution) {
        await window.electronAPI.saveVideoResolution(resolution);
      }
    } catch (error) {}
  }

  async setVideoResolution(resolution) {
    const validResolutions = ['720p', '1080p'];
    const normalized = validResolutions.includes(resolution) ? resolution : '720p';
    if (this.videoResolution === normalized) {
      const already = getUIText('videoResolutionAlready', normalized);
      if (already) this.addMessage('system', already);
      return;
    }
    this.videoResolution = normalized;
    const updated = getUIText('videoResolutionUpdated', normalized);
    if (updated) this.addMessage('system', updated);
    await this.persistVideoResolution(normalized);
  }

  showVideoStatus() {
    const size = getUIText('videoAspectRatioStatus', this.videoAspectRatio);
    const quality = getUIText('videoResolutionStatus', this.videoResolution);
    const duration = getUIText('videoDurationStatus', this.videoDuration);
    const count = getUIText('videoCountStatus', this.videoCount);
    if (size) this.addMessage('system', size);
    if (quality) this.addMessage('system', quality);
    if (duration) this.addMessage('system', duration);
    if (count) this.addMessage('system', count);
  }

  async persistVideoDuration(duration) {
    try {
      if (window.electronAPI && window.electronAPI.saveVideoDuration) {
        await window.electronAPI.saveVideoDuration(duration);
      }
    } catch (error) {}
  }

  async setVideoDuration(duration) {
    const validDurations = [4, 5, 6, 7, 8];
    const normalized = validDurations.includes(duration) ? duration : 4;
    if (this.videoDuration === normalized) {
      const already = getUIText('videoDurationAlready', normalized);
      if (already) this.addMessage('system', already);
      return;
    }
    this.videoDuration = normalized;
    const updated = getUIText('videoDurationUpdated', normalized);
    if (updated) this.addMessage('system', updated);
    await this.persistVideoDuration(normalized);
  }

  async persistVideoCount(count) {
    try {
      if (window.electronAPI && window.electronAPI.saveVideoCount) {
        await window.electronAPI.saveVideoCount(count);
      }
    } catch (error) {}
  }

  async setVideoCount(count) {
    const validCounts = [1, 2, 3, 4];
    const normalized = validCounts.includes(count) ? count : 1;
    if (this.videoCount === normalized) {
      const already = getUIText('videoCountAlready', normalized);
      if (already) this.addMessage('system', already);
      return;
    }
    this.videoCount = normalized;
    const updated = getUIText('videoCountUpdated', normalized);
    if (updated) this.addMessage('system', updated);
    await this.persistVideoCount(normalized);
  }

  // Slide image settings
  async persistSlideSize(ratio) {
    try {
      if (window.electronAPI && window.electronAPI.saveSlideSize) {
        await window.electronAPI.saveSlideSize(ratio);
      }
    } catch (error) {}
  }

  async setSlideSize(ratio) {
    const validRatios = ['16:9', '9:16', '4:3', '3:4', '1:1'];
    const normalized = validRatios.includes(ratio) ? ratio : '16:9';
    if (this.slideSize === normalized) {
      const already = getUIText('slideSizeAlready', normalized);
      if (already) this.addMessage('system', already);
      return;
    }
    this.slideSize = normalized;
    const updated = getUIText('slideSizeUpdated', normalized);
    if (updated) this.addMessage('system', updated);
    await this.persistSlideSize(normalized);
  }

  async persistSlidePrompt(prompt) {
    try {
      if (window.electronAPI && window.electronAPI.saveSlidePrompt) {
        await window.electronAPI.saveSlidePrompt(prompt);
      }
    } catch (error) {}
  }

  async setSlidePrompt(prompt) {
    this.slidePrompt = prompt || '';
    const updated = getUIText('slidePromptUpdated');
    if (updated) this.addMessage('system', updated);
    await this.persistSlidePrompt(this.slidePrompt);
  }

  showSlideStatus() {
    const sizeStatus = getUIText('slideSizeStatus', this.slideSize);
    if (sizeStatus) this.addMessage('system', sizeStatus);

    if (this.slidePrompt) {
      const promptStatus = getUIText('slidePromptCustomStatus');
      if (promptStatus) this.addMessage('system', promptStatus);
    } else {
      const promptDefault = getUIText('slidePromptDefaultStatus');
      if (promptDefault) this.addMessage('system', promptDefault);
    }
  }

  getDefaultSlidePrompt() {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const { name, code } = getLangMeta(lang);

    if (lang === 'ja') {
      return `以下の内容を1枚のスライドで説明したリッチな図解画像を生成してください。
デザイン: shadcn/uiスタイル、白黒、背景白、アクセントカラー1つ。
テキストは日本語で。`;
    } else {
      return `Generate a rich infographic slide image explaining the following content.
Design: shadcn/ui style, black and white, white background, one accent color.
Text should be in ${name} (${code}).`;
    }
  }

  async openSlidePromptDialog() {
    const overlay = document.getElementById('slidePromptOverlay');
    const textarea = document.getElementById('slidePromptTextarea');
    const closeBtn = document.getElementById('slidePromptClose');
    const cancelBtn = document.getElementById('slidePromptCancel');
    const saveBtn = document.getElementById('slidePromptSave');

    if (!overlay || !textarea) return;

    // Show current custom prompt or default prompt as placeholder
    const currentValue = this.slidePrompt || '';
    const defaultPrompt = this.getDefaultSlidePrompt();

    // Set textarea value: show custom if set, otherwise show default
    textarea.value = currentValue || defaultPrompt;
    textarea.placeholder = defaultPrompt;

    // Show overlay
    overlay.style.display = 'flex';
    textarea.focus();
    textarea.select();

    // Handler functions
    const handleClose = () => {
      overlay.style.display = 'none';
      cleanup();
    };

    const handleSave = async () => {
      const value = textarea.value.trim();
      // If value matches default, save empty string (use default)
      const newValue = value === defaultPrompt ? '' : value;
      await this.setSlidePrompt(newValue);
      overlay.style.display = 'none';
      cleanup();
    };

    const handleOverlayClick = (e) => {
      if (e.target === overlay) {
        handleClose();
      }
    };

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSave();
      }
    };

    const cleanup = () => {
      closeBtn.removeEventListener('click', handleClose);
      cancelBtn.removeEventListener('click', handleClose);
      saveBtn.removeEventListener('click', handleSave);
      overlay.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleKeydown);
    };

    // Add event listeners
    closeBtn.addEventListener('click', handleClose);
    cancelBtn.addEventListener('click', handleClose);
    saveBtn.addEventListener('click', handleSave);
    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeydown);
  }

  async initializeLanguage() {
    try {
      if (window.electronAPI && window.electronAPI.getUILanguage) {
        const lang = await window.electronAPI.getUILanguage();
        const targetLang = lang || 'en';
        if (targetLang !== 'en') {
          await ensureLangLoaded(targetLang);
        }
        setCurrentUILanguage(targetLang);
        this.updateUILanguage();
      }
    } catch {}
  }

  async applyGlassLevelFromSystem() {
    try {
      if (window.electronAPI && window.electronAPI.getGlassLevel) {
        const level = await window.electronAPI.getGlassLevel();
        this.applyGlassLevel(level || 'medium');
      } else {
        this.applyGlassLevel('medium');
      }
    } catch {
      this.applyGlassLevel('medium');
    }
  }

  applyGlassLevel(level) {
    const root = document.documentElement;
    let light = 0.2,
      dark1 = 0.9,
      dark2 = 0.9,
      input = 0.45;
    if (level === 'high') {
      light = 0.1;
      dark1 = 0.7;
      dark2 = 0.7;
      input = 0.35;
    } else if (level === 'low') {
      light = 0.32;
      dark1 = 0.96;
      dark2 = 0.96;
      input = 0.6;
    }
    root.style.setProperty('--glass-alpha-light', String(light));
    root.style.setProperty('--glass-alpha-dark-1', String(dark1));
    root.style.setProperty('--glass-alpha-dark-2', String(dark2));
    root.style.setProperty('--input-glass-alpha', String(input));
  }

  async applyWindowOpacityFromSystem() {
    try {
      if (window.electronAPI && window.electronAPI.getWindowOpacity) {
        const v = await window.electronAPI.getWindowOpacity();
        this.applySolidWindowClass(v);
      } else {
        this.applySolidWindowClass(1);
      }
    } catch {
      this.applySolidWindowClass(1);
    }
  }

  applySolidWindowClass(value) {
    const opacity = parseFloat(value) || 1;
    const solid = opacity >= 0.999;
    const html = document.documentElement;
    if (solid) html.classList.add('solid-window');
    else html.classList.remove('solid-window');

    // Apply opacity to CSS custom property for background transparency
    html.style.setProperty('--window-bg-opacity', opacity.toString());
  }

  async handleExplainClipboard(text) {
    await this.cancelActiveShortcut();
    // Switch to chat tab when shortcut is triggered
    if (window.switchToTab) window.switchToTab('chat');
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    this.disableAutoScrollCount++;

    // Performance optimization: batch DOM operations in single frame
    requestAnimationFrame(() => {
      this.addMessage('system-question', content);
      this.showTypingIndicator();

      // Scroll to bottom after messages are added
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    });

    try {
      // Build history context in parallel with DOM operations
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateTextExplanation(
        content,
        historyText,
        this.webSearchEnabled
      );

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  async handleExplainClipboardDetailed(text) {
    await this.cancelActiveShortcut();
    // Switch to chat tab when shortcut is triggered
    if (window.switchToTab) window.switchToTab('chat');
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    this.disableAutoScrollCount++;

    // Performance optimization: batch DOM operations in single frame
    requestAnimationFrame(() => {
      this.addMessage('system-question', content);
      this.showTypingIndicator();

      // Scroll to bottom after messages are added
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    });

    try {
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateDetailedExplanation(
        content,
        historyText,
        this.webSearchEnabled
      );

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  normalizeUrlForShortcut(url) {
    try {
      const normalized = new URL(String(url || '').trim());
      if (!/^https?:$/i.test(normalized.protocol)) return '';
      return normalized.toString();
    } catch (error) {
      return '';
    }
  }

  formatUrlContextQuestion(url, mode = 'summary') {
    try {
      if (mode === 'detailed') {
        const label = getUIText('urlContextDetailed', url);
        if (label && label !== 'urlContextDetailed') return label;
      } else {
        const label = getUIText('urlContextSummary', url);
        if (label && label !== 'urlContextSummary') return label;
      }
    } catch {}
    const prefix = mode === 'detailed' ? 'URL detailed review:' : 'URL summary:';
    return `${prefix}\n${url}`;
  }

  async handleSummarizeUrlContext(url) {
    await this.cancelActiveShortcut();
    // Switch to chat tab when shortcut is triggered
    if (window.switchToTab) window.switchToTab('chat');
    const token = ++this.shortcutRequestId;
    const targetUrl = this.normalizeUrlForShortcut(url);
    if (!targetUrl) return;
    this.disableAutoScrollCount++;

    // Performance optimization: batch DOM operations in single frame
    requestAnimationFrame(() => {
      this.addMessage('system-question', this.formatUrlContextQuestion(targetUrl, 'summary'));
      this.showTypingIndicator();

      // Scroll to bottom after messages are added
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    });

    try {
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateUrlSummary(
        targetUrl,
        historyText,
        'summary'
      );

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  async handleSummarizeUrlContextDetailed(url) {
    await this.cancelActiveShortcut();
    // Switch to chat tab when shortcut is triggered
    if (window.switchToTab) window.switchToTab('chat');
    const token = ++this.shortcutRequestId;
    const targetUrl = this.normalizeUrlForShortcut(url);
    if (!targetUrl) return;
    this.disableAutoScrollCount++;

    // Performance optimization: batch DOM operations in single frame
    requestAnimationFrame(() => {
      this.addMessage('system-question', this.formatUrlContextQuestion(targetUrl, 'detailed'));
      this.showTypingIndicator();

      // Scroll to bottom after messages are added
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    });

    try {
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateUrlSummary(
        targetUrl,
        historyText,
        'detailed'
      );

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  async handleTranslateClipboard(text) {
    await this.cancelActiveShortcut();
    // Switch to chat tab when shortcut is triggered
    if (window.switchToTab) window.switchToTab('chat');
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    this.disableAutoScrollCount++;

    // Performance optimization: batch DOM operations in single frame
    requestAnimationFrame(() => {
      this.addMessage('system-question', getUIText('selectionTranslation'));
      this.showTypingIndicator();

      // Scroll to bottom after messages are added
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    });

    try {
      const response = await this.geminiService.generatePureTranslation(content);
      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  /**
   * 選択テキストへの返信バリエーションを生成
   */
  async handleReplyClipboard(text) {
    await this.cancelActiveShortcut();
    // Switch to chat tab when shortcut is triggered
    if (window.switchToTab) window.switchToTab('chat');
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    this.disableAutoScrollCount++;

    // Performance optimization: batch DOM operations in single frame
    requestAnimationFrame(() => {
      const label = getUIText('selectionReplies');
      const questionLabel =
        label && label !== 'selectionReplies'
          ? label
          : getCurrentUILanguage() === 'ja'
            ? '選択範囲への返信バリエーション'
            : 'Reply variations for selection';
      this.addMessage('system-question', questionLabel);
      this.showTypingIndicator();

      // Scroll to bottom after messages are added
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    });

    try {
      const response = await this.geminiService.generateReplyVariations(content);
      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  /**
   * スクリーンショット画像の内容を解説する
   */
  async handleExplainScreenshot(payload) {
    try {
      await this.cancelActiveShortcut();
      // Switch to chat tab when shortcut is triggered
      if (window.switchToTab) window.switchToTab('chat');
      const token = ++this.shortcutRequestId;
      const data = payload && payload.data ? String(payload.data) : '';
      const mime = payload && payload.mimeType ? String(payload.mimeType) : 'image/png';
      if (!data) return;
      this.disableAutoScrollCount++;

      // Performance optimization: batch DOM operations in single frame
      requestAnimationFrame(() => {
        this.addMessage('system-question', getUIText('selectionExplanation'));
        this.showTypingIndicator();

        // Scroll to bottom after messages are added
        requestAnimationFrame(() => {
          if (this.chatHistory && this.chatHistory.isConnected) {
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
          }
        });
      });

      // Build history context in parallel with DOM operations
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateImageExplanation(
        data,
        mime,
        historyText,
        this.webSearchEnabled
      );

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  async handleExplainScreenshotDetailed(payload) {
    try {
      await this.cancelActiveShortcut();
      // Switch to chat tab when shortcut is triggered
      if (window.switchToTab) window.switchToTab('chat');
      // Restore scroll state after tab switch
      const chatHistory = this.chatHistory;
      if (chatHistory && chatHistory.isConnected) {
        this.chatHistory.style.overflowY = 'auto';
        setTimeout(() => {
          const chatHistory = this.chatHistory;
          if (chatHistory && chatHistory.isConnected) {
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
          }
        }, 0);
      }
      const token = ++this.shortcutRequestId;
      const data = payload && payload.data ? String(payload.data) : '';
      const mime = payload && payload.mimeType ? String(payload.mimeType) : 'image/png';
      if (!data) return;
      this.disableAutoScrollCount++;
      this.addMessage('system-question', getUIText('selectionExplanation'));
      this.showTypingIndicator();
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateImageDetailedExplanation(
        data,
        mime,
        historyText,
        this.webSearchEnabled
      );

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  /**
   * Handle slide image generation from shortcut key (Option+Control+A)
   * Uses the same core logic as @slide command
   */
  async handleGenerateSlideImage(text) {
    try {
      await this.cancelActiveShortcut();
      // Switch to chat tab when shortcut is triggered
      if (window.switchToTab) window.switchToTab('chat');
      // Restore scroll state after tab switch
      const chatHistory = this.chatHistory;
      if (chatHistory && chatHistory.isConnected) {
        this.chatHistory.style.overflowY = 'auto';
        setTimeout(() => {
          const chatHistory = this.chatHistory;
          if (chatHistory && chatHistory.isConnected) {
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
          }
        }, 0);
      }
      const token = ++this.shortcutRequestId;
      const trimmed = (text || '').trim();
      if (!trimmed) return;

      this.disableAutoScrollCount++;
      this.addMessage('system-question', getUIText('slideImageGenerating'));
      this.showTypingIndicator();

      // Use shared core logic for slide image generation
      const result = await this._generateSlideImageCore(trimmed);

      if (token !== this.shortcutRequestId) {
        return;
      }
      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }

      if (result?.imageBase64) {
        this.addImagesMessage([result], trimmed.substring(0, 50));
      } else {
        this.addMessage('system', getUIText('errorOccurred'));
      }
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  async cancelActiveShortcut() {
    try {
      if (window?.electronAPI?.cancelAI) {
        await window.electronAPI.cancelAI();
      }
      this.hideTypingIndicator();
    } catch {}
  }

  updateMonitoringUI() {
    this.messageInput.disabled = false;
    this.sendBtn.disabled = false;
    this.clearWelcomeMessage();
    this.createIconsEnhanced();
  }

  clearWelcomeMessage() {
    const welcomeMessage = this.chatHistory.querySelector('.flex.flex-col.items-center');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
  }

  async sendMessage() {
    // Prevent duplicate execution (e.g., Enter key spam, button click spam)
    if (this.isSending) return;

    let message = this.messageInput.value.trim();
    if (!message && !this.currentCommandMode) return;

    // If command badge is active, prepend the command
    if (this.currentCommandMode === 'image') {
      message = `@image ${message}`;
    } else if (this.currentCommandMode === 'video') {
      message = `@video ${message}`;
    } else if (this.currentCommandMode === 'slide') {
      message = `@slide ${message}`;
    }

    if (!message.trim()) return;

    // Acquire lock to prevent concurrent execution
    this.isSending = true;

    try {
      const attachments = [...this.attachedFiles];

      this.messageInput.value = '';
      this.autosizeMessageInput(true);
      this.clearAttachments();
      this.clearInputCommandBadge();
      this.messageInput.focus();

      if (message.startsWith('/')) {
        await this.handleSlashCommand(message);
        this.autosizeMessageInput(true);
        this.messageInput.focus();
        this.isSending = false; // Release lock before return
        return;
      }

      const imageCommandMatch = message.match(/^@image\s+(.+)$/i);
      if (imageCommandMatch) {
        const imagePrompt = imageCommandMatch[1].trim();
        await this.handleImageGeneration(imagePrompt, attachments);
        this.autosizeMessageInput(true);
        this.messageInput.focus();
        this.isSending = false; // Release lock before return
        return;
      }

      const videoCommandMatch = message.match(/^@video\s+(.+)$/i);
      if (videoCommandMatch) {
        const videoPrompt = videoCommandMatch[1].trim();
        await this.handleVideoGeneration(videoPrompt, attachments);
        this.autosizeMessageInput(true);
        this.messageInput.focus();
        this.isSending = false; // Release lock before return
        return;
      }

      const slideCommandMatch = message.match(/^@slide\s+(.+)$/i);
      if (slideCommandMatch) {
        const slidePrompt = slideCommandMatch[1].trim();
        await this.handleSlideGeneration(slidePrompt);
        this.autosizeMessageInput(true);
        this.messageInput.focus();
        this.isSending = false; // Release lock before return
        return;
      }

      this.addMessage('user', message, attachments);
      if (this.maybeRespondIdentity(message)) {
        this.messageInput?.focus();
        this.isSending = false; // Release lock before return
        return;
      }
      this.disableAutoScrollCount++;
      this.showTypingIndicator();

      try {
        const historyText = this.buildHistoryContext();
        let response;

        if (attachments && attachments.length > 0) {
          response = await this.geminiService.generateResponseWithAttachments(
            message,
            historyText,
            attachments,
            this.webSearchEnabled
          );
        } else {
          response = await this.geminiService.generateResponse(
            message,
            historyText,
            this.webSearchEnabled
          );
        }

        // Check cancel before adding message
        if (this.cancelRequested) {
          return;
        }
        this.addMessage('ai', response);
        this.messageInput?.focus();
      } catch (error) {
        if (this.cancelRequested || /CANCELLED|Abort/i.test(String(error?.message || ''))) {
          return;
        }
        this.addMessage('system', `${getUIText('errorOccurred')}: ${error.message}`);
        this.messageInput?.focus();
      } finally {
        // Always hide typing indicator (even if cancelled)
        this.hideTypingIndicator();
        // Only reset auto-scroll if not cancelled (prevent scroll state corruption)
        if (!this.cancelRequested) {
          this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
        }
        // Always release the lock to allow next message
        this.isSending = false;
      }
    } catch (outerError) {
      // Outer catch for slash commands and special commands
      this.isSending = false;
    }
  }

  maybeRespondIdentity(text) {
    try {
      const t = (text || '').trim();
      if (!t) return false;
      const isJa = getCurrentUILanguage && getCurrentUILanguage() === 'ja';
      const jaRe =
        /(あなた|君|お前).*(誰|だれ|何|なに)|自己紹介|どんな\s*(?:アプリ|AI)|誰が作っ|どこが作っ|開発者|作者|会社|何者|君は誰|あなたは誰/;
      const enRe =
        /(who\s+are\s+you|what\s+are\s+you|tell\s+me\s+about\s+(?:you|yourself)|about\s+you|your\s+name|who\s+(?:made|created|built|developed)\s+you|what\s+company)/i;
      const matched = isJa ? jaRe.test(t) : enRe.test(t);
      if (!matched) return false;
      const reply = this.pickIdentityResponse(isJa ? 'ja' : 'en');
      const prev = this.disableAutoScrollCount;
      this.disableAutoScrollCount++;
      try {
        this.addMessage('ai', reply);
      } finally {
        this.disableAutoScrollCount = prev;
      }
      return true;
    } catch {
      return false;
    }
  }

  pickIdentityResponse(lang) {
    const ja = [
      'IrukaDarkです。CORe Inc.製の小さな相棒AI。さっと答えます。',
      '私はIrukaDark。CORe Inc.生まれのデスクトップAIです。',
      'IrukaDark—CORe Inc.がつくった、軽快で手軽なAIです。',
      '呼ばれて飛び出るIrukaDark。CORe Inc.製、素早く要点を届けます。',
      'どうも、IrukaDarkです。CORe Inc.発のミニAI。日常の「ちょっと」を解決します。',
      'IrukaDarkです。CORe Inc.製。小さくても頼れる、常駐型AI。',
    ];
    const en = [
      "I'm IrukaDark — a tiny desktop AI made by CORe Inc.",
      'Hi, IrukaDark here. Built at CORe Inc. to help fast.',
      'IrukaDark, crafted by CORe Inc. Small app, quick answers.',
      'I am IrukaDark, a lightweight helper AI by CORe Inc.',
      'IrukaDark — born at CORe Inc. Here to keep things snappy.',
      'Hey! I’m IrukaDark. Made by CORe Inc. for instant help.',
    ];
    const arr = lang === 'ja' ? ja : en;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Execute a slash command with consistent scrolling behavior:
   * 1. Show system message (trigger scroll)
   * 2. Lock scroll
   * 3. Generate content
   * 4. Show content (scroll locked)
   * 5. Unlock scroll
   */
  async executeSlashCommandWrapper(startMessage, action) {
    let scrollLocked = false;
    try {
      // 1. Add system message (scrolls to bottom)
      this.addMessage('system', startMessage);

      // 2. Lock scrolling
      this.disableAutoScrollCount++;
      scrollLocked = true;

      this.showTypingIndicator();
      const result = await action();
      this.hideTypingIndicator();

      if (this.cancelRequested) return null;

      // 3. Add AI message (scrolling is locked)
      if (result) {
        this.addMessage('ai', result);
      }
      return result;
    } catch (e) {
      this.hideTypingIndicator();
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return null;
      }
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      return null;
    } finally {
      if (scrollLocked) {
        this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
      }
    }
  }

  async handleSlashCommand(input) {
    const cmd = (input || '').trim();
    const lower = cmd.toLowerCase();
    const translate = SLASH_TRANSLATE_LOOKUP[lower];
    if (translate) {
      await this.runSlashTranslation(translate.target || lower.split('_')[1] || 'en', translate);
      return;
    }
    if (lower === '/translate literal' || lower === '/translate mode literal') {
      await this.setTranslateMode('literal');
      return;
    }
    if (lower === '/translate free' || lower === '/translate mode free') {
      await this.setTranslateMode('free');
      return;
    }
    if (lower === '/translate status' || lower === '/translate mode status') {
      this.showTranslateModeStatus();
      return;
    }
    if (lower === '/clear') {
      try {
        // Abort all active event listeners to prevent memory leaks
        const chatHistory = this.chatHistory;
        if (chatHistory && chatHistory.isConnected) {
          const messageElements = this.chatHistory.querySelectorAll(
            '.message-ai, .message-system, .message-system-question, .message-fallback'
          );
          messageElements.forEach((el) => {
            const controller = this.messageAbortControllers.get(el);
            if (controller) {
              controller.abort();
              this.messageAbortControllers.delete(el);
            }
          });
        }

        this.chatHistoryData = [];
        if (this.chatHistory) this.chatHistory.innerHTML = '';
        if (this.geminiService) {
          this.geminiService.lastGeneratedImage = null;
        }

        // Clear history context cache
        this.clearHistoryContextCache();

        // Show shortcut hints after clearing chat
        this.showShortcutHints();
      } catch (e) {
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      }
      return;
    }

    if (lower === '/compact') {
      const summary = await this.executeSlashCommandWrapper('Executing /compact...', async () => {
        const historyText = this.buildHistoryContext(8000, 30);
        return this.geminiService.generateHistorySummary(historyText, this.webSearchEnabled);
      });

      if (summary) {
        this.chatHistoryData = [{ role: 'assistant', content: summary }];
        this.addMessage('system', getUIText('historyCompacted'));
      }
      return;
    }

    if (lower === '/next') {
      const lastAI = [...(this.chatHistoryData || [])]
        .reverse()
        .find((m) => m && m.role === 'assistant' && m.content);
      if (!lastAI) {
        this.addMessage('system', getUIText('noPreviousAI'));
        return;
      }

      await this.executeSlashCommandWrapper('Executing /next...', async () => {
        const historyText = this.buildHistoryContext(8000, 30);
        return this.geminiService.generateContinuation(
          String(lastAI.content || ''),
          historyText,
          this.webSearchEnabled
        );
      });
      return;
    }

    if (lower === '/table') {
      const lastAI = [...(this.chatHistoryData || [])]
        .reverse()
        .find((m) => m && m.role === 'assistant' && m.content);
      if (!lastAI) {
        this.addMessage('system', getUIText('noPreviousAI'));
        return;
      }

      await this.executeSlashCommandWrapper('Executing /table...', async () => {
        const historyText = this.buildHistoryContext(8000, 30);
        return this.geminiService.generateTableFromText(
          String(lastAI.content || ''),
          historyText,
          this.webSearchEnabled
        );
      });
      return;
    }

    // Clarify last AI output: /What do you mean?
    if (lower === '/what do you mean?') {
      const lastAI = [...(this.chatHistoryData || [])]
        .reverse()
        .find((m) => m && m.role === 'assistant' && m.content);
      if (!lastAI) {
        this.addMessage('system', getUIText('noPreviousAI'));
        return;
      }

      await this.executeSlashCommandWrapper('Executing /what do you mean?...', async () => {
        const historyText = this.buildHistoryContext(8000, 30);
        return this.geminiService.generateClarificationFromText(
          String(lastAI.content || ''),
          historyText,
          this.webSearchEnabled
        );
      });
      return;
    }

    if (lower.startsWith('/image ') || lower === '/image') {
      const parts = cmd
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const subCmd = (parts[1] || '').toLowerCase();

      if (subCmd === 'status') {
        this.showImageSizeStatus();
        this.showImageCountStatus();
        return;
      }

      if (subCmd === 'size') {
        const sizeValue = (parts[2] || '').toLowerCase();
        const validSizes = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3'];
        if (validSizes.includes(sizeValue)) {
          await this.setImageSize(sizeValue);
          return;
        }
        this.addMessage('system', getUIText('imageSizeHelp'));
        return;
      }

      if (subCmd === 'count') {
        const countValue = parseInt(parts[2], 10);
        const validCounts = [1, 2, 3, 4];
        if (validCounts.includes(countValue)) {
          await this.setImageCount(countValue);
          return;
        }
        this.addMessage('system', getUIText('imageCountHelp'));
        return;
      }

      this.addMessage('system', getUIText('imageCommandHelp'));
      return;
    }

    if (lower.startsWith('/video ') || lower === '/video') {
      const parts = cmd
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const subCmd = (parts[1] || '').toLowerCase();

      if (subCmd === 'status') {
        this.showVideoStatus();
        return;
      }

      if (subCmd === 'size') {
        const sizeValue = (parts[2] || '').toLowerCase();
        const validRatios = ['16:9', '9:16'];
        if (validRatios.includes(sizeValue)) {
          await this.setVideoAspectRatio(sizeValue);
          return;
        }
        this.addMessage('system', getUIText('videoSizeHelp'));
        return;
      }

      if (subCmd === 'quality') {
        const qualityValue = (parts[2] || '').toLowerCase();
        const validResolutions = ['720p', '1080p'];
        if (validResolutions.includes(qualityValue)) {
          await this.setVideoResolution(qualityValue);
          return;
        }
        this.addMessage('system', getUIText('videoQualityHelp'));
        return;
      }

      if (subCmd === 'duration') {
        const durationValue = parseInt(parts[2], 10);
        if (!isNaN(durationValue) && durationValue >= 4 && durationValue <= 8) {
          await this.setVideoDuration(durationValue);
          return;
        }
        this.addMessage('system', getUIText('videoDurationHelp'));
        return;
      }

      if (subCmd === 'count') {
        const countValue = parseInt(parts[2], 10);
        if (!isNaN(countValue) && countValue >= 1 && countValue <= 4) {
          await this.setVideoCount(countValue);
          return;
        }
        this.addMessage('system', getUIText('videoCountHelp'));
        return;
      }

      this.addMessage('system', getUIText('videoCommandHelp'));
      return;
    }

    if (lower.startsWith('/slide ') || lower === '/slide') {
      const parts = cmd
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const subCmd = (parts[1] || '').toLowerCase();

      if (subCmd === 'status') {
        this.showSlideStatus();
        return;
      }

      if (subCmd === 'size') {
        const sizeValue = (parts[2] || '').toLowerCase();
        const validRatios = ['16:9', '9:16', '4:3', '3:4', '1:1'];
        if (validRatios.includes(sizeValue)) {
          await this.setSlideSize(sizeValue);
          return;
        }
        this.addMessage('system', getUIText('slideSizeHelp'));
        return;
      }

      if (subCmd === 'prompt') {
        await this.openSlidePromptDialog();
        return;
      }

      this.addMessage('system', getUIText('slideCommandHelp'));
      return;
    }

    if (lower.startsWith('/websearch') || lower.startsWith('/web ') || lower === '/web') {
      const parts = cmd
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const act = (parts[1] || '').toLowerCase();
      if (act === 'on') {
        this.webSearchEnabled = true;
        if (window.electronAPI && window.electronAPI.saveWebSearchSetting) {
          window.electronAPI.saveWebSearchSetting(true);
        }
        this.addMessage('system', getUIText('webSearchEnabled'));
        return;
      }
      if (act === 'off') {
        this.webSearchEnabled = false;
        if (window.electronAPI && window.electronAPI.saveWebSearchSetting) {
          window.electronAPI.saveWebSearchSetting(false);
        }
        this.addMessage('system', getUIText('webSearchDisabled'));
        return;
      }
      if (act === 'status' || act === 'state') {
        this.addMessage(
          'system',
          this.webSearchEnabled ? getUIText('webSearchStatusOn') : getUIText('webSearchStatusOff')
        );
        return;
      }
      // default help
      this.addMessage('system', getUIText('webSearchHelp'));
      return;
    }

    this.addMessage('system', getUIText('availableCommands'));
  }

  async runSlashTranslation(targetCode, meta = null) {
    const lastAI = [...(this.chatHistoryData || [])]
      .reverse()
      .find((m) => m && m.role === 'assistant' && m.content);
    if (!lastAI) {
      this.addMessage('system', getUIText('noPreviousAI'));
      return;
    }

    const code = normalizeTranslateCode(meta?.target || targetCode) || 'en';
    const langName = getLanguageDisplayName(code);

    await this.executeSlashCommandWrapper(`Executing /translate (${langName})...`, async () => {
      return this.geminiService.generateTargetedTranslation(
        String(lastAI.content || ''),
        code,
        this.translateMode
      );
    });
  }

  async handleImageGeneration(prompt, attachments = []) {
    try {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
      this.addMessage('user', `@image ${prompt}`, attachments);
      this.showTypingIndicator();

      const aspectRatio = this.imageSize === 'auto' ? '1:1' : this.imageSize;
      const count = this.imageCount || 1;

      const referenceFiles = this.getAllReferenceFiles(attachments);
      const generatePromises = Array(count)
        .fill(null)
        .map(() => this.generateSingleImage(prompt, aspectRatio, referenceFiles));

      const results = await Promise.all(generatePromises);
      this.hideTypingIndicator();

      if (!this.cancelRequested) {
        const validResults = results.filter((result) => result?.imageBase64);
        if (validResults.length > 0) {
          this.addImagesMessage(validResults, prompt);
        }
      }
    } catch (error) {
      this.hideTypingIndicator();
      if (!this.cancelRequested && !/CANCELLED|Abort/i.test(String(error?.message || ''))) {
        this.addMessage('system', `${getUIText('errorOccurred')}: ${error?.message || 'Unknown'}`);
      }
    }
  }

  getAllReferenceFiles(attachments) {
    if (!attachments?.length) return [];
    // 画像生成では画像ファイルのみを参照として使用
    return attachments.filter((f) => f.type.startsWith('image/'));
  }

  async generateSingleImage(prompt, aspectRatio, referenceFiles) {
    if (referenceFiles && referenceFiles.length > 0) {
      return this.geminiService.generateImageFromTextWithReference(
        prompt,
        aspectRatio,
        referenceFiles
      );
    }
    return this.geminiService.generateImageFromText(prompt, aspectRatio);
  }

  async handleVideoGeneration(prompt, attachments = []) {
    try {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
      this.addMessage('user', `@video ${prompt}`, attachments);
      this.showTypingIndicator(getUIText('videoGenerating') || 'Generating video...');

      const aspectRatio = this.videoAspectRatio || '16:9';
      const durationSeconds = this.videoDuration || 8;
      const resolution = this.videoResolution || '720p';
      const count = this.videoCount || 1;

      // Get reference image if provided
      const referenceFiles = this.getAllReferenceFiles(attachments);
      const referenceImage = referenceFiles.length > 0 ? referenceFiles[0] : null;

      const generatePromises = Array(count)
        .fill(null)
        .map(() =>
          this.generateSingleVideo(prompt, aspectRatio, durationSeconds, resolution, referenceImage)
        );

      const results = await Promise.all(generatePromises);
      this.hideTypingIndicator();

      if (!this.cancelRequested) {
        const validResults = results.filter((result) => result?.videoBase64);
        if (validResults.length > 0) {
          this.addVideosMessage(validResults, prompt);
        }
      }
    } catch (error) {
      this.hideTypingIndicator();
      if (!this.cancelRequested && !/CANCELLED|Abort/i.test(String(error?.message || ''))) {
        this.addMessage('system', `${getUIText('errorOccurred')}: ${error?.message || 'Unknown'}`);
      }
    }
  }

  /**
   * Handle @slide command - generates slide image from user prompt
   * Uses the same settings as Option+Control+A shortcut (/slide size, /slide prompt)
   */
  async handleSlideGeneration(prompt) {
    try {
      this.addMessage('user', `@slide ${prompt}`);
      this.disableAutoScrollCount++;
      this.showTypingIndicator(getUIText('slideImageGenerating') || 'Generating slide image...');

      const result = await this._generateSlideImageCore(prompt);

      this.hideTypingIndicator();

      if (this.cancelRequested) {
        return;
      }

      if (result?.imageBase64) {
        this.addImagesMessage([result], prompt.substring(0, 50));
      } else {
        this.addMessage('system', getUIText('errorOccurred') || 'Error occurred');
      }
    } catch (error) {
      this.hideTypingIndicator();
      if (!this.cancelRequested && !/CANCELLED|Abort/i.test(String(error?.message || ''))) {
        this.addMessage('system', `${getUIText('errorOccurred')}: ${error?.message || 'Unknown'}`);
      }
    } finally {
      this.disableAutoScrollCount = Math.max(0, this.disableAutoScrollCount - 1);
    }
  }

  /**
   * Core slide image generation logic - shared by @slide command and shortcut
   * @param {string} content - The content to generate slide image from
   * @returns {Promise<{imageBase64: string, mimeType: string}|null>}
   */
  async _generateSlideImageCore(content) {
    const basePrompt = this.slidePrompt || this.getDefaultSlidePrompt();
    const fullPrompt = `${basePrompt}

Content:
${content}`;
    const aspectRatio = this.slideSize || '16:9';
    return this.geminiService.generateImageFromText(fullPrompt, aspectRatio);
  }

  async generateSingleVideo(prompt, aspectRatio, durationSeconds, resolution, referenceImage) {
    return this.geminiService.generateVideoFromText(
      prompt,
      aspectRatio,
      durationSeconds,
      resolution,
      referenceImage
    );
  }

  addVideosMessage(results, altText = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';

    const videosContainer = document.createElement('div');
    videosContainer.className = 'videos-container';

    results.forEach(({ videoBase64, mimeType }) => {
      const video = document.createElement('video');
      video.src = `data:${mimeType};base64,${videoBase64}`;
      video.controls = true;
      video.setAttribute('controlsList', 'nofullscreen');
      video.className = 'generated-video';
      video.style.maxWidth = '100%';
      video.style.borderRadius = '8px';
      video.style.marginBottom = '8px';

      videosContainer.appendChild(video);
    });

    messageDiv.appendChild(videosContainer);
    this.chatHistory.appendChild(messageDiv);

    // Video generation result scroll disabled - only user/system messages should trigger scroll
  }

  addImagesMessage(results, altText = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';

    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'images-container';

    results.forEach(({ imageBase64, mimeType }) => {
      const img = document.createElement('img');
      img.src = `data:${mimeType};base64,${imageBase64}`;
      img.alt = altText;
      img.className = 'generated-image';
      img.style.cursor = 'pointer';

      // クリックで拡大表示（オプション）
      img.addEventListener('click', () => {
        this.showImageOverlay(imageBase64, mimeType, altText, img);
      });

      imagesContainer.appendChild(img);
    });

    messageDiv.appendChild(imagesContainer);

    if (!this.chatHistory) return;

    this.chatHistory.appendChild(messageDiv);

    // Image generation result scroll disabled - only user/system messages should trigger scroll
  }

  showImageOverlay(imageBase64, mimeType, altText, imgElement) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';
    overlay.style.cursor = 'pointer';

    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.style.position = 'relative';
    imageContainer.style.maxWidth = '90%';
    imageContainer.style.maxHeight = '90%';

    const enlargedImg = document.createElement('img');
    enlargedImg.src = imgElement.src;
    enlargedImg.style.maxWidth = '100%';
    enlargedImg.style.maxHeight = '90vh';
    enlargedImg.style.objectFit = 'contain';
    enlargedImg.style.display = 'block';

    // Helper to create overlay action buttons
    const createOverlayButton = (svgContent, rightPos, onClick) => {
      const btn = document.createElement('button');
      btn.innerHTML = svgContent;
      Object.assign(btn.style, {
        position: 'absolute',
        top: '10px',
        right: rightPos,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: 'none',
        borderRadius: '50%',
        width: '24px',
        height: '24px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)',
        transition: 'all 0.2s ease',
        zIndex: '10001',
        color: '#1f2937',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = 'rgba(255, 255, 255, 1)';
        btn.style.transform = 'scale(1.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        btn.style.transform = 'scale(1)';
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return btn;
    };

    const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const downloadSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

    const copyBtn = createOverlayButton(copySvg, '38px', async () => {
      const success = await this.copyImageToClipboard(imageBase64, mimeType);
      if (success) {
        copyBtn.innerHTML = checkSvg;
        copyBtn.style.color = '#22c55e';
        setTimeout(() => {
          copyBtn.innerHTML = copySvg;
          copyBtn.style.color = '#1f2937';
        }, 1500);
      }
    });
    const downloadBtn = createOverlayButton(downloadSvg, '10px', () =>
      this.downloadImage(imageBase64, mimeType, altText)
    );

    imageContainer.appendChild(enlargedImg);
    imageContainer.appendChild(copyBtn);
    imageContainer.appendChild(downloadBtn);
    overlay.appendChild(imageContainer);

    // Close overlay when clicking anywhere except buttons
    overlay.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    document.body.appendChild(overlay);
  }

  downloadImage(imageBase64, mimeType, description) {
    const showError = () => {
      this.addMessage('system', `${getUIText('errorOccurred')}: Failed to download image`);
    };

    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) return showError();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `irukadark_${this.generateImageFileName(description)}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      };
      img.onerror = showError;
      img.src = `data:${mimeType};base64,${imageBase64}`;
    } catch (e) {
      showError();
    }
  }

  async copyImageToClipboard(imageBase64, mimeType) {
    try {
      if (window.electronAPI?.copyToClipboard) {
        const dataUrl = `data:${mimeType};base64,${imageBase64}`;
        const result = await window.electronAPI.copyToClipboard({ imageData: dataUrl });
        return !!result;
      }
      return false;
    } catch {
      return false;
    }
  }

  generateImageFileName(description) {
    try {
      // Extract English words from description
      const text = String(description || 'image').toLowerCase();

      // Remove common articles, prepositions, and conjunctions
      const stopWords = new Set([
        'a',
        'an',
        'the',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'for',
        'of',
        'with',
        'by',
        'from',
        'as',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
      ]);

      // Extract words (alphanumeric only)
      const matches = text.match(/[a-z0-9]+/g);

      if (!matches || matches.length === 0) {
        return 'image';
      }

      const words = matches.filter((word) => word.length > 0 && !stopWords.has(word)).slice(0, 5); // Limit to 5 words

      if (words.length === 0) {
        return 'image';
      }

      // Join with underscore
      return words.join('_').substring(0, 50);
    } catch (error) {
      return 'image';
    }
  }

  initSlashSuggest() {
    this.slashCommands = [
      // 1) New command at the top
      {
        key: '/what do you mean?',
        match: '/what do you mean?',
        label: '/What do you mean?',
        descKey: 'slashDescriptions.what',
      },
      // 2) /next second
      {
        key: '/next',
        match: '/next',
        label: '/next',
        descKey: 'slashDescriptions.next',
      },
      // 3) /clear third
      {
        key: '/clear',
        match: '/clear',
        label: '/clear',
        descKey: 'slashDescriptions.clear',
      },

      // Others
      {
        key: '/translate',
        match: '/translate',
        label: '/translate',
        descKey: 'slashDescriptions.translate',
        children: SLASH_TRANSLATE_TARGETS,
        childSeparator: '_',
      },
      {
        key: '/translate mode',
        match: '/translate mode',
        label: '/translate mode',
        descKey: 'slashDescriptions.translateMode',
        children: SLASH_TRANSLATE_MODE_TARGETS,
        childSeparator: ' ',
        childBase: '/translate',
        childMatchBase: '/translate',
      },
      {
        key: '/table',
        match: '/table',
        label: '/table',
        descKey: 'slashDescriptions.table',
      },
      {
        key: '/compact',
        match: '/compact',
        label: '/compact',
        descKey: 'slashDescriptions.compact',
      },
      {
        key: '/web',
        match: '/web',
        label: '/web',
        descKey: 'slashDescriptions.web',
        children: SLASH_WEB_TARGETS,
        childSeparator: ' ',
      },
      {
        key: '/image',
        match: '/image',
        label: '/image',
        descKey: 'slashDescriptions.image',
        children: SLASH_IMAGE_TARGETS,
        childSeparator: ' ',
      },
      {
        key: '/video',
        match: '/video',
        label: '/video',
        descKey: 'slashDescriptions.video',
        children: SLASH_VIDEO_TARGETS,
        childSeparator: ' ',
      },
      {
        key: '/slide',
        match: '/slide',
        label: '/slide',
        descKey: 'slashDescriptions.slide',
        children: SLASH_SLIDE_TARGETS,
        childSeparator: ' ',
      },
    ];
    this.slashCommands = this.slashCommands.map((cmd) => ({
      ...cmd,
      match: (cmd.match || cmd.key || cmd.label || '').toLowerCase(),
    }));
    this.suggestIndex = -1;
    this.suggestVisible = false;
    const wrapper = document.getElementById('inputWrapper');
    const box = document.createElement('div');
    box.id = 'slashSuggest';
    box.className = 'slash-suggest hidden';
    const list = document.createElement('div');
    list.className = 'slash-suggest-list';
    box.appendChild(list);
    if (wrapper) wrapper.appendChild(box);
    this.suggestBox = box;
    this.suggestList = list;
    box.addEventListener('mousedown', (e) => {
      const item = e.target.closest('[data-cmd]');
      if (!item) return;
      e.preventDefault();
      const cmd = item.getAttribute('data-cmd');
      this.applySlashSelection(cmd, true);
    });
  }

  renderSlashSuggest(items) {
    if (!this.suggestList) return;
    this.suggestList.innerHTML = '';
    const lang = getCurrentUILanguage();
    items.forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'slash-suggest-item' + (i === this.suggestIndex ? ' active' : '');
      div.setAttribute('data-cmd', c.key);
      if (c.children?.length) {
        div.classList.add('has-children');
      }
      let desc = '';
      if (c.descKey) {
        if (c.descKey === 'slashTranslateIntoLanguage') {
          const displayName = getLanguageDisplayName(c.languageCode || c.target || 'en');
          desc = getUIText(c.descKey, displayName);
        } else {
          desc = getUIText(c.descKey);
        }
      } else if (c.desc?.[lang]) {
        desc = c.desc[lang];
      } else if (c.desc?.en) {
        desc = c.desc.en;
      } else {
        desc = c.label;
      }
      const childIndicator = c.children?.length ? '<span class="child-indicator">›</span>' : '';
      div.innerHTML = `
        <div class="slash-line"><span class="cmd">${c.label}</span>${childIndicator}</div>
        <span class="desc">${desc}</span>
      `;
      this.suggestList.appendChild(div);
    });
    // Keep the active item visible when navigating
    try {
      const active = this.suggestList.querySelector('.slash-suggest-item.active');
      if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } catch {}
  }

  showSlashSuggest(items) {
    if (!this.suggestBox) return;
    this.suggestVisible = true;
    this.suggestBox.classList.remove('hidden');
    this.suggestIndex = items.length ? 0 : -1;
    this.renderSlashSuggest(items);
  }

  hideSlashSuggest() {
    if (!this.suggestBox) return;
    this.suggestVisible = false;
    this.suggestBox.classList.add('hidden');
    this.suggestIndex = -1;
    if (this.suggestList) this.suggestList.innerHTML = '';
  }

  currentSlashCandidates() {
    const raw = this.messageInput?.value || '';
    const value = raw.replace(/^\s+/, '');
    if (!value.startsWith('/')) return [];
    const lower = value.toLowerCase();
    const normalized = lower.trim();
    if (normalized.startsWith('/translate_')) {
      return SLASH_TRANSLATE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/translate mode')) {
      const wantsChildren =
        normalized === '/translate mode' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_TRANSLATE_MODE_TARGETS;
      }
      return SLASH_TRANSLATE_MODE_TARGETS.filter((c) =>
        c.match.startsWith(normalized.replace('/translate mode', '/translate').trim())
      );
    }
    if (normalized.startsWith('/translate ')) {
      return SLASH_TRANSLATE_MODE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized === '/translate' && (raw.endsWith(' ') || lower.endsWith(' '))) {
      return SLASH_TRANSLATE_MODE_TARGETS;
    }
    if (normalized.startsWith('/websearch')) {
      const aliased = normalized.replace(/^\/websearch/, '/web');
      if (aliased.startsWith('/web ')) {
        return SLASH_WEB_TARGETS.filter((c) => c.match.startsWith(aliased));
      }
      if (aliased === '/web' && (raw.endsWith(' ') || lower.endsWith(' '))) {
        return SLASH_WEB_TARGETS;
      }
      return this.slashCommands.filter((c) => c.match.startsWith('/web'));
    }
    if (normalized.startsWith('/web ')) {
      return SLASH_WEB_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized === '/web' && (raw.endsWith(' ') || lower.endsWith(' '))) {
      return SLASH_WEB_TARGETS;
    }
    if (normalized.startsWith('/image size')) {
      const wantsChildren =
        normalized === '/image size' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_IMAGE_SIZE_TARGETS;
      }
      return SLASH_IMAGE_SIZE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/image count')) {
      const wantsChildren =
        normalized === '/image count' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_IMAGE_COUNT_TARGETS;
      }
      return SLASH_IMAGE_COUNT_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/image ')) {
      return SLASH_IMAGE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized === '/image' && (raw.endsWith(' ') || lower.endsWith(' '))) {
      return SLASH_IMAGE_TARGETS;
    }
    if (normalized.startsWith('/video size')) {
      const wantsChildren =
        normalized === '/video size' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_VIDEO_SIZE_TARGETS;
      }
      return SLASH_VIDEO_SIZE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/video quality')) {
      const wantsChildren =
        normalized === '/video quality' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_VIDEO_QUALITY_TARGETS;
      }
      return SLASH_VIDEO_QUALITY_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/video duration')) {
      const wantsChildren =
        normalized === '/video duration' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_VIDEO_DURATION_TARGETS;
      }
      return SLASH_VIDEO_DURATION_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/video count')) {
      const wantsChildren =
        normalized === '/video count' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_VIDEO_COUNT_TARGETS;
      }
      return SLASH_VIDEO_COUNT_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/video ')) {
      return SLASH_VIDEO_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized === '/video' && (raw.endsWith(' ') || lower.endsWith(' '))) {
      return SLASH_VIDEO_TARGETS;
    }
    if (normalized.startsWith('/slide size')) {
      const wantsChildren =
        normalized === '/slide size' && (raw.endsWith(' ') || lower.endsWith(' '));
      if (wantsChildren) {
        return SLASH_SLIDE_SIZE_TARGETS;
      }
      return SLASH_SLIDE_SIZE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized.startsWith('/slide ')) {
      return SLASH_SLIDE_TARGETS.filter((c) => c.match.startsWith(normalized));
    }
    if (normalized === '/slide' && (raw.endsWith(' ') || lower.endsWith(' '))) {
      return SLASH_SLIDE_TARGETS;
    }
    return this.slashCommands.filter((c) => c.match.startsWith(normalized));
  }

  maybeShowSlashSuggest() {
    const v = (this.messageInput?.value || '').trim();
    if (!v.startsWith('/')) {
      this.hideSlashSuggest();
      return;
    }
    const items = this.currentSlashCandidates();
    if (!items.length) {
      this.hideSlashSuggest();
      return;
    }
    if (!this.suggestVisible) this.showSlashSuggest(items);
    else this.renderSlashSuggest(items);
  }

  handleSlashSuggestKeydown(e) {
    if (!this.suggestVisible) return false;
    const items = this.currentSlashCandidates();
    if (!items.length) {
      this.hideSlashSuggest();
      return false;
    }
    const key = e.key;
    if (key === 'ArrowDown' || (key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      this.suggestIndex = (this.suggestIndex + 1 + items.length) % items.length;
      this.renderSlashSuggest(items);
      return true;
    }
    if (key === 'ArrowUp' || (key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      this.suggestIndex = (this.suggestIndex - 1 + items.length) % items.length;
      this.renderSlashSuggest(items);
      return true;
    }
    if (key === 'ArrowRight') {
      const current = items[this.suggestIndex] || items[0];
      if (current?.children?.length) {
        e.preventDefault();
        this.expandSlashSubcommands(current);
        return true;
      }
    }
    if (key === 'Enter') {
      e.preventDefault();
      const cmd = items[this.suggestIndex]?.key || items[0].key;
      this.applySlashSelection(cmd, true);
      return true;
    }
    if (key === 'Escape') {
      e.preventDefault();
      this.hideSlashSuggest();
      return true;
    }
    return false;
  }

  applySlashSelection(cmd, execute = false) {
    if (!this.messageInput) return;
    this.messageInput.value = cmd;
    this.hideSlashSuggest();
    if (execute) {
      const lower = String(cmd || '').toLowerCase();
      const meta = this.slashCommands.find((c) => c.match === lower);
      if (meta?.children?.length) {
        if (typeof meta.childBase === 'string') {
          this.messageInput.value = meta.childBase;
          this.autosizeMessageInput();
        }
        this.expandSlashSubcommands(meta);
        return;
      }
      this.handleSlashCommand(cmd);
      this.messageInput.value = '';
      this.autosizeMessageInput(true);
      this.messageInput.focus();
    }
  }

  expandSlashSubcommands(meta) {
    if (!this.messageInput) return;
    const base =
      typeof meta?.childBase === 'string' ? meta.childBase : meta?.key || meta?.match || '/';
    const matchBase =
      typeof meta?.childMatchBase === 'string' ? meta.childMatchBase : meta?.match || base;
    const separator = typeof meta?.childSeparator === 'string' ? meta.childSeparator : '_';
    let nextValue = this.messageInput.value || base;
    if (!nextValue.toLowerCase().startsWith(matchBase.toLowerCase())) {
      nextValue = base;
    }
    if (separator === '_') {
      if (!nextValue.endsWith('_')) {
        nextValue = `${base}_`;
      }
    } else if (separator === ' ') {
      if (!nextValue.endsWith(' ')) {
        nextValue = `${base} `;
      }
    } else if (separator) {
      if (!nextValue.endsWith(separator)) {
        nextValue = `${base}${separator}`;
      }
    }
    this.messageInput.value = nextValue;
    this.autosizeMessageInput();
    const pos = this.messageInput.value.length;
    try {
      this.messageInput.focus();
      this.messageInput.setSelectionRange(pos, pos);
    } catch {}
    const childItems = this.currentSlashCandidates();
    if (!childItems.length) {
      this.hideSlashSuggest();
      return;
    }
    this.suggestVisible = true;
    this.suggestIndex = 0;
    if (this.suggestBox) this.suggestBox.classList.remove('hidden');
    this.renderSlashSuggest(childItems);
  }

  /**
   * Set AI generation state and update UI accordingly
   * @param {boolean} on - True when AI is generating, false when idle
   *
   * Effects:
   * - Updates isGenerating flag
   * - Resets cancelRequested flag when starting generation
   * - Triggers send button icon update (send ↔ stop)
   */
  setGenerating(on) {
    this.isGenerating = !!on;
    if (on) {
      this.cancelRequested = false; // Reset cancel flag when starting new generation
      this.disableAutoScrollCount = 0; // Reset scroll lock counter to ensure scrolling works
    }
    try {
      this.updateSendButtonIcon(); // Update button icon: send icon ↔ stop icon
    } catch {}
  }

  /**
   * Update send button icon based on generation state
   * - During AI generation (thinking): Shows stop icon (square) to allow cancellation
   * - When idle: Shows send icon (paper plane) to send message
   */
  updateSendButtonIcon() {
    try {
      if (!this.sendBtn) return;

      if (this.isGenerating) {
        // Stop icon (square) - clicking will cancel ongoing generation
        this.sendBtn.innerHTML = `
          <svg class="w-4 h-4 no-gradient" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12"></rect>
          </svg>
        `;
        this.sendBtn.title = getUIText('stop');
        this.sendBtn.setAttribute('aria-label', getUIText('stop'));
      } else {
        // Send icon (paper plane) - clicking will send message
        this.sendBtn.innerHTML = `
          <svg class="w-4 h-4 no-gradient" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 2L11 13"></path>
            <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
          </svg>
        `;
        this.sendBtn.title = getUIText('send');
        this.sendBtn.setAttribute('aria-label', getUIText('send'));
      }
    } catch {}
  }

  async handlePlusButtonClick() {
    this.fileInput.click();
  }

  handleFileSelection(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    this.attachedFiles.push(...files);
    this.updateAttachmentDisplay();
    this.fileInput.value = '';
  }

  updateAttachmentDisplay() {
    const hasFiles = this.attachedFiles.length > 0;
    this.attachmentArea.classList.toggle('hidden', !hasFiles);

    if (!hasFiles) {
      this.attachmentArea.innerHTML = '';
      return;
    }

    this.attachmentArea.innerHTML = '';
    this.attachedFiles.forEach((file, index) => {
      this.attachmentArea.appendChild(this.createAttachmentItem(file, index));
    });
  }

  createAttachmentItem(file, index) {
    const item = document.createElement('div');
    item.className = 'attachment-item';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      reader.readAsDataURL(file);
      item.appendChild(img);
    } else {
      const ext = file.name.split('.').pop().substring(0, 3).toUpperCase();
      const fileIcon = document.createElement('div');
      fileIcon.className = 'attachment-item-file';
      fileIcon.textContent = ext;
      item.appendChild(fileIcon);
    }

    const removeBtn = document.createElement('div');
    removeBtn.className = 'attachment-remove';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => this.removeAttachment(index);
    item.appendChild(removeBtn);

    return item;
  }

  removeAttachment(index) {
    this.attachedFiles.splice(index, 1);
    this.updateAttachmentDisplay();
  }

  clearAttachments() {
    // Abort all active FileReaders to prevent memory leaks
    if (this.activeFileReaders && this.activeFileReaders.size > 0) {
      for (const reader of this.activeFileReaders) {
        try {
          if (reader.readyState === FileReader.LOADING) {
            reader.abort();
          }
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      this.activeFileReaders.clear();
    }

    this.attachedFiles = [];
    this.updateAttachmentDisplay();
  }

  handlePaste(event) {
    const clipboardData = event.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    const textItems = items.filter((item) => item.type.startsWith('text/'));

    if (imageItems.length > 0) {
      // Only preventDefault when we're handling images
      event.preventDefault();

      // If there's text along with images, manually insert it
      if (textItems.length > 0) {
        textItems[0].getAsString((text) => {
          const start = this.messageInput.selectionStart;
          const end = this.messageInput.selectionEnd;
          const current = this.messageInput.value;
          this.messageInput.value = current.slice(0, start) + text + current.slice(end);
          this.messageInput.selectionStart = this.messageInput.selectionEnd = start + text.length;
          this.autosizeMessageInput();
        });
      }

      // Process images
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          this.attachedFiles.push(file);
        }
      });

      this.updateAttachmentDisplay();
    }
    // If no images, allow default paste behavior (text only)
  }

  /**
   * Cancel ongoing AI generation
   * Called when user clicks stop button during thinking
   *
   * Cancellation strategy:
   * 1. Set cancelRequested flag - ongoing operations check this and ignore results
   * 2. Try to cancel on main process (best-effort, may not succeed)
   * 3. Update UI immediately to show cancellation
   *
   * Note: Even if main process cancellation fails, the flag ensures
   * the result will be ignored when it arrives.
   */
  cancelGeneration() {
    try {
      // Set cancel flag - ongoing operations will check this and abort
      this.cancelRequested = true;
      if (window?.electronAPI?.cancelAI) {
        // Best-effort cancel on main process (for shortcut operations)
        window.electronAPI.cancelAI().catch(() => {});
      }
    } catch {}

    // Hide thinking indicator and restore send button
    this.hideTypingIndicator();
    this.setGenerating(false);

    // Show cancellation message to user
    this.addMessage('system', getUIText('canceled'));
  }

  /**
   * Show typing indicator (thinking animation)
   * Also changes send button to stop button to allow cancellation
   */
  showTypingIndicator() {
    // Set generating state - this triggers send button icon change to stop icon
    this.setGenerating(true);

    if (!this.chatHistory) return;

    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'message-ai-container';
    typingDiv.setAttribute('role', 'status');
    typingDiv.setAttribute('aria-live', 'polite');
    typingDiv.setAttribute('aria-label', getUIText('thinking'));
    typingDiv.innerHTML = `
      <div class="typing-indicator-content">
        <div class="thinking-bar" aria-hidden="true"></div>
      </div>
    `;

    this.chatHistory.appendChild(typingDiv);
    // Typing indicator scroll disabled - only user/system messages should trigger scroll
  }

  /**
   * Hide typing indicator and restore send button
   */
  hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }

    // Reset generating state - this triggers send button icon change back to send icon
    this.setGenerating(false);
  }

  addMessage(type, content, attachments = [], options = {}) {
    // Hide shortcut hints when a message is added
    this.hideShortcutHints();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-${type}`;

    if (type === 'user') {
      const processedContent = this.processUserContent(content);
      const attachmentsHtml = this.generateAttachmentsPreview(attachments);

      this.chatHistoryData.push({ role: 'user', content });
      // Invalidate cache after modifying history data (optimization: only when history changes)
      this.clearHistoryContextCache();
      messageDiv.innerHTML = `
        <div class="message-user-container">
          <div class="message-user-content">
            ${attachmentsHtml}
            ${processedContent}
          </div>
        </div>
      `;
    } else if (type === 'ai') {
      const isObj = content && typeof content === 'object' && !Array.isArray(content);
      let text = isObj ? String(content.text || '') : String(content || '');
      let sources =
        isObj && Array.isArray(content.sources) ? content.sources.filter((s) => s && s.url) : [];

      // If no structured sources, try to parse inline "出典/Sources" block from text and remove it
      if (!sources.length) {
        try {
          const parsed = this.parseInlineSourcesFromText(text);
          if (parsed && parsed.sources && parsed.sources.length) {
            text = parsed.text;
            sources = parsed.sources;
          }
        } catch {}
      }

      const markdownContent = this.renderMarkdown(text);
      this.chatHistoryData.push({ role: 'assistant', content: text });
      // Invalidate cache after modifying history data (optimization: only when history changes)
      this.clearHistoryContextCache();
      // Build DOM to allow badge + accordion below
      const container = document.createElement('div');
      container.className = 'message-ai-container';
      const contentEl = document.createElement('div');
      contentEl.className = 'message-ai-content';
      contentEl.innerHTML = markdownContent;

      // Create AbortController for automatic cleanup (memory leak prevention)
      const abortController = new AbortController();
      this.messageAbortControllers.set(messageDiv, abortController);

      // Open any link in default browser instead of navigating inside the app
      try {
        contentEl.addEventListener(
          'click',
          (ev) => {
            try {
              const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
              if (!a) return;
              const href = a.getAttribute('href') || '';
              if (/^https?:\/\//i.test(href)) {
                ev.preventDefault();
                if (window.electronAPI && window.electronAPI.openExternal) {
                  window.electronAPI.openExternal(href);
                }
              }
            } catch {}
          },
          { capture: true, signal: abortController.signal }
        );
      } catch {}
      // Wrap tables for horizontal scrolling in chat output
      try {
        const tables = contentEl.querySelectorAll('table');
        tables.forEach((tbl) => {
          if (!tbl.closest('.md-table-wrap')) {
            const wrap = document.createElement('div');
            wrap.className = 'md-table-wrap';
            tbl.parentNode.insertBefore(wrap, tbl);
            wrap.appendChild(tbl);
          }
        });
      } catch {}
      container.appendChild(contentEl);
      if (sources.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'source-badge';
        badge.textContent = getUIText('sourcesBadge') || 'Sources';
        const acc = document.createElement('div');
        acc.className = 'source-accordion hidden';
        const list = document.createElement('ul');
        list.className = 'source-list';
        sources.forEach((s, i) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = s.url;
          a.textContent = s.title || s.url;
          a.rel = 'noopener noreferrer';
          a.addEventListener(
            'click',
            (e) => {
              e.preventDefault();
              try {
                if (window.electronAPI && window.electronAPI.openExternal) {
                  window.electronAPI.openExternal(String(s.url));
                }
              } catch {}
            },
            { signal: abortController.signal }
          );
          li.appendChild(a);
          list.appendChild(li);
        });
        acc.appendChild(list);
        // Toggle behavior (with AbortController for automatic cleanup)
        badge.addEventListener(
          'click',
          () => {
            acc.classList.toggle('hidden');
          },
          { signal: abortController.signal }
        );
        // Place badge at the end of content
        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'source-badge-wrap';
        badgeWrap.appendChild(badge);
        container.appendChild(badgeWrap);
        // Append accordion under the AI content block
        container.appendChild(acc);
      }
      messageDiv.appendChild(container);
    } else if (type === 'system-question') {
      // ショートカット由来のシステム表示（2行まで表示し、クリックで展開/折りたたみ）
      const safe = this.escapeHtml(content).replace(/\n/g, '<br>');
      messageDiv.className = 'message-system message-system-compact';
      messageDiv.innerHTML = safe;

      // Create AbortController for automatic cleanup
      const systemAbortController = new AbortController();
      this.messageAbortControllers.set(messageDiv, systemAbortController);

      try {
        messageDiv.addEventListener(
          'click',
          () => {
            messageDiv.classList.toggle('expanded');
          },
          { signal: systemAbortController.signal }
        );
      } catch {}
      this.chatHistoryData.push({ role: 'user', content });
      // Invalidate cache after modifying history data (optimization: only when history changes)
      this.clearHistoryContextCache();
    } else if (type === 'system') {
      // すべてのシステムメッセージはコンパクト表示に統一（2行クランプ、クリックで展開）
      // Note: System messages do NOT modify chatHistoryData, so no cache invalidation needed
      const safe = this.escapeHtml(content).replace(/\n/g, '<br>');
      messageDiv.className = 'message-system message-system-compact';
      messageDiv.innerHTML = safe;

      // Create AbortController for automatic cleanup
      const systemAbortController = new AbortController();
      this.messageAbortControllers.set(messageDiv, systemAbortController);

      try {
        messageDiv.addEventListener(
          'click',
          () => {
            messageDiv.classList.toggle('expanded');
          },
          { signal: systemAbortController.signal }
        );
      } catch {}
    } else {
      // Fallback: treat as compact system style for consistency
      const safe = this.escapeHtml(content).replace(/\n/g, '<br>');
      messageDiv.className = 'message-system message-system-compact';
      messageDiv.innerHTML = safe;

      // Create AbortController for automatic cleanup
      const fallbackAbortController = new AbortController();
      this.messageAbortControllers.set(messageDiv, fallbackAbortController);

      try {
        messageDiv.addEventListener(
          'click',
          () => {
            messageDiv.classList.toggle('expanded');
          },
          { signal: fallbackAbortController.signal }
        );
      } catch {}
    }

    if (!this.chatHistory) return;

    this.chatHistory.appendChild(messageDiv);

    // システムメッセージ（通常/ショートカット）でアイコンを初期化
    // IMPORTANT: Initialize icons BEFORE scrolling to ensure accurate scroll height
    if (type === 'system' || type === 'system-question') {
      this.createIconsEnhanced();
    }

    // Scroll after icon initialization (in next frame to ensure layout is complete)
    // Only scroll for user messages, system messages, and system-question messages (NOT AI responses)
    // Skip scrolling if noScroll option is set (e.g., API key saved message)
    if (this.disableAutoScrollCount === 0 && type !== 'ai' && !options.noScroll) {
      requestAnimationFrame(() => {
        if (this.chatHistory && this.chatHistory.isConnected) {
          this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
      });
    }
  }

  // 直近のチャット履歴をテキスト化して返す
  buildHistoryContext(maxChars = 6000, maxMessages = 12) {
    try {
      // Performance optimization: return cached result if still valid
      const now = Date.now();
      if (
        this.historyContextCache &&
        now - this.historyContextCacheTime < this.historyContextCacheTTL
      ) {
        return this.historyContextCache;
      }

      if (!Array.isArray(this.chatHistoryData) || this.chatHistoryData.length === 0) return '';
      const recent = this.chatHistoryData.slice(-maxMessages);
      const lines = [];
      const lang =
        (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
      for (const m of recent) {
        if (!m || !m.content) continue;
        const role = m.role === 'assistant' ? 'AI' : lang === 'ja' ? 'ユーザー' : 'User';
        lines.push(`${role}: ${m.content}`);
      }
      let text = lines.join('\n');
      if (text.length > maxChars) text = text.slice(-maxChars);

      // Cache the result
      this.historyContextCache = text;
      this.historyContextCacheTime = now;

      return text;
    } catch (e) {
      return '';
    }
  }

  // Clear history context cache
  clearHistoryContextCache() {
    this.historyContextCache = null;
    this.historyContextCacheTime = 0;
  }

  // Toast helper
  showToast(message, type = 'info', timeout = 2600) {
    try {
      const container = document.getElementById('toast');
      if (!container) return;
      const div = document.createElement('div');
      div.className = `toast ${type}`;
      div.textContent = message;
      container.appendChild(div);
      setTimeout(() => {
        if (div && div.parentNode) {
          div.parentNode.removeChild(div);
        }
      }, timeout);
    } catch (e) {}
  }

  renderMarkdown(content) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      try {
        if (marked && marked.setOptions) {
          marked.setOptions({ breaks: true, gfm: true });
        }
      } catch (e) {}
      // マークダウンをHTMLに変換
      const rawHtml = marked.parse(content);
      // XSS攻撃を防ぐためにサニタイズ
      return DOMPurify.sanitize(rawHtml);
    } else {
      // フォールバック：プレーンテキスト
      return `<p class="text-sm">${this.escapeHtml(content)}</p>`;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  processUserContent(content) {
    const text = String(content || '');
    return this.escapeHtml(text)
      .replace(/\n/g, '<br>')
      .replace(/^@image\s+/i, '<span class="command-badge">@image</span> ')
      .replace(/^@video\s+/i, '<span class="command-badge">@video</span> ')
      .replace(/^@slide\s+/i, '<span class="command-badge">@slide</span> ');
  }

  generateAttachmentsPreview(attachments) {
    if (!attachments?.length) return '';

    const previewItems = attachments
      .map((file) => {
        if (file.type.startsWith('image/')) {
          const itemId = `preview-${Date.now()}-${Math.random()}`;
          const reader = new FileReader();

          // Track FileReader for cleanup (memory leak prevention)
          this.activeFileReaders.add(reader);

          reader.onload = (e) => {
            const img = document.getElementById(itemId);
            if (img) img.src = e.target.result;
            // Remove from active set when done
            this.activeFileReaders.delete(reader);
          };
          reader.onerror = () => {
            // Remove from active set on error
            this.activeFileReaders.delete(reader);
          };
          reader.onabort = () => {
            // Remove from active set on abort
            this.activeFileReaders.delete(reader);
          };

          reader.readAsDataURL(file);
          return `<div class="message-attachment-item">
            <img id="${itemId}" class="message-attachment-img" src="" alt="${this.escapeHtml(file.name)}" />
          </div>`;
        }
        const ext = file.name.split('.').pop().substring(0, 3).toUpperCase();
        return `<div class="message-attachment-item">
          <div class="message-attachment-file">${this.escapeHtml(ext)}</div>
        </div>`;
      })
      .join('');

    return `<div class="message-attachments">${previewItems}</div>`;
  }

  // Parse trailing inline sources block like "出典:" or "Sources:" (localized) and extract links
  parseInlineSourcesFromText(text) {
    try {
      if (!text || typeof text !== 'string') return { text, sources: [] };
      const markers = SOURCE_MARKERS;
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(?:\n|^)\s*(?:${markers.map(esc).join('|')})\s*[:：]?\s*\n([\s\S]+)$`,
        'i'
      );
      const m = text.match(pattern);
      if (!m) return { text, sources: [] };
      const block = m[1] || '';
      const lines = block
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const sources = [];
      for (const line of lines) {
        // markdown link [title](url)
        const md = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
        if (md) {
          sources.push({ title: md[1], url: md[2] });
          continue;
        }
        // plain URL with optional title
        const urlMatch = line.match(/(https?:\/\/[^\s)]+)(?:\s*[\-–—:]\s*(.+))?$/i);
        if (urlMatch) {
          const url = urlMatch[1];
          const title = urlMatch[2] || url;
          sources.push({ title, url });
          continue;
        }
        // leading bullet then title/url
        const bullet = line.replace(/^[-*・\d.\)\]]\s*/, '');
        const urlInBullet = bullet.match(/(https?:\/\/[^\s)]+)/i);
        if (urlInBullet) {
          const url = urlInBullet[1];
          const title = bullet.replace(url, '').trim() || url;
          sources.push({ title, url });
          continue;
        }
      }
      if (!sources.length) return { text, sources: [] };
      const newText = text.slice(0, m.index).trimEnd();
      return { text: newText, sources };
    } catch {
      return { text, sources: [] };
    }
  }

  async applyThemeFromSystem() {
    try {
      if (window.electronAPI && window.electronAPI.getUITheme) {
        const theme = await window.electronAPI.getUITheme();
        this.applyTheme(theme || 'dark');
      } else {
        this.applyTheme('dark');
      }
    } catch {
      this.applyTheme('dark');
    }
  }

  applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
    }
    this.createIconsEnhanced();
  }
}

class GeminiService {
  constructor() {
    this.model = 'gemini-2.5-flash-lite';
    this.lastGeneratedImage = null; // Store last generated image for reference
    this.initializeModel();
  }

  async initializeModel() {
    try {
      // モデル名の取得
      if (window.electronAPI && window.electronAPI.getModel) {
        const model = await window.electronAPI.getModel();
        if (model && typeof model === 'string') {
          this.model = model;
        }
      }
    } catch (error) {}
  }

  async requestText(prompt, useWebSearch = false, source = 'chat', options = {}) {
    try {
      if (window.electronAPI && window.electronAPI.aiGenerate) {
        const cfg = this.defaultGenerationConfig();
        const generationConfig = {
          ...cfg,
          ...(options && options.generationConfigOverrides
            ? options.generationConfigOverrides
            : {}),
        };
        const result = await window.electronAPI.aiGenerate(prompt, {
          model: this.model,
          generationConfig,
          useWebSearch: !!useWebSearch,
          source,
        });
        if (typeof result === 'string') return { text: result, sources: [] };
        if (result && typeof result.text === 'string') {
          return {
            text: result.text,
            sources: Array.isArray(result.sources) ? result.sources : [],
          };
        }
        return { text: getUIText('unexpectedResponse'), sources: [] };
      }
      return { text: getUIText('apiUnavailable'), sources: [] };
    } catch (error) {
      return { text: `${getUIText('apiError')} ${error?.message || 'Unknown error'}`, sources: [] };
    }
  }

  async requestWithImage(
    prompt,
    imageBase64,
    mimeType = 'image/png',
    useWebSearch = false,
    source = 'chat'
  ) {
    try {
      if (window.electronAPI && window.electronAPI.aiGenerateWithImage) {
        const cfg = this.defaultGenerationConfig();
        const result = await window.electronAPI.aiGenerateWithImage(prompt, imageBase64, mimeType, {
          model: this.model,
          generationConfig: cfg,
          useWebSearch: !!useWebSearch,
          source,
        });
        if (typeof result === 'string') return { text: result, sources: [] };
        if (result && typeof result.text === 'string') {
          return {
            text: result.text,
            sources: Array.isArray(result.sources) ? result.sources : [],
          };
        }
        return { text: getUIText('unexpectedResponse'), sources: [] };
      }
      return { text: getUIText('apiUnavailable'), sources: [] };
    } catch (error) {
      return { text: `${getUIText('apiError')} ${error?.message || 'Unknown error'}`, sources: [] };
    }
  }

  async generateImageFromText(prompt, aspectRatio = '1:1') {
    try {
      if (window.electronAPI && window.electronAPI.generateImageFromText) {
        const options = {
          aspectRatio,
        };

        // Include previous image as reference if available
        if (this.lastGeneratedImage) {
          options.referenceImages = [
            {
              base64: this.lastGeneratedImage.imageBase64,
              mimeType: this.lastGeneratedImage.mimeType,
            },
          ];
        }

        const result = await window.electronAPI.generateImageFromText(prompt, options);

        if (result && result.error) {
          throw new Error(result.error);
        }

        if (result && result.imageBase64) {
          // Save the generated image for future reference
          this.lastGeneratedImage = {
            imageBase64: result.imageBase64,
            mimeType: result.mimeType || 'image/png',
          };

          return {
            imageBase64: result.imageBase64,
            mimeType: result.mimeType || 'image/png',
          };
        }

        throw new Error(getUIText('unexpectedResponse'));
      }
      throw new Error(getUIText('apiUnavailable'));
    } catch (error) {
      throw error;
    }
  }

  async generateImageFromTextWithReference(prompt, aspectRatio = '1:1', referenceFiles) {
    try {
      if (window.electronAPI && window.electronAPI.generateImageFromText) {
        // 複数のファイルをbase64に変換
        const referenceImages = await Promise.all(
          referenceFiles.map(async (file) => {
            return {
              base64: await this.fileToBase64(file),
              mimeType: file.type,
            };
          })
        );

        const options = {
          aspectRatio,
          referenceImages,
        };

        const result = await window.electronAPI.generateImageFromText(prompt, options);

        if (result && result.error) {
          throw new Error(result.error);
        }

        if (result && result.imageBase64) {
          // Save the generated image for future reference
          this.lastGeneratedImage = {
            imageBase64: result.imageBase64,
            mimeType: result.mimeType || 'image/png',
          };

          return {
            imageBase64: result.imageBase64,
            mimeType: result.mimeType || 'image/png',
          };
        }

        throw new Error(getUIText('unexpectedResponse'));
      }
      throw new Error(getUIText('apiUnavailable'));
    } catch (error) {
      throw error;
    }
  }

  async generateVideoFromText(
    prompt,
    aspectRatio = '16:9',
    durationSeconds = 8,
    resolution = '720p',
    referenceImage = null
  ) {
    try {
      if (window.electronAPI && window.electronAPI.generateVideoFromText) {
        const options = {
          aspectRatio,
          durationSeconds,
          resolution,
        };

        // Add reference image if provided (Image-to-Video)
        if (referenceImage) {
          const base64 = await this.fileToBase64(referenceImage);
          options.referenceImage = {
            base64,
            mimeType: referenceImage.type,
          };
        }

        const result = await window.electronAPI.generateVideoFromText(prompt, options);

        if (result && result.error) {
          throw new Error(result.error);
        }

        if (result && result.videoBase64) {
          return {
            videoBase64: result.videoBase64,
            mimeType: result.mimeType || 'video/mp4',
          };
        }

        throw new Error(getUIText('unexpectedResponse'));
      }
      throw new Error(getUIText('apiUnavailable'));
    } catch (error) {
      throw error;
    }
  }

  normalizeUrlForPrompt(url) {
    try {
      const normalized = new URL(String(url || '').trim());
      if (!/^https?:$/i.test(normalized.protocol)) return '';
      return normalized.toString();
    } catch {
      return '';
    }
  }

  async fetchUrlPlainText(url, maxLength = 5000) {
    if (!window.electronAPI || typeof window.electronAPI.fetchUrlContent !== 'function') {
      throw new Error('URL content bridge unavailable');
    }
    const safeMaxLength = Math.max(1000, Math.min(maxLength, 20000));
    const result = await window.electronAPI.fetchUrlContent(url, {
      maxLength: safeMaxLength,
      timeoutMs: 12000,
    });
    if (!result || typeof result !== 'object') {
      throw new Error('Failed to fetch URL content');
    }
    if (typeof result.error === 'string' && result.error) {
      throw new Error(result.error);
    }
    const text = String(result.text || '').trim();
    if (!text) {
      throw new Error('No readable content found at URL');
    }
    return {
      text,
      truncated: !!result.truncated,
      finalUrl: result.finalUrl || url,
    };
  }

  async generateUrlSummary(url, historyText = '', mode = 'summary') {
    const normalizedUrl = this.normalizeUrlForPrompt(url);
    if (!normalizedUrl) {
      throw new Error('Invalid URL');
    }

    const maxLength = mode === 'summary' ? 5000 : 10000;
    const {
      text: pageText,
      truncated,
      finalUrl,
    } = await this.fetchUrlPlainText(normalizedUrl, maxLength);

    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    const { name, code } = getLangMeta(lang);
    const baseConfig = this.defaultGenerationConfig();
    const baseTopK = Number(baseConfig.topK);
    const baseTopP = Number(baseConfig.topP);
    const baseMaxTokens = Number(baseConfig.maxOutputTokens);
    const safeTopK = Number.isFinite(baseTopK) ? baseTopK : 40;
    const safeTopP = Number.isFinite(baseTopP) ? baseTopP : 0.95;
    const safeMaxTokens = Number.isFinite(baseMaxTokens) ? baseMaxTokens : 2048;
    const cfgOverrides = {
      temperature: mode === 'summary' ? 0.5 : 0.6,
      topK: Math.min(32, safeTopK),
      topP: Math.min(mode === 'summary' ? 0.9 : 0.92, safeTopP),
      maxOutputTokens: Math.min(mode === 'summary' ? 640 : 2048, safeMaxTokens),
    };

    const truncatedNote = truncated
      ? lang === 'ja'
        ? '\n※ 抽出したコンテンツは長さ制限のため一部のみ掲載しています。'
        : '\nNote: Extracted content was truncated for length.'
      : '';

    let prompt;
    if (lang === 'ja') {
      const historyBlock =
        historyText && historyText.trim()
          ? `【チャット履歴（直近）】\n${historyText.trim()}\n\nこの文脈を踏まえて回答してください。\n\n`
          : '';
      if (mode === 'summary') {
        const toneSuffix =
          tone === 'casual'
            ? '\n- 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない。絵文字は使わない'
            : '\n- 口調は丁寧で落ち着いた敬体';
        prompt = `${historyBlock}以下のウェブサイト内容をもとに、3〜4文の日本語要約を作成してください。構成は「結論となる要点 → なぜ重要か → 今すぐ取れるアクションや次の一歩」の順にしてください。\n- 根拠となる見出し、数値、引用があれば短く触れてください\n- 信頼できる情報が取得できなかった場合は正直に伝え、リンクの確認方法や代替手段を示してください${toneSuffix}${truncatedNote}\n\nWebsite URL: ${finalUrl}\n\nContent:\n${pageText}\n\n回答:`;
      } else {
        const toneSuffix =
          tone === 'casual'
            ? '\n- 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない。絵文字は使わない'
            : '\n- 口調は丁寧で落ち着いた敬体';
        prompt = `${historyBlock}以下のウェブサイト内容をもとに、次の構成で詳しく解説してください。必要に応じて箇条書きや表を活用してください。\n1. 概要（2〜3文）\n2. 重要ポイント（箇条書き。見出し名や数値、引用など具体的な根拠を含める）\n3. 背景・文脈\n4. リスク・注意点\n5. 推奨アクション（あれば）\n- 情報が取得できなかった場合は理由と確認方法を説明してください${toneSuffix}${truncatedNote}\n\nWebsite URL: ${finalUrl}\n\nContent:\n${pageText}\n\n回答:`;
      }
    } else {
      const historyBlock =
        historyText && historyText.trim()
          ? `Recent chat context:\n${historyText.trim()}\n\nUse this context when crafting your response.\n\n`
          : '';
      const toneLine =
        tone === 'casual'
          ? ' Use a friendly, conversational tone (no emojis).'
          : tone === 'formal'
            ? ' Use a clear, professional tone.'
            : '';
      if (mode === 'summary') {
        prompt = `${historyBlock}Based on the following website content, write a 3-4 sentence summary in ${name} (${code}) that covers: key takeaway(s), why they matter, and immediate actions or next steps.${toneLine}${truncatedNote}\nInclude concrete details (section titles, statistics, quotes) when available. If the page cannot be verified, say so explicitly and suggest how to confirm it or alternative sources.\n\nWebsite URL: ${finalUrl}\n\nContent:\n${pageText}\n\nProvide the summary:`;
      } else {
        prompt = `${historyBlock}Based on the following website content, produce a detailed analysis in ${name} (${code}) with the headings: Overview (2-3 sentences), Key Details (bullet list with section names, data, or quotes), Context/Background, Risks or Caveats, and Recommended Actions.${toneLine}${truncatedNote}\nIf the page cannot be verified, explain what failed and offer next steps.\n\nWebsite URL: ${finalUrl}\n\nContent:\n${pageText}\n\nProvide the detailed analysis:`;
      }
    }

    return this.requestText(prompt, false, 'shortcut', {
      generationConfigOverrides: cfgOverrides,
    });
  }

  async generateResponse(userMessage, historyText = '', useWebSearch = false) {
    const prompt = this.buildTextOnlyPrompt(userMessage, historyText);
    return this.requestText(prompt, useWebSearch, 'chat');
  }

  async generateResponseWithAttachments(
    userMessage,
    historyText = '',
    attachments = [],
    useWebSearch = false
  ) {
    let prompt = this.buildTextOnlyPrompt(userMessage, historyText);

    // ファイルを種類ごとに分類
    const imageFiles = attachments.filter((file) => file.type.startsWith('image/'));
    const textBasedExtensions = [
      '.txt',
      '.md',
      '.csv',
      '.json',
      '.xml',
      '.html',
      '.css',
      '.js',
      '.ts',
      '.py',
      '.java',
      '.cpp',
      '.c',
      '.h',
      '.jsx',
      '.tsx',
      '.sh',
      '.yaml',
      '.yml',
    ];
    const textFiles = attachments.filter(
      (file) =>
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        file.type === 'application/xml' ||
        textBasedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
    const pdfFiles = attachments.filter((file) => file.type === 'application/pdf');

    // テキストファイルの内容をプロンプトに追加
    if (textFiles.length > 0) {
      const textContents = await Promise.all(
        textFiles.map(async (file) => {
          const content = await this.readTextFile(file);
          return `\n\n[Attached file: ${file.name}]\n${content}\n[End of ${file.name}]`;
        })
      );
      prompt = prompt + textContents.join('');
    }

    // PDFファイルがある場合
    if (pdfFiles.length > 0) {
      const firstPdf = pdfFiles[0];
      const base64 = await this.fileToBase64(firstPdf);
      // PDFも画像と同じくrequestWithImageで送信（mainプロセス側で処理）
      return this.requestWithImage(prompt, base64, 'application/pdf', useWebSearch, 'chat');
    }

    // 画像ファイルがある場合
    if (imageFiles.length > 0) {
      const firstImage = imageFiles[0];
      const base64 = await this.fileToBase64(firstImage);
      return this.requestWithImage(prompt, base64, firstImage.type, useWebSearch, 'chat');
    }

    // ファイルがテキストのみの場合、または添付ファイルがない場合
    return this.requestText(prompt, useWebSearch, 'chat');
  }

  async readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // data:image/png;base64,... の形式から base64部分のみを取得
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** 純粋な翻訳（UI言語に翻訳、説明なし・訳文のみ） */
  async generatePureTranslation(text) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const t = text.length > 12000 ? text.slice(0, 12000) + ' …(truncated)' : text;
    const nameMap = {
      en: 'English',
      ja: 'Japanese',
      es: 'Spanish',
      'es-419': 'Latin American Spanish',
      'zh-Hans': 'Simplified Chinese',
      'zh-Hant': 'Traditional Chinese',
      hi: 'Hindi',
      'pt-BR': 'Brazilian Portuguese',
      fr: 'French',
      de: 'German',
      ar: 'Arabic',
      ru: 'Russian',
      ko: 'Korean',
      id: 'Indonesian',
      vi: 'Vietnamese',
      th: 'Thai',
      it: 'Italian',
      tr: 'Turkish',
    };
    const targetName = nameMap[lang] || 'English';
    const targetCode = lang;
    const prompt = `Translate the text strictly into ${targetName} (${targetCode}).

Rules:
- Output the translation only. No preface, notes, or explanations.
- Preserve formatting (Markdown, line breaks, lists) and code blocks as-is.
- Keep URLs, code identifiers, and proper nouns unchanged when appropriate.
- If the source includes multiple languages, translate all non-${targetName} parts into ${targetName}.

Text:
${t}`;
    // Web search is unnecessary for pure translation
    const res = await this.requestText(prompt, false, 'shortcut');
    return res;
  }

  async generateEmpathyReply(text) {
    const trimmed = text.length > 1500 ? text.slice(0, 1500) + ' …(truncated)' : text;
    const prompt = `You are preparing a short quote-repost comment for a social media post (X/Twitter or Reddit).

Original post:
"""
${trimmed}
"""

Instructions:
- Detect the language of the original post and respond in that exact language.
- Write exactly one sentence that casually agrees with the poster in a natural, upbeat tone (think "Sounds great—I'm with you on this" / 「いいね！私もそう思います。」).
- Keep the vibe light, friendly, and frankly spoken. For Japanese, blend casual speech with soft politeness (〜ですね / 〜ですよ / 〜ますね). For other languages, stay informal, warm, and respectful.
- Keep it under 35 words (or 70 characters for CJK scripts) and avoid emojis, hashtags, mentions, or quotes.
- Refer to the situation without copying long phrases verbatim.

If the text is empty or the language cannot be determined, reply in English with: "I'm here for you, even if I don't fully understand yet."`;
    const cfgOverrides = {
      temperature: 0.6,
      topK: 28,
      topP: 0.88,
      maxOutputTokens: 180,
    };
    return this.requestText(prompt, false, 'shortcut', {
      generationConfigOverrides: cfgOverrides,
    });
  }

  async generateReplyVariations(text) {
    const trimmed = text.length > 2000 ? text.slice(0, 2000) + ' …(truncated)' : text;
    const uiLang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const uiName = getLanguageDisplayName(uiLang) || uiLang;
    const prompt = `You will propose five alternative replies to the following original text.

Original text:
"""
${trimmed}
"""

Instructions:
- Detect the language of the original text and write each reply entirely in that language.
- Keep each reply to one or two sentences, with a native, relaxed tone that still sounds respectfully polite (avoid stiff formality). No emojis, hashtags, or repeated wording between variants.
- After each reply, add a paraphrase in ${uiName} (${uiLang}) that loosely rephrases the reply in natural ${uiName}.
- Provide a short explanation in ${uiName} (${uiLang}) that clarifies the intention or nuance of the reply.
- Present the paraphrase and explanation as plain text lines using the structure below (no tables or bullet lists inside each item).
- Explanations must sound natural and polite in ${uiName} and stay in ${uiName} only.

Format the output in Markdown exactly as:

1. Reply: <reply in source language>
   Paraphrase (${uiName}): <paraphrase in ${uiName}>
   Explanation (${uiName}): <explanation in ${uiName}>
2. Reply: ...
   Paraphrase (${uiName}): ...
   Explanation (${uiName}): ...
3. Reply: ...
   Paraphrase (${uiName}): ...
   Explanation (${uiName}): ...
4. Reply: ...
   Paraphrase (${uiName}): ...
   Explanation (${uiName}): ...
5. Reply: ...
   Paraphrase (${uiName}): ...
   Explanation (${uiName}): ...

Do not add any extra sections, introductions, or closing remarks.`;
    const cfgOverrides = {
      temperature: 0.75,
      topK: 32,
      topP: 0.9,
      maxOutputTokens: 720,
    };
    return this.requestText(prompt, false, 'shortcut', {
      generationConfigOverrides: cfgOverrides,
    });
  }

  async generateTargetedTranslation(text, targetCode = 'en', mode = 'literal') {
    const canonical = normalizeTranslateCode(targetCode) || 'en';
    const { name } = getLangMeta(canonical);
    const trimmed = text.length > 12000 ? text.slice(0, 12000) + ' …(truncated)' : text;
    const normalizedMode = mode === 'free' ? 'free' : 'literal';
    const literalPrompt = `Translate the following text strictly into ${name} (${canonical}).

Rules:
- Output the translation only. No explanations or prefaces.
- Preserve Markdown, lists, and code blocks.
- Keep URLs, code identifiers, and proper nouns unchanged where appropriate.
- If the source mixes languages, ensure the final output is entirely in ${name}.

Text:
${trimmed}`;
    const freePrompt = `Translate the following text into ${name} (${canonical}) with a natural, sense-for-sense rendering.

Guidelines:
- Convey the speaker's intent and tone in smooth, idiomatic ${name} (${canonical}).
- Rephrase or reorganize when it improves clarity, but keep every key fact, number, name, and quoted text accurate.
- Preserve Markdown structure, lists, and code blocks; for code and identifiers, keep the original unless clarity demands a brief adjustment.
- Output only the translated text—no explanations, footnotes, or commentary.

Text:
${trimmed}`;
    const prompt = normalizedMode === 'free' ? freePrompt : literalPrompt;
    const baseConfig = this.defaultGenerationConfig();
    const safeMaxTokens = Number.isFinite(Number(baseConfig.maxOutputTokens))
      ? Number(baseConfig.maxOutputTokens)
      : 2048;
    const cfgOverrides =
      normalizedMode === 'free'
        ? { temperature: 0.65, topP: 0.9, maxOutputTokens: safeMaxTokens }
        : { temperature: 0.4, topP: 0.82, maxOutputTokens: safeMaxTokens };
    return this.requestText(prompt, false, 'chat', {
      generationConfigOverrides: cfgOverrides,
    });
  }

  /** テキストのみを解説する（UI言語に合わせて出力言語を切替） */
  async generateTextExplanation(text, historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    const { name, code } = getLangMeta(lang);
    const t =
      text.length > 8000
        ? text.slice(0, 8000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)')
        : text;
    let prompt;
    if (lang === 'ja') {
      const toneLine =
        tone === 'casual'
          ? ' 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない。絵文字は使わない。'
          : '';
      prompt = `「${t}」について一言で教えてください。日本語で短く1文で、結論から端的に。${toneLine}`;
    } else {
      const toneLine = tone === 'casual' ? ' Use a friendly, conversational tone (no emojis).' : '';
      prompt = `Explain "${t}" in one short sentence. Start with the conclusion, be clear and concise. Respond strictly in ${name} (${code}).${toneLine}`;
    }
    if (historyText && historyText.trim()) {
      prompt =
        (lang === 'ja'
          ? `【チャット履歴（直近）】\n${historyText}\n\n`
          : `Context (recent chat):\n${historyText}\n\n`) + prompt;
    }
    return this.requestText(prompt, useWebSearch, 'shortcut');
  }

  /**
   * 選択テキストの詳細説明（わかりやすく、段階的・例示を含める）
   */
  async generateDetailedExplanation(text, historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    const { name, code } = getLangMeta(lang);
    const t =
      text.length > 12000
        ? text.slice(0, 12000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)')
        : text;
    let prompt;
    if (lang === 'ja') {
      const toneLine =
        tone === 'casual'
          ? '\n- 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない。絵文字は使わない'
          : '';
      prompt = `次の内容を、丁寧に説明してください。具体例・箇条書きを適宜使い、重要点→理由→具体例→注意点の順で簡潔にまとめてください。必要なら手順も提示してください。${toneLine}\n\n【対象】\n${t}`;
    } else {
      const toneLine =
        tone === 'casual' ? '\n- Use a friendly, conversational tone (no emojis)' : '';
      prompt = `Explain the following in a way that non-experts can understand. Use concrete examples, analogies, and bullets where useful. Structure the answer as: key points → reasons → examples → caveats, and include steps if appropriate.${toneLine}\n\nRespond strictly in ${name} (${code}).\n\nTarget:\n${t}`;
    }
    if (historyText && historyText.trim()) {
      prompt =
        (lang === 'ja'
          ? `【チャット履歴（直近）】\n${historyText}\n\n`
          : `Recent chat context:\n${historyText}\n\n`) + prompt;
    }
    return this.requestText(prompt, useWebSearch, 'shortcut');
  }

  async generateImageExplanation(
    imageBase64,
    mimeType = 'image/png',
    historyText = '',
    useWebSearch = false
  ) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    const { name, code } = getLangMeta(lang);
    let prompt;
    if (lang === 'ja') {
      prompt =
        '次の内容を、日本語で簡潔に説明してください。重要な要素や文脈があれば触れてください。' +
        (tone === 'casual'
          ? ' 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない。絵文字は使わない。'
          : '');
    } else {
      prompt =
        `Briefly describe what is shown in this content. Mention key elements and context if apparent. Respond strictly in ${name} (${code}).` +
        (tone === 'casual' ? ' Use a friendly, conversational tone (no emojis).' : '');
    }
    if (historyText && historyText.trim()) {
      prompt =
        (lang === 'ja'
          ? `【チャット履歴（直近）】\n${historyText}\n\n`
          : `Recent chat context:\n${historyText}\n\n`) + prompt;
    }
    return this.requestWithImage(prompt, imageBase64, mimeType, useWebSearch, 'shortcut');
  }

  async generateImageDetailedExplanation(
    imageBase64,
    mimeType = 'image/png',
    historyText = '',
    useWebSearch = false
  ) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    const { name, code } = getLangMeta(lang);
    let prompt;
    if (lang === 'ja') {
      prompt =
        '次の内容を、非専門家にも分かるように、重要点→理由→具体例→注意点の順で、必要に応じて箇条書きで丁寧に説明してください。文脈が推測できる場合は簡潔に触れてください。' +
        (tone === 'casual'
          ? ' 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない。絵文字は使わない。'
          : '');
    } else {
      prompt =
        `Explain the content for non-experts with structure: key points → reasons → examples → caveats. Use bullets where helpful and note likely context if apparent. Respond strictly in ${name} (${code}).` +
        (tone === 'casual' ? ' Keep the tone friendly and conversational (no emojis).' : '');
    }
    if (historyText && historyText.trim()) {
      prompt =
        (lang === 'ja'
          ? `【チャット履歴（直近）】\n${historyText}\n\n`
          : `Recent chat context:\n${historyText}\n\n`) + prompt;
    }
    return this.requestWithImage(prompt, imageBase64, mimeType, useWebSearch, 'shortcut');
  }

  async generateTableFromText(text, historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const { name, code } = getLangMeta(lang);
    const t = String(text || '');
    let prompt;
    if (lang === 'ja') {
      prompt = `次のテキストを、GFM（GitHub Flavored Markdown）の表に変換してください。\n\n要件:\n- ヘッダー行の直後に区切り行（|---|---|...|）を必ず入れる\n- 表以外の説明文やコードブロックは出力しない（表のみ）\n- 列は内容に合わせて2〜6列程度に整理（不可能なら「項目 | 値」の2列）\n- 最大20行程度に要約し、長文は適度に省略\n- URLやコードは適切に切り、可読性を保つ\n- ヘッダー名・セル内容は日本語で簡潔に（固有名詞は原文を維持可）\n\n対象テキスト:\n${t}`;
    } else {
      prompt = `Convert the following text into a well-formed GitHub Flavored Markdown (GFM) table.\n\nRequirements:\n- Include a header row AND the separator row (|---|---|...) right after it\n- Output ONLY the table (no explanations, no code fences)\n- Choose 2–6 columns that best fit the content (fallback to "Key | Value" if structure is unclear)\n- Limit to about 20 rows; truncate long content sensibly\n- Keep URLs/code readable\n- Write all headers and cell values strictly in ${name} (${code}). Translate any non-${name} content into concise, natural ${name} while preserving proper nouns.\n\nText:\n${t}`;
    }
    if (historyText && historyText.trim()) {
      prompt =
        (lang === 'ja'
          ? `【チャット履歴（直近）】\n${historyText}\n\n`
          : `Recent chat context:\n${historyText}\n\n`) + prompt;
    }
    return this.requestText(prompt, useWebSearch, 'chat');
  }

  /**
   * Clarify the previous AI output in simpler, more concrete terms.
   */
  async generateClarificationFromText(previousText = '', historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    const { name, code } = getLangMeta(lang);
    const t =
      previousText.length > 12000
        ? previousText.slice(0, 12000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)')
        : previousText;
    let prompt;
    if (lang === 'ja') {
      const toneLine =
        tone === 'casual' ? '\n- 口調はやさしく温かみのあるタメ口（常体）。くだけすぎない' : '';
      prompt = `次の直前のAI出力について、「どういうこと？」に答えるつもりで、よりわかりやすく具体的に説明してください。\n\n要件:\n- 重要な結論→理由→具体例→次の一手の順で、5〜8行の箇条書き\n- 難しい用語はその場で短く定義（かっこ書き可）\n- 比喩や日常の例を1つ入れる\n- 原文の意図は保ちつつ、平易な日本語に言い換える${toneLine}\n\n【直前のAI出力】\n${t}`;
    } else {
      const toneLine = tone === 'casual' ? '\n- Keep the tone friendly and conversational' : '';
      prompt = `Please clarify the previous AI output as if answering "What do you mean?"\n\nRequirements:\n- 5–8 bullet lines in this order: key point → why → concrete example → next action\n- Define any jargon briefly in-place\n- Include one relatable, everyday example or analogy\n- Keep the original intent but use simple, plain language${toneLine}\n\nRespond strictly in ${name} (${code}).\n\n[Previous AI output]\n${t}`;
    }
    if (historyText && historyText.trim()) {
      prompt =
        (lang === 'ja'
          ? `【チャット履歴（直近）】\n${historyText}\n\n`
          : `Recent chat context:\n${historyText}\n\n`) + prompt;
    }
    return this.requestText(prompt, useWebSearch, 'chat');
  }

  async generateHistorySummary(historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const base = (historyText || '').trim();
    if (!base) return lang === 'ja' ? '（履歴がありません）' : '(No history)';
    const { name, code } = getLangMeta(lang);
    const prompt =
      lang === 'ja'
        ? `以下は直近の会話履歴です。重要なポイントだけを日本語で3〜6行に簡潔に要約してください。箇条書き可。重複や冗長表現は避け、固有名詞・決定事項・未解決点を明確に示してください。\n\n${base}`
        : `Below is the recent conversation history. Summarize the key points in ${name} (${code}) in 3–6 short lines. Bullets are fine. Avoid redundancy and highlight proper nouns, decisions, and open items.\n\n${base}`;
    return this.requestText(prompt, useWebSearch, 'chat');
  }

  async generateContinuation(previousText = '', historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const t =
      previousText.length > 12000
        ? previousText.slice(0, 12000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)')
        : previousText;
    let prompt;
    if (lang === 'ja') {
      prompt = `次の文章の続きを書いてください。すでに述べた内容は繰り返さず、同じ文体・トーンで簡潔に続けてください。必要に応じて箇条書き・例・注意点を加えて構いません。\n\n【直前の出力】\n${t}`;
      if (historyText && historyText.trim()) {
        prompt = `【チャット履歴（直近）】\n${historyText}\n\n` + prompt;
      }
    } else {
      const { name, code } = getLangMeta(lang);
      prompt = `Continue the following output in ${name} (${code}). Do not repeat prior content. Keep the same style and tone. Add bullets/examples/caveats only if helpful.\n\n[Previous output]\n${t}`;
      if (historyText && historyText.trim()) {
        prompt = `Recent chat context:\n${historyText}\n\n` + prompt;
      }
    }
    return this.requestText(prompt, useWebSearch, 'chat');
  }

  defaultGenerationConfig() {
    return { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 2048 };
  }

  buildTextOnlyPrompt(userMessage, historyText = '') {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const tone = typeof getCurrentTone === 'function' ? getCurrentTone() : 'casual';
    if (lang === 'ja') {
      if (tone === 'formal') {
        let prompt = `あなたは親切で知識豊富なAIアシスタントです。ユーザーの質問に日本語で丁寧に回答してください。

ユーザーの質問: ${userMessage}`;
        if (historyText && historyText.trim()) {
          prompt += `

【チャット履歴（直近）】
${historyText}

この履歴の文脈を理解した上で、回答を行ってください。`;
        }
        prompt += `

回答の方針:
- 推測で断言せず、確実な情報に基づいて回答してください
- 必要に応じて手順や根拠を示してください
- 日本語で自然な会話形式で簡潔に回答してください`;
        return prompt;
      } else {
        // casual: やさしく温かみのあるタメ口（常体）
        let prompt = `あなたは親切でフレンドリーなAIアシスタントです。日本語で、やさしく温かみのあるタメ口（常体）で、簡潔に答えて。

ユーザーの質問: ${userMessage}`;
        if (historyText && historyText.trim()) {
          prompt += `

【チャット履歴（直近）】
${historyText}

この文脈も踏まえて答えてください。`;
        }
        prompt += `

回答の方針:
- 憶測で断言せず、確実な情報に基づいて答える
- 必要に応じて手順や根拠を短く添える
- 断定を避ける柔らかい言い回しを適度に使う（例: 〜かも、〜と思う、〜かな）
- 敬体・敬語は使わず常体（タメ口）。やさしく温かみのある文体で簡潔に（くだけすぎない／前置き最小限／絵文字なし）`;
        return prompt;
      }
    } else {
      const { name, code } = getLangMeta(lang);
      if (tone === 'formal') {
        let prompt = `You are a helpful and knowledgeable AI assistant. Answer the user's question clearly and concisely. Respond strictly in ${name} (${code}).

User question: ${userMessage}`;
        if (historyText && historyText.trim()) {
          prompt += `

Recent chat context:
${historyText}

Incorporate this context when answering.`;
        }
        prompt += `

Answering guidelines:
- Avoid unfounded claims; base answers on reliable information
- Provide steps or rationale when helpful
- Use natural, concise ${name}`;
        return prompt;
      } else {
        // casual: friendly, conversational, still concise
        let prompt = `You are a helpful, friendly AI assistant. Answer with a warm, conversational tone. Respond strictly in ${name} (${code}).

User question: ${userMessage}`;
        if (historyText && historyText.trim()) {
          prompt += `

Recent chat context:
${historyText}

Use this context in your answer.`;
        }
        prompt += `

Answering guidelines:
- Don’t overstate; base answers on solid information
- Add brief steps or rationale when useful
- Keep it friendly and conversational, but succinct (no emojis)`;
        return prompt;
      }
    }
  }
}

// Extend class with icon gradient helpers
IrukaDarkApp.prototype.createIconsEnhanced = function () {
  try {
    if (typeof lucide === 'undefined' || !lucide.createIcons) {
      // lucide未ロード時は少し待って再試行
      setTimeout(() => this.createIconsEnhanced(), 100);
      return;
    }
    lucide.createIcons();
    // DOM反映を待ってから段階的に適用（初期表示の抜けを防止）
    const stagedApply = (retries = 5) => {
      this.applyIconGradients();
      const sendSvg = this.sendBtn ? this.sendBtn.querySelector('svg') : null;
      if (!sendSvg && retries > 0) {
        setTimeout(() => stagedApply(retries - 1), 60);
      }
    };
    requestAnimationFrame(() => setTimeout(() => stagedApply(5), 0));
  } catch (e) {}
};

IrukaDarkApp.prototype.applyIconGradients = function () {
  try {
    const sendSvg = this.sendBtn ? this.sendBtn.querySelector('svg') : null;
    // 送信アイコンは常にcurrentColorで表示（グラデ適用しない）
    if (sendSvg) this.removeGradientFromSvg(sendSvg);

    // No other header icons to target

    // 明示的にグラデ非対象のアイコンはグラデ属性を外して白に委ねる
    // テーマトグルアイコンは存在しないため処理なし
  } catch (e) {}
};

IrukaDarkApp.prototype.applyGradientToSvg = function (svg) {
  try {
    if (!svg || svg.getAttribute('data-irukadark-gradient') === '1') return;
    // 明示的に除外クラスが付いている場合は何もしない
    if (svg.classList && svg.classList.contains('no-gradient')) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(svgNS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    const gradId = `irukadark-grad-${Math.random().toString(36).slice(2, 9)}`;
    const lg = document.createElementNS(svgNS, 'linearGradient');
    lg.setAttribute('id', gradId);
    lg.setAttribute('x1', '0%');
    lg.setAttribute('y1', '0%');
    lg.setAttribute('x2', '100%');
    lg.setAttribute('y2', '100%');
    // Resolve CSS variables to actual colors for robust rendering
    const cs = getComputedStyle(document.documentElement);
    const c1 = (cs.getPropertyValue('--primary') || '#ff4d6d').trim();
    const c2 = (cs.getPropertyValue('--primary-2') || '#d946ef').trim();
    const s1 = document.createElementNS(svgNS, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', c1);
    s1.setAttribute('stop-opacity', '1');
    const s2 = document.createElementNS(svgNS, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', c2);
    s2.setAttribute('stop-opacity', '1');
    lg.appendChild(s1);
    lg.appendChild(s2);
    defs.appendChild(lg);

    // Lucideの子要素に直接適用（strokeは継承されないため）
    const targets = svg.querySelectorAll('path, circle, line, polyline, polygon, rect, ellipse');
    targets.forEach((el) => el.setAttribute('stroke', `url(#${gradId})`));

    svg.setAttribute('data-irukadark-gradient', '1');
  } catch (e) {}
};

IrukaDarkApp.prototype.removeGradientFromSvg = function (svg) {
  try {
    if (!svg) return;
    // 子要素のstrokeにurl(#...)が入っていたら外す（CSSで色指定に戻す）
    const targets = svg.querySelectorAll('path, circle, line, polyline, polygon, rect, ellipse');
    targets.forEach((el) => {
      const s = el.getAttribute('stroke');
      if (s && /url\(#/.test(s)) el.removeAttribute('stroke');
    });
    svg.removeAttribute('data-irukadark-gradient');
  } catch (e) {}
};

// Auto-size helper for chat textarea
IrukaDarkApp.prototype.autosizeMessageInput = function (reset = false) {
  try {
    const el = this.messageInput;
    if (!el) return;
    const min = 36; // px ~ 2.25rem
    const max = 160; // px ~ 10rem
    if (reset) {
      el.style.height = `${min}px`;
      return;
    }
    el.style.height = 'auto';
    // Force reflow to ensure accurate scrollHeight calculation
    void el.offsetHeight; // Force reflow
    const next = Math.min(Math.max(el.scrollHeight, min), max);
    el.style.height = `${next}px`;
  } catch (e) {}
};

// Command badge configuration
IrukaDarkApp.prototype.COMMAND_BADGES = [
  { mode: 'image', pattern: /^@image\s/i, label: '@image', length: 7 },
  { mode: 'video', pattern: /^@video\s/i, label: '@video', length: 7 },
  { mode: 'slide', pattern: /^@slide\s/i, label: '@slide', length: 7 },
];

// Update input command badge (realtime badge display)
IrukaDarkApp.prototype.updateInputCommandBadge = function () {
  try {
    if (!this.inputCommandBadge || !this.messageInput) return;

    const value = this.messageInput.value;

    // Check for command patterns
    for (const cmd of this.COMMAND_BADGES) {
      if (cmd.pattern.test(value)) {
        this.showCommandBadge(cmd.mode, cmd.label);
        this.stripCommandPrefix(cmd.pattern, cmd.length);
        return;
      }
    }

    // No command detected - hide badge if not in command mode
    if (!this.currentCommandMode) {
      this.inputCommandBadge.classList.add('hidden');
      this.messageInput.classList.remove('has-command-badge');
    }
  } catch (e) {}
};

// Show command badge with specified mode and label
IrukaDarkApp.prototype.showCommandBadge = function (mode, label) {
  this.inputCommandBadge.textContent = label;
  this.inputCommandBadge.classList.remove('hidden');
  this.messageInput.classList.add('has-command-badge');
  this.currentCommandMode = mode;
};

// Strip command prefix from input and adjust cursor
IrukaDarkApp.prototype.stripCommandPrefix = function (pattern, length) {
  const value = this.messageInput.value;
  const newValue = value.replace(pattern, '');
  if (newValue !== value) {
    const cursorPos = this.messageInput.selectionStart;
    this.messageInput.value = newValue;
    this.messageInput.setSelectionRange(
      Math.max(0, cursorPos - length),
      Math.max(0, cursorPos - length)
    );
  }
};

// Clear input command badge
IrukaDarkApp.prototype.clearInputCommandBadge = function () {
  try {
    if (this.inputCommandBadge) {
      this.inputCommandBadge.classList.add('hidden');
    }
    if (this.messageInput) {
      this.messageInput.classList.remove('has-command-badge');
    }
    this.currentCommandMode = null;
  } catch (e) {}
};

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
  window.app = new IrukaDarkApp();
});
