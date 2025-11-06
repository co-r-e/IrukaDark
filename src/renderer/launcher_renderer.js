/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */

class LauncherUI {
  constructor() {
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
    this.init();
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

    // Focus search input when launcher tab is opened
    this.searchInput.focus();
  }

  handleSearch(e) {
    const query = e.target.value.trim();

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!query) {
      this.clearResults();
      return;
    }

    // Debounce search
    this.searchTimeout = setTimeout(async () => {
      await this.performSearch(query);
    }, 150);
  }

  async performSearch(query) {
    // Increment search ID to track this search request
    const currentSearchId = ++this.searchId;

    try {
      // Search all sources in parallel
      const [apps, files, systemCmds] = await Promise.all([
        window.electronAPI.launcher.searchApps(query),
        window.electronAPI.launcher.searchFiles(query),
        window.electronAPI.launcher.searchSystemCommands(query),
      ]);

      // Only render if this is still the latest search
      if (currentSearchId !== this.searchId) {
        return; // Ignore outdated search results
      }

      // Combine and sort results
      const allResults = [
        ...apps.map((app) => ({ ...app, type: 'application' })),
        ...systemCmds.map((cmd) => ({ ...cmd, type: 'system-command' })),
        ...files.map((file) => ({ ...file, type: 'file' })),
      ];

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
          this.clearSearch();
          break;
        case 'file':
          await window.electronAPI.launcher.openFile(result.path);
          this.clearSearch();
          break;
        case 'system-command':
          // Commands that require confirmation
          const dangerousCommands = ['sleep', 'restart', 'shutdown', 'empty-trash', 'lock'];

          if (dangerousCommands.includes(result.id)) {
            const confirmed = await this.showConfirmation(result);
            if (!confirmed) return;
          }

          await window.electronAPI.launcher.executeSystemCommand(result.id);
          this.clearSearch();
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

  applyFilters() {
    // Filter results based on active filters
    const filteredResults = this.allResults.filter((result) => this.activeFilters.has(result.type));

    this.results = filteredResults;
    this.selectedIndex = 0;

    if (!filteredResults.length) {
      this.resultsContainer.innerHTML = `
        <div class="launcher-no-results" data-i18n="launcher.noResults">No results found</div>
      `;
      return;
    }

    const html = filteredResults
      .map(
        (result, index) => `
      <div class="launcher-result-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
        <span class="launcher-result-icon">${this.renderIcon(result.icon, result.type)}</span>
        <div class="launcher-result-content">
          <div class="launcher-result-title">${this.escapeHtml(result.name || result.title)}</div>
          ${result.path ? `<div class="launcher-result-subtitle">${this.escapeHtml(result.path)}</div>` : ''}
        </div>
        <span class="launcher-result-type">${this.getTypeLabel(result.type)}</span>
      </div>
    `
      )
      .join('');

    this.resultsContainer.innerHTML = html;

    // Add click events
    this.resultsContainer.querySelectorAll('.launcher-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.executeResult(this.results[index]);
      });
    });
  }
}

// Export for use in index.html
if (typeof window !== 'undefined') {
  window.LauncherUI = LauncherUI;
}
