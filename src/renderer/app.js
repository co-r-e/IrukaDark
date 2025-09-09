/*!
 * IrukaDark — (c) 2025 CORe Inc (コーレ株式会社).
 * License: MIT. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const I18N_STRINGS = (typeof window !== 'undefined' && window.IRUKADARK_I18N) || {};

// Language display names for prompt targeting
const LANG_NAMES = {
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

function getLangMeta(code) {
  const lang = String(code || 'en');
  const name = LANG_NAMES[lang] || 'English';
  const rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
  const rtl = rtlLocales.has(lang);
  return { code: lang, name, rtl };
}

let CURRENT_LANG = 'en';
function getCurrentUILanguage() {
  return CURRENT_LANG;
}
// Tone (formal/casual) — default to casual per spec
let CURRENT_TONE = 'casual';
function getCurrentTone() {
  return CURRENT_TONE || 'casual';
}
function getUIText(key, ...args) {
  const lang = getCurrentUILanguage();
  const strings = I18N_STRINGS[lang] || I18N_STRINGS.en;
  let value = strings;

  // ネストされたキーを解決
  for (const k of key.split('.')) {
    value = value?.[k];
  }

  // 関数なら実行、そうでなければそのまま返す
  if (typeof value === 'function') {
    return value(...args);
  }

  return value || key;
}

class IrukaDarkApp {
  constructor() {
    this.geminiService = new GeminiService();
    this.chatHistoryData = [];
    // Auto-scroll control: disabled during detailed shortcut flow
    this.disableAutoScroll = false;
    // Track in-flight shortcut runs to avoid parallel execution
    this.shortcutRequestId = 0;
    // Web search toggle (default from env or OFF)
    this.webSearchEnabled = false;
    // Generation state
    this.isGenerating = false;
    this.cancelRequested = false;
    this.initializeElements();
    this.bindEvents();
    this.updateUILanguage();
    this.applyThemeFromSystem();
    this.applyGlassLevelFromSystem();

    // ウィンドウ不透明度に応じたソリッド化
    this.applyWindowOpacityFromSystem();

    this.checkInitialState();
    this.createIconsEnhanced();
    this.initSlashSuggest();
    // 初期UI同期
    this.updateMonitoringUI();
    this.syncHeader();

    // Load tone from system and subscribe to changes
    try {
      if (window.electronAPI && window.electronAPI.getTone) {
        window.electronAPI.getTone().then((tone) => {
          CURRENT_TONE = tone === 'formal' ? 'formal' : 'casual';
        });
      }
      if (window.electronAPI && window.electronAPI.onToneChanged) {
        window.electronAPI.onToneChanged((tone) => {
          CURRENT_TONE = tone === 'formal' ? 'formal' : 'casual';
        });
      }
    } catch {}
  }
  updateUILanguage() {
    const lang = getCurrentUILanguage();
    document.documentElement.lang = lang;
    // Toggle RTL for Arabic (and future RTL locales)
    const rtlLocales = new Set(['ar', 'he', 'fa', 'ur']);
    if (rtlLocales.has(lang)) {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
    // no header status element anymore
    this.updateStaticHTMLText();
    // Refresh send/stop button tooltip in current language
    try {
      this.updateSendButtonIcon();
    } catch {}
  }

  // HTML内の静的テキストを更新するメソッド
  updateStaticHTMLText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      el.textContent = getUIText(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.dataset.i18nTitle;
      el.title = getUIText(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (el.placeholder !== undefined) {
        el.placeholder = getUIText(key);
      }
    });
  }

  checkInitialState() {
    if (!window.electronAPI) {
      this.addMessage('system', 'Electron APIが利用できません。アプリを再起動してください。');
      return;
    }
  }

  initializeElements() {
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.chatHistory = document.getElementById('chatHistory');
  }

  bindEvents() {
    this.sendBtn.addEventListener('click', () => {
      if (this.isGenerating) {
        this.cancelGeneration();
      } else {
        this.sendMessage();
      }
    });
    // Right-click anywhere to show the app (menubar) menu as context menu
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
    // IME考慮: Enterで送信、Shift+Enterで改行、変換中は送信しない
    this.isComposing = false;
    this.messageInput.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });
    this.messageInput.addEventListener('compositionend', () => {
      this.isComposing = false;
    });
    const onEnterToSend = (e) => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey) return; // 改行
      if (e.isComposing || this.isComposing || e.keyCode === 229) return; // IME中は無視
      e.preventDefault();
      e.stopPropagation();
      // まれに改行が入る環境対策：末尾の改行を落としてから送信
      if (this.messageInput && /\n$/.test(this.messageInput.value)) {
        this.messageInput.value = this.messageInput.value.replace(/\n+$/, '');
      }
      if (this.isGenerating) {
        this.cancelGeneration();
      } else {
        this.sendMessage();
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
        if (e.key === 'Enter' && !e.shiftKey && !(e.isComposing || this.isComposing)) {
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
    });
    this.autosizeMessageInput();
    const on = (name, cb) => {
      try {
        return window.electronAPI && window.electronAPI[name]
          ? window.electronAPI[name](cb)
          : undefined;
      } catch {}
    };
    on('onThemeChanged', (theme) => this.applyTheme(theme));
    on('onLanguageChanged', (lang) => {
      CURRENT_LANG = lang || 'en';
      this.updateUILanguage();
    });
    on('onWindowOpacityChanged', (value) => this.applySolidWindowClass(value));
    on('onExplainClipboard', (text) => this.handleExplainClipboard(text));
    on('onExplainClipboardDetailed', (text) => this.handleExplainClipboardDetailed(text));
    on('onTranslateClipboard', (text) => this.handleTranslateClipboard(text));
    on('onExplainClipboardError', (msg) =>
      this.showToast(msg || getUIText('textNotRetrieved'), 'error')
    );
    on('onExplainScreenshot', (payload) => this.handleExplainScreenshot(payload));
    on('onExplainScreenshotDetailed', (payload) => this.handleExplainScreenshotDetailed(payload));
    // Do not show the accessibility warning in chat
    on('onAccessibilityWarning', () => {
      /* no-op in chat UI */
    });
    on('onShortcutRegistered', (accel) => {
      if (!accel) {
        this.showToast(getUIText('failedToRegisterShortcut'), 'error', 3600);
        return;
      }
      const isMacUA = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
      let display = (accel || '').replace('CommandOrControl', 'Cmd/Ctrl');
      if (isMacUA) display = display.replace(/\bAlt\b/g, 'Option');
      if (accel && accel !== 'Alt+A') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutDetailedRegistered', (accel) => {
      if (!accel) return; // 詳細ショートカットが登録できなかった場合は無通知
      const isMacUA = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
      let display = (accel || '').replace('CommandOrControl', 'Cmd/Ctrl');
      if (isMacUA) display = display.replace(/\bAlt\b/g, 'Option');
      // 既定想定は Alt+Shift+A（Mac表示: Option+Shift+A）
      if (accel && accel !== 'Alt+Shift+A') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });
    on('onShortcutTranslateRegistered', (accel) => {
      if (!accel) return; // 登録に失敗した場合は無通知
      const isMacUA = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
      let display = (accel || '').replace('CommandOrControl', 'Cmd/Ctrl');
      if (isMacUA) display = display.replace(/\bAlt\b/g, 'Option');
      // 既定想定は Alt+R（Mac表示: Option+R）
      if (accel && accel !== 'Alt+R') {
        this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
      }
    });

    // Update notifications (notification-only)
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
    // 初期言語の同期を非同期で実行
    this.initializeLanguage();
    // Web検索設定の読み込み
    this.loadWebSearchSetting();
  }

  async loadWebSearchSetting() {
    try {
      if (window.electronAPI && window.electronAPI.getWebSearchEnabled) {
        const enabled = await window.electronAPI.getWebSearchEnabled();
        this.webSearchEnabled = !!enabled;
      }
    } catch (error) {
      console.error('Failed to load web search setting:', error);
      this.webSearchEnabled = false;
    }
  }

  async initializeLanguage() {
    try {
      if (window.electronAPI && window.electronAPI.getUILanguage) {
        const lang = await window.electronAPI.getUILanguage();
        CURRENT_LANG = lang || 'en';
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
    // マッピング: high=より透ける, medium=標準, low=より不透過
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
    const solid = (parseFloat(value) || 1) >= 0.999;
    const html = document.documentElement;
    if (solid) html.classList.add('solid-window');
    else html.classList.remove('solid-window');
  }

  /**
   * クリップボードのテキストを解説する（画像は送付しないテキスト専用モード）
   */
  async handleExplainClipboard(text) {
    // Cancel any previous shortcut run and mark a new token
    await this.cancelActiveShortcut();
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    // 詳細（Option+Shift+S/A）と同じ挙動: 自動スクロールを一時停止
    this.disableAutoScroll = true;
    // システムメッセージ（?アイコン）として、AIに送るテキストをそのまま表示
    this.addMessage('system-question', content);
    // ステータス更新はヘッダーのみ同期
    this.syncHeader();
    this.showTypingIndicator();

    try {
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
      // If the window was hidden, unhide it non-activating so user sees the result
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
      // ステータス表示はヘッダーのみ同期
      this.syncHeader();
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
      this.syncHeader();
    } finally {
      // 自動スクロールを元に戻す
      this.disableAutoScroll = false;
    }
  }

  /**
   * クリップボードのテキストを「詳しくわかりやすく」説明する
   */
  async handleExplainClipboardDetailed(text) {
    await this.cancelActiveShortcut();
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    // Suppress auto-scroll for detailed explain flow
    this.disableAutoScroll = true;
    this.addMessage('system-question', content);
    this.syncHeader();
    this.showTypingIndicator();

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
      // Ensure the window is visible (do not steal focus)
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
      this.syncHeader();
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
      this.syncHeader();
    } finally {
      // Re-enable auto-scroll after the detailed flow completes
      this.disableAutoScroll = false;
    }
  }

  /**
   * 選択テキストの純粋な翻訳（出力のみ、説明なし）
   */
  async handleTranslateClipboard(text) {
    await this.cancelActiveShortcut();
    const token = ++this.shortcutRequestId;
    const content = (text || '').trim();
    if (!content) return;
    // 翻訳中は自動スクロールを抑制
    this.disableAutoScroll = true;
    this.addMessage('system-question', getUIText('selectionTranslation'));
    this.syncHeader();
    this.showTypingIndicator();

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
      // 表示のみ（フォーカスは奪わない）
      try {
        window.electronAPI &&
          window.electronAPI.ensureVisible &&
          window.electronAPI.ensureVisible(false);
      } catch {}
      this.syncHeader();
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
      this.syncHeader();
    } finally {
      this.disableAutoScroll = false;
    }
  }

  /**
   * スクリーンショット画像の内容を解説する
   */
  async handleExplainScreenshot(payload) {
    try {
      await this.cancelActiveShortcut();
      const token = ++this.shortcutRequestId;
      const data = payload && payload.data ? String(payload.data) : '';
      const mime = payload && payload.mimeType ? String(payload.mimeType) : 'image/png';
      if (!data) return; // キャンセル等
      // 詳細版（Option+Shift+S）と同じスクロール挙動に合わせるため一時的に自動スクロールを抑制
      this.disableAutoScroll = true;
      this.addMessage('system-question', getUIText('selectionExplanation'));
      this.syncHeader();
      this.showTypingIndicator();
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
      this.syncHeader();
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
      this.syncHeader();
    } finally {
      // 詳細版同様、処理完了後に自動スクロールを元に戻す
      this.disableAutoScroll = false;
    }
  }

  /**
   * スクリーンショット画像の内容を「詳しく」解説する
   */
  async handleExplainScreenshotDetailed(payload) {
    try {
      await this.cancelActiveShortcut();
      const token = ++this.shortcutRequestId;
      const data = payload && payload.data ? String(payload.data) : '';
      const mime = payload && payload.mimeType ? String(payload.mimeType) : 'image/png';
      if (!data) return;
      // Detailed flow mirrors text detailed: suppress autoscroll
      this.disableAutoScroll = true;
      this.addMessage('system-question', getUIText('selectionExplanation'));
      this.syncHeader();
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
      this.syncHeader();
    } catch (e) {
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
        return;
      }
      this.hideTypingIndicator();
      this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
      this.syncHeader();
    } finally {
      this.disableAutoScroll = false;
    }
  }

  // Cancel any in-flight shortcut generation on the main process
  async cancelActiveShortcut() {
    try {
      if (window?.electronAPI?.cancelAI) {
        await window.electronAPI.cancelAI();
      }
      // Ensure previous typing indicator is cleared to avoid duplicates
      this.hideTypingIndicator();
    } catch {}
  }

  updateMonitoringUI() {
    this.syncHeader();
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
    const message = this.messageInput.value.trim();
    if (!message) return;

    this.messageInput.value = '';
    // 高さをリセット（自動サイズ）
    this.autosizeMessageInput(true);
    // 入力IMEの状態が安定するよう送信後に再フォーカス
    this.messageInput.focus();
    // Slash commands
    if (message.startsWith('/')) {
      await this.handleSlashCommand(message);
      // 高さをリセット（自動サイズ）
      this.autosizeMessageInput(true);
      this.messageInput.focus();
      return;
    }

    this.addMessage('user', message);
    this.syncHeader();
    // Identity questions: answer directly with branded, short, unique line
    if (this.maybeRespondIdentity(message)) {
      this.messageInput?.focus();
      return;
    }
    // Default to thinking indicator only
    // 詳細ショートカットと同じUI挙動に統一: 生成中は自動スクロールを抑制
    this.disableAutoScroll = true;
    this.showTypingIndicator();

    try {
      const historyText = this.buildHistoryContext();
      const response = await this.geminiService.generateResponse(
        message,
        historyText,
        this.webSearchEnabled
      );

      this.hideTypingIndicator();
      if (this.cancelRequested) {
        return;
      }
      this.addMessage('ai', response);
      // 入力へフォーカスを戻す（連投が快適に）
      this.messageInput?.focus();

      // ステータス更新はヘッダーのみ同期
      this.syncHeader();
    } catch (error) {
      this.hideTypingIndicator();
      if (this.cancelRequested || /CANCELLED|Abort/i.test(String(error?.message || ''))) {
        return;
      }
      this.addMessage('system', `${getUIText('errorOccurred')}: ${error.message}`);
      this.syncHeader();
      this.messageInput?.focus();
    } finally {
      // 自動スクロールの設定を元に戻す
      this.disableAutoScroll = false;
    }
  }

  // Return true if handled as identity question
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
      // 詳細ショートカットと同じUI挙動: 出力時は自動スクロール抑制
      const prev = this.disableAutoScroll;
      this.disableAutoScroll = true;
      try {
        this.addMessage('ai', reply);
      } finally {
        this.disableAutoScroll = prev;
      }
      return true;
    } catch {
      return false;
    }
  }

  pickIdentityResponse(lang) {
    const ja = [
      'IrukaDarkです。CORe Inc（コーレ株式会社）製の小さな相棒AI。さっと答えます。',
      '私はIrukaDark。CORe Inc（コーレ株式会社）生まれのデスクトップAIです。',
      'IrukaDark—CORe Inc（コーレ株式会社）がつくった、軽快で手軽なAIです。',
      '呼ばれて飛び出るIrukaDark。CORe Inc（コーレ株式会社）製、素早く要点を届けます。',
      'どうも、IrukaDarkです。CORe Inc（コーレ株式会社）発のミニAI。日常の「ちょっと」を解決します。',
      'IrukaDarkです。CORe Inc（コーレ株式会社）製。小さくても頼れる、常駐型AI。',
    ];
    const en = [
      "I'm IrukaDark — a tiny desktop AI made by CORe Inc (コーレ株式会社).",
      'Hi, IrukaDark here. Built at CORe Inc (コーレ株式会社) to help fast.',
      'IrukaDark, crafted by CORe Inc (コーレ株式会社). Small app, quick answers.',
      'I am IrukaDark, a lightweight helper AI by CORe Inc (コーレ株式会社).',
      'IrukaDark — born at CORe Inc (コーレ株式会社). Here to keep things snappy.',
      'Hey! I’m IrukaDark. Made by CORe Inc (コーレ株式会社) for instant help.',
    ];
    const arr = lang === 'ja' ? ja : en;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async handleSlashCommand(input) {
    const cmd = (input || '').trim();
    const lower = cmd.toLowerCase();
    if (lower === '/clear') {
      try {
        this.chatHistoryData = [];
        // DOMクリア
        if (this.chatHistory) this.chatHistory.innerHTML = '';
        this.addMessage('system', getUIText('historyCleared'));
      } catch (e) {
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      }
      return;
    }

    if (lower === '/compact') {
      try {
        // 詳細ショートカットと同じUI挙動
        this.disableAutoScroll = true;
        const historyText = this.buildHistoryContext(8000, 30);
        this.showTypingIndicator();
        const summary = await this.geminiService.generateHistorySummary(
          historyText,
          this.webSearchEnabled
        );
        this.hideTypingIndicator();
        if (this.cancelRequested) {
          return;
        }
        // 履歴を要約のみで置き換え（コンパクト化）
        this.chatHistoryData = [{ role: 'assistant', content: summary }];
        // 表示上はAIメッセージとして要約を追加
        this.addMessage('ai', summary);
        this.addMessage('system', getUIText('historyCompacted'));
      } catch (e) {
        this.hideTypingIndicator();
        if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
          return;
        }
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      } finally {
        this.disableAutoScroll = false;
      }
      return;
    }

    if (lower === '/next') {
      try {
        // 詳細ショートカットと同じUI挙動
        this.disableAutoScroll = true;
        const lastAI = [...(this.chatHistoryData || [])]
          .reverse()
          .find((m) => m && m.role === 'assistant' && m.content);
        if (!lastAI) {
          this.addMessage('system', getUIText('noPreviousAI'));
          return;
        }
        const historyText = this.buildHistoryContext(8000, 30);
        this.showTypingIndicator();
        const cont = await this.geminiService.generateContinuation(
          String(lastAI.content || ''),
          historyText,
          this.webSearchEnabled
        );
        this.hideTypingIndicator();
        if (this.cancelRequested) {
          return;
        }
        this.addMessage('ai', cont);
      } catch (e) {
        this.hideTypingIndicator();
        if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
          return;
        }
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      } finally {
        this.disableAutoScroll = false;
      }
      return;
    }

    if (lower === '/table') {
      try {
        this.disableAutoScroll = true;
        const lastAI = [...(this.chatHistoryData || [])]
          .reverse()
          .find((m) => m && m.role === 'assistant' && m.content);
        if (!lastAI) {
          this.addMessage('system', getUIText('noPreviousAI'));
          return;
        }
        const historyText = this.buildHistoryContext(8000, 30);
        this.showTypingIndicator();
        const table = await this.geminiService.generateTableFromText(
          String(lastAI.content || ''),
          historyText,
          this.webSearchEnabled
        );
        this.hideTypingIndicator();
        if (this.cancelRequested) {
          return;
        }
        this.addMessage('ai', table);
      } catch (e) {
        this.hideTypingIndicator();
        if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
          return;
        }
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      } finally {
        this.disableAutoScroll = false;
      }
      return;
    }

    // Clarify last AI output: /What do you mean?
    if (lower === '/what do you mean?') {
      try {
        this.disableAutoScroll = true;
        const lastAI = [...(this.chatHistoryData || [])]
          .reverse()
          .find((m) => m && m.role === 'assistant' && m.content);
        if (!lastAI) {
          this.addMessage('system', getUIText('noPreviousAI'));
          return;
        }
        const historyText = this.buildHistoryContext(8000, 30);
        this.showTypingIndicator();
        const clarified = await this.geminiService.generateClarificationFromText(
          String(lastAI.content || ''),
          historyText,
          this.webSearchEnabled
        );
        this.hideTypingIndicator();
        if (this.cancelRequested) {
          return;
        }
        this.addMessage('ai', clarified);
      } catch (e) {
        this.hideTypingIndicator();
        if (this.cancelRequested || /CANCELLED|Abort/i.test(String(e?.message || ''))) {
          return;
        }
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      } finally {
        this.disableAutoScroll = false;
      }
      return;
    }

    if (lower === '/contact') {
      try {
        const fixed = 'https://co-r-e.net/contact';
        await (window.electronAPI && window.electronAPI.openExternal
          ? window.electronAPI.openExternal(fixed)
          : Promise.resolve(false));
      } catch (e) {
        this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
      }
      return;
    }

    // /websearch commands: on|off|status (aliases: /web)
    if (lower.startsWith('/websearch') || lower.startsWith('/web ') || lower === '/web') {
      const parts = cmd
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const act = (parts[1] || '').toLowerCase();
      if (act === 'on') {
        this.webSearchEnabled = true;
        // Save to .env.local
        if (window.electronAPI && window.electronAPI.saveWebSearchSetting) {
          window.electronAPI.saveWebSearchSetting(true);
        }
        this.addMessage('system', getUIText('webSearchEnabled'));
        return;
      }
      if (act === 'off') {
        this.webSearchEnabled = false;
        // Save to .env.local
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

  initSlashSuggest() {
    this.slashCommands = [
      // 1) New command at the top
      {
        key: '/what do you mean?',
        label: '/What do you mean?',
        desc: { en: 'Clarify the last AI output', ja: '直前のAI出力をわかりやすく説明' },
      },
      // 2) /next second
      {
        key: '/next',
        label: '/next',
        desc: { en: 'Continue the last AI output', ja: '直前のAI回答の続きを生成' },
      },
      // 3) /table third
      {
        key: '/table',
        label: '/table',
        desc: { en: 'Reformat last AI output into a table', ja: '直前のAI出力を表に変換' },
      },

      // Others
      { key: '/clear', label: '/clear', desc: { en: 'Clear chat history', ja: '履歴をクリア' } },
      {
        key: '/compact',
        label: '/compact',
        desc: { en: 'Summarize and compact history', ja: '履歴を要約して圧縮' },
      },
      {
        key: '/websearch on',
        label: '/websearch on',
        desc: { en: 'Enable Web Search', ja: 'Web検索を有効化' },
      },
      {
        key: '/websearch off',
        label: '/websearch off',
        desc: { en: 'Disable Web Search', ja: 'Web検索を無効化' },
      },
      {
        key: '/websearch status',
        label: '/websearch status',
        desc: { en: 'Show Web Search status', ja: 'Web検索の状態を表示' },
      },
      // 4) /contact must be last
      {
        key: '/contact',
        label: '/contact',
        desc: { en: 'Open contact URL', ja: '連絡先URLを開く' },
      },
    ];
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
      div.innerHTML = `<span class=\"cmd\">${c.label}</span><span class=\"desc\">${c.desc?.[lang] || c.desc?.en || c.label}</span>`;
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
    const v = (this.messageInput?.value || '').trim();
    if (!v.startsWith('/')) return [];
    const q = v.toLowerCase();
    return this.slashCommands.filter((c) => c.key.startsWith(q));
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
      this.handleSlashCommand(cmd);
      this.messageInput.value = '';
      this.autosizeMessageInput(true);
      this.messageInput.focus();
    }
  }

  setGenerating(on) {
    this.isGenerating = !!on;
    if (on) this.cancelRequested = false;
    try {
      this.updateSendButtonIcon();
    } catch {}
  }

  updateSendButtonIcon() {
    try {
      if (!this.sendBtn) return;
      if (this.isGenerating) {
        // Stop icon (square)
        this.sendBtn.innerHTML = `
                    <svg class="w-4 h-4 no-gradient" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                `;
        this.sendBtn.title = getUIText('stop');
      } else {
        // Send icon (paper plane)
        this.sendBtn.innerHTML = `
                    <svg class="w-4 h-4 no-gradient" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M22 2L11 13"></path>
                      <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
                    </svg>
                `;
        this.sendBtn.title = getUIText('send');
      }
    } catch {}
  }

  cancelGeneration() {
    try {
      this.cancelRequested = true;
      if (window?.electronAPI?.cancelAI) {
        // Best-effort cancel on main process
        window.electronAPI.cancelAI().catch(() => {});
      }
    } catch {}
    this.hideTypingIndicator();
    this.setGenerating(false);
    this.addMessage('system', getUIText('canceled'));
    this.syncHeader();
  }

  showTypingIndicator() {
    this.setGenerating(true);
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'message-ai-container';
    typingDiv.innerHTML = `
      <div class="typing-indicator-content">
        <div class="flex items-center gap-2">
          <div class="flex gap-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
          </div>
          <span class="thinking-small text-gray-500" data-role="typing-label">${getUIText('thinking')}</span>
        </div>
      </div>
    `;

    this.chatHistory.appendChild(typingDiv);
    // Always ensure the typing indicator is visible
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

  hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }

    this.setGenerating(false);
  }

  addMessage(type, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-${type} message-enter`;

    if (type === 'user') {
      const safe = this.escapeHtml(content).replace(/\n/g, '<br>');
      this.chatHistoryData.push({ role: 'user', content });
      messageDiv.innerHTML = `
        <div class="message-user-container">
          <div class="message-user-content">
            ${safe}
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
      // Build DOM to allow badge + accordion below
      const container = document.createElement('div');
      container.className = 'message-ai-container';
      const contentEl = document.createElement('div');
      contentEl.className = 'message-ai-content';
      contentEl.innerHTML = markdownContent;
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
          true
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
          a.addEventListener('click', (e) => {
            e.preventDefault();
            try {
              if (window.electronAPI && window.electronAPI.openExternal) {
                window.electronAPI.openExternal(String(s.url));
              }
            } catch {}
          });
          li.appendChild(a);
          list.appendChild(li);
        });
        acc.appendChild(list);
        // Toggle behavior
        badge.addEventListener('click', () => {
          acc.classList.toggle('hidden');
        });
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
      messageDiv.className = 'message-enter';
      messageDiv.innerHTML =
        '<div class="message-system message-system-compact">' + this.escapeHtml(content) + '</div>';
      try {
        const el = messageDiv.querySelector('.message-system-compact');
        if (el) {
          el.addEventListener('click', () => {
            el.classList.toggle('expanded');
          });
        }
      } catch {}
      this.chatHistoryData.push({ role: 'user', content });
    } else if (type === 'system') {
      // すべてのシステムメッセージはコンパクト表示に統一（2行クランプ、クリックで展開）
      messageDiv.className = 'message-enter';
      messageDiv.innerHTML =
        '<div class="message-system message-system-compact">' + this.escapeHtml(content) + '</div>';
      try {
        const el = messageDiv.querySelector('.message-system-compact');
        if (el) {
          el.addEventListener('click', () => {
            el.classList.toggle('expanded');
          });
        }
      } catch {}
    } else {
      // Fallback: treat as compact system style for consistency
      messageDiv.className = 'message-enter';
      messageDiv.innerHTML =
        '<div class="message-system message-system-compact">' + this.escapeHtml(content) + '</div>';
      try {
        const el = messageDiv.querySelector('.message-system-compact');
        if (el) {
          el.addEventListener('click', () => {
            el.classList.toggle('expanded');
          });
        }
      } catch {}
    }

    this.chatHistory.appendChild(messageDiv);
    if (!this.disableAutoScroll) {
      this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }

    // システムメッセージ（通常/ショートカット）でアイコンを初期化
    if (type === 'system' || type === 'system-question') {
      this.createIconsEnhanced();
    }
  }

  // 直近のチャット履歴をテキスト化して返す
  buildHistoryContext(maxChars = 6000, maxMessages = 12) {
    try {
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
      return text;
    } catch (e) {
      return '';
    }
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

  syncHeader() {}

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

  async requestText(prompt, useWebSearch = false, source = 'chat') {
    try {
      if (window.electronAPI && window.electronAPI.aiGenerate) {
        const cfg = this.defaultGenerationConfig();
        const result = await window.electronAPI.aiGenerate(prompt, {
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

  async generateResponse(userMessage, historyText = '', useWebSearch = false) {
    const prompt = this.buildTextOnlyPrompt(userMessage, historyText);
    return this.requestText(prompt, useWebSearch, 'chat');
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

  /** テキストのみを解説する（UI言語に合わせて出力言語を切替） */
  async generateTextExplanation(text, historyText = '', useWebSearch = false) {
    const lang =
      (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
    const { name, code } = getLangMeta(lang);
    const t =
      text.length > 8000
        ? text.slice(0, 8000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)')
        : text;
    let prompt;
    if (lang === 'ja') {
      prompt = `「${t}」について一言で教えてください。日本語で短く1文で、結論から端的に。`;
    } else {
      prompt = `Explain "${t}" in one short sentence. Start with the conclusion, be clear and concise. Respond strictly in ${name} (${code}).`;
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
    const next = Math.min(Math.max(el.scrollHeight, min), max);
    el.style.height = `${next}px`;
  } catch (e) {}
};

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
  new IrukaDarkApp();
});
