import { dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

let updateAvailable = false;

export const isUpdateAvailable = (): boolean => updateAvailable;

export function initUpdater(): void {
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;

  autoUpdater.on('error', (error) => {
    dialog.showErrorBox('Napaka', error == null ? 'unknown' : (error.stack || error).toString());
  });

  autoUpdater.on('update-available', async () => {
    updateAvailable = true;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Nova verzija na voljo',
      message: 'Na voljo je nova verzija programa. Ali jo želite namestiti zdaj?',
      buttons: ['Da', 'Ne'],
    });

    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        console.error('Error downloading update:', error);
        dialog.showErrorBox(
          'Napaka pri posodobitvi',
          'Prišlo je do napake pri prenosu posodobitve. Prosimo, poskusite ponovno.',
        );
      }
    }
  });

  autoUpdater.on('update-not-available', () => {
    updateAvailable = false;
  });

  autoUpdater.on('update-downloaded', async () => {
    await dialog.showMessageBox({
      title: 'Namestitev posodobitve',
      message: 'Posodobitev je pripravljena. Program se bo zdaj zaprl in posodobil...',
    });
    setImmediate(() => autoUpdater.quitAndInstall());
  });

  autoUpdater.checkForUpdates().catch((e) => console.error('Update check failed', e));
}
