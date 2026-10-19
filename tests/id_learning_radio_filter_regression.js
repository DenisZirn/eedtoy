const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const profiles = { console, Date, DOMParser:class {}, Blob:class {}, URL:{} };
vm.createContext(profiles);
vm.runInContext(app.slice(app.indexOf('const APP_VERSION'), app.indexOf('export default function App()')) +
  '\nthis.filterFor = idLearningFilterForProfile; this.db = EEP_DB;', profiles);
const radioProfiles = {
  'radio-rps': [
    'F6-02-01-2CH', 'F6-02-01-4CH', 'F6-01-01', 'F6-10-00-FFG7B', 'F6-02-01-FRW-WS',
    'F6-02-01-FSM60B-BA1', 'F6-02-01-FSM60B-BA2', 'F6-02-01-F4USM61B-M1', 'F6-02-01-F4USM61B-M5',
  ],
  'radio-1bs': ['D5-00-01', 'D5-00-01-F4USM61B-M4', 'D5-00-01-F4USM61B-M7'],
  'radio-4bs': [
    'A5-14-09-FFG7B', 'A5-07-01', 'A5-08-01-FBH-FBHT', 'A5-30-03-FRWB', 'A5-30-03-FHMB',
    'A5-04-02-FFT60SB', 'A5-04-03-FFT60SB', 'A5-04-02-FTFSB', 'A5-04-03-FTFSB', 'A5-04-02-FLGTF',
    'A5-09-0C-FLGTF', 'A5-09-04-FCO2TF65', 'A5-10-06-FUTH55', 'A5-10-12-FUTH55-HYGROSTAT',
    'A5-10-06-FTR-FHK', 'A5-38-08-FTR-TF61', 'A5-12-01', 'A5-06-01-FAH', 'A5-13-01',
    'A5-30-03-FSM60B-BA3', 'A5-30-01-FSM60B-BA4', 'A5-38-08-F4USM61B-M2',
    'A5-08-01-F4USM61B-M3', 'A5-08-01-F4USM61B-M6', 'A5-07-01-F4USM61B-M8',
  ],
};
const expectedFilters = new Map(Object.entries(radioProfiles).flatMap(([filter, keys]) => keys.map(key => [key, filter])));
for (const key of Object.keys(profiles.db)) {
  assert.equal(profiles.filterFor(key), expectedFilters.get(key) || '', `${key} has the correct sensor/bus/actuator behavior`);
}
assert.equal(expectedFilters.size, 37, 'All 37 radio sensor profiles are covered');
assert.equal(profiles.filterFor('unknown'), '');
profiles.db['D2-CUSTOM-SENSOR'] = { platform:'sensor', eep_out:'D2-14-41' };
assert.equal(profiles.filterFor('D2-CUSTOM-SENSOR'), 'radio-vld', 'Custom VLD sensors are filtered by their radio family');

const ports = [];
class FakePort extends EventEmitter {
  constructor(options) { super(); this.options = options; this.isOpen = false; this.closed = false; ports.push(this); }
  open(callback) { this.isOpen = true; callback(null); }
  close(callback) { this.isOpen = false; this.closed = true; callback(); }
}
const context = {
  Buffer, setTimeout, clearTimeout, console:{ log() {} },
  canceledIdLearningResult:() => ({ ok:false, canceled:true }),
  require(name) { assert.equal(name, 'serialport'); return { SerialPort:FakePort }; },
};
vm.createContext(context);
vm.runInContext(main.slice(main.indexOf('const CRC8_TABLE'), main.indexOf('// PROTOCOL 1:')), context);
vm.runInContext(main.slice(main.indexOf('function radioLearnFilter('), main.indexOf('function parseFts14emRpsFrame(')), context);

