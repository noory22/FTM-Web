function toSigned16(value) {
  return value >= 0x8000 ? value - 0x10000 : value;
}

module.exports = { toSigned16 };
