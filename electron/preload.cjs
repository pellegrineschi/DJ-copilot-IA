const { contextBridge, ipcRenderer } = require('electron');

const unwrap = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

contextBridge.exposeInMainWorld(
  'copilot',
  Object.freeze({
    snapshot: () => unwrap('copilot:snapshot'),
    command: (action, payload) => unwrap('copilot:command', action, payload),
    importFolder: () => unwrap('copilot:import'),
    exportPlaylist: () => unwrap('copilot:export'),
    saveMapping: () => unwrap('copilot:mapping'),
    onState: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('copilot:state', handler);
      return () => ipcRenderer.removeListener('copilot:state', handler);
    },
  }),
);
