const root = document.getElementById('root');
const terminalSessions = new Map();
const initialCommandQueues = new Map();
const initialCommandTimers = new Map();
let paneCounter = 0;

function nextPaneId() {
  paneCounter += 1;
  return `pane-${paneCounter}`;
}

function normalizeSizes(count, sizes) {
  if (!Array.isArray(sizes) || sizes.length !== count) {
    return Array.from({ length: count }, () => 1);
  }
  const total = sizes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return Array.from({ length: count }, () => 1);
  }
  return sizes.map((value) => value / total);
}

function buildSplit(node) {
  const container = document.createElement('div');
  container.className = `split ${node.direction === 'column' ? 'column' : 'row'}`;
  const sizes = normalizeSizes(node.children.length, node.sizes);
  container.dataset.split = 'true';
  container.dataset.splitDirection = node.direction === 'column' ? 'column' : 'row';
  container.dataset.splitSizes = JSON.stringify(sizes);

  node.children.forEach((child, index) => {
    const slot = document.createElement('div');
    slot.className = 'split-slot';
    slot.appendChild(buildNode(child));
    container.appendChild(slot);
  });

  return container;
}

function buildTabs(node) {
  const container = document.createElement('div');
  container.className = 'tabs';

  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';

  const children = Array.isArray(node.children) ? node.children : [];
  const panels = [];

  children.forEach((child, index) => {
    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.className = 'tab-button';
    tabButton.textContent = child.tabTitle || child.title || child.contentId || `Tab ${index + 1}`;
    tabBar.appendChild(tabButton);

    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.appendChild(buildNode(child));
    tabContent.appendChild(panel);

    panels.push({ tabButton, panel });
  });

  const defaultIndex = Number.isFinite(node.activeIndex) ? node.activeIndex : 0;
  const maxIndex = Math.max(0, panels.length - 1);
  const initialIndex = Math.min(Math.max(defaultIndex, 0), maxIndex);

  function setActiveTab(index) {
    panels.forEach((entry, panelIndex) => {
      const isActive = panelIndex === index;
      entry.tabButton.classList.toggle('active', isActive);
      entry.panel.classList.toggle('active', isActive);
    });
    handleResize();
  }

  panels.forEach((entry, index) => {
    entry.tabButton.addEventListener('click', () => setActiveTab(index));
  });

  if (panels.length > 0) {
    setActiveTab(initialIndex);
  }

  container.appendChild(tabBar);
  container.appendChild(tabContent);
  return container;
}

function buildPane(node) {
  const paneId = nextPaneId();
  const pane = document.createElement('div');
  pane.className = 'pane';

  const titlebar = document.createElement('div');
  titlebar.className = 'titlebar';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = node.title || 'Pane';

  const refresh = document.createElement('button');
  refresh.className = 'refresh';
  refresh.type = 'button';
  refresh.textContent = 'Refresh';

  titlebar.appendChild(title);
  titlebar.appendChild(refresh);

  const content = document.createElement('div');
  content.className = 'content';

  pane.appendChild(titlebar);
  pane.appendChild(content);

  if (node.type === 'terminal') {
    setupTerminal(content, refresh, node, paneId);
  }

  if (node.type === 'web') {
    const webview = createWebview(node);
    const status = createWebviewStatus(content, () => loadWebviewUrl(webview, webview.dataset.initialUrl));
    attachWebviewHandlers({ webview, status, node });
    content.appendChild(webview);
    loadWebviewUrl(webview, webview.dataset.initialUrl);
    refresh.addEventListener('click', async () => {
      clearWebviewStatus(status);
      if (node.contentId && window.maxTerminal.getContent) {
        try {
          const fresh = await window.maxTerminal.getContent(node.contentId);
          const nextUrl = fresh?.url || node.url;
          if (nextUrl) {
            loadWebviewUrl(webview, nextUrl);
          } else {
            loadWebviewUrl(webview, webview.dataset.initialUrl);
          }
          return;
        } catch (err) {
          // fall through to reload
        }
      }
      loadWebviewUrl(webview, webview.dataset.initialUrl);
    });
  }

  return pane;
}

function buildNode(node) {
  if (node.type === 'split') {
    return buildSplit(node);
  }
  if (node.type === 'tabs') {
    return buildTabs(node);
  }

  return buildPane(node);
}

