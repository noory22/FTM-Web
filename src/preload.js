const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  // ============= CONFIGURATION API =============
  readConfigFile: () => ipcRenderer.invoke("read-config-file"),
  writeConfigFile: (configs) => ipcRenderer.invoke("write-config-file", configs),
  deleteConfigFile: (configName) => ipcRenderer.invoke("delete-config-file", configName),
  sendProcessMode: (config) => ipcRenderer.invoke("send-process-mode", config),

  // ============= COMMAND FUNCTIONS =============
  home: () => ipcRenderer.invoke("home"),
  start: () => ipcRenderer.invoke("start"),
  stop: () => ipcRenderer.invoke("stop"),
  reset: () => ipcRenderer.invoke("reset"),
  heating: () => ipcRenderer.invoke("heating"),
  heater: () => ipcRenderer.invoke("heater"),
  heaterOff: () => ipcRenderer.invoke("heater-off"),
  retraction: () => ipcRenderer.invoke("retraction"),
  manual: () => ipcRenderer.invoke("manual"),
  clamp: () => ipcRenderer.invoke("clamp"),
  insertion: () => ipcRenderer.invoke("insertion"),
  ret: () => ipcRenderer.invoke("ret"),
  disableManualMode: () => ipcRenderer.invoke('disable-manual-mode'),
  // ============= CSV LOGGING =============
  startCSV: (config) => ipcRenderer.invoke("csv-start", config),
  appendCSV: (payload) => ipcRenderer.invoke("csv-append", payload),
  stopCSV: () => ipcRenderer.invoke("csv-stop"),
  // ============= LOG FILE MANAGEMENT =============
  getLogFiles: () => ipcRenderer.invoke("get-log-files"),
  readLogFile: (filePath) => ipcRenderer.invoke("read-log-file", filePath),
  deleteLogFile: (filePath) => ipcRenderer.invoke("delete-log-file", filePath),

  // ============= DATA FUNCTIONS =============
  readData: () => ipcRenderer.invoke("read-data"),
  // Add this to the exposed API in preload.js
  connectModbus: () => ipcRenderer.invoke("connect-modbus"),
  checkConnection: () => ipcRenderer.invoke("check-connection"),
  reconnect: () => ipcRenderer.invoke("reconnect"),
  checkEmergencyStatus: () => ipcRenderer.invoke("check-emergency-status"),
  checkPowerStatus: () => ipcRenderer.invoke("check-power-status"),

  // ============= AUTO-UPDATE API =============
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, status) => callback(status));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, progress) => callback(progress));
  }
});

// Listen for connection status updates from main process
ipcRenderer.on('modbus-status', (event, status) => {
  // Dispatch a custom event that the UI can listen for
  window.dispatchEvent(new CustomEvent('modbus-status-change', {
    detail: status
  }));
});

// Add this listener to preload.js (add it with the other listeners)
ipcRenderer.on('lls-status', (event, status) => {
  window.dispatchEvent(new CustomEvent('lls-status-change', {
    detail: status
  }));
});

// Listen for emergency status updates
ipcRenderer.on('emergency-status', (event, status) => {
  window.dispatchEvent(new CustomEvent('emergency-status-change', {
    detail: status
  }));
});

// Listen for power status updates
ipcRenderer.on('power-status', (event, status) => {
  window.dispatchEvent(new CustomEvent('power-status-change', {
    detail: status
  }));
});

// Listen for update status updates
ipcRenderer.on('update-status', (event, status) => {
  window.dispatchEvent(new CustomEvent('update-status-change', {
    detail: status
  }));
});

// Listen for update progress updates
ipcRenderer.on('update-progress', (event, progress) => {
  window.dispatchEvent(new CustomEvent('update-progress', {
    detail: progress
  }));
});
ipcRenderer.on('update_available', () => {
  alert("New update available! Downloading...");
});
ipcRenderer.on('update_ready', () => {
  const confirmUpdate = confirm("Update ready. Restart now:");
  if (confirmUpdate) {
    ipcRenderer.send('restart_app');
  }
});

// Optional: Add error handling for IPC
window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script loaded');
});
