const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const pty = require('node-pty');

const sessions = new Map();
let isQuitting = false;
const appIconPath = path.join(__dirname, '..', 'max_terminal_icon.png');
const defaultTerminalShell = 'C:/Program Files/Git/bin/bash.exe';
const defaultTerminalArgs = ['--login', '-i'];

// Prefer GPU acceleration for WebGL-heavy webviews when available.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

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
    const projects = await loadProjects();
    if (projects && Array.isArray(projects.projects) && projects.projects.length > 0) {
      const { layout, content: projectContent } = buildFromProjects(projects);
      return mergeLayoutWithContent(layout, { ...projectContent, ...content });
    }

    const layoutPath = path.join(app.getAppPath(), 'layout.json');
    const raw = await fs.readFile(layoutPath, 'utf8');
    const layout = JSON.parse(raw);
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

async function loadContent() {
  const contentPath = path.join(app.getAppPath(), 'content.json');
  try {
    const contentRaw = await fs.readFile(contentPath, 'utf8');
    return JSON.parse(contentRaw);
  } catch (err) {
    return {};
  }
}

async function loadProjects() {
  const projectsPath = path.join(app.getAppPath(), 'projects.json');
  try {
    const projectsRaw = await fs.readFile(projectsPath, 'utf8');
    return JSON.parse(projectsRaw);
  } catch (err) {
    return null;
  }
}

function buildFromProjects(projectsConfig = {}) {
  const globals = projectsConfig.globals || {};
  const sshHost = globals.sshHost || '';
  const sshKey = globals.sshKey || '';
  const shell = globals.shell || defaultTerminalShell;
  const args = Array.isArray(globals.shellArgs) ? globals.shellArgs : defaultTerminalArgs;

  const layout = {
    type: 'tabs',
    activeIndex: 0,
    children: projectsConfig.projects.map((project) => ({
      type: 'split',
      tabTitle: project.title || project.id,
      direction: 'row',
      sizes: [0.6, 0.4],
      children: [
        { contentId: `${project.id}Website` },
        {
          type: 'tabs',
          activeIndex: 0,
          children: [
            { contentId: `${project.id}WebCodex`, tabTitle: 'Codex' },
            { contentId: `${project.id}WebRun`, tabTitle: 'Run Dev' },
            { contentId: `${project.id}Github`, tabTitle: 'Github' },
            { contentId: `${project.id}Bash`, tabTitle: 'Bash' }
          ]
        }
      ]
    }))
  };

  const content = {};
  for (const project of projectsConfig.projects) {
    const baseCommands = [];
    if (sshHost) {
      const keyArg = sshKey ? ` -i ${sshKey}` : '';
      baseCommands.push(`ssh${keyArg} ${sshHost}`);
    }
    if (project.repo) {
      baseCommands.push(`cd ${project.repo}`);
    }

    content[`${project.id}WebCodex`] = {
      type: 'terminal',
      title: `${project.title || project.id} - Codex`,
      shell,
      args,
      initialCommands: [...baseCommands, 'codex']
    };

    content[`${project.id}WebRun`] = {
      type: 'terminal',
      title: `${project.title || project.id} - npm run dev`,
      shell,
      args,
      initialCommands: [...baseCommands, 'npm run dev']
    };

    content[`${project.id}Bash`] = {
      type: 'terminal',
      title: `${project.title || project.id} - Bash`,
      shell,
      args,
      initialCommands: [...baseCommands]
    };

    content[`${project.id}Website`] = {
      type: 'web',
      title: `${project.title || project.id} Website`,
      url: project.siteUrl || ''
    };

    content[`${project.id}Github`] = {
      type: 'web',
      title: `${project.title || project.id} Github`,
      url: project.githubUrl || ''
    };
  }

  return { layout, content };
}

function mergeLayoutWithContent(node, contentById) {
  if (!node || typeof node !== 'object') return node;

  if (node.type === 'split') {
    return {
      ...node,
      children: Array.isArray(node.children)
        ? node.children.map((child) => mergeLayoutWithContent(child, contentById))
        : []
    };
  }

  if (node.type === 'tabs') {
    return {
      ...node,
      children: Array.isArray(node.children)
        ? node.children.map((child) => mergeLayoutWithContent(child, contentById))
        : []
    };
  }

  if (node.contentId && contentById && contentById[node.contentId]) {
    return {
      ...node,
      ...contentById[node.contentId]
    };
  }

  return { ...node };
}

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

function disposeSession(session) {
  if (!session) return;
  try {
    session.onDataDisposable?.dispose?.();
  } catch (err) {
    // ignore
  }
  try {
    session.onExitDisposable?.dispose?.();
  } catch (err) {
    // ignore
  }
  try {
    session.proc?.kill();
  } catch (err) {
    // ignore
  }
}

function cleanupSessions() {
  for (const session of sessions.values()) {
    disposeSession(session);
  }
  sessions.clear();
}
