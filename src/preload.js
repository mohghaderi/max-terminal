const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maxTerminal', {
  loadLayout: () => ipcRenderer.invoke('layout:load'),
  createTerminal: (opts) => ipcRenderer.invoke('terminal:create', opts),
  refreshTerminal: (id) => ipcRenderer.invoke('terminal:refresh', { id }),
  sendInput: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  onTerminalData: (handler) => ipcRenderer.on('terminal:data', (_, payload) => handler(payload)),
  onTerminalExit: (handler) => ipcRenderer.on('terminal:exit', (_, payload) => handler(payload))
});
