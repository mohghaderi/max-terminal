const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maxTerminal', {
  loadLayout: () => ipcRenderer.invoke('layout:load'),
  getContent: (id) => ipcRenderer.invoke('content:get', { id }),
  createTerminal: (opts) => ipcRenderer.invoke('terminal:create', opts),
  refreshTerminal: (id) => ipcRenderer.invoke('terminal:refresh', { id }),
  showTerminalContextMenu: (id, hasSelection) =>
    ipcRenderer.invoke('terminal:show-context-menu', { id, hasSelection }),
  sendInput: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', { text }),
  onTerminalData: (handler) => ipcRenderer.on('terminal:data', (_, payload) => handler(payload)),
  onTerminalExit: (handler) => ipcRenderer.on('terminal:exit', (_, payload) => handler(payload)),
  onTerminalContextMenuAction: (handler) =>
    ipcRenderer.on('terminal:context-menu-action', (_, payload) => handler(payload))
});