async function setupTerminal(container, refreshButton, node, paneId) {
  const term = new window.Terminal({
    cursorBlink: true,
    fontFamily: '"Fira Code", "Cascadia Mono", monospace',
    fontSize: 13,
    theme: {
      background: '#0e0f13',
      foreground: '#d6d6d6'
    }
  });
  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  const { id } = await window.maxTerminal.createTerminal({
    shell: node.shell,
    args: node.args,
    cwd: node.cwd,
    cols: term.cols,
    rows: term.rows,
    title: node.title
  });

  terminalSessions.set(id, { term, fitAddon, paneId });

  const initialCommands = normalizeInitialCommands(node.initialCommands);
  if (initialCommands.length > 0) {
    queueInitialCommands(id, initialCommands);
  }

  term.onData((data) => {
    window.maxTerminal.sendInput(id, data);
  });

  refreshButton.addEventListener('click', async () => {
    term.reset();
    await window.maxTerminal.refreshTerminal(id);
    window.maxTerminal.resizeTerminal(id, term.cols, term.rows);
    const refreshedCommands = normalizeInitialCommands(node.initialCommands);
    if (refreshedCommands.length > 0) {
      queueInitialCommands(id, refreshedCommands);
    }
  });
}

function handleResize() {
  for (const [id, session] of terminalSessions.entries()) {
    session.fitAddon.fit();
    window.maxTerminal.resizeTerminal(id, session.term.cols, session.term.rows);
  }
}

function createWebview(node) {
  const webview = document.createElement('webview');
  webview.className = 'webview';
  webview.setAttribute('allowpopups', '');
  webview.dataset.initialUrl = node.url || 'https://example.com';
  return webview;
}

function loadWebviewUrl(webview, url) {
  if (!webview || !url) return;
  webview.dataset.lastRequestedUrl = url;
  if (webview.dataset.domReady !== 'true' || !webview.isConnected) {
    webview.src = url;
    return;
  }
  const loadPromise = webview.loadURL(url);
  if (loadPromise && typeof loadPromise.catch === 'function') {
    loadPromise.catch((err) => {
      const code = err?.code ?? err?.errno;
      if (code === 'ERR_ABORTED' || code === -3) {
        return;
      }
      console.error('Webview load failed', err);
    });
  }
}

function createWebviewStatus(container, onReload) {
  const status = document.createElement('div');
  status.className = 'webview-status';
  status.hidden = true;

  const header = document.createElement('div');
  header.className = 'webview-status-header';

  const title = document.createElement('div');
  title.className = 'webview-status-title';
  title.textContent = 'Web view error';

  const close = document.createElement('button');
  close.className = 'webview-status-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close web view error');
  close.textContent = '×';
  close.addEventListener('click', () => {
    status.hidden = true;
    details.textContent = '';
    status.remove();
  });

  const details = document.createElement('div');
  details.className = 'webview-status-details';

  const actions = document.createElement('div');
  actions.className = 'webview-status-actions';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reload';
  retry.addEventListener('click', () => {
    status.hidden = true;
    onReload();
  });

  header.appendChild(title);
  header.appendChild(close);
  actions.appendChild(retry);
  status.appendChild(header);
  status.appendChild(details);
  status.appendChild(actions);
  container.appendChild(status);

  return { status, details, container };
}

function ensureWebviewStatusAttached(status) {
  if (!status.status.isConnected) {
    status.container.appendChild(status.status);
  }
}

function clearWebviewStatus(status) {
  status.status.hidden = true;
  status.details.textContent = '';
  status.status.remove();
}

function attachWebviewHandlers({ webview, status, node }) {
  const showStatus = (message, detail) => {
    ensureWebviewStatusAttached(status);
    status.details.textContent = detail ? `${message} - ${detail}` : message;
    status.status.hidden = false;
  };
  const isAbortError = (event) => {
    const code = Number(event?.errorCode);
    const description = String(event?.errorDescription || '').toUpperCase();
    return code === -3 || description === 'ERR_ABORTED';
  };

  webview.addEventListener('did-start-loading', () => clearWebviewStatus(status));
  webview.addEventListener('did-finish-load', () => clearWebviewStatus(status));
  webview.addEventListener('did-stop-loading', () => clearWebviewStatus(status));
  webview.addEventListener('dom-ready', () => {
    webview.dataset.domReady = 'true';
    clearWebviewStatus(status);
  });
  webview.addEventListener('did-navigate', () => clearWebviewStatus(status));
  webview.addEventListener('did-navigate-in-page', () => clearWebviewStatus(status));
  webview.addEventListener('did-start-navigation', () => clearWebviewStatus(status));
  webview.addEventListener('did-commit-navigation', () => clearWebviewStatus(status));
  webview.addEventListener('will-navigate', () => clearWebviewStatus(status));

  webview.addEventListener('did-fail-load', (event) => {
    if (!event.isMainFrame) return;
    if (isAbortError(event)) {
      clearWebviewStatus(status);
      return;
    }
    const detail = `${event.errorDescription || 'Load failed'} (${event.errorCode})`;
    showStatus('Failed to load web content', detail);
  });

  webview.addEventListener('render-process-gone', (event) => {
    const detail = event?.details?.reason
      ? `Render process gone: ${event.details.reason}`
      : 'Render process gone';
    showStatus('Web view crashed', detail);
  });

  webview.addEventListener('console-message', (event) => {
    const label = node?.title ? `webview:${node.title}` : 'webview';
    console.log(`[${label}]`, event.message);
  });
}

