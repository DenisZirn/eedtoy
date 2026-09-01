const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log('PASS: ' + label);
}

function assertIncludes(value, expected, label) {
  if (!String(value).includes(expected)) throw new Error(label + ': missing ' + JSON.stringify(expected));
  console.log('PASS: ' + label);
}

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const start = appSource.indexOf('const APP_VERSION');
const end = appSource.indexOf('export default function App()');
if (start < 0 || end < 0) throw new Error('Could not isolate App.jsx helper functions');

const helperSource = appSource.slice(start, end)
  + '\nthis.__api = { EEP_DB, getPct14Mapping, profileFor, busIdFromAddress, generateYaml, buildSenderProgrammingEntries, migrateCustomDeviceDatabase };';
const context = {
  console,
  Date,
  DOMParser: class UnsupportedDOMParser {},
  Blob: class UnsupportedBlob {},
  URL: {},
};
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: 'src/App.fms14-helpers.jsx' });
const api = context.__api;

// Minimal representative PCT14 device block. Mapping.channels deliberately
// remains authoritative even if an older PCT14 export reports addressrange 1.
const pct14Xml = [
  '<devices>',
  '  <device>',
  '    <name>FMS14</name>',
  '    <header><address>23</address><addressrange>1</addressrange></header>',
  '    <channels>',
  '      <channel channelnumber="1" description="Flur Licht"/>',
  '      <channel channelnumber="2" description="Außenlicht"/>',
  '    </channels>',
  '  </device>',
  '</devices>',
].join('\n');

function tagValue(xml, tag) {
  const match = xml.match(new RegExp('<' + tag + '>([^<]+)</' + tag + '>', 'i'));
  return match ? match[1].trim() : '';
}

const model = tagValue(pct14Xml, 'name');
const address = Number(tagValue(pct14Xml, 'address'));
const addressRange = Number(tagValue(pct14Xml, 'addressrange')) || 1;
const descriptions = [...pct14Xml.matchAll(/<channel\s+[^>]*description="([^"]*)"[^>]*\/>/gi)].map(match => match[1]);
const mapping = api.getPct14Mapping(model);
const profile = api.profileFor(mapping.eep);
const channelCount = Number(mapping.channels || 0) || Math.max(addressRange, descriptions.length || 1);

assert(mapping.eep === 'M5-38-08-FMS14', 'PCT14 XML model resolves to dedicated FMS14 profile');
assert(channelCount === 2, 'FMS14 XML import always creates exactly two channels');
assert(profile.sender_eep === 'A5-38-08', 'FMS14 profile uses controller sender EEP A5-38-08');
assert(profile.teach_in_telegram === 'E0-40-0D-80', 'FMS14 exports the A5-38-08 teach-in telegram');

const devices = Array.from({ length: channelCount }, (_, index) => ({
  name: descriptions[index] || ('FMS14 Kanal ' + (index + 1)),
  dev_id: api.busIdFromAddress(address + index),
  eep: mapping.eep,
  platform: mapping.platform,
  device_type: 'FMS14',
  model: 'FMS14',
  eltako: 'FMS14',
  room: 'PCT14 Adresse ' + address + ' · Kanal ' + (index + 1),
  sender_id: api.busIdFromAddress(0xB000 + address + index),
  sender_eep: mapping.sender_eep,
}));

const busYaml = api.generateYaml(
  { type: 'fam14', base_id: 'FF-F2-6C-80' },
  devices,
  [],
  'FF-F2-6C-80',
  'de'
);
assertIncludes(busYaml, 'id: "00-00-00-17"', 'FMS14 channel 1 uses PCT14 address 23');
assertIncludes(busYaml, 'id: "00-00-00-18"', 'FMS14 channel 2 uses the next bus address');
assertIncludes(busYaml, 'id: "00-00-B0-17"', 'FMS14 channel 1 gets its own bus sender ID');
assertIncludes(busYaml, 'id: "00-00-B0-18"', 'FMS14 channel 2 gets its own bus sender ID');
assertIncludes(busYaml, 'eep: "M5-38-08"', 'FMS14 actuator status profile is M5-38-08');
assertIncludes(busYaml, 'eep: "A5-38-08"', 'FMS14 control profile is A5-38-08');
assertIncludes(busYaml, 'teach_in_telegram: "E0-40-0D-80"', 'FMS14 YAML exports the A5-38-08 teach-in telegram');
assertIncludes(busYaml, 'name: "Flur Licht"', 'FMS14 channel 1 keeps its PCT14 description');
assertIncludes(busYaml, 'name: "Außenlicht"', 'FMS14 channel 2 keeps its PCT14 description');

const radioYaml = api.generateYaml(
  { type: 'fam-usb', base_id: 'FF-A6-07-00' },
  devices,
  [],
  'FF-F2-6C-80',
  'de'
);
assertIncludes(radioYaml, 'id: "FF-F2-6C-97"', 'FAM-USB export resolves FMS14 channel 1 against the PCT14 base ID');
assertIncludes(radioYaml, 'id: "FF-F2-6C-98"', 'FAM-USB export resolves FMS14 channel 2 against the PCT14 base ID');
assertIncludes(radioYaml, 'id: "FF-A6-07-17"', 'FAM-USB export creates the channel 1 sender ID');
assertIncludes(radioYaml, 'id: "FF-A6-07-18"', 'FAM-USB export creates the channel 2 sender ID');

const programmingEntries = api.buildSenderProgrammingEntries(
  devices,
  [{ type: 'fam14', base_id: 'FF-F2-6C-80' }],
  'FF-F2-6C-80'
);
assert(programmingEntries.length === 2, 'Sender programming contains one FMS14 entry per channel');
assert(programmingEntries.every(entry => entry.sender_eep === 'A5-38-08'), 'Both FMS14 sender entries use A5-38-08');

const migrated = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 51,
  'DUMMY': { label: 'Benutzerprofil' },
});
assert(Boolean(migrated['M5-38-08-FMS14']), 'Existing v1.0.96 device databases receive the FMS14 profile once');
const migratedFrom52 = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 52,
  'M5-38-08-FMS14': { ...api.profileFor('M5-38-08-FMS14'), sender_eep: 'F6-02-01', teach_in_telegram: '70' },
});
assert(migratedFrom52['M5-38-08-FMS14'].sender_eep === 'A5-38-08', 'Existing schema-52 databases migrate FMS14 sender EEP to A5-38-08');
assert(migratedFrom52['M5-38-08-FMS14'].teach_in_telegram === 'E0-40-0D-80', 'Existing schema-52 databases migrate the FMS14 teach-in telegram');
const intentionallyDeleted = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 53,
  'DUMMY': { label: 'Benutzerprofil' },
});
assert(!intentionallyDeleted['M5-38-08-FMS14'], 'A later intentional FMS14 deletion remains deleted');

console.log('All FMS14 PCT14/XML regression tests passed.');
