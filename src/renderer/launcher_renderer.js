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
    this.activeFilters = new Set(['application', 'file', 'system-command']); // All active by default

    // PERFORMANCE: Favorites optimization
    this.favorites = this.loadFavorites();
    this.favoritesSet = new Set(); // O(1) lookup for isFavorite()
    this.favoritesMap = new Map(); // O(1) lookup for favorite data
    this.rebuildFavoritesIndex();

    // PERFORMANCE: Search cache (LRU)
    this.searchCache = new Map();
    this.searchCacheMaxSize = 50;
    this.searchCacheKeys = []; // Track insertion order for LRU

    // PERFORMANCE: Rendered items tracking for diff updates
    this.renderedResultIds = new Set();

    // Infinite scroll state
    this.currentQuery = '';
    this.pageSize = 20;
    this.offsets = { application: 0, file: 0, 'system-command': 0 };
    this.hasMore = { application: false, file: false, 'system-command': false };
    this.isLoadingMore = false;
    this.loadMoreId = 0; // Track loadMore requests to prevent race conditions

    this.init();
  }

  // PERFORMANCE: Build Set and Map from favorites array for O(1) lookup
  rebuildFavoritesIndex() {
    this.favoritesSet.clear();
    this.favoritesMap.clear();
    this.favorites.forEach((fav) => {
      this.favoritesSet.add(fav.key);
      this.favoritesMap.set(fav.key, fav);
    });
  }

  init() {
    if (!this.searchInput || !this.resultsContainer) {
      console.error('Launcher UI elements not found');
      return;
    }

    this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
    this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Filter button click
    if (this.filterBtn) {
      this.filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFilterMenu();
      });
    }

    // Filter menu items
    if (this.filterMenu) {
      const filterItems = this.filterMenu.querySelectorAll('.filter-menu-item');
      filterItems.forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFilter(item.dataset.filter);
        });
      });
    }

    // Close filter menu when clicking outside
    document.addEventListener('click', (e) => {
      if (
        this.filterMenu &&
        this.filterMenu.style.display === 'block' &&
        !this.filterMenu.contains(e.target) &&
        e.target !== this.filterBtn
      ) {
        this.hideFilterMenu();
      }
    });

    // PERFORMANCE: Event delegation for result items
    if (this.resultsContainer) {
      this.resultsContainer.addEventListener('click', (e) => {
        this.handleResultsClick(e);
      });

      // Infinite scroll listener
      this.resultsContainer.addEventListener('scroll', () => {
        this.handleScroll();
      });
    }

    // Focus search input when launcher tab is opened
    this.searchInput.focus();

    // Show favorites if search is empty on init
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
      this.showFavorites();
      return;
    }

    // PERFORMANCE: Increased debounce from 150ms to 300ms (reduces search frequency by 50%)
    this.searchTimeout = setTimeout(async () => {
      await this.performSearch(query);
    }, 300);
  }

  async performSearch(query) {
    // Increment search ID to track this search request
    const currentSearchId = ++this.searchId;

    // Reset pagination state for new search
    this.currentQuery = query;
    this.offsets = { application: 0, file: 0, 'system-command': 0 };
    this.hasMore = { application: false, file: false, 'system-command': false };

    // PERFORMANCE: Check cache first (LRU cache) - cache disabled for pagination
    // TODO: Implement pagination-aware cache
    // if (this.searchCache.has(query)) {
    //   const cachedResults = this.searchCache.get(query);
    //   this.searchCache.delete(query);
    //   this.searchCache.set(query, cachedResults);
    //   this.renderResults(cachedResults);
    //   return;
    // }

    try {
      // Search all sources in parallel with pagination
      const [appsData, filesData, systemCmdsData] = await Promise.all([
        window.electronAPI.launcher.searchApps(query, this.pageSize, 0),
        window.electronAPI.launcher.searchFiles(query, this.pageSize, 0),
        window.electronAPI.launcher.searchSystemCommands(query, this.pageSize, 0),
      ]);

      // Only render if this is still the latest search
      if (currentSearchId !== this.searchId) {
        return; // Ignore outdated search results
      }

      // Update offsets and hasMore flags based on actual results received
      const appsResults = appsData.results || [];
      const filesResults = filesData.results || [];
      const systemCmdsResults = systemCmdsData.results || [];

      this.offsets.application = appsResults.length;
      this.offsets.file = filesResults.length;
      this.offsets['system-command'] = systemCmdsResults.length;
      this.hasMore.application = appsData.hasMore || false;
      this.hasMore.file = filesData.hasMore || false;
      this.hasMore['system-command'] = systemCmdsData.hasMore || false;

      // Combine and sort results
      const allResults = [
        ...appsResults.map((app) => ({ ...app, type: 'application' })),
        ...systemCmdsResults.map((cmd) => ({ ...cmd, type: 'system-command' })),
        ...filesResults.map((file) => ({ ...file, type: 'file' })),
      ];

      // PERFORMANCE: Cache disabled for pagination
      // this.addToSearchCache(query, allResults);

      this.renderResults(allResults);
    } catch (err) {
      // Only show error if this is still the latest search
      if (currentSearchId !== this.searchId) {
        return;
      }
      console.error('Search error:', err);
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

    this.selectedIndex = Math.max(0, Math.min(this.results.length - 1, this.selectedIndex + delta));
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
    if (this.results[this.selectedIndex]) {
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
    } catch (err) {
      console.error('Execute error:', err);
    }
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

  // PERFORMANCE: Use RequestAnimationFrame for smooth rendering
  applyFilters(isAppending = false) {
    // Filter results based on active filters
    const filteredResults = this.allResults.filter((result) => this.activeFilters.has(result.type));

    const previousResultsLength = this.results.length;
    this.results = filteredResults;

    // Only reset selectedIndex when not appending or when starting fresh
    if (!isAppending || previousResultsLength === 0) {
      this.selectedIndex = 0;
    } else {
      // Clamp selectedIndex to valid range when appending
      this.selectedIndex = Math.min(this.selectedIndex, this.results.length - 1);
    }

    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
      if (!filteredResults.length) {
        this.resultsContainer.innerHTML = `
          <div class="launcher-no-results" data-i18n="launcher.noResults">No results found</div>
        `;
        return;
      }

      // If appending, only render new items
      if (isAppending && previousResultsLength > 0) {
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');

        // Only render new items starting from previousResultsLength
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

        // Append only new items
        this.resultsContainer.appendChild(fragment);
      } else {
        // Full render for initial load or filter change
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

        // Single DOM update
        this.resultsContainer.innerHTML = '';
        this.resultsContainer.appendChild(fragment);
      }
    });

    // PERFORMANCE: Event listeners removed - handled by event delegation in init()
  }

  // Infinite scroll handler
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

  // Load more results
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
      console.error('Load more error:', err);
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

  // Favorite management methods
  loadFavorites() {
    try {
      const saved = localStorage.getItem('irukadark_launcher_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.error('Error loading favorites:', err);
      return [];
    }
  }

  saveFavorites() {
    try {
      localStorage.setItem('irukadark_launcher_favorites', JSON.stringify(this.favorites));
    } catch (err) {
      console.error('Error saving favorites:', err);
    }
  }

  getResultKey(result) {
    // Create unique key for each result
    return `${result.type}:${result.path || result.id || result.name}`;
  }

  // PERFORMANCE: O(1) lookup using Set instead of O(n) array search
  isFavorite(result) {
    const key = this.getResultKey(result);
    return this.favoritesSet.has(key);
  }

  toggleFavorite(result) {
    const key = this.getResultKey(result);

    // PERFORMANCE: Use Set for O(1) lookup
    if (this.favoritesSet.has(key)) {
      // Remove from favorites
      const index = this.favorites.findIndex((fav) => fav.key === key);
      if (index >= 0) {
        this.favorites.splice(index, 1);
      }
      this.favoritesSet.delete(key);
      this.favoritesMap.delete(key);
    } else {
      // Add to favorites
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

    // If currently showing favorites, refresh the view
    if (!this.searchInput.value.trim()) {
      this.showFavorites();
    }
  }

  // PERFORMANCE: Use RequestAnimationFrame for smooth rendering
  showFavorites() {
    if (!this.favorites.length) {
      this.resultsContainer.innerHTML = '';
      this.results = [];
      this.allResults = [];
      return;
    }

    // Convert favorites to results format
    this.results = this.favorites.map((fav) => ({
      type: fav.type,
      name: fav.name,
      path: fav.path,
      id: fav.id,
      icon: fav.icon,
    }));
    this.allResults = [...this.results];
    this.selectedIndex = 0;

    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
      // PERFORMANCE: Use Document Fragment for batch DOM updates
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');

      this.results.forEach((result, index) => {
        tempDiv.innerHTML = `
        <div class="launcher-result-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
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
        fragment.appendChild(tempDiv.firstElementChild);
      });

      // Single DOM update
      this.resultsContainer.innerHTML = '';
      this.resultsContainer.appendChild(fragment);
    });

    // PERFORMANCE: Event listeners removed - handled by event delegation in init()
  }
}

// Export for use in index.html
if (typeof window !== 'undefined') {
  window.LauncherUI = LauncherUI;
}
