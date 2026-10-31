const { app, BrowserWindow, Menu, shell, session, ipcMain } = require('electron');
const path = require('path');

/* ---------------- 与本机 CSV 文档同步 ---------------- */
// 把系统桌面目录交给存储模块（Windows/macOS 都适用）
try { process.env.HB_DESKTOP = app.getPath('desktop'); } catch (e) {}
const store = require('./csv-store');

ipcMain.handle('csv:read', () => store.read());
ipcMain.handle('csv:upsert', (_e, payload) => store.upsert(payload));
ipcMain.handle('csv:remove', (_e, payload) => store.remove(payload));
ipcMain.handle('csv:path', () => store.CSV_PATH);

/* ---------------- 窗口 ---------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 580,
      height: 920,
      minWidth: 420,
      minHeight: 640,
      backgroundColor: '#f4f6f5',
      title: '健康 Buddy',
      icon: path.join(__dirname, 'build', 'icon.ico'),
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    });

    mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file://')) {
        e.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
      }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
