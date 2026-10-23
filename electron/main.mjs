import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { copyFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { CopilotApplication } from '../backend/application.mjs';
import { exportM3U } from '../backend/library.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const devURL = process.env.DJ_COPILOT_DEV === '1' ? 'http://127.0.0.1:5173' : null;
if (process.env.DJ_COPILOT_DATA_DIR) app.setPath('userData', process.env.DJ_COPILOT_DATA_DIR);
app.setName('DJ Copilot IA');
let window, service;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      service = new CopilotApplication({
        databasePath: join(app.getPath('userData'), 'library.sqlite'),
      });
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1024,
        minHeight: 720,
        backgroundColor: '#101214',
        title: 'DJ Copilot IA',
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(root, 'electron/preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      const handle = (name, fn) =>
        ipcMain.handle(name, async (event, ...args) => {
          if (
            event.sender !== window?.webContents ||
            event.senderFrame !== window.webContents.mainFrame
          )
            return { ok: false, error: 'Origen no autorizado.' };
          try {
            return { ok: true, value: await fn(...args) };
          } catch (error) {
            service.log('error', error.message);
            return { ok: false, error: error.message };
          }
        });
      handle('copilot:snapshot', () => service.snapshot());
      handle('copilot:command', (action, payload) => service.command(action, payload));
      handle('copilot:import', async () => {
        const choice = await dialog.showOpenDialog(window, {
          title: 'Seleccionar carpeta de MP3',
          properties: ['openDirectory'],
        });
        if (choice.canceled) return null;
        return service.import(choice.filePaths[0]);
      });
      handle('copilot:export', async () => {
        const text = exportM3U(service.db.queue(service.playlistId));
        const choice = await dialog.showSaveDialog(window, {
          title: 'Exportar playlist para Mixxx',
          defaultPath: 'DJ-Copilot-set.m3u8',
          filters: [{ name: 'Playlist UTF-8', extensions: ['m3u8'] }],
        });
        if (choice.canceled) return null;
        // File choices are made in the native dialog, never arbitrary renderer paths.
        if (!/\.m3u8?$/i.test(choice.filePath)) throw new Error('Usá la extensión .m3u8 o .m3u.');
        await writeFile(choice.filePath, text, 'utf8');
        service.log('success', 'Playlist exportada. Importala en Mixxx y verificá el orden.');
        return { path: choice.filePath };
      });
      handle('copilot:mapping', async () => {
        const choice = await dialog.showOpenDialog(window, {
          title: 'Guardar copia del mapeo en una carpeta',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (choice.canceled) return null;
        const names = ['DJ-Copilot-IA.midi.xml', 'DJ-Copilot-IA-scripts.js'];
        // Preflight both files; never overwrite any existing mapping.
        for (const name of names) {
          try {
            await access(join(choice.filePaths[0], name));
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          throw new Error(
            'Ya existe un archivo DJ-Copilot-IA en esa carpeta. Elegí una carpeta vacía.',
          );
        }
        for (const name of names)
          await copyFile(
            join(root, 'mixxx', name),
            join(choice.filePaths[0], name),
            constants.COPYFILE_EXCL,
          );
        return { path: choice.filePaths[0] };
      });
      service.on('state', (state) => {
        if (window && !window.isDestroyed()) window.webContents.send('copilot:state', state);
      });
      if (devURL) await window.loadURL(devURL);
      else await window.loadFile(join(root, 'dist/index.html'));
      window.on('closed', () => {
        window = null;
      });
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (service?.importing) {
      event.preventDefault();
      dialog.showErrorBox(
        'Importación en curso',
        'Esperá a que termine la lectura de los MP3 antes de cerrar.',
      );
      return;
    }
    if (service && !service.closed) service.close();
  });
}
