const { SerialPort } = require('serialport');

const targetPort = process.argv[2];
let portPresent = null;
let consecutiveMissingCount = 0;

// Ensure clean exit when parent disconnects
process.on('disconnect', () => {
  process.exit(0);
});

function normalizePort(p) {
  if (!p) return '';
  return String(p).toUpperCase().replace(/^\\\\\\.\\\\/, '').trim();
}

async function pollPorts() {
  try {
    const ports = await SerialPort.list();
    const targetNorm = normalizePort(targetPort);

    const found = targetPort
      ? ports.some((p) => normalizePort(p.path) === targetNorm)
      : ports.length > 0;

    if (portPresent === null) {
      portPresent = found;
      consecutiveMissingCount = 0;
      return;
    }

    if (!found) {
      consecutiveMissingCount++;
    } else {
      consecutiveMissingCount = 0;
    }

    // Require 3 consecutive missing cycles (~300ms) before flagging a disconnect
    // to avoid transient Windows serial enumeration glitches
    const effectivePresent = consecutiveMissingCount >= 3 ? false : true;

    if (effectivePresent !== portPresent) {
      portPresent = effectivePresent;
      if (process.send) {
        process.send({
          type: 'connection-change',
          port: targetPort,
          present: effectivePresent,
        });
      }
    }
  } catch (err) {
    console.error('USB monitor error:', err.message);
  }
}

setInterval(pollPorts, 100);
pollPorts();

