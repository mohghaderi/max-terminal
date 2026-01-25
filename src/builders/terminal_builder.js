const os = require('os');
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

module.exports = {
  sessions,
  spawnPty,
  cleanupSessions,
  disposeSession
};
