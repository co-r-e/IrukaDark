/*!
 * macOS automation bridge via Swift helper binary.
 */
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 1500;
const PROMPT_BACKOFF_MS = 60_000;

// Daemon mode constants
const DAEMON_HEALTH_CHECK_INTERVAL_MS = 30000;
const DAEMON_HEALTH_CHECK_TIMEOUT_MS = 3000;
const DAEMON_MAX_RESTART_COUNT = 3;
const DAEMON_RESTART_WINDOW_MS = 300000;
const DAEMON_PERIODIC_RESTART_MS = 3600000; // 1 hour - restart daemon periodically to prevent HID state corruption

let cachedExecutablePath = null;
let lastPromptAttempt = 0;
let didWarnMissing = false;
let bridgeLogPath = null;
let clipboardPopupProcess = null;

// Daemon mode state
let clipboardDaemonProcess = null;
let daemonState = 'stopped';
let daemonRestartHistory = [];
let healthCheckTimer = null;
let pendingHealthCheck = null;
let periodicRestartTimer = null;

// Cache history items for richText lookup during paste
let cachedHistoryItems = [];

function resolveLogPath() {
  if (bridgeLogPath !== null) return bridgeLogPath;
  try {
    const logsDir = app?.getPath?.('logs');
    if (!logsDir) {
      bridgeLogPath = undefined;
      return bridgeLogPath;
    }
    // Electron's logs path on macOS is already '~/Library/Logs/<AppName>'
    // so we should not append the app name again.
    fs.mkdirSync(logsDir, { recursive: true });
    bridgeLogPath = path.join(logsDir, 'automation.log');
  } catch {
    bridgeLogPath = undefined;
  }
  return bridgeLogPath;
}

function logBridgeEvent(event, payload = {}) {
  try {
    const target = resolveLogPath();
    if (!target) return;

    const record = {
      ts: new Date().toISOString(),
      event,
      ...payload,
    };

    const serialized = JSON.stringify(record);
    fs.appendFile(target, `${serialized}\n`, () => {});
  } catch {
    // Swallow logging errors; never break shortcut flow.
  }
}

function resolveExecutablePath() {
  if (cachedExecutablePath !== null) return cachedExecutablePath;

  const manualOverride = process.env.IRUKA_AUTOMATION_BRIDGE_PATH;
  const searchPaths = [];

  if (manualOverride) {
    searchPaths.push(manualOverride);
  }

  const appRoot = app?.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../../..');

  const candidates = [
    path.join(appRoot, 'mac-automation', 'IrukaAutomation'),
    path.join(appRoot, 'bin', 'IrukaAutomation'),
    path.join(appRoot, 'native', 'macos', 'IrukaAutomation', 'dist', 'IrukaAutomation'),
    path.join(
      appRoot,
      'native',
      'macos',
      'IrukaAutomation',
      '.build',
      'release',
      'IrukaAutomation'
    ),
  ];

  searchPaths.push(...candidates);

  for (const candidate of searchPaths) {
    if (!candidate) continue;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedExecutablePath = candidate;
      logBridgeEvent('resolveExecutablePath.success', {
        candidate,
        packaged: !!app?.isPackaged,
        arch: process.arch,
        pid: process.pid,
      });
      return cachedExecutablePath;
    } catch {}
  }

  logBridgeEvent('resolveExecutablePath.failure', {
    packaged: !!app?.isPackaged,
    arch: process.arch,
    pid: process.pid,
    searchCount: searchPaths.length,
  });
  cachedExecutablePath = null;
  return null;
}

