/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */

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

    // i18n
    this.currentLang = 'en';
    this.i18n = null;

    this.initI18n();
    this.bindEvents();
    this.applyTheme();
    this.loadHistory();
    this.loadSnippets();
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
      console.error('Error initializing i18n:', err);
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

    // Listen for opacity changes
    if (window.electronAPI && window.electronAPI.onWindowOpacityChanged) {
      window.electronAPI.onWindowOpacityChanged((opacity) => {
        // Opacity is already applied by the main process
        console.log('Clipboard window opacity changed:', opacity);
      });
    }

    // Listen for real-time clipboard history updates
    if (window.electronAPI && window.electronAPI.onClipboardHistoryUpdated) {
      window.electronAPI.onClipboardHistoryUpdated((history) => {
        this.renderHistory(history);
      });
    }

    // Search input events for history tab
    if (this.historySearchInput) {
      this.historySearchInput.addEventListener('input', (e) => {
        this.historySearchQuery = e.target.value;
        this.performHistorySearch();
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

    // Search input events for snippet tab
    if (this.snippetSearchInput) {
      this.snippetSearchInput.addEventListener('input', (e) => {
        this.snippetSearchQuery = e.target.value;
        this.performSnippetSearch();
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

  async applyTheme(theme) {
    try {
      if (!theme && window.electronAPI && window.electronAPI.getTheme) {
        theme = await window.electronAPI.getTheme();
      }

      const html = document.documentElement;
      if (theme === 'dark') {
        html.classList.add('theme-dark');
      } else {
        html.classList.remove('theme-dark');
      }
    } catch (err) {
      console.error('Error applying theme:', err);
    }
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
      console.error('Error loading clipboard history:', err);
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
      }
    } catch (err) {
      console.error('Error loading snippets:', err);
    }
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
    } catch (err) {
      console.error('Error saving snippets:', err);
    }
  }

  // ========================================
  // Clipboard History Rendering
  // ========================================

  renderHistory(items) {
    if (!this.clipboardList) return;

    // Store history data for search
    this.clipboardHistory = items || [];

    if (!items || items.length === 0) {
      this.renderEmpty();
      return;
    }

    this.clipboardList.innerHTML = '';

    items.forEach((item) => {
      const wrapperEl = document.createElement('div');
      wrapperEl.className = 'clipboard-item-wrapper';
      wrapperEl.dataset.id = item.id;

      const itemEl = document.createElement('div');
      itemEl.className = 'clipboard-item';

      const contentEl = document.createElement('div');
      contentEl.className = 'clipboard-item-content';

      if (item.type === 'image' && item.content) {
        // Display image
        const imgEl = document.createElement('img');
        imgEl.className = 'clipboard-item-image';
        imgEl.src = item.content;
        imgEl.alt = 'Clipboard image';
        contentEl.appendChild(imgEl);
      } else {
        // Display text
        const textEl = document.createElement('div');
        textEl.className = 'clipboard-item-text';
        textEl.textContent = item.text || '';
        contentEl.appendChild(textEl);
      }

      const actionsEl = document.createElement('div');
      actionsEl.className = 'clipboard-item-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'clipboard-item-btn copy';
      const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      copyBtn.innerHTML = copyIconSvg;
      copyBtn.title = this.t('copy');

      const changeCopyIconToCheck = () => {
        copyBtn.innerHTML = checkIconSvg;
        setTimeout(() => {
          copyBtn.innerHTML = copyIconSvg;
        }, 1500);
      };

      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const success = await this.copyItem(item);
        if (success) {
          changeCopyIconToCheck();
        }
      });

      actionsEl.appendChild(copyBtn);

      itemEl.appendChild(contentEl);
      itemEl.appendChild(actionsEl);
      wrapperEl.appendChild(itemEl);

      // Click on wrapper to copy
      wrapperEl.addEventListener('click', async () => {
        const success = await this.copyItem(item);
        if (success) {
          // Change copy icon to check
          changeCopyIconToCheck();
          // Show visual feedback on the wrapper
          wrapperEl.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
          setTimeout(() => {
            wrapperEl.style.backgroundColor = '';
          }, 500);
        }
      });

      this.clipboardList.appendChild(wrapperEl);
    });
  }

  renderEmpty() {
    if (!this.clipboardList) return;

    this.clipboardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div>${this.t('noHistoryYet')}</div>
      </div>
    `;
  }

  // ========================================
  // Snippet Folder & Item Rendering
  // ========================================

  renderFolder(folder, parentContainer) {
    const folderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;
    const folderOpenIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="url(#pinkGradient)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="pinkGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ff4d6d;stop-opacity:1" /><stop offset="100%" style="stop-color:#d946ef;stop-opacity:1" /></linearGradient></defs><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`;

    const folderEl = document.createElement('div');
    folderEl.className = 'snippet-folder';
    if (folder.expanded) {
      folderEl.classList.add('expanded');
    }
    folderEl.dataset.id = folder.id;

    const iconDiv = document.createElement('div');
    iconDiv.className = 'snippet-folder-icon';
    iconDiv.innerHTML = folder.expanded ? folderOpenIconSvg : folderIconSvg;

    const nameDiv = document.createElement('div');
    if (folder.editing) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'snippet-folder-name-input';
      input.value = folder.name;
      input.addEventListener('blur', () => {
        this.finishEditingFolder(folder.id, input.value);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        } else if (e.key === 'Escape') {
          this.cancelEditingFolder(folder.id);
        }
      });
      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      nameDiv.appendChild(input);
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    } else {
      nameDiv.className = 'snippet-folder-name';
      nameDiv.textContent = folder.name;
      nameDiv.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startEditingFolder(folder.id);
      });
    }

    const moreBtn = document.createElement('div');
    moreBtn.className = 'snippet-folder-more';
    moreBtn.textContent = '⋯';
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFolderMenu(folder.id);
    });

    folderEl.appendChild(iconDiv);
    folderEl.appendChild(nameDiv);
    folderEl.appendChild(moreBtn);

    if (!folder.editing) {
      folderEl.addEventListener('click', () => {
        this.toggleFolder(folder.id);
      });
    } else {
      folderEl.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    parentContainer.appendChild(folderEl);

    // Show folder contents if expanded
    if (folder.expanded) {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'folder-content';

      // Render snippets in this folder
      const snippetsInFolder = this.snippets.filter((s) => s.folderId === folder.id);
      snippetsInFolder.forEach((snippet) => {
        const snippetEl = this.createSnippetElement(snippet);
        contentDiv.appendChild(snippetEl);
      });

      // Render subfolders recursively
      const subfolders = this.snippetFolders.filter((f) => f.parentId === folder.id);
      subfolders.forEach((subfolder) => {
        this.renderFolder(subfolder, contentDiv);
      });

      parentContainer.appendChild(contentDiv);
    }
  }

  renderSnippets() {
    if (!this.snippetList) return;

    this.snippetList.innerHTML = '';

    const plusIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;

    // Only render root-level folders
    const rootFolders = this.snippetFolders.filter((f) => !f.parentId);

    rootFolders.forEach((folder) => {
      this.renderFolder(folder, this.snippetList);
    });

    // Add "Add Folder" button at root level
    const addBtn = document.createElement('button');
    addBtn.className = 'add-folder-btn';
    addBtn.innerHTML = `${plusIconSvg}<span>${this.t('addFolder')}</span>`;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent any parent event
      this.addNewFolder();
    });
    this.snippetList.appendChild(addBtn);
  }

  toggleFolder(folderId) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (folder) {
      folder.expanded = !folder.expanded;
      this.saveSnippets();
      this.renderSnippets();
    }
  }

  startEditingFolder(folderId) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (folder) {
      folder.editing = true;
      this.renderSnippets();
    }
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

  finishEditingFolder(folderId, newName) {
    const folder = this.snippetFolders.find((f) => f.id === folderId);
    if (folder) {
      folder.name = newName.trim() || this.t('untitledFolder');
      folder.editing = false;
      this.saveSnippets();
      this.renderSnippets();
    }
  }

  cancelEditingFolder(folderId) {
    const folderIndex = this.snippetFolders.findIndex((f) => f.id === folderId);
    if (folderIndex > -1) {
      const folder = this.snippetFolders[folderIndex];
      if (folder.editing && folder.editable) {
        // If it was a new folder, remove it
        this.snippetFolders.splice(folderIndex, 1);
      } else {
        folder.editing = false;
      }
      this.renderSnippets();
    }
  }

  createSnippetElement(snippet) {
    const snippetEl = document.createElement('div');
    snippetEl.className = 'snippet-item';
    if (snippet.editing) {
      snippetEl.classList.add('editing');
    }
    snippetEl.dataset.id = snippet.id;

    if (snippet.editing) {
      // Editing mode
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'snippet-item-name-input';
      nameInput.placeholder = this.t('snippetNamePlaceholder');
      nameInput.value = snippet.name;

      const contentInput = document.createElement('textarea');
      contentInput.className = 'snippet-item-content-input';
      contentInput.placeholder = this.t('snippetContentPlaceholder');
      contentInput.value = snippet.content;

      let blurTimeout = null;

      // Save when either input loses focus (unless moving between them)
      const saveHandler = () => {
        blurTimeout = setTimeout(() => {
          const activeElement = document.activeElement;
          // Save only if focus moved outside of both inputs
          if (activeElement !== nameInput && activeElement !== contentInput) {
            this.finishEditingSnippet(snippet.id, nameInput.value, contentInput.value);
          }
        }, 100);
      };

      const cancelBlurTimeout = () => {
        if (blurTimeout) {
          clearTimeout(blurTimeout);
          blurTimeout = null;
        }
      };

      // Name input: save on blur
      nameInput.addEventListener('blur', saveHandler);
      nameInput.addEventListener('focus', cancelBlurTimeout);
      nameInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          // Delay focus to ensure Enter key doesn't affect contentInput
          setTimeout(() => {
            contentInput.focus();
          }, 0);
        } else if (e.key === 'Escape') {
          this.cancelEditingSnippet(snippet.id);
        }
      });

      // Content input: save on blur
      contentInput.addEventListener('blur', saveHandler);
      contentInput.addEventListener('focus', cancelBlurTimeout);
      contentInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      contentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.cancelEditingSnippet(snippet.id);
        }
      });

      snippetEl.appendChild(nameInput);
      snippetEl.appendChild(contentInput);

      // Stop propagation on the entire snippet element when editing
      snippetEl.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      setTimeout(() => {
        nameInput.focus();
        nameInput.select();
      }, 0);
    } else {
      // Display mode
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'snippet-item-content-wrapper';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'snippet-item-name';
      nameDiv.textContent = snippet.name;

      contentWrapper.appendChild(nameDiv);

      // Icon for copy status
      const iconDiv = document.createElement('div');
      iconDiv.className = 'snippet-item-icon';
      iconDiv.innerHTML = ''; // Empty by default

      const moreBtn = document.createElement('div');
      moreBtn.className = 'snippet-item-more';
      moreBtn.textContent = '⋯';
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSnippetMenu(snippet.id);
      });

      snippetEl.appendChild(contentWrapper);
      snippetEl.appendChild(iconDiv);
      snippetEl.appendChild(moreBtn);

      // Click on entire snippet element to copy (except more button)
      snippetEl.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent parent folder from toggling
        this.copySnippet(snippet, iconDiv, moreBtn, snippetEl);
      });

      // Double-click to edit
      snippetEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startEditingSnippet(snippet.id);
      });
    }

    return snippetEl;
  }

  addNewSnippet(folderId) {
    // Expand the parent folder if it's closed
    const parentFolder = this.snippetFolders.find((f) => f.id === folderId);
    if (parentFolder && !parentFolder.expanded) {
      parentFolder.expanded = true;
    }

    const newSnippet = {
      id: `snippet-${this.nextSnippetId++}`,
      name: 'New Snippet',
      content: '',
      folderId,
      timestamp: Date.now(),
      editing: true,
    };
    this.snippets.push(newSnippet);
    this.saveSnippets();
    this.renderSnippets();
  }

  addNewSubfolder(parentFolderId) {
    // Expand the parent folder if it's closed
    const parentFolder = this.snippetFolders.find((f) => f.id === parentFolderId);
    if (parentFolder && !parentFolder.expanded) {
      parentFolder.expanded = true;
    }

    const newFolder = {
      id: `folder-${this.nextFolderId++}`,
      name: 'New Folder',
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

  startEditingSnippet(snippetId) {
    const snippet = this.snippets.find((s) => s.id === snippetId);
    if (snippet) {
      snippet.editing = true;
      this.renderSnippets();
    }
  }

  finishEditingSnippet(snippetId, name, content) {
    const snippet = this.snippets.find((s) => s.id === snippetId);
    if (snippet) {
      snippet.name = name.trim() || this.t('untitledSnippet');
      snippet.content = content;
      snippet.editing = false;
      this.saveSnippets();
      this.renderSnippets();
    }
  }

  cancelEditingSnippet(snippetId) {
    const snippetIndex = this.snippets.findIndex((s) => s.id === snippetId);
    if (snippetIndex > -1) {
      const snippet = this.snippets[snippetIndex];
      if (snippet.editing && !snippet.content && snippet.name === 'New Snippet') {
        // If it was a new snippet, remove it
        this.snippets.splice(snippetIndex, 1);
      } else {
        snippet.editing = false;
      }
      this.renderSnippets();
    }
  }

  copySnippet(snippet, iconDiv, moreBtn, snippetEl) {
    if (window.electronAPI && window.electronAPI.copyToClipboard) {
      window.electronAPI.copyToClipboard({ type: 'text', text: snippet.content });
      console.log('Copied snippet:', snippet.name);

      // Show check icon and hide more button
      if (iconDiv && moreBtn) {
        const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        iconDiv.innerHTML = checkIconSvg;
        iconDiv.style.opacity = '1';
        moreBtn.style.opacity = '0';

        // Hide after 1.5 seconds
        setTimeout(() => {
          iconDiv.style.opacity = '0';
          moreBtn.style.opacity = '1';
          setTimeout(() => {
            iconDiv.innerHTML = '';
          }, 200);
        }, 1500);
      }

      // Show visual feedback on the snippet element
      if (snippetEl) {
        snippetEl.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        setTimeout(() => {
          snippetEl.style.backgroundColor = '';
        }, 500);
      }
    }
  }

  // ========================================
  // Context Menu (Folder & Snippet Actions)
  // ========================================

  toggleFolderMenu(folderId) {
    // If the same folder's menu is already open, close it
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

    // Icon SVGs (Lucide style)
    const plusIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    const editIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
    const trashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

    // Add Folder option
    const addFolderItem = document.createElement('div');
    addFolderItem.className = 'context-menu-item';
    addFolderItem.innerHTML = `${plusIconSvg}<span>${this.t('addFolder')}</span>`;
    addFolderItem.addEventListener('click', () => {
      this.addNewSubfolder(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(addFolderItem);

    // Add Snippet option
    const addSnippetItem = document.createElement('div');
    addSnippetItem.className = 'context-menu-item';
    addSnippetItem.innerHTML = `${plusIconSvg}<span>${this.t('addSnippet')}</span>`;
    addSnippetItem.addEventListener('click', () => {
      this.addNewSnippet(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(addSnippetItem);

    // Edit option
    const editItem = document.createElement('div');
    editItem.className = 'context-menu-item';
    editItem.innerHTML = `${editIconSvg}<span>${this.t('edit')}</span>`;
    editItem.addEventListener('click', () => {
      this.startEditingFolder(folderId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(editItem);

    // Delete option
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item delete';
    deleteItem.innerHTML = `${trashIconSvg}<span>${this.t('delete')}</span>`;
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

    // Icon SVGs (Lucide style)
    const editIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
    const trashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

    // Edit option
    const editItem = document.createElement('div');
    editItem.className = 'context-menu-item';
    editItem.innerHTML = `${editIconSvg}<span>${this.t('edit')}</span>`;
    editItem.addEventListener('click', () => {
      this.startEditingSnippet(snippetId);
      this.hideContextMenu();
    });
    this.contextMenu.appendChild(editItem);

    // Delete option
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item delete';
    deleteItem.innerHTML = `${trashIconSvg}<span>${this.t('delete')}</span>`;
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

  deleteFolder(folderId) {
    const folderIndex = this.snippetFolders.findIndex((f) => f.id === folderId);
    if (folderIndex > -1) {
      // Remove folder
      this.snippetFolders.splice(folderIndex, 1);
      // Remove all snippets in this folder
      this.snippets = this.snippets.filter((s) => s.folderId !== folderId);
      // Remove all subfolders
      this.snippetFolders = this.snippetFolders.filter((f) => f.parentId !== folderId);
      this.saveSnippets();
      this.renderSnippets();
    }
  }

  deleteSnippet(snippetId) {
    const snippetIndex = this.snippets.findIndex((s) => s.id === snippetId);
    if (snippetIndex > -1) {
      this.snippets.splice(snippetIndex, 1);
      this.saveSnippets();
      this.renderSnippets();
    }
  }

  // ========================================
  // Clipboard Operations
  // ========================================

  async copyItem(item) {
    try {
      if (window.electronAPI && window.electronAPI.copyToClipboard) {
        await window.electronAPI.copyToClipboard(item);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      return false;
    }
  }

  async deleteItem(id) {
    try {
      if (window.electronAPI && window.electronAPI.deleteClipboardItem) {
        await window.electronAPI.deleteClipboardItem(id);
        // History will be updated via real-time event
      }
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  }

  async clearAll() {
    if (confirm(this.t('confirmClearHistory'))) {
      try {
        await window.electronAPI.clearClipboardHistory();
        // History will be updated via real-time event
      } catch (err) {
        console.error('Error clearing history:', err);
      }
    }
  }

  // ========================================
  // Utility Functions
  // ========================================

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

  // ========================================
  // Search Functionality
  // ========================================

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
      console.error('Error initializing i18n:', err);
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
    } catch (err) {
      console.error('Error loading memo content:', err);
    }
  }

  saveMemoContent() {
    try {
      if (this.memoTextarea) {
        localStorage.setItem(this.storageKey, this.memoTextarea.value);
      }
    } catch (err) {
      console.error('Error saving memo content:', err);
    }
  }

  async copyMemoContent() {
    try {
      if (!this.memoTextarea) {
        console.error('Memo textarea not found');
        return;
      }

      const content = this.memoTextarea.value;
      if (!content.trim()) {
        console.log('No content to copy');
        return;
      }

      // Use electronAPI if available, otherwise fallback to navigator.clipboard
      if (window.electronAPI && window.electronAPI.copyToClipboard) {
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

      console.log('Memo content copied to clipboard');

      // Show visual feedback by temporarily changing the button icon
      if (this.memoExportBtn) {
        const originalIcon = this.memoExportBtn.innerHTML;
        const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        this.memoExportBtn.innerHTML = checkIconSvg;

        setTimeout(() => {
          this.memoExportBtn.innerHTML = originalIcon;
        }, 1500);
      }

      // Show visual feedback on the memo textarea (green background like history tab)
      if (this.memoTextarea) {
        this.memoTextarea.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        this.memoTextarea.style.transition = 'background-color 0.2s ease';

        setTimeout(() => {
          this.memoTextarea.style.backgroundColor = '';
        }, 500);
      }
    } catch (err) {
      console.error('Error copying memo content:', err);
    }
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
      if (!this.memoTextarea) {
        console.error('Memo textarea not found');
        return;
      }

      // Show confirmation dialog
      const confirmed = await this.showConfirmation();
      if (!confirmed) return;

      // Clear the textarea
      this.memoTextarea.value = '';

      // Clear the stored content
      localStorage.removeItem(this.storageKey);

      console.log('Memo content reset');

      // Show visual feedback by briefly animating the reset button
      if (this.memoResetBtn) {
        this.memoResetBtn.style.transform = 'rotate(360deg)';
        this.memoResetBtn.style.transition = 'transform 0.3s ease';

        setTimeout(() => {
          this.memoResetBtn.style.transform = 'rotate(0deg)';
        }, 300);
      }
    } catch (err) {
      console.error('Error resetting memo content:', err);
    }
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
