const I18N_STRINGS = {
    en: {
        errorOccurred: 'An error occurred',
        apiKeyMissing: 'API key is not set. Please set GEMINI_API_KEY in .env.local file.',
        apiUnavailable: 'Electron API is not available. Please restart the app.',
        unexpectedResponse: 'Unexpected response from API.',
        apiError: 'API error occurred:',
        textNotRetrieved: 'Text could not be retrieved',
        thinking: 'Thinking...',
        accessibilityWarning: 'For automatic copying, please grant permission in System Preferences > Security & Privacy > Accessibility.',
        shortcutRegistered: (accel) => `Shortcut set to ${accel.replace('CommandOrControl', 'Cmd/Ctrl')}`,
        failedToRegisterShortcut: 'Failed to register shortcut. There may be a conflict with another app.',
        placeholder: 'Ask IrukaDark...',
        send: 'Send',
        historyCleared: 'Chat history cleared.',
        historyCompacted: 'Compressed chat history with a summary.',
        availableCommands: 'Available commands: /clear, /compact, /next, /contact',
        noPreviousAI: 'No previous AI message to continue.'
    },
    ja: {
        errorOccurred: 'エラーが発生しました',
        apiKeyMissing: 'APIキーが設定されていません。.env.localファイルにGEMINI_API_KEYを設定してください。',
        apiUnavailable: 'Electron APIが利用できません。アプリを再起動してください。',
        unexpectedResponse: 'APIから予期しない応答が返されました。',
        apiError: 'APIエラーが発生しました:',
        textNotRetrieved: 'テキストが取得できませんでした',
        thinking: '考え中...',
        accessibilityWarning: '自動コピーのため、システム設定 > プライバシーとセキュリティ > アクセシビリティ で許可が必要です。未許可の場合は手動でコピー（Cmd+C）してから実行してください。',
        shortcutRegistered: (accel) => `ショートカットを ${accel.replace('CommandOrControl', 'Cmd/Ctrl')} に設定しました`,
        failedToRegisterShortcut: 'ショートカットの登録に失敗しました。別のアプリと競合している可能性があります。',
        placeholder: 'イルカダークに質問する...',
        send: '送信',
        historyCleared: '履歴をクリアしました。',
        historyCompacted: '履歴を要約して圧縮しました。',
        availableCommands: '利用可能なコマンド: /clear, /compact, /next, /contact',
        noPreviousAI: '直前のAIメッセージがありません。'
    }
};

