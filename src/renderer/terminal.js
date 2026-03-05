const terminalSessions = new Map();
const initialCommandQueues = new Map();
const initialCommandTimers = new Map();

const DEFAULT_INIT_CMD_WAIT_TIME = 700;
const DEFAULT_SEND_CMD_WAIT_TIME = 3000;

function normalizeInitialCommands(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) => String(item).split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function clearInitialCommandQueue(id) {
  const timer = initialCommandTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    initialCommandTimers.delete(id);
  }
  initialCommandQueues.delete(id);
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
  setTimeout(() => sendNextInitialCommand(id), DEFAULT_SEND_CMD_WAIT_TIME);
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

function queueInitialCommands(id, commands) {
  clearInitialCommandQueue(id);
  if (!commands.length) return;
  initialCommandQueues.set(id, {
    commands,
    index: 0,
    started: false
  });
  const timer = setTimeout(() => startInitialCommandQueue(id), DEFAULT_INIT_CMD_WAIT_TIME);
  initialCommandTimers.set(id, timer);
}

export async function setupTerminal(container, refreshButton, node, paneId) {
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

  const onContextMenu = (event) => {
    event.preventDefault();
    window.maxTerminal.showTerminalContextMenu(id, term.hasSelection());
  };
  container.addEventListener('contextmenu', onContextMenu);

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

export function handleResize() {
  for (const [id, session] of terminalSessions.entries()) {
    session.fitAddon.fit();
    window.maxTerminal.resizeTerminal(id, session.term.cols, session.term.rows);
  }
}

function compareNodesInDocumentOrder(a, b) {
  if (a === b) return 0;
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

export function focusFirstTerminalInElement(rootElement) {
  if (!rootElement) return false;

  const matches = [];
  for (const session of terminalSessions.values()) {
    if (!session?.term?.element) continue;
    if (rootElement.contains(session.term.element)) {
      matches.push(session.term);
    }
  }

  if (!matches.length) return false;
  matches.sort((a, b) => compareNodesInDocumentOrder(a.element, b.element));

  const first = matches[0];
  if (first && typeof first.focus === 'function') {
    first.focus();
  }
  return true;
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

window.maxTerminal.onTerminalContextMenuAction(async ({ id, action }) => {
  const session = terminalSessions.get(id);
  if (!session) return;

  if (action === 'copy') {
    const selectedText = session.term.getSelection();
    if (!selectedText) return;
    await window.maxTerminal.writeClipboardText(selectedText);
    session.term.clearSelection();
    return;
  }

  if (action === 'paste') {
    const text = await window.maxTerminal.readClipboardText();
    if (!text) return;
    window.maxTerminal.sendInput(id, text);
  }
});
