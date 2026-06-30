const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");


const ModbusRTU = require("modbus-serial");
const { SerialPort } = require('serialport');
const path = require("path");
const iconPath = path.join(__dirname, 'src/assets/icon.ico');
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
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'Checking for updates...');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Send to UI component
      mainWindow.webContents.send('update-status', 'Update available');
      mainWindow.webContents.send('update-available', info);

      // Also show a system dialog as backup
      // dialog.showMessageBox(mainWindow, {
      //   type: 'info',
      //   title: 'Update Available',
      //   message: `A new version ${info.version} is available. Do you want to download it now?`,
      //   buttons: ['Yes', 'No'],
      //   defaultId: 0,
      //   cancelId: 1
      // }).then((result) => {
      //   if (result.response === 0) {
      //     autoUpdater.downloadUpdate();
      //   }
      // });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'latest');
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
    console.log(`Download progress: ${progressObj.percent}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', 'downloaded');

      // dialog.showMessageBox(mainWindow, {
      //   type: 'info',
      //   title: 'Update Ready',
      //   message: `Version ${info.version} has been downloaded. The application will restart to install the update.`,
      //   buttons: ['Restart Now'],
      //   defaultId: 0
      // }).then(() => {
      //   setImmediate(() => {
      //     autoUpdater.quitAndInstall();
      //   });
      // });
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
const BAUDRATE = 115200;
const TIMEOUT = 0; // Using buffered read, timeout not as critical in this config

const COIL_POW = 1003
const COIL_EMER = 1004
const COIL_LLS = 3922; // Modbus address for M1922 (2000 + 1922)

// Manual Mode Coils
const COIL_MANUAL = 2001;          // M1
const COIL_MANUAL_EXIT = 2002;     // M2
const COIL_HOME = 2300;             // M300
const COIL_TARE = 2301;            // M301
const COIL_SETTINGS = 2302;         // M02
const COIL_CLAMP = 1003;           // X3
const COIL_PROBE_UP = 1006;        // X6
const COIL_PROBE_DOWN = 1005;      // X5
const COIL_CATHETER_BACK = 1008;   // X8
const COIL_CATHETER_FORWARD = 1007; // X7
const COIL_2POINT = 2008;          // M8
const COIL_3POINT = 2009;          // M9
const COIL_START = 2010;           // M10
const COIL_STOP = 2011;            // M11
const COIL_RESET = 2012;           // M12
const COIL_M303 = 2303;            // M303
const COIL_3START = 2440           // M440
const COIL_3STOP = 2441            // M441
const COIL_3RESET = 2442           // M442


const REG_DISTANCE = 70;  // 1 register (16-bit integer) — Probe DistanceG
const TEST_DIST = 73; // 1 register (16-bit integer) — TEST Distance that used using 2 & 3 point mode
const REG_FORCE = 54;     // 2 registers (32-bit float)  — Force
const REG_MANUAL_DISTANCE = 71;   // 1 register (16-bit integer) — Catheter Distance (R71)
const REG_MACHINE_STATUS = 11;    // 1 register (16-bit integer) — Machine Status (R11): 1=IDLE, 2=HOMING, 3=READY
const REG_STEPS = 72;             // 1 register (16-bit integer) — No. of Steps to move (R72)
const REG_SETTINGS_FORCE = 30;    // 1 register (16-bit integer) — Settings Force (R30, grams)

// -------------------------
// Helper: Convert two 16-bit Modbus registers → 32-bit float (Little-Endian word order)
// Most Delta PLCs send floats as: word[0] = low word, word[1] = high word
// -------------------------
// // Helper function declaration has been simplified
// function registersToFloat32LE(lowWord, highWord) {
//   const buf = new ArrayBuffer(4);
//   const view = new DataView(buf);
//   view.setUint16(0, lowWord, true); // low word at byte 0
//   view.setUint16(2, highWord, true); // high word at byte 2
//   return view.getFloat32(0, true);   // read as little-endian float
// }

// // Alternative: Big-Endian word order (try this if LE gives wrong result)
// function registersToFloat32BE(highWord, lowWord) {
//   const buf = new ArrayBuffer(4);
//   const view = new DataView(buf);
//   view.setUint16(0, highWord, false);
//   view.setUint16(2, lowWord, false);
//   return view.getFloat32(0, false);
// }

// Global State
let isConnected = false;
let lastPulseTime = Date.now();
const client = new ModbusRTU();
let lastHomeState = false;

// PLC Cache & Command Queue
let plcState = {
  distance: 0,        // R70  — Probe Distance (mm)
  test_Dist: 0,        // R73  — TEST Distance (mm)
  force_mN: 0,        // R54  — Force (mN, 32-bit float)
  catheterDistance: 0,// R71  — Catheter Distance (mm)
  machineStatus: 1,   // R11  — Machine Status (1=IDLE, 2=HOMING, 3=READY, etc.)
  stepsToMove: 0,     // R72  — Steps to move
  coilLLS: false,
  home: false,        // M300 - Homing active
  clamp: false,
  probeUp: false,
  probeDown: false,
  catheterBack: false,
  catheterForward: false,
  manual: false,      // M1
  twoPoint: false,    // M8
  threePoint: false,  // M9
  rawForce: 0,        // R31  — Raw Force Value
  weightRange: 0,     // R32  — Weight Range (0-1000)
  inputsMode: 0,      // R33  — Just 3 inputs (0,1,2)
  realtimePlcValue: 0,// R36  — Real-time changing value on PLC
  settingsForce: 0,   // R30  — Force for Settings screen (grams)
  lastUpdated: 0
};

// Remember the active test mode so coils are applied after connect/reconnect
let activeTestMode = null; // '2-point' | '3-point' | 'manual' | null

function updatePlcModeState(mode) {
  if (mode === '2-point') {
    plcState.twoPoint = true;
    plcState.threePoint = false;
    plcState.manual = false;
    plcState.manualExit = true;
  } else if (mode === '3-point') {
    plcState.twoPoint = false;
    plcState.threePoint = true;
    plcState.manual = false;
    plcState.manualExit = true;
  } else if (mode === 'manual') {
    plcState.twoPoint = false;
    plcState.threePoint = false;
    plcState.manual = true;
    plcState.manualExit = false;
  } else {
    plcState.twoPoint = false;
    plcState.threePoint = false;
    plcState.manual = false;
    plcState.manualExit = true;
  }
}

async function writeTwoPointCoils() {
  console.log('🔌 Writing COIL_2POINT(2008) = true, COIL_3POINT(2009) = false, COIL_MANUAL(2001) = false, COIL_MANUAL_EXIT(2002) = true');
  await client.writeCoil(COIL_2POINT, true);
  await client.writeCoil(COIL_3POINT, false);
  await client.writeCoil(COIL_MANUAL, false);
  await client.writeCoil(COIL_MANUAL_EXIT, true);
  updatePlcModeState('2-point');
}

async function writeThreePointCoils() {
  console.log('🔌 Writing COIL_3POINT(2009) = true, COIL_2POINT(2008) = false, COIL_MANUAL(2001) = false, COIL_MANUAL_EXIT(2002) = true');
  await client.writeCoil(COIL_3POINT, true);
  await client.writeCoil(COIL_2POINT, false);
  await client.writeCoil(COIL_MANUAL, false);
  await client.writeCoil(COIL_MANUAL_EXIT, true);
  updatePlcModeState('3-point');
}

async function writeManualModeCoils() {
  console.log('🔌 Writing COIL_MANUAL(2001) = true, COIL_MANUAL_EXIT(2002) = false, COIL_2POINT = false, COIL_3POINT = false');
  await client.writeCoil(COIL_MANUAL, true);
  await client.writeCoil(COIL_MANUAL_EXIT, false);
  await client.writeCoil(COIL_2POINT, false);
  await client.writeCoil(COIL_3POINT, false);
  updatePlcModeState('manual');
}

async function writeDeactivateModeCoils() {
  await client.writeCoil(COIL_MANUAL, false);
  await client.writeCoil(COIL_MANUAL_EXIT, true);
  await client.writeCoil(COIL_2POINT, false);
  await client.writeCoil(COIL_3POINT, false);
  updatePlcModeState(null);
}

async function applyActiveTestMode() {
  if (!isConnected || !client.isOpen) return false;

  try {
    switch (activeTestMode) {
      case '2-point':
        await writeTwoPointCoils();
        break;
      case '3-point':
        await writeThreePointCoils();
        break;
      case 'manual':
        await writeManualModeCoils();
        break;
      default:
        return false;
    }
    console.log(`✅ Re-applied active test mode after connect: ${activeTestMode}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to apply active test mode (${activeTestMode}):`, error.message);
    return false;
  }
}

function queueOrExecuteModeActivation(commandName, mode, writeFn) {
  activeTestMode = mode;
  if (!isConnected) {
    updatePlcModeState(mode);
    console.log(`⏳ ${commandName}: queued until Modbus connects (mode: ${mode})`);
    return Promise.resolve({ success: true, pending: true, mode });
  }

  return safeExecute(commandName, async () => {
    if (!isConnected) throw new Error('Modbus not connected');
    await writeFn();
    return { success: true };
  });
}

// Queue items: { id, type: 'write', task: async () => {}, resolve, reject }
const commandQueue = [];
let isLoopRunning = false;

// ============================
// CONFIGURATION FILE SETTINGS
// ============================
const CONFIG_FILE_PATH = path.join(app.getPath('documents'), 'CTTM.json');

// -------------------------
// Helper: Verify Heartbeat Pulses on COIL_LLS - NEW
// -------------------------
async function verifyPulses(clientInstance) {
  let pulseCount = 0;
  let lastVal = null;
  const pollInterval = 100; // ms
  const maxWaitTime = 10000; // 10 seconds timeout
  const startTime = Date.now();

  console.log("🔍 Verifying 3 continuous pulses (0 -> 1 transitions) on COIL_LLS (1922)...");

  while (Date.now() - startTime < maxWaitTime) {
    const res = await clientInstance.readCoils(COIL_LLS, 1);
    const val = res.data[0] ? 1 : 0;

    if (lastVal !== null) {
      if (lastVal === 0 && val === 1) {
        pulseCount++;
        console.log(`📡 Pulse ${pulseCount} detected (0 -> 1)`);
      }
    }
    lastVal = val;

    if (pulseCount >= 3) {
      console.log("✅ Successfully verified 3 pulses. Connection confirmed.");
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  console.log(`❌ Failed to detect 3 pulses within ${maxWaitTime}ms. Found ${pulseCount} pulses.`);
  return false;
}

// -------------------------
// Connect Modbus - UPDATED WITH PULSE VERIFICATION
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

    // Verify pulses before declaring connected
    const verified = await verifyPulses(client);
    if (!verified) {
      throw new Error("Could not verify 3 pulses on COIL_LLS");
    }

    isConnected = true;
    lastPulseTime = Date.now(); // Reset pulse timer on successful connection
    PORT = targetPort; // Update global
    console.log("✅ Modbus connected and pulse verified on", PORT);

    // Update UI to show connection status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('modbus-status', 'connected');
    }

    if (activeTestMode) {
      await applyActiveTestMode();
    }

    return true;
  } catch (err) {
    console.warn(`❌ Connection/verification failed on ${targetPort}:`, err.message);
    isConnected = false;
    try {
      if (client.isOpen) client.close();
    } catch (e) { }
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
        console.log(`✅ Verified Modbus device on ${portPath}`);
        return true;
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
      console.log(`✅ Quick re-connect successful on ${PORT}`);
      return true;
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
// async function performSafetyStop(reason) {
//   console.log(`⚠️ SAFETY STOP TRIGGERED: ${reason}. Clearing queue! Previous queue size: ${commandQueue.length}`);

//   // Clear command queue to prevent pending actions
//   commandQueue.length = 0;

//   // Directly write to PLC to deactivate manual mode
//   if (!isHardwareStopActive) {
//     isHardwareStopActive = true;
//     try {
//       if (client.isOpen) {
//         console.log(`🔌 Safety Stop: Writing COIL_MANUAL(false) and COIL_MANUAL_EXIT(true)`);
//         await client.writeCoil(COIL_MANUAL, false);
//         await client.writeCoil(COIL_MANUAL_EXIT, true);
//         console.log("🛑 Manual Mode Deactivated on PLC (Safety Stop Active)");
//       }
//     } catch (err) {
//       console.error("❌ Failed to write safety stop coils:", err.message);
//       isHardwareStopActive = false; // Allow retry on next loop
//     }
//   }
// }



// ============================
// CSV LOGGING FUNCTIONS
// ============================
// CSV LOGGING FUNCTIONS
// ============================

async function startCSVLogging(config) {
  try {
    const logsDir = path.join(app.getPath("documents"), "FTM_Logs");

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    
    // Naming of the log file:
    // If config.testType is '2-point', filename prefix is '2-point'
    // If config.testType is '3-point', filename prefix is '3-point'
    // Otherwise fallback to 'Process'
    const prefix = config.testType === '2-point' ? '2-point' : (config.testType === '3-point' ? '3-point' : 'Process');
    
    csvFilePath = path.join(
      logsDir,
      `${prefix}_${config.configName || "Process"}_${timestamp}.csv`
    );

    csvStream = fs.createWriteStream(csvFilePath, { flags: "a" });

    // New format: Line 1 config metadata as JSON string prefixed with //CONFIG:
    // Line 2: Column headers
    const configJson = JSON.stringify(config);
    csvStream.write(`//CONFIG:${configJson}\n`);
    csvStream.write("Timestamp,Steps,Distance_R70(mm),Distance_R73(mm),Distance_R71(mm),Force(mN)\n");

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

    // New data row: Timestamp, Steps, Distance_R70, Distance_R73, Distance_R71, Force
    const row = [
      new Date().toISOString(),
      data.steps !== undefined && data.steps !== null ? data.steps : '--',
      data.distance_R70 !== undefined && data.distance_R70 !== null ? data.distance_R70 : '--',
      data.distance_R73 !== undefined && data.distance_R73 !== null ? data.distance_R73 : '--',
      data.distance_R71 !== undefined && data.distance_R71 !== null ? data.distance_R71 : '--',
      data.force_mN !== undefined && data.force_mN !== null ? data.force_mN : '--'
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
    const logsDir = path.join(app.getPath("documents"), "FTM_Logs");

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
      
      let testType = null;
      let configName = '';
      let timestamp = '';
      
      // Detect if prefixed with test type
      if (parts[0] === '2-point' || parts[0] === '3-point') {
        testType = parts[0];
        configName = parts.slice(1, -1).join('_');
        timestamp = parts[parts.length - 1];
      } else {
        configName = parts.slice(0, -1).join('_');
        timestamp = parts[parts.length - 1];
      }

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
        }
      } catch (e) {
        console.log('Date parsing error:', e.message);
      }

      const displayName = testType ? `${testType} : ${configName}` : `${configName}`;

      logFiles.push({
        filename: file,
        displayName: displayName,
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

    // Check if the file starts with //CONFIG: JSON header
    const isNewFormat = lines[0].startsWith('//CONFIG:');
    
    let configData = null;
    let dataStartLine = 1;

    if (isNewFormat) {
      try {
        const configJson = lines[0].substring('//CONFIG:'.length);
        configData = JSON.parse(configJson);
      } catch (e) {
        console.error("Failed to parse JSON config header:", e.message);
      }
      dataStartLine = 2; // Line 0: CONFIG, Line 1: Columns, Line 2: First data row
    } else {
      configData = extractConfigFromCsv(data);
      dataStartLine = 1; // Line 0: Columns, Line 1: First data row
    }

    const processData = [];

    // Parse the data rows
    for (let i = dataStartLine; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;

      const values = lines[i].split(',');
      
      if (isNewFormat) {
        if (values.length >= 6) {
          let steps = parseInt(values[1]) || 0;
          let distanceR70 = parseFloat(values[2]) || 0;
          let distanceR73 = parseFloat(values[3]) || 0; // R73 distance
          let distanceR71 = parseFloat(values[4]) || 0;
          let force = parseFloat(values[5]) || 0;

          processData.push({
            time: i - dataStartLine,
            steps: steps,
            distanceR70: distanceR70,
            distance: distanceR73, // distance property mapped to R73 for graph plotting
            distanceR71: distanceR71,
            force: force,
            temperature: 0
          });
        }
      } else {
        // Legacy file parsing
        if (values.length >= 3) {
          let distance = parseFloat(values[1]) || 0;
          let force = parseFloat(values[2]) || 0;
          let temp = parseFloat(values[3]) || 0;

          processData.push({
            time: i - dataStartLine,
            distance: distance,
            force: force,
            temperature: temp
          });
        }
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
  const preloadPath = path.join(__dirname, 'preload.js');

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
// let consecutiveErrors = 0;

// async function processModbusLoop() {
//   if (isLoopRunning) return;
//   isLoopRunning = true;
//   console.log("🔄 Background Modbus Loop Started");

//   while (true) {
//     // 0. Critical Check: Unexpected Port Closure
//     if (isConnected && !client.isOpen) {
//       console.error("❌ Port closed unexpectedly (client.isOpen is false). Triggering disconnect.");
//       isConnected = false;
//       consecutiveErrors = 0;
//       if (mainWindow && !mainWindow.isDestroyed()) {
//         mainWindow.webContents.send('modbus-status', 'disconnected');
//       }
//     }

//     // 1. Check Connection
//     if (!isConnected || !client.isOpen) {
//       // Wait before checking again
//       await new Promise(resolve => setTimeout(resolve, 500));
//       continue;
//     }

//     try {
//       // 2. Process High Priority Commands FIRST
//       if (commandQueue.length > 0) {
//         const cmd = commandQueue.shift();
//         console.log(`🚀 Loop: Executing command from queue: ${cmd.commandName} (remaining: ${commandQueue.length})`);
//         try {
//           const result = await cmd.task();
//           console.log(`✅ Loop: Command ${cmd.commandName} execution success!`);
//           cmd.resolve(result);
//         } catch (e) {
//           console.error(`❌ Loop: Command ${cmd.commandName} failed:`, e.message);
//           cmd.reject(e);
//         }
//         continue;
//       }

//       // 3. Read Data Cycle
//       let cycleSuccess = false;
//       let currentEmerState = lastEmerState;
//       let currentPowState = lastPowState;

//       // Read COIL_LLS
//       try {
//         const llsResult = await client.readCoils(COIL_LLS, 1);
//         const currentLLSState = Boolean(llsResult.data[0]);
//         plcState.coilLLS = currentLLSState;
//         cycleSuccess = true;
//         if (currentLLSState !== lastLLSState) {
//           if (mainWindow && !mainWindow.isDestroyed()) {
//             mainWindow.webContents.send('lls-status', currentLLSState.toString());
//           }
//           lastLLSState = currentLLSState;
//           lastPulseTime = Date.now(); // Update pulse timer on transition
//         }
//       } catch (e) { }

//       // Read Mode and Control Coils (Feedback Loop M1-M9)
//       try {
//         const ctrlRes = await client.readCoils(COIL_MANUAL, 9);
//         plcState.manual = Boolean(ctrlRes.data[0]);          // M1
//         plcState.manualExit = Boolean(ctrlRes.data[1]);      // M2
//         plcState.clamp = Boolean(ctrlRes.data[2]);           // M3
//         plcState.probeUp = Boolean(ctrlRes.data[3]);         // M4
//         plcState.probeDown = Boolean(ctrlRes.data[4]);       // M5
//         plcState.catheterBack = Boolean(ctrlRes.data[5]);    // M6
//         plcState.catheterForward = Boolean(ctrlRes.data[6]); // M7
//         plcState.twoPoint = Boolean(ctrlRes.data[7]);        // M8
//         plcState.threePoint = Boolean(ctrlRes.data[8]);      // M9
//       } catch (e) { }

//       // Read Safety Coils
//       try {
//         const emerResult = await client.readCoils(COIL_EMER, 1);
//         currentEmerState = Boolean(emerResult.data[0]);
//         cycleSuccess = true;
//       } catch (e) { }

//       try {
//         const powResult = await client.readCoils(COIL_POW, 1);
//         currentPowState = !Boolean(powResult.data[0]);
//         cycleSuccess = true;
//       } catch (e) { }

//       // Global Safety Check
//       if (currentEmerState || !currentPowState) {
//         console.log(`🚨 Loop Safety Active: emer=${currentEmerState}, pow=${currentPowState} (currentPowState is !Boolean(COIL_POW) = !${!currentPowState}). isHardwareStopActive=${isHardwareStopActive}`);
//         await performSafetyStop(currentEmerState ? "Emergency Pressed" : "Power OFF");
//       } else {
//         if (isHardwareStopActive) {
//           console.log(`✅ Loop Safety Cleared: emer=${currentEmerState}, pow=${currentPowState}`);
//         }
//         isHardwareStopActive = false;
//       }

//       // Emit Safety Updates
//       if (currentEmerState !== lastEmerState) {
//         if (mainWindow && !mainWindow.isDestroyed()) {
//           mainWindow.webContents.send('emergency-status', currentEmerState);
//         }
//         lastEmerState = currentEmerState;
//       }
//       if (currentPowState !== lastPowState) {
//         if (mainWindow && !mainWindow.isDestroyed()) {
//           mainWindow.webContents.send('power-status', currentPowState);
//         }
//         lastPowState = currentPowState;
//       }

//       // Read Registers
//       try {
//         const dRes = await client.readHoldingRegisters(REG_DISTANCE, 1);
//         plcState.distance = dRes.data[0];
//         cycleSuccess = true;
//       } catch (e) { }

//       try {
//         const fRes = await client.readHoldingRegisters(REG_FORCE, 2);
//         const rawLow = fRes.data[0];
//         const rawHigh = fRes.data[1];
//         // Try both: plain 16-bit int (rawLow) and 32-bit float interpretations
//         const asInt16 = rawLow;                              // raw as plain integer
//         const asScaled = rawLow / 10.0;                      // common: value * 0.1
//         const floatLE = registersToFloat32LE(rawLow, rawHigh);
//         const floatBE = registersToFloat32BE(rawLow, rawHigh);
//         // Log every 5s
//         if (Date.now() - (plcState._forceLogTime || 0) > 5000) {
//           console.log(`📊 REG_FORCE(R54) raw words: [${rawLow}, ${rawHigh}]`);
//           console.log(`   → as Int16:  ${asInt16} mN`);
//           console.log(`   → as /10:    ${asScaled} mN`);
//           console.log(`   → as LE f32: ${isFinite(floatLE) ? floatLE.toFixed(3) : 'NaN'} mN`);
//           console.log(`   → as BE f32: ${isFinite(floatBE) ? floatBE.toFixed(3) : 'NaN'} mN`);
//           plcState._forceLogTime = Date.now();
//         }
//         // Use raw Int16 as default — change to asScaled or floatLE if the value looks wrong
//         plcState.force_mN = isFinite(asInt16) ? asInt16 : 0;
//         cycleSuccess = true;
//       } catch (e) {
//         console.error('❌ REG_FORCE read error:', e.message);
//       }

//       try {
//         const mdRes = await client.readHoldingRegisters(REG_MANUAL_DISTANCE, 1);
//         const rawCath = mdRes.data[0];
//         // Store as-is (plain integer, no conversion)
//         plcState.catheterDistance = rawCath;
//         if (Date.now() - (plcState._cathLogTime || 0) > 5000) {
//           console.log(`📊 REG_CATHETER(R71) raw: ${rawCath} mm`);
//           plcState._cathLogTime = Date.now();
//         }
//         cycleSuccess = true;
//       } catch (e) {
//         console.error('❌ REG_CATHETER(R71) read error:', e.message);
//       }
//       // Read Machine Status Register R11
//       try {
//         const statusRes = await client.readHoldingRegisters(REG_MACHINE_STATUS, 1);
//         plcState.machineStatus = statusRes.data[0];
//         cycleSuccess = true;
//         if (Date.now() - (plcState._statusLogTime || 0) > 5000) {
//           let statusText = '';
//           switch (plcState.machineStatus) {
//             case 1: statusText = 'IDLE'; break;
//             case 2: statusText = 'HOMING'; break;
//             case 3: statusText = 'READY'; break;
//             case 4: statusText = 'SEARCHING CONTACT'; break;
//             case 5: statusText = 'RUNNING'; break;
//             case 6: statusText = 'RETRACTING'; break;
//             case 7: statusText = 'COMPLETED'; break;
//             default: statusText = 'UNKNOWN'; break;
//           }
//           console.log(`📊 Machine Status R11: ${plcState.machineStatus} (${statusText})`);
//           plcState._statusLogTime = Date.now();
//         }
//       } catch (e) {
//         console.error('❌ REG_MACHINE_STATUS(R11) read error:', e.message);
//       }

//       // Read Steps Register R72
//       try {
//         const stepsRes = await client.readHoldingRegisters(REG_STEPS, 1);
//         plcState.stepsToMove = stepsRes.data[0];
//         cycleSuccess = true;
//       } catch (e) {
//         console.error('❌ REG_STEPS(R72) read error:', e.message);
//       }

//       // Heartbeat pulse check: if pulse has stopped, trigger disconnection
//       const HEARTBEAT_TIMEOUT = 4000; // 4 seconds timeout
//       if (isConnected && (Date.now() - lastPulseTime > HEARTBEAT_TIMEOUT)) {
//         console.warn(`❌ PLC heartbeat stopped (no transition detected on COIL_LLS for ${Date.now() - lastPulseTime}ms).`);
//         cycleSuccess = false;
//       }

//       // 4. Connection Success/Failure Tracking
//       if (cycleSuccess) {
//         consecutiveErrors = 0;
//       } else {
//         consecutiveErrors++;
//         if (consecutiveErrors >= 5) {
//           isConnected = false;
//           if (mainWindow && !mainWindow.isDestroyed()) {
//             mainWindow.webContents.send('modbus-status', 'disconnected');
//           }
//           try { if (client.isOpen) client.close(); } catch (e) { }
//           consecutiveErrors = 0;
//         }
//       }

//       plcState.lastUpdated = Date.now();

//     } catch (loopError) {
//       console.error("⚠️ Modbus loop error:", loopError.message);
//       // Wait a bit longer on error
//       await new Promise(resolve => setTimeout(resolve, 500));
//       continue;
//     }

//     // 5. Yield / Wait
//     // Short wait to prevent blocking event loop, but keep high poll rate
//     // 20ms = ~50 polls/sec theoretical max (in practice less due to serial latency)
//     await new Promise(resolve => setTimeout(resolve, 20));
//   }
// }

// // Start the loop
// processModbusLoop();
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
        console.log(`🚀 Loop: Executing command from queue: ${cmd.commandName} (remaining: ${commandQueue.length})`);
        try {
          const result = await cmd.task();
          console.log(`✅ Loop: Command ${cmd.commandName} execution success!`);
          cmd.resolve(result);
        } catch (e) {
          console.error(`❌ Loop: Command ${cmd.commandName} failed:`, e.message);
          cmd.reject(e);
        }
        continue;
      }

      // 3. Read Data Cycle
      let cycleSuccess = false;
      let currentEmerState = lastEmerState;
      let currentPowState = lastPowState;

      // Read COIL_LLS (Heartbeat - X bit or M bit based on your PLC)
      try {
        const llsResult = await client.readCoils(COIL_LLS, 1);
        const currentLLSState = Boolean(llsResult.data[0]);
        plcState.coilLLS = currentLLSState;
        cycleSuccess = true;
        if (currentLLSState !== lastLLSState) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lls-status', currentLLSState.toString());
          }
          lastLLSState = currentLLSState;
          lastPulseTime = Date.now(); // Update pulse timer on transition
        }
      } catch (e) { 
        console.error('❌ COIL_LLS read error:', e.message);
      }

      // Read Homing Coil M300
      try {
          const homeResult = await client.readCoils(COIL_HOME, 1);
          const currentHomeState = Boolean(homeResult.data[0]);
          plcState.home = currentHomeState;
          cycleSuccess = true;
          
          // Emit homing status change
          if (currentHomeState !== lastHomeState) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('home-status', currentHomeState);
              }
              lastHomeState = currentHomeState;
          }
      } catch (e) {
          console.error('❌ COIL_HOME read error:', e.message);
      }

      // ==============================================
      // READ M BITS (Internal Relays - Mode Selection)
      // ==============================================
      try {
        const ctrlRes = await client.readCoils(COIL_MANUAL, 9);
        plcState.manual = Boolean(ctrlRes.data[0]);          // M1 (2001)
        plcState.manualExit = Boolean(ctrlRes.data[1]);      // M2 (2002)
        // Note: M3-M7 are not used for mode control but kept for compatibility
        plcState.twoPoint = Boolean(ctrlRes.data[7]);        // M8 (2008)
        plcState.threePoint = Boolean(ctrlRes.data[8]);      // M9 (2009)
        cycleSuccess = true;
      } catch (e) { 
        console.error('❌ Error reading M bits (Mode selection):', e.message);
      }

      // ==============================================
      // READ X BITS (Physical Inputs - Sensors/Switches)
      // ==============================================
      try {
        // Read X3 (Clamp sensor)
        const clampRes = await client.readCoils(COIL_CLAMP, 1);
        plcState.clamp = Boolean(clampRes.data[0]);
        
        // Read X5 (Probe Down sensor)
        const probeDownRes = await client.readCoils(COIL_PROBE_DOWN, 1);
        plcState.probeDown = Boolean(probeDownRes.data[0]);
        
        // Read X6 (Probe Up sensor)
        const probeUpRes = await client.readCoils(COIL_PROBE_UP, 1);
        plcState.probeUp = Boolean(probeUpRes.data[0]);
        
        // Read X7 (Catheter Forward sensor)
        const cathFwdRes = await client.readCoils(COIL_CATHETER_FORWARD, 1);
        plcState.catheterForward = Boolean(cathFwdRes.data[0]);
        
        // Read X8 (Catheter Back sensor)
        const cathBackRes = await client.readCoils(COIL_CATHETER_BACK, 1);
        plcState.catheterBack = Boolean(cathBackRes.data[0]);
        
        cycleSuccess = true;
      } catch (e) { 
        console.error('❌ Error reading X bits (Physical inputs):', e.message);
      }

      // ==============================================
      // READ SAFETY X BITS (Emergency & Power)
      // ==============================================
      try {
        const emerResult = await client.readCoils(COIL_EMER, 1);
        currentEmerState = Boolean(emerResult.data[0]);
        cycleSuccess = true;
      } catch (e) { 
        console.error('❌ COIL_EMER read error:', e.message);
      }

      try {
        const powResult = await client.readCoils(COIL_POW, 1);
        currentPowState = !Boolean(powResult.data[0]);  // Inverted logic for power
        cycleSuccess = true;
      } catch (e) { 
        console.error('❌ COIL_POW read error:', e.message);
      }

      // Global Safety Check
      if (currentEmerState || !currentPowState) {
        console.log(`🚨 Loop Safety Active: emer=${currentEmerState}, pow=${currentPowState}. isHardwareStopActive=${isHardwareStopActive}`);
        await performSafetyStop(currentEmerState ? "Emergency Pressed" : "Power OFF");
      } else {
        if (isHardwareStopActive) {
          console.log(`✅ Loop Safety Cleared: emer=${currentEmerState}, pow=${currentPowState}`);
        }
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
      // try {
      //   const dRes = await client.readHoldingRegisters(REG_DISTANCE, 1);
      //   plcState.distance = dRes.data[0];
      //   cycleSuccess = true;
      // } catch (e) { 
      //   console.error('❌ REG_DISTANCE read error:', e.message);
      // }
      try {
        const dRes = await client.readHoldingRegisters(REG_DISTANCE, 1);
        // Convert raw value (0.1mm units) to actual mm (divide by 10)
        const rawValue = toSigned16(dRes.data[0]);
        plcState.distance = rawValue / 10.0;  // Now in mm with 0.1mm precision
        cycleSuccess = true;
      } catch (e) { 
        console.error('❌ REG_DISTANCE read error:', e.message);
      }
      try {
        const dRes = await client.readHoldingRegisters(TEST_DIST, 1);
        const rawValue = toSigned16(dRes.data[0]);
        plcState.test_Dist = rawValue / 10.0;  // Now in mm with 0.1mm precision
        cycleSuccess = true;
      } catch (e) { 
        console.error('❌ TEST_DIST read error:', e.message);
      }

      // try {
      //   const fRes = await client.readHoldingRegisters(REG_FORCE, 2);
      //   const rawLow = fRes.data[0];
      //   const rawHigh = fRes.data[1];
      //   // Try both: plain 16-bit int (rawLow) and 32-bit float interpretations
      //   const asInt16 = rawLow;                              // raw as plain integer
      //   const asScaled = rawLow / 10.0;                      // common: value * 0.1
      //   const floatLE = registersToFloat32LE(rawLow, rawHigh);
      //   const floatBE = registersToFloat32BE(rawLow, rawHigh);
      //   // Log every 5s
      //   if (Date.now() - (plcState._forceLogTime || 0) > 5000) {
      //     console.log(`📊 REG_FORCE(R54) raw words: [${rawLow}, ${rawHigh}]`);
      //     console.log(`   → as Int16:  ${asInt16} mN`);
      //     console.log(`   → as /10:    ${asScaled} mN`);
      //     console.log(`   → as LE f32: ${isFinite(floatLE) ? floatLE.toFixed(3) : 'NaN'} mN`);
      //     console.log(`   → as BE f32: ${isFinite(floatBE) ? floatBE.toFixed(3) : 'NaN'} mN`);
      //     plcState._forceLogTime = Date.now();
      //   }
      //   // Use raw Int16 as default — change to asScaled or floatLE if the value looks wrong
      //   plcState.force_mN = isFinite(asInt16) ? asInt16 : 0;
      //   cycleSuccess = true;
      // } catch (e) {
      //   console.error('❌ REG_FORCE read error:', e.message);
      // }
      try {
        const fRes = await client.readHoldingRegisters(REG_FORCE, 1); // Read only 1 register
        const rawValue = fRes.data[0];
        
        // Convert from unsigned 16-bit to signed 16-bit (two's complement)
        const signedValue = rawValue > 32767 ? rawValue - 65536 : rawValue;
        
        // Log every 5s
        if (Date.now() - (plcState._forceLogTime || 0) > 5000) {
          console.log(`📊 REG_FORCE(R54) raw: ${rawValue} → signed: ${signedValue} mN`);
          plcState._forceLogTime = Date.now();
        }
        
        // Store the signed value
        plcState.force_mN = signedValue;
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_FORCE read error:', e.message);
      }
      

      try {
        const mdRes = await client.readHoldingRegisters(REG_MANUAL_DISTANCE, 1);
        const rawCath = mdRes.data[0];
        // Store as-is (plain integer, no conversion)
        plcState.catheterDistance = rawCath;
        if (Date.now() - (plcState._cathLogTime || 0) > 5000) {
          console.log(`📊 REG_CATHETER(R71) raw: ${rawCath} mm`);
          plcState._cathLogTime = Date.now();
        }
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_CATHETER(R71) read error:', e.message);
      }

      // Read Machine Status Register R11
      try {
        const statusRes = await client.readHoldingRegisters(REG_MACHINE_STATUS, 1);
        plcState.machineStatus = statusRes.data[0];
        cycleSuccess = true;
        if (Date.now() - (plcState._statusLogTime || 0) > 5000) {
          let statusText = '';
          switch(plcState.machineStatus) {
            case 1: statusText = 'IDLE'; break;
            case 2: statusText = 'HOMING'; break;
            case 3: statusText = 'READY'; break;
            case 4: statusText = 'SEARCHING CONTACT'; break;
            case 5: statusText = 'RUNNING'; break;
            case 6: statusText = 'RETRACTING'; break;
            case 7: statusText = 'COMPLETED'; break;
            default: statusText = 'UNKNOWN'; break;
          }
          console.log(`📊 Machine Status R11: ${plcState.machineStatus} (${statusText})`);
          plcState._statusLogTime = Date.now();
        }
      } catch (e) {
        console.error('❌ REG_MACHINE_STATUS(R11) read error:', e.message);
      }

      // Read Steps Register R72
      try {
        const stepsRes = await client.readHoldingRegisters(REG_STEPS, 1);
        plcState.stepsToMove = stepsRes.data[0];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_STEPS(R72) read error:', e.message);
      }

      // Read Calibration Registers R31-R33
      try {
        const calibRes1 = await client.readHoldingRegisters(31, 3);
        plcState.rawForce = calibRes1.data[0];
        plcState.weightRange = calibRes1.data[1];
        plcState.inputsMode = calibRes1.data[2];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Calibration registers R31-R33 read error:', e.message);
      }

      // Read Calibration Register R36
      try {
        const calibRes2 = await client.readHoldingRegisters(36, 1);
        plcState.realtimePlcValue = calibRes2.data[0];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Calibration register R36 read error:', e.message);
      }

      // Read Settings Force Register R30 (grams)
      try {
        const settingsForceRes = await client.readHoldingRegisters(REG_SETTINGS_FORCE, 1);
        plcState.settingsForce = settingsForceRes.data[0];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Settings Force register R30 read error:', e.message);
      }

      // Heartbeat pulse check: if pulse has stopped, trigger disconnection
      const HEARTBEAT_TIMEOUT = 4000; // 4 seconds timeout
      if (isConnected && (Date.now() - lastPulseTime > HEARTBEAT_TIMEOUT)) {
        console.warn(`❌ PLC heartbeat stopped (no transition detected on COIL_LLS for ${Date.now() - lastPulseTime}ms).`);
        cycleSuccess = false;
      }

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
    await new Promise(resolve => setTimeout(resolve, 1));
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


    // Machine Status — R11
    machineStatus: plcState.machineStatus,
    machineStatusDisplay: (() => {
      switch (plcState.machineStatus) {
        case 1: return 'IDLE';
        case 2: return 'HOMING';
        case 3: return 'READY';
        case 4: return 'SEARCHING CONTACT';
        case 5: return 'RUNNING';
        case 6: return 'RETRACTING';
        case 7: return 'COMPLETED';
        default: return 'UNKNOWN';
      }
    })(),

    // Probe Distance — R70
    // distance: plcState.distance,
    // distanceDisplay: `${plcState.distance} mm`,
    // Probe Distance — R70 (raw value / 10 for 0.1mm precision)
    distance: plcState.distance,
    distanceDisplay: `${plcState.distance.toFixed(1)} mm`,  // Show 1 decimal place


    // TEST Distance — R73
    test_Dist: plcState.test_Dist,
    test_DistDisplay: `${plcState.test_Dist.toFixed(1)} mm`,

    // Force — R54 (32-bit float)
    force_mN: plcState.force_mN,
    forceDisplay: `${plcState.force_mN.toFixed(2)} mN`,

    // Catheter Distance — R71
    catheterDistance: plcState.catheterDistance,
    catheterDistanceDisplay: `${plcState.catheterDistance} mm`,

    // Steps to Move — R72
    stepsToMove: plcState.stepsToMove,
    stepsToMoveDisplay: `${plcState.stepsToMove}`,

    // Calibration parameters
    rawForce: plcState.rawForce,
    weightRange: plcState.weightRange,
    inputsMode: plcState.inputsMode,
    realtimePlcValue: plcState.realtimePlcValue,
    settingsForce: plcState.settingsForce,

    // Coil states
    coilLLS: plcState.coilLLS,
    home: plcState.home,
    clamp: plcState.clamp,
    probeUp: plcState.probeUp,
    probeDown: plcState.probeDown,
    catheterBack: plcState.catheterBack,
    catheterForward: plcState.catheterForward,
    manual: plcState.manual,
    twoPoint: plcState.twoPoint,
    threePoint: plcState.threePoint,

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

// Helper to convert array of objects to CSV string
function convertToCSV(arr, headers) {
  if (!arr || !arr.length) return headers.join(',') + '\n';
  const csvRows = [];
  csvRows.push(headers.join(','));
  for (const row of arr) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

// Helper to convert CSV string to array of objects
function convertFromCSV(csvStr, headers) {
  if (!csvStr) return [];
  const lines = csvStr.trim().split('\n');
  if (lines.length <= 1) return [];

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple split for CSV parsing (assumes no commas in values since we validate inputs)
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
const TWO_POINT_HEADERS = ['configName', 'catheterToLoadCellDistance', 'probeTravelLimit', 'forceLimit', 'testSpeed'];

async function ensure2PointConfig() {
  if (!fs.existsSync(TWO_POINT_DIR)) {
    fs.mkdirSync(TWO_POINT_DIR, { recursive: true });
  }
  if (!fs.existsSync(TWO_POINT_FILE)) {
    await fsPromises.writeFile(TWO_POINT_FILE, TWO_POINT_HEADERS.join(',') + '\n', 'utf8');
  }
}

const THREE_POINT_DIR = path.join(app.getPath('documents'), 'FTM-3-point Test');
const THREE_POINT_FILE = path.join(THREE_POINT_DIR, 'configs.csv');
const THREE_POINT_HEADERS = ['configName', 'testLength', 'measurementInterval','catheterDist', 'probeTravelLimit', 'forceLimit', 'testSpeed', 'horizontalSpeed'];

async function ensure3PointConfig() {
  if (!fs.existsSync(THREE_POINT_DIR)) {
    fs.mkdirSync(THREE_POINT_DIR, { recursive: true });
  }
  if (!fs.existsSync(THREE_POINT_FILE)) {
    await fsPromises.writeFile(THREE_POINT_FILE, THREE_POINT_HEADERS.join(',') + '\n', 'utf8');
  }
}

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
  console.log(`📥 safeExecute: Requesting command: ${commandName}`);
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
    console.log(`📥 safeExecute: Queueing command: ${commandName}. Current queue length: ${commandQueue.length}`);
    commandQueue.push({
      commandName,
      task: async () => {
        try {
          console.log(`⚡ safeExecute executing task: ${commandName}`);
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



// IPC handlers for Start / Stop / Reset Buttons that are used by 3-Point Process Mode 
ipcMain.handle("start", async () => {
  return await safeExecute("START", async () => {
    if (!isConnected) throw new Error('Modbus not connected');

    await client.writeCoil(COIL_STOP, false);
    await client.writeCoil(COIL_RESET, false);
    // await client.writeCoil(COIL_M303, false);
    await client.writeCoil(COIL_START, true);

    return { startInitiated: true };
  });
});


ipcMain.handle("stop", async () => {
  return await safeExecute("STOP", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    await client.writeCoil(COIL_START, false);
    await client.writeCoil(COIL_STOP, true);

    return { success: true };
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


// IPC handlers for Start / Stop / Reset Buttons that are used by 3-Point Process Mode 

ipcMain.handle("start-3point", async () => {
  return await safeExecute("START_3POINT", async () => {
    if (!isConnected) throw new Error('Modbus not connected');

    await client.writeCoil(COIL_3STOP, false);
    await client.writeCoil(COIL_3RESET, false);
    // await client.writeCoil(COIL_M303, false);
    await client.writeCoil(COIL_3START, true);

    return { startInitiated: true };
  });
});

ipcMain.handle("stop-3point", async () => {
  return await safeExecute("STOP_3POINT", async () => {
    if (!isConnected) throw new Error("Modbus not connected");

    await client.writeCoil(COIL_3START, false);
    await client.writeCoil(COIL_3STOP, true);

    return { success: true };
  });
});
ipcMain.handle("reset-3point", async () => {
  return await safeExecute("RESET_3POINT", async () => {
    if (!isConnected) throw new Error('Modbus not connected');

    await client.writeCoil(COIL_3RESET, true);
    await client.writeCoil(COIL_3STOP, false);

    return { resetPressed: true };
  });
});


// ipcMain.handle("heating", async () => {
//   return { success: true };
// });

// ipcMain.handle("heater", async () => {
//   return { success: true };
// });

// ipcMain.handle("heater-off", async () => {
//   return { success: true };
// });

// ipcMain.handle("retraction", async () => {
//   return { success: true };
// });


// ipcMain.handle("manual", async () => {
//   console.log("⚡ IPC: manual command received");
//   return await safeExecute("MANUAL-MODE", async () => {
//     if (!isConnected) throw new Error('Modbus not connected');
//     console.log(`🔌 Writing COIL_MANUAL(2001) = true, COIL_MANUAL_EXIT(2002) = false`);
//     const res1 = await client.writeCoil(COIL_MANUAL, true);
//     const res2 = await client.writeCoil(COIL_MANUAL_EXIT, false);
//     console.log(`✅ Modbus write responses:`, res1, res2);
//     return { manualModeActivated: true };
//   });
// });
ipcMain.handle("manual", async () => {
  return await safeExecute("MANUAL-MODE", async () => {
    if (!isConnected) throw new Error('Modbus not connected');
    await client.writeCoil(COIL_MANUAL, true);
    await client.writeCoil(COIL_2POINT, false);
    await client.writeCoil(COIL_3POINT, false);
    // await client.writeCoil(COIL_RET, false);
    // await client.writeCoil(COIL_INSERTION, false);
    // await client.writeCoil(COIL_CLAMP, false);
    return { manualModeActivated: true };
  });
});

ipcMain.handle("manual-mode-activate", async () => {
  console.log("⚡ IPC: manual-mode-activate command received");
  return queueOrExecuteModeActivation("MANUAL-MODE-ACTIVATE", "manual", writeManualModeCoils);
});

ipcMain.handle("manual-mode-deactivate", async () => {
  activeTestMode = null;
  if (!isConnected) {
    updatePlcModeState(null);
    return { success: true, pending: true };
  }
  return await safeExecute("MANUAL-MODE-DEACTIVATE", async () => {
    if (!isConnected) throw new Error('Modbus not connected');
    await writeDeactivateModeCoils();
    return { success: true };
  });
});


ipcMain.handle("two-point-activate", async () => {
  console.log("⚡ IPC: two-point-activate command received");
  return queueOrExecuteModeActivation("TWO-POINT-ACTIVATE", "2-point", writeTwoPointCoils);
});

ipcMain.handle("three-point-activate", async () => {
  console.log("⚡ IPC: three-point-activate command received");
  return queueOrExecuteModeActivation("THREE-POINT-ACTIVATE", "3-point", writeThreePointCoils);
});

ipcMain.handle("deactivate-manual", async () => {
  activeTestMode = null;
  if (!isConnected) {
    updatePlcModeState(null);
    return { success: true, pending: true };
  }
  return await safeExecute("DEACTIVATE-MANUAL", async () => {
    if (!isConnected) throw new Error('Modbus not connected');
    await writeDeactivateModeCoils();
    return { success: true };
  });
});

ipcMain.handle("disable-manual-mode", async () => {
  activeTestMode = null;
  if (!isConnected) {
    updatePlcModeState(null);
    return { manualModeDisabled: true, pending: true };
  }
  return await safeExecute("DISABLE-MANUAL-MODE", async () => {
    if (!isConnected) throw new Error('Modbus not connected');
    await writeDeactivateModeCoils();
    return { manualModeDisabled: true };
  });
});
// // Add these handlers after the other IPC handlers
// ipcMain.handle("home", async () => {
//   return await safeExecute("HOME", async () => {
//     if (!isConnected) throw new Error("Modbus not connected");
//     // Pulse the home coil (turn ON then OFF after 2 seconds)
//     await client.writeCoil(COIL_HOME, true);
//     setTimeout(async () => {
//       try {
//         await client.writeCoil(COIL_HOME, false);
//       } catch (e) {
//         console.error("Error turning off HOME coil:", e.message);
//       }
//     }, 2000);
//     return { success: true };
//   });
// });

ipcMain.handle("tare", async () => {
  return await safeExecute("TARE", async () => {
    if (!isConnected) throw new Error("Modbus not connected");
    await client.writeCoil(COIL_TARE, true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await client.writeCoil(COIL_TARE, false);
    return { success: true };
  });
});

ipcMain.handle("write-coil-settings", async (event, value) => {
  return await safeExecute("WRITE-COIL-SETTINGS", async () => {
    if (!isConnected) throw new Error("Modbus not connected");
    console.log(`🔌 Writing COIL_SETTINGS(2302) = ${value ? 1 : 0}`);
    await client.writeCoil(COIL_SETTINGS, value);
    return { success: true };
  });
});

ipcMain.handle("write-coil-m303", async (event, value) => {
  return await safeExecute("WRITE-COIL-M303", async () => {
    if (!isConnected) throw new Error("Modbus not connected");
    console.log(`🔌 Writing COIL_M303(2303) = ${value ? 1 : 0}`);
    await client.writeCoil(COIL_M303, value);
    return { success: true };
  });
});

ipcMain.handle("clamp-control", async () => {
  return { success: true };
});

ipcMain.handle("probe-up", async () => {
  return { success: true };
});

ipcMain.handle("probe-down", async () => {
  return { success: true };
});

ipcMain.handle("probe-stop", async () => {
  return { success: true };
});

ipcMain.handle("catheter-forward", async () => {
  return { success: true };
});

ipcMain.handle("catheter-backward", async () => {
  return { success: true };
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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// ipcMain.handle("send-process-mode", async (event, config) => {
//   return await safeExecute("SEND_PROCESS_CONFIG", async () => {
//     try {
//       console.log('🔧 Process mode config received:', config);

//       if (!isConnected || !client.isOpen) {
//         throw new Error('Modbus not connected');
//       }

//       // Parse configuration values
//       const pathLength = parseInt(config.pathlength);
//       const thresholdForce = parseFloat(config.thresholdForce); // mN
//       const insertionLength = parseFloat(config.insertionLength); // mm
//       const retractionLength = parseFloat(config.retractionLength); // mm

//       console.log('📊 Parsed config values:', {
//         pathLength: `${pathLength} mm`,
//         thresholdForce: `${thresholdForce} mN`,
//         insertionLength: `${insertionLength} mm`,
//         retractionLength: `${retractionLength} mm`
//       });

//       // Validate values
//       if (isNaN(pathLength) || isNaN(thresholdForce) || isNaN(retractionLength)) {
//         console.error('❌ Invalid configuration values');
//         return false;
//       }

//       const results = [];

//       // 1. Write Path Length
//       console.log(`📝 Writing Path Length: ${pathLength} mm to address 6000`);
//       await client.writeRegister(6000, pathLength);
//       await delay(150);
//       console.log('✅ Path Length written to address 6000');
//       results.push({ register: '6000 (D0)', value: pathLength, success: true });

//       // 2. Write Threshold Force
//       const thresholdForceValue = Math.round(thresholdForce);
//       console.log(`📝 Writing Threshold Force: ${thresholdForceValue} mN to R150`);
//       await client.writeRegister(150, thresholdForceValue);
//       await delay(150);
//       console.log('✅ Threshold Force written to R150');
//       results.push({ register: '150 (R150)', value: thresholdForceValue, success: true });

//       // 3. Write Temperature
//       const insertionValue = Math.round(insertionLength); // 0.1°C
//       console.log(`📝 Writing Insertion Length: ${insertionValue} to 6050`);
//       await client.writeRegister(6050, insertionValue);
//       await delay(150);
//       console.log('✅ Insertion length written to 6050');
//       results.push({ register: '6050 (D50)', value: insertionValue, success: true });

//       // 4. Write Retraction Length
//       const retractionValue = Math.round(retractionLength);
//       console.log(`📝 Writing Retraction Stroke Length: ${retractionValue} mm to R122`);
//       await client.writeRegister(122, retractionValue);
//       await delay(150);
//       console.log('✅ Retraction Stroke Length written to R122');
//       results.push({ register: '122 (R122)', value: retractionValue, success: true });

//       console.log('✅ All configuration values written');
//       console.log('📋 Write results:', results);

//       return true;

//     } catch (error) {
//       console.error('❌ Error sending process mode:', error.message);
//       return false;
//     }
//   });
// });

// Write Weight Range to R32
ipcMain.handle("write-weight-range", async (event, value) => {
  return await safeExecute("WRITE_WEIGHT_RANGE", async () => {
    try {
      const numVal = Number(value);
      console.log(`📝 Writing Weight Range: ${numVal} to R32`);

      if (!isConnected || !client.isOpen) {
        throw new Error('Modbus not connected');
      }

      await client.writeRegister(32, numVal);
      await delay(150);

      plcState.weightRange = numVal;

      return { success: true };
    } catch (error) {
      console.error('❌ Error writing weight range (R32):', error.message);
      return { success: false, error: error.message };
    }
  });
});

// Write Inputs Mode to R33
ipcMain.handle("write-inputs-mode", async (event, value) => {
  return await safeExecute("WRITE_INPUTS_MODE", async () => {
    try {
      const numVal = Number(value);
      console.log(`📝 Writing Inputs Mode: ${numVal} to R33`);

      if (!isConnected || !client.isOpen) {
        throw new Error('Modbus not connected');
      }

      await client.writeRegister(33, numVal);
      await delay(150);

      plcState.inputsMode = numVal;

      return { success: true };
    } catch (error) {
      console.error('❌ Error writing inputs mode (R33):', error.message);
      return { success: false, error: error.message };
    }
  });
});

ipcMain.handle("send-2point-config", async (event, config) => {
  return await safeExecute("SEND_2POINT_CONFIG", async () => {
    try {
      console.log('🔧 2-Point config received:', config);

      if (!isConnected || !client.isOpen) {
        throw new Error('Modbus not connected');
      }

      // Parse configuration values
      const catheterToLoadCellDistance = parseFloat(config.catheterToLoadCellDistance);
      const probeTravelLimit = parseFloat(config.probeTravelLimit);
      const forceLimit = parseFloat(config.forceLimit);
      const testSpeed = parseFloat(config.testSpeed);

      // Validate values
      if (isNaN(catheterToLoadCellDistance) || isNaN(probeTravelLimit) || isNaN(forceLimit) || isNaN(testSpeed)) {
        console.error('❌ Invalid 2-point configuration values');
        return false;
      }

      const results = [];

      // 0. Write Catheter To LoadCell Distance to R82
      const catheterDistanceValue = Math.round(catheterToLoadCellDistance);
      console.log(`📝 Writing Catheter To LoadCell Distance: ${catheterDistanceValue} to R82`);
      await client.writeRegister(82, catheterDistanceValue);
      await delay(150);
      results.push({ register: '82 (R82)', value: catheterDistanceValue, success: true });

      // 1. Write Probe_travel_limit to R1
      const probeTravelLimitValue = Math.round(probeTravelLimit);
      console.log(`📝 Writing Probe Travel Limit: ${probeTravelLimitValue} to R1`);
      await client.writeRegister(1, probeTravelLimitValue);
      await delay(150);
      results.push({ register: '1 (R1)', value: probeTravelLimitValue, success: true });

      // 2. Write Force_limit to R2
      const forceLimitValue = Math.round(forceLimit);
      console.log(`📝 Writing Force Limit: ${forceLimitValue} to R2`);
      await client.writeRegister(2, forceLimitValue);
      await delay(150);
      results.push({ register: '2 (R2)', value: forceLimitValue, success: true });

      // 3. Write Test_speed to R3
      const testSpeedValue = Math.round(testSpeed);
      console.log(`📝 Writing Test Speed: ${testSpeedValue} to R3`);
      await client.writeRegister(3, testSpeedValue);
      await delay(150);
      results.push({ register: '3 (R3)', value: testSpeedValue, success: true });

      console.log('✅ 2-Point configuration values written');
      console.log('📋 Write results:', results);

      return true;

    } catch (error) {
      console.error('❌ Error sending 2-point config:', error.message);
      return false;
    }
  });
});

ipcMain.handle("send-3point-config", async (event, config) => {
  return await safeExecute("SEND_3POINT_CONFIG", async () => {
    try {
      console.log('🔧 3-Point config received:', config);

      if (!isConnected || !client.isOpen) {
        throw new Error('Modbus not connected');
      }

      // Parse configuration values
      const testLength = parseFloat(config.testLength);
      const measurementInterval = parseFloat(config.measurementInterval);
      const catheterDist = parseFloat(config.catheterDist)
      const probeTravelLimit = parseFloat(config.probeTravelLimit);
      const forceLimit = parseFloat(config.forceLimit);
      const testSpeed = parseFloat(config.testSpeed);
      const horizontalSpeed = parseFloat(config.horizontalSpeed);

      // Validate values
      if (isNaN(testLength) || isNaN(measurementInterval) || isNaN(probeTravelLimit) ||
        isNaN(forceLimit) || isNaN(testSpeed) || isNaN(horizontalSpeed)) {
        console.error('❌ Invalid 3-point configuration values');
        return false;
      }

      const results = [];

      // 1. Write Test_length to R4
      const testLengthValue = Math.round(testLength);
      await client.writeRegister(4, testLengthValue);
      await delay(150);
      results.push({ register: '4 (R4)', value: testLengthValue, success: true });

      // 2. Write Measurement_Interval to R5
      const measurementIntervalValue = Math.round(measurementInterval);
      await client.writeRegister(5, measurementIntervalValue);
      await delay(150);
      results.push({ register: '5 (R5)', value: measurementIntervalValue, success: true });

      //4. Write the catheter to loadcell Distance
      const catheterDistValue = Math.round(catheterDist);
      await client.writeRegister(9, catheterDistValue);
      await delay(150);
      results.push({ register: '9 (R9)',value: catheterDistValue, success: true });


      // 3. Write Probe_travel_limit to R6
      const probeTravelLimitValue = Math.round(probeTravelLimit);
      await client.writeRegister(6, probeTravelLimitValue);
      await delay(150);
      results.push({ register: '6 (R6)', value: probeTravelLimitValue, success: true });

      // 4. Write Force_limit to R7
      const forceLimitValue = Math.round(forceLimit);
      await client.writeRegister(7, forceLimitValue);
      await delay(150);
      results.push({ register: '7 (R7)', value: forceLimitValue, success: true });

      // 5. Write Test_speed to R8
      const testSpeedValue = Math.round(testSpeed);
      await client.writeRegister(8, testSpeedValue);
      await delay(150);
      results.push({ register: '8 (R8)', value: testSpeedValue, success: true });

      // 7. Write Horizontal_speed to R10
      const horizontalSpeedValue = Math.round(horizontalSpeed);
      await client.writeRegister(10, horizontalSpeedValue);
      await delay(150);
      results.push({ register: '10 (R10)', value: horizontalSpeedValue, success: true });

      console.log('✅ 3-Point configuration values written');
      console.log('📋 Write results:', results);

      return true;

    } catch (error) {
      console.error('❌ Error sending 3-point config:', error.message);
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
ipcMain.handle("get-update-progress", () => {
  // Placeholder or state return if needed
  return { success: true };
});

// -------------------------
// App lifecycle
// -------------------------
ipcMain.handle("download-update", async () => {
  autoUpdater.downloadUpdate();
  return { success: true };
});

ipcMain.handle("quit-and-install", () => {
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
