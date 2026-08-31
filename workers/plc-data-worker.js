// Run as a child process using IPC
function postMessage(msg) {
  if (process.send) {
    process.send(msg);
  }
}

// Ensure clean exit when parent disconnects
process.on('disconnect', () => {
  console.log('Parent process disconnected, exiting Modbus worker...');
  try {
    if (client.isOpen) client.close();
  } catch (e) { /* ignore */ }
  process.exit(0);
});
const ModbusRTU = require('modbus-serial');
const {
  BAUDRATE,
  HEARTBEAT_TIMEOUT,
  COIL_POW,
  COIL_EMER,
  COIL_LLS,
  COIL_MANUAL,
  COIL_MANUAL_EXIT,
  COIL_HOME,
  COIL_CLAMP,
  COIL_PROBE_UP,
  COIL_PROBE_DOWN,
  COIL_CATHETER_BACK,
  COIL_CATHETER_FORWARD,
  CLAMP_BUTTON,
  PROBE_UP_BUTTON,
  PROBE_DOWN_BUTTON,
  CATHETER_BACK_BUTTON,
  CATHETER_FORWARD_BUTTON,
  COIL_2POINT,
  COIL_3POINT,
  REG_DISTANCE,
  TEST_DIST,
  REG_FORCE,
  REG_MANUAL_DISTANCE,
  REG_MACHINE_STATUS,
  REG_STEPS,
  REG_SETTINGS_FORCE,
  REG_CATHDIST,
  TP_TEST_DIST,
} = require('./plc-constants');
const { toSigned16 } = require('./plc-read-utils');

const client = new ModbusRTU();

let isConnected = false;
let PORT = null;
let lastPulseTime = Date.now();
let lastHomeState = false;
let lastLLSState = false;
let lastEmerState = false;
let lastPowState = false;
let isHardwareStopActive = false;
let isLoopRunning = false;
let consecutiveErrors = 0;
let activeTestMode = null;

const commandQueue = [];

let plcState = {
  distance: 0,
  test_Dist: 0,
  force_mN: 0,
  catheterDistance: 0,
  catheterDistanceR450: 0,
  tpTestDist: 0,
  machineStatus: 1,
  stepsToMove: 0,
  coilLLS: false,
  home: false,
  clamp: false,
  probeUp: false,
  probeDown: false,
  catheterBack: false,
  catheterForward: false,
  manual: false,
  manualExit: false,
  twoPoint: false,
  threePoint: false,
  rawForce: 0,
  weightRange: 0,
  inputsMode: 0,
  realtimePlcValue: 0,
  settingsForce: 0,
  lastUpdated: 0,
};

function postPlcState() {
  postMessage({
    type: 'plc-state',
    payload: {
      ...plcState,
      isConnected,
      port: PORT,
      lastEmerState,
      lastPowState,
      lastHomeState,
      lastLLSState,
    },
  });
}

function postEvent(event, payload) {
  postMessage({ type: 'event', event, payload });
}

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
  await client.writeCoil(CLAMP_BUTTON, false);
  await client.writeCoil(PROBE_UP_BUTTON, false);
  await client.writeCoil(PROBE_DOWN_BUTTON, false);
  await client.writeCoil(CATHETER_BACK_BUTTON, false);
  await client.writeCoil(CATHETER_FORWARD_BUTTON, false);
  updatePlcModeState(null);
}

async function applySetMode(mode) {
  switch (mode) {
    case '2-point':
      await writeTwoPointCoils();
      break;
    case '3-point':
      await writeThreePointCoils();
      break;
    case 'manual':
      await writeManualModeCoils();
      break;
    case 'deactivate':
      await writeDeactivateModeCoils();
      break;
    default:
      throw new Error(`Unknown setMode: ${mode}`);
  }
}

async function executeOp(op) {
  switch (op.op) {
    case 'writeCoil':
      await client.writeCoil(op.coil, op.value);
      break;
    case 'writeRegister':
      await client.writeRegister(op.address, op.value);
      break;
    case 'delay':
      await new Promise((resolve) => setTimeout(resolve, op.ms));
      break;
    case 'setMode':
      await applySetMode(op.mode);
      break;
    default:
      throw new Error(`Unknown op: ${op.op}`);
  }
}

async function executeOps(ops) {
  for (const op of ops) {
    await executeOp(op);
  }
}

