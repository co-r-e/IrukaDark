/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */

// Color code detection patterns
const COLOR_PATTERNS = {
  // HEX: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
  HEX: /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/,
  // RGB/RGBA: rgb(r, g, b) or rgba(r, g, b, a)
  RGB: /^rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+))?\s*\)$/i,
  // HSL/HSLA: hsl(h, s%, l%) or hsla(h, s%, l%, a)
  HSL: /^hsla?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(?:,\s*([0-9.]+))?\s*\)$/i,
};

/**
 * Detects if text is a color code and returns the color value
 * @param {string} text - Text to check
 * @returns {string|null} CSS color value if detected, null otherwise
 */
function detectColorCode(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // Check HEX
  if (COLOR_PATTERNS.HEX.test(trimmed)) {
    return trimmed;
  }

  // Check RGB/RGBA
  if (COLOR_PATTERNS.RGB.test(trimmed)) {
    return trimmed;
  }

  // Check HSL/HSLA
  if (COLOR_PATTERNS.HSL.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Creates a color swatch element
 * @param {string} color - CSS color value
 * @returns {HTMLElement} Color swatch div element
 */
function createColorSwatch(color) {
  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';
  swatch.style.backgroundColor = color;
  return swatch;
}

// SVG Icon Constants
const ICONS = {
  COPY: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  CHECK:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  FOLDER:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
  FOLDER_OPEN:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="url(#pinkGradient)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="pinkGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ff4d6d;stop-opacity:1" /><stop offset="100%" style="stop-color:#d946ef;stop-opacity:1" /></linearGradient></defs><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  PLUS: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  EDIT: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  TRASH:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  IMAGE:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
};

class ClipboardHistoryUI {
  constructor() {
    this.clipboardList = document.getElementById('clipboardList');
    this.snippetList = document.getElementById('snippetList');
    this.closeBtn = document.getElementById('closeBtn');
    this.historyTab = document.getElementById('historyTab');
    this.snippetTab = document.getElementById('snippetTab');
    this.contextMenu = document.getElementById('contextMenu');
    this.currentTab = 'history';
    this.snippetFolders = [];
    this.snippets = [];
    this.nextFolderId = 1;
    this.nextSnippetId = 1;
    this.currentMenuFolderId = null; // Track which folder's menu is open
    this.currentMenuSnippetId = null; // Track which snippet's menu is open

    // Search-related elements
    this.searchResultsMenu = document.getElementById('searchResultsMenu');
    this.historySearchInput = document.getElementById('historySearchInput');
    this.snippetSearchInput = document.getElementById('snippetSearchInput');
    this.historyClearSearch = document.getElementById('historyClearSearch');
    this.snippetClearSearch = document.getElementById('snippetClearSearch');
    this.historyFooter = document.getElementById('historyFooter');
    this.snippetFooter = document.getElementById('snippetFooter');

    // Search state (separate for each tab)
    this.historySearchQuery = '';
    this.snippetSearchQuery = '';
    this.historySearchResults = [];
    this.snippetSearchResults = [];
    this.clipboardHistory = []; // Store history data for search

    // Drag & Drop state (custom mouse-based implementation)
    this.drag = {
      element: null, // The DOM element being dragged
      type: null, // 'folder' or 'snippet'
      id: null, // ID of the dragged item
      startX: 0, // Mouse X position when drag started
      startY: 0, // Mouse Y position when drag started
      isActive: false, // Whether drag is currently happening
      threshold: 5, // Minimum pixels to move before starting drag
      target: null, // Current drop target element
      dropType: null, // 'insert-before', 'insert-after', or 'nest-inside'
    };

    // Insertion line element for visual feedback
    this.currentInsertionLine = null;

    // Performance optimization: track rendered items and cache DOM elements
    this.renderedHistoryIds = new Set();
    this.historyItemCache = new Map();

    // Debounce timers
    this.searchDebounceTimer = null;

    // Virtual scrolling configuration
    this.virtualScrollEnabled = true;
    this.virtualScrollThreshold = 20; // Enable virtual scroll for >20 items
    this.renderBatchSize = 10; // Render items in batches

    // i18n
    this.currentLang = 'en';
    this.i18n = null;

    this.initI18n();
    this.bindEvents();
    this.applyTheme();
    this.loadHistory();
    this.loadSnippets();
    this.setupVirtualScroll();
  }

  setupVirtualScroll() {
    if (!this.virtualScrollEnabled || !('IntersectionObserver' in window)) {
      return;
    }

    // Observer for items entering/leaving viewport
    this.itemVisibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const item = entry.target;
          if (entry.isIntersecting) {
            // Item is visible - ensure it's fully rendered
            item.classList.add('visible');
          } else {
            // Item is not visible - can optimize
            item.classList.remove('visible');
          }
        });
      },
      {
        root: null, // viewport
        rootMargin: '100px', // Start rendering 100px before visible
        threshold: 0.01,
      }
    );
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

      // Apply translations to static elements
      this.applyTranslations();
    } catch (err) {
      this.i18n = window.IRUKADARK_I18N['en'] || {};
    }
  }

  applyTranslations() {
    if (!this.i18n || !this.i18n.clipboard) return;

    const t = this.i18n.clipboard;

    // Update data-i18n elements (tab labels, empty state messages)
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (key.startsWith('clipboard.')) {
        const subKey = key.replace('clipboard.', '');
        if (t[subKey]) {
          el.textContent = t[subKey];
        }
      }
    });

    // Update data-i18n-placeholder elements (search inputs)
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (key.startsWith('clipboard.')) {
        const subKey = key.replace('clipboard.', '');
        if (t[subKey] && el.placeholder !== undefined) {
          el.placeholder = t[subKey];
        }
      }
    });
  }

  t(key) {
    if (!this.i18n || !this.i18n.clipboard) {
      return key;
    }
    return this.i18n.clipboard[key] || key;
  }

  bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        window.close();
      });
    }

    // Tab switching
    if (this.historyTab) {
      this.historyTab.addEventListener('click', () => {
        this.switchTab('history');
      });
    }

    if (this.snippetTab) {
      this.snippetTab.addEventListener('click', () => {
        this.switchTab('snippet');
      });
    }

    // Context menu (right-click)
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.hideContextMenu();
    });

    // Hide context menu when clicking anywhere
    window.addEventListener('click', () => {
      this.hideContextMenu();
    });

    // Listen for theme changes
    if (window.electronAPI && window.electronAPI.onThemeChanged) {
      window.electronAPI.onThemeChanged((theme) => {
        this.applyTheme(theme);
      });
    }

    // Listen for real-time clipboard history updates
    if (window.electronAPI && window.electronAPI.onClipboardHistoryUpdated) {
      window.electronAPI.onClipboardHistoryUpdated((history) => {
        this.renderHistory(history);
      });
    }

    // Event delegation for clipboard history list
    if (this.clipboardList) {
      this.clipboardList.addEventListener('click', (e) => {
        this.handleHistoryClick(e);
      });
    }

    // Event delegation for snippet list
    if (this.snippetList) {
      this.snippetList.addEventListener('click', (e) => {
        this.handleSnippetClick(e);
      });
      this.snippetList.addEventListener('dblclick', (e) => {
        this.handleSnippetDblClick(e);
      });
      // Custom Drag & Drop for reordering folders and snippets (window-constrained)
      this.snippetList.addEventListener('mousedown', (e) => {
        this.handleMouseDown(e);
      });
    }

    // Global mouse event listeners for drag & drop
    window.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e);
    });

    window.addEventListener('mouseup', (e) => {
      this.handleMouseUp(e);
    });

    // Search input events for history tab with DEBOUNCE
    if (this.historySearchInput) {
      this.historySearchInput.addEventListener('input', (e) => {
        this.historySearchQuery = e.target.value;
        this.debouncedHistorySearch();
        this.updateClearButtonVisibility('history');
      });

      this.historySearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.clearSearch('history');
        }
      });
    }

    // Clear button for history search
    if (this.historyClearSearch) {
      this.historyClearSearch.addEventListener('click', () => {
        this.clearSearch('history');
      });
    }

    // Search input events for snippet tab with DEBOUNCE
    if (this.snippetSearchInput) {
      this.snippetSearchInput.addEventListener('input', (e) => {
        this.snippetSearchQuery = e.target.value;
        this.debouncedSnippetSearch();
        this.updateClearButtonVisibility('snippet');
      });

      this.snippetSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.clearSearch('snippet');
        }
      });
    }

    // Clear button for snippet search
    if (this.snippetClearSearch) {
      this.snippetClearSearch.addEventListener('click', () => {
        this.clearSearch('snippet');
      });
    }
  }

  debouncedHistorySearch() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.performHistorySearch();
    }, 300);
  }

  debouncedSnippetSearch() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.performSnippetSearch();
    }, 300);
  }

  handleHistoryClick(e) {
    const wrapper = e.target.closest('.clipboard-item-wrapper');
    if (!wrapper) return;

    const itemId = wrapper.dataset.id;
    const item = this.clipboardHistory.find((i) => i.id === itemId);
    if (!item) return;

    // Check if copy button was clicked
    const copyBtn = e.target.closest('.clipboard-item-btn');
    if (copyBtn || wrapper.contains(e.target)) {
      this.copyItemWithFeedback(item, wrapper);
    }
  }

  handleSnippetClick(e) {
    // Handle folder more button
    const folderMoreBtn = e.target.closest('.snippet-folder-more');
    if (folderMoreBtn) {
      const folderEl = folderMoreBtn.closest('.snippet-folder');
      if (folderEl) {
        e.stopPropagation();
        this.toggleFolderMenu(folderEl.dataset.id);
        return;
      }
    }

    // Handle snippet more button
    const snippetMoreBtn = e.target.closest('.snippet-item-more');
    if (snippetMoreBtn) {
      const snippetEl = snippetMoreBtn.closest('.snippet-item');
      if (snippetEl) {
        e.stopPropagation();
        this.toggleSnippetMenu(snippetEl.dataset.id);
        return;
      }
    }

    // Handle folder click (toggle expand)
    const folderEl = e.target.closest('.snippet-folder');
    if (folderEl && !folderEl.querySelector('.snippet-folder-name-input')) {
      const clickedInput = e.target.closest('.snippet-folder-name-input');
      if (!clickedInput) {
        this.toggleFolder(folderEl.dataset.id);
        return;
      }
    }

    // Handle snippet click (copy)
    const snippetEl = e.target.closest('.snippet-item');
    if (snippetEl && !snippetEl.classList.contains('editing')) {
      const snippetId = snippetEl.dataset.id;
      const snippet = this.snippets.find((s) => s.id === snippetId);
      if (snippet) {
        const iconDiv = snippetEl.querySelector('.snippet-item-icon');
        const moreBtn = snippetEl.querySelector('.snippet-item-more');
        this.copySnippet(snippet, iconDiv, moreBtn, snippetEl);
      }
    }

    // Handle add folder button
    const addFolderBtn = e.target.closest('.add-folder-btn');
    if (addFolderBtn) {
      e.stopPropagation();
      this.addNewFolder();
    }
  }

  handleSnippetDblClick(e) {
    // Handle folder name double-click (edit)
    const folderName = e.target.closest('.snippet-folder-name');
    if (folderName) {
      const folderEl = folderName.closest('.snippet-folder');
      if (folderEl) {
        e.stopPropagation();
        this.startEditingFolder(folderEl.dataset.id);
        return;
      }
    }

    // Handle snippet double-click (edit)
    const snippetEl = e.target.closest('.snippet-item');
    if (snippetEl && !snippetEl.classList.contains('editing')) {
      e.stopPropagation();
      this.startEditingSnippet(snippetEl.dataset.id);
    }
  }

  // Helper method for copy with feedback
  async copyItemWithFeedback(item, wrapperEl) {
    const copyBtn = wrapperEl.querySelector('.clipboard-item-btn');
    if (await this.copyItem(item)) {
      copyBtn.innerHTML = ICONS.CHECK;
      wrapperEl.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      setTimeout(() => {
        copyBtn.innerHTML = ICONS.COPY;
        wrapperEl.style.backgroundColor = '';
      }, 500);
    }
  }

  async applyTheme(theme) {
    try {
      if (!theme && window.electronAPI?.getTheme) {
        theme = await window.electronAPI.getTheme();
      }

      const html = document.documentElement;
      html.classList.toggle('theme-dark', theme === 'dark');
    } catch (err) {}
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab buttons and content
    if (tabName === 'history') {
      this.historyTab.classList.add('active');
      this.snippetTab.classList.remove('active');
      this.clipboardList.style.display = 'block';
      this.snippetList.style.display = 'none';
      this.historyFooter.style.display = 'flex';
      this.snippetFooter.style.display = 'none';
      // Hide search results menu when switching tabs
      this.hideSearchResults();
    } else if (tabName === 'snippet') {
      this.historyTab.classList.remove('active');
      this.snippetTab.classList.add('active');
      this.clipboardList.style.display = 'none';
      this.snippetList.style.display = 'block';
      this.historyFooter.style.display = 'none';
      this.snippetFooter.style.display = 'flex';
      // Render snippets when switching to snippet tab
      this.renderSnippets();
      // Hide search results menu when switching tabs
      this.hideSearchResults();
    }
  }

  async loadHistory() {
    try {
      if (!window.electronAPI || !window.electronAPI.getClipboardHistory) {
        this.renderEmpty();
        return;
      }

      const history = await window.electronAPI.getClipboardHistory();
      this.renderHistory(history || []);
    } catch (err) {
      this.renderEmpty();
    }
  }

  async loadSnippets() {
    try {
      if (!window.electronAPI || !window.electronAPI.getSnippetData) {
        return;
      }

      const data = await window.electronAPI.getSnippetData();
      if (data) {
        this.snippetFolders = data.folders || [];
        this.snippets = data.snippets || [];
        this.nextFolderId = data.nextFolderId || 1;
        this.nextSnippetId = data.nextSnippetId || 1;

        // Clear editing state on load
        this.snippetFolders.forEach((f) => (f.editing = false));
        this.snippets.forEach((s) => (s.editing = false));

        // Remove any root-level snippets (snippets without folderId)
        // Snippets must always be inside a folder
        const rootSnippets = this.snippets.filter((s) => !s.folderId);
        if (rootSnippets.length > 0) {
          this.snippets = this.snippets.filter((s) => s.folderId);
          // Save the cleaned data
          await this.saveSnippets();
        }
      }
    } catch (err) {}
  }

  async saveSnippets() {
    try {
      if (!window.electronAPI || !window.electronAPI.saveSnippetData) {
        return;
      }

      const data = {
        folders: this.snippetFolders,
        snippets: this.snippets,
        nextFolderId: this.nextFolderId,
        nextSnippetId: this.nextSnippetId,
      };

      await window.electronAPI.saveSnippetData(data);
    } catch (err) {}
  }

  renderHistory(items) {
    if (!this.clipboardList) return;

    this.clipboardHistory = items || [];

    if (!items || items.length === 0) {
      this.renderEmpty();
      return;
    }

    // Differential rendering - only update changed items
    const newItemIds = new Set(items.map((item) => item.id));
    const existingElements = this.clipboardList.querySelectorAll('.clipboard-item-wrapper');

    // Remove items that no longer exist
    existingElements.forEach((el) => {
      if (!newItemIds.has(el.dataset.id)) {
        el.remove();
        this.renderedHistoryIds.delete(el.dataset.id);
        this.historyItemCache.delete(el.dataset.id);
      }
    });

    // Create document fragment for batch DOM updates
    const fragment = document.createDocumentFragment();
    const existingIds = new Set(Array.from(existingElements).map((el) => el.dataset.id));

    items.forEach((item, index) => {
      // Skip if already rendered
      if (existingIds.has(item.id)) {
        // Move to correct position if needed
        const existingEl = this.clipboardList.querySelector(`[data-id="${item.id}"]`);
        if (existingEl && this.clipboardList.children[index] !== existingEl) {
          if (index < this.clipboardList.children.length) {
            this.clipboardList.insertBefore(existingEl, this.clipboardList.children[index]);
          } else {
            this.clipboardList.appendChild(existingEl);
          }
        }
        return;
      }

      // Create new item element
      const wrapperEl = this.createHistoryItemElement(item);
      this.renderedHistoryIds.add(item.id);
      this.historyItemCache.set(item.id, wrapperEl);

      // Add to fragment for batch insertion
      if (index < this.clipboardList.children.length) {
        this.clipboardList.insertBefore(wrapperEl, this.clipboardList.children[index]);
      } else {
        fragment.appendChild(wrapperEl);
      }
    });

    // Batch append new items
    if (fragment.children.length > 0) {
      this.clipboardList.appendChild(fragment);
    }
  }

  createHistoryItemElement(item) {
    const wrapperEl = document.createElement('div');
    wrapperEl.className = 'clipboard-item-wrapper';
    wrapperEl.dataset.id = item.id;

    const itemEl = document.createElement('div');
    itemEl.className = 'clipboard-item';

    const contentEl = document.createElement('div');
    contentEl.className = 'clipboard-item-content';

    if (item.type === 'image' && item.imageData) {
      const imgEl = document.createElement('img');
      imgEl.className = 'clipboard-item-image';
      imgEl.alt = 'Clipboard image';
      imgEl.loading = 'lazy'; // Native lazy loading
      imgEl.dataset.src = item.imageData; // Store src for lazy loading

      // Use Intersection Observer for progressive loading
      if ('IntersectionObserver' in window) {
        imgEl.src =
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3C/svg%3E';
        this.observeImage(imgEl);
      } else {
        imgEl.src = item.imageData;
      }

      contentEl.appendChild(imgEl);
    } else {
      // Display text with optional color swatch
      const textWrapper = document.createElement('div');
      textWrapper.className = 'clipboard-item-text-wrapper';

      // Check if text is a color code
      const colorValue = detectColorCode(item.text);
      if (colorValue) {
        const swatch = createColorSwatch(colorValue);
        textWrapper.appendChild(swatch);
      }

      const textEl = document.createElement('div');
      textEl.className = 'clipboard-item-text';
      textEl.textContent = item.text || '';
      textWrapper.appendChild(textEl);
      contentEl.appendChild(textWrapper);
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'clipboard-item-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'clipboard-item-btn copy';
    copyBtn.title = this.t('copy');
    copyBtn.innerHTML = ICONS.COPY;

    actionsEl.appendChild(copyBtn);
    itemEl.appendChild(contentEl);
    itemEl.appendChild(actionsEl);
    wrapperEl.appendChild(itemEl);

    if (this.itemVisibilityObserver) {
      this.itemVisibilityObserver.observe(wrapperEl);
    }

    return wrapperEl;
  }

  observeImage(imgEl) {
    if (!this.imageObserver) {
      this.imageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              const src = img.dataset.src;
              if (src) {
                img.src = src;
                img.removeAttribute('data-src');
                this.imageObserver.unobserve(img);
              }
            }
          });
        },
        {
          rootMargin: '50px', // Start loading 50px before visible
        }
      );
    }
    this.imageObserver.observe(imgEl);
  }

  renderEmpty() {
    if (!this.clipboardList) return;

    this.clipboardList.innerHTML = '';
  }

  // ========== Snippet Rendering ==========

  renderFolder(folder, parentContainer) {
    const folderEl = document.createElement('div');
    folderEl.className = 'snippet-folder';
    if (folder.expanded) folderEl.classList.add('expanded');
    folderEl.dataset.id = folder.id;

    const iconDiv = document.createElement('div');
    iconDiv.className = 'snippet-folder-icon';
    iconDiv.innerHTML = folder.expanded ? ICONS.FOLDER_OPEN : ICONS.FOLDER;

    const nameDiv = document.createElement('div');
    if (folder.editing) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'snippet-folder-name-input';
      input.value = folder.name;
      input.addEventListener('blur', () => this.finishEditingFolder(folder.id, input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        else if (e.key === 'Escape') this.cancelEditingFolder(folder.id);
      });
      input.addEventListener('click', (e) => e.stopPropagation());
      nameDiv.appendChild(input);
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    } else {
      nameDiv.className = 'snippet-folder-name';
      nameDiv.textContent = folder.name;
    }

    const moreBtn = document.createElement('div');
    moreBtn.className = 'snippet-folder-more';
    moreBtn.textContent = '⋯';

    folderEl.appendChild(iconDiv);
    folderEl.appendChild(nameDiv);
    folderEl.appendChild(moreBtn);
    parentContainer.appendChild(folderEl);

    if (folder.expanded) {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'folder-content';

      const snippetsInFolder = this.snippets.filter((s) => s.folderId === folder.id);
      snippetsInFolder.forEach((snippet) => {
        contentDiv.appendChild(this.createSnippetElement(snippet));
      });

      const subfolders = this.snippetFolders.filter((f) => f.parentId === folder.id);
      subfolders.forEach((subfolder) => {
        this.renderFolder(subfolder, contentDiv);
      });

      parentContainer.appendChild(contentDiv);
    }
  }

  renderSnippets() {
    if (!this.snippetList) return;

    requestAnimationFrame(() => {
      this.snippetList.innerHTML = '';

      // Render root folders
      const rootFolders = this.snippetFolders.filter((f) => !f.parentId);
      rootFolders.forEach((folder) => this.renderFolder(folder, this.snippetList));

      // Add folder button
      const addBtn = document.createElement('button');
      addBtn.className = 'add-folder-btn';
      addBtn.innerHTML = `${ICONS.PLUS}<span>${this.t('addFolder')}</span>`;
      this.snippetList.appendChild(addBtn);
    });
  }

  // ========== Folder Operations ==========

  toggleFolder(folderId) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (!folder) return;
    folder.expanded = !folder.expanded;
    this.saveSnippets();
    this.renderSnippets();
  }

  startEditingFolder(folderId) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (!folder) return;
    folder.editing = true;
    this.renderSnippets();
  }

  finishEditingFolder(folderId, newName) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (!folder) return;
    folder.name = newName.trim() || this.t('untitledFolder');
    folder.editing = false;
    this.saveSnippets();
    this.renderSnippets();
  }

  cancelEditingFolder(folderId) {
    const folderIndex = this.snippetFolders.findIndex((f) => f.id === folderId);
    if (folderIndex === -1) return;

    const folder = this.snippetFolders[folderIndex];
    if (folder.editing && folder.editable) {
      this.snippetFolders.splice(folderIndex, 1);
    } else {
      folder.editing = false;
    }
    this.renderSnippets();
  }

  addNewFolder() {
    const newFolder = {
      id: `folder-${this.nextFolderId++}`,
      name: 'New Folder',
      count: 0,
      editable: true,
      editing: true,
      expanded: false,
    };
    this.snippetFolders.push(newFolder);
    this.saveSnippets();
    this.renderSnippets();
  }

  addNewSubfolder(parentFolderId) {
    const parentFolder = this.snippetFolders.find((f) => f.id === parentFolderId);
    if (parentFolder) parentFolder.expanded = true;

    const newFolder = {
      id: `folder-${this.nextFolderId++}`,
      name: 'New Subfolder',
      count: 0,
      editable: true,
      editing: true,
      expanded: false,
      parentId: parentFolderId,
    };
    this.snippetFolders.push(newFolder);
    this.saveSnippets();
    this.renderSnippets();
  }

  deleteFolder(folderId) {
    const folderIndex = this.snippetFolders.findIndex((f) => f.id === folderId);
    if (folderIndex === -1) return;

    this.snippetFolders.splice(folderIndex, 1);
    this.snippets = this.snippets.filter((s) => s.folderId !== folderId);
    this.snippetFolders = this.snippetFolders.filter((f) => f.parentId !== folderId);
    this.saveSnippets();
    this.renderSnippets();
  }

  createSnippetElement(snippet) {
    const snippetEl = document.createElement('div');
    snippetEl.className = 'snippet-item';
    snippetEl.dataset.id = snippet.id;

    if (snippet.editing) {
      snippetEl.classList.add('editing');
      this._buildSnippetEditingView(snippetEl, snippet);
    } else {
      this._buildSnippetDisplayView(snippetEl, snippet);
    }

    return snippetEl;
  }

  /** Build snippet editing view with name input and optional content input */
  _buildSnippetEditingView(snippetEl, snippet) {
    const isImageSnippet = snippet.type === 'image';

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'snippet-item-name-input';
    nameInput.placeholder = this.t('snippetNamePlaceholder');
    nameInput.value = snippet.name;

    // Content input (text snippets only)
    let contentInput = null;
    if (!isImageSnippet) {
      contentInput = document.createElement('textarea');
      contentInput.className = 'snippet-item-content-input';
      contentInput.placeholder = this.t('snippetContentPlaceholder');
      contentInput.value = snippet.content || '';
    }

    // Blur handling with timeout to allow focus switching between inputs
    let blurTimeout = null;
    const saveHandler = () => {
      blurTimeout = setTimeout(() => {
        if (
          document.activeElement !== nameInput &&
          (!contentInput || document.activeElement !== contentInput)
        ) {
          this.finishEditingSnippet(snippet.id, nameInput.value, contentInput?.value ?? null);
        }
      }, 100);
    };
    const cancelBlurTimeout = () => {
      if (blurTimeout) {
        clearTimeout(blurTimeout);
        blurTimeout = null;
      }
    };

    // Name input events
    nameInput.addEventListener('blur', saveHandler);
    nameInput.addEventListener('focus', cancelBlurTimeout);
    nameInput.addEventListener('click', (e) => e.stopPropagation());
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (contentInput) {
          setTimeout(() => contentInput.focus(), 0);
        } else {
          this.finishEditingSnippet(snippet.id, nameInput.value, null);
        }
      } else if (e.key === 'Escape') {
        this.cancelEditingSnippet(snippet.id);
      }
    });

    snippetEl.appendChild(nameInput);

    // Image preview (image snippets only)
    if (isImageSnippet && snippet.thumbnailData) {
      snippetEl.classList.add('image-snippet');
      const imgPreview = document.createElement('img');
      imgPreview.className = 'snippet-item-image-preview';
      imgPreview.src = `data:image/png;base64,${snippet.thumbnailData}`;
      imgPreview.alt = snippet.name;
      snippetEl.appendChild(imgPreview);
    }

    // Content input events (text snippets only)
    if (contentInput) {
      contentInput.addEventListener('blur', saveHandler);
      contentInput.addEventListener('focus', cancelBlurTimeout);
      contentInput.addEventListener('click', (e) => e.stopPropagation());
      contentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.cancelEditingSnippet(snippet.id);
      });
      snippetEl.appendChild(contentInput);
    }

    snippetEl.addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 0);
  }

  /** Build snippet display view with name, thumbnail, and action buttons */
  _buildSnippetDisplayView(snippetEl, snippet) {
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'snippet-item-content-wrapper';

    // Thumbnail (image snippets only)
    if (snippet.type === 'image' && snippet.thumbnailData) {
      snippetEl.classList.add('image-snippet');
      const imgEl = document.createElement('img');
      imgEl.className = 'snippet-item-image';
      imgEl.src = `data:image/png;base64,${snippet.thumbnailData}`;
      imgEl.alt = snippet.name;
      contentWrapper.appendChild(imgEl);
    } else {
      // Check if snippet content is a color code (for text snippets)
      const colorValue = detectColorCode(snippet.content);
      if (colorValue) {
        snippetEl.classList.add('color-snippet');
        const swatch = createColorSwatch(colorValue);
        contentWrapper.appendChild(swatch);
      }
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'snippet-item-name';
    nameDiv.textContent = snippet.name;
    contentWrapper.appendChild(nameDiv);

    const iconDiv = document.createElement('div');
    iconDiv.className = 'snippet-item-icon';

    const moreBtn = document.createElement('div');
    moreBtn.className = 'snippet-item-more';
    moreBtn.textContent = '⋯';

    snippetEl.appendChild(contentWrapper);
    snippetEl.appendChild(iconDiv);
    snippetEl.appendChild(moreBtn);
  }

  // ========== Snippet Operations ==========

  /** Expand parent folder if collapsed */
  _expandParentFolder(folderId) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (folder && !folder.expanded) folder.expanded = true;
  }

  /** Add new text snippet */
  addNewSnippet(folderId) {
    this._expandParentFolder(folderId);
    this.snippets.push({
      id: `snippet-${this.nextSnippetId++}`,
      name: 'New Snippet',
      content: '',
      folderId,
      timestamp: Date.now(),
      editing: true,
    });
    this.saveSnippets();
    this.renderSnippets();
  }

  /** Add new image snippet via file picker */
  async addImageSnippet(folderId) {
    if (!window.electronAPI?.selectImageFile) return;

    const result = await window.electronAPI.selectImageFile();
    if (!result.success || result.canceled) return;

    this._expandParentFolder(folderId);

    const snippetId = `snippet-${this.nextSnippetId++}`;
    const saveResult = await window.electronAPI.saveSnippetImage(snippetId, result.imageBase64);
    if (!saveResult.success) return;

    this.snippets.push({
      id: snippetId,
      name: (result.fileName || 'Image').replace(/\.[^.]+$/, ''),
      type: 'image',
      imagePath: saveResult.imagePath,
      thumbnailData: saveResult.thumbnailBase64,
      folderId,
      timestamp: Date.now(),
      editing: true,
    });
    this.saveSnippets();
    this.renderSnippets();
  }

  startEditingSnippet(snippetId) {
    const snippet = this.snippets.find((s) => s.id === snippetId);
    if (!snippet) return;
    snippet.editing = true;
    this.renderSnippets();
  }

  finishEditingSnippet(snippetId, name, content) {
    const snippet = this.snippets.find((s) => s.id === snippetId);
    if (!snippet) return;
    snippet.name = name.trim() || this.t('untitledSnippet');
    snippet.content = content;
    snippet.editing = false;
    this.saveSnippets();
    this.renderSnippets();
  }

  cancelEditingSnippet(snippetId) {
    const index = this.snippets.findIndex((s) => s.id === snippetId);
    if (index === -1) return;

    const snippet = this.snippets[index];
    const isNewEmptyTextSnippet =
      snippet.editing &&
      !snippet.content &&
      snippet.name === 'New Snippet' &&
      snippet.type !== 'image';

    if (isNewEmptyTextSnippet) {
      this.snippets.splice(index, 1);
    } else {
      snippet.editing = false;
    }
    this.renderSnippets();
  }

  async deleteSnippet(snippetId) {
    const index = this.snippets.findIndex((s) => s.id === snippetId);
    if (index === -1) return;

    const snippet = this.snippets[index];
    if (snippet.type === 'image' && snippet.imagePath && window.electronAPI?.deleteSnippetImage) {
      await window.electronAPI.deleteSnippetImage(snippet.imagePath);
    }

    this.snippets.splice(index, 1);
    this.saveSnippets();
    this.renderSnippets();
  }

  /** Copy snippet content to clipboard and show visual feedback */
  async copySnippet(snippet, iconDiv, moreBtn, snippetEl) {
    if (snippet.type === 'image' && snippet.imagePath) {
      if (!window.electronAPI?.copySnippetImage) return;
      await window.electronAPI.copySnippetImage(snippet.imagePath);
    } else {
      if (!window.electronAPI?.copyToClipboard) return;
      window.electronAPI.copyToClipboard({ type: 'text', text: snippet.content });
    }

    // Visual feedback
    if (iconDiv && moreBtn) {
      iconDiv.innerHTML = ICONS.CHECK;
      iconDiv.style.opacity = '1';
      moreBtn.style.opacity = '0';
      setTimeout(() => {
        iconDiv.style.opacity = '0';
        moreBtn.style.opacity = '1';
        setTimeout(() => (iconDiv.innerHTML = ''), 200);
      }, 1500);
    }

    if (snippetEl) {
      snippetEl.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      setTimeout(() => (snippetEl.style.backgroundColor = ''), 500);
    }
  }

  // ========== Context Menus ==========

  toggleFolderMenu(folderId) {
    if (this.currentMenuFolderId === folderId && this.contextMenu.style.display === 'block') {
      this.hideContextMenu();
      return;
    }

    // Otherwise, show the menu
    this.showFolderMenu(folderId);
  }

  toggleSnippetMenu(snippetId) {
    // If the same snippet's menu is already open, close it
    if (this.currentMenuSnippetId === snippetId && this.contextMenu.style.display === 'block') {
      this.hideContextMenu();
      return;
    }

    // Otherwise, show the menu
    this.showSnippetMenu(snippetId);
  }

  showFolderMenu(folderId) {
    if (!this.contextMenu) return;

    this.contextMenu.innerHTML = '';
    this.currentMenuFolderId = folderId; // Track which folder's menu is open
    this.currentMenuSnippetId = null; // Clear snippet menu tracking

    // Get folder name
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    const folderName = folder ? folder.name : 'Folder';

    // Add header with folder name and close button
    const header = document.createElement('div');
    header.className = 'context-menu-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'context-menu-header-name';
    nameSpan.textContent = folderName;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'context-menu-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideContextMenu();
    });

    header.appendChild(nameSpan);
    header.appendChild(closeBtn);
    this.contextMenu.appendChild(header);

    const addFolderItem = document.createElement('div');
    addFolderItem.className = 'context-menu-item';
    addFolderItem.innerHTML = `${ICONS.PLUS}<span>${this.t('addFolder')}</span>`;
    addFolderItem.addEventListener('click', () => {
      this.addNewSubfolder(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(addFolderItem);

    const addSnippetItem = document.createElement('div');
    addSnippetItem.className = 'context-menu-item';
    addSnippetItem.innerHTML = `${ICONS.PLUS}<span>${this.t('addSnippet')}</span>`;
    addSnippetItem.addEventListener('click', () => {
      this.addNewSnippet(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(addSnippetItem);

    const addImageItem = document.createElement('div');
    addImageItem.className = 'context-menu-item';
    addImageItem.innerHTML = `${ICONS.PLUS}<span>${this.t('addImage')}</span>`;
    addImageItem.addEventListener('click', () => {
      this.addImageSnippet(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(addImageItem);

    const editItem = document.createElement('div');
    editItem.className = 'context-menu-item';
    editItem.innerHTML = `${ICONS.EDIT}<span>${this.t('edit')}</span>`;
    editItem.addEventListener('click', () => {
      this.startEditingFolder(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(editItem);

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item delete';
    deleteItem.innerHTML = `${ICONS.TRASH}<span>${this.t('delete')}</span>`;
    deleteItem.addEventListener('click', () => {
      this.deleteFolder(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(deleteItem);

    // Show menu in center (position is set by CSS)
    this.contextMenu.style.display = 'block';
  }

  showSnippetMenu(snippetId) {
    if (!this.contextMenu) return;

    this.contextMenu.innerHTML = '';
    this.currentMenuSnippetId = snippetId; // Track which snippet's menu is open
    this.currentMenuFolderId = null; // Clear folder menu tracking

    // Get snippet name
    const snippet = this.snippets.find((s) => s.id === snippetId);
    const snippetName = snippet ? snippet.name : 'Snippet';

    // Add header with snippet name and close button
    const header = document.createElement('div');
    header.className = 'context-menu-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'context-menu-header-name';
    nameSpan.textContent = snippetName;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'context-menu-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideContextMenu();
    });

    header.appendChild(nameSpan);
    header.appendChild(closeBtn);
    this.contextMenu.appendChild(header);

    const editItem = document.createElement('div');
    editItem.className = 'context-menu-item';
    editItem.innerHTML = `${ICONS.EDIT}<span>${this.t('edit')}</span>`;
    editItem.addEventListener('click', () => {
      this.startEditingSnippet(snippetId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(editItem);

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item delete';
    deleteItem.innerHTML = `${ICONS.TRASH}<span>${this.t('delete')}</span>`;
    deleteItem.addEventListener('click', () => {
      this.deleteSnippet(snippetId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(deleteItem);

    // Show menu in center (position is set by CSS)
    this.contextMenu.style.display = 'block';
  }

  showContextMenu(type, id) {
    if (!this.contextMenu) return;

    this.contextMenu.innerHTML = '';

    if (type === 'folder') {
      // Use the new folder menu
      this.showFolderMenu(id);
      return;
    } else if (type === 'snippet') {
      // Use the new snippet menu
      this.showSnippetMenu(id);
      return;
    }

    // Show menu in center (position is set by CSS)
    this.contextMenu.style.display = 'block';
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
      this.currentMenuFolderId = null; // Reset tracked folder
      this.currentMenuSnippetId = null; // Reset tracked snippet
    }
  }

  async copyItem(item) {
    try {
      if (!window.electronAPI?.copyToClipboard) return false;
      await window.electronAPI.copyToClipboard(item);
      return true;
    } catch (err) {
      return false;
    }
  }

  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return this.i18n.clipboard.daysAgo(days);
    } else if (hours > 0) {
      return this.i18n.clipboard.hoursAgo(hours);
    } else if (minutes > 0) {
      return this.i18n.clipboard.minutesAgo(minutes);
    } else {
      return this.t('justNow');
    }
  }

  showNotification(message, type = 'success') {
    // Simple notification - could be enhanced
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 12px 16px;
      background: ${type === 'error' ? '#ff4d6d' : '#10b981'};
      color: white;
      border-radius: 8px;
      font-size: 13px;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      animation: slideIn 0.2s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.2s ease';
      setTimeout(() => {
        notification.remove();
      }, 200);
    }, 2000);
  }

  performHistorySearch() {
    const query = this.historySearchQuery.trim().toLowerCase();

    if (!query) {
      this.historySearchResults = [];
      this.hideSearchResults();
      return;
    }

    // Search through clipboard history
    this.historySearchResults = this.clipboardHistory.filter((item) => {
      const text = item.text || '';
      return text.toLowerCase().includes(query);
    });

    this.renderSearchResults('history');
  }

  performSnippetSearch() {
    const query = this.snippetSearchQuery.trim().toLowerCase();

    if (!query) {
      this.snippetSearchResults = [];
      this.hideSearchResults();
      return;
    }

    // Search through all snippets (including nested ones)
    const snippetResults = this.snippets
      .filter((snippet) => {
        const name = snippet.name.toLowerCase();
        const content = snippet.content.toLowerCase();
        return name.includes(query) || content.includes(query);
      })
      .map((snippet) => ({ ...snippet, type: 'snippet' }));

    // Search through all folders
    const folderResults = this.snippetFolders
      .filter((folder) => {
        const name = folder.name.toLowerCase();
        return name.includes(query);
      })
      .map((folder) => ({ ...folder, type: 'folder' }));

    // Combine and sort results (folders first, then snippets)
    this.snippetSearchResults = [...folderResults, ...snippetResults];

    this.renderSearchResults('snippet');
  }

  renderSearchResults(tabType) {
    if (!this.searchResultsMenu) return;

    const results = tabType === 'history' ? this.historySearchResults : this.snippetSearchResults;
    const query =
      tabType === 'history' ? this.historySearchQuery.trim() : this.snippetSearchQuery.trim();

    if (results.length === 0) {
      this.searchResultsMenu.innerHTML = `<div class="search-no-results">${this.t('noResults')}</div>`;
      this.searchResultsMenu.style.display = 'block';
      return;
    }

    this.searchResultsMenu.innerHTML = '';

    results.forEach((item) => {
      const resultItem = document.createElement('div');
      resultItem.className = 'search-result-item';

      if (tabType === 'history') {
        // History item
        const preview = document.createElement('div');
        preview.className = 'search-result-preview';
        preview.innerHTML = this.highlightText(item.text || '', query);
        resultItem.appendChild(preview);

        resultItem.addEventListener('click', () => {
          this.scrollToHistoryItem(item.id);
          this.hideSearchResults();
        });
      } else {
        // Check if it's a folder or snippet
        if (item.type === 'folder') {
          // Folder item
          const folderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;

          const name = document.createElement('div');
          name.className = 'search-result-name';
          name.innerHTML = folderIconSvg + this.highlightText(item.name, query);

          const path = document.createElement('div');
          path.className = 'search-result-path';
          path.textContent = this.getFolderPath(item.id);

          resultItem.appendChild(name);
          resultItem.appendChild(path);

          resultItem.addEventListener('click', () => {
            this.scrollToFolder(item.id);
            this.hideSearchResults();
          });
        } else {
          // Snippet item
          const name = document.createElement('div');
          name.className = 'search-result-name';
          name.innerHTML = this.highlightText(item.name, query);

          const path = document.createElement('div');
          path.className = 'search-result-path';
          path.textContent = this.getSnippetPath(item);

          const preview = document.createElement('div');
          preview.className = 'search-result-preview';
          preview.innerHTML = this.highlightText(item.content, query);

          resultItem.appendChild(name);
          resultItem.appendChild(path);
          resultItem.appendChild(preview);

          resultItem.addEventListener('click', () => {
            this.scrollToSnippet(item.id);
            this.hideSearchResults();
          });
        }
      }

      this.searchResultsMenu.appendChild(resultItem);
    });

    this.searchResultsMenu.style.display = 'block';
  }

  highlightText(text, query) {
    if (!text || !query) return this.escapeHtml(text);

    const escapedText = this.escapeHtml(text);
    const escapedQuery = this.escapeHtml(query);
    const regex = new RegExp(`(${this.escapeRegex(escapedQuery)})`, 'gi');
    return escapedText.replace(regex, '<span class="search-result-highlight">$1</span>');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getFolderPath(folderId) {
    const pathParts = [];
    let currentFolder = this.snippetFolders.find((f) => f.id === folderId);

    while (currentFolder) {
      pathParts.unshift(currentFolder.name);
      if (currentFolder.parentId) {
        currentFolder = this.snippetFolders.find((f) => f.id === currentFolder.parentId);
      } else {
        currentFolder = null;
      }
    }

    return '/' + pathParts.join('/');
  }

  getSnippetPath(snippet) {
    if (!snippet.folderId) {
      return '/';
    }
    return this.getFolderPath(snippet.folderId);
  }

  scrollToHistoryItem(itemId) {
    const itemEl = this.clipboardList.querySelector(`[data-id="${itemId}"]`);
    if (itemEl) {
      itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight effect
      itemEl.style.background = 'rgba(255, 77, 109, 0.15)';
      setTimeout(() => {
        itemEl.style.background = '';
      }, 1500);
    }
  }

  scrollToSnippet(snippetId) {
    // First, ensure all parent folders are expanded
    const snippet = this.snippets.find((s) => s.id === snippetId);
    if (snippet && snippet.folderId) {
      // Expand the immediate parent folder and all its ancestors
      this.expandAllParentFolders(snippet.folderId);
      this.saveSnippets();
      this.renderSnippets();
    }

    // Wait a moment for render to complete, then scroll
    setTimeout(() => {
      const snippetEl = this.snippetList.querySelector(`[data-id="${snippetId}"]`);
      if (snippetEl) {
        snippetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add highlight effect
        snippetEl.style.background = 'rgba(255, 77, 109, 0.15)';
        setTimeout(() => {
          snippetEl.style.background = '';
        }, 1500);
      }
    }, 100);
  }

  expandAllParentFolders(folderId) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (!folder) return;

    // Expand the folder itself
    folder.expanded = true;

    // Recursively expand all parent folders
    if (folder.parentId) {
      this.expandAllParentFolders(folder.parentId);
    }
  }

  scrollToFolder(folderId) {
    // Expand all parent folders first
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (folder && folder.parentId) {
      this.expandAllParentFolders(folder.parentId);
    }

    // Ensure the folder itself is expanded
    if (folder && !folder.expanded) {
      folder.expanded = true;
    }

    this.saveSnippets();
    this.renderSnippets();

    // Wait a moment for render to complete, then scroll
    setTimeout(() => {
      const folderEl = this.snippetList.querySelector(`[data-id="${folderId}"]`);
      if (folderEl) {
        folderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add highlight effect
        folderEl.style.background = 'rgba(255, 77, 109, 0.15)';
        setTimeout(() => {
          folderEl.style.background = '';
        }, 1500);
      }
    }, 100);
  }

  hideSearchResults() {
    if (this.searchResultsMenu) {
      this.searchResultsMenu.style.display = 'none';
      this.searchResultsMenu.innerHTML = '';
    }
  }

  clearSearch(tabType) {
    if (tabType === 'history') {
      this.historySearchQuery = '';
      this.historySearchInput.value = '';
      this.historySearchResults = [];
      this.updateClearButtonVisibility('history');
    } else {
      this.snippetSearchQuery = '';
      this.snippetSearchInput.value = '';
      this.snippetSearchResults = [];
      this.updateClearButtonVisibility('snippet');
    }
    this.hideSearchResults();
  }

  updateClearButtonVisibility(tabType) {
    if (tabType === 'history') {
      if (this.historyClearSearch) {
        this.historyClearSearch.style.display = this.historySearchQuery ? 'block' : 'none';
      }
    } else {
      if (this.snippetClearSearch) {
        this.snippetClearSearch.style.display = this.snippetSearchQuery ? 'block' : 'none';
      }
    }
  }

  // ========== Drag & Drop Operations ==========

  /**
   * Initiates drag preparation when mouse is pressed on a draggable element
   * @param {MouseEvent} e - The mousedown event
   */
  handleMouseDown(e) {
    // Ignore clicks on non-draggable elements
    if (this.shouldIgnoreDragStart(e)) {
      return;
    }

    const draggableElement = this.findDraggableElement(e.target);
    if (!draggableElement) {
      return;
    }

    // Prepare for drag (actual drag starts on mouse move)
    this.drag.element = draggableElement.element;
    this.drag.type = draggableElement.type;
    this.drag.id = draggableElement.id;
    this.drag.startX = e.clientX;
    this.drag.startY = e.clientY;
  }

  /**
   * Handles mouse movement to detect drag start and update drop targets
   * @param {MouseEvent} e - The mousemove event
   */
  handleMouseMove(e) {
    if (!this.drag.element) return;

    // Check if we should start dragging
    if (!this.drag.isActive && this.hasMovedBeyondThreshold(e)) {
      this.startDrag();
    }

    if (!this.drag.isActive) return;

    // Update drop target highlight
    this.updateDropTarget(e);
  }

  /**
   * Handles mouse release to complete or cancel the drag operation
   * @param {MouseEvent} e - The mouseup event
   */
  handleMouseUp(e) {
    if (!this.drag.element) return;

    // Perform drop if there's a valid target
    if (this.drag.isActive && this.drag.target) {
      this.performDrop();
    }

    // Clean up drag state
    this.endDrag();
  }

  // ---------- Drag State Helpers ----------

  /**
   * Checks if drag should be ignored for the given event
   * @param {MouseEvent} e - The event to check
   * @returns {boolean} True if drag should be ignored
   */
  shouldIgnoreDragStart(e) {
    // Ignore clicks on interactive elements
    const nonDraggableSelectors = [
      'input',
      'textarea',
      'button',
      '.snippet-folder-more',
      '.snippet-item-more',
      '.add-folder-btn',
    ];

    return nonDraggableSelectors.some((selector) => e.target.closest(selector));
  }

  /**
   * Finds the draggable element from the clicked target
   * @param {HTMLElement} target - The clicked element
   * @returns {Object|null} Object with element, type, and id, or null if not draggable
   */
  findDraggableElement(target) {
    const folder = target.closest('.snippet-folder');
    const snippet = target.closest('.snippet-item');

    // Don't allow dragging while editing
    if (folder?.classList.contains('editing') || snippet?.classList.contains('editing')) {
      return null;
    }

    if (folder) {
      return {
        element: folder,
        type: 'folder',
        id: folder.dataset.id,
      };
    }

    if (snippet) {
      return {
        element: snippet,
        type: 'snippet',
        id: snippet.dataset.id,
      };
    }

    return null;
  }

  /**
   * Checks if mouse has moved beyond the drag threshold
   * @param {MouseEvent} e - The current mouse event
   * @returns {boolean} True if moved beyond threshold
   */
  hasMovedBeyondThreshold(e) {
    const deltaX = Math.abs(e.clientX - this.drag.startX);
    const deltaY = Math.abs(e.clientY - this.drag.startY);
    return deltaX > this.drag.threshold || deltaY > this.drag.threshold;
  }

  /**
   * Starts the drag operation
   */
  startDrag() {
    this.drag.isActive = true;
    this.drag.element.classList.add('dragging');

    // Set window to highest level to prevent it from going behind
    if (window.electronAPI?.setDragging) {
      window.electronAPI.setDragging(true);
    }

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  }

  /**
   * Updates the drop target based on current mouse position
   * @param {MouseEvent} e - The current mouse event
   */
  updateDropTarget(e) {
    // Find element at current mouse position
    const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);

    // Check if we're inside a folder-content area
    const folderContent = elementAtPoint?.closest('.folder-content');

    let folder = null;
    let snippet = null;

    if (folderContent) {
      // Inside folder content: only consider direct children (not parent folder)
      snippet = elementAtPoint?.closest('.snippet-item');
      // Only consider folders that are direct children of this folder-content
      const closestFolder = elementAtPoint?.closest('.snippet-folder');
      if (closestFolder && closestFolder.parentElement === folderContent) {
        folder = closestFolder;
      }

      // If no child element found and mouse is in empty folder-content area,
      // find the parent folder to allow dropping at the end
      if (!folder && !snippet && elementAtPoint.classList?.contains('folder-content')) {
        const parentFolder = folderContent.previousElementSibling;
        if (parentFolder?.classList.contains('snippet-folder')) {
          folder = parentFolder;
        }
      }
    } else {
      // Outside folder content: normal behavior
      folder = elementAtPoint?.closest('.snippet-folder');
      snippet = elementAtPoint?.closest('.snippet-item');
    }

    // Clear previous highlights and insertion line
    this.clearDropTargetHighlights();
    this.clearInsertionLine();

    // Determine valid drop target
    const validTarget = this.getValidDropTarget(folder, snippet);

    if (validTarget) {
      // Determine drop type based on mouse position
      let dropType;

      // Special case: if mouse is in empty folder-content area, always nest-inside
      if (
        folderContent &&
        elementAtPoint.classList?.contains('folder-content') &&
        !snippet &&
        folder
      ) {
        dropType = 'nest-inside';
      } else {
        dropType = this.determineDropType(validTarget, e.clientY);
      }

      // Show insertion line or nest highlight
      this.showInsertionLine(validTarget, dropType);

      this.drag.target = validTarget;
      this.drag.dropType = dropType;
    } else {
      this.drag.target = null;
      this.drag.dropType = null;
    }
  }

  /**
   * Determines if a folder/snippet is a valid drop target
   * @param {HTMLElement|null} folder - Potential folder target
   * @param {HTMLElement|null} snippet - Potential snippet target
   * @returns {HTMLElement|null} Valid drop target or null
   */
  getValidDropTarget(folder, snippet) {
    // Don't allow dropping on self
    if (
      (folder && folder.dataset.id === this.drag.id) ||
      (snippet && snippet.dataset.id === this.drag.id)
    ) {
      return null;
    }

    // Snippet drag rules
    if (this.drag.type === 'snippet') {
      if (folder) return folder; // Can drop on folder

      // Only allow dropping on snippets that are inside a folder
      // (not root-level snippets)
      if (snippet) {
        const isInsideFolder = snippet.closest('.folder-content');
        if (isInsideFolder) {
          return snippet; // Can reorder with snippet inside folder
        }
        return null; // Cannot drop on root-level snippets
      }
    }

    // Folder drag rules
    if (this.drag.type === 'folder') {
      if (folder) return folder; // Can nest in folder
      // Cannot drop folder on snippet
    }

    return null;
  }

  /**
   * Determines the drop type based on mouse position within the element
   * @param {HTMLElement} element - The drop target element
   * @param {number} mouseY - Mouse Y position
   * @returns {string} Drop type: 'insert-before', 'insert-after', or 'nest-inside'
   */
  determineDropType(element, mouseY) {
    const rect = element.getBoundingClientRect();
    const relativeY = mouseY - rect.top;
    const height = rect.height;
    const isFolder = element.classList.contains('snippet-folder');

    // Special case: When dragging a snippet onto a folder, always nest inside
    if (this.drag.type === 'snippet' && isFolder) {
      return 'nest-inside';
    }

    // Folder: divide into 3 zones (before, nest, after)
    // This is only for folder-to-folder drag operations
    if (isFolder) {
      const threshold = 0.25; // Top/bottom 25% for insertion
      if (relativeY < height * threshold) {
        return 'insert-before';
      } else if (relativeY > height * (1 - threshold)) {
        return 'insert-after';
      } else {
        return 'nest-inside';
      }
    }

    // Snippet: divide into 2 zones (before, after)
    else {
      if (relativeY < height * 0.5) {
        return 'insert-before';
      } else {
        return 'insert-after';
      }
    }
  }

  /**
   * Clears all drop target highlights
   */
  clearDropTargetHighlights() {
    document.querySelectorAll('.drop-target').forEach((el) => {
      el.classList.remove('drop-target');
    });
  }

  /**
   * Shows insertion line at the appropriate position
   * @param {HTMLElement} element - The drop target element
   * @param {string} dropType - The type of drop operation
   */
  showInsertionLine(element, dropType) {
    // Clear any existing insertion line or nest highlight
    this.clearInsertionLine();

    if (dropType === 'nest-inside') {
      // Show nest highlight instead of insertion line
      element.classList.add('drop-target-nest');
      return;
    }

    // Create insertion line element
    const line = document.createElement('div');
    line.className = 'insertion-line';

    // Get element position relative to snippet list
    const elementRect = element.getBoundingClientRect();
    const listRect = this.snippetList.getBoundingClientRect();

    // Calculate line position including scroll offset
    const scrollTop = this.snippetList.scrollTop;
    let topPosition;
    if (dropType === 'insert-before') {
      topPosition = elementRect.top - listRect.top + scrollTop - 1;
    } else if (dropType === 'insert-after') {
      topPosition = elementRect.bottom - listRect.top + scrollTop - 1;
    }

    line.style.top = `${topPosition}px`;

    // Adjust left indent if element is inside folder-content
    const folderContent = element.closest('.folder-content');
    if (folderContent) {
      const folderContentRect = folderContent.getBoundingClientRect();
      const leftIndent = folderContentRect.left - listRect.left;
      line.style.left = `${leftIndent}px`;
      // Also adjust the right edge to match the folder-content width
      const rightIndent = listRect.right - folderContentRect.right;
      line.style.right = `${rightIndent}px`;
    }

    // Add to snippet list
    this.snippetList.appendChild(line);
    this.currentInsertionLine = line;
  }

  /**
   * Clears insertion line and nest highlights
   */
  clearInsertionLine() {
    // Remove insertion line
    if (this.currentInsertionLine) {
      this.currentInsertionLine.remove();
      this.currentInsertionLine = null;
    }

    // Remove nest highlights
    document.querySelectorAll('.drop-target-nest').forEach((el) => {
      el.classList.remove('drop-target-nest');
    });
  }

  /**
   * Performs the drop operation based on drag state
   */
  performDrop() {
    const targetFolder = this.drag.target.closest('.snippet-folder');
    const targetSnippet = this.drag.target.closest('.snippet-item');
    const dropType = this.drag.dropType;

    try {
      if (this.drag.type === 'snippet') {
        if (targetFolder) {
          if (dropType === 'nest-inside') {
            this.moveSnippetToFolder(this.drag.id, targetFolder.dataset.id);
          } else {
            // insert-before or insert-after
            this.insertSnippetRelativeToFolder(this.drag.id, targetFolder.dataset.id, dropType);
          }
        } else if (targetSnippet) {
          this.reorderSnippets(this.drag.id, targetSnippet.dataset.id, dropType);
        }
      } else if (this.drag.type === 'folder') {
        if (targetFolder) {
          this.reorderOrNestFolders(this.drag.id, targetFolder.dataset.id, dropType);
        }
      }
    } catch (err) {}
  }

  /**
   * Ends the drag operation and cleans up state
   */
  endDrag() {
    // Remove visual feedback
    if (this.drag.element) {
      this.drag.element.classList.remove('dragging');
    }
    this.clearDropTargetHighlights();
    this.clearInsertionLine();

    // Restore text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    // Restore window level
    if (window.electronAPI?.setDragging) {
      window.electronAPI.setDragging(false);
    }

    // Reset drag state
    this.drag.element = null;
    this.drag.type = null;
    this.drag.id = null;
    this.drag.startX = 0;
    this.drag.startY = 0;
    this.drag.isActive = false;
    this.drag.target = null;
    this.drag.dropType = null;
  }

  // ---------- Drop Operation Handlers ----------

  /**
   * Moves a snippet to a different folder
   * @param {string} snippetId - ID of the snippet to move
   * @param {string} targetFolderId - ID of the target folder
   */
  moveSnippetToFolder(snippetId, targetFolderId) {
    const snippet = this.snippets.find((s) => s.id === snippetId);
    if (!snippet) {
      return;
    }

    snippet.folderId = targetFolderId;
    this.saveSnippets();
    this.renderSnippets();
  }

  /**
   * Inserts a snippet before or after a folder
   * @param {string} snippetId - ID of the snippet to insert
   * @param {string} targetFolderId - ID of the target folder
   * @param {string} dropType - 'insert-before' or 'insert-after'
   */
  insertSnippetRelativeToFolder(snippetId, targetFolderId, dropType) {
    const snippet = this.snippets.find((s) => s.id === snippetId);
    const targetFolder = this.snippetFolders.find((f) => f.id === targetFolderId);

    if (!snippet || !targetFolder) {
      return;
    }

    // Don't allow moving snippets to root level
    // Snippets must always be inside a folder
    if (!targetFolder.parentId) {
      return;
    }

    // Move snippet to the same parent as the target folder
    snippet.folderId = targetFolder.parentId;

    // For now, just move to the folder (simple実装)
    // 将来的にはフォルダ位置に基づく並び替えをここに追加
    this.saveSnippets();
    this.renderSnippets();
  }

  /**
   * Reorders snippets by moving dragged snippet to target position
   * If snippets are in different folders, moves to target's folder
   * @param {string} draggedId - ID of the dragged snippet
   * @param {string} targetId - ID of the target snippet
   * @param {string} dropType - 'insert-before' or 'insert-after'
   */
  reorderSnippets(draggedId, targetId, dropType) {
    const draggedIndex = this.snippets.findIndex((s) => s.id === draggedId);
    const targetIndex = this.snippets.findIndex((s) => s.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const targetSnippet = this.snippets[targetIndex];

    // Don't allow moving snippets to root level
    if (!targetSnippet.folderId) {
      return;
    }

    // Remove dragged snippet from array
    const [removed] = this.snippets.splice(draggedIndex, 1);

    // Update folder if moving to a different folder
    if (removed.folderId !== targetSnippet.folderId) {
      removed.folderId = targetSnippet.folderId;
    }

    // Find new target index (after removal)
    let newTargetIndex = this.snippets.findIndex((s) => s.id === targetId);

    // Adjust insertion index based on drop type
    if (dropType === 'insert-after') {
      newTargetIndex += 1;
    }

    // Insert at the new position
    this.snippets.splice(newTargetIndex, 0, removed);

    this.saveSnippets();
    this.renderSnippets();
  }

  /**
   * Reorders folders or nests folder inside another folder
   * @param {string} draggedId - ID of the dragged folder
   * @param {string} targetId - ID of the target folder
   * @param {string} dropType - 'insert-before', 'insert-after', or 'nest-inside'
   */
  reorderOrNestFolders(draggedId, targetId, dropType) {
    const draggedIndex = this.snippetFolders.findIndex((f) => f.id === draggedId);
    const targetIndex = this.snippetFolders.findIndex((f) => f.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const draggedFolder = this.snippetFolders[draggedIndex];
    const targetFolder = this.snippetFolders[targetIndex];

    // Prevent nesting a folder inside itself or its descendants
    if (dropType === 'nest-inside' && this.isFolderDescendant(targetFolder, draggedFolder)) {
      this.renderSnippets();
      return;
    }

    if (dropType === 'nest-inside') {
      // Nest inside target folder
      draggedFolder.parentId = targetId;
      targetFolder.expanded = true;
    } else {
      // insert-before or insert-after - reorder at same level as target
      draggedFolder.parentId = targetFolder.parentId;

      const [removed] = this.snippetFolders.splice(draggedIndex, 1);
      let newTargetIndex = this.snippetFolders.findIndex((f) => f.id === targetId);

      // Adjust insertion index based on drop type
      if (dropType === 'insert-after') {
        newTargetIndex += 1;
      }

      this.snippetFolders.splice(newTargetIndex, 0, removed);
    }

    this.saveSnippets();
    this.renderSnippets();
  }

  /**
   * Checks if a folder is a descendant of another folder
   * @param {Object} folder - The folder to check
   * @param {Object} potentialAncestor - The potential ancestor folder
   * @returns {boolean} True if folder is a descendant of potentialAncestor
   */
  isFolderDescendant(folder, potentialAncestor) {
    if (!folder || !potentialAncestor) return false;
    if (folder.id === potentialAncestor.id) return true;

    let current = folder;
    while (current.parentId) {
      if (current.parentId === potentialAncestor.id) return true;
      current = this.snippetFolders.find((f) => f.id === current.parentId);
      if (!current) break;
    }
    return false;
  }
}

// MemoUI class for managing memo functionality
class MemoUI {
  constructor() {
    this.memoTextarea = document.getElementById('memoTextarea');
    this.memoExportBtn = document.getElementById('memoExportBtn');
    this.memoResetBtn = document.getElementById('memoResetBtn');
    this.storageKey = 'irukadark_memo_content';

    // i18n
    this.currentLang = 'en';
    this.i18n = null;

    this.initI18n();
    this.bindEvents();
    this.loadMemoContent();
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

  bindEvents() {
    // Auto-save memo content as user types
    if (this.memoTextarea) {
      this.memoTextarea.addEventListener('input', () => {
        this.saveMemoContent();
      });
    }

    // Copy button event
    if (this.memoExportBtn) {
      this.memoExportBtn.addEventListener('click', async () => {
        await this.copyMemoContent();
      });
    }

    // Reset button event
    if (this.memoResetBtn) {
      this.memoResetBtn.addEventListener('click', async () => {
        await this.resetMemoContent();
      });
    }
  }

  loadMemoContent() {
    try {
      const savedContent = localStorage.getItem(this.storageKey);
      if (savedContent && this.memoTextarea) {
        this.memoTextarea.value = savedContent;
      }
    } catch (err) {}
  }

  saveMemoContent() {
    try {
      if (this.memoTextarea) {
        localStorage.setItem(this.storageKey, this.memoTextarea.value);
      }
    } catch (err) {}
  }

  async copyMemoContent() {
    try {
      if (!this.memoTextarea || !this.memoTextarea.value.trim()) return;

      const content = this.memoTextarea.value;

      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard({ type: 'text', text: content });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      if (this.memoExportBtn) {
        const originalIcon = this.memoExportBtn.innerHTML;
        this.memoExportBtn.innerHTML = ICONS.CHECK;
        setTimeout(() => (this.memoExportBtn.innerHTML = originalIcon), 1500);
      }

      if (this.memoTextarea) {
        this.memoTextarea.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        setTimeout(() => (this.memoTextarea.style.backgroundColor = ''), 500);
      }
    } catch (err) {}
  }

  showConfirmation() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirmationOverlay');
      const icon = document.getElementById('confirmationIcon');
      const titleText = document.getElementById('confirmationTitleText');
      const message = document.getElementById('confirmationMessage');
      const confirmBtn = document.getElementById('confirmationConfirm');
      const cancelBtn = document.getElementById('confirmationCancel');

      // Get i18n messages
      const title =
        this.i18n && this.i18n.clipboard && this.i18n.clipboard.resetMemoConfirmTitle
          ? this.i18n.clipboard.resetMemoConfirmTitle
          : 'Reset Memo';
      const messageText =
        this.i18n && this.i18n.clipboard && this.i18n.clipboard.resetMemoConfirmMessage
          ? this.i18n.clipboard.resetMemoConfirmMessage
          : 'All memo content will be deleted. This action cannot be undone. Continue?';

      icon.textContent = '📝';
      titleText.textContent = title;
      message.textContent = messageText;

      // Show overlay
      overlay.style.display = 'flex';

      // Handle confirmation
      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      const handleOverlayClick = (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      };

      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };

      const cleanup = () => {
        overlay.style.display = 'none';
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        overlay.removeEventListener('click', handleOverlayClick);
        document.removeEventListener('keydown', handleEscape);
      };

      // Add event listeners
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      overlay.addEventListener('click', handleOverlayClick);
      document.addEventListener('keydown', handleEscape);
    });
  }

  async resetMemoContent() {
    try {
      if (!this.memoTextarea) return;

      const confirmed = await this.showConfirmation();
      if (!confirmed) return;

      this.memoTextarea.value = '';
      localStorage.removeItem(this.storageKey);

      if (this.memoResetBtn) {
        this.memoResetBtn.style.transform = 'rotate(360deg)';
        this.memoResetBtn.style.transition = 'transform 0.3s ease';
        setTimeout(() => (this.memoResetBtn.style.transform = 'rotate(0deg)'), 300);
      }
    } catch (err) {}
  }
}

if (typeof window !== 'undefined') {
  window.MemoUI = MemoUI;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ClipboardHistoryUI();
  });
} else {
  new ClipboardHistoryUI();
}
