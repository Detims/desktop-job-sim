const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  getState: () => ipcRenderer.invoke('state:get'),
  startJob: () => ipcRenderer.invoke('job:start'),
  cancelJob: () => ipcRenderer.invoke('job:cancel'),
  openManagement: () => ipcRenderer.invoke('management:open'),
  moveWindowBy: (dx, dy) => ipcRenderer.invoke('window:move-by', { dx, dy }),
  setEnergyNearZero: () => ipcRenderer.invoke('test:set-energy-near-zero'),
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  }
});
