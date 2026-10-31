const { contextBridge, ipcRenderer } = require('electron');

// 只暴露文档同步需要的最小接口，渲染进程拿不到 Node / fs
contextBridge.exposeInMainWorld('healthDesktop', {
  readCsv: () => ipcRenderer.invoke('csv:read'),
  upsertDay: (payload) => ipcRenderer.invoke('csv:upsert', payload),
  removeDay: (payload) => ipcRenderer.invoke('csv:remove', payload),
  csvPath: () => ipcRenderer.invoke('csv:path')
});
