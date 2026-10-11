const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ccApi', {
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onMedia: (cb) => ipcRenderer.on('media', (_e, m) => cb(m)),
  media: (cmd) => ipcRenderer.send('media-cmd', cmd),
  onDemo: (cb) => ipcRenderer.on('demo', () => cb()),
  mouseOver: (over) => ipcRenderer.send('mouse-over', over),
  decide: (id, behavior) => ipcRenderer.send('decide', id, behavior),
  dismiss: (id) => ipcRenderer.send('dismiss', id),
  copy: (text) => ipcRenderer.send('copy', text),
  getDetail: (sid, n) => ipcRenderer.invoke('get-detail', sid, n),
  getTranscript: (sid) => ipcRenderer.invoke('get-transcript', sid),
});
