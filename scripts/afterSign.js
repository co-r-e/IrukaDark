// Conditional notarization hook for electron-builder
// Runs only on macOS builds and only if Apple ID credentials are provided.

const { notarize } = require('electron-notarize');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  // Only notarize when credentials are present (otherwise skip silently)
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[afterSign] Apple notarization skipped (credentials not provided).');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[afterSign] Notarizing ${appPath} with Apple ID ${appleId}`);
  await notarize({
    tool: 'notarytool',
    appBundleId: context.packager.appInfo.bundleId,
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log('[afterSign] Notarization complete.');
};