async function verifyPulses(clientInstance) {
  let pulseCount = 0;
  let lastVal = null;
  const pollInterval = 100;
  const maxWaitTime = 10000;
  const startTime = Date.now();

  console.log('🔍 Verifying 3 continuous pulses (0 -> 1 transitions) on COIL_LLS (3922)...');

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const res = await clientInstance.readCoils(COIL_LLS, 1);
      if (res && res.data && res.data.length > 0) {
        const val = res.data[0] ? 1 : 0;

        if (lastVal !== null) {
          if (lastVal === 0 && val === 1) {
            pulseCount++;
            console.log(`📡 Pulse ${pulseCount} detected (0 -> 1)`);
          }
        }
        lastVal = val;

        if (pulseCount >= 3) {
          console.log('✅ Successfully verified 3 pulses. Connection confirmed.');
          return true;
        }
      }
    } catch (readErr) {
      // Don't crash verification on temporary bus noise or single timeout
      // Log periodically or keep polling until maxWaitTime
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  console.log(`❌ Failed to detect 3 pulses within ${maxWaitTime}ms. Found ${pulseCount} pulses.`);
  return false;
}

async function performSafetyStop(reason) {
  console.log(`⚠️ SAFETY STOP TRIGGERED: ${reason}. Clearing queue! Previous queue size: ${commandQueue.length}`);

  commandQueue.length = 0;

  if (!isHardwareStopActive) {
    isHardwareStopActive = true;
    try {
      if (client.isOpen) {
        console.log('🔌 Safety Stop: Writing COIL_MANUAL(false) and COIL_MANUAL_EXIT(true)');
        await client.writeCoil(COIL_MANUAL, false);
        await client.writeCoil(COIL_MANUAL_EXIT, true);
        console.log('🛑 Manual Mode Deactivated on PLC (Safety Stop Active)');
      }
    } catch (err) {
      console.error('❌ Failed to write safety stop coils:', err.message);
      isHardwareStopActive = false;
    }
  }
}

async function connect(targetPort) {
  try {
    console.log('🔌 Attempting to connect to Modbus on', targetPort);

    if (client.isOpen) {
      try { client.close(); } catch (e) {}
    }

    await client.connectRTUBuffered(targetPort, {
      baudRate: BAUDRATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'Even',
    });

    client.setID(1);
    // Set Modbus response timeout to 1000ms
    client.setTimeout(1000);

    const verified = await verifyPulses(client);
    if (!verified) {
      throw new Error('Could not verify 3 pulses on COIL_LLS');
    }

    client.setTimeout(1000);

    isConnected = true;
    lastPulseTime = Date.now();
    PORT = targetPort;
    consecutiveErrors = 0;
    console.log('✅ Modbus connected and pulse verified on', PORT);

    postEvent('connected', { port: PORT });

    if (activeTestMode) {
      await applyActiveTestModeInternal();
    }

    postPlcState();
    return { success: true, port: PORT };
  } catch (err) {
    console.warn(`❌ Connection/verification failed on ${targetPort}:`, err.message);
    isConnected = false;
    PORT = null;
    try {
      if (client.isOpen) client.close();
    } catch (e) { /* ignore */ }
    return { success: false, message: err.message };
  }
}

async function disconnect() {
  isConnected = false;
  PORT = null;
  consecutiveErrors = 0;
  try {
    if (client.isOpen) client.close();
  } catch (e) { /* ignore */ }
  postEvent('disconnected', {});
  postPlcState();
  return { success: true };
}

