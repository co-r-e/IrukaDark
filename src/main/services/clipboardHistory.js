/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { clipboard, app, nativeImage } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

class ClipboardHistoryService extends EventEmitter {
  constructor(options = {}) {
    super();
    // History limits: separate counts for text and image items
    // Mixed items (containing both) count toward both limits
    this.maxTextItems = options.maxTextItems || 1000;
    this.maxImageItems = options.maxImageItems || 30;
    this.history = [];
    this.lastClipboard = '';
    this.lastImageHash = '';
    this.monitoringInterval = null;
    this.isMonitoring = false;
    this.pollInterval = options.pollInterval || 1000; // Check every second
    this.saveTimeout = null;
    this.historyFilePath = path.join(app.getPath('userData'), 'clipboard-history.json');
    this.isSaving = false; // Prevent concurrent saves

    // Track programmatically set clipboard content to avoid re-adding to history
    this.lastProgrammaticText = null;
    this.lastProgrammaticImageHash = null;
    this.programmaticSetTime = 0;

    // Image hash cache to avoid recalculating hashes
    this.imageHashCache = new Map(); // key: imageData, value: hash

    // Thumbnail configuration
    this.thumbnailWidth = 200;
    this.thumbnailHeight = 200;

    // Load history from file on initialization
    this.loadHistoryFromFile();
  }

  // Calculate image hash with caching
  getImageHash(imageDataUrl) {
    if (!imageDataUrl) return '';

    // Check cache first
    if (this.imageHashCache.has(imageDataUrl)) {
      return this.imageHashCache.get(imageDataUrl);
    }

    // Calculate hash
    const hash = crypto.createHash('md5').update(imageDataUrl).digest('hex');

    // Cache the hash (limit cache size to prevent memory issues)
    if (this.imageHashCache.size > 100) {
      const firstKey = this.imageHashCache.keys().next().value;
      this.imageHashCache.delete(firstKey);
    }
    this.imageHashCache.set(imageDataUrl, hash);

    return hash;
  }

  // Create thumbnail from image for better performance
  createThumbnail(image) {
    if (!image || image.isEmpty()) return null;

    const size = image.getSize();

    // If image is already small, use as-is
    if (size.width <= this.thumbnailWidth && size.height <= this.thumbnailHeight) {
      return image.toDataURL();
    }

    // Calculate aspect ratio
    const aspectRatio = size.width / size.height;
    let newWidth, newHeight;

    if (aspectRatio > 1) {
      // Landscape
      newWidth = this.thumbnailWidth;
      newHeight = Math.round(this.thumbnailWidth / aspectRatio);
    } else {
      // Portrait
      newHeight = this.thumbnailHeight;
      newWidth = Math.round(this.thumbnailHeight * aspectRatio);
    }

    // Resize image
    const resized = image.resize({ width: newWidth, height: newHeight, quality: 'good' });
    return resized.toDataURL();
  }

  /**
   * Read rich text formats from clipboard
   * @returns {Object|null} Rich text data or null if no rich text present
   */
  readRichTextFromClipboard() {
    try {
      const rtf = clipboard.readRTF();
      const html = clipboard.readHTML();

      const hasRTF = rtf && rtf.trim();
      const hasHTML = html && html.trim();

      if (!hasRTF && !hasHTML) {
        return null;
      }

      const richText = {};
      if (hasRTF) {
        richText.rtf = Buffer.from(rtf, 'utf-8').toString('base64');
      }
      if (hasHTML) {
        richText.html = html;
      }

      return richText;
    } catch (err) {
      return null;
    }
  }

  /**
   * Prepare clipboard formats object with rich text
   * @param {string} text - Plain text content
   * @param {Object|null} richText - Rich text data
   * @param {Object|null} image - Native image object (optional)
   * @returns {Object} Clipboard formats object
   */
  prepareClipboardFormats(text, richText, image = null) {
    const formats = { text };

    // Add image if provided
    if (image) {
      formats.image = image;
    }

    // Add rich text formats if available
    if (richText) {
      if (richText.rtf) {
        try {
          formats.rtf = Buffer.from(richText.rtf, 'base64').toString('utf-8');
        } catch (err) {}
      }
      if (richText.html) {
        formats.html = richText.html;
      }
    }

    return formats;
  }

