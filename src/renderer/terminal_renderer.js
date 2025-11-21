/*
  IrukaDark — (c) 2025 CORe Inc.
  License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
*/

/* global Terminal, FitAddon, WebLinksAddon, getUIText */
/* exported TerminalUI */

/**
 * TerminalUI - Manages terminal UI and xterm.js instances
 */
class TerminalUI {
  // Constants
  static IME_DEBOUNCE_MS = 100; // Time to wait after IME composition ends before allowing Enter key

  constructor() {
    this.terminals = new Map(); // terminalId -> { term, element, fitAddon, shellName }
    this.activeTerminalId = null;

    this.container = document.getElementById('terminalContent');
    this.tabsContainer = document.getElementById('terminalTabs');

    if (!this.container || !this.tabsContainer) {
      return;
    }

    // Performance optimization: Data buffering for terminal output
    this.dataBuffers = new Map(); // terminalId -> { buffer: [], timeoutId: null }
    this.BUFFER_FLUSH_INTERVAL = 16; // 16ms (~60fps)

    // Performance optimization: Debounced resize handler
    this.resizeDebounceMap = new Map(); // terminalId -> timeoutId
    this.RESIZE_DEBOUNCE_DELAY = 150; // 150ms debounce

    this.init().catch(() => {});
  }

  /**
   * Initialize terminal UI
   */
  async init() {
    // Load xterm resources on demand
    await this.ensureXterm();

    // IPC listeners
    this.setupIPCListeners();

    // Create initial terminal
    this.createTerminal();

    // Initialize AI command input
    this.initAICommandInput();

    // Refresh i18n cache to include newly added terminal elements
    this.refreshI18nCache();

    // Setup theme change listener
    this.setupThemeListener();

    // Window resize handler with optimized debouncing
    this.windowResizeTimeoutId = null;
    window.addEventListener(
      'resize',
      () => {
        if (this.windowResizeTimeoutId !== null) {
          clearTimeout(this.windowResizeTimeoutId);
        }
        this.windowResizeTimeoutId = setTimeout(() => {
          const activeTerminal = this.terminals.get(this.activeTerminalId);
          if (activeTerminal && activeTerminal.fitAddon) {
            activeTerminal.fitAddon.fit();
          }
          this.windowResizeTimeoutId = null;
        }, this.RESIZE_DEBOUNCE_DELAY);
      },
      { passive: true }
    ); // passive: true for better scroll performance
  }

