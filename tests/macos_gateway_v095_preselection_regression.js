const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
const source = fs.readFileSync(appPath, 'utf8');
const match = source.match(/function preferredGatewayPortForAutoDetect\(ports, gatewayType\) \{[\s\S]*?\n\}\n\nconst emptyGW/);
if (!match) throw new Error('preferredGatewayPortForAutoDetect helper not found');
const fnText = match[0].replace(/\n\nconst emptyGW[\s\S]*$/, '');
const preferredGatewayPortForAutoDetect = Function(`"use strict"; return (${fnText});`)();

function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  console.log(`PASS: ${label}`);
}

const portsA = [
  { path: '/dev/cu.URT2', manufacturer: '' },
  { path: '/dev/cu.Bluetooth-Incoming-Port', manufacturer: '' },
  { path: '/dev/cu.usbserial-RANDOMSERIALB0', manufacturer: 'EnOcean GmbH' },
  { path: '/dev/tty.usbserial-RANDOMSERIALB1', manufacturer: 'EnOcean GmbH' },
  { path: '/dev/tty.usbserial-ANOTHER123', manufacturer: 'FTDI' },
];
expectEqual(
  preferredGatewayPortForAutoDetect(portsA, 'fam-usb'),
  '/dev/tty.usbserial-RANDOMSERIALB1',
  'FAM-USB prefers arbitrary EnOcean B1 and not B0/URT'
);
expectEqual(
  preferredGatewayPortForAutoDetect(portsA, 'fam14'),
  '/dev/tty.usbserial-ANOTHER123',
  'FAM14 prefers arbitrary FTDI serial port'
);
expectEqual(
  preferredGatewayPortForAutoDetect(portsA, 'fgw14usb'),
  '/dev/tty.usbserial-ANOTHER123',
  'FGW14-USB prefers arbitrary FTDI serial port'
);

const portsB = [
  { path: '/dev/cu.serial-SOME-OTHER-ID', manufacturer: 'FTDI' },
  { path: '/dev/cu.usbserial-NEWDEVICEB0', manufacturer: 'EnOcean GmbH' },
  { path: '/dev/cu.usbserial-NEWDEVICEB1', manufacturer: 'EnOcean GmbH' },
];
expectEqual(
  preferredGatewayPortForAutoDetect(portsB, 'fam14'),
  '/dev/cu.serial-SOME-OTHER-ID',
  'FAM14 supports cu.serial FTDI naming with variable serial number'
);
expectEqual(
  preferredGatewayPortForAutoDetect(portsB, 'fam-usb'),
  '/dev/cu.usbserial-NEWDEVICEB1',
  'FAM-USB supports cu.usbserial naming with variable serial number'
);

const portsC = [
  { path: '/dev/tty.usbserial-FTAMHS200', manufacturer: 'EnOcean GmbH' },
  { path: '/dev/tty.usbserial-FTAMHS201', manufacturer: 'EnOcean GmbH' },
];
expectEqual(
  preferredGatewayPortForAutoDetect(portsC, 'fam-usb'),
  '/dev/tty.usbserial-FTAMHS201',
  'FAM-USB prefers numeric interface 1 over numeric interface 0'
);

const portsD = [
  { path: '/dev/tty.usbserial-ARBITRARY990', manufacturer: 'EnOcean GmbH' },
  { path: '/dev/tty.usbserial-ARBITRARY991', manufacturer: 'EnOcean GmbH' },
];
expectEqual(
  preferredGatewayPortForAutoDetect(portsD, 'fam-usb'),
  '/dev/tty.usbserial-ARBITRARY991',
  'FAM-USB numeric interface pairing is serial-number independent'
);

if (/FTAMHRRB1|AQ027Y2A/.test(source)) {
  throw new Error('A concrete customer gateway serial number was hard-coded');
}
if (!source.includes('const detectedPorts = await window.electronAPI.listPorts();')) {
  throw new Error('Auto detect does not use the same Electron port inventory as manual search');
}
if (!source.includes('window.electronAPI.readBaseId(preferredPort, baud, proto)')) {
  throw new Error('Auto detect does not pass the preferred port into the targeted Base-ID read flow');
}
if (!source.includes('gateway.type === "fam-usb" ? "esp2-fam-usb"')) {
  throw new Error('FAM-USB auto detect must use direct ESP2 AB-58 instead of Python auto detection');
}
console.log('macOS gateway preselection regression checks passed.');
