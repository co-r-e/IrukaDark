/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');

const execPromise = util.promisify(exec);

class FileSearchService {
  constructor() {
    this.searchCache = new Map();
    this.cacheTimeout = 5000; // 5 seconds
  }

  async searchFiles(query, options = {}) {
    if (!query || query.length < 2) return [];

    const { limit = 15, scope = os.homedir() } = options;

    // Check cache
    const cacheKey = `${query}:${scope}:${limit}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.results;
    }

    try {
      // Use mdfind (Spotlight CLI) for fast file search
      // -onlyin: search in specific directory
      // -name: search by filename (faster than full-text)
      const cmd = `mdfind -onlyin "${scope}" -name "${query}" | head -n ${limit}`;

      const { stdout } = await execPromise(cmd, {
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024, // 1MB
      });

      const files = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((filePath) => this.createFileResult(filePath));

      // Cache results
      this.searchCache.set(cacheKey, {
        results: files,
        timestamp: Date.now(),
      });

      // Clean old cache entries
      if (this.searchCache.size > 100) {
        this.cleanCache();
      }

      return files;
    } catch (err) {
      console.error('File search error:', err.message);
      return [];
    }
  }

  createFileResult(filePath) {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return {
      name: fileName,
      path: filePath,
      type: 'file',
      icon: this.getFileIcon(ext),
    };
  }

  getFileIcon(ext) {
    const iconMap = {
      // Documents
      '.pdf': '📄',
      '.doc': '📝',
      '.docx': '📝',
      '.txt': '📝',
      '.rtf': '📝',
      '.pages': '📝',

      // Spreadsheets
      '.xls': '📊',
      '.xlsx': '📊',
      '.csv': '📊',
      '.numbers': '📊',

      // Presentations
      '.ppt': '📊',
      '.pptx': '📊',
      '.key': '📊',

      // Images
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.png': '🖼️',
      '.gif': '🖼️',
      '.bmp': '🖼️',
      '.svg': '🖼️',
      '.ico': '🖼️',
      '.webp': '🖼️',

      // Videos
      '.mp4': '🎬',
      '.mov': '🎬',
      '.avi': '🎬',
      '.mkv': '🎬',
      '.webm': '🎬',

      // Audio
      '.mp3': '🎵',
      '.wav': '🎵',
      '.aac': '🎵',
      '.flac': '🎵',
      '.m4a': '🎵',

      // Archives
      '.zip': '📦',
      '.rar': '📦',
      '.tar': '📦',
      '.gz': '📦',
      '.7z': '📦',
      '.dmg': '📦',

      // Code
      '.js': '📜',
      '.ts': '📜',
      '.py': '📜',
      '.java': '📜',
      '.c': '📜',
      '.cpp': '📜',
      '.h': '📜',
      '.swift': '📜',
      '.go': '📜',
      '.rs': '📜',
      '.rb': '📜',
      '.php': '📜',

      // Web
      '.html': '🌐',
      '.css': '🎨',
      '.json': '📋',
      '.xml': '📋',
      '.yaml': '📋',
      '.yml': '📋',

      // Other
      '.md': '📖',
      '.sh': '⚙️',
      '.app': '📦',
    };

    return iconMap[ext] || '📄';
  }

  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.searchCache.delete(key);
      }
    }
  }
}

module.exports = { FileSearchService };
