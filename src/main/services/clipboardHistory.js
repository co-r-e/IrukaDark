/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: MIT. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { clipboard, app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class ClipboardHistoryService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxItems = options.maxItems || 30;
    this.history = [];
    this.lastClipboard = '';
    this.monitoringInterval = null;
    this.pollInterval = options.pollInterval || 1000; // Check every second
    this.saveTimeout = null;
    this.historyFilePath = path.join(app.getPath('userData'), 'clipboard-history.json');

    // Load history from file on initialization
    this.loadHistoryFromFile();
  }

  startMonitoring() {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.monitoringInterval = setInterval(() => {
      try {
        const currentText = clipboard.readText();
        if (currentText && currentText !== this.lastClipboard) {
          this.addToHistory(currentText, 'text');
          this.lastClipboard = currentText;
        }
      } catch (err) {
        console.error('Error reading clipboard:', err);
      }
    }, this.pollInterval);

    // Initialize with current clipboard content
    try {
      const currentText = clipboard.readText();
      if (currentText) {
        this.lastClipboard = currentText;
        this.addToHistory(currentText, 'text');
      }
    } catch {}
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  addToHistory(content, type = 'text') {
    if (!content) return;

    const data = String(content || '').trim();
    if (!data) return;

    // Remove duplicate if exists
    this.history = this.history.filter((item) => item.text !== data);

    // Add to beginning
    this.history.unshift({
      type: 'text',
      text: data,
      timestamp: Date.now(),
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    });

    // Limit history size
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems);
    }

    // Save to file (debounced)
    this.saveHistoryToFile();

    // Emit update event
    this.emit('history-updated', this.getHistory());
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
    // Save to file
    this.saveHistoryToFile();
    // Emit update event
    this.emit('history-updated', this.getHistory());
  }

  copyToClipboard(item) {
    try {
      if (typeof item === 'string') {
        // Legacy support for text strings
        clipboard.writeText(item);
        this.lastClipboard = item;
      } else if (item.type === 'text' && item.text) {
        clipboard.writeText(item.text);
        this.lastClipboard = item.text;
      }
      return true;
    } catch (err) {
      console.error('Error writing to clipboard:', err);
      return false;
    }
  }

  deleteItem(id) {
    this.history = this.history.filter((item) => item.id !== id);
    // Save to file
    this.saveHistoryToFile();
    // Emit update event
    this.emit('history-updated', this.getHistory());
  }

  loadHistoryFromFile() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const data = fs.readFileSync(this.historyFilePath, 'utf8');
        const loaded = JSON.parse(data);
        // Only load text items (filter out images)
        this.history = (loaded || [])
          .filter((item) => item.type === 'text' && item.text)
          .slice(0, this.maxItems);
        console.log(`Loaded ${this.history.length} clipboard items from file`);
      }
    } catch (err) {
      console.error('Error loading clipboard history from file:', err);
      this.history = [];
    }
  }

  saveHistoryToFile() {
    // Debounce: clear previous timeout and set a new one
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        // Only save text items (filter out images)
        const textItems = this.history.filter((item) => item.type === 'text' && item.text);
        const data = JSON.stringify(textItems, null, 2);
        fs.writeFileSync(this.historyFilePath, data, 'utf8');
      } catch (err) {
        console.error('Error saving clipboard history to file:', err);
      }
    }, 1000); // Wait 1 second before saving
  }
}

let instance = null;

function getClipboardHistoryService() {
  if (!instance) {
    instance = new ClipboardHistoryService();
  }
  return instance;
}

module.exports = {
  ClipboardHistoryService,
  getClipboardHistoryService,
};
