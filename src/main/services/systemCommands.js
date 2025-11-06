/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { exec } = require('child_process');

const SYSTEM_COMMANDS = {
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M10 2v20"/><path d="M6 8l-4 4 4 4"/><path d="M18 8l4 4-4 4"/></svg>',
    keywords: ['sleep', 'スリープ', '睡眠'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec('pmset sleepnow', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  },
  lock: {
    id: 'lock',
    name: 'Lock Screen',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    keywords: ['lock', 'ロック', '锁定', '鎖定'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec(
          '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend',
          (error) => {
            if (error) reject(error);
            else resolve();
          }
        );
      });
    },
  },
  restart: {
    id: 'restart',
    name: 'Restart',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
    keywords: ['restart', 'reboot', '再起動', '重启', '重新啟動'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec('osascript -e \'tell app "System Events" to restart\'', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  },
  shutdown: {
    id: 'shutdown',
    name: 'Shutdown',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 14.2a9 9 0 1 1-2.05-9.65"/></svg>',
    keywords: ['shutdown', 'シャットダウン', '关机', '關機'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec('osascript -e \'tell app "System Events" to shut down\'', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  },
  'volume-up': {
    id: 'volume-up',
    name: 'Volume Up',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    keywords: ['volume up', '音量上げる', '音量增大', '增加音量'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec(
          'osascript -e "set volume output volume ((output volume of (get volume settings)) + 10)"',
          (error) => {
            if (error) reject(error);
            else resolve();
          }
        );
      });
    },
  },
  'volume-down': {
    id: 'volume-down',
    name: 'Volume Down',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/></svg>',
    keywords: ['volume down', '音量下げる', '音量减小', '降低音量'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec(
          'osascript -e "set volume output volume ((output volume of (get volume settings)) - 10)"',
          (error) => {
            if (error) reject(error);
            else resolve();
          }
        );
      });
    },
  },
  mute: {
    id: 'mute',
    name: 'Mute',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/></svg>',
    keywords: ['mute', 'ミュート', '静音'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec('osascript -e "set volume output muted true"', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  },
  unmute: {
    id: 'unmute',
    name: 'Unmute',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    keywords: ['unmute', 'ミュート解除', '取消静音'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec('osascript -e "set volume output muted false"', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  },
  'empty-trash': {
    id: 'empty-trash',
    name: 'Empty Trash',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    keywords: ['empty trash', 'ゴミ箱を空にする', '清空废纸篓', '清空垃圾桶'],
    execute: () => {
      return new Promise((resolve, reject) => {
        exec('osascript -e \'tell app "Finder" to empty trash\'', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  },
};

class SystemCommandsService {
  constructor() {
    this.commands = SYSTEM_COMMANDS;
  }

  searchCommands(query) {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    const results = [];

    for (const [key, cmd] of Object.entries(this.commands)) {
      // Check if query matches any keyword
      const matches = cmd.keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery));

      if (matches) {
        results.push({
          id: cmd.id,
          name: cmd.name,
          icon: cmd.icon,
          type: 'system-command',
        });
      }
    }

    return results.slice(0, 5); // Limit to 5 results
  }

  async executeCommand(commandId) {
    const cmd = this.commands[commandId];
    if (!cmd) {
      throw new Error(`Command not found: ${commandId}`);
    }

    try {
      await cmd.execute();
      return { success: true, command: cmd.name };
    } catch (error) {
      console.error(`Error executing command ${commandId}:`, error);
      throw error;
    }
  }

  getAllCommands() {
    return Object.values(this.commands).map((cmd) => ({
      id: cmd.id,
      name: cmd.name,
      icon: cmd.icon,
      keywords: cmd.keywords,
    }));
  }
}

module.exports = { SystemCommandsService };
