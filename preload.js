const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  checkBinary: () => ipcRenderer.invoke("adb:checkBinary"),
  getDevices: () => ipcRenderer.invoke("adb:devices"),
  shell: (serial, cmd) => ipcRenderer.invoke("adb:shell", serial, cmd),
  reboot: (serial, mode) => ipcRenderer.invoke("adb:reboot", serial, mode),
  shutdown: (serial) => ipcRenderer.invoke("adb:shutdown", serial),
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (cfg) => ipcRenderer.invoke("config:set", cfg),
  pickAdbPath: () => ipcRenderer.invoke("dialog:pickAdb"),
});
