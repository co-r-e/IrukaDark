/*
 * Codesign the IrukaAutomation helper during electron-builder afterSign.
 * Ensures the helper has a stable Developer ID signature so macOS TCC
 * (Accessibility) recognizes it when spawned by the app.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function detectIdentity(appPath) {
  // Prefer explicit identity from env
  const envName = process.env.CSC_NAME || process.env.MAC_CODESIGN_IDENTITY;
  if (envName && envName.trim()) return envName.trim();

  // Fallback: derive from the signed main app
  try {
    const out = execFileSync('codesign', ['-dv', '--verbose=2', appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Pick the Developer ID Application authority line
    const match = out.match(/Authority=Developer ID Application:.*\(.*\)/);
    if (match && match[0]) {
      // codesign -s accepts the full authority string
      return match[0].replace('Authority=', '').trim();
    }
  } catch {}
  return null;
}

module.exports = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename; // IrukaDark
  const appPath = path.join(appOutDir, `${productFilename}.app`);
  const helperPath = path.join(
    appPath,
    'Contents',
    'Resources',
    'mac-automation',
    'IrukaAutomation'
  );

  if (!fs.existsSync(helperPath)) {
    console.log('[afterSign] IrukaAutomation helper not found, skipping');
    return;
  }

  const identity = detectIdentity(appPath);
  if (!identity) {
    console.warn(
      '[afterSign] No signing identity detected for helper. Set CSC_NAME or ensure app is signed before afterSign.'
    );
    return;
  }

  const entitlements = path.resolve(__dirname, 'entitlements.mac.plist');
  const args = ['--force', '--options', 'runtime', '--timestamp', '-s', identity];
  if (fs.existsSync(entitlements)) {
    args.push('--entitlements', entitlements);
  }
  args.push(helperPath);

  console.log('[afterSign] codesigning helper with identity:', identity);
  try {
    execFileSync('codesign', args, { stdio: 'inherit' });
  } catch (e) {
    console.warn('[afterSign] Failed to sign helper:', e?.message || e);
    throw e;
  }

  try {
    execFileSync('codesign', ['-vv', helperPath], { stdio: 'inherit' });
  } catch {}
  console.log('[afterSign] Helper signed successfully');
};