  static loadScriptOnce(src) {
    if (!this.scriptPromises) this.scriptPromises = new Map();
    if (this.scriptPromises.has(src)) return this.scriptPromises.get(src);

    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(s);
    });

    this.scriptPromises.set(src, p);
    return p;
  }

  static loadStyleOnce(href) {
    if (!this.stylePromises) this.stylePromises = new Map();
    if (this.stylePromises.has(href)) return this.stylePromises.get(href);

    const p = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve(true);
      link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
      document.head.appendChild(link);
    });

    this.stylePromises.set(href, p);
    return p;
  }

  ensureXterm() {
    if (this.xtermReady) return this.xtermReady;

    this.xtermReady = (async () => {
      await TerminalUI.loadStyleOnce('./vendor/xterm/xterm.css');
      await TerminalUI.loadScriptOnce('./vendor/xterm/xterm.js');
      await TerminalUI.loadScriptOnce('./vendor/xterm/addon-fit.js');
      await TerminalUI.loadScriptOnce('./vendor/xterm/addon-web-links.js');

      if (
        typeof Terminal === 'undefined' ||
        typeof FitAddon === 'undefined' ||
        typeof WebLinksAddon === 'undefined'
      ) {
        throw new Error('xterm resources failed to load');
      }
      return true;
    })();

    return this.xtermReady;
  }

  /**
   * Setup IPC listeners for terminal communication
   */
  setupIPCListeners() {
    // Receive data from PTY with buffering for performance
    window.api.receive('terminal:data', ({ id, data }) => {
      this.bufferTerminalData(id, data);
    });

    // Handle terminal exit
    window.api.receive('terminal:exit', ({ id, exitCode }) => {
      // Flush any pending buffered data before showing exit message
      this.flushTerminalBuffer(id);

      const terminal = this.terminals.get(id);
      if (terminal) {
        const exitMessage = getUIText('terminal.processExited', exitCode);
        terminal.term.write(`\r\n\x1b[1;31m${exitMessage}\x1b[0m\r\n`);
        // Auto-close after 2 seconds
        setTimeout(() => {
          this.closeTerminal(id);
        }, 2000);
      }
    });
  }

  /**
   * Buffer terminal data for performance optimization
   * Batches multiple rapid writes into single operations
   * @param {string} id - Terminal ID
   * @param {string} data - Data to write
   */
  bufferTerminalData(id, data) {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    // Initialize buffer if needed
    if (!this.dataBuffers.has(id)) {
      this.dataBuffers.set(id, { buffer: [], timeoutId: null });
    }

    const bufferData = this.dataBuffers.get(id);
    bufferData.buffer.push(data);

    // Clear existing timeout
    if (bufferData.timeoutId !== null) {
      clearTimeout(bufferData.timeoutId);
    }

    // Schedule flush using requestAnimationFrame for optimal timing
    bufferData.timeoutId = setTimeout(() => {
      requestAnimationFrame(() => {
        this.flushTerminalBuffer(id);
      });
    }, this.BUFFER_FLUSH_INTERVAL);
  }

  /**
   * Flush buffered terminal data
   * @param {string} id - Terminal ID
   */
  flushTerminalBuffer(id) {
    const terminal = this.terminals.get(id);
    const bufferData = this.dataBuffers.get(id);

    if (!terminal || !bufferData || bufferData.buffer.length === 0) return;

    // Write all buffered data at once
    const combinedData = bufferData.buffer.join('');
    terminal.term.write(combinedData);

    // Clear buffer
    bufferData.buffer = [];
    bufferData.timeoutId = null;
  }

  /**
   * Refresh i18n elements cache to include newly added terminal elements
   */
  refreshI18nCache() {
    try {
      // Access the main app's i18n cache and refresh it
      if (
        typeof window !== 'undefined' &&
        window.app &&
        window.app.i18nElementsCache !== undefined
      ) {
        // Clear the cache to force rebuild on next update
        window.app.i18nElementsCache = null;
        // Trigger immediate update to refresh with current language
        if (typeof window.app.updateStaticHTMLText === 'function') {
          window.app.updateStaticHTMLText();
        }
      }
    } catch (error) {}
  }

  /**
   * Get terminal theme based on current appearance mode
   * @param {boolean} isDark - Whether dark mode is active
   * @returns {Object} Terminal theme configuration
   */
  getTerminalTheme(isDark) {
    return isDark
      ? {
          background: '#0a0a1a',
          foreground: '#e5e7eb',
          cursor: '#ff4d6d',
          cursorAccent: '#0a0a1a',
          selection: 'rgba(255, 77, 109, 0.3)',
          black: '#000000',
          red: '#ff4d6d',
          green: '#10b981',
          yellow: '#fbbf24',
          blue: '#3b82f6',
          magenta: '#d946ef',
          cyan: '#06b6d4',
          white: '#e5e7eb',
          brightBlack: '#6b7280',
          brightRed: '#ff6b82',
          brightGreen: '#34d399',
          brightYellow: '#fcd34d',
          brightBlue: '#60a5fa',
          brightMagenta: '#e879f9',
          brightCyan: '#22d3ee',
          brightWhite: '#f9fafb',
        }
      : {
          background: '#ffffff',
          foreground: '#111827',
          cursor: '#ff4d6d',
          cursorAccent: '#ffffff',
          selection: 'rgba(255, 77, 109, 0.3)',
          black: '#000000',
          red: '#dc2626',
          green: '#059669',
          yellow: '#d97706',
          blue: '#2563eb',
          magenta: '#c026d3',
          cyan: '#0891b2',
          white: '#6b7280',
          brightBlack: '#374151',
          brightRed: '#ef4444',
          brightGreen: '#10b981',
          brightYellow: '#f59e0b',
          brightBlue: '#3b82f6',
          brightMagenta: '#d946ef',
          brightCyan: '#06b6d4',
          brightWhite: '#f9fafb',
        };
  }

  /**
   * Update theme for all active terminals
   */
  updateAllTerminalsTheme() {
    const isDark = document.documentElement.classList.contains('theme-dark');
    const theme = this.getTerminalTheme(isDark);

    this.terminals.forEach(({ term }) => {
      if (term) {
        // Update terminal theme using xterm.js options API
        term.options.theme = theme;
      }
    });
  }

  /**
   * Setup theme change listener to update terminals in real-time
   */
  setupThemeListener() {
    try {
      // Listen for theme changes from the main process
      if (window.electronAPI && window.electronAPI.onThemeChanged) {
        window.electronAPI.onThemeChanged((theme) => {
          // Update all terminals with new theme
          this.updateAllTerminalsTheme();
        });
      } else {
      }
    } catch (error) {}
  }

  /**
   * Create a new terminal session
   */
  async createTerminal() {
    const id = `term-${Date.now()}`;

    // Get theme
    const isDark = document.documentElement.classList.contains('theme-dark');

    // Create xterm.js instance with performance optimizations
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 10,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontWeight: 400,
      fontWeightBold: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      scrollback: 1000,
      tabStopWidth: 4,
      theme: this.getTerminalTheme(isDark),
      // Performance optimizations
      allowProposedApi: false,
      allowTransparency: false,
      fastScrollModifier: 'shift',
      fastScrollSensitivity: 5,
      scrollSensitivity: 1,
      windowsMode: false,
    });

    // Add FitAddon for automatic sizing
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    // Add WebLinksAddon for clickable links
    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    term.loadAddon(webLinksAddon);

    // Create DOM element
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-instance';
    terminalElement.id = id;
    terminalElement.style.display = 'none';
    this.container.appendChild(terminalElement);

    // Open terminal in DOM
    term.open(terminalElement);
    fitAddon.fit();

    // Request PTY creation from main process
    const { cols, rows } = term;
    const result = await window.api.invoke('terminal:create', {
      id,
      cols,
      rows,
      cwd: null, // Use default home directory
    });

    if (!result.success) {
      this.showError(term, getUIText('terminal.failedToCreate') + ' ' + result.error);
      return;
    }

    // Get shell name from result
    const shellName = result.shell ? result.shell.split('/').pop() : 'shell';

    // Create tab with shell name
    this.createTab(id, shellName);

    // Setup input handler
    term.onData((data) => {
      window.api.send('terminal:input', { id, data });
    });

    // Setup resize handler
    term.onResize(({ cols, rows }) => {
      window.api.send('terminal:resize', { id, cols, rows });
    });

    // Store terminal with shell name
    this.terminals.set(id, { term, element: terminalElement, fitAddon, shellName });

    // Activate terminal
    this.switchTerminal(id);
  }

  /**
   * Create tab for terminal
   * @param {string} id - Terminal ID
   * @param {string} shellName - Shell name (e.g., 'zsh', 'bash')
   */
  createTab(id, shellName) {
    const tab = document.createElement('div');
    tab.className = 'terminal-tab';
    tab.dataset.terminalId = id;
    tab.innerHTML = `
      <span class="terminal-tab-name">${shellName}</span>
      <button class="terminal-tab-menu-btn" data-i18n-title="terminal.menuButton">⋯</button>
    `;

    // Click to switch
    tab.querySelector('.terminal-tab-name').addEventListener('click', () => {
      this.switchTerminal(id);
    });

    // Menu button
    const menuBtn = tab.querySelector('.terminal-tab-menu-btn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTabMenu(id, menuBtn);
    });

    this.tabsContainer.appendChild(tab);

    // Refresh i18n cache to include the new tab's menu button
    this.refreshI18nCache();

    // Switch to new tab
    this.switchTerminal(id);
  }

  /**
   * Show tab menu
   * @param {string} id - Terminal ID
   * @param {HTMLElement} btnElement - Menu button element
   */
  showTabMenu(id, btnElement) {
    // Remove any existing menu
    const existingMenu = document.querySelector('.terminal-tab-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'terminal-tab-menu';
    menu.innerHTML = `
      <div class="terminal-tab-menu-item" data-action="new">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>${getUIText('terminal.newTab')}</span>
      </div>
      <div class="terminal-tab-menu-item" data-action="restart">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        <span>${getUIText('terminal.restart')}</span>
      </div>
      <div class="terminal-tab-menu-item terminal-tab-menu-item-danger" data-action="close">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span>${getUIText('terminal.close')}</span>
      </div>
    `;

    // Position menu below button
    const rect = btnElement.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;

    // Add menu items click handlers
    menu.querySelectorAll('.terminal-tab-menu-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = item.dataset.action;

        menu.remove();

        if (action === 'new') {
          await this.createTerminal();
        } else if (action === 'restart') {
          await this.restartTerminal(id);
        } else if (action === 'close') {
          await this.closeTerminal(id);
        }
      });
    });

    // Close menu when clicking outside
    // Use AbortController for cleaner event listener cleanup
    const abortController = new AbortController();
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== btnElement) {
        menu.remove();
        abortController.abort(); // Automatically removes all listeners
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu, {
        signal: abortController.signal,
        passive: true,
      });
    }, 0);

    document.body.appendChild(menu);
  }

  /**
   * Restart terminal
   * @param {string} id - Terminal ID
   */
  async restartTerminal(id) {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    // Kill current PTY
    await window.api.invoke('terminal:kill', { id });

    // Clear terminal
    terminal.term.clear();

    // Request new PTY with same ID
    const { cols, rows } = terminal.term;
    const result = await window.api.invoke('terminal:create', {
      id,
      cols,
      rows,
      cwd: null,
    });

    if (!result.success) {
      this.showError(terminal.term, getUIText('terminal.failedToRestart') + ' ' + result.error);
    } else {
      terminal.term.focus();
    }
  }

  /**
   * Switch active terminal
   * @param {string} id - Terminal ID
   */
  switchTerminal(id) {
    // Hide all terminals and update tabs in one pass
    this.terminals.forEach(({ element }, termId) => {
      element.style.display = 'none';
      const tab = this.tabsContainer.querySelector(`[data-terminal-id="${termId}"]`);
      if (tab) {
        tab.classList.remove('active');
      }
    });

    // Show active terminal
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.element.style.display = 'block';
      terminal.term.focus();

      // Debounced resize for smooth switching
      this.debouncedTerminalFit(id);

      const tab = this.tabsContainer.querySelector(`[data-terminal-id="${id}"]`);
      if (tab) {
        tab.classList.add('active');
      }

      this.activeTerminalId = id;
    }
  }

  /**
   * Debounced fit operation for a terminal
   * @param {string} id - Terminal ID
   */
  debouncedTerminalFit(id) {
    // Clear existing timeout for this terminal
    const existingTimeout = this.resizeDebounceMap.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new fit operation
    const timeoutId = setTimeout(() => {
      const terminal = this.terminals.get(id);
      if (terminal && terminal.fitAddon) {
        requestAnimationFrame(() => {
          terminal.fitAddon.fit();
        });
      }
      this.resizeDebounceMap.delete(id);
    }, 50);

    this.resizeDebounceMap.set(id, timeoutId);
  }

  /**
   * Close terminal
   * @param {string} id - Terminal ID
   */
  async closeTerminal(id) {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    // Performance optimization: Clean up buffers and debounce timers
    this.cleanupTerminalResources(id);

    // Kill PTY
    await window.api.invoke('terminal:kill', { id });

    // Dispose xterm.js instance
    terminal.term.dispose();
    terminal.element.remove();

    // Remove tab
    const tab = this.tabsContainer.querySelector(`[data-terminal-id="${id}"]`);
    if (tab) {
      tab.remove();
    }

    // Remove from map
    this.terminals.delete(id);

    // Switch to another terminal or create new one
    if (this.activeTerminalId === id) {
      if (this.terminals.size > 0) {
        const firstId = this.terminals.keys().next().value;
        this.switchTerminal(firstId);
      } else {
        // Create new terminal if all closed
        this.createTerminal();
      }
    }
  }

  /**
   * Clean up terminal-specific resources to prevent memory leaks
   * @param {string} id - Terminal ID
   */
  cleanupTerminalResources(id) {
    // Clear and remove data buffer
    const bufferData = this.dataBuffers.get(id);
    if (bufferData) {
      if (bufferData.timeoutId !== null) {
        clearTimeout(bufferData.timeoutId);
      }
      this.dataBuffers.delete(id);
    }

    // Clear resize debounce timer
    const resizeTimeout = this.resizeDebounceMap.get(id);
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
      this.resizeDebounceMap.delete(id);
    }
  }

  /**
   * Show error message in terminal
   * @param {Terminal} term - xterm.js instance
   * @param {string} message - Error message
   */
  showError(term, message) {
    term.write(`\r\n\x1b[1;31m[Error] ${message}\x1b[0m\r\n`);
  }

  /**
   * Get terminal context (last N lines of output)
   * @param {string} terminalId - Terminal ID
   * @param {number} lineCount - Number of lines to retrieve (default: 300)
   * @returns {string} Terminal output
   */
  getTerminalContext(terminalId, lineCount = 300) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal || !terminal.term) {
      return '';
    }

    try {
      const buffer = terminal.term.buffer.active;
      const totalLines = buffer.length;
      const startLine = Math.max(0, totalLines - lineCount);
      const lines = [];

      for (let i = startLine; i < totalLines; i++) {
        const line = buffer.getLine(i);
        if (line) {
          const text = line.translateToString(true); // true = trim whitespace
          lines.push(text);
        }
      }

      return lines.join('\n').trim();
    } catch (err) {
      return '';
    }
  }

  /**
   * Check if an Enter key press should be blocked due to IME composition
   * @param {KeyboardEvent} event - The keyboard event
   * @param {Object} imeState - IME state object with isComposing and compositionEndTime
   * @returns {boolean} True if the Enter key should be blocked
   */
  isIMEComposing(event, imeState) {
    // Check multiple indicators for IME composition
    if (event.isComposing || imeState.isComposing || event.keyCode === 229) {
      return true;
    }

    // Block Enter key shortly after composition ends to prevent accidental submission
    if (
      imeState.compositionEndTime &&
      Date.now() - imeState.compositionEndTime < TerminalUI.IME_DEBOUNCE_MS
    ) {
      return true;
    }

    return false;
  }

  /**
   * Setup IME event listeners for an input element
   * @param {HTMLElement} inputElement - The input or textarea element
   * @param {Object} imeState - IME state object with isComposing and compositionEndTime
   */
  setupIMEHandlers(inputElement, imeState) {
    inputElement.addEventListener('compositionstart', () => {
      imeState.isComposing = true;
    });

    inputElement.addEventListener('compositionend', () => {
      // Delay resetting isComposing to handle timing issues between
      // compositionend and keydown events in some browsers
      imeState.compositionEndTime = Date.now();
      setTimeout(() => {
        imeState.isComposing = false;
      }, TerminalUI.IME_DEBOUNCE_MS);
    });
  }

  /**
   * Initialize AI command input in terminal footer
   * Features:
   * - Natural language to terminal command conversion using Gemini
   * - Auto-resizing textarea (Enter to submit, Shift+Enter for newline)
   * - Terminal context awareness (last 300 lines)
   * - Command preview with execute/cancel options
   * - Dangerous command detection and warning
   */
  initAICommandInput() {
    const terminalFooter = document.getElementById('terminalFooter');
    if (!terminalFooter) {
      return;
    }

    // ========================================
    // Create UI elements
    // ========================================

    // Input wrapper with status message, preview popup, and textarea
    const aiFooter = document.createElement('div');
    aiFooter.className = 'terminal-ai-footer';
    aiFooter.innerHTML = `
      <div id="terminalAiStatus" class="terminal-ai-status" style="display: none;">
        <div class="terminal-ai-status-content">
          <div class="terminal-ai-status-spinner"></div>
          <span id="terminalAiStatusText"></span>
        </div>
      </div>
      <div class="terminal-ai-input-wrapper">
        <div id="terminalAiPreview" class="terminal-ai-preview" style="display: none;">
          <div id="terminalAiWarning" class="terminal-ai-warning" style="display: none;" data-i18n="terminal.aiDangerousWarning">
            ${getUIText('terminal.aiDangerousWarning')}
          </div>
          <code id="terminalAiPreviewCommand"></code>
          <div class="terminal-ai-preview-buttons">
            <button id="terminalAiExecute" class="terminal-ai-preview-button" data-i18n="terminal.aiExecute">${getUIText('terminal.aiExecute')}</button>
            <button id="terminalAiCancel" class="terminal-ai-preview-button" data-i18n="terminal.aiCancel">${getUIText('terminal.aiCancel')}</button>
          </div>
        </div>
        <textarea
          id="terminalAiInput"
          class="terminal-ai-input"
          data-i18n-placeholder="terminal.aiCommandPlaceholder"
          placeholder="${getUIText('terminal.aiCommandPlaceholder')}"
          rows="1"
        ></textarea>
        <button id="terminalAiGenerate" class="terminal-ai-button" data-i18n-title="terminal.aiGenerated" title="${getUIText('terminal.aiGenerated')}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12 7-7 7 7"/>
            <path d="M12 19V5"/>
          </svg>
        </button>
      </div>
    `;
    terminalFooter.appendChild(aiFooter);

    // ========================================
    // Get element references
    // ========================================
    const input = document.getElementById('terminalAiInput');
    const generateBtn = document.getElementById('terminalAiGenerate');
    const preview = document.getElementById('terminalAiPreview');
    const previewCommand = document.getElementById('terminalAiPreviewCommand');
    const executeBtn = document.getElementById('terminalAiExecute');
    const cancelBtn = document.getElementById('terminalAiCancel');
    const warningDiv = document.getElementById('terminalAiWarning');
    const statusDiv = document.getElementById('terminalAiStatus');
    const statusText = document.getElementById('terminalAiStatusText');

    let generatedCommand = '';
    let isGenerating = false;
    let cancelRequested = false; // Flag to cancel ongoing generation

    // IME (Input Method Editor) state management for CJK languages
    const imeState = {
      isComposing: false,
      compositionEndTime: 0,
    };

    // ========================================
    // Helper functions
    // ========================================

    /**
     * Show status message above input
     * @param {string} message - Status message to display
     * @param {string} type - Type of message: 'loading', 'success', 'error', 'info'
     */
    const showStatus = (message, type = 'loading') => {
      if (!statusDiv || !statusText) return;

      statusText.textContent = message;
      statusDiv.className = 'terminal-ai-status';
      statusDiv.classList.add(`terminal-ai-status-${type}`);
      statusDiv.style.display = 'flex';

      // Add fade-in animation
      requestAnimationFrame(() => {
        statusDiv.classList.add('terminal-ai-status-visible');
      });
    };

    /**
     * Hide status message
     */
    const hideStatus = () => {
      if (!statusDiv) return;

      statusDiv.classList.remove('terminal-ai-status-visible');
      // Wait for fade-out animation before hiding
      setTimeout(() => {
        statusDiv.style.display = 'none';
        statusDiv.className = 'terminal-ai-status';
      }, 300);
    };

    /**
     * Update generate button icon based on generation state
     */
    const updateButtonIcon = () => {
      if (isGenerating) {
        // Stop icon (square)
        generateBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12"></rect>
          </svg>
        `;
        generateBtn.title = getUIText('terminal.aiStop') || 'Stop';
      } else {
        // Generate icon (arrow up)
        generateBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12 7-7 7 7"/>
            <path d="M12 19V5"/>
          </svg>
        `;
        generateBtn.title = getUIText('terminal.aiGenerated');
      }
    };

    /**
     * Cancel ongoing generation
     *
     * Note: We cannot actually abort the IPC call to the main process,
     * but we can set a flag to ignore the result when it arrives.
     * This ensures the UI responds immediately to the cancellation.
     */
    const cancelGeneration = () => {
      cancelRequested = true; // Flag to ignore result
      isGenerating = false;
      updateButtonIcon();

      // Clear any displayed preview
      preview.style.display = 'none';
      warningDiv.style.display = 'none';
      generatedCommand = '';

      // Show cancellation status
      showStatus(getUIText('terminal.aiCancelled') || 'Cancelled', 'info');
      setTimeout(() => hideStatus(), 2000);
    };

    // ========================================
    // Event handlers
    // ========================================

    // Generate command from natural language
    const handleGenerate = async () => {
      const naturalLanguage = input.value.trim();
      if (!naturalLanguage || isGenerating) return;

      try {
        isGenerating = true;
        cancelRequested = false; // Reset cancel flag
        updateButtonIcon();

        // Show loading status
        showStatus(getUIText('terminal.aiGenerating') || 'Analyzing command...', 'loading');

        const terminal = this.terminals.get(this.activeTerminalId);

        // Get terminal context (last 300 lines)
        const terminalContext = this.getTerminalContext(this.activeTerminalId, 300);

        const result = await window.electronAPI.generateTerminalCommand(naturalLanguage, {
          shell: terminal?.shellName || 'bash',
          os: navigator.platform,
          context: terminalContext,
        });

        // Check if user cancelled while waiting for result
        if (cancelRequested) {
          return; // Ignore result, user already cancelled
        }

        if (result.error) {
          hideStatus();
          alert(`${getUIText('terminal.aiError')} ${result.error}`);
          return;
        }

        // Hide loading status
        hideStatus();

        generatedCommand = result.command;
        previewCommand.textContent = generatedCommand;
        preview.style.display = 'flex';

        // Show warning if dangerous
        if (result.warning === 'dangerous') {
          warningDiv.style.display = 'block';
        } else {
          warningDiv.style.display = 'none';
        }
      } catch (err) {
        // Check if user cancelled or error message indicates cancellation
        if (cancelRequested || /CANCELLED|Abort/i.test(String(err?.message || ''))) {
          return; // Silent return on cancellation
        }
        hideStatus();
        showStatus(getUIText('terminal.aiError') || 'Error', 'error');
        setTimeout(() => hideStatus(), 3000);
        alert(`${getUIText('terminal.aiError')} ${err.message}`);
      } finally {
        // Reset state only if not already cancelled (cancel button already reset it)
        if (!cancelRequested) {
          isGenerating = false;
          updateButtonIcon();
        }
      }
    };

    // Execute generated command
    const handleExecute = () => {
      if (!generatedCommand || !this.activeTerminalId) return;

      // Send command to terminal
      window.api.send('terminal:input', {
        id: this.activeTerminalId,
        data: generatedCommand + '\r',
      });

      // Reset UI
      input.value = '';
      input.style.height = 'auto';
      preview.style.display = 'none';
      warningDiv.style.display = 'none';
      generatedCommand = '';

      // Focus terminal
      const terminal = this.terminals.get(this.activeTerminalId);
      if (terminal) {
        terminal.term.focus();
      }
    };

    // Cancel preview
    const handleCancel = () => {
      preview.style.display = 'none';
      warningDiv.style.display = 'none';
      generatedCommand = '';
      input.focus();
    };

    // Auto-resize textarea based on content (with debouncing for better performance)
    let autoResizeTimeoutId = null;
    const autoResize = () => {
      if (autoResizeTimeoutId !== null) {
        clearTimeout(autoResizeTimeoutId);
      }
      autoResizeTimeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 120) + 'px';
          autoResizeTimeoutId = null;
        });
      }, 10);
    };

    // ========================================
    // Attach event listeners
    // ========================================

    // Generate button: Dual function - generate command or stop generation
    // - When AI is generating (isGenerating=true): Acts as stop button
    // - When idle (isGenerating=false): Acts as generate button
    generateBtn.addEventListener('click', () => {
      if (isGenerating) {
        cancelGeneration();
      } else {
        handleGenerate();
      }
    });

    // Setup IME handling for terminal AI input
    this.setupIMEHandlers(input, imeState);

    // Enter key handling: Dual function - generate or stop
    // - Enter: Generate command / Stop generation
    // - Shift+Enter: New line
    // - During IME composition: Do nothing
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (this.isIMEComposing(e, imeState)) return;
        e.preventDefault();
        if (isGenerating) {
          cancelGeneration();
        } else {
          handleGenerate();
        }
      }
    });

    // Auto-resize textarea on input
    input.addEventListener('input', autoResize);

    // Preview action buttons
    executeBtn.addEventListener('click', handleExecute);
    cancelBtn.addEventListener('click', handleCancel);
  }

  /**
   * Cleanup all terminals and resources
   */
  cleanup() {
    // Close all terminals (which also cleans up their buffers)
    this.terminals.forEach((_, id) => {
      this.closeTerminal(id);
    });

    // Clear window resize timeout
    if (this.windowResizeTimeoutId !== null) {
      clearTimeout(this.windowResizeTimeoutId);
      this.windowResizeTimeoutId = null;
    }

    // Clear all remaining buffers and timeouts
    this.dataBuffers.clear();
    this.resizeDebounceMap.clear();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized when terminal tab is opened
  });
}