function spawnBridge(
  command,
  { timeoutMs = DEFAULT_TIMEOUT_MS, promptAccessibility = false } = {}
) {
  const { promise, resolve, reject } = Promise.withResolvers();

  const executable = resolveExecutablePath();
  if (!executable) {
    if (!didWarnMissing) {
      didWarnMissing = true;
    }
    logBridgeEvent('spawnBridge.notFound', {
      command,
      timeoutMs,
      promptAccessibility,
    });
    reject(new Error('SWIFT_BRIDGE_NOT_AVAILABLE'));
    return promise;
  }

  const args = [command, '--timeout-ms', String(timeoutMs)];
  if (promptAccessibility) args.push('--prompt-accessibility');

  const child = spawn(executable, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  logBridgeEvent('spawnBridge.start', {
    command,
    timeoutMs,
    promptAccessibility,
    executable,
    childPid: child.pid,
  });

  let stdout = '';
  let stderr = '';
  let finished = false;

  const timer = setTimeout(
    () => {
      if (finished) return;
      finished = true;
      try {
        child.kill('SIGKILL');
      } catch {}
      reject(new Error('SWIFT_BRIDGE_TIMEOUT'));
    },
    Math.max(timeoutMs + 250, timeoutMs * 1.5)
  );

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.once('error', (error) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    logBridgeEvent('spawnBridge.error', {
      command,
      timeoutMs,
      promptAccessibility,
      executable,
      message: error?.message || '',
      code: error?.code || '',
      errno: error?.errno || '',
    });
    reject(error);
  });

  child.once('exit', (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);

    const payloadRaw = (stdout || '').trim();
    if (!payloadRaw) {
      const error = new Error('SWIFT_BRIDGE_EMPTY_OUTPUT');
      error.meta = { code, signal, stderr: stderr.trim() };
      logBridgeEvent('spawnBridge.emptyOutput', {
        command,
        timeoutMs,
        promptAccessibility,
        executable,
        exitCode: code,
        signal,
        stderr: stderr.trim(),
      });
      reject(error);
      return;
    }

    let payload = null;
    try {
      const lastLine = payloadRaw.split('\n').filter(Boolean).pop() || payloadRaw;
      payload = JSON.parse(lastLine);
    } catch (e) {
      const error = new Error('SWIFT_BRIDGE_INVALID_JSON');
      error.meta = { stdout: payloadRaw, stderr: stderr.trim(), cause: e };
      logBridgeEvent('spawnBridge.invalidJson', {
        command,
        timeoutMs,
        promptAccessibility,
        executable,
        exitCode: code,
        signal,
        stdout: payloadRaw,
        stderr: stderr.trim(),
        error: e?.message || '',
      });
      reject(error);
      return;
    }

    logBridgeEvent('spawnBridge.exit', {
      command,
      timeoutMs,
      promptAccessibility,
      executable,
      exitCode: code,
      signal,
      payload,
      stderr: stderr.trim(),
    });
    resolve({ code, signal, payload, stderr: stderr.trim() });
  });

  return promise;
}

async function fetchSelectedText({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const first = await spawnBridge('selected-text', { timeoutMs, promptAccessibility: false });
    const result = normalizeBridgePayload(first.payload);
    if (result.status === 'ok') return result;

    if (
      result.code === 'accessibility_permission_denied' &&
      Date.now() - lastPromptAttempt > PROMPT_BACKOFF_MS
    ) {
      lastPromptAttempt = Date.now();
      const retry = await spawnBridge('selected-text', {
        timeoutMs,
        promptAccessibility: true,
      });
      return normalizeBridgePayload(retry.payload);
    }

    return result;
  } catch (error) {
    if (error?.message === 'SWIFT_BRIDGE_NOT_AVAILABLE') {
      return { status: 'error', code: 'bridge_missing', text: '' };
    }
    if (error?.message === 'SWIFT_BRIDGE_TIMEOUT') {
      return { status: 'error', code: 'timeout', text: '' };
    }
    if (process.env.DEBUG || process.argv.includes('--dev')) {
    }
    return { status: 'error', code: 'invoke_failed', text: '' };
  }
}

function isClipboardPopupActive() {
  if (!clipboardPopupProcess) return false;

  // Check if process is still running
  try {
    // Sending signal 0 doesn't actually kill the process, just checks if it exists
    process.kill(clipboardPopupProcess.pid, 0);
    return true;
  } catch (e) {
    clipboardPopupProcess = null;
    return false;
  }
}

function closeClipboardPopup() {
  if (!clipboardPopupProcess) return false;

  try {
    logBridgeEvent('closeClipboardPopup.start', {
      pid: clipboardPopupProcess.pid,
    });

    clipboardPopupProcess.kill('SIGTERM');
    clipboardPopupProcess = null;

    logBridgeEvent('closeClipboardPopup.success');
    return true;
  } catch (e) {
    logBridgeEvent('closeClipboardPopup.error', {
      message: e?.message || '',
    });
    clipboardPopupProcess = null;
    return false;
  }
}

