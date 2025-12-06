/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */

const ICONS = {
  COPY: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  CHECK:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

class RephrasePopup {
  constructor() {
    this.popup = document.getElementById('popup');
    this.resultText = document.getElementById('resultText');
    this.errorText = document.getElementById('errorText');
    this.copyBtn = document.getElementById('copyBtn');
    this.closeBtn = document.getElementById('closeBtn');
    this.currentText = '';
    this.isCopying = false;
    this.init();
  }

  async init() {
    await this.applyTheme();
    this.setupListeners();
    this.setupIPC();
  }

  async applyTheme() {
    try {
      const theme = await window.electronAPI.getTheme();
      document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    } catch {
      // Default to dark theme
    }
  }

  setupListeners() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.copyBtn.addEventListener('click', () => this.copyResult());
    this.resultText.addEventListener('click', () => this.copyResult());
  }

  setupIPC() {
    window.electronAPI.onRephraseLoading(() => this.showLoading());
    window.electronAPI.onRephraseResult((text) => this.showResult(text));
    window.electronAPI.onRephraseError((message) => this.showError(message));
  }

  showLoading() {
    this.popup.className = 'rephrase-popup state-loading';
  }

  showResult(text) {
    this.currentText = text;
    this.resultText.textContent = text;
    this.popup.className = 'rephrase-popup state-result';
  }

  showError(message) {
    this.errorText.textContent = message;
    this.popup.className = 'rephrase-popup state-error';
  }

  async copyResult() {
    if (!this.currentText || this.isCopying) return;
    this.isCopying = true;

    try {
      await window.electronAPI.copyToClipboard(this.currentText);

      // Update copy button icon
      const icon = this.copyBtn.querySelector('svg');
      if (icon) icon.outerHTML = ICONS.CHECK;
      this.copyBtn.classList.add('copied');

      // Add green background to result text
      this.resultText.classList.add('copied');

      setTimeout(() => {
        const icon = this.copyBtn.querySelector('svg');
        if (icon) icon.outerHTML = ICONS.COPY;
        this.copyBtn.classList.remove('copied');
        this.resultText.classList.remove('copied');
        this.isCopying = false;
      }, 500);
    } catch {
      this.isCopying = false;
    }
  }

  close() {
    window.electronAPI.closePopup();
  }
}

document.addEventListener('DOMContentLoaded', () => new RephrasePopup());
