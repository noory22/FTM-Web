const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");


const ModbusRTU = require("modbus-serial");
const { SerialPort } = require('serialport');
const path = require("path");
const iconPath = path.join(__dirname,'src/assets/icon.ico');
const fs = require('fs');  // Changed from fs.promises to regular fs for sync operations
const fsPromises = require('fs').promises;  // Keep for async operations

// Define isDev IMMEDIATELY after all requires
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const MAIN_WINDOW_VITE_DEV_SERVER_URL = !app.isPackaged ? 'http://localhost:5173' : null;

let mainWindow;
// ============================
// AUTO-UPDATER CONFIGURATION
// ============================

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

if (!isDev) {
  // Setup auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'Checking for updates...');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', `Update available: v${info.version}`);
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version ${info.version} is available. Do you want to download it now?`,
        buttons: ['Yes', 'No'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'No updates available');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates',
        message: 'You are running the latest version.',
        buttons: ['OK']
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errMsg = err.message || err.toString() || '';
      const isNotFoundError = errMsg.includes('404') || 
                            errMsg.toLowerCase().includes('not found') || 
                            errMsg.includes('No published versions') ||
                            errMsg.includes('latest.yml');
                            
      if (isNotFoundError) {
        console.log('No updates found (404/no releases). Treating as up-to-date.');
        mainWindow.webContents.send('update-status', 'latest');
      } else {
        mainWindow.webContents.send('update-status', `Error: ${err.message}`);
      }
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Downloaded ${progressObj.percent.toFixed(2)}%`;
    console.log(logMessage);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'Update downloaded. Ready to install.');
      
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. The application will restart to install the update.`,
        buttons: ['Restart Now'],
        defaultId: 0
      }).then(() => {
        setImmediate(() => {
          autoUpdater.quitAndInstall();
        });
      });
    }
  });
}

// ============================
// CSV LOGGING STATE
// ============================
let csvStream = null;
let csvFilePath = null;
// -------------------------
// Modbus / PLC settings - UPDATED BASED ON PYTHON CODE
// -------------------------
let PORT = null; // Auto-detected
const BAUDRATE = 9600;
const TIMEOUT = 0; // Using buffered read, timeout not as critical in this config

const COIL_POW = 1003
const COIL_EMER = 1004
const COIL_HOME = 2001;
const COIL_LLS = 1000;
const COIL_START = 2002;
const COIL_STOP = 2003;
const COIL_RESET = 2004;
const COIL_HEATING = 2012;
const COIL_HEATER = 2005;
const COIL_RETRACTION = 2006;
const COIL_MANUAL = 2070;
const COIL_INSERTION = 2008;
const COIL_RET = 2009;
const COIL_CLAMP = 2007;

const REG_DISTANCE = 70;  // 1 register (16-bit integer)
const REG_FORCE = 54;  // 2 registers (32-bit float)
const REG_TEMP = 501; // 1 register (16-bit integer)
const REG_MANUAL_DISTANCE = 6550; // 1 register (16-bit integer)

// Global State
let isConnected = false;
const client = new ModbusRTU();

// PLC Cache & Command Queue
let plcState = {
  distance: 0,
  force_mN: 0,
  temperature: 0,
  manualDistance: 0,
  coilLLS: false,
  clamp: false,
  heater: false,
  insertion: false,
  retraction: false,
  lastUpdated: 0
};

// Queue items: { id, type: 'write', task: async () => {}, resolve, reject }
const commandQueue = [];
let isLoopRunning = false;

// ============================
// CONFIGURATION FILE SETTINGS
// ============================
const CONFIG_FILE_PATH = path.join(app.getPath('documents'), 'CTTM.json');


// -------------------------
// Connect Modbus - UPDATED
// -------------------------
async function connectModbus(targetPort) {
  try {
    console.log("🔌 Attempting to connect to Modbus on", targetPort);

    // Close existing connection if any
    if (client.isOpen) {
      client.close();
    }

    await client.connectRTUBuffered(targetPort, {
      baudRate: BAUDRATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'Even'
    });

    client.setID(1);
    client.setTimeout(200); // 200ms timeout for faster disconnection detection
    isConnected = true;
    PORT = targetPort; // Update global
    console.log("✅ Modbus connected on", PORT);

    // Update UI to show connection status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('modbus-status', 'connected');
    }

    return true;
  } catch (err) {
    isConnected = false;
    return false;
  }
}

// -------------------------
// Helper: Find and Connect to Port logic
// -------------------------
async function findAndConnectPort() {
  try {
    console.log("🔍 Scanning for available COM ports...");
    const ports = await SerialPort.list();
    console.log("Found ports:", ports.map(p => p.path).join(', '));

    if (ports.length === 0) {
      console.log("⚠️ No COM ports found.");
      return false;
    }

    for (const portInfo of ports) {
      const portPath = portInfo.path;
      console.log(`👉 Trying port: ${portPath}`);

      const success = await connectModbus(portPath);
      if (success) {
        // Try to read a coil to verify responsiveness
        try {
          await client.readCoils(COIL_LLS, 1);
          console.log(`✅ Verified Modbus device on ${portPath}`);
          return true;
        } catch (readErr) {
          console.warn(`⚠️ Connected to ${portPath} but read failed. Next...`);
          isConnected = false;
          client.close();
        }
      }
    }

    console.log("❌ Could not find a valid Modbus device on any port.");
    return false;

  } catch (err) {
    console.error("Error scanning ports:", err);
    return false;
  }
}

// -------------------------
// Auto connect to port - UPDATED
// -------------------------
async function autoConnectPort() {
  try {
    console.log("🔄 Attempting auto-connect...");

    // 1. Try last known PORT first if exists
    if (PORT && await connectModbus(PORT)) {
      try {
        await client.readCoils(COIL_LLS, 1);
        console.log(`✅ Quick re-connect successful on ${PORT}`);
        return true;
      } catch (e) {
        console.log(`⚠️ Quick connect failed verify. Scanning all...`);
        isConnected = false;
        client.close();
      }
    }

    // 2. Scan all
    const connected = await findAndConnectPort();

    if (!connected) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('modbus-status', 'disconnected');
      }
    }
    return connected;
  } catch (error) {
    console.log("⚠️ Auto-connect error:", error.message);
    return false;
  }
}

// -------------------------
// Manual connect (with error dialog) - NEW FUNCTION
// -------------------------
async function manualConnectModbus() {
  try {
    console.log("🔌 Manual connection scan...");
    const connected = await autoConnectPort();

    if (!connected && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Modbus Connection Error',
        `Failed to find compatible Modbus device.\n\nPlease check:\n1. Cable connection\n2. Device power\n3. Port availability`
      );
    }

    return connected;
  } catch (error) {
    console.error("Manual connect error:", error.message);
    return false;
  }
}

// Monitoring states
let lastLLSState = false;
let lastEmerState = false;
let lastPowState = false;
let isHardwareStopActive = false;

// -------------------------
// Helper: Perform Safety Stop
// -------------------------
async function performSafetyStop(reason) {
  console.log(`⚠️ SAFETY STOP TRIGGERED: ${reason}`);

  // 1. Update internal states to STOP all movements/heaters
  coilState.retraction = false;
  coilState.heater = false;
  coilState.manualRet = false;
  coilState.heating = false;
  insertionState = false;
  retState = false;

  // 2. Clear command queue to prevent pending actions
  commandQueue.length = 0;

  // 3. Directly write STOP coil to PLC (bypassing queue for safety)
  if (!isHardwareStopActive) {
    isHardwareStopActive = true;
    try {
      if (client.isOpen) {
        await client.writeCoil(COIL_STOP, true);
        await client.writeCoil(COIL_START, false);
        await client.writeCoil(COIL_HEATER, false);
        await client.writeCoil(COIL_HEATING, false);
        await client.writeCoil(COIL_INSERTION, false);
        await client.writeCoil(COIL_RET, false);
        console.log("🛑 Global Stop coils written to PLC (Hardware Stop Active)");
      }
    } catch (err) {
      console.error("❌ Failed to write safety stop coils:", err.message);
      isHardwareStopActive = false; // Allow retry on next loop
    }
  }
}



// ============================
// CSV LOGGING FUNCTIONS
// ============================

async function startCSVLogging(config) {
  try {
    const logsDir = path.join(app.getPath("documents"), "CTTM_Logs");

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    csvFilePath = path.join(
      logsDir,
      `${config.configName || "Process"}_${timestamp}.csv`
    );

    csvStream = fs.createWriteStream(csvFilePath, { flags: "a" });

    // CSV HEADER
    csvStream.write(
      "Timestamp,Distance(mm),Force(mN),Temperature,ConfigName,PathLength,ThresholdForce,InsertionStrokeLength,RetractionStrokelength,NumberOfCurves,CurveDistances\n"
    );

    return { success: true, filePath: csvFilePath };
  } catch (error) {
    console.error("CSV start error:", error);
    return { success: false, error: error.message };
  }
}

async function appendCSVData(data, config) {
  try {
    if (!csvStream) {
      throw new Error("CSV stream not initialized");
    }

    const row = [
      new Date().toISOString(),
      data.distance,
      data.force_mN,
      data.temperature,
      config.configName,
      config.pathlength,
      config.thresholdForce,
      config.insertionLength,
      config.retractionLength,
      config.numberOfCurves,
      JSON.stringify(config.curveDistances || {})
    ].join(",") + "\n";

    csvStream.write(row);
    return { success: true };
  } catch (error) {
    console.error("CSV append error:", error);
    return { success: false, error: error.message };
  }
}

async function stopCSVLogging() {
  try {
    if (csvStream) {
      csvStream.end();
      csvStream = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getLogFiles() {
  try {
    const logsDir = path.join(app.getPath("documents"), "CTTM_Logs");

    if (!fs.existsSync(logsDir)) {
      return [];
    }

    const files = await fsPromises.readdir(logsDir);
    const csvFiles = files.filter(file => file.endsWith('.csv'));

    const logFiles = [];

    for (const file of csvFiles) {
      const filePath = path.join(logsDir, file);
      const stats = await fsPromises.stat(filePath);

      // Extract configuration name and timestamp from filename
      const fileNameWithoutExt = file.replace('.csv', '');
      const parts = fileNameWithoutExt.split('_');
      const configName = parts.slice(0, -1).join('_');
      const timestamp = parts[parts.length - 1];

      // Parse the date properly
      let formattedDate = 'Invalid Date';
      try {
        // The timestamp is in format: 2026-01-02T10-01-00-000Z
        // Extract date parts
        const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
        if (match) {
          const [_, year, month, day, hour, minute, second] = match;
          const date = new Date(year, month - 1, day, hour, minute, second);
          formattedDate = date.toLocaleString();
          console.error("Date Formatted: ", formattedDate);

        }
      } catch (e) {
        console.log('Date parsing error:', e.message);
      }

      logFiles.push({
        filename: file,
        displayName: `${configName}`,
        filePath: filePath,
        date: stats.mtime.toISOString().split('T')[0],
        time: timestamp,
        configName: configName,
        mtime: stats.mtime
      });
    }

    // Sort by modification time (newest first)
    return logFiles.sort((a, b) => b.mtime - a.mtime);


  } catch (error) {
    console.error('Error getting log files:', error);
    return [];
  }
}

async function readLogFile(filePath) {
  try {
    const data = await fsPromises.readFile(filePath, 'utf8');
    const lines = data.trim().split('\n');

    if (lines.length <= 1) {
      return { success: false, error: 'Empty or invalid CSV file' };
    }

    const headers = lines[0].split(',');
    const configData = extractConfigFromCsv(data);
    const processData = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;

      const values = lines[i].split(',');
      if (values.length >= 3) {
        let force = parseFloat(values[2]) || 0;
        let distance = parseFloat(values[1]) || 0;

        processData.push({
          time: i - 1,
          distance: distance,
          force: force, // Keep in mN for consistency with real-time graph
          temperature: parseFloat(values[3]) || 0
        });
      }
    }

    return {
      success: true,
      data: processData,
      configData: configData,
      rawData: data
    };

  } catch (error) {
    console.error('Error reading log file:', error);
    return { success: false, error: error.message };
  }
}

function extractConfigFromCsv(csvData) {
  const lines = csvData.split('\n');

  const config = {
    configName: 'Unknown',
    pathlength: '--',
    thresholdForce: '--',
    insertionLength: '--',        // Insertion stroke length
    retractionLength: '--',   // RetractionStrokelength
    numberOfCurves: '--',
    curveDistances: {}
  };

  // Read configuration from first data row
  if (lines.length > 1) {
    const firstDataRow = lines[1].split(',');

    // Ensure row has enough columns
    if (firstDataRow.length >= 10) {
      config.configName = firstDataRow[4] || 'Unknown';
      config.pathlength = firstDataRow[5] || '--';
      config.thresholdForce = firstDataRow[6] || '--';
      config.insertionLength = firstDataRow[7] || '--';
      config.retractionLength = firstDataRow[8] || '--';
      config.numberOfCurves = firstDataRow[9] || '--';

      // Parse curve distances - CurveDistances is from index 9 onwards
      try {
        if (firstDataRow.length >= 10) {
          // Join parts from index 10 onwards to handle JSON strings with commas
          let curveDistancesStr = firstDataRow.slice(10).join(',').trim();

          // Handle potential issues with surrounding quotes or escapes
          if (curveDistancesStr.startsWith('"') && curveDistancesStr.endsWith('"')) {
            curveDistancesStr = curveDistancesStr.slice(1, -1);
          }

          curveDistancesStr = curveDistancesStr.replace(/""/g, '"').replace(/\\"/g, '"');

          config.curveDistances = JSON.parse(curveDistancesStr);
        }
      } catch (e) {
        console.log('Could not parse curve distances:', e.message);
      }
    }
  }

  return config;
}


async function deleteLogFile(filePath) {
  try {
    await fsPromises.unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error deleting log file:', error);
    return { success: false, error: error.message };
  }
}

// ============================
// Create Window - Updated for electron-builder
// ============================
function createWindow() {
  const preloadPath = isDev 
    ? path.join(__dirname, 'preload.js') 
    : path.join(__dirname, '.vite/build/preload/preload.js');
    
  console.log('Preload path:', preloadPath);
  console.log('Preload file exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenu(null);

  // Load the renderer
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Correctly points to the production build output
    mainWindow.loadFile(path.join(__dirname, '.vite/build/renderer/main_window/index.html'));
  }

  // Auto-connect after window is ready
  mainWindow.on('ready-to-show', () => {
    console.log('🪟 Window is ready');
    // Delay auto-connect to ensure UI is loaded
    setTimeout(() => {
      autoConnectPort();
    }, 2000);
  });

  // Handle window close
  mainWindow.on('closed', () => {
    // Cleanup logic handled by window-all-closed or app quit
    mainWindow = null;
  });
};

// -------------------------
// Data conversion helpers - UPDATED BASED ON PYTHON LOGIC
// -------------------------
function registersToFloat32LE(register1, register2) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint16(0, register1, true);
  view.setUint16(2, register2, true);

  return view.getFloat32(0, true);
}

// -------------------------
// Safe register reading
// -------------------------
async function safeReadRegisters(address, count) {
  try {
    if (!client.isOpen) {
      throw new Error('Modbus connection is not open');
    }
    return await client.readHoldingRegisters(address, count);
  } catch (err) {
    console.error(`Error reading register ${address}:`, err.message);
    throw err;
  }
}

// -------------------------
// Background Modbus Processing Loop
// -------------------------
let consecutiveErrors = 0;

async function processModbusLoop() {
  if (isLoopRunning) return;
  isLoopRunning = true;
  console.log("🔄 Background Modbus Loop Started");

  while (true) {
    // 0. Critical Check: Unexpected Port Closure
    if (isConnected && !client.isOpen) {
      console.error("❌ Port closed unexpectedly (client.isOpen is false). Triggering disconnect.");
      isConnected = false;
      consecutiveErrors = 0;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('modbus-status', 'disconnected');
      }
    }

    // 1. Check Connection
    if (!isConnected || !client.isOpen) {
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }

    try {
      // 2. Process High Priority Commands FIRST
      if (commandQueue.length > 0) {
        const cmd = commandQueue.shift();
        try {
          const result = await cmd.task();
          cmd.resolve(result);
        } catch (e) {
          console.error(`❌ Command ${cmd.commandName} failed:`, e.message);
          cmd.reject(e);
        }
        continue;
      }

      // 3. Read Data Cycle
      let cycleSuccess = false;
      let currentEmerState = lastEmerState;
      let currentPowState = lastPowState;

      // Read COIL_LLS
      try {
        const llsResult = await client.readCoils(COIL_LLS, 1);
        const currentLLSState = Boolean(llsResult.data[0]);
        plcState.coilLLS = currentLLSState;
        cycleSuccess = true;
        if (currentLLSState !== lastLLSState) {
          if (currentLLSState) retState = false;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lls-status', currentLLSState.toString());
          }
          lastLLSState = currentLLSState;
        }
      } catch (e) { }
 
      // Read Control Coils (Feedback Loop)
      try {
        const ctrlRes = await client.readCoils(COIL_CLAMP, 3);
        plcState.clamp = Boolean(ctrlRes.data[0]);     // 2007
        plcState.insertion = Boolean(ctrlRes.data[1]); // 2008
        plcState.retraction = Boolean(ctrlRes.data[2]);// 2009
 
        const heatingRes = await client.readCoils(COIL_HEATING, 1);
        plcState.heater = Boolean(heatingRes.data[0]); // 2012
      } catch (e) { }

      // Read Safety Coils
      try {
        const emerResult = await client.readCoils(COIL_EMER, 1);
        currentEmerState = Boolean(emerResult.data[0]);
        cycleSuccess = true;
      } catch (e) { }

      try {
        const powResult = await client.readCoils(COIL_POW, 1);
        currentPowState = !Boolean(powResult.data[0]);
        cycleSuccess = true;
      } catch (e) { }

      // Global Safety Check
      if (currentEmerState || !currentPowState) {
        await performSafetyStop(currentEmerState ? "Emergency Pressed" : "Power OFF");
      } else {
        isHardwareStopActive = false;
      }

      // Emit Safety Updates
      if (currentEmerState !== lastEmerState) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emergency-status', currentEmerState);
        }
        lastEmerState = currentEmerState;
      }
      if (currentPowState !== lastPowState) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('power-status', currentPowState);
        }
        lastPowState = currentPowState;
      }

      // Read Registers
      try {
        const dRes = await client.readHoldingRegisters(REG_DISTANCE, 1);
        plcState.distance = dRes.data[0];
        cycleSuccess = true;
      } catch (e) { }

      try {
        const fRes = await client.readHoldingRegisters(REG_FORCE, 2);
        plcState.force_mN = registersToFloat32LE(fRes.data[0], fRes.data[1]);
        cycleSuccess = true;
      } catch (e) { }

      try {
        const tRes = await client.readHoldingRegisters(REG_TEMP, 1);
        plcState.temperature = tRes.data[0] / 10.0;
        cycleSuccess = true;
      } catch (e) { }

      try {
        const mdRes = await client.readHoldingRegisters(REG_MANUAL_DISTANCE, 1);
        plcState.manualDistance = new Int16Array(new Uint16Array([mdRes.data[0]]).buffer)[0];
        cycleSuccess = true;
      } catch (e) { }

      // 4. Connection Success/Failure Tracking
      if (cycleSuccess) {
        consecutiveErrors = 0;
      } else {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          isConnected = false;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('modbus-status', 'disconnected');
          }
          try { if (client.isOpen) client.close(); } catch (e) { }
          consecutiveErrors = 0;
        }
      }

      plcState.lastUpdated = Date.now();

    } catch (loopError) {
      console.error("⚠️ Modbus loop error:", loopError.message);
      // Wait a bit longer on error
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }

    // 5. Yield / Wait
    // Short wait to prevent blocking event loop, but keep high poll rate
    // 20ms = ~50 polls/sec theoretical max (in practice less due to serial latency)
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

// Start the loop
processModbusLoop();


// -------------------------
// Read PLC Data Function - SERVES CACHE
// -------------------------
async function readPLCData() {
  if (!isConnected) {
    return {
      success: false,
      message: 'Not connected to PLC'
    };
  }

  // Return cached state immediately
  return {
    success: true,
    distance: plcState.distance,
    distanceDisplay: `${plcState.distance} mm`,

    force_mN: plcState.force_mN,
    forceDisplay: `${plcState.force_mN} mN`,

    temperature: plcState.temperature,
    temperatureDisplay: `${plcState.temperature.toFixed(1)} °C`,

    manualDistance: plcState.manualDistance,
    manualDistanceDisplay: `${plcState.manualDistance} mm`,

    coilLLS: plcState.coilLLS,
    clamp: plcState.clamp,
    heater: plcState.heater,
    insertion: plcState.insertion,
    retraction: plcState.retraction,

    // Raw data stub for compatibility if needed
    rawRegisters: {}
  };
}

// ============================
// CONFIGURATION FILE SETTINGS
// ===========================

// Helper function to ensure config file exists
async function ensureConfigFile() {
  try {
    await fsPromises.access(CONFIG_FILE_PATH);
  } catch (error) {
    // Create empty JSON array for configurations
    const emptyConfigs = [];
    await fsPromises.writeFile(CONFIG_FILE_PATH, JSON.stringify(emptyConfigs, null, 2), 'utf8');
    console.log('Created new JSON config file:', CONFIG_FILE_PATH);
  }
}

// Read configuration file (JSON format)
async function readConfigurations() {
  try {
    await ensureConfigFile();

    const data = await fsPromises.readFile(CONFIG_FILE_PATH, 'utf8');

    try {
      const configs = JSON.parse(data);
      // Ensure curveDistances exists for each config
      return configs.map(config => ({
        ...config,
        curveDistances: config.curveDistances || {}
      }));
    } catch (parseError) {
      console.error('Error parsing JSON config file:', parseError);
      // If JSON is invalid, return empty array
      return [];
    }
  } catch (error) {
    console.error('Error reading config file:', error);
    return [];
  }
}

// Write configuration file (JSON format)
async function writeConfigurations(configs) {
  try {
    // Ensure curveDistances is properly formatted
    const formattedConfigs = configs.map(config => ({
      configName: config.configName || '',
      pathlength: config.pathlength || '',
      thresholdForce: config.thresholdForce || '',
      insertionLength: config.insertionLength || '',
      retractionLength: config.retractionLength || '',
      numberOfCurves: config.numberOfCurves || '',
      curveDistances: config.curveDistances || {}
    }));

    await fsPromises.writeFile(
      CONFIG_FILE_PATH,
      JSON.stringify(formattedConfigs, null, 2),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error('Error writing JSON config file:', error);
    return false;
  }
}

// ============================
// 2-POINT & 3-POINT CSV CONFIGURATIONS
// ============================
function convertToCSV(arr, headers) {
  if (!arr || !arr.length) return headers.join(',') + '\n';

  const csvRows = [headers.join(',')];
  for (const row of arr) {
    const values = headers.map((header) => {
      const val = row[header];
      const escaped = (`${val ?? ''}`).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

function convertFromCSV(csvStr, headers) {
  if (!csvStr) return [];

  const lines = csvStr.trim().split('\n');
  if (lines.length <= 1) return [];

  const result = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].replace(/"/g, '');
    const values = line.split(',');
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] !== undefined ? values[index] : '';
    });

    result.push(obj);
  }

  return result;
}

const TWO_POINT_DIR = path.join(app.getPath('documents'), 'FTM-2-point Test');
const TWO_POINT_FILE = path.join(TWO_POINT_DIR, 'configs.csv');
const TWO_POINT_HEADERS = ['configName', 'probeTravelLimit', 'forceLimit', 'testSpeed'];

async function ensure2PointConfig() {
  if (!fs.existsSync(TWO_POINT_DIR)) {
    fs.mkdirSync(TWO_POINT_DIR, { recursive: true });
  }

  if (!fs.existsSync(TWO_POINT_FILE)) {
    await fsPromises.writeFile(TWO_POINT_FILE, `${TWO_POINT_HEADERS.join(',')}\n`, 'utf8');
  }
}

const THREE_POINT_DIR = path.join(app.getPath('documents'), 'FTM-3-point Test');
const THREE_POINT_FILE = path.join(THREE_POINT_DIR, 'configs.csv');
const THREE_POINT_HEADERS = ['configName', 'testLength', 'measurementInterval', 'probeTravelLimit', 'forceLimit', 'testSpeed', 'supportSpan', 'horizontalSpeed'];

async function ensure3PointConfig() {
  if (!fs.existsSync(THREE_POINT_DIR)) {
    fs.mkdirSync(THREE_POINT_DIR, { recursive: true });
  }

  if (!fs.existsSync(THREE_POINT_FILE)) {
    await fsPromises.writeFile(THREE_POINT_FILE, `${THREE_POINT_HEADERS.join(',')}\n`, 'utf8');
  }
}

// -------------------------
// Pulse coil helper
// -------------------------
async function pulseCoil(coil) {
  if (!isConnected) {
    throw new Error('Modbus not connected');
  }

  try {
    await client.writeCoil(coil, true);
    console.log(`Coil ${coil} turned ON`);

    setTimeout(async () => {
      try {
        await client.writeCoil(coil, false);
        console.log(`Coil ${coil} turned OFF`);
      } catch (e) {
        console.error(`Error turning off coil ${coil}:`, e.message);
      }
    }, 2000);

  } catch (err) {
    console.error(`Error pulsing coil ${coil}:`, err.message);
    throw err;
  }
}

// -------------------------
// Safe command execution - QUEUED VERSION
// -------------------------
function safeExecute(commandName, action) {
  return new Promise((resolve, reject) => {
    // 1. Validate connection first (fail fast)
    // Note: client.isOpen checks properly, isConnected is our own flag
    // We check isConnected to keep consistent with existing logic
    if (!isConnected) {
      console.log(`❌ ${commandName}: Modbus not connected (Rejected immediately)`);
      return resolve({
        success: false,
        message: 'Modbus not connected.',
        error: 'NOT_CONNECTED'
      });
    }

    // 2. Push to queue
    commandQueue.push({
      commandName,
      task: async () => {
        try {
          // Wrap the action to ensure it returns standard format or throws
          const result = await action();
          // Automatically inject success: true so frontend is happy
          return { success: true, ...result };
        } catch (e) {
          throw e;
        }
      },
      resolve,
      reject
    });
  });
}

const coilState = {
  heating: false,
  heater: false,
  retraction: false,
  manualRet: false
};
// -------------------------
// IPC handlers - ADD MANUAL CONNECT HANDLER
// -------------------------

// NEW: Manual connect handler
ipcMain.handle("connect-modbus", async () => {
  return await manualConnectModbus();
});

ipcMain.handle("check-emergency-status", async () => {
  return { active: lastEmerState };
});

ipcMain.handle("check-power-status", async () => {
  return { active: lastPowState };
});

ipcMain.handle("home", async () => {
  return await safeExecute("HOME", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    // Turn ON homing
    await client.writeCoil(COIL_HOME, true);

    return { success: true };
  });
});


ipcMain.handle("start", async () => {
  return await safeExecute("START", async () => {
    if (!isConnected) throw new Error('Modbus not connected');

    await client.writeCoil(COIL_STOP, false);
    await client.writeCoil(COIL_RESET, false);
    await client.writeCoil(COIL_START, true);
    await client.writeCoil(COIL_RETRACTION, false);

    return { startInitiated: true };
  });
});


ipcMain.handle("stop", async () => {
  return await safeExecute("STOP", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    coilState.retraction = false;
    coilState.heater = false;
    coilState.manualRet = false;
    insertionState = false; // Added
    retState = false;       // Added

    await client.writeCoil(COIL_RETRACTION, false);
    await client.writeCoil(COIL_START, false);
    await client.writeCoil(COIL_STOP, true);

    return { success: true, retraction: false };
  });
});

ipcMain.handle("reset", async () => {
  return await safeExecute("RESET", async () => {
    if (!isConnected) throw new Error('Modbus not connected');

    await client.writeCoil(COIL_RESET, true);
    await client.writeCoil(COIL_STOP, false);

    return { resetPressed: true };
  });
});

ipcMain.handle("heating", async () => {
  return await safeExecute("HEATING", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    coilState.heating = !coilState.heating;
    await client.writeCoil(COIL_HEATING, coilState.heating);

    return { heating: coilState.heating };
  });
});


ipcMain.handle("retraction", async () => {
  return await safeExecute("RETRACTION", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    // Do NOT toggle – only turn ON
    if (coilState.retraction) {
      return { success: true, retraction: true };
    }

    coilState.retraction = true;

    await client.writeCoil(COIL_RETRACTION, true);
    await client.writeCoil(COIL_STOP, false);
    await client.writeCoil(COIL_START, false);

    return { success: true, retraction: true };
  });
});


ipcMain.handle("manual", async () => {
  return await safeExecute("MANUAL-MODE", async () => {
    if (!isConnected) throw new Error('Modbus not connected');
    await client.writeCoil(COIL_MANUAL, true);
    await client.writeCoil(COIL_RET, false);
    await client.writeCoil(COIL_INSERTION, false);
    await client.writeCoil(COIL_CLAMP, false);
    return { manualModeActivated: true };
  });
});

ipcMain.handle("heater", async () => {
  return await safeExecute("HEATER-ON", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    // Always turn ON, regardless of state
    coilState.heater = true;
    await client.writeCoil(COIL_HEATER, true);

    return { heater: coilState.heater };
  });
});

ipcMain.handle("heater-off", async () => {
  return await safeExecute("HEATER-OFF", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    // Always turn OFF
    coilState.heater = false;
    await client.writeCoil(COIL_HEATER, false);

    return { heater: coilState.heater };
  });
});

let clampState = false;
ipcMain.handle("clamp", async () => {
  return await safeExecute("CLAMP", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    clampState = !clampState;

    await client.writeCoil(COIL_MANUAL, true);


    await client.writeCoil(COIL_CLAMP, clampState);

    return {
      clampState: clampState ? "ON" : "OFF",
      message: `Clamp turned ${clampState ? "ON" : "OFF"}`
    };
  });
});

let insertionState = false;

ipcMain.handle("insertion", async () => {
  return await safeExecute("INSERTION", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    insertionState = !insertionState;
    if (insertionState) retState = false; // Mutual exclusivity: starting insertion stops retraction

    await client.writeCoil(COIL_MANUAL, true);
    await client.writeCoil(COIL_RET, false);
    await client.writeCoil(COIL_INSERTION, insertionState);


    return {
      insertionState: insertionState ? "ON" : "OFF",
      message: `Insertion turned ${insertionState ? "ON" : "OFF"}`
    };
  });
});

let retState = false;

ipcMain.handle("ret", async () => {
  return await safeExecute("RETRACTION_MANUAL", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    retState = !retState;
    if (retState) insertionState = false; // Mutual exclusivity: starting retraction stops insertion

    await client.writeCoil(COIL_MANUAL, true);
    await client.writeCoil(COIL_RET, retState);
    await client.writeCoil(COIL_INSERTION, false);


    return {
      retState: retState ? "ON" : "OFF",
      message: `Manual Retraction turned ${retState ? "ON" : "OFF"}`
    };
  });
});

// Add near other IPC handlers in main.js
ipcMain.handle("disable-manual-mode", async () => {
  return await safeExecute("DISABLE-MANUAL-MODE", async () => {
    if (!isConnected) throw new Error('Modbus not connected');

    // Reset local states
    insertionState = false;
    retState = false;

    // Turn off COIL_MANUAL
    await client.writeCoil(COIL_MANUAL, false);

    // Also turn off related coils
    await client.writeCoil(COIL_RET, false);
    await client.writeCoil(COIL_INSERTION, false);
    await client.writeCoil(COIL_CLAMP, false);

    return { manualModeDisabled: true };
  });
});

// Read data handler
ipcMain.handle("read-data", async () => {
  return await readPLCData();
});

// Check connection status
ipcMain.handle("check-connection", () => {
  return {
    connected: isConnected,
    port: PORT,
    timestamp: new Date().toISOString()
  };
});

// Reconnect command
ipcMain.handle("reconnect", async () => {
  try {
    console.log("Attempting to reconnect...");

    if (client.isOpen) {
      client.close();
      console.log("Closed existing connection");
    }

    isConnected = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('modbus-status', 'disconnected');
    }

    const connected = await manualConnectModbus();

    return {
      success: true,
      connected: connected,
      message: connected ? 'Reconnected successfully' : 'Failed to reconnect'
    };

  } catch (err) {
    console.error("Reconnect error:", err.message);
    return {
      success: false,
      error: err.message,
      connected: false
    };
  }
});

// ============================
// CONFIGURATION IPC HANDLERS
// ============================

// Read configuration file
ipcMain.handle("read-config-file", async () => {
  return await readConfigurations();
});

// Write configuration file
ipcMain.handle("write-config-file", async (event, configs) => {
  return await writeConfigurations(configs);
});

// Delete configuration
ipcMain.handle("delete-config-file", async (event, configName) => {
  try {
    const configs = await readConfigurations();
    const updatedConfigs = configs.filter(config => config.configName !== configName);
    return await writeConfigurations(updatedConfigs);
  } catch (error) {
    console.error('Error deleting config:', error);
    return false;
  }
});

ipcMain.handle('read-2point-configs', async () => {
  try {
    await ensure2PointConfig();
    const data = await fsPromises.readFile(TWO_POINT_FILE, 'utf8');
    return convertFromCSV(data, TWO_POINT_HEADERS);
  } catch (error) {
    console.error('Error reading 2-point configs:', error);
    return [];
  }
});

ipcMain.handle('write-2point-configs', async (event, configs) => {
  try {
    await ensure2PointConfig();
    const csvData = convertToCSV(configs, TWO_POINT_HEADERS);
    await fsPromises.writeFile(TWO_POINT_FILE, csvData, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing 2-point configs:', error);
    return false;
  }
});

ipcMain.handle('read-3point-configs', async () => {
  try {
    await ensure3PointConfig();
    const data = await fsPromises.readFile(THREE_POINT_FILE, 'utf8');
    return convertFromCSV(data, THREE_POINT_HEADERS);
  } catch (error) {
    console.error('Error reading 3-point configs:', error);
    return [];
  }
});

ipcMain.handle('write-3point-configs', async (event, configs) => {
  try {
    await ensure3PointConfig();
    const csvData = convertToCSV(configs, THREE_POINT_HEADERS);
    await fsPromises.writeFile(THREE_POINT_FILE, csvData, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing 3-point configs:', error);
    return false;
  }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
ipcMain.handle("send-process-mode", async (event, config) => {
  return await safeExecute("SEND_PROCESS_CONFIG", async () => {
    try {
      console.log('🔧 Process mode config received:', config);

      if (!isConnected || !client.isOpen) {
        throw new Error('Modbus not connected');
      }

      // Parse configuration values
      const pathLength = parseInt(config.pathlength);
      const thresholdForce = parseFloat(config.thresholdForce); // mN
      const insertionLength = parseFloat(config.insertionLength); // mm
      const retractionLength = parseFloat(config.retractionLength); // mm

      console.log('📊 Parsed config values:', {
        pathLength: `${pathLength} mm`,
        thresholdForce: `${thresholdForce} mN`,
        insertionLength: `${insertionLength} mm`,
        retractionLength: `${retractionLength} mm`
      });

      // Validate values
      if (isNaN(pathLength) || isNaN(thresholdForce) || isNaN(retractionLength)) {
        console.error('❌ Invalid configuration values');
        return false;
      }

      const results = [];

      // 1. Write Path Length
      console.log(`📝 Writing Path Length: ${pathLength} mm to address 6000`);
      await client.writeRegister(6000, pathLength);
      await delay(150);
      console.log('✅ Path Length written to address 6000');
      results.push({ register: '6000 (D0)', value: pathLength, success: true });

      // 2. Write Threshold Force
      const thresholdForceValue = Math.round(thresholdForce);
      console.log(`📝 Writing Threshold Force: ${thresholdForceValue} mN to R150`);
      await client.writeRegister(150, thresholdForceValue);
      await delay(150);
      console.log('✅ Threshold Force written to R150');
      results.push({ register: '150 (R150)', value: thresholdForceValue, success: true });

      // 3. Write Temperature
      const insertionValue = Math.round(insertionLength); // 0.1°C
      console.log(`📝 Writing Insertion Length: ${insertionValue} to 6050`);
      await client.writeRegister(6050, insertionValue);
      await delay(150);
      console.log('✅ Insertion length written to 6050');
      results.push({ register: '6050 (D50)', value: insertionValue, success: true });

      // 4. Write Retraction Length
      const retractionValue = Math.round(retractionLength);
      console.log(`📝 Writing Retraction Stroke Length: ${retractionValue} mm to R122`);
      await client.writeRegister(122, retractionValue);
      await delay(150);
      console.log('✅ Retraction Stroke Length written to R122');
      results.push({ register: '122 (R122)', value: retractionValue, success: true });

      console.log('✅ All configuration values written');
      console.log('📋 Write results:', results);

      return true;

    } catch (error) {
      console.error('❌ Error sending process mode:', error.message);
      return false;
    }
  });
});


// ============================
// CSV LOGGING IPC
// ============================

ipcMain.handle("csv-start", async (event, config) => {
  return await startCSVLogging(config);
});

ipcMain.handle("csv-append", async (event, payload) => {
  const { data, config } = payload;
  return await appendCSVData(data, config);
});

ipcMain.handle("csv-stop", async () => {
  return await stopCSVLogging();
});
// ============================
// CSV FILE MANAGEMENT IPC HANDLERS
// ============================

ipcMain.handle("get-log-files", async () => {
  return await getLogFiles();
});

ipcMain.handle("read-log-file", async (event, filePath) => {
  return await readLogFile(filePath);
});

ipcMain.handle("delete-log-file", async (event, filePath) => {
  return await deleteLogFile(filePath);
});


ipcMain.handle("check-for-updates", async () => {
  if (isDev) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'Checking for updates...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-status', 'latest');
        }
      }, 1000);
    }
    return { success: true, message: "Checking for updates (simulated in development)..." };
  }
  try {
    autoUpdater.checkForUpdates();
    return { success: true, message: "Checking for Updates..." };
  } catch (error) {
    console.error("Update check error:", error);
    return { success: false, error: error.message };
  }
});
// Add handler for update progress
ipcMain.handle("get-update-progress",() => {
  return { success: false, error: error.message};
});

// -------------------------
// App lifecycle - FIXED
// -------------------------
autoUpdater.on('update-available', () => {
  mainWindow.webContents.send('update_available');
});
autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update_ready');
});
ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  createWindow();
  
  // Check for updates on startup (with a small delay to ensure window is ready)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 5000);
  }
});

// Close port when app quits
app.on('window-all-closed', () => {
  if (client.isOpen) {
    console.log("Closing Modbus connection...");
    client.close();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);

  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox(
      'Application Error',
      `An unexpected error occurred:\n${error.message}\n\nThe application may not function correctly.`
    );
  }
});
