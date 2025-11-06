/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */

class LauncherUI {
  constructor() {
    this.searchInput = document.getElementById('launcherSearchInput');
    this.resultsContainer = document.getElementById('launcherResults');
    this.selectedIndex = 0;
    this.results = [];
    this.searchTimeout = null;
    this.init();
  }

  init() {
    if (!this.searchInput || !this.resultsContainer) {
      console.error('Launcher UI elements not found');
      return;
    }

    this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
    this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));

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
    }, 300);
  }

  async performSearch(query) {
    try {
      // Search all sources in parallel
      const [apps, files, systemCmds] = await Promise.all([
        window.electronAPI.launcher.searchApps(query),
        window.electronAPI.launcher.searchFiles(query),
        window.electronAPI.launcher.searchSystemCommands(query),
      ]);

      // Combine and sort results
      const allResults = [
        ...apps.map((app) => ({ ...app, type: 'application' })),
        ...systemCmds.map((cmd) => ({ ...cmd, type: 'system-command' })),
        ...files.map((file) => ({ ...file, type: 'file' })),
      ];

      this.renderResults(allResults);
    } catch (err) {
      console.error('Search error:', err);
      this.renderError();
    }
  }

  renderResults(results) {
    this.results = results;
    this.selectedIndex = 0;

    if (!results.length) {
      this.resultsContainer.innerHTML = `
        <div class="launcher-no-results" data-i18n="launcher.noResults">No results found</div>
      `;
      return;
    }

    const html = results
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
          await window.electronAPI.launcher.executeSystemCommand(result.id);
          this.clearSearch();
          break;
      }
    } catch (err) {
      console.error('Execute error:', err);
    }
  }

  clearSearch() {
    this.searchInput.value = '';
    this.clearResults();
  }

  clearResults() {
    this.results = [];
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
}

// Export for use in index.html
if (typeof window !== 'undefined') {
  window.LauncherUI = LauncherUI;
}
