/*!
 * Windows automation bridge via C# helper binary.
 * Compatible with macAutomationBridge.js interface.
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

function resolveLogPath() {
  if (bridgeLogPath !== null) return bridgeLogPath;
  try {
    const logsDir = app?.getPath?.('logs');
    if (!logsDir) {
      bridgeLogPath = undefined;
      return bridgeLogPath;
    }
    fs.mkdirSync(logsDir, { recursive: true });
    bridgeLogPath = path.join(logsDir, 'automation-win.log');
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
    path.join(appRoot, 'win-automation', 'IrukaAutomation.exe'),
    path.join(appRoot, 'bin', 'IrukaAutomation.exe'),
    path.join(appRoot, 'native', 'windows', 'IrukaAutomation', 'dist', 'IrukaAutomation.exe'),
    path.join(
      appRoot,
      'native',
      'windows',
      'IrukaAutomation',
      'IrukaAutomation',
      'bin',
      'Release',
      'net8.0-windows',
      'win-x64',
      'publish',
      'IrukaAutomation.exe'
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
    reject(new Error('CSHARP_BRIDGE_NOT_AVAILABLE'));
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
      reject(new Error('CSHARP_BRIDGE_TIMEOUT'));
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
      const error = new Error('CSHARP_BRIDGE_EMPTY_OUTPUT');
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
      const error = new Error('CSHARP_BRIDGE_INVALID_JSON');
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
    if (error?.message === 'CSHARP_BRIDGE_NOT_AVAILABLE') {
      return { status: 'error', code: 'bridge_missing', text: '' };
    }
    if (error?.message === 'CSHARP_BRIDGE_TIMEOUT') {
      return { status: 'error', code: 'timeout', text: '' };
    }
    return { status: 'error', code: 'invoke_failed', text: '' };
  }
}

function isClipboardPopupActive() {
  if (!clipboardPopupProcess) return false;

  try {
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
    const items = historyItems
      .filter((item) => (item.text && typeof item.text === 'string') || item.imageData)
      .slice(0, 60)
      .map((item) => ({
        text: item.text || null,
        imageData: item.imageData || null,
        imageDataOriginal: item.imageDataOriginal || null,
        timestamp: item.timestamp || Date.now(),
        richText: item.richText || null,
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
    reject(new Error('CSHARP_BRIDGE_NOT_AVAILABLE'));
    return promise;
  }

  const items = historyItems
    .filter((item) => (item.text && typeof item.text === 'string') || item.imageData)
    .slice(0, 60)
    .map((item) => ({
      text: item.text || null,
      imageData: item.imageData || null,
      imageDataOriginal: item.imageDataOriginal || null,
      timestamp: item.timestamp || Date.now(),
      richText: item.richText || null,
    }));

  if (items.length === 0) {
    logBridgeEvent('spawnClipboardPopup.noItems');
    reject(new Error('NO_CLIPBOARD_ITEMS'));
    return promise;
  }

  const input = {
    items,
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

// Event handlers that external code can subscribe to
let onClipboardChanged = null;
let onItemPasted = null;

function setClipboardChangedHandler(handler) {
  onClipboardChanged = handler;
}

function setItemPastedHandler(handler) {
  onItemPasted = handler;
}

function handleDaemonEvent(event) {
  logBridgeEvent('daemon.event', { event: event.event });

  switch (event.event) {
    case 'ready':
      daemonState = 'ready';
      startHealthCheck();
      break;

    case 'pong':
      if (pendingHealthCheck) {
        clearTimeout(pendingHealthCheck.timeout);
        pendingHealthCheck = null;
      }
      break;

    case 'clipboard_changed':
      logBridgeEvent('daemon.clipboardChanged', {
        hasText: !!event.text,
        hasImage: !!event.imageDataOriginal,
      });
      if (onClipboardChanged) {
        onClipboardChanged({
          text: event.text || null,
          imageDataOriginal: event.imageDataOriginal || null,
        });
      }
      break;

    case 'item_pasted':
      logBridgeEvent('daemon.itemPasted', {
        hasText: !!event.text,
        hasImage: !!event.imageDataOriginal,
      });
      daemonState = 'ready';
      if (onItemPasted) {
        onItemPasted({
          text: event.text || null,
          imageDataOriginal: event.imageDataOriginal || null,
        });
      }
      break;

    case 'shown':
      daemonState = 'showing';
      break;

    case 'hidden':
      daemonState = 'ready';
      break;

    case 'error':
      logBridgeEvent('daemon.event.error', { code: event.code, message: event.message });
      break;
  }
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
    const items = historyItems
      .filter((item) => (item.text && typeof item.text === 'string') || item.imageData)
      .slice(0, 60)
      .map((item) => ({
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
    });

    if (sent) {
      daemonState = 'showing';
      logBridgeEvent('showClipboardPopupFast.sent', { itemCount: items.length });
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
  setClipboardChangedHandler,
  setItemPastedHandler,
};