const bytesForId = id => Buffer.from(id.replaceAll('-', ''), 'hex');
function crc(data) {
  let value = 0;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 0x80 ? ((value << 1) ^ 0x07) & 255 : (value << 1) & 255;
  }
  return value;
}
function esp2(id, org = 0x05, sequence = 0x8B, data = [0x70, 0, 0, 0]) {
  const body = Buffer.from([sequence, org, ...data, ...bytesForId(id), 0x30]);
  return Buffer.from([0xA5, 0x5A, ...body, [...body].reduce((sum, byte) => (sum + byte) & 255, 0)]);
}
function esp3(id, rorg = 0xF6, data = [0x70]) {
  const payload = Buffer.from([rorg, ...data, ...bytesForId(id), 0x30]);
  const optional = Buffer.from([1, 255, 255, 255, 255, 50, 0]);
  const header = Buffer.from([payload.length >> 8, payload.length & 255, optional.length, 1]);
  const body = Buffer.concat([payload, optional]);
  return Buffer.from([0x55, ...header, crc(header), ...body, crc(body)]);
}
const selected = 'FE-EF-D6-D5';
const sensorFamilies = [
  { filter:'radio-rps', org:0x05, rorg:0xF6, esp2Data:[0x70, 0, 0, 0], data:[0x70] },
  { filter:'radio-1bs', org:0x06, rorg:0xD5, esp2Data:[0x09, 0, 0, 0], data:[0x09] },
  { filter:'radio-4bs', org:0x07, rorg:0xA5, esp2Data:[0x10, 0x10, 0x0D, 0x87], data:[0x10, 0x10, 0x0D, 0x87] },
  { filter:'radio-vld', rorg:0xD2, data:[1, 2, 3, 4, 5, 6, 7] },
];
for (const id of [selected, '00-25-92-7A', '01-A0-45-5D', 'FF-F3-A0-80']) {
  for (const frame of [esp2(id), esp2(id, 0xF6, 0x0B), esp3(id)]) {
    assert.equal(context.parseLearnIdFromBuffer(frame, 'radio-rps').id, id, 'No fixed FE/FF prefix is required');
  }
}
const noise = [
  esp2('00-00-00-12'), esp2('00-00-00-39'), esp3('00-00-00-1D'),
  esp2('01-A0-45-5D', 0xA5), esp3('01-A0-45-5D', 0xA5, [1, 2, 3, 8]),
  esp2(selected, 0x05, 0x6B), esp2(selected, 0x05, 0xAB),
  esp2(selected, 0x05, 0x8B, [0x70, 1, 0, 0]),
  esp3(selected, 0xF6, [0x70, 0, 0, 0]),
];
for (const frame of noise) assert.equal(context.parseLearnIdFromBuffer(frame, 'radio-rps'), null);
for (let address = 0; address <= 255; address++) {
  const id = '00-00-00-' + address.toString(16).padStart(2, '0').toUpperCase();
  assert.equal(context.parseLearnIdFromBuffer(esp2(id), 'radio-rps'), null, `Bus address ${id} is ignored`);
}
for (const matching of [esp2(selected), esp3(selected)]) {
  assert.equal(context.parseLearnIdFromBuffer(Buffer.concat([...noise, matching]), 'radio-rps').id, selected,
    'Earlier rejected frames in the same buffer cannot hide the later matching button');
  const broken = Buffer.from(matching); broken[broken.length - 1] ^= 1;
  assert.equal(context.parseLearnIdFromBuffer(broken, 'radio-rps'), null, 'Invalid checksums are rejected');
}
assert.equal(context.parseLearnIdFromBuffer(esp2('00-00-00-12')).id, '00-00-00-12', 'Unfiltered learning can still receive bus IDs');

for (const family of sensorFamilies) {
  const frameFor = id => family.org ? esp2(id, family.org, 0x8B, family.esp2Data) : esp3(id, family.rorg, family.data);
  for (const id of [selected, '00-25-92-7A', '01-A0-45-5D']) {
    assert.equal(context.parseLearnIdFromBuffer(frameFor(id), family.filter).id, id);
    assert.equal(context.parseLearnIdFromBuffer(esp3(id, family.rorg, family.data), family.filter).id, id);
  }
  for (let address = 0; address <= 255; address++) {
    const id = '00-00-00-' + address.toString(16).padStart(2, '0').toUpperCase();
    assert.equal(context.parseLearnIdFromBuffer(frameFor(id), family.filter), null);
  }
  for (const other of sensorFamilies.filter(other => other.filter !== family.filter)) {
    assert.equal(context.parseLearnIdFromBuffer(esp3(selected, other.rorg, other.data), family.filter), null,
      `${family.filter} ignores a different sensor family even with a physical radio ID`);
    if (other.org) assert.equal(context.parseLearnIdFromBuffer(esp2(selected, other.org, 0x8B, other.esp2Data), family.filter), null);
  }
  const polluted = Buffer.concat([esp2('00-00-00-12'), esp2('00-00-00-39', 0x07), frameFor(selected)]);
  assert.equal(context.parseLearnIdFromBuffer(polluted, family.filter).id, selected, 'Valid sensor follows bus noise in the same buffer');
  if (family.org) {
    for (const sequence of [0x6B, 0xAB]) assert.equal(context.parseLearnIdFromBuffer(esp2(selected, family.org, sequence, family.esp2Data), family.filter), null);
  }
  const broken = frameFor(selected); broken[broken.length - 1] ^= 1;
  assert.equal(context.parseLearnIdFromBuffer(broken, family.filter), null);
}
assert(context.parseLearnIdFromBuffer(esp2(selected, 0x06, 0x0B, [0, 0, 0, 0]), 'radio-1bs'), '1BS teach-in is accepted');
assert.equal(context.parseLearnIdFromBuffer(esp2(selected, 0x06, 0x0B, [9, 1, 0, 0]), 'radio-1bs'), null, '1BS padding is validated');

(async () => {
  for (const family of sensorFamilies) {
    const pending = context.listenForLearnTelegram('COM3', 'fam14', 20000, { learnFilter:family.filter });
    const port = ports.at(-1);
    assert.equal(port.options.baudRate, 57600);
    port.emit('data', Buffer.concat([esp2('00-00-00-12'), esp2('00-00-00-39', 0x07)]));
    assert.equal(port.closed, false, 'Bus traffic leaves the receiver open and listening');
    const sensor = family.org ? esp2(selected, family.org, 0x8B, family.esp2Data) : esp3(selected, family.rorg, family.data);
    port.emit('data', sensor.subarray(0, 7));
    assert.equal(port.closed, false, 'A split telegram is buffered');
    port.emit('data', sensor.subarray(7));
    assert.equal((await pending).id, selected);
    assert.equal(port.closed, true, 'The receiver closes only after the matching sensor');
    assert.equal(port.listenerCount('data'), 0);
  }
  console.log('PASS: All 80 profiles classified, 37 radio sensor profiles, RPS/1BS/4BS/VLD, bus noise and streaming receiver.');
})().catch(error => { console.error(error); process.exitCode = 1; });
