const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const pty = require('node-pty');

const sessions = new Map();

function defaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  if (process.platform === 'darwin') {
    return process.env.SHELL || '/bin/zsh';
  }
  return process.env.SHELL || '/bin/bash';
}

function spawnPty(opts) {
  const shell = opts.shell || defaultShell();
  const args = Array.isArray(opts.args) ? opts.args : [];
  const cwd = opts.cwd || os.homedir();
  return pty.spawn(shell, args, {
    name: 'xterm-color',
    cols: opts.cols || 80,
    rows: opts.rows || 24,
    cwd,
    env: { ...process.env }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0e0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.on('closed', () => {
    for (const { proc } of sessions.values()) {
      try {
        proc.kill();
      } catch (err) {
        // ignore
      }
    }
    sessions.clear();
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  ipcMain.handle('layout:load', async () => {
    const layoutPath = path.join(app.getAppPath(), 'layout.json');
    const raw = await fs.readFile(layoutPath, 'utf8');
    return JSON.parse(raw);
  });

  ipcMain.handle('terminal:create', (event, opts = {}) => {
    const id = crypto.randomUUID();
    const proc = spawnPty(opts);

    const onData = (data) => {
      win.webContents.send('terminal:data', { id, data });
    };
    const onExit = (evt) => {
      win.webContents.send('terminal:exit', { id, exitCode: evt.exitCode });
    };

    proc.onData(onData);
    proc.onExit(onExit);

    sessions.set(id, { proc, opts });
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

    try {
      session.proc.kill();
    } catch (err) {
      // ignore
    }

    const proc = spawnPty(session.opts);
    proc.onData((data) => {
      win.webContents.send('terminal:data', { id, data });
    });
    proc.onExit((evt) => {
      win.webContents.send('terminal:exit', { id, exitCode: evt.exitCode });
    });

    sessions.set(id, { proc, opts: session.opts });
    return { ok: true };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
