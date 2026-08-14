const fs = require('fs');
const src = fs.readFileSync('src/App.jsx', 'utf8');

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('PASS:', msg);
}

expect(src.includes('window.electronAPI.readBaseId(preferredPort, baud, proto)'), 'Auto-detect reuses manual Base-ID read IPC');
expect(!/handleAutoDetectGateway[\\s\\S]{0,2500}window\\.electronAPI\\.detectGateway\(/.test(src), 'Auto-detect no longer invokes generic all-port gateway detector');
expect(src.includes('manufacturerLower.includes("enocean")'), 'FAM-USB selection uses EnOcean manufacturer');
expect(src.includes('/b1$/i.test(item.path)'), 'FAM-USB selection supports B1 interface naming');
expect(src.includes('/1$/.test(item.path)'), 'FAM-USB selection supports numeric interface-1 naming');
expect(src.includes('`${prefix}0`'), 'FAM-USB selection pairs numeric interface 1 with sibling interface 0');
expect(src.includes('!/b0$/i.test(item.path) && !/0$/.test(item.path)'), 'FAM-USB selection does not knowingly fall back to interface 0');
expect(src.includes('manufacturerLower.includes("ftdi")'), 'FAM14/FGW selection uses FTDI manufacturer');
expect(src.includes('!/(^|[./_-])urt\\d*($|[./_-])/i.test(item.path)'), 'Generic URT pseudo ports are not preferred');
console.log('macOS gateway auto-port/manual-base-id regression checks passed.');
