/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

class AppScanner {
  constructor() {
    this.apps = [];
    this.appsDirs = [
      '/Applications',
      path.join(os.homedir(), 'Applications'),
      '/System/Applications',
    ];
    this.isScanning = false;
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
              const appInfo = this.getAppInfo(appPath);
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

  getAppInfo(appPath) {
    try {
      const name = path.basename(appPath, '.app');
      const stat = fs.statSync(appPath);

      if (!stat.isDirectory()) return null;

      return {
        name,
        path: appPath,
        icon: this.getAppIcon(name),
        type: 'application',
      };
    } catch (err) {
      return null;
    }
  }

  getAppIcon(appName) {
    // Simple icon mapping for common apps
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

  searchApps(query) {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    return this.apps
      .filter((app) => app.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        // Exact matches first
        const aStarts = a.name.toLowerCase().startsWith(lowerQuery);
        const bStarts = b.name.toLowerCase().startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        // Then alphabetically
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }

  getApps() {
    return this.apps;
  }
}

module.exports = { AppScanner };
