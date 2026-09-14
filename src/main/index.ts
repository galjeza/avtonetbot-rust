import path from 'node:path';

import { app, BrowserWindow, protocol, shell } from 'electron';

import { AD_IMAGE_SCHEME, handleAdImageRequest } from './ad-images';
import { backfillAdImagesMetadata } from './ad-images-migration';
import { registerIpc } from './ipc';
import { initUpdater } from './updater';

const isDev = !app.isPackaged;

// Saved ad photos load through their own scheme; see handleAdImageRequest.
// Declaring it standard and secure lets the renderer treat those URLs like any
// other image source, which a non-privileged custom scheme would not allow.
protocol.registerSchemesAsPrivileged([
  { scheme: AD_IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  // Start maximized so wide tables (e.g. Obnovi oglase) show all columns.
  mainWindow.maximize();

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links belong in the user's own browser, not in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle(AD_IMAGE_SCHEME, handleAdImageRequest);
  backfillAdImagesMetadata();
  registerIpc(() => mainWindow);

  createWindow();
  if (!isDev) initUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