function updateClipboardPopup(historyItems, options = {}) {
  if (!clipboardPopupProcess) return false;

  try {
    // Cache history items for richText lookup during paste (full data)
    cachedHistoryItems = historyItems;

    // Prepare items for Swift popup (max 1030 items total)
    // Swift separates them into History tab (1000 text items) and HistoryImage tab (30 image items)
    // richText is excluded here for performance - it will be fetched on-demand during paste
    const items = historyItems
      .filter((item) => (item.text && typeof item.text === 'string') || item.imageData)
      .slice(0, 1030)
      .map((item) => ({
        text: item.text || null,
        imageData: item.imageData || null,
        imageDataOriginal: item.imageDataOriginal || null,
        timestamp: item.timestamp || Date.now(),
        // richText excluded for performance - fetched on-demand via request_richtext
      }));

    if (items.length === 0) {
      return false;
    }

    const update = {
      type: 'update',
      items,
      isDarkMode: options.isDarkMode || false,
      opacity: options.opacity || 1.0,
    };

    const updateJSON = JSON.stringify(update);
    clipboardPopupProcess.stdin.write(updateJSON + '\n');

    logBridgeEvent('updateClipboardPopup.success', {
      itemCount: items.length,
    });

    return true;
  } catch (e) {
    logBridgeEvent('updateClipboardPopup.error', {
      message: e?.message || '',
    });
    return false;
  }
}

async function spawnClipboardPopup(historyItems, options = {}) {
  const { promise, resolve, reject } = Promise.withResolvers();

  const executable = resolveExecutablePath();
  if (!executable) {
    logBridgeEvent('spawnClipboardPopup.notFound');
    reject(new Error('SWIFT_BRIDGE_NOT_AVAILABLE'));
    return promise;
  }

  // Cache history items for richText lookup during paste (full data)
  cachedHistoryItems = historyItems;

  // Prepare items for Swift popup (max 1030 items total)
  // Swift separates them into History tab (1000 text items) and HistoryImage tab (30 image items)
  // richText is excluded here for performance - it will be fetched on-demand during paste
  const items = historyItems
    .filter((item) => (item.text && typeof item.text === 'string') || item.imageData)
    .slice(0, 1030)
    .map((item) => ({
      text: item.text || null,
      imageData: item.imageData || null,
      imageDataOriginal: item.imageDataOriginal || null,
      timestamp: item.timestamp || Date.now(),
      // richText excluded for performance - fetched on-demand via request_richtext
    }));

  if (items.length === 0) {
    logBridgeEvent('spawnClipboardPopup.noItems');
    reject(new Error('NO_CLIPBOARD_ITEMS'));
    return promise;
  }

  const path = require('path');
  const { app } = require('electron');

  const input = {
    items,
    // Position is now automatically determined by Swift using cursor location
    // No need to pass position from Electron
    isDarkMode: options.isDarkMode || false,
    opacity: options.opacity || 1.0,
    activeTab: options.activeTab || 'history',
    snippetDataPath: path.join(app.getPath('userData'), 'snippets.json'),
  };

  const inputJSON = JSON.stringify(input);

  const child = spawn(executable, ['clipboard-popup'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  // Store the process reference
  clipboardPopupProcess = child;

  logBridgeEvent('spawnClipboardPopup.start', {
    itemCount: items.length,
    childPid: child.pid,
  });

  let stdout = '';
  let stderr = '';

  child.stdin.write(inputJSON + '\n');

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.once('error', (error) => {
    logBridgeEvent('spawnClipboardPopup.error', {
      message: error?.message || '',
      code: error?.code || '',
    });
    clipboardPopupProcess = null;
    reject(error);
  });

  child.once('exit', (code, signal) => {
    const payloadRaw = (stdout || '').trim();
    let payload = null;

    if (payloadRaw) {
      try {
        const lastLine = payloadRaw.split('\n').filter(Boolean).pop() || payloadRaw;
        payload = JSON.parse(lastLine);
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    logBridgeEvent('spawnClipboardPopup.exit', {
      exitCode: code,
      signal,
      payload,
      stderr: stderr.trim(),
    });

    clipboardPopupProcess = null;

    // Return payload so caller can handle pasted item
    resolve({ code, signal, payload, stderr: stderr.trim() });
  });

  return promise;
}

function normalizeBridgePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'error', code: 'invalid_payload', text: '' };
  }

  if (payload.status === 'ok') {
    return {
      status: 'ok',
      text: typeof payload.text === 'string' ? payload.text : '',
      source: payload.source || 'unknown',
    };
  }

  return {
    status: 'error',
    code: payload.code || 'unknown',
    message: payload.message || '',
    text: '',
  };
}

// Daemon Mode Functions

function startClipboardDaemon() {
  if (daemonState !== 'stopped' && daemonState !== 'error') return;

  const executable = resolveExecutablePath();
  if (!executable) {
    logBridgeEvent('daemon.start.notFound');
    return;
  }

  daemonState = 'starting';

  clipboardDaemonProcess = spawn(executable, ['daemon'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  logBridgeEvent('daemon.start', { pid: clipboardDaemonProcess.pid });

  let stdoutBuffer = '';

  clipboardDaemonProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleDaemonEvent(event);
      } catch (e) {
        logBridgeEvent('daemon.stdout.parseError', { line, error: e.message });
      }
    }
  });

  clipboardDaemonProcess.stderr.on('data', (chunk) => {
    logBridgeEvent('daemon.stderr', { data: chunk.toString() });
  });

  clipboardDaemonProcess.on('exit', (code, signal) => {
    logBridgeEvent('daemon.exit', { code, signal });
    daemonState = 'stopped';
    clipboardDaemonProcess = null;
    stopHealthCheck();
    maybeRestartDaemon();
  });

  clipboardDaemonProcess.on('error', (error) => {
    logBridgeEvent('daemon.error', { message: error.message });
    daemonState = 'error';
  });
}

