const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const start = source.indexOf('const APP_VERSION');
const end = source.indexOf('export default function App()');
assert(start >= 0 && end > start, 'App helpers must be available');
const context = {console, Date, DOMParser: class {}, Blob: class {}, URL: {}};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.api = {autoSenderIdForGateway, senderIdFromOffsetForGateway, EEP_DB, generateYaml, APP_VERSION};', context);
const api = context.api;
const gw80 = {type: 'fam-usb', base_id: 'FF-A6-07-80'};
const first = api.autoSenderIdForGateway(gw80, []);
const originalExample = [{dev_id: '05-A0-00-90', sender_id: first}];
if (process.argv.includes('--expect-bug')) {
  assert.equal(first, 'FF-A6-07-81');
  assert.equal(api.autoSenderIdForGateway(gw80, originalExample), first);
  console.log('REPRODUCED: original 1.0.97 assigns ...81 twice for base ...80');
  process.exit(0);
}

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS: ' + name); }
function fullRange(gw) {
  const devices = [];
  for (let offset = 1; offset <= 127; offset++) {
    const expected = api.senderIdFromOffsetForGateway(gw, offset);
    assert.equal(api.autoSenderIdForGateway(gw, devices), expected);
    devices.push({dev_id: `05-A0-00-${offset.toString(16).padStart(2, '0').toUpperCase()}`, sender_id: expected});
  }
  assert.equal(new Set(devices.map(d => d.sender_id)).size, 127);
  assert.equal(api.autoSenderIdForGateway(gw, devices), '', 'exhaustion must not wrap to first address');
  return devices;
}
check('version remains 1.0.97', () => assert.equal(api.APP_VERSION, '1.0.97'));
check('reported base-80 regression', () => assert.equal(api.autoSenderIdForGateway(gw80, originalExample), 'FF-A6-07-82'));
for (const base of ['FF-A6-07-00', 'FF-A6-07-80', 'FF-FF-FF-80']) {
  check(`all 127 addresses and exhaustion: ${base}`, () => fullRange({type: 'fam-usb', base_id: base}));
}
for (const type of ['fam14', 'fgw14usb']) {
  check(`${type}: bus allocation remains B001..B07F`, () => fullRange({type, base_id: 'FF-F2-6C-80'}));
}
check('complete physical sender address is reserved', () => {
  assert.equal(api.autoSenderIdForGateway(gw80, [{dev_id: 'FF-A6-07-81'}]), 'FF-A6-07-82');
});
check('unrelated device address with same last byte is not reserved', () => {
  assert.equal(api.autoSenderIdForGateway(gw80, [{dev_id: '05-00-00-01', sender_id: 'FF-BB-00-81'}]), 'FF-A6-07-81');
});
check('lower-case and surrounding spaces are normalized', () => {
  assert.equal(api.autoSenderIdForGateway({type: 'fam-usb', base_id: ' ff-a6-07-80 '}, [{sender_id: ' ff-a6-07-81 '}]), 'FF-A6-07-82');
});
check('gap is reused, not an occupied address', () => {
  assert.equal(api.autoSenderIdForGateway(gw80, [{sender_id: 'FF-A6-07-81'}, {sender_id: 'FF-A6-07-83'}]), 'FF-A6-07-82');
});
check('PCT14 effective FAM-USB sender is reserved', () => {
  const imported = [1, 2].map(i => ({eep: 'M5-38-08-FMS14', dev_id: `00-00-00-0${i}`, sender_id: `00-00-B0-0${i}`, room: `PCT14 Adresse ${i}`}));
  assert.equal(api.autoSenderIdForGateway(gw80, imported), 'FF-A6-07-83');
});
check('allocator never modifies saved assignments', () => {
  const input = [{sender_id: 'FF-A6-07-90', dev_id: '05-AA-BB-90', name: 'Existing'}];
  const before = JSON.stringify(input);
  api.autoSenderIdForGateway(gw80, input);
  assert.equal(JSON.stringify(input), before);
});
check('missing or invalid radio base cannot generate an ID', () => {
  for (const base_id of ['', 'invalid', 'FF-A6-07']) assert.equal(api.autoSenderIdForGateway({type: 'fam-usb', base_id}, []), '');
});

// Exercise the actual form validator and Add handler, not a substitute allocator.
const validateStart = source.indexOf('  const validate = (f) => {');
const addStart = source.indexOf('  const handleAdd = () => {');
const addEnd = source.indexOf('  const handleImportFam14GatewayToggle', addStart);
assert(validateStart > end && addEnd > addStart);
vm.runInContext(`this.runAdd = (gateway, devices, form, editIdx = null) => {
  const profile = profileFor(form.eep);
  const language = 'en';
  const t = key => key;
  let result = {devices, form, errors: {}};
  const setDevices = value => { result.devices = value; };
  const setForm = value => { result.form = value; };
  const setErrors = value => { result.errors = value; };
  const setEditIdx = () => {};
  ${source.slice(validateStart, addStart)}
  ${source.slice(addStart, addEnd)}
  handleAdd();
  return result;
};`, context);
for (const base_id of ['FF-A6-07-00', 'FF-A6-07-80']) {
  check(`real Add handler advances sender field: ${base_id}`, () => {
    const gateway = {type: 'fam-usb', base_id};
    let devices = [];
    let form = {name: 'First', dev_id: '05-AA-00-90', eep: 'A5-38-08-FUD14', sender_id: api.autoSenderIdForGateway(gateway, [])};
    for (let n = 1; n <= 3; n++) {
      form = {...form, name: `Actuator ${n}`, dev_id: `05-AA-00-${(0x90+n).toString(16).toUpperCase()}`};
      const result = context.runAdd(gateway, devices, form);
      assert.equal(Object.keys(result.errors).length, 0);
      devices = result.devices;
      form = result.form;
      assert.equal(devices[n-1].sender_id, api.senderIdFromOffsetForGateway(gateway, n));
      assert.equal(form.sender_id, api.senderIdFromOffsetForGateway(gateway, n+1));
    }
  });
}
check('editing keeps a previously assigned sender ID', () => {
  const entry = {name: 'Existing', dev_id: '05-AA-00-90', eep: 'A5-38-08-FUD14', sender_id: 'FF-A6-07-93'};
  const result = context.runAdd(gw80, [entry], {...entry, name: 'Renamed'}, 0);
  assert.equal(result.devices[0].sender_id, entry.sender_id);
});
check('exhausted range is blocked by the real Add validator', () => {
  const devices = fullRange(gw80);
  const result = context.runAdd(gw80, devices, {name: 'Extra', dev_id: '05-AA-01-91', eep: 'A5-38-08-FUD14', sender_id: ''});
  assert.equal(result.errors.sender_id, 'validation.senderIdsExhausted');
  assert.equal(result.devices.length, 127);
});
console.log(`Sender-ID hotfix regression checks passed: ${checks}`);
