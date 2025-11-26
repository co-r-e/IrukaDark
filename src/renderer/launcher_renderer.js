/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */

class LauncherUI {
  constructor() {
    // Initialize i18n
    this.currentLang = null;
    this.i18n = {};
    try {
      this.currentLang = window.electronAPI?.getAppLang?.() || 'en';
      if (window.IRUKADARK_I18N && window.IRUKADARK_I18N[this.currentLang]) {
        this.i18n = window.IRUKADARK_I18N[this.currentLang];
      } else {
        this.i18n = window.IRUKADARK_I18N['en'] || {};
      }
    } catch {
      this.i18n = window.IRUKADARK_I18N['en'] || {};
    }

    this.searchInput = document.getElementById('launcherSearchInput');
    this.resultsContainer = document.getElementById('launcherResults');
    this.filterBtn = document.getElementById('launcherFilterBtn');
    this.filterMenu = document.getElementById('launcherFilterMenu');
    this.selectedIndex = 0;
    this.results = [];
    this.allResults = []; // Store unfiltered results
    this.searchTimeout = null;
    this.searchId = 0; // Track search requests to prevent race conditions
    this.activeFilters = new Set(['application', 'system-command']); // File search off by default

    // Favorites with O(1) lookup optimization
    this.favorites = this.loadFavorites();
    this.favoritesSet = new Set();
    this.favoritesMap = new Map();
    this.rebuildFavoritesIndex();
    this.isShowingFavorites = false;

    // Drag & drop state for favorites reordering
    this.drag = this.createInitialDragState();
    this.currentInsertionLine = null;

    // Search cache (LRU)
    this.searchCache = new Map();
    this.searchCacheMaxSize = 50;

    // Infinite scroll state
    this.currentQuery = '';
    this.pageSize = 20;
    this.offsets = { application: 0, file: 0, 'system-command': 0 };
    this.hasMore = { application: false, file: false, 'system-command': false };
    this.isLoadingMore = false;
    this.loadMoreId = 0; // Track loadMore requests to prevent race conditions

    this.init();
  }

  createInitialDragState() {
    return {
      element: null,
      index: null,
      startX: 0,
      startY: 0,
      isActive: false,
      threshold: 5,
      target: null,
      dropType: null,
    };
  }

  rebuildFavoritesIndex() {
    this.favoritesSet.clear();
    this.favoritesMap.clear();
    for (const fav of this.favorites) {
      this.favoritesSet.add(fav.key);
      this.favoritesMap.set(fav.key, fav);
    }
  }

