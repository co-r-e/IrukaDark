/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { exec } = require('child_process');

const SYSTEM_COMMANDS = {
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    icon: '💤',
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
    icon: '🔒',
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
    icon: '🔄',
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
    icon: '⏻',
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
    icon: '🔊',
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
    icon: '🔉',
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
    icon: '🔇',
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
    icon: '🔊',
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
    icon: '🗑️',
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