function stopClipboardDaemon() {
  stopHealthCheck();
  stopPeriodicRestart();
  if (clipboardDaemonProcess) {
    sendDaemonCommand('shutdown');
    setTimeout(() => {
      if (clipboardDaemonProcess) {
        try {
          clipboardDaemonProcess.kill('SIGTERM');
        } catch {}
      }
    }, 1000);
  }
  daemonState = 'stopped';
  clipboardDaemonProcess = null;
}

function handleDaemonEvent(event) {
  logBridgeEvent('daemon.event', { event: event.event });

  switch (event.event) {
    case 'ready':
      daemonState = 'ready';
      startHealthCheck();
      startPeriodicRestart();
      break;

    case 'pong':
      if (pendingHealthCheck) {
        clearTimeout(pendingHealthCheck.timeout);
        pendingHealthCheck = null;
      }
      break;

    case 'request_richtext':
      // Swift is requesting richText data for paste operation
      // Find the item by timestamp and send back the richText
      {
        const timestamp = event.timestamp;
        const richText = findRichTextByTimestamp(timestamp);
        logBridgeEvent('daemon.requestRichtext', {
          timestamp,
          hasRichText: !!richText,
        });
        sendDaemonCommand('provide_richtext', { timestamp, richText });
      }
      break;

    case 'request_more_items':
      // Swift is requesting more items for lazy loading
      {
        const offset = event.offset || 0;
        const activeTab = event.activeTab || 'history';
        const batchSize = 60;

        // Filter items based on tab type
        const allFiltered = cachedHistoryItems.filter((item) => {
          if (activeTab === 'history') {
            return item.text && typeof item.text === 'string' && item.text.length > 0;
          } else if (activeTab === 'historyImage') {
            return item.imageData && (!item.text || item.text.length === 0);
          }
          return false;
        });

        // Get next batch of items
        const moreItems = allFiltered.slice(offset, offset + batchSize).map((item) => ({
          text: item.text || null,
          imageData: item.imageData || null,
          imageDataOriginal: item.imageDataOriginal || null,
          timestamp: item.timestamp || Date.now(),
          richText: item.richText || null,
        }));

        logBridgeEvent('daemon.requestMoreItems', {
          offset,
          activeTab,
          sentCount: moreItems.length,
          totalCount: allFiltered.length,
        });

        sendDaemonCommand('provide_more_items', {
          items: moreItems,
          activeTab,
          offset,
        });
      }
      break;

    case 'item_pasted':
      logBridgeEvent('daemon.itemPasted', {
        hasText: !!event.text,
        hasImage: !!event.imageDataOriginal,
      });
      daemonState = 'ready';
      break;

    case 'hidden':
      daemonState = 'ready';
      break;

    case 'error':
      logBridgeEvent('daemon.event.error', { code: event.code, message: event.message });
      break;
  }
}

/**
 * Find richText data by timestamp from cached history items
 * @param {number} timestamp - The timestamp to search for
 * @returns {object|null} - The richText object or null if not found
 */
function findRichTextByTimestamp(timestamp) {
  if (!timestamp || !cachedHistoryItems || cachedHistoryItems.length === 0) {
    return null;
  }
  const item = cachedHistoryItems.find((i) => i.timestamp === timestamp);
  return item?.richText || null;
}

