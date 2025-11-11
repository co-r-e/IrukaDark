/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class AppScanner {
  constructor() {
    this.apps = [];
    this.appsDirs = [
      '/Applications',
      path.join(os.homedir(), 'Applications'),
      '/System/Applications',
    ];
    this.isScanning = false;
    this.iconCache = new Map(); // Cache for extracted icons
    this.tempDir = path.join(os.tmpdir(), 'irukadark-icons');
    this.ensureTempDir();
  }

  async scanApplications() {
    if (this.isScanning) return this.apps;
    this.isScanning = true;

    try {
      const apps = [];

      for (const dir of this.appsDirs) {
        if (!fs.existsSync(dir)) continue;

        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.endsWith('.app')) {
              const appPath = path.join(dir, file);
              const appInfo = await this.getAppInfo(appPath);
              if (appInfo) apps.push(appInfo);
            }
          }
        } catch (err) {
          console.error(`Error scanning ${dir}:`, err.message);
        }
      }

      this.apps = apps;
      console.log(`Scanned ${apps.length} applications`);
      return apps;
    } finally {
      this.isScanning = false;
    }
  }

  async getAppInfo(appPath) {
    try {
      const name = path.basename(appPath, '.app');
      const stat = fs.statSync(appPath);

      if (!stat.isDirectory()) return null;

      return {
        name,
        path: appPath,
        icon: await this.getAppIcon(name, appPath),
        type: 'application',
      };
    } catch (err) {
      return null;
    }
  }

  async getAppIcon(appName, appPath) {
    // Check cache first
    const cacheKey = `${appName}-${appPath}`;
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey);
    }

    try {
      // Try to extract icon using multiple methods
      let iconData = null;

      // Method 1: Use sips to convert ICNS to PNG
      iconData = await this.extractIconWithSips(appPath, appName);

      // Method 2: Look for existing PNG files
      if (!iconData) {
        iconData = this.findExistingPngIcon(appPath);
      }

      // Method 3: Use iconutil to extract from ICNS
      if (!iconData) {
        iconData = await this.extractIconWithIconutil(appPath, appName);
      }

      // Method 4: Generate a generic icon
      if (!iconData) {
        iconData = this.generateGenericIcon(appName);
      }

      // Cache the result
      this.iconCache.set(cacheKey, iconData);
      return iconData;
    } catch (err) {
      console.warn(`Failed to extract icon for ${appName}:`, err.message);
      // Fallback to emoji
      const fallbackIcon = this.getEmojiFallback(appName);
      this.iconCache.set(cacheKey, fallbackIcon);
      return fallbackIcon;
    }
  }

  searchApps(query, limit = 20, offset = 0) {
    if (!query) return { results: [], total: 0, hasMore: false };

    const lowerQuery = query.toLowerCase();
    const allMatches = this.apps
      .filter((app) => app.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        // Exact matches first
        const aStarts = a.name.toLowerCase().startsWith(lowerQuery);
        const bStarts = b.name.toLowerCase().startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });

    const total = allMatches.length;
    const results = allMatches.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { results, total, hasMore };
  }

  getApps() {
    return this.apps;
  }

  ensureTempDir() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (err) {
      console.warn('Failed to create temp directory:', err.message);
    }
  }

  async extractIconWithSips(appPath, appName) {
    try {
      const iconPath = this.findIconFile(appPath);
      if (!iconPath) return null;

      const outputPath = path.join(this.tempDir, `${appName.replace(/[^a-zA-Z0-9]/g, '_')}.png`);

      // Use sips to convert ICNS/PNG to standardized PNG
      execSync(`sips -s format png -z 64 64 "${iconPath}" --out "${outputPath}"`, {
        stdio: 'ignore',
        timeout: 5000,
      });

      if (fs.existsSync(outputPath)) {
        const iconBuffer = fs.readFileSync(outputPath);
        const base64Icon = iconBuffer.toString('base64');
        return `data:image/png;base64,${base64Icon}`;
      }
    } catch (err) {
      // Silently fail and try next method
    }
    return null;
  }

  findExistingPngIcon(appPath) {
    const resourcesPath = path.join(appPath, 'Contents', 'Resources');
    if (!fs.existsSync(resourcesPath)) return null;

    try {
      const files = fs.readdirSync(resourcesPath);

      // Look for PNG files first
      const pngFiles = files.filter((file) => file.endsWith('.png'));
      if (pngFiles.length > 0) {
        // Prefer files with "icon" in the name
        const iconFile =
          pngFiles.find((file) => file.toLowerCase().includes('icon')) || pngFiles[0];
        const iconPath = path.join(resourcesPath, iconFile);

        const iconBuffer = fs.readFileSync(iconPath);
        const base64Icon = iconBuffer.toString('base64');
        return `data:image/png;base64,${base64Icon}`;
      }
    } catch (err) {
      // Silently fail
    }
    return null;
  }

  async extractIconWithIconutil(appPath, appName) {
    try {
      const iconPath = this.findIconFile(appPath);
      if (!iconPath || !iconPath.endsWith('.icns')) return null;

      const iconSetDir = path.join(
        this.tempDir,
        `${appName.replace(/[^a-zA-Z0-9]/g, '_')}.iconset`
      );
      const outputPath = path.join(this.tempDir, `${appName.replace(/[^a-zA-Z0-9]/g, '_')}.png`);

      // Convert ICNS to iconset
      execSync(`iconutil -c iconset "${iconPath}" -o "${this.tempDir}"`, {
        stdio: 'ignore',
        timeout: 5000,
      });

      if (fs.existsSync(iconSetDir)) {
        // Find the largest available icon
        const iconFiles = fs.readdirSync(iconSetDir).filter((f) => f.endsWith('.png'));
        if (iconFiles.length > 0) {
          // Sort by size (largest first)
          iconFiles.sort((a, b) => {
            const aSize = parseInt(a.match(/(\d+)/)?.[1] || 0);
            const bSize = parseInt(b.match(/(\d+)/)?.[1] || 0);
            return bSize - aSize;
          });

          const largestIcon = path.join(iconSetDir, iconFiles[0]);

          // Convert to 64x64 PNG
          execSync(`sips -s format png -z 64 64 "${largestIcon}" --out "${outputPath}"`, {
            stdio: 'ignore',
            timeout: 5000,
          });

          if (fs.existsSync(outputPath)) {
            const iconBuffer = fs.readFileSync(outputPath);
            const base64Icon = iconBuffer.toString('base64');
            return `data:image/png;base64,${base64Icon}`;
          }
        }
      }
    } catch (err) {
      // Silently fail
    }
    return null;
  }

  findIconFile(appPath) {
    // Method 1: Check Info.plist for CFBundleIconFile
    const plistPath = path.join(appPath, 'Contents', 'Info.plist');
    if (fs.existsSync(plistPath)) {
      try {
        const plistContent = fs.readFileSync(plistPath, 'utf8');
        const iconMatch = plistContent.match(
          /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/
        );
        if (iconMatch) {
          const iconName = iconMatch[1];
          const resourcesPath = path.join(appPath, 'Contents', 'Resources');

          // Try with and without .icns extension
          for (const ext of ['.icns', '.png', '']) {
            const iconPath = path.join(resourcesPath, iconName + ext);
            if (fs.existsSync(iconPath)) {
              return iconPath;
            }
          }
        }
      } catch (err) {
        // Continue to other methods
      }
    }

    // Method 2: Look for any icon file in Resources
    const resourcesPath = path.join(appPath, 'Contents', 'Resources');
    if (fs.existsSync(resourcesPath)) {
      try {
        const files = fs.readdirSync(resourcesPath);

        // Prioritize ICNS files
        const icnsFiles = files.filter((file) => file.endsWith('.icns'));
        if (icnsFiles.length > 0) {
          return path.join(resourcesPath, icnsFiles[0]);
        }

        // Then PNG files
        const pngFiles = files.filter((file) => file.endsWith('.png'));
        if (pngFiles.length > 0) {
          return path.join(resourcesPath, pngFiles[0]);
        }
      } catch (err) {
        // Continue
      }
    }

    return null;
  }

  generateGenericIcon(appName) {
    // Since canvas is not available, create a simple SVG icon
    const firstLetter = appName.charAt(0).toUpperCase();

    // Generate a consistent color based on app name
    const hash = appName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;

    // Create SVG with colored background and letter
    const svg = `
      <svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" fill="hsl(${hue}, 70%, 60%)" rx="12"/>
        <text x="32" y="32" font-family="system-ui, -apple-system, sans-serif" 
              font-size="28" font-weight="bold" fill="white" 
              text-anchor="middle" dominant-baseline="central">${firstLetter}</text>
      </svg>
    `;

    // Convert SVG to base64
    const base64Svg = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64Svg}`;
  }

  getEmojiFallback(appName) {
    const iconMap = {
      Safari: '🧭',
      Chrome: '🌐',
      'Google Chrome': '🌐',
      Firefox: '🦊',
      Mail: '✉️',
      Messages: '💬',
      Calendar: '📅',
      Notes: '📝',
      Reminders: '✓',
      Photos: '📷',
      Music: '🎵',
      Podcasts: '🎙️',
      'App Store': '🛍️',
      'System Preferences': '⚙️',
      'System Settings': '⚙️',
      Terminal: '⌨️',
      Finder: '📁',
      Preview: '👁️',
      TextEdit: '📄',
      Calculator: '🔢',
      Maps: '🗺️',
      Contacts: '👤',
      FaceTime: '📹',
      Slack: '💼',
      Discord: '🎮',
      Spotify: '🎵',
      VSCode: '💻',
      'Visual Studio Code': '💻',
      Xcode: '🔨',
      Docker: '🐳',
    };

    return iconMap[appName] || '📦';
  }
}

module.exports = { AppScanner };
