const path = require('path');
const { fork } = require('child_process');

class PlcBridge {
  constructor() {
    this.plcState = {};
    this.isConnected = false;
    this.PORT = null;
    this.lastEmerState = false;
    this.lastPowState = false;
    this.lastHomeState = false;
    this.lastLLSState = false;
    this._lastSentEmer = null;
    this._lastSentPow = null;

    this._mainWindowGetter = null;
    this._callbacks = {};
    this._plcWorker = null;
    this._usbWorker = null;
    this._rpcId = 0;
    this._pendingRpc = new Map();
    this._monitoredPort = null;
  }

  init(mainWindowGetter, callbacks = {}) {
    this._mainWindowGetter = mainWindowGetter;
    this._callbacks = callbacks;
    this._startPlcWorker();
  }

  _getMainWindow() {
    if (!this._mainWindowGetter) return null;
    const win = this._mainWindowGetter();
    if (!win || win.isDestroyed()) return null;
    return win;
  }

  _sendToRenderer(channel, payload) {
    const mainWindow = this._getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(channel, payload);
    }
  }

  _syncSafetyStatusToRenderer() {
    if (this._lastSentEmer !== this.lastEmerState) {
      this._lastSentEmer = this.lastEmerState;
      this._sendToRenderer('emergency-status', this.lastEmerState);
    }
    if (this._lastSentPow !== this.lastPowState) {
      this._lastSentPow = this.lastPowState;
      this._sendToRenderer('power-status', this.lastPowState);
    }
  }

  _startPlcWorker() {
    if (this._plcWorker) return;

    this._plcWorker = fork(path.join(__dirname, 'plc-data-worker.js'));

    this._plcWorker.on('message', (msg) => {
      if (msg.type === 'rpc-response') {
        const pending = this._pendingRpc.get(msg.id);
        if (!pending) return;
        this._pendingRpc.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
        return;
      }

      if (msg.type === 'plc-state') {
        this._applyPlcState(msg.payload);
        return;
      }

      if (msg.type === 'event') {
        this._handleWorkerEvent(msg.event, msg.payload);
      }
    });

    this._plcWorker.on('error', (err) => {
      console.error('PLC worker error:', err);
    });

    this._plcWorker.on('exit', (code) => {
      console.warn('PLC worker exited with code', code);
      this._plcWorker = null;
    });
  }

  _applyPlcState(payload) {
    const {
      isConnected,
      port,
      lastEmerState,
      lastPowState,
      lastHomeState,
      lastLLSState,
      ...state
    } = payload;

    this.plcState = state;
    this.isConnected = isConnected;
    this.PORT = port;
    this.lastEmerState = lastEmerState;
    this.lastPowState = lastPowState;
    this.lastHomeState = lastHomeState;
    this.lastLLSState = lastLLSState;

    if (this._callbacks.onPlcState) {
      this._callbacks.onPlcState(payload);
    }

    this._syncSafetyStatusToRenderer();
  }

  _handleWorkerEvent(event, payload) {
    switch (event) {
      case 'lls-status':
        this._sendToRenderer('lls-status', payload);
        break;
      case 'home-status':
        this._sendToRenderer('home-status', payload);
        break;
      case 'emergency-status':
        this.lastEmerState = payload;
        this._lastSentEmer = payload;
        this._sendToRenderer('emergency-status', payload);
        break;
      case 'power-status':
        this.lastPowState = payload;
        this._lastSentPow = payload;
        this._sendToRenderer('power-status', payload);
        break;
      case 'connected':
        this.isConnected = true;
        this.PORT = payload.port || this.PORT;
        this._sendToRenderer('modbus-status', 'connected');
        if (this._callbacks.onConnected) {
          this._callbacks.onConnected(this.PORT);
        }
        break;
      case 'disconnected':
        this.isConnected = false;
        this.stopUsbMonitor();
        this._sendToRenderer('modbus-status', 'disconnected');
        if (this._callbacks.onDisconnected) {
          this._callbacks.onDisconnected();
        }
        break;
      case 'read-error':
        console.error('PLC read error:', payload);
        break;
      default:
        console.warn('Unknown PLC worker event:', event, payload);
    }
  }

  _rpc(method, payload = {}) {
    this._startPlcWorker();
    const id = ++this._rpcId;

    return new Promise((resolve, reject) => {
      this._pendingRpc.set(id, { resolve, reject });
      this._plcWorker.send({ id, method, payload });
    });
  }

  async connect(port) {
    const result = await this._rpc('connect', { port });
    if (result && result.success) {
      this.PORT = result.port || port;
      this.isConnected = true;
    }
    return result;
  }

  async disconnect() {
    const result = await this._rpc('disconnect');
    this.isConnected = false;
    this.PORT = null;
    return result;
  }

  enqueueOps(commandName, ops) {
    console.log(`📥 PlcBridge.enqueueOps: ${commandName}`);
    if (!this.isConnected) {
      return Promise.resolve({
        success: false,
        message: 'Modbus not connected.',
        error: 'NOT_CONNECTED',
      });
    }
    return this._rpc('enqueue-ops', { commandName, ops });
  }

  applyActiveTestMode(mode) {
    return this._rpc('apply-active-mode', { mode });
  }

  syncActiveTestMode(mode) {
    return this._rpc('sync-active-mode', { mode });
  }

  startUsbMonitor(port) {
    this.stopUsbMonitor();
    this._monitoredPort = port;

    this._usbWorker = fork(path.join(__dirname, 'usb-monitor-worker.js'), [port]);

    this._usbWorker.on('message', (msg) => {
      if (msg.type === 'connection-change' && !msg.present) {
        console.warn(`USB port ${msg.port} disconnected — triggering Modbus disconnect`);
        this.disconnect().catch((err) => {
          console.error('Disconnect after USB loss failed:', err.message);
        });
      }
    });

    this._usbWorker.on('error', (err) => {
      console.error('USB monitor worker error:', err);
    });

    this._usbWorker.on('exit', () => {
      this._usbWorker = null;
    });
  }

  stopUsbMonitor() {
    if (this._usbWorker) {
      this._usbWorker.kill();
      this._usbWorker = null;
    }
    this._monitoredPort = null;
  }

  createCollectingClient(ops) {
    const bridge = this;
    return {
      get isOpen() {
        return bridge.isConnected;
      },
      writeCoil: (coil, value) => {
        ops.push({ op: 'writeCoil', coil, value });
        return Promise.resolve();
      },
      writeRegister: (address, value) => {
        ops.push({ op: 'writeRegister', address, value });
        return Promise.resolve();
      },
      delay: (ms) => {
        ops.push({ op: 'delay', ms });
        return Promise.resolve();
      },
      setMode: (mode) => {
        ops.push({ op: 'setMode', mode });
        return Promise.resolve();
      },
    };
  }

  getReadPLCDataPayload() {
    if (!this.isConnected) {
      return {
        success: false,
        message: 'Not connected to PLC',
      };
    }

    const s = this.plcState;
    return {
      success: true,

      machineStatus: s.machineStatus,
      machineStatusDisplay: (() => {
        switch (s.machineStatus) {
          case 2: return 'HOMING';
          case 3: return 'READY';
          case 4: return 'SEARCHING CONTACT';
          case 5: return 'RUNNING';
          case 6: return 'CATHETER MOVEMENT';
          case 7: return 'RETRACTING';
          default: return 'READY';
        }
      })(),

      distance: s.distance,
      distanceDisplay: `${s.distance.toFixed(1)} mm`,

      test_Dist: s.test_Dist,
      test_DistDisplay: `${s.test_Dist.toFixed(1)} mm`,

      force_mN: s.force_mN,
      forceDisplay: `${s.force_mN.toFixed(2)} mN`,

      catheterDistance: s.catheterDistance,
      catheterDistanceDisplay: `${s.catheterDistance.toFixed(1)} mm`,

      catheterDistanceR450: s.catheterDistanceR450,
      catheterDistanceR450Display: `${s.catheterDistanceR450.toFixed(1)} mm`,

      tpTestDist: s.tpTestDist,
      tpTestDistDisplay: `${s.tpTestDist.toFixed(1)} mm`,

      stepsToMove: s.stepsToMove,
      stepsToMoveDisplay: `${s.stepsToMove}`,

      rawForce: s.rawForce,
      weightRange: s.weightRange,
      inputsMode: s.inputsMode,
      realtimePlcValue: s.realtimePlcValue,
      settingsForce: s.settingsForce,

      coilLLS: s.coilLLS,
      home: s.home,
      clamp: s.clamp,
      probeUp: s.probeUp,
      probeDown: s.probeDown,
      catheterBack: s.catheterBack,
      catheterForward: s.catheterForward,
      manual: s.manual,
      twoPoint: s.twoPoint,
      threePoint: s.threePoint,

      emergencyActive: this.lastEmerState,
      powerActive: this.lastPowState,

      rawRegisters: {},
    };
  }

  terminate() {
    this.stopUsbMonitor();
    if (this._plcWorker) {
      this._plcWorker.kill();
      this._plcWorker = null;
    }
  }
}

module.exports = { PlcBridge };
