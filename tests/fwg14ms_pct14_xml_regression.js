const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DOMParser: XmlDomParser } = require('@xmldom/xmldom');

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log('PASS: ' + label);
}

function assertIncludes(value, expected, label) {
  if (!String(value).includes(expected)) throw new Error(label + ': missing ' + JSON.stringify(expected));
  console.log('PASS: ' + label);
}

function elementChildren(node) {
  return Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
}

function descendants(node, name) {
  const wanted = String(name).toLowerCase();
  const result = [];
  for (const child of elementChildren(node)) {
    if (String(child.nodeName).toLowerCase() === wanted) result.push(child);
    result.push(...descendants(child, name));
  }
  return result;
}

function selectAll(node, selector) {
  const source = String(selector).trim();
  if (source.includes('>')) {
    const parts = source.split('>').map(part => part.trim());
    let current = descendants(node, parts.shift());
    for (const part of parts) {
      current = current.flatMap(parent => elementChildren(parent).filter(child => String(child.nodeName).toLowerCase() === part.toLowerCase()));
    }
    return current;
  }
  const parts = source.split(/\s+/);
  let current = [node];
  for (const part of parts) current = current.flatMap(parent => descendants(parent, part));
  return current;
}

function installSelectors(node) {
  node.querySelectorAll = selector => selectAll(node, selector);
  node.querySelector = selector => selectAll(node, selector)[0] || null;
  for (const child of Array.from(node.childNodes || [])) installSelectors(child);
  return node;
}

class DOMParser {
  parseFromString(text) {
    return installSelectors(new XmlDomParser().parseFromString(text, 'application/xml'));
  }
}

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const start = appSource.indexOf('const APP_VERSION');
const end = appSource.indexOf('export default function App()');
if (start < 0 || end < 0) throw new Error('Could not isolate App.jsx helper functions');

const helperSource = appSource.slice(start, end)
  + '\nthis.__api = { EEP_DB, getPct14Mapping, parsePct14Xml, profileFor, fwg14msBaseIdForRange, deviceIdForGateway, generateYaml, migrateCustomDeviceDatabase, normalizeLoadedDeviceProfile };';
const context = {
  console,
  Date,
  DOMParser,
  Blob: class UnsupportedBlob {},
  URL: {},
};
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: 'src/App.fwg14ms-helpers.jsx' });
const api = context.__api;

const mapping = api.getPct14Mapping('FWG14MS');
assert(mapping.eep === 'A5-13-01-FWG14MS', 'PCT14 FWG14MS resolves to its dedicated profile');
assert(mapping.fwg14ms === true, 'PCT14 mapping activates only the FWG14MS range logic');
assert(api.profileFor(mapping.eep).eep_out === 'A5-13-01', 'FWG14MS exports EEP A5-13-01');
assert(api.profileFor(mapping.eep).teach_in_telegram === '4C-08-0D-80', 'FWG14MS keeps the verified teach-in telegram');
assert(api.fwg14msBaseIdForRange('1') === '00-00-18-00', 'Position 1 uses receive ID 00-00-18-00');
assert(api.fwg14msBaseIdForRange('2') === '00-00-18-10', 'Position 2 uses receive ID 00-00-18-10');

const imported = api.parsePct14Xml(`<?xml version="1.0"?>
<exchange>
  <rootdevice><rootdevicedata><baseid>
    <baseid_byte_0>255</baseid_byte_0><baseid_byte_1>191</baseid_byte_1>
    <baseid_byte_2>92</baseid_byte_2><baseid_byte_3>128</baseid_byte_3>
  </baseid></rootdevicedata></rootdevice>
  <devices>
    <device><name>FWG14MS</name><header><address>59</address><addressrange>1</addressrange></header></device>
    <device><name>FWG14MS</name><header><address>60</address><addressrange>1</addressrange></header></device>
  </devices>
</exchange>`, '', {}, 'de');
assert(imported.devices.length === 2, 'PCT14 import creates one entity for each supported FWG14MS');
assert(imported.devices[0].dev_id === '00-00-18-00' && imported.devices[0].bus_address === '00-00-00-3B', 'First imported FWG14MS defaults to position 1 and preserves bus address 59');
assert(imported.devices[1].dev_id === '00-00-18-10' && imported.devices[1].bus_address === '00-00-00-3C', 'Second imported FWG14MS defaults to position 2 and preserves bus address 60');