window.maxTerminal.onTerminalData(({ id, data }) => {
  const session = terminalSessions.get(id);
  if (!session) return;
  session.term.write(data);
  startInitialCommandQueue(id);
});

window.maxTerminal.onTerminalExit(({ id, exitCode }) => {
  const session = terminalSessions.get(id);
  if (!session) return;
  session.term.write(`\r\n[process exited ${exitCode}]\r\n`);
  clearInitialCommandQueue(id);
});

window.addEventListener('resize', handleResize);

(async () => {
  try {
    const layout = await window.maxTerminal.loadLayout();
    console.log('[layout] received layout', layout);
    if (!layout || (layout.type === 'tabs' && Array.isArray(layout.children) && layout.children.length === 0)) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No tabs found. Add JSON files under conf/tabs (files starting with "_" are ignored).';
      root.appendChild(empty);
      return;
    }
    root.appendChild(buildNode(layout));
    initSplitters(root);
    handleResize();
  } catch (err) {
    console.error('[layout] failed to build layout', err);
    const errorPane = document.createElement('div');
    errorPane.className = 'empty-state';
    errorPane.textContent = `Failed to load layout: ${err?.message || err}`;
    root.appendChild(errorPane);
  }
})();

function normalizeInitialCommands(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) => String(item).split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function queueInitialCommands(id, commands) {
  clearInitialCommandQueue(id);
  if (!commands.length) return;
  initialCommandQueues.set(id, {
    commands,
    index: 0,
    started: false
  });
  const timer = setTimeout(() => startInitialCommandQueue(id), 700);
  initialCommandTimers.set(id, timer);
}

function initSplitters(scope) {
  if (!window.Split) return;
  const containers = Array.from(scope.querySelectorAll('.split[data-split="true"]'));
  containers.forEach((container) => {
    if (container.dataset.splitInitialized === 'true') return;
    const direction = container.dataset.splitDirection === 'column' ? 'vertical' : 'horizontal';
    let sizes = [];
    try {
      sizes = JSON.parse(container.dataset.splitSizes || '[]');
    } catch (err) {
      sizes = [];
    }
    const elements = Array.from(container.querySelectorAll(':scope > .split-slot'));
    if (elements.length < 2) return;

    window.Split(elements, {
      direction,
      sizes: sizes.length === elements.length ? sizes.map((size) => size * 100) : undefined,
      minSize: 120,
      gutterSize: 8,
      snapOffset: 0,
      onDrag: () => handleResize()
    });
    container.dataset.splitInitialized = 'true';
  });
}

function clearInitialCommandQueue(id) {
  const timer = initialCommandTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    initialCommandTimers.delete(id);
  }
  initialCommandQueues.delete(id);
}

function startInitialCommandQueue(id) {
  const queue = initialCommandQueues.get(id);
  if (!queue || queue.started) return;
  queue.started = true;
  const timer = initialCommandTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    initialCommandTimers.delete(id);
  }
  sendNextInitialCommand(id);
}

function sendNextInitialCommand(id) {
  const queue = initialCommandQueues.get(id);
  if (!queue) return;
  const command = queue.commands[queue.index];
  if (command) {
    const payload = `${command}\r\n`;
    window.maxTerminal.sendInput(id, payload);
  }
  queue.index += 1;
  if (queue.index >= queue.commands.length) {
    initialCommandQueues.delete(id);
    return;
  }
  setTimeout(() => sendNextInitialCommand(id), 3000);
}