let CURRENT_LANG = 'en';
function getCurrentUILanguage() {
    return CURRENT_LANG;
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
    }
    updateUILanguage() {
        const currentLang = getCurrentUILanguage();
        document.documentElement.lang = currentLang;
        // no header status element anymore
        this.updateStaticHTMLText();
    }

    // HTML内の静的テキストを更新するメソッド
    updateStaticHTMLText() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            el.textContent = getUIText(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            el.title = getUIText(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
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

    // JSによるアクセント適用は不要（CSSで一元管理）

    bindEvents() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        // Right-click anywhere to show the app (menubar) menu as context menu
        window.addEventListener('contextmenu', (e) => {
            try {
                e.preventDefault();
                const pos = { x: e.clientX || e.x || 0, y: e.clientY || e.y || 0 };
                if (window?.electronAPI?.showAppMenu) {
                    window.electronAPI.showAppMenu(pos);
                }
            } catch {}
        }, { capture: true });
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
                this.messageInput.value = this.messageInput.value.replace(/\n+$/,'');
            }
            this.sendMessage();
        };
        this.messageInput.addEventListener('keydown', (e) => {
            if (this.handleSlashSuggestKeydown(e)) return;
            onEnterToSend(e);
        }, { capture: true });
        this.messageInput.addEventListener('keypress', (e) => {
            if (this.suggestVisible && e.key === 'Enter') { e.preventDefault(); return; }
            onEnterToSend(e);
        }, { capture: true });
        this.messageInput.addEventListener('keyup', (e) => {
            if (this.suggestVisible && e.key === 'Enter') { e.preventDefault(); return; }
            if (e.key === 'Enter' && !e.shiftKey && !(e.isComposing || this.isComposing)) {
                if (this.messageInput) {
                    this.messageInput.value = this.messageInput.value.replace(/\n+$/,'');
                }
            }
        }, { capture: true });
        this.messageInput.addEventListener('input', () => { this.autosizeMessageInput(); this.maybeShowSlashSuggest(); });
        this.autosizeMessageInput();
        const on = (name, cb) => { try { return window.electronAPI && window.electronAPI[name] ? window.electronAPI[name](cb) : undefined; } catch {} };
        on('onThemeChanged', (theme) => this.applyTheme(theme));
        on('onLanguageChanged', (lang) => { CURRENT_LANG = lang || 'en'; this.updateUILanguage(); });
        on('onGlassLevelChanged', (level) => this.applyGlassLevel(level));
        on('onWindowOpacityChanged', (value) => this.applySolidWindowClass(value));
        on('onExplainClipboard', (text) => this.handleExplainClipboard(text));
        on('onExplainClipboardDetailed', (text) => this.handleExplainClipboardDetailed(text));
        on('onExplainClipboardError', (msg) => this.showToast(msg || getUIText('textNotRetrieved'), 'error'));
        on('onExplainScreenshot', (payload) => this.handleExplainScreenshot(payload));
        on('onExplainScreenshotDetailed', (payload) => this.handleExplainScreenshotDetailed(payload));
        on('onAccessibilityWarning', () => this.addMessage('system', getUIText('accessibilityWarning')));
        on('onShortcutRegistered', (accel) => {
                if (!accel) {
                    this.showToast(getUIText('failedToRegisterShortcut'), 'error', 3600);
                    return;
                }
                const isMacUA = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
                let display = (accel || '')
                    .replace('CommandOrControl', 'Cmd/Ctrl');
                if (isMacUA) display = display.replace(/\bAlt\b/g, 'Option');
                if (accel && accel !== 'Alt+A') {
                    this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
                }
        });
        on('onShortcutDetailedRegistered', (accel) => {
                if (!accel) return; // 詳細ショートカットが登録できなかった場合は無通知
                const isMacUA = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);
                let display = (accel || '')
                    .replace('CommandOrControl', 'Cmd/Ctrl');
                if (isMacUA) display = display.replace(/\bAlt\b/g, 'Option');
                // 既定想定は Alt+Shift+A（Mac表示: Option+Shift+A）
                if (accel && accel !== 'Alt+Shift+A') {
                    this.showToast(getUIText('shortcutRegistered', display), 'info', 3200);
                }
        });

        if (!window.electronAPI) {
            this.addMessage('system', getUIText('apiUnavailable'));
        }
        // 初期言語の同期を非同期で実行
        this.initializeLanguage();
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
        let light = 0.20, dark1 = 0.90, dark2 = 0.90, input = 0.45;
        if (level === 'high') {
            light = 0.10; dark1 = 0.70; dark2 = 0.70; input = 0.35;
        } else if (level === 'low') {
            light = 0.32; dark1 = 0.96; dark2 = 0.96; input = 0.60;
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
        if (solid) html.classList.add('solid-window'); else html.classList.remove('solid-window');
    }

    // 旧メニュー機能は無効化（バツボタンで閉じる運用へ）

    /**
     * クリップボードのテキストを解説する（画像は送付しないテキスト専用モード）
     */
    async handleExplainClipboard(text) {
        const content = (text || '').trim();
        if (!content) return;
        // システムメッセージ（?アイコン）として、AIに送るテキストをそのまま表示
        this.addMessage('system-question', content);
        // ステータス更新はヘッダーのみ同期
        this.syncHeader();
        this.showTypingIndicator();

        try {
            const historyText = this.buildHistoryContext();
            const response = await this.geminiService.generateTextExplanation(content, historyText);
            this.hideTypingIndicator();
            this.addMessage('ai', response);
            // ステータス表示はヘッダーのみ同期
            this.syncHeader();
        } catch (e) {
            this.hideTypingIndicator();
            this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
            this.syncHeader();
        }
    }

    /**
     * クリップボードのテキストを「詳しくわかりやすく」説明する
     */
    async handleExplainClipboardDetailed(text) {
        const content = (text || '').trim();
        if (!content) return;
        // Suppress auto-scroll for detailed explain flow
        this.disableAutoScroll = true;
        this.addMessage('system-question', content);
        this.syncHeader();
        this.showTypingIndicator();

        try {
            const historyText = this.buildHistoryContext();
            const response = await this.geminiService.generateDetailedExplanation(content, historyText);
            this.hideTypingIndicator();
            this.addMessage('ai', response);
            this.syncHeader();
        } catch (e) {
            this.hideTypingIndicator();
            this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
            this.syncHeader();
        } finally {
            // Re-enable auto-scroll after the detailed flow completes
            this.disableAutoScroll = false;
        }
    }

    /**
     * スクリーンショット画像の内容を解説する
     */
    async handleExplainScreenshot(payload) {
        try {
            const data = payload && payload.data ? String(payload.data) : '';
            const mime = payload && payload.mimeType ? String(payload.mimeType) : 'image/png';
            if (!data) return; // キャンセル等
            const lang = getCurrentUILanguage();
            const question = (lang === 'ja')
                ? 'スクリーンショットの概要'
                : 'Screenshot Summary';
            this.addMessage('system-question', question);
            this.syncHeader();
            this.showTypingIndicator();
            const historyText = this.buildHistoryContext();
            const response = await this.geminiService.generateImageExplanation(data, mime, historyText);
            this.hideTypingIndicator();
            this.addMessage('ai', response);
            this.syncHeader();
        } catch (e) {
            this.hideTypingIndicator();
            this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
            this.syncHeader();
        }
    }

    /**
     * スクリーンショット画像の内容を「詳しく」解説する
     */
    async handleExplainScreenshotDetailed(payload) {
        try {
            const data = payload && payload.data ? String(payload.data) : '';
            const mime = payload && payload.mimeType ? String(payload.mimeType) : 'image/png';
            if (!data) return;
            // Detailed flow mirrors text detailed: suppress autoscroll
            this.disableAutoScroll = true;
            const lang = getCurrentUILanguage();
            const question = (lang === 'ja')
                ? 'スクリーンショットの詳細'
                : 'Screenshot Details';
            this.addMessage('system-question', question);
            this.syncHeader();
            this.showTypingIndicator();
            const historyText = this.buildHistoryContext();
            const response = await this.geminiService.generateImageDetailedExplanation(data, mime, historyText);
            this.hideTypingIndicator();
            this.addMessage('ai', response);
            this.syncHeader();
        } catch (e) {
            this.hideTypingIndicator();
            this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown error'}`);
            this.syncHeader();
        } finally {
            this.disableAutoScroll = false;
        }
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
            this.showTypingIndicator();

        try {
            const historyText = this.buildHistoryContext();
            const response = await this.geminiService.generateResponse(message, historyText);
            this.hideTypingIndicator();
            this.addMessage('ai', response);
            // 入力へフォーカスを戻す（連投が快適に）
            this.messageInput?.focus();

            // ステータス更新はヘッダーのみ同期
            this.syncHeader();
        } catch (error) {
            // log suppressed in production
            this.hideTypingIndicator();
            this.addMessage('system', `${getUIText('errorOccurred')}: ${error.message}`);
            this.syncHeader();
            this.messageInput?.focus();
        }
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
                const historyText = this.buildHistoryContext(8000, 30);
                this.showTypingIndicator();
                const summary = await this.geminiService.generateHistorySummary(historyText);
                this.hideTypingIndicator();
                // 履歴を要約のみで置き換え（コンパクト化）
                this.chatHistoryData = [ { role: 'assistant', content: summary } ];
                // 表示上はAIメッセージとして要約を追加
                this.addMessage('ai', summary);
                this.addMessage('system', getUIText('historyCompacted'));
            } catch (e) {
                this.hideTypingIndicator();
                this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
            }
            return;
        }

        if (lower === '/next') {
            try {
                const lastAI = [...(this.chatHistoryData || [])].reverse().find(m => m && m.role === 'assistant' && m.content);
                if (!lastAI) { this.addMessage('system', getUIText('noPreviousAI')); return; }
                const historyText = this.buildHistoryContext(8000, 30);
                this.showTypingIndicator();
                const cont = await this.geminiService.generateContinuation(String(lastAI.content || ''), historyText);
                this.hideTypingIndicator();
                this.addMessage('ai', cont);
            } catch (e) {
                this.hideTypingIndicator();
                this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
            }
            return;
        }

        if (lower === '/contact') {
            try {
                const fixed = 'https://co-r-e.net/contact';
                await (window.electronAPI && window.electronAPI.openExternal ? window.electronAPI.openExternal(fixed) : Promise.resolve(false));
            } catch (e) {
                this.addMessage('system', `${getUIText('errorOccurred')}: ${e?.message || 'Unknown'}`);
            }
            return;
        }

        this.addMessage('system', getUIText('availableCommands'));
    }

    initSlashSuggest() {
        this.slashCommands = [
            { key: '/clear', label: '/clear', desc: { en: 'Clear chat history', ja: '履歴をクリア' } },
            { key: '/compact', label: '/compact', desc: { en: 'Summarize and compact history', ja: '履歴を要約して圧縮' } },
            { key: '/next', label: '/next', desc: { en: 'Continue the last AI output', ja: '直前のAI回答の続きを生成' } },
            { key: '/contact', label: '/contact', desc: { en: 'Open contact URL', ja: '連絡先URLを開く' } }
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
            div.innerHTML = `<span class="cmd">${c.label}</span><span class="desc">${(c.desc?.[lang] || c.label)}</span>`;
            this.suggestList.appendChild(div);
        });
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
        return this.slashCommands.filter(c => c.key.startsWith(q));
    }

    maybeShowSlashSuggest() {
        const v = (this.messageInput?.value || '').trim();
        if (!v.startsWith('/')) { this.hideSlashSuggest(); return; }
        const items = this.currentSlashCandidates();
        if (!items.length) { this.hideSlashSuggest(); return; }
        if (!this.suggestVisible) this.showSlashSuggest(items); else this.renderSlashSuggest(items);
    }

    handleSlashSuggestKeydown(e) {
        if (!this.suggestVisible) return false;
        const items = this.currentSlashCandidates();
        if (!items.length) { this.hideSlashSuggest(); return false; }
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

    

    showTypingIndicator() {
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
          <span class="text-sm text-gray-500">${getUIText('thinking')}</span>
        </div>
      </div>
    `;

        this.chatHistory.appendChild(typingDiv);
        if (!this.disableAutoScroll) {
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
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
            const markdownContent = this.renderMarkdown(content);
            this.chatHistoryData.push({ role: 'assistant', content });
            messageDiv.innerHTML = `
        <div class="message-ai-container">
          <div class="message-ai-content">
            ${markdownContent}
          </div>
        </div>
      `;
        } else if (type === 'system-question') {
            // ショートカット由来のシステム表示（2行まで表示し、クリックで展開/折りたたみ）
            messageDiv.className = 'message-enter';
            messageDiv.innerHTML = '<div class="message-system message-system-compact">' +
                this.escapeHtml(content) +
                '</div>';
            try {
                const el = messageDiv.querySelector('.message-system-compact');
                if (el) {
                    el.addEventListener('click', () => {
                        el.classList.toggle('expanded');
                    });
                }
            } catch {}
            this.chatHistoryData.push({ role: 'user', content });
        } else {
            // Avoid double styling: keep outer wrapper neutral
            messageDiv.className = 'message-enter';
            messageDiv.innerHTML = '<div class="message-system">' +
                '<i data-lucide="info" class="w-3 h-3 inline mr-1"></i>' +
                this.escapeHtml(content) +
                '</div>';
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
            const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
            for (const m of recent) {
                if (!m || !m.content) continue;
                const role = m.role === 'assistant' ? 'AI' : (lang === 'ja' ? 'ユーザー' : 'User');
                lines.push(`${role}: ${m.content}`);
            }
            let text = lines.join('\n');
            if (text.length > maxChars) text = text.slice(-maxChars);
            return text;
        } catch (e) {
            // log suppressed in production
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
        } catch (e) {
            // log suppressed in production
        }
    }

    renderMarkdown(content) {
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                if (marked && marked.setOptions) {
                    marked.setOptions({ breaks: true });
                }
            } catch (e) {
                // log suppressed in production
            }
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

    syncHeader() { }

    toggleTheme() { this.createIconsEnhanced(); }

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
            } else {
                
            }
        } catch (error) {
            
        }
    }

    parseCandidateText(data) {
        try {
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            return typeof text === 'string' && text.length ? text : null;
        } catch {
            return null;
        }
    }

    async requestText(prompt) {
        try {
            if (window.electronAPI && window.electronAPI.aiGenerate) {
                const cfg = this.defaultGenerationConfig();
                const text = await window.electronAPI.aiGenerate(prompt, { model: this.model, generationConfig: cfg });
                return typeof text === 'string' ? text : getUIText('unexpectedResponse');
            }
            return getUIText('apiUnavailable');
        } catch (error) {
            return `${getUIText('apiError')} ${error?.message || 'Unknown error'}`;
        }
    }

    async requestWithImage(prompt, imageBase64, mimeType = 'image/png') {
        try {
            if (window.electronAPI && window.electronAPI.aiGenerateWithImage) {
                const cfg = this.defaultGenerationConfig();
                const text = await window.electronAPI.aiGenerateWithImage(prompt, imageBase64, mimeType, { model: this.model, generationConfig: cfg });
                return typeof text === 'string' ? text : getUIText('unexpectedResponse');
            }
            return getUIText('apiUnavailable');
        } catch (error) {
            return `${getUIText('apiError')} ${error?.message || 'Unknown error'}`;
        }
    }

    async generateResponse(userMessage, historyText = '') {
        const prompt = this.buildTextOnlyPrompt(userMessage, historyText);
        return this.requestText(prompt);
    }

    /** テキストのみを解説する（UI言語に合わせて出力言語を切替） */
    async generateTextExplanation(text, historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        const t = text.length > 8000 ? text.slice(0, 8000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)') : text;
        let prompt;
        if (lang === 'ja') {
            prompt = `「${t}」について一言で教えてください。日本語で短く1文で、結論から端的に。`;
            if (historyText && historyText.trim()) {
                prompt = `【チャット履歴（直近）】\n${historyText}\n\n` + prompt;
            }
        } else {
            prompt = `Explain "${t}" in one short English sentence. Start with the conclusion, be clear and concise.`;
            if (historyText && historyText.trim()) {
                prompt = `Context (recent chat):\n${historyText}\n\n` + prompt;
            }
        }
        return this.requestText(prompt);
    }

    /**
     * 選択テキストの詳細説明（わかりやすく、段階的・例示を含める）
     */
    async generateDetailedExplanation(text, historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        const t = text.length > 12000 ? text.slice(0, 12000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)') : text;
        let prompt;
        if (lang === 'ja') {
            prompt = `次の内容を、丁寧に説明してください。具体例・箇条書きを適宜使い、重要点→理由→具体例→注意点の順で簡潔にまとめてください。必要なら手順も提示してください。\n\n【対象】\n${t}`;
            if (historyText && historyText.trim()) {
                prompt = `【チャット履歴（直近）】\n${historyText}\n\n` + prompt;
            }
        } else {
            prompt = `Explain the following in a way that non-experts can understand. Use concrete examples, analogies, and bullets where useful. Structure the answer as: key points → reasons → examples → caveats, and include steps if appropriate.\n\nTarget:\n${t}`;
            if (historyText && historyText.trim()) {
                prompt = `Recent chat context:\n${historyText}\n\n` + prompt;
            }
        }
        return this.requestText(prompt);
    }

    async generateImageExplanation(imageBase64, mimeType = 'image/png', historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        let prompt;
        if (lang === 'ja') {
            prompt = '次のスクリーンショットの内容を日本語で簡潔に説明してください。重要な要素や文脈があれば触れてください。';
            if (historyText && historyText.trim()) {
                prompt = `【チャット履歴（直近）】\n${historyText}\n\n` + prompt;
            }
        } else {
            prompt = 'Briefly describe what is shown in this screenshot in clear English. Mention key elements and context if apparent.';
            if (historyText && historyText.trim()) {
                prompt = `Recent chat context:\n${historyText}\n\n` + prompt;
            }
        }
        return this.requestWithImage(prompt, imageBase64, mimeType);
    }

    async generateImageDetailedExplanation(imageBase64, mimeType = 'image/png', historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        let prompt;
        if (lang === 'ja') {
            prompt = '次のスクリーンショットを、非専門家にも分かるように、重要点→理由→具体例→注意点の順で、必要に応じて箇条書きで丁寧に説明してください。文脈が推測できる場合は簡潔に触れてください。';
            if (historyText && historyText.trim()) {
                prompt = `【チャット履歴（直近）】\n${historyText}\n\n` + prompt;
            }
        } else {
            prompt = 'Explain the screenshot for non-experts with structure: key points → reasons → examples → caveats. Use bullets where helpful and note likely context if apparent.';
            if (historyText && historyText.trim()) {
                prompt = `Recent chat context:\n${historyText}\n\n` + prompt;
            }
        }
        return this.requestWithImage(prompt, imageBase64, mimeType);
    }

    async generateHistorySummary(historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        const base = (historyText || '').trim();
        if (!base) return lang === 'ja' ? '（履歴がありません）' : '(No history)';
        const prompt = (lang === 'ja')
            ? `以下は直近の会話履歴です。重要なポイントだけを日本語で3〜6行に簡潔に要約してください。箇条書き可。重複や冗長表現は避け、固有名詞・決定事項・未解決点を明確に示してください。\n\n${base}`
            : `Below is the recent conversation history. Summarize the key points in English in 3–6 short lines. Bullets are fine. Avoid redundancy and highlight proper nouns, decisions, and open items.\n\n${base}`;
        return this.requestText(prompt);
    }

    async generateContinuation(previousText = '', historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        const t = previousText.length > 12000 ? previousText.slice(0, 12000) + (lang === 'ja' ? ' …(一部省略)' : ' …(truncated)') : previousText;
        let prompt;
        if (lang === 'ja') {
            prompt = `次の文章の続きを書いてください。すでに述べた内容は繰り返さず、同じ文体・トーンで簡潔に続けてください。必要に応じて箇条書き・例・注意点を加えて構いません。\n\n【直前の出力】\n${t}`;
            if (historyText && historyText.trim()) {
                prompt = `【チャット履歴（直近）】\n${historyText}\n\n` + prompt;
            }
        } else {
            prompt = `Continue the following output. Do not repeat prior content. Keep the same style and tone. Add bullets/examples/caveats only if helpful.\n\n[Previous output]\n${t}`;
            if (historyText && historyText.trim()) {
                prompt = `Recent chat context:\n${historyText}\n\n` + prompt;
            }
        }
        return this.requestText(prompt);
    }

    defaultGenerationConfig() { return { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 2048 }; }

    buildTextOnlyPrompt(userMessage, historyText = '') {
        const lang = (typeof getCurrentUILanguage === 'function' ? getCurrentUILanguage() : 'en') || 'en';
        if (lang === 'ja') {
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
            let prompt = `You are a helpful and knowledgeable AI assistant. Answer the user's question in clear, concise English.

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
- Use natural, concise English`;
            return prompt;
        }
    }
}

// Extend class with icon gradient helpers
IrukaDarkApp.prototype.createIconsEnhanced = function() {
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
    } catch (e) {
        // log suppressed in production
    }
};

IrukaDarkApp.prototype.applyIconGradients = function() {
    try {
        const sendSvg = this.sendBtn ? this.sendBtn.querySelector('svg') : null;
        // 送信アイコンは常にcurrentColorで表示（グラデ適用しない）
        if (sendSvg) this.removeGradientFromSvg(sendSvg);

        // No other header icons to target

        // 明示的にグラデ非対象のアイコンはグラデ属性を外して白に委ねる
        // テーマトグルアイコンは存在しないため処理なし
    } catch (e) {
        // log suppressed in production
    }
};

IrukaDarkApp.prototype.applyGradientToSvg = function(svg) {
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
        targets.forEach(el => el.setAttribute('stroke', `url(#${gradId})`));

        svg.setAttribute('data-irukadark-gradient', '1');
    } catch (e) {
        // log suppressed in production
    }
};

IrukaDarkApp.prototype.removeGradientFromSvg = function(svg) {
    try {
        if (!svg) return;
        // 子要素のstrokeにurl(#...)が入っていたら外す（CSSで色指定に戻す）
        const targets = svg.querySelectorAll('path, circle, line, polyline, polygon, rect, ellipse');
        targets.forEach(el => {
            const s = el.getAttribute('stroke');
            if (s && /url\(#/.test(s)) el.removeAttribute('stroke');
        });
        svg.removeAttribute('data-irukadark-gradient');
    } catch (e) {
        // log suppressed in production
    }
};

// Auto-size helper for chat textarea
IrukaDarkApp.prototype.autosizeMessageInput = function(reset = false) {
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
    } catch (e) {
        // log suppressed in production
    }
};



// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new IrukaDarkApp();
});
