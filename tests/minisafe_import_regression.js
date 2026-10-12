const fs = require('fs');
const vm = require('vm');

const appSource = fs.readFileSync('src/App.jsx', 'utf8');
const start = appSource.indexOf('function decodeMiniSafeMailText');
const end = appSource.indexOf('\nconst emptyForm =', start);
if (start < 0 || end < 0) throw new Error('MiniSafe2 parser is missing');

const profiles = {
  'A5-10-06-FTR-FHK': { eltako: 'FTR65DSB, FTR55DSB' },
  'F6-02-01-4CH': { eltako: 'FT55, F4T55E 4-Kanal' },
  'A5-38-08-FUD61NPN-230V': { eltako: 'FUD61NPN-230V' },
  'M5-38-08-FSR61-230V': { eltako: 'FSR61-230V' },
};
const context = {
  EEP_DB: profiles,
  normalizeProfileSearchText(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  },
};
vm.createContext(context);
vm.runInContext(`${appSource.slice(start, end)}\nthis.parseMiniSafeDevices = parseMiniSafeDevices;`, context);

const config = String.raw`Config:\
&#x20;\
&#x20;{"system":{"rooms":[{"name":"Testraum A","index":2},{"name":"Testraum B","index":11}],"devices":[
{"name":"Testsensor","room":2,"info":{"type":"ENOCEAN","vendor":"eltako","address":"10ABCDEF","virtual":false,"deviceText":"FTR55DSB / FTR65DSB","sid":"0A","\_target":"heater"}},
{"name":"Testtaster","room":2,"info":{"type":"ENOCEAN","vendor":"eltako","address":"20FEDCBA","virtual":false,"data":"eltako_button4","deviceText":"Funktaster (4 Tasten)"}},
{"name":"Testdimmer","room":11,"info":{"type":"ENOCEAN","vendor":"eltako","address":"30A1B2C3","senderID":"AABBCC01","virtual":false,"deviceText":"FUD61NPN-230V"}},
{"name":"Unbekannter Testaktor","room":2,"info":{"type":"ENOCEAN","vendor":"eltako","address":"40D4E5F6","senderID":"AABBCC02","virtual":false,"deviceText":"TF100L-230V"}},
{"name":"Virtuell","room":2,"info":{"type":"ENOCEAN","vendor":"eltako","address":"DEADBEEF","virtual":true,"deviceText":"FUD61NPN-230V"}},
{"name":"Andere Marke","room":2,"info":{"type":"ENOCEAN","vendor":"other","address":"CAFEBABE","virtual":false,"deviceText":"Test"}}
]},"gateways":[{"info":{"server":"[broken](url \& data)"}}]}`;

const rows = context.parseMiniSafeDevices(config);
if (rows.length !== 4) throw new Error(`expected 4 physical ELTAKO devices, got ${rows.length}`);
if (rows[0].dev_id !== '10-AB-CD-EF') throw new Error('address was not normalized');
if (rows[0].room !== 'Testraum A') throw new Error('room was not resolved');
if (rows[0].profileKey !== 'A5-10-06-FTR-FHK') throw new Error('FTR profile mapping failed');
if (rows[1].profileKey !== 'F6-02-01-4CH') throw new Error('button profile mapping failed');
if (rows[2].profileKey !== 'A5-38-08-FUD61NPN-230V') throw new Error('dimmer profile mapping failed');
if (rows[3].profileKey !== '' || rows[3].selected) throw new Error('unknown device must require manual profile selection');
if (rows.some(row => row.dev_id === 'AA-BB-CC-01')) throw new Error('senderID must never be imported as device ID');
if (!appSource.includes('analyzeMiniSafeText(await readTextFileUtf8(file))')) throw new Error('TXT/JSON selection must trigger automatic preview');
if (!appSource.includes('analyzeMiniSafeText(value);')) throw new Error('clipboard button must trigger automatic preview');
if (!appSource.includes('className="card" style={{padding:"1.1rem",marginBottom:"1rem"}}')) throw new Error('MiniSafe2 import must use its own card');
if (appSource.includes('minisafe.check') || appSource.includes('Konfiguration prüfen')) throw new Error('extra configuration-check button must not exist');

console.log('MiniSafe2 import regression: OK');