  startMonitoring() {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.isMonitoring = true;

    this.monitoringInterval = setInterval(() => {
      try {
        // Check for text, image, and rich text formats
        const currentText = clipboard.readText();
        const currentImage = clipboard.readImage();

        const hasText = currentText && currentText.trim();
        const hasImage = currentImage && !currentImage.isEmpty();

        if (!hasText && !hasImage) {
          return; // Nothing in clipboard
        }

        // Create thumbnail and calculate hash if present
        let imageDataUrl = null;
        let imageDataOriginal = null;
        let imageHash = '';
        if (hasImage) {
          // Save original for pasting (high quality)
          imageDataOriginal = currentImage.toDataURL();
          // Create thumbnail for display (better performance)
          imageDataUrl = this.createThumbnail(currentImage);
          // Use cached hash calculation (based on original for accuracy)
          imageHash = this.getImageHash(imageDataOriginal);
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
              // If both text and image, check image hash
              if (hasImage && item.imageHash) {
                return item.imageHash === imageHash;
              }
            }
            if (hasImage && !hasText && item.imageHash) {
              return item.imageHash === imageHash;
            }
            return false;
          });

          if (!alreadyInHistory) {
            // Read rich text formats from clipboard
            const richText = this.readRichTextFromClipboard();

            // Add text and/or image to history as a single item
            this.addToHistory(
              {
                text: hasText ? currentText : null,
                imageData: hasImage ? imageDataUrl : null,
                imageDataOriginal: hasImage ? imageDataOriginal : null,
                imageHash: hasImage ? imageHash : null,
                richText,
              },
              'auto',
              { skipIfDuplicate: true }
            );
          }

          // Update last known state regardless
          this.lastClipboard = hasText ? currentText : '';
          this.lastImageHash = hasImage ? imageHash : '';
        }
      } catch (err) {}
    }, this.pollInterval);

    // Initialize with current clipboard content
    try {
      const currentText = clipboard.readText();
      const currentImage = clipboard.readImage();

      const hasText = currentText && currentText.trim();
      const hasImage = currentImage && !currentImage.isEmpty();

      if (hasText || hasImage) {
        let imageDataUrl = null;
        let imageDataOriginal = null;
        let imageHash = '';
        if (hasImage) {
          // Save original for pasting (high quality)
          imageDataOriginal = currentImage.toDataURL();
          // Create thumbnail for display (better performance)
          imageDataUrl = this.createThumbnail(currentImage);
          // Use cached hash calculation (based on original for accuracy)
          imageHash = this.getImageHash(imageDataOriginal);
        }

        // Read rich text formats from clipboard
        const richText = this.readRichTextFromClipboard();

        this.addToHistory({
          text: hasText ? currentText : null,
          imageData: hasImage ? imageDataUrl : null,
          imageDataOriginal: hasImage ? imageDataOriginal : null,
          imageHash: hasImage ? imageHash : null,
          richText,
        });

        this.lastClipboard = hasText ? currentText : '';
        this.lastImageHash = hasImage ? imageHash : '';
      }
    } catch (err) {}
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
  }

  isMonitoringActive() {
    return !!this.monitoringInterval;
  }

  /**
   * Add item to clipboard history
   * @param {string|Object} content - Text string or object with text/image/richText
   * @param {string} type - Type of content ('auto', 'text', 'image')
   * @param {Object} options - Additional options
   * @param {boolean} options.skipIfDuplicate - Skip adding if duplicate exists
   */
  addToHistory(content, type = 'auto', options = {}) {
    if (!content) return;

    const { skipIfDuplicate = false } = options;
    let item;

    // Handle object format: { text, imageData, imageDataOriginal, imageHash, richText }
    if (typeof content === 'object' && content.constructor === Object) {
      const { text, imageData, imageDataOriginal, imageHash, richText } = content;

      if (!text && !imageData) return;

      // Determine type based on what's present
      let itemType = 'text';
      if (imageData && text) {
        itemType = 'mixed';
      } else if (imageData) {
        itemType = 'image';
      }

      // Calculate hash if not provided
      const actualImageHash =
        imageHash || (imageDataOriginal ? this.getImageHash(imageDataOriginal) : null);

      // Check for duplicates using hash comparison
      const duplicateIndex = this.history.findIndex((item) => {
        if (text && item.text === text) {
          // Text matches
          if (!actualImageHash && !item.imageHash) {
            return true; // Both text-only
          }
          if (actualImageHash && item.imageHash === actualImageHash) {
            return true; // Both text and same image
          }
        }
        if (!text && actualImageHash && item.imageHash === actualImageHash && !item.text) {
          return true; // Image-only match
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
        imageDataOriginal: imageDataOriginal || null,
        imageHash: actualImageHash,
        richText: richText || null,
        timestamp: Date.now(),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
    } else if (type === 'image') {
      // Legacy support: content is a data URL string (thumbnail only)
      const imageDataUrl = content;
      const imageHash = this.getImageHash(imageDataUrl);

      const duplicateIndex = this.history.findIndex((item) => item.imageHash === imageHash);

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
        imageDataOriginal: null, // Legacy: no original available
        imageHash,
        timestamp: Date.now(),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
    } else {
      // Legacy support: content is a text string
      const data = String(content || '').trim();
      if (!data) return;

      const duplicateIndex = this.history.findIndex(
        (item) => item.text === data && !item.imageHash
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
        imageHash: null,
        timestamp: Date.now(),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
    }

    // Add to beginning
    this.history.unshift(item);

    // Limit history size by category (text and image separately)
    this.trimHistory();

    // Save to file (debounced)
    this.saveHistoryToFile();

    // Emit update events
    this.emit('history-updated', this.getHistory());
    // Emit new item event for differential updates
    this.emit('item-added', item);
  }

  /**
   * Trim history to maintain separate limits for text and image items.
   * - Text items (including mixed): max 30
   * - Image items (including mixed): max 30
   * - Mixed items count toward both limits
   * - Total can be up to 60 items if all are unique to each category
   */
  trimHistory() {
    // Collect IDs of latest text items (text or mixed type)
    const latestTextItems = this.history.filter((item) => item.text).slice(0, this.maxTextItems);
    const textIds = new Set(latestTextItems.map((item) => item.id));

    // Collect IDs of latest image items (image or mixed type)
    const latestImageItems = this.history
      .filter((item) => item.imageData)
      .slice(0, this.maxImageItems);
    const imageIds = new Set(latestImageItems.map((item) => item.id));

    // Keep items that belong to either category (or both)
    this.history = this.history.filter((item) => textIds.has(item.id) || imageIds.has(item.id));
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
    this.saveHistoryToFile();
    this.emit('history-updated', this.getHistory());
  }

  /**
   * Copy item to system clipboard with rich text support
   * @param {string|Object} item - Text string or clipboard item object
   * @returns {boolean} True if successful, false otherwise
   */
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
        const imageDataToPaste = item.imageDataOriginal || item.imageData;
        const image = nativeImage.createFromDataURL(imageDataToPaste);

        const formats = this.prepareClipboardFormats(item.text, item.richText, image);
        clipboard.write(formats);

        this.lastClipboard = item.text;
        const imageHash = item.imageHash || this.getImageHash(imageDataToPaste);
        this.lastImageHash = imageHash;
        // Track programmatic change
        this.lastProgrammaticText = item.text;
        this.lastProgrammaticImageHash = imageHash;
        this.programmaticSetTime = Date.now();
      } else if (item.text) {
        // Text only (with or without rich text formats)
        if (item.richText) {
          const formats = this.prepareClipboardFormats(item.text, item.richText);
          clipboard.write(formats);
        } else {
          // Plain text only
          clipboard.writeText(item.text);
        }

        this.lastClipboard = item.text;
        this.lastImageHash = '';
        // Track programmatic change
        this.lastProgrammaticText = item.text;
        this.lastProgrammaticImageHash = null;
        this.programmaticSetTime = Date.now();
      } else if (item.imageData) {
        // Image only
        // Use original image for pasting (high quality), fallback to thumbnail
        const imageDataToPaste = item.imageDataOriginal || item.imageData;
        const image = nativeImage.createFromDataURL(imageDataToPaste);
        clipboard.writeImage(image);
        // Use cached hash if available
        const imageHash = item.imageHash || this.getImageHash(imageDataToPaste);
        this.lastImageHash = imageHash;
        this.lastClipboard = '';
        // Track programmatic change
        this.lastProgrammaticText = null;
        this.lastProgrammaticImageHash = imageHash;
        this.programmaticSetTime = Date.now();
      }
      return true;
    } catch (err) {
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
      if (fsSync.existsSync(this.historyFilePath)) {
        const data = fsSync.readFileSync(this.historyFilePath, 'utf8');
        const loaded = JSON.parse(data);
        // Load items with text and/or image
        this.history = (loaded || []).filter((item) => {
          // Valid if it has text, image, or both
          return item.text || item.imageData;
        });

        // Apply limits after loading
        this.trimHistory();

        // Rebuild hash cache from loaded items
        this.history.forEach((item) => {
          // Use original image for hash if available, fallback to thumbnail
          const imageForHash = item.imageDataOriginal || item.imageData;
          if (imageForHash) {
            if (item.imageHash) {
              this.imageHashCache.set(imageForHash, item.imageHash);
            } else {
              // Calculate and cache hash for old items without hash
              item.imageHash = this.getImageHash(imageForHash);
            }
          }
        });
      }
    } catch (err) {
      this.history = [];
    }
  }

  async saveHistoryToFile() {
    // Debounce: clear previous timeout and set a new one
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      // Skip if already saving
      if (this.isSaving) return;

      this.isSaving = true;
      try {
        // Defer JSON stringification to next event loop tick
        await new Promise((resolve) => setImmediate(resolve));

        // Save both text and image items (async I/O)
        const data = JSON.stringify(this.history, null, 2);
        await fs.writeFile(this.historyFilePath, data, 'utf8');
      } catch (err) {
      } finally {
        this.isSaving = false;
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
