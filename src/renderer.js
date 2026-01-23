const root = document.getElementById('root');
const terminalSessions = new Map();
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
    const webview = document.createElement('webview');
    webview.src = node.url || 'https://example.com';
    webview.className = 'webview';
    webview.setAttribute('allowpopups', '');
    content.appendChild(webview);
    refresh.addEventListener('click', () => webview.reload());
  }

  return pane;
}

function buildNode(node) {
  if (node.type === 'split') {
    return buildSplit(node);
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

window.maxTerminal.onTerminalData(({ id, data }) => {
  const session = terminalSessions.get(id);
  if (!session) return;
  session.term.write(data);
});

window.maxTerminal.onTerminalExit(({ id, exitCode }) => {
  const session = terminalSessions.get(id);
  if (!session) return;
  session.term.write(`\r\n[process exited ${exitCode}]\r\n`);
});

window.addEventListener('resize', handleResize);

(async () => {
  const layout = await window.maxTerminal.loadLayout();
  root.appendChild(buildNode(layout));
  initSplitters(root);
  handleResize();
})();

function normalizeInitialCommands(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
  }
  const asString = String(value).trim();
  return asString ? [asString] : [];
}

function queueInitialCommands(id, commands) {
  setTimeout(() => {
    commands.forEach((command) => {
      const payload = command.endsWith('\n') || command.endsWith('\r')
        ? command
        : `${command}\r`;
      window.maxTerminal.sendInput(id, payload);
    });
  }, 50);
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
