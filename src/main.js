const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const {
  loadContent,
  loadLayout,
  mergeLayoutWithContent
} = require('./builders/layout_builder');
const {
  sessions,
  spawnPty,
  cleanupSessions, disposeSession
} = require('./builders/terminal_builder');
const crypto = require('crypto');

let isQuitting = false;
const appIconPath = path.join(__dirname, '..', 'max_terminal_icon.png');

// Prefer GPU acceleration for WebGL-heavy webviews when available.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: appIconPath,
    backgroundColor: '#0e0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:main',
      webviewTag: true
    }
  });

  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.on('closed', () => {
    cleanupSessions();
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  ipcMain.handle('layout:load', async () => {
    const content = await loadContent();
    const layout = await loadLayout();
    return mergeLayoutWithContent(layout, content);
  });

  ipcMain.handle('content:get', async (event, { id } = {}) => {
    const content = await loadContent();
    if (!id) return content;
    return content[id] || null;
  });

  ipcMain.handle('terminal:create', (event, opts = {}) => {
    const id = crypto.randomUUID();
    const proc = spawnPty(opts);

    const onDataDisposable = proc.onData((data) => {
      safeSend(win, 'terminal:data', { id, data });
    });
    const onExitDisposable = proc.onExit((evt) => {
      safeSend(win, 'terminal:exit', { id, exitCode: evt.exitCode });
    });

    sessions.set(id, { proc, opts, onDataDisposable, onExitDisposable });
    return { id };
  });

  ipcMain.on('terminal:input', (event, { id, data }) => {
    const session = sessions.get(id);
    if (!session) return;
    session.proc.write(data);
  });

  ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
    const session = sessions.get(id);
    if (!session) return;
    session.proc.resize(cols, rows);
  });

  ipcMain.handle('terminal:refresh', (event, { id }) => {
    const session = sessions.get(id);
    if (!session) return { ok: false };

    disposeSession(session);

    const proc = spawnPty(session.opts);
    const onDataDisposable = proc.onData((data) => {
      safeSend(win, 'terminal:data', { id, data });
    });
    const onExitDisposable = proc.onExit((evt) => {
      safeSend(win, 'terminal:exit', { id, exitCode: evt.exitCode });
    });

    sessions.set(id, { proc, opts: session.opts, onDataDisposable, onExitDisposable });
    return { ok: true };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  cleanupSessions();
});

function safeSend(win, channel, payload) {
  if (isQuitting) return;
  if (!win || win.isDestroyed()) return;
  if (!win.webContents || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}
