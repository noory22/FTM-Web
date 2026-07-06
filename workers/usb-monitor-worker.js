const { SerialPort } = require('serialport');

const targetPort = process.argv[2];
let portPresent = null;

// Ensure clean exit when parent disconnects
process.on('disconnect', () => {
  process.exit(0);
});

async function pollPorts() {
  try {
    const ports = await SerialPort.list();
    const found = targetPort
      ? ports.some((p) => p.path === targetPort)
      : ports.length > 0;

    if (portPresent === null) {
      portPresent = found;
      return;
    }

    if (found !== portPresent) {
      portPresent = found;
      if (process.send) {
        process.send({
          type: 'connection-change',
          port: targetPort,
          present: found,
        });
      }
    }
  } catch (err) {
    console.error('USB monitor error:', err.message);
  }
}

setInterval(pollPorts, 100);
pollPorts();
