/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { clipboard, app, nativeImage } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ClipboardHistoryService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxItems = options.maxItems || 30;
    this.history = [];
    this.lastClipboard = '';
    this.lastImageHash = '';
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
        // Check for both text and image simultaneously
        const currentText = clipboard.readText();
        const currentImage = clipboard.readImage();

        const hasText = currentText && currentText.trim();
        const hasImage = currentImage && !currentImage.isEmpty();

        if (!hasText && !hasImage) {
          return; // Nothing in clipboard
        }

        // Calculate image hash if present
        let imageDataUrl = null;
        let imageHash = '';
        if (hasImage) {
          imageDataUrl = currentImage.toDataURL();
          imageHash = crypto.createHash('md5').update(imageDataUrl).digest('hex');
        }

        // Check if clipboard content has changed
        const textChanged = hasText && currentText !== this.lastClipboard;
        const imageChanged = hasImage && imageHash !== this.lastImageHash;

        if (textChanged || imageChanged) {
          // Add both text and image to history as a single item
          this.addToHistory({
            text: hasText ? currentText : null,
            imageData: hasImage ? imageDataUrl : null,
          });

          // Update last known state
          this.lastClipboard = hasText ? currentText : '';
          this.lastImageHash = hasImage ? imageHash : '';
        }
      } catch (err) {
        console.error('Error reading clipboard:', err);
      }
    }, this.pollInterval);

    // Initialize with current clipboard content
    try {
      const currentText = clipboard.readText();
      const currentImage = clipboard.readImage();

      const hasText = currentText && currentText.trim();
      const hasImage = currentImage && !currentImage.isEmpty();

      if (hasText || hasImage) {
        let imageDataUrl = null;
        let imageHash = '';
        if (hasImage) {
          imageDataUrl = currentImage.toDataURL();
          imageHash = crypto.createHash('md5').update(imageDataUrl).digest('hex');
        }

        this.addToHistory({
          text: hasText ? currentText : null,
          imageData: hasImage ? imageDataUrl : null,
        });

        this.lastClipboard = hasText ? currentText : '';
        this.lastImageHash = hasImage ? imageHash : '';
      }
    } catch {}
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  addToHistory(content, type = 'auto') {
    if (!content) return;

    let item;

    // Handle new format: { text, imageData }
    if (typeof content === 'object' && content.constructor === Object) {
      const { text, imageData } = content;

      if (!text && !imageData) return;

      // Determine type based on what's present
      let itemType = 'text';
      if (imageData && text) {
        itemType = 'mixed';
      } else if (imageData) {
        itemType = 'image';
      }

      // Remove duplicate if exists
      this.history = this.history.filter((item) => {
        // Check for exact match
        if (text && item.text === text && imageData && item.imageData === imageData) {
          return false; // Remove duplicate with both
        }
        if (!imageData && text && item.text === text && !item.imageData) {
          return false; // Remove duplicate text-only
        }
        if (!text && imageData && item.imageData === imageData && !item.text) {
          return false; // Remove duplicate image-only
        }
        return true;
      });

      item = {
        type: itemType,
        text: text || null,
        imageData: imageData || null,
        timestamp: Date.now(),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
    } else if (type === 'image') {
      // Legacy support: content is a data URL string
      const imageDataUrl = content;

      this.history = this.history.filter((item) => item.imageData !== imageDataUrl || item.text);

      item = {
        type: 'image',
        text: null,
        imageData: imageDataUrl,
        timestamp: Date.now(),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
    } else {
      // Legacy support: content is a text string
      const data = String(content || '').trim();
      if (!data) return;

      this.history = this.history.filter((item) => item.text !== data || item.imageData);

      item = {
        type: 'text',
        text: data,
        imageData: null,
        timestamp: Date.now(),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
    }

    // Add to beginning
    this.history.unshift(item);

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
        this.lastImageHash = '';
      } else if (item.text && item.imageData) {
        // Both text and image - write both to clipboard
        const image = nativeImage.createFromDataURL(item.imageData);
        clipboard.write({
          text: item.text,
          image,
        });
        this.lastClipboard = item.text;
        this.lastImageHash = crypto.createHash('md5').update(item.imageData).digest('hex');
      } else if (item.text) {
        // Text only
        clipboard.writeText(item.text);
        this.lastClipboard = item.text;
        this.lastImageHash = '';
      } else if (item.imageData) {
        // Image only
        const image = nativeImage.createFromDataURL(item.imageData);
        clipboard.writeImage(image);
        this.lastImageHash = crypto.createHash('md5').update(item.imageData).digest('hex');
        this.lastClipboard = '';
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
        // Load items with text and/or image
        this.history = (loaded || [])
          .filter((item) => {
            // Valid if it has text, image, or both
            return item.text || item.imageData;
          })
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
        // Save both text and image items
        const data = JSON.stringify(this.history, null, 2);
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