const position1 = {
  name: 'FWG14MS 00-00-00-3B',
  dev_id: '00-00-18-00',
  bus_address: '00-00-00-3B',
  fwg14ms_id_range: '1',
  eep: mapping.eep,
  platform: 'sensor',
  device_family: 'FWG14MS',
  room: 'PCT14 Adresse 59 · ID-Bereich Position 1',
};
const position2 = {
  ...position1,
  name: 'FWG14MS 00-00-00-3C',
  dev_id: '00-00-18-10',
  bus_address: '00-00-00-3C',
  fwg14ms_id_range: '2',
};

for (const gateway of [
  { type: 'fam14', base_id: 'FF-F2-6C-80' },
  { type: 'fgw14usb', base_id: 'FF-F2-6C-80' },
  { type: 'fam-usb', base_id: 'FF-A6-07-00' },
]) {
  assert(api.deviceIdForGateway(position1, gateway, 'FF-F2-6C-80') === '00-00-18-00', `${gateway.type} does not derive FWG14MS ID from the PCT14 bus address`);
  assert(api.deviceIdForGateway(position2, gateway, 'FF-F2-6C-80') === '00-00-18-10', `${gateway.type} keeps the selected second FWG14MS range`);
}

const yaml = api.generateYaml(
  { type: 'fam14', base_id: 'FF-F2-6C-80' },
  [position1, position2],
  [],
  'FF-F2-6C-80',
  'de',
);
assertIncludes(yaml, '- id: "00-00-18-00"\n        eep: "A5-13-01"\n        name: "FWG14MS 00-00-00-3B"', 'Position 1 YAML uses the weather receive ID and retains the PCT14 address in the name');
assertIncludes(yaml, 'teach_in_telegram: "4C-08-0D-80"\n        bus_address: "00-00-00-3B"', 'Position 1 YAML exports the bus address separately');
assertIncludes(yaml, '- id: "00-00-18-10"\n        eep: "A5-13-01"\n        name: "FWG14MS 00-00-00-3C"', 'Position 2 YAML uses the second weather receive ID');
assertIncludes(yaml, 'bus_address: "00-00-00-3C"', 'Position 2 YAML retains its independent PCT14 bus address');

const unrelatedSeries14 = {
  name: 'FWZ14 00-00-00-2A',
  dev_id: '00-00-00-2A',
  eep: 'A5-12-01',
  platform: 'sensor',
  room: 'PCT14 Adresse 42',
};
assert(api.deviceIdForGateway(unrelatedSeries14, { type:'fam-usb', base_id:'FF-A6-07-00' }, 'FF-F2-6C-80') === 'FF-F2-6C-AA', 'Unrelated Series-14 FAM-USB ID conversion remains unchanged');

const upgradedProjectDevice = api.normalizeLoadedDeviceProfile({
  name: 'FWG14MS 00-00-00-3B',
  dev_id: '00-00-00-3B',
  eep: 'A5-13-01',
  platform: 'sensor',
  model: 'FWG14MS',
  room: 'PCT14 Adresse 59',
});
assert(upgradedProjectDevice.eep === 'A5-13-01-FWG14MS', 'Older project FWG14MS entries migrate to the dedicated profile');
assert(upgradedProjectDevice.dev_id === '00-00-18-00', 'Older project FWG14MS entries default to position 1');
assert(upgradedProjectDevice.bus_address === '00-00-00-3B', 'Older project FWG14MS bus ID is preserved as bus_address');

const migratedDatabase = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 56,
  DUMMY: { label:'User profile' },
});
assert(Boolean(migratedDatabase['A5-13-01-FWG14MS']), 'Schema-56 databases receive the dedicated FWG14MS profile once');
assert(migratedDatabase.__eedtoy_database_schema === 58, 'Device-type migration advances the database to schema 58');

const intentionallyDeleted = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 57,
  DUMMY: { label:'User profile' },
});
assert(!intentionallyDeleted['A5-13-01-FWG14MS'], 'A later intentional FWG14MS profile deletion remains deleted');

console.log('All FWG14MS PCT14/YAML regression tests passed.');
