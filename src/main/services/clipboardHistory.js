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

    // Track programmatically set clipboard content to avoid re-adding to history
    this.lastProgrammaticText = null;
    this.lastProgrammaticImageHash = null;
    this.programmaticSetTime = 0;

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

        // Check if this was programmatically set (within last 3 seconds)
        const timeSinceLastProgrammatic = Date.now() - this.programmaticSetTime;
        const isProgrammaticChange =
          timeSinceLastProgrammatic < 3000 &&
          ((hasText &&
            this.lastProgrammaticText !== null &&
            currentText === this.lastProgrammaticText) ||
            (hasImage &&
              this.lastProgrammaticImageHash !== null &&
              imageHash === this.lastProgrammaticImageHash));

        if (isProgrammaticChange) {
          // Skip adding to history, but update last known state
          this.lastClipboard = hasText ? currentText : '';
          this.lastImageHash = hasImage ? imageHash : '';
          // Clear programmatic tracking after first detection
          this.lastProgrammaticText = null;
          this.lastProgrammaticImageHash = null;
          this.programmaticSetTime = 0;
          return;
        }

        // Check if clipboard content has changed
        const textChanged = hasText && currentText !== this.lastClipboard;
        const imageChanged = hasImage && imageHash !== this.lastImageHash;

        if (textChanged || imageChanged) {
          // Check if this content already exists in history (to prevent re-adding)
          const alreadyInHistory = this.history.some((item) => {
            if (hasText && item.text === currentText) {
              // If only text changed and it matches an existing item
              if (!hasImage) return true;
              // If both text and image, check image too
              if (hasImage && item.imageData) {
                const existingImageHash = crypto
                  .createHash('md5')
                  .update(item.imageData)
                  .digest('hex');
                return existingImageHash === imageHash;
              }
            }
            if (hasImage && !hasText && item.imageData) {
              const existingImageHash = crypto
                .createHash('md5')
                .update(item.imageData)
                .digest('hex');
              return existingImageHash === imageHash;
            }
            return false;
          });

          if (!alreadyInHistory) {
            // Add both text and image to history as a single item
            this.addToHistory(
              {
                text: hasText ? currentText : null,
                imageData: hasImage ? imageDataUrl : null,
              },
              'auto',
              { skipIfDuplicate: true }
            );
          }

          // Update last known state regardless
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

  addToHistory(content, type = 'auto', options = {}) {
    if (!content) return;

    const { skipIfDuplicate = false } = options;
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

      // Check for duplicates
      const duplicateIndex = this.history.findIndex((item) => {
        // Check for exact match
        if (text && item.text === text && imageData && item.imageData === imageData) {
          return true; // Duplicate with both
        }
        if (!imageData && text && item.text === text && !item.imageData) {
          return true; // Duplicate text-only
        }
        if (!text && imageData && item.imageData === imageData && !item.text) {
          return true; // Duplicate image-only
        }
        return false;
      });

      if (duplicateIndex !== -1) {
        if (skipIfDuplicate) {
          // Skip adding if duplicate exists
          return;
        } else {
          // Remove duplicate (will be re-added at the top)
          this.history.splice(duplicateIndex, 1);
        }
      }

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

      const duplicateIndex = this.history.findIndex(
        (item) => item.imageData === imageDataUrl && !item.text
      );

      if (duplicateIndex !== -1) {
        if (skipIfDuplicate) {
          return;
        } else {
          this.history.splice(duplicateIndex, 1);
        }
      }

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

      const duplicateIndex = this.history.findIndex(
        (item) => item.text === data && !item.imageData
      );

      if (duplicateIndex !== -1) {
        if (skipIfDuplicate) {
          return;
        } else {
          this.history.splice(duplicateIndex, 1);
        }
      }

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
        // Track programmatic change
        this.lastProgrammaticText = item;
        this.lastProgrammaticImageHash = null;
        this.programmaticSetTime = Date.now();
      } else if (item.text && item.imageData) {
        // Both text and image - write both to clipboard
        const image = nativeImage.createFromDataURL(item.imageData);
        clipboard.write({
          text: item.text,
          image,
        });
        this.lastClipboard = item.text;
        const imageHash = crypto.createHash('md5').update(item.imageData).digest('hex');
        this.lastImageHash = imageHash;
        // Track programmatic change
        this.lastProgrammaticText = item.text;
        this.lastProgrammaticImageHash = imageHash;
        this.programmaticSetTime = Date.now();
      } else if (item.text) {
        // Text only
        clipboard.writeText(item.text);
        this.lastClipboard = item.text;
        this.lastImageHash = '';
        // Track programmatic change
        this.lastProgrammaticText = item.text;
        this.lastProgrammaticImageHash = null;
        this.programmaticSetTime = Date.now();
      } else if (item.imageData) {
        // Image only
        const image = nativeImage.createFromDataURL(item.imageData);
        clipboard.writeImage(image);
        const imageHash = crypto.createHash('md5').update(item.imageData).digest('hex');
        this.lastImageHash = imageHash;
        this.lastClipboard = '';
        // Track programmatic change
        this.lastProgrammaticText = null;
        this.lastProgrammaticImageHash = imageHash;
        this.programmaticSetTime = Date.now();
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
