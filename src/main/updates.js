const { app, dialog } = require('electron');

let autoUpdater;
try {
  // Lazy require to avoid issues in dev
  ({ autoUpdater } = require('electron-updater'));
} catch {}

const state = {
  initialized: false,
  checkingManually: false,
};

function setupAutoUpdates() {
  if (state.initialized) return;
  if (!app.isPackaged) return; // auto-update only in packaged apps
  if (!autoUpdater) return;

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.fullChangelog = true;

    autoUpdater.on('error', (err) => {
      if (state.checkingManually) {
        dialog.showMessageBox({
          type: 'error',
          title: 'Update Error',
          message: `Failed to check for updates: ${err?.message || 'Unknown error'}`,
        });
      }
      state.checkingManually = false;
    });

    autoUpdater.on('update-not-available', () => {
      if (state.checkingManually) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Up to Date',
          message: `${app.getName()} ${app.getVersion()} is the latest version.`,
        });
      }
      state.checkingManually = false;
    });

    autoUpdater.on('update-available', () => {
      if (state.checkingManually) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: 'Downloading the latest version in the background…',
        });
      }
    });

    autoUpdater.on('update-downloaded', () => {
      dialog
        .showMessageBox({
          type: 'question',
          buttons: ['Restart Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update Ready',
          message: 'The update was downloaded. Restart to apply it now?',
        })
        .then((res) => {
          if (res.response === 0) {
            try {
              autoUpdater.quitAndInstall();
            } catch {}
          }
        });
    });

    // Initial silent check shortly after launch
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdates().catch(() => {});
      } catch {}
    }, 10_000);

    state.initialized = true;
  } catch {}
}

async function manualCheckForUpdates() {
  if (!app.isPackaged || !autoUpdater) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Not Packaged',
      message: 'Auto-update is only available in packaged builds.',
    });
    return;
  }
  try {
    state.checkingManually = true;
    await autoUpdater.checkForUpdates();
  } catch (err) {
    state.checkingManually = false;
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: `Failed to check for updates: ${err?.message || 'Unknown error'}`,
    });
  }
}

module.exports = { setupAutoUpdates, manualCheckForUpdates };
