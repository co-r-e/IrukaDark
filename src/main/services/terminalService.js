/*
  IrukaDark — (c) 2025 CORe Inc.
  License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
*/

const pty = require('node-pty');
const { ipcMain } = require('electron');
const os = require('os');

/**
 * TerminalService - Manages PTY sessions for terminal emulation
 */
class TerminalService {
  constructor() {
    this.terminals = new Map(); // terminalId -> ptyProcess
    // Performance optimization: Buffer outgoing data to renderer
    this.outputBuffers = new Map(); // terminalId -> { buffer: [], timeoutId: null, webContents: WebContents }
    this.BUFFER_FLUSH_INTERVAL = 16; // 16ms (~60fps)
    this.setupIPC();
    console.log('[TerminalService] Initialized');
  }

  /**
   * Setup IPC handlers for terminal operations
   */
  setupIPC() {
    // Create new terminal session
    ipcMain.handle('terminal:create', (event, { id, cols, rows, cwd }) => {
      try {
        return this.createTerminal(event.sender, id, cols, rows, cwd);
      } catch (error) {
        console.error('[TerminalService] Error creating terminal:', error);
        return { success: false, error: error.message };
      }
    });

    // Send input data to terminal
    ipcMain.on('terminal:input', (event, { id, data }) => {
      try {
        const ptyProcess = this.terminals.get(id);
        if (ptyProcess) {
          ptyProcess.write(data);
        }
      } catch (error) {
        console.error('[TerminalService] Error writing to terminal:', error);
      }
    });

    // Resize terminal
    ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
      try {
        const ptyProcess = this.terminals.get(id);
        if (ptyProcess) {
          ptyProcess.resize(cols, rows);
        }
      } catch (error) {
        console.error('[TerminalService] Error resizing terminal:', error);
      }
    });

    // Kill terminal session
    ipcMain.handle('terminal:kill', (event, { id }) => {
      try {
        return this.killTerminal(id);
      } catch (error) {
        console.error('[TerminalService] Error killing terminal:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Create a new PTY terminal session
   * @param {Electron.WebContents} webContents - The webContents to send data to
   * @param {string} id - Unique terminal ID
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   * @param {string} cwd - Working directory (optional)
   * @returns {Object} Result object
   */
  createTerminal(webContents, id, cols, rows, cwd) {
    // Get default shell (zsh, bash, etc.)
    const shell = process.env.SHELL || '/bin/zsh';
    const workingDir = cwd || process.env.HOME || os.homedir();

    console.log(`[TerminalService] Creating terminal ${id}:`, {
      shell,
      cols,
      rows,
      cwd: workingDir,
    });

    // Spawn PTY process
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    // Handle output data with buffering for better performance
    ptyProcess.onData((data) => {
      this.bufferOutputData(id, data, webContents);
    });

    // Handle process exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[TerminalService] Terminal ${id} exited:`, { exitCode, signal });
      // Flush any remaining buffered data before exit
      this.flushOutputBuffer(id);
      this.terminals.delete(id);
      this.outputBuffers.delete(id);
      webContents.send('terminal:exit', { id, exitCode, signal });
    });

    // Store terminal
    this.terminals.set(id, ptyProcess);

    return { success: true, shell, cwd: workingDir };
  }

  /**
   * Buffer output data for performance optimization
   * Batches multiple rapid outputs into single IPC messages
   * @param {string} id - Terminal ID
   * @param {string} data - Data to send
   * @param {Electron.WebContents} webContents - Target webContents
   */
  bufferOutputData(id, data, webContents) {
    // Initialize buffer if needed
    if (!this.outputBuffers.has(id)) {
      this.outputBuffers.set(id, { buffer: [], timeoutId: null, webContents });
    }

    const bufferData = this.outputBuffers.get(id);
    bufferData.buffer.push(data);

    // Clear existing timeout
    if (bufferData.timeoutId !== null) {
      clearTimeout(bufferData.timeoutId);
    }

    // Schedule flush
    bufferData.timeoutId = setTimeout(() => {
      this.flushOutputBuffer(id);
    }, this.BUFFER_FLUSH_INTERVAL);
  }

  /**
   * Flush buffered output data to renderer
   * @param {string} id - Terminal ID
   */
  flushOutputBuffer(id) {
    const bufferData = this.outputBuffers.get(id);
    if (!bufferData || bufferData.buffer.length === 0) return;

    // Send all buffered data at once
    const combinedData = bufferData.buffer.join('');
    bufferData.webContents.send('terminal:data', { id, data: combinedData });

    // Clear buffer
    bufferData.buffer = [];
    bufferData.timeoutId = null;
  }

  /**
   * Kill a terminal session
   * @param {string} id - Terminal ID
   * @returns {Object} Result object
   */
  killTerminal(id) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      console.log(`[TerminalService] Killing terminal ${id}`);
      // Flush remaining buffer and clean up
      this.flushOutputBuffer(id);
      this.cleanupTerminalBuffer(id);
      ptyProcess.kill();
      this.terminals.delete(id);
      return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
  }

  /**
   * Clean up output buffer for a terminal
   * @param {string} id - Terminal ID
   */
  cleanupTerminalBuffer(id) {
    const bufferData = this.outputBuffers.get(id);
    if (bufferData) {
      if (bufferData.timeoutId !== null) {
        clearTimeout(bufferData.timeoutId);
      }
      this.outputBuffers.delete(id);
    }
  }

  /**
   * Cleanup all terminals and buffers
   */
  cleanup() {
    console.log('[TerminalService] Cleaning up all terminals');
    this.terminals.forEach((ptyProcess, id) => {
      try {
        // Flush and clean up buffer
        this.flushOutputBuffer(id);
        this.cleanupTerminalBuffer(id);
        ptyProcess.kill();
      } catch (error) {
        console.error(`[TerminalService] Error killing terminal ${id}:`, error);
      }
    });
    this.terminals.clear();
    this.outputBuffers.clear();
  }

  /**
   * Get active terminal count
   * @returns {number} Number of active terminals
   */
  getActiveCount() {
    return this.terminals.size;
  }
}

module.exports = TerminalService;
