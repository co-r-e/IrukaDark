/*
  IrukaDark — (c) 2025 CORe Inc.
  License: AGPL-3.0-only. See https://github.com/co-r-e/IrukaDark/blob/HEAD/LICENSE
*/

const pty = require('node-pty');
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
  }

  isWebContentsAlive(webContents) {
    return !!(webContents && !webContents.isDestroyed());
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
      // Flush any remaining buffered data before exit
      this.flushOutputBuffer(id);
      this.terminals.delete(id);
      this.outputBuffers.delete(id);
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('terminal:exit', { id, exitCode, signal });
      }
    });

    // Store terminal
    this.terminals.set(id, ptyProcess);

    return { success: true, shell, cwd: workingDir };
  }

  /**
   * Write data into a terminal session
   * @param {string} id
   * @param {string} data
   */
  writeInput(id, data) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  /**
   * Resize a terminal session
   * @param {string} id
   * @param {number} cols
   * @param {number} rows
   */
  resizeTerminal(id, cols, rows) {
    const ptyProcess = this.terminals.get(id);
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
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

    // If renderer has gone away, clean up and skip
    if (!this.isWebContentsAlive(bufferData?.webContents)) {
      this.cleanupTerminalBuffer(id);
      this.terminals.delete(id);
      return;
    }

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

    // Drop output if renderer is gone
    if (!this.isWebContentsAlive(bufferData.webContents)) {
      this.cleanupTerminalBuffer(id);
      this.terminals.delete(id);
      return;
    }

    // Send all buffered data at once
    const combinedData = bufferData.buffer.join('');
    try {
      bufferData.webContents.send('terminal:data', { id, data: combinedData });
    } catch (err) {}

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
      // Flush remaining buffer (safe when renderer alive)
      this.flushOutputBuffer(id);
      this.cleanupTerminalBuffer(id);
      try {
        ptyProcess.kill();
      } catch (err) {}
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
    this.terminals.forEach((ptyProcess, id) => {
      try {
        // Flush and clean up buffer
        this.flushOutputBuffer(id);
        this.cleanupTerminalBuffer(id);
        ptyProcess.kill();
      } catch (error) {}
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
