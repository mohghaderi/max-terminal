const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const pty = require('node-pty');

const sessions = new Map();
let isQuitting = false;
const appIconPath = path.join(__dirname, '..', 'max_terminal_icon.png');

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

async function loadContent() {
  const candidates = resolveConfigPaths('content.json');

  let contentById = {};
  for (const contentPath of candidates) {
    try {
      const contentRaw = await fs.readFile(contentPath, 'utf8');
      const parsed = JSON.parse(contentRaw);
      contentById = { ...contentById, ...extractContentEntries(parsed) };
    } catch (err) {
      // try next location
    }
  }

  return contentById;
}

async function loadLayout() {
  const tabFiles = await loadTabFiles();
  console.log('[layout] loading tabs from:', tabFiles);
  const tabChildren = [];

  for (const tabFile of tabFiles) {
    try {
      const tabRaw = await fs.readFile(tabFile, 'utf8');
      const tabNode = JSON.parse(tabRaw);
      const fallbackTitle = path.parse(tabFile).name;
      const normalized = normalizeTabNode(tabNode, fallbackTitle);
      if (normalized) {
        const tabContent = extractContentEntries(tabNode?.content);
        if (tabContent && Object.keys(tabContent).length > 0) {
          normalized.__tabContent = tabContent;
        }
        tabChildren.push(normalized);
      }
    } catch (err) {
      console.warn(`Failed to load tab file: ${tabFile}`);
    }
  }

  return {
    type: 'tabs',
    activeIndex: 0,
    children: tabChildren,
    noTabs: tabChildren.length === 0
  };
}

async function loadTabFiles() {
  const tabFolders = resolveTabFolders();
  console.log('[layout] scanning tab folders:', tabFolders);
  const collected = [];

  for (const folder of tabFolders) {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      const tabFiles = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name.endsWith('.json'))
        .filter((name) => !name.startsWith('_'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(folder, name));

      collected.push(...tabFiles);
    } catch (err) {
      // try next location
    }
  }

  const unique = Array.from(new Set(collected)).sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) {
    console.warn('No tab files found. Checked:', tabFolders);
  }
  return unique;
}

function resolveConfigPaths(...suffixes) {
  const appPath = app.getAppPath();
  const appParent = path.dirname(appPath);
  const cwd = process.cwd();
  const bases = [appPath, appParent, cwd];

  const results = [];
  for (const base of bases) {
    for (const suffix of suffixes) {
      results.push(path.join(base, suffix));
    }
  }

  return Array.from(new Set(results));
}

function resolveTabFolders() {
  const appPath = app.getAppPath();
  const appParent = path.dirname(appPath);
  const cwd = process.cwd();
  const codeRoot = path.join(__dirname, '..');

  const bases = [appPath, appParent, cwd, codeRoot];
  const suffixes = [path.join('conf', 'tabs'), 'tabs'];

  const results = [];
  for (const base of bases) {
    for (const suffix of suffixes) {
      results.push(path.join(base, suffix));
    }
  }

  return Array.from(new Set(results));
}
function extractContentEntries(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.content && typeof raw.content === 'object' && !Array.isArray(raw.content)) {
    return { ...raw.content };
  }
  return { ...raw };
}

function normalizeTabNode(tabNode, fallbackTitle) {
  if (!tabNode || typeof tabNode !== 'object') return null;

  if (tabNode.layout && typeof tabNode.layout === 'object') {
    return {
      ...tabNode.layout,
      tabTitle: tabNode.tabTitle || fallbackTitle
    };
  }

  return {
    ...tabNode,
    tabTitle: tabNode.tabTitle || fallbackTitle
  };
}

function mergeLayoutWithContent(node, contentById, context) {
  if (!node || typeof node !== 'object') return node;

  const baseContent = contentById || {};
  const activeContent = context?.activeContent || baseContent;
  const overrides = node.__tabContent;
  const hasOverrides = overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0;
  const nextActiveContent = hasOverrides ? { ...baseContent, ...overrides } : activeContent;

  const sanitized = { ...node };
  delete sanitized.__tabContent;

  const childContext = { activeContent: nextActiveContent };

  if (sanitized.type === 'split') {
    return {
      ...sanitized,
      children: Array.isArray(sanitized.children)
        ? sanitized.children.map((child) => mergeLayoutWithContent(child, contentById, childContext))
        : []
    };
  }

  if (sanitized.type === 'tabs') {
    return {
      ...sanitized,
      children: Array.isArray(sanitized.children)
        ? sanitized.children.map((child) => mergeLayoutWithContent(child, contentById, childContext))
        : []
    };
  }

  if (sanitized.contentId && nextActiveContent[sanitized.contentId]) {
    return {
      ...sanitized,
      ...nextActiveContent[sanitized.contentId]
    };
  }

  return sanitized;
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
