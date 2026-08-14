const fs = require('fs');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const main = fs.readFileSync('electron/main.js', 'utf8');

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('PASS:', msg);
}

expect(
  app.includes('gateway.type === "fam-usb" ? "esp2-fam-usb" : (gw?.proto || "auto")'),
  'macOS FAM-USB auto-detect bypasses Python detector and uses direct ESP2 AB-58'
);
expect(
  app.includes('window.electronAPI.readBaseId(preferredPort, baud, proto)'),
  'auto-detect still uses the same read-base-id IPC after automatic port selection'
);
expect(
  /function buildFamUsbRdIdBase\(\)[\s\S]*?return buildEsp2Message\(Buffer\.from\(\[[\s\S]*?0xAB, 0x58/.test(main),
  'FAM-USB AB-58 request uses normal 11-byte ESP2 body framing'
);
expect(
  !/function buildFamUsbRdIdBase\(\)[\s\S]*?const lenByte = 0x2B/.test(main),
  'invalid extra ESP2 length byte is removed'
);
expect(
  main.includes('body[0] === 0x8B && body[1] === 0x58'),
  'native AB-58 response is recognized'
);
expect(
  main.includes('const id = body.slice(2, 6);'),
  'native AB-58 response extracts Base-ID from response.body[2:6]'
);
console.log('macOS FAM-USB direct ESP2 auto-detect regression checks passed.');