  init() {
    if (!this.searchInput || !this.resultsContainer) return;

    this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
    this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));

    if (this.filterBtn) {
      this.filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFilterMenu();
      });
    }

    if (this.filterMenu) {
      this.filterMenu.querySelectorAll('.filter-menu-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFilter(item.dataset.filter);
        });
      });
    }

    document.addEventListener('click', (e) => {
      if (
        this.filterMenu?.style.display === 'block' &&
        !this.filterMenu.contains(e.target) &&
        e.target !== this.filterBtn
      ) {
        this.hideFilterMenu();
      }
    });

    this.resultsContainer.addEventListener('click', (e) => this.handleResultsClick(e));
    this.resultsContainer.addEventListener('scroll', () => this.handleScroll());

    document.addEventListener('mousemove', (e) => this.handleFavoriteMouseMove(e));
    document.addEventListener('mouseup', (e) => this.handleFavoriteMouseUp(e));

    const launcherContainer = document.getElementById('launcherContainer');
    const launcherFooter = document.getElementById('launcherFooter');
    const refocusSearch = (e) => {
      if (e.target.closest('button, input, .launcher-result-item, .filter-menu')) return;
      this.searchInput.focus();
    };
    launcherContainer?.addEventListener('click', refocusSearch);
    launcherFooter?.addEventListener('click', refocusSearch);

    this.searchInput.focus();
    if (!this.searchInput.value.trim()) {
      this.showFavorites();
    }
  }

  // PERFORMANCE: Event delegation handler for all result item clicks
  handleResultsClick(e) {
    // Handle favorite button click
    const favoriteBtn = e.target.closest('.launcher-favorite-btn');
    if (favoriteBtn) {
      e.stopPropagation();
      const index = parseInt(favoriteBtn.dataset.index);
      if (this.results[index]) {
        this.toggleFavorite(this.results[index]);
      }
      return;
    }

    // Handle result item click
    const resultItem = e.target.closest('.launcher-result-item');
    if (resultItem) {
      const index = parseInt(resultItem.dataset.index);
      if (this.results[index]) {
        this.executeResult(this.results[index]);
      }
      return;
    }
  }

  handleSearch(e) {
    const rawValue = e.target.value;
    const query = rawValue.trim();

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Show favorites if search box is empty
    if (!rawValue || !query) {
      this.currentQuery = ''; // Clear query to prevent loadMore() during favorites
      this.searchId++; // Cancel any pending search results
      this.showFavorites();
      return;
    }

    // PERFORMANCE: Reduced debounce from 300ms to 100ms for snappier response
    this.searchTimeout = setTimeout(async () => {
      await this.performSearch(query);
    }, 100);
  }

  async performSearch(query) {
    // Increment search ID to track this search request
    const currentSearchId = ++this.searchId;

    // Reset pagination state for new search
    this.currentQuery = query;
    this.offsets = { application: 0, file: 0, 'system-command': 0 };
    this.hasMore = { application: false, file: false, 'system-command': false };

    try {
      // PERFORMANCE: Progressive loading - show fast results first (apps & system commands)
      // then add file results when they arrive
      const [appsData, systemCmdsData] = await Promise.all([
        window.electronAPI.launcher.searchApps(query, this.pageSize, 0),
        window.electronAPI.launcher.searchSystemCommands(query, this.pageSize, 0),
      ]);

      // Only render if this is still the latest search
      if (currentSearchId !== this.searchId) {
        return;
      }

      const appsResults = appsData.results || [];
      const systemCmdsResults = systemCmdsData.results || [];

      this.offsets.application = appsResults.length;
      this.offsets['system-command'] = systemCmdsResults.length;
      this.hasMore.application = appsData.hasMore || false;
      this.hasMore['system-command'] = systemCmdsData.hasMore || false;

      // Show apps and system commands immediately
      const fastResults = [
        ...appsResults.map((app) => ({ ...app, type: 'application' })),
        ...systemCmdsResults.map((cmd) => ({ ...cmd, type: 'system-command' })),
      ];

      this.renderResults(fastResults);

      // Fetch file results in background (only if query is long enough)
      if (query.length >= 2) {
        const filesData = await window.electronAPI.launcher.searchFiles(query, this.pageSize, 0);

        // Only append if this is still the latest search
        if (currentSearchId !== this.searchId) {
          return;
        }

        const filesResults = filesData.results || [];
        this.offsets.file = filesResults.length;
        this.hasMore.file = filesData.hasMore || false;

        if (filesResults.length > 0) {
          // Append file results to existing results
          const fileResultsMapped = filesResults.map((file) => ({ ...file, type: 'file' }));
          this.allResults = [...this.allResults, ...fileResultsMapped];
          this.applyFilters();
        }
      }
    } catch (err) {
      // Only show error if this is still the latest search
      if (currentSearchId !== this.searchId) {
        return;
      }
      this.renderError();
    }
  }

  // PERFORMANCE: LRU cache management
  addToSearchCache(query, results) {
    // If cache is full, remove oldest entry (FIFO/LRU)
    if (this.searchCache.size >= this.searchCacheMaxSize) {
      const firstKey = this.searchCache.keys().next().value;
      this.searchCache.delete(firstKey);
    }
    this.searchCache.set(query, results);
  }

  renderResults(results) {
    // Store all results before filtering
    this.allResults = results;
    this.isShowingFavorites = false;

    // Apply filters
    this.applyFilters();
  }

  renderError() {
    this.resultsContainer.innerHTML = `
      <div class="launcher-no-results">Search error occurred</div>
    `;
  }

  getTypeLabel(type) {
    const labels = {
      application: 'App',
      file: 'File',
      'system-command': 'System',
    };
    return labels[type] || type;
  }

  handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        e.preventDefault();
        this.executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        this.clearSearch();
        break;
    }
  }

  moveSelection(delta) {
    if (!this.results.length) return;

    // Handle initial focus when selectedIndex is -1 (no selection)
    if (this.selectedIndex === -1) {
      // Down arrow: select first item, Up arrow: select last item
      this.selectedIndex = delta > 0 ? 0 : this.results.length - 1;
    } else {
      this.selectedIndex = Math.max(
        0,
        Math.min(this.results.length - 1, this.selectedIndex + delta)
      );
    }
    this.updateSelectionUI();
  }

  updateSelectionUI() {
    this.resultsContainer.querySelectorAll('.launcher-result-item').forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  executeSelected() {
    if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
      this.executeResult(this.results[this.selectedIndex]);
    }
  }

  async executeResult(result) {
    try {
      switch (result.type) {
        case 'application':
          await window.electronAPI.launcher.launchApp(result.path);
          break;
        case 'file':
          await window.electronAPI.launcher.openFile(result.path);
          break;
        case 'system-command':
          // Commands that require confirmation
          const dangerousCommands = ['sleep', 'restart', 'shutdown', 'empty-trash', 'lock'];

          if (dangerousCommands.includes(result.id)) {
            const confirmed = await this.showConfirmation(result);
            if (!confirmed) return;
          }

          await window.electronAPI.launcher.executeSystemCommand(result.id);
          break;
      }
    } catch (err) {}
  }

  showConfirmation(result) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirmationOverlay');
      const icon = document.getElementById('confirmationIcon');
      const titleText = document.getElementById('confirmationTitleText');
      const message = document.getElementById('confirmationMessage');
      const confirmBtn = document.getElementById('confirmationConfirm');
      const cancelBtn = document.getElementById('confirmationCancel');

      // Set content based on command
      const messages = {
        sleep: {
          icon: '🌙',
          title: 'Sleep Computer',
          message: 'Your computer will go to sleep. Continue?',
        },
        restart: {
          icon: '🔄',
          title: 'Restart Computer',
          message: 'Your computer will restart. Make sure to save your work. Continue?',
        },
        shutdown: {
          icon: '⚡',
          title: 'Shutdown Computer',
          message: 'Your computer will shut down. Make sure to save your work. Continue?',
        },
        'empty-trash': {
          icon: '🗑️',
          title: 'Empty Trash',
          message:
            'All items in the trash will be permanently deleted. This cannot be undone. Continue?',
        },
        lock: {
          icon: '🔒',
          title: 'Lock Screen',
          message: 'Your screen will be locked. Continue?',
        },
      };

      const config = messages[result.id] || {
        icon: '⚠️',
        title: 'Confirm Action',
        message: 'Are you sure you want to proceed?',
      };

      icon.textContent = config.icon;
      titleText.textContent = config.title;
      message.textContent = config.message;

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

  clearSearch() {
    this.searchInput.value = '';
    this.clearResults();
  }

  clearResults() {
    this.results = [];
    this.allResults = [];
    this.selectedIndex = 0;
    this.resultsContainer.innerHTML = '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderIcon(icon, type) {
    if (!icon) {
      return this.escapeHtml('📄');
    }

    // If it's a base64 data URL (for app icons), render as img
    if (icon.startsWith('data:image/')) {
      return `<img src="${icon}" alt="App icon" class="launcher-app-icon" loading="lazy" />`;
    }

    // If it's an SVG string (for files and system commands), render directly
    if (icon.startsWith('<svg')) {
      return `<span class="launcher-svg-icon">${icon}</span>`;
    }

    // Otherwise, render as emoji/text
    return this.escapeHtml(icon);
  }

  toggleFilterMenu() {
    if (!this.filterMenu) return;

    if (this.filterMenu.style.display === 'block') {
      this.hideFilterMenu();
    } else {
      this.showFilterMenu();
    }
  }

  showFilterMenu() {
    if (!this.filterMenu) return;
    this.filterMenu.style.display = 'block';
  }

  hideFilterMenu() {
    if (!this.filterMenu) return;
    this.filterMenu.style.display = 'none';
  }

  toggleFilter(filterType) {
    if (!filterType) return;

    if (this.activeFilters.has(filterType)) {
      this.activeFilters.delete(filterType);
    } else {
      this.activeFilters.add(filterType);
    }

    // Update UI
    this.updateFilterUI();

    // Update filter button state
    this.updateFilterButtonState();

    // Re-render results with new filters
    this.applyFilters();
  }

  updateFilterUI() {
    if (!this.filterMenu) return;

    const filterItems = this.filterMenu.querySelectorAll('.filter-menu-item');
    filterItems.forEach((item) => {
      const filterType = item.dataset.filter;
      if (this.activeFilters.has(filterType)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  updateFilterButtonState() {
    if (!this.filterBtn) return;

    // If not all filters are active, highlight the filter button
    if (this.activeFilters.size < 3) {
      this.filterBtn.classList.add('active');
    } else {
      this.filterBtn.classList.remove('active');
    }
  }

  applyFilters(isAppending = false) {
    const filteredResults = this.allResults.filter((result) => this.activeFilters.has(result.type));
    const previousResultsLength = this.results.length;
    this.results = filteredResults;

    if (!isAppending || previousResultsLength === 0) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = Math.min(this.selectedIndex, this.results.length - 1);
    }

    requestAnimationFrame(() => {
      if (!filteredResults.length) {
        this.resultsContainer.innerHTML = `
          <div class="launcher-no-results" data-i18n="launcher.noResults">No results found</div>
        `;
        return;
      }

      if (isAppending && previousResultsLength > 0) {
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');

        for (let index = previousResultsLength; index < filteredResults.length; index++) {
          const result = filteredResults[index];
          const isFavorite = this.isFavorite(result);
          tempDiv.innerHTML = `
          <div class="launcher-result-item" data-index="${index}">
            <span class="launcher-result-icon">${this.renderIcon(result.icon, result.type)}</span>
            <div class="launcher-result-content">
              <div class="launcher-result-title">${this.escapeHtml(result.name || result.title)}</div>
              ${result.path ? `<div class="launcher-result-subtitle">${this.escapeHtml(result.path)}</div>` : ''}
            </div>
            <span class="launcher-result-type">${this.getTypeLabel(result.type)}</span>
            <button class="launcher-favorite-btn" data-index="${index}" aria-label="Toggle favorite">
              <svg class="launcher-star-icon ${isFavorite ? 'favorited' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
        `;
          fragment.appendChild(tempDiv.firstElementChild);
        }

        this.resultsContainer.appendChild(fragment);
      } else {
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');

        filteredResults.forEach((result, index) => {
          const isFavorite = this.isFavorite(result);
          tempDiv.innerHTML = `
          <div class="launcher-result-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
            <span class="launcher-result-icon">${this.renderIcon(result.icon, result.type)}</span>
            <div class="launcher-result-content">
              <div class="launcher-result-title">${this.escapeHtml(result.name || result.title)}</div>
              ${result.path ? `<div class="launcher-result-subtitle">${this.escapeHtml(result.path)}</div>` : ''}
            </div>
            <span class="launcher-result-type">${this.getTypeLabel(result.type)}</span>
            <button class="launcher-favorite-btn" data-index="${index}" aria-label="Toggle favorite">
              <svg class="launcher-star-icon ${isFavorite ? 'favorited' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
        `;
          fragment.appendChild(tempDiv.firstElementChild);
        });

        this.resultsContainer.innerHTML = '';
        this.resultsContainer.appendChild(fragment);
      }
    });
  }

  handleScroll() {
    if (this.isLoadingMore || !this.currentQuery) return;

    const container = this.resultsContainer;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Check if near bottom (within 100px)
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      this.loadMore();
    }
  }

  async loadMore() {
    if (this.isLoadingMore || !this.currentQuery) return;

    // Check if there's more data to load for any active filter
    const hasMoreToLoad = Array.from(this.activeFilters).some((type) => this.hasMore[type]);
    if (!hasMoreToLoad) return;

    this.isLoadingMore = true;
    this.showLoadingIndicator();

    // Track this loadMore request to prevent race conditions
    const currentLoadMoreId = ++this.loadMoreId;
    const querySnapshot = this.currentQuery;

    try {
      // Load more from each source that has more data
      const promises = [];
      const types = [];

      if (this.activeFilters.has('application') && this.hasMore.application) {
        promises.push(
          window.electronAPI.launcher.searchApps(
            this.currentQuery,
            this.pageSize,
            this.offsets.application
          )
        );
        types.push('application');
      }

      if (this.activeFilters.has('file') && this.hasMore.file) {
        promises.push(
          window.electronAPI.launcher.searchFiles(
            this.currentQuery,
            this.pageSize,
            this.offsets.file
          )
        );
        types.push('file');
      }

      if (this.activeFilters.has('system-command') && this.hasMore['system-command']) {
        promises.push(
          window.electronAPI.launcher.searchSystemCommands(
            this.currentQuery,
            this.pageSize,
            this.offsets['system-command']
          )
        );
        types.push('system-command');
      }

      const results = await Promise.all(promises);

      // Only process if this is still the latest loadMore request and query hasn't changed
      if (currentLoadMoreId !== this.loadMoreId || querySnapshot !== this.currentQuery) {
        return; // Ignore outdated loadMore results
      }

      // Process results
      const newResults = [];
      results.forEach((data, index) => {
        const type = types[index];
        const items = (data.results || []).map((item) => ({ ...item, type }));
        newResults.push(...items);

        // Update offset based on actual results received
        this.offsets[type] += items.length;
        this.hasMore[type] = data.hasMore || false;
      });

      // Append new results to existing ones
      this.allResults = [...this.allResults, ...newResults];

      // Re-render with new results (use differential update)
      this.applyFilters(true);
    } catch (err) {
    } finally {
      this.isLoadingMore = false;
      this.hideLoadingIndicator();
    }
  }

  showLoadingIndicator() {
    const existingIndicator = document.getElementById('launcher-loading-indicator');
    if (existingIndicator) return;

    const indicator = document.createElement('div');
    indicator.id = 'launcher-loading-indicator';
    indicator.className = 'launcher-loading-indicator';
    indicator.textContent = this.i18n?.launcher?.loading || 'Loading...';
    this.resultsContainer.appendChild(indicator);
  }

  hideLoadingIndicator() {
    const indicator = document.getElementById('launcher-loading-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  loadFavorites() {
    try {
      const saved = localStorage.getItem('irukadark_launcher_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      return [];
    }
  }

  saveFavorites() {
    try {
      localStorage.setItem('irukadark_launcher_favorites', JSON.stringify(this.favorites));
    } catch (err) {}
  }

  getResultKey(result) {
    return `${result.type}:${result.path || result.id || result.name}`;
  }

  isFavorite(result) {
    const key = this.getResultKey(result);
    return this.favoritesSet.has(key);
  }

  toggleFavorite(result) {
    const key = this.getResultKey(result);

    if (this.favoritesSet.has(key)) {
      const index = this.favorites.findIndex((fav) => fav.key === key);
      if (index >= 0) {
        this.favorites.splice(index, 1);
      }
      this.favoritesSet.delete(key);
      this.favoritesMap.delete(key);
    } else {
      const favorite = {
        key,
        type: result.type,
        name: result.name || result.title,
        path: result.path,
        id: result.id,
        icon: result.icon,
        timestamp: Date.now(),
      };
      this.favorites.push(favorite);
      this.favoritesSet.add(key);
      this.favoritesMap.set(key, favorite);
    }

    this.saveFavorites();

    // Update UI
    const btn = this.resultsContainer.querySelector(
      `.launcher-favorite-btn[data-index="${this.results.indexOf(result)}"]`
    );
    if (btn) {
      const icon = btn.querySelector('.launcher-star-icon');
      if (icon) {
        icon.classList.toggle('favorited');
      }
    }

    if (!this.searchInput.value.trim()) {
      this.showFavorites();
    }
  }

  handleFavoriteMouseDown(e, index) {
    if (!this.isShowingFavorites) return;
    if (e.target.closest('.launcher-favorite-btn')) return;

    const element = e.target.closest('.launcher-result-item');
    if (!element) return;

    this.drag.element = element;
    this.drag.index = index;
    this.drag.startX = e.clientX;
    this.drag.startY = e.clientY;
    this.drag.isActive = false;

    e.preventDefault();
  }

  handleFavoriteMouseMove(e) {
    if (!this.drag.element) return;

    if (!this.drag.isActive) {
      const dx = Math.abs(e.clientX - this.drag.startX);
      const dy = Math.abs(e.clientY - this.drag.startY);
      if (dx < this.drag.threshold && dy < this.drag.threshold) {
        return;
      }
      this.drag.isActive = true;
      this.drag.element.classList.add('dragging');
    }

    const target = this.findDropTarget(e.clientY);
    if (target && target.element !== this.drag.element) {
      this.drag.target = target.element;
      this.drag.dropType = this.determineFavoriteDropType(target.element, e.clientY);
      this.showFavoriteInsertionLine(target.element, this.drag.dropType);
    } else {
      this.hideFavoriteInsertionLine();
      this.drag.target = null;
      this.drag.dropType = null;
    }
  }

  handleFavoriteMouseUp() {
    if (!this.drag.element) return;

    if (this.drag.isActive && this.drag.target && this.drag.dropType) {
      const targetIndex = parseInt(this.drag.target.dataset.index);
      this.reorderFavorites(this.drag.index, targetIndex, this.drag.dropType);
    }

    this.drag.element.classList.remove('dragging');
    this.hideFavoriteInsertionLine();
    this.drag = this.createInitialDragState();
  }

  findDropTarget(mouseY) {
    const items = this.resultsContainer.querySelectorAll('.launcher-result-item');
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        return { element: item };
      }
    }
    return null;
  }

  determineFavoriteDropType(element, mouseY) {
    const rect = element.getBoundingClientRect();
    const relativeY = mouseY - rect.top;
    return relativeY < rect.height * 0.5 ? 'insert-before' : 'insert-after';
  }

  showFavoriteInsertionLine(element, dropType) {
    this.hideFavoriteInsertionLine();

    const line = document.createElement('div');
    line.className = 'launcher-insertion-line';

    const elementRect = element.getBoundingClientRect();
    const containerRect = this.resultsContainer.getBoundingClientRect();
    const scrollTop = this.resultsContainer.scrollTop;

    let topPosition;
    if (dropType === 'insert-before') {
      topPosition = elementRect.top - containerRect.top + scrollTop - 1;
    } else {
      topPosition = elementRect.bottom - containerRect.top + scrollTop - 1;
    }

    line.style.top = `${topPosition}px`;
    this.resultsContainer.appendChild(line);
    this.currentInsertionLine = line;
  }

  hideFavoriteInsertionLine() {
    if (this.currentInsertionLine) {
      this.currentInsertionLine.remove();
      this.currentInsertionLine = null;
    }
  }

  reorderFavorites(draggedIndex, targetIndex, dropType) {
    if (draggedIndex === targetIndex) return;

    const [removed] = this.favorites.splice(draggedIndex, 1);
    let newTargetIndex = targetIndex;
    if (draggedIndex < targetIndex) newTargetIndex -= 1;
    if (dropType === 'insert-after') newTargetIndex += 1;

    this.favorites.splice(newTargetIndex, 0, removed);
    this.saveFavorites();
    this.rebuildFavoritesIndex();
    this.showFavorites();
  }

  showFavorites() {
    this.isShowingFavorites = true;

    if (!this.favorites.length) {
      this.resultsContainer.innerHTML = '';
      this.results = [];
      this.allResults = [];
      return;
    }

    this.results = this.favorites.map((fav) => ({
      type: fav.type,
      name: fav.name,
      path: fav.path,
      id: fav.id,
      icon: fav.icon,
    }));
    this.allResults = [...this.results];
    this.selectedIndex = -1; // No initial focus for favorites

    requestAnimationFrame(() => {
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');

      this.results.forEach((result, index) => {
        tempDiv.innerHTML = `
        <div class="launcher-result-item" data-index="${index}">
          <span class="launcher-result-icon">${this.renderIcon(result.icon, result.type)}</span>
          <div class="launcher-result-content">
            <div class="launcher-result-title">${this.escapeHtml(result.name)}</div>
            ${result.path ? `<div class="launcher-result-subtitle">${this.escapeHtml(result.path)}</div>` : ''}
          </div>
          <span class="launcher-result-type">${this.getTypeLabel(result.type)}</span>
          <button class="launcher-favorite-btn" data-index="${index}" aria-label="Remove favorite">
            <svg class="launcher-star-icon favorited" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        </div>
      `;
        const item = tempDiv.firstElementChild;
        item.addEventListener('mousedown', (e) => this.handleFavoriteMouseDown(e, index));
        fragment.appendChild(item);
      });

      this.resultsContainer.innerHTML = '';
      this.resultsContainer.appendChild(fragment);
    });
  }
}

// Export for use in index.html
if (typeof window !== 'undefined') {
  window.LauncherUI = LauncherUI;
}
