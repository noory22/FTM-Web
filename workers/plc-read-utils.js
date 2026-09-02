function toSigned16(value) {
  return value >= 0x8000 ? value - 0x10000 : value;
}

// Convert two 16-bit Modbus registers to 32-bit float (Little-Endian / Word-Swapped: CDAB)
// Most Delta PLCs send 32-bit floats with low word at register N and high word at register N+1
function registersToFloat32LE(lowWord, highWord) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint16(0, lowWord, true);
  view.setUint16(2, highWord, true);
  return view.getFloat32(0, true);
}

// Convert two 16-bit Modbus registers to 32-bit float (Big-Endian: ABCD)
function registersToFloat32BE(highWord, lowWord) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint16(0, highWord, false);
  view.setUint16(2, lowWord, false);
  return view.getFloat32(0, false);
}

module.exports = {
  toSigned16,
  registersToFloat32LE,
  registersToFloat32BE,
};

