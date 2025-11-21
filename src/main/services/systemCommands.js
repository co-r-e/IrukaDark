/*!
 * IrukaDark — (c) 2025 CORe Inc.
 * License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
 */
const { exec } = require('child_process');

const SYSTEM_COMMANDS = {
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    icon: '🌙',
    keywords: ['sleep', 'スリープ', '睡眠'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec('pmset sleepnow', (error) => {
        if (error) reject(error);
        else resolve();
      });
      return promise;
    },
  },
  lock: {
    id: 'lock',
    name: 'Lock Screen',
    icon: '🔒',
    keywords: ['lock', 'ロック', '锁定', '鎖定'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec(
        '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend',
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
      return promise;
    },
  },
  restart: {
    id: 'restart',
    name: 'Restart',
    icon: '🔄',
    keywords: ['restart', 'reboot', '再起動', '重启', '重新啟動'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec('osascript -e \'tell app "System Events" to restart\'', (error) => {
        if (error) reject(error);
        else resolve();
      });
      return promise;
    },
  },
  shutdown: {
    id: 'shutdown',
    name: 'Shutdown',
    icon: '⚡',
    keywords: ['shutdown', 'シャットダウン', '关机', '關機'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec('osascript -e \'tell app "System Events" to shut down\'', (error) => {
        if (error) reject(error);
        else resolve();
      });
      return promise;
    },
  },
  'volume-up': {
    id: 'volume-up',
    name: 'Volume Up',
    icon: '🔊',
    keywords: ['volume up', '音量上げる', '音量增大', '增加音量'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec(
        'osascript -e "set volume output volume ((output volume of (get volume settings)) + 10)"',
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
      return promise;
    },
  },
  'volume-down': {
    id: 'volume-down',
    name: 'Volume Down',
    icon: '🔉',
    keywords: ['volume down', '音量下げる', '音量减小', '降低音量'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec(
        'osascript -e "set volume output volume ((output volume of (get volume settings)) - 10)"',
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
      return promise;
    },
  },
  mute: {
    id: 'mute',
    name: 'Mute',
    icon: '🔇',
    keywords: ['mute', 'ミュート', '静音'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec('osascript -e "set volume output muted true"', (error) => {
        if (error) reject(error);
        else resolve();
      });
      return promise;
    },
  },
  unmute: {
    id: 'unmute',
    name: 'Unmute',
    icon: '🔊',
    keywords: ['unmute', 'ミュート解除', '取消静音'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec('osascript -e "set volume output muted false"', (error) => {
        if (error) reject(error);
        else resolve();
      });
      return promise;
    },
  },
  'empty-trash': {
    id: 'empty-trash',
    name: 'Empty Trash',
    icon: '🗑️',
    keywords: ['empty trash', 'ゴミ箱を空にする', '清空废纸篓', '清空垃圾桶'],
    execute: () => {
      const { promise, resolve, reject } = Promise.withResolvers();
      exec('osascript -e \'tell app "Finder" to empty trash\'', (error) => {
        if (error) reject(error);
        else resolve();
      });
      return promise;
    },
  },
};

class SystemCommandsService {
  constructor() {
    this.commands = SYSTEM_COMMANDS;
  }

  searchCommands(query, limit = 20, offset = 0) {
    if (!query) return { results: [], total: 0, hasMore: false };

    const lowerQuery = query.toLowerCase();
    const allResults = [];

    for (const cmd of Object.values(this.commands)) {
      // Check if query matches any keyword
      const matches = cmd.keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery));

      if (matches) {
        allResults.push({
          id: cmd.id,
          name: cmd.name,
          icon: cmd.icon,
          type: 'system-command',
        });
      }
    }

    const total = allResults.length;
    const results = allResults.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { results, total, hasMore };
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