async function applyActiveTestModeInternal() {
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

async function processModbusLoop() {
  if (isLoopRunning) return;
  isLoopRunning = true;
  console.log('🔄 Background Modbus Loop Started');

  while (true) {
    if (isConnected && !client.isOpen) {
      console.error('❌ Port closed unexpectedly (client.isOpen is false). Triggering disconnect.');
      isConnected = false;
      consecutiveErrors = 0;
      postEvent('disconnected', {});
    }

    if (!isConnected || !client.isOpen) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    try {
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

      let cycleSuccess = false;
      let currentEmerState = lastEmerState;
      let currentPowState = lastPowState;

      try {
        const llsResult = await client.readCoils(COIL_LLS, 1);
        const currentLLSState = Boolean(llsResult.data[0]);
        plcState.coilLLS = currentLLSState;
        cycleSuccess = true;
        if (currentLLSState !== lastLLSState) {
          postEvent('lls-status', currentLLSState.toString());
          lastLLSState = currentLLSState;
          lastPulseTime = Date.now();
        }
      } catch (e) {
        console.error('❌ COIL_LLS read error:', e.message);
      }

      try {
        const homeResult = await client.readCoils(COIL_HOME, 1);
        const currentHomeState = Boolean(homeResult.data[0]);
        plcState.home = currentHomeState;
        cycleSuccess = true;

        if (currentHomeState !== lastHomeState) {
          postEvent('home-status', currentHomeState);
          lastHomeState = currentHomeState;
        }
      } catch (e) {
        console.error('❌ COIL_HOME read error:', e.message);
      }

      try {
        const ctrlRes = await client.readCoils(COIL_MANUAL, 9);
        plcState.manual = Boolean(ctrlRes.data[0]);
        plcState.manualExit = Boolean(ctrlRes.data[1]);
        plcState.twoPoint = Boolean(ctrlRes.data[7]);
        plcState.threePoint = Boolean(ctrlRes.data[8]);
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Error reading M bits (Mode selection):', e.message);
      }

      try {
        const clampRes = await client.readCoils(COIL_CLAMP, 1);
        plcState.clamp = Boolean(clampRes.data[0]);

        const probeDownRes = await client.readCoils(COIL_PROBE_DOWN, 1);
        plcState.probeDown = Boolean(probeDownRes.data[0]);

        const probeUpRes = await client.readCoils(COIL_PROBE_UP, 1);
        plcState.probeUp = Boolean(probeUpRes.data[0]);

        const cathFwdRes = await client.readCoils(COIL_CATHETER_FORWARD, 1);
        plcState.catheterForward = Boolean(cathFwdRes.data[0]);

        const cathBackRes = await client.readCoils(COIL_CATHETER_BACK, 1);
        plcState.catheterBack = Boolean(cathBackRes.data[0]);

        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Error reading X bits (Physical inputs):', e.message);
      }

      try {
        const emerResult = await client.readCoils(COIL_EMER, 1);
        currentEmerState = Boolean(emerResult.data[0]);
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ COIL_EMER read error:', e.message);
      }

      try {
        const powResult = await client.readCoils(COIL_POW, 1);
        currentPowState = Boolean(powResult.data[0]);
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ COIL_POW read error:', e.message);
      }

      if (currentEmerState || !currentPowState) {
        console.log(`🚨 Loop Safety Active: emer=${currentEmerState}, pow=${currentPowState}. isHardwareStopActive=${isHardwareStopActive}`);
        await performSafetyStop(currentEmerState ? 'Emergency Pressed' : 'Power OFF');
      } else {
        if (isHardwareStopActive) {
          console.log(`✅ Loop Safety Cleared: emer=${currentEmerState}, pow=${currentPowState}`);
        }
        isHardwareStopActive = false;
      }

      if (currentEmerState !== lastEmerState) {
        postEvent('emergency-status', currentEmerState);
        lastEmerState = currentEmerState;
      }
      if (currentPowState !== lastPowState) {
        postEvent('power-status', currentPowState);
        lastPowState = currentPowState;
      }

      try {
        const dRes = await client.readHoldingRegisters(REG_DISTANCE, 1);
        const rawValue = toSigned16(dRes.data[0]);
        plcState.distance = rawValue / 10.0;
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_DISTANCE read error:', e.message);
      }

      try {
        const dRes = await client.readHoldingRegisters(TEST_DIST, 1);
        const rawValue = toSigned16(dRes.data[0]);
        plcState.test_Dist = rawValue / 10.0;
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ TEST_DIST read error:', e.message);
      }

      try {
        const fRes = await client.readHoldingRegisters(REG_FORCE, 1);
        const rawValue = fRes.data[0];
        const signedValue = rawValue > 32767 ? rawValue - 65536 : rawValue;

        if (Date.now() - (plcState._forceLogTime || 0) > 5000) {
          console.log(`📊 REG_FORCE(R54) raw: ${rawValue} → signed: ${signedValue} mN`);
          plcState._forceLogTime = Date.now();
        }

        plcState.force_mN = signedValue;
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_FORCE read error:', e.message);
      }

      try {
        const mdRes = await client.readHoldingRegisters(REG_MANUAL_DISTANCE, 1);
        const rawCath = toSigned16(mdRes.data[0]);
        plcState.catheterDistance = rawCath / 10.0;
        if (Date.now() - (plcState._cathLogTime || 0) > 5000) {
          console.log(`📊 REG_CATHETER(R71) raw: ${rawCath} mm,converted:${rawCath / 10}mm`);
          plcState._cathLogTime = Date.now();
        }
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_CATHETER(R71) read error:', e.message);
      }

      try {
        const cdRes = await client.readHoldingRegisters(REG_CATHDIST, 1);
        const rawCathDist = cdRes.data[0];
        plcState.catheterDistanceR450 = rawCathDist / 10;
        if (Date.now() - (plcState._cathDistLogTime || 0) > 5000) {
          console.log(`📊 REG_CATHDIST(R450) raw: ${rawCathDist} mm, converted: ${rawCathDist / 10} mm`);
          plcState._cathDistLogTime = Date.now();
        }
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_CATHDIST(R450) read error:', e.message);
      }

      try {
        const tpRes = await client.readHoldingRegisters(TP_TEST_DIST, 1);
        const rawTpDist = toSigned16(tpRes.data[0]);
        plcState.tpTestDist = rawTpDist / 10.0;
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ TP_TEST_DIST(R452) read error:', e.message);
      }

      try {
        const statusRes = await client.readHoldingRegisters(REG_MACHINE_STATUS, 1);
        plcState.machineStatus = statusRes.data[0];
        cycleSuccess = true;
        if (Date.now() - (plcState._statusLogTime || 0) > 5000) {
          let statusText = '';
          switch (plcState.machineStatus) {
            case 2: statusText = 'HOMING'; break;
            case 3: statusText = 'READY'; break;
            case 4: statusText = 'SEARCHING CONTACT'; break;
            case 5: statusText = 'RUNNING'; break;
            case 6: statusText = 'CATHETER MOVEMENT'; break;
            case 7: statusText = 'RETRACTING'; break;
            default: statusText = 'READY'; break;
          }
          console.log(`📊 Machine Status R11: ${plcState.machineStatus} (${statusText})`);
          plcState._statusLogTime = Date.now();
        }
      } catch (e) {
        console.error('❌ REG_MACHINE_STATUS(R11) read error:', e.message);
      }

      try {
        const stepsRes = await client.readHoldingRegisters(REG_STEPS, 1);
        plcState.stepsToMove = stepsRes.data[0];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ REG_STEPS(R72) read error:', e.message);
      }

      try {
        const calibRes1 = await client.readHoldingRegisters(31, 3);
        plcState.rawForce = calibRes1.data[0];
        plcState.weightRange = calibRes1.data[1];
        plcState.inputsMode = calibRes1.data[2];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Calibration registers R31-R33 read error:', e.message);
      }

      try {
        const calibRes2 = await client.readHoldingRegisters(36, 1);
        plcState.realtimePlcValue = calibRes2.data[0];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Calibration register R36 read error:', e.message);
      }

      try {
        const settingsForceRes = await client.readHoldingRegisters(REG_SETTINGS_FORCE, 1);
        plcState.settingsForce = settingsForceRes.data[0];
        cycleSuccess = true;
      } catch (e) {
        console.error('❌ Settings Force register R30 read error:', e.message);
      }

      if (isConnected && (Date.now() - lastPulseTime > HEARTBEAT_TIMEOUT)) {
        console.warn(`❌ PLC heartbeat stopped (no transition detected on COIL_LLS for ${Date.now() - lastPulseTime}ms).`);
        cycleSuccess = false;
      }

      if (cycleSuccess) {
        consecutiveErrors = 0;
      } else {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          isConnected = false;
          postEvent('disconnected', {});
          postEvent('read-error', { reason: 'consecutive read failures' });
          try { if (client.isOpen) client.close(); } catch (e) { /* ignore */ }
          consecutiveErrors = 0;
        }
      }

      plcState.lastUpdated = Date.now();
      postPlcState();
    } catch (loopError) {
      console.error('⚠️ Modbus loop error:', loopError.message);
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function enqueueOps(commandName, ops) {
  return new Promise((resolve, reject) => {
    if (!isConnected) {
      return resolve({
        success: false,
        message: 'Modbus not connected.',
        error: 'NOT_CONNECTED',
      });
    }

    console.log(`📥 enqueueOps: Queueing command: ${commandName}. Current queue length: ${commandQueue.length}`);
    commandQueue.push({
      commandName,
      task: async () => {
        console.log(`⚡ enqueueOps executing task: ${commandName}`);
        await executeOps(ops);
        return { success: true };
      },
      resolve,
      reject,
    });
  });
}

function applyActiveTestMode(mode) {
  activeTestMode = mode;
  if (mode === null || mode === 'deactivate') {
    updatePlcModeState(null);
  } else {
    updatePlcModeState(mode);
  }

  if (!isConnected) {
    console.log(`⏳ applyActiveTestMode: queued until Modbus connects (mode: ${mode})`);
    return Promise.resolve({ success: true, pending: true, mode });
  }

  return enqueueOps(`APPLY-MODE-${mode}`, [{ op: 'setMode', mode: mode === 'deactivate' ? 'deactivate' : mode }]);
}

function syncActiveTestMode(mode) {
  activeTestMode = mode;
  return { success: true };
}

process.on('message', async (msg) => {
  const { id, method, payload } = msg;

  try {
    let result;
    switch (method) {
      case 'connect':
        result = await connect(payload.port);
        break;
      case 'disconnect':
        result = await disconnect();
        break;
      case 'enqueue-ops':
        result = await enqueueOps(payload.commandName, payload.ops);
        break;
      case 'apply-active-mode':
        result = await applyActiveTestMode(payload.mode);
        break;
      case 'sync-active-mode':
        result = syncActiveTestMode(payload.mode);
        break;
      default:
        throw new Error(`Unknown RPC method: ${method}`);
    }
    postMessage({ type: 'rpc-response', id, result });
  } catch (error) {
    postMessage({
      type: 'rpc-response',
      id,
      error: { message: error.message, stack: error.stack },
    });
  }
});

processModbusLoop();