function startHealthCheck() {
  stopHealthCheck();
  healthCheckTimer = setInterval(() => {
    if (daemonState !== 'ready' && daemonState !== 'showing') return;
    pendingHealthCheck = {
      timeout: setTimeout(() => {
        logBridgeEvent('daemon.healthCheck.timeout');
        if (clipboardDaemonProcess) {
          try {
            clipboardDaemonProcess.kill('SIGKILL');
          } catch {}
        }
      }, DAEMON_HEALTH_CHECK_TIMEOUT_MS),
    };
    sendDaemonCommand('ping');
  }, DAEMON_HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (pendingHealthCheck) {
    clearTimeout(pendingHealthCheck.timeout);
    pendingHealthCheck = null;
  }
}

function startPeriodicRestart() {
  stopPeriodicRestart();
  periodicRestartTimer = setInterval(() => {
    // Only restart when daemon is idle (ready state, not showing popup)
    if (daemonState === 'ready') {
      logBridgeEvent('daemon.periodicRestart');
      performPeriodicRestart();
    }
  }, DAEMON_PERIODIC_RESTART_MS);
}

function stopPeriodicRestart() {
  if (periodicRestartTimer) {
    clearInterval(periodicRestartTimer);
    periodicRestartTimer = null;
  }
}

function performPeriodicRestart() {
  // Graceful restart: stop and start daemon
  stopHealthCheck();
  stopPeriodicRestart();

  if (clipboardDaemonProcess) {
    sendDaemonCommand('shutdown');

    // Give daemon time to shutdown gracefully, then restart
    setTimeout(() => {
      if (clipboardDaemonProcess) {
        try {
          clipboardDaemonProcess.kill('SIGTERM');
        } catch {}
      }
      clipboardDaemonProcess = null;
      daemonState = 'stopped';

      // Restart after a short delay
      setTimeout(() => {
        startClipboardDaemon();
      }, 500);
    }, 1000);
  }
}

function maybeRestartDaemon() {
  const now = Date.now();
  daemonRestartHistory = daemonRestartHistory.filter((t) => now - t < DAEMON_RESTART_WINDOW_MS);

  if (daemonRestartHistory.length >= DAEMON_MAX_RESTART_COUNT) {
    logBridgeEvent('daemon.restart.tooMany');
    daemonState = 'error';
    return;
  }

  daemonRestartHistory.push(now);
  setTimeout(() => {
    startClipboardDaemon();
  }, 1000);
}

function sendDaemonCommand(command, payload = null) {
  if (!clipboardDaemonProcess || daemonState === 'stopped') {
    return false;
  }
  const message = payload ? { command, payload } : { command };
  try {
    clipboardDaemonProcess.stdin.write(JSON.stringify(message) + '\n');
    return true;
  } catch (e) {
    logBridgeEvent('daemon.send.error', { command, error: e.message });
    return false;
  }
}

function isDaemonReady() {
  return daemonState === 'ready';
}

function getDaemonState() {
  return daemonState;
}

async function showClipboardPopupFast(historyItems, options = {}) {
  if (daemonState === 'ready') {
    // Cache all items for lazy loading
    cachedHistoryItems = historyItems;

    // Filter and prepare initial batch
    const allFiltered = historyItems.filter(
      (item) => (item.text && typeof item.text === 'string') || item.imageData
    );

    const initialBatchSize = 60;
    const items = allFiltered.slice(0, initialBatchSize).map((item) => ({
      text: item.text || null,
      imageData: item.imageData || null,
      imageDataOriginal: item.imageDataOriginal || null,
      timestamp: item.timestamp || Date.now(),
      richText: item.richText || null,
    }));

    if (items.length === 0) {
      return { error: 'NO_CLIPBOARD_ITEMS' };
    }

    const sent = sendDaemonCommand('show', {
      items,
      isDarkMode: options.isDarkMode || false,
      opacity: options.opacity || 1.0,
      activeTab: options.activeTab || 'history',
      snippetDataPath: path.join(app.getPath('userData'), 'snippets.json'),
      totalItemCount: allFiltered.length,
    });

    if (sent) {
      daemonState = 'showing';
      logBridgeEvent('showClipboardPopupFast.sent', {
        itemCount: items.length,
        totalCount: allFiltered.length,
      });
      return { fast: true };
    }
  }

  logBridgeEvent('showClipboardPopupFast.fallback', { state: daemonState });
  return spawnClipboardPopup(historyItems, options);
}

function hideClipboardPopupFast() {
  if (daemonState === 'showing') {
    sendDaemonCommand('hide');
    return true;
  }
  return closeClipboardPopup();
}

function isDaemonPopupShowing() {
  return daemonState === 'showing';
}

module.exports = {
  fetchSelectedText,
  spawnClipboardPopup,
  isClipboardPopupActive,
  closeClipboardPopup,
  updateClipboardPopup,
  startClipboardDaemon,
  stopClipboardDaemon,
  isDaemonReady,
  getDaemonState,
  showClipboardPopupFast,
  hideClipboardPopupFast,
  isDaemonPopupShowing,
};
