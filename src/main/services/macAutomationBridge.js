/*!
 * macOS automation bridge via Swift helper binary.
 */
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 1500;
const PROMPT_BACKOFF_MS = 60_000;

let cachedExecutablePath = null;
let lastPromptAttempt = 0;
let didWarnMissing = false;
let bridgeLogPath = null;

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
  return new Promise((resolve, reject) => {
    const executable = resolveExecutablePath();
    if (!executable) {
      if (!didWarnMissing) {
        console.warn(
          'IrukaAutomation bridge executable not found. Swift automation features disabled.'
        );
        didWarnMissing = true;
      }
      logBridgeEvent('spawnBridge.notFound', {
        command,
        timeoutMs,
        promptAccessibility,
      });
      reject(new Error('SWIFT_BRIDGE_NOT_AVAILABLE'));
      return;
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
  });
}

async function fetchSelectedText({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (process.platform !== 'darwin') {
    return { status: 'unsupported', text: '' };
  }

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
      console.warn('Swift bridge invocation failed:', error);
    }
    return { status: 'error', code: 'invoke_failed', text: '' };
  }
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

module.exports = {
  fetchSelectedText,
};
