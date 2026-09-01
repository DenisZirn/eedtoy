const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS: ${label}`);
}

function assertIncludes(value, expected, label) {
  if (!String(value).includes(expected)) {
    throw new Error(`${label}: missing ${JSON.stringify(expected)}`);
  }
  console.log(`PASS: ${label}`);
}

function assertNotIncludes(value, expected, label) {
  if (String(value).includes(expected)) {
    throw new Error(`${label}: unexpectedly contains ${JSON.stringify(expected)}`);
  }
  console.log(`PASS: ${label}`);
}

const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
const appSource = fs.readFileSync(appPath, 'utf8');
const start = appSource.indexOf('const APP_VERSION');
const end = appSource.indexOf('export default function App()');
if (start < 0 || end < 0) throw new Error('Could not isolate App.jsx helper functions');

const helperSource = `${appSource.slice(start, end)}\nthis.__api = { APP_VERSION, EEP_DB, generateYaml, normalizeFksSenderAssignments, getPct14Mapping, deduplicateExportDevices, buildSenderProgrammingEntries };`;
const context = {
  console,
  Date,
  DOMParser: class UnsupportedDOMParser {},
  Blob: class UnsupportedBlob {},
  URL: {},
};
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: 'src/App.helpers.jsx' });
const api = context.__api;

assert(api.APP_VERSION === '1.0.97', 'Application version is 1.0.97');
assert(Object.keys(api.EEP_DB).length === 75, 'Approved device profile count is 75');

const gateway = {
  type: 'fam14',
  base_id: 'FF-AA-BB-00',
  serial_path: 'COM9',
};

const devices = [
  {
    name: 'Wohnzimmer Dimmer',
    eep: 'A5-38-08-FUD14',
    platform: 'light',
    dev_id: '00-00-00-01',
    sender_id: 'FF-AA-BB-01',
    sender_eep: 'A5-38-08',
    room: 'Wohnzimmer',
  },
  {
    name: 'Heizkreis',
    eep: 'A5-10-06',
    platform: 'climate',
    dev_id: '00-00-00-02',
    sender_id: 'FF-AA-BB-02',
    sender_eep: 'A5-10-06',
    min_target_temperature: 16,
    max_target_temperature: 25,
  },
  {
    name: 'RGBW',
    eep: '07-37-F7-FRGBW14',
    platform: 'light',
    dev_id: '00-00-00-03',
    sender_id: 'FF-AA-BB-03',
    sender_eep: '07-37-F7',
  },
  {
    name: 'Raumregler FTR55ESB',
    eep: 'A5-10-06-FTR-FHK',
    platform: 'sensor',
    dev_id: '01-02-03-10',
  },
  {
    name: 'Heizanforderung FTR55ESB',
    eep: 'A5-38-08-FTR-TF61',
    platform: 'binary_sensor',
    dev_id: '01-02-03-11',
  },
  {
    name: 'FDG14 DALI',
    eep: 'A5-38-08-FDG14',
    platform: 'light',
    dev_id: '00-00-00-04',
    sender_id: 'FF-AA-BB-04',
    sender_eep: 'A5-38-08',
  },
];

const deYaml = api.generateYaml(gateway, devices, [], '', 'de');
assertIncludes(deYaml, '# Version: 1.0.97', 'German YAML version header');
assertIncludes(deYaml, '# Generiert:', 'German YAML timestamp label');
assertIncludes(deYaml, 'device_type: fam14', 'Gateway type export');
assertIncludes(deYaml, 'base_id: FF-AA-BB-00', 'Gateway base ID export');
assertIncludes(deYaml, 'temperature_unit: \'°C\'', 'Climate temperature unit remains Celsius');
assertIncludes(deYaml, 'min_target_temperature: 16', 'Climate minimum temperature');
assertIncludes(deYaml, 'max_target_temperature: 25', 'Climate maximum temperature');
assertNotIncludes(deYaml, '# FRGBW-Statussync:', 'German YAML contains no hard-coded RGBW synchronization comment');
assertNotIncludes(deYaml, 'serial_path:', 'Serial path is not exported');
assertIncludes(deYaml, 'room_controller_mode: "fhk"', 'FTR FHK mode export');
assertIncludes(deYaml, 'min_target_temperature: 12', 'FTR minimum setpoint export');
assertIncludes(deYaml, 'max_target_temperature: 28', 'FTR maximum setpoint export');
assertIncludes(deYaml, 'frost_temperature: 8', 'FTR frost protection setpoint export');
assertIncludes(deYaml, 'room_controller_mode: "tf61"', 'FTR TF61 mode export');
assertIncludes(deYaml, 'hysteresis: 1', 'FTR TF61 hysteresis export');
assertIncludes(deYaml, 'name: "FDG14 DALI"', 'FDG14 device export');
assertIncludes(deYaml, 'dimming_speed: 0', 'FDG14 uses actuator-internal dimming speed by default');
assertIncludes(deYaml, 'eep: "A5-38-08"', 'FDG14 A5-38-08 export');
assert(api.getPct14Mapping('FDG14')?.eep === 'A5-38-08-FDG14', 'PCT14 maps FDG14 to the dedicated profile');
assert(api.getPct14Mapping('FTS14EM')?.fts14em === true, 'PCT14 recognizes FTS14EM as a special basis-ID device');
assert(api.getPct14Mapping('FAE14LPR')?.eep === 'A5-10-06-FAE14LPR', 'PCT14 maps FAE14LPR to its climate profile');
assert(api.getPct14Mapping('FMS14')?.eep === 'M5-38-08-FMS14', 'PCT14 maps FMS14 to its dedicated profile');
assert(api.getPct14Mapping('FMS14')?.channels === 2, 'PCT14 imports FMS14 as exactly two channels');
assert(api.getPct14Mapping('FMS14')?.sender_eep === 'A5-38-08', 'FMS14 uses controller sender EEP A5-38-08');

const allGatewaySenderEntries = api.buildSenderProgrammingEntries([{name:'FSB14 Kanal 1',eep:'G5-3F-7F',platform:'cover',dev_id:'00-00-00-0B',sender_id:'00-00-B0-0B',sender_eep:'H5-3F-7F',room:'PCT14 Adresse 11 · Kanal 1',device_type:'FSB14'}],[{type:'fam14',base_id:'FF-F2-6C-80'},{type:'fgw14usb',base_id:'FF-F2-6C-80'},{type:'fam-usb',base_id:'FF-A6-07-00'}],'FF-F2-6C-80');
assert(allGatewaySenderEntries.length === 2, 'FAM14 and FGW14 duplicate controller IDs are programmed only once');
assert(allGatewaySenderEntries.some(entry => entry.sender_id === '00-00-B0-0B'), 'Internal Series-14 controller sender is included');
assert(allGatewaySenderEntries.some(entry => entry.sender_id === 'FF-A6-07-0B'), 'Dynamic FAM-USB sender is included');
assertIncludes(appSource, 'const [generatedGatewayBlocks, setGeneratedGatewayBlocks] = useState([]);', 'Generated YAML gateway snapshot is stored');
assertIncludes(appSource, 'yaml && generatedGatewayBlocks.length', 'Sender programming uses the generated YAML gateway snapshot');
const roomControllerDedup = api.deduplicateExportDevices([
  { name: 'FTR FHK', eep: 'A5-10-06-FTR-FHK', dev_id: '01-02-03-20' },
  { name: 'FTR TF61', eep: 'A5-38-08-FTR-TF61', dev_id: '01-02-03-20' },
]);
assert(roomControllerDedup.devices.length === 1, 'Only one FTR operating mode is exported per physical ID');
assert(roomControllerDedup.devices[0].name === 'FTR TF61', 'The last selected FTR operating mode wins');

const enYaml = api.generateYaml(gateway, devices, [], '', 'en');
assertIncludes(enYaml, '# Generated:', 'English YAML timestamp label');
assertNotIncludes(enYaml, '# FRGBW status sync:', 'English YAML contains no hard-coded RGBW synchronization comment');
assertNotIncludes(enYaml, '# This keeps the ELTAKO GFA5 app and Home Assistant synchronized.', 'English YAML contains no hard-coded RGBW synchronization explanation');
assertNotIncludes(enYaml, '# FRGBW-Statussync:', 'English YAML contains no German RGBW comment');
assertNotIncludes(enYaml, 'serial_path:', 'English export also omits serial path');

const fksDevices = [
  {
    name: 'Valve 1',
    eep: 'A5-20-01-FKS-SV',
    platform: 'climate',
    dev_id: '01-02-03-04',
    sender_id: '',
    sender_eep: 'A5-20-01',
  },
  {
    name: 'Valve 2',
    eep: 'A5-20-01-FKS-SV',
    platform: 'climate',
    dev_id: '01-02-03-05',
    sender_id: '',
    sender_eep: 'A5-20-01',
  },
];
const normalized = api.normalizeFksSenderAssignments(gateway, fksDevices, '');
const ids = normalized.devices.map((device) => device.sender_id);
assert(ids.every(Boolean), 'FKS-SV devices receive persistent sender IDs');
assert(new Set(ids).size === ids.length, 'FKS-SV sender IDs are collision-free');


const ftsUt = {
  name: 'FTS14EM UT',
  eep: 'F6-02-01-FTS14EM-UT',
  platform: 'binary_sensor',
  dev_id: '00-00-10-01',
  device_family: 'FTS14EM',
  operating_mode: 'UT',
  id_range: '1',
};
const ftsBusYaml = api.generateYaml({type:'fgw14usb',base_id:'FF-F2-6C-80'}, [ftsUt], [], '', 'de');
assertIncludes(ftsBusYaml, 'id: "00-00-10-01"', 'FTS14EM E1 uses decimal bus ID');
assertIncludes(ftsBusYaml, 'id: "00-00-10-10"', 'FTS14EM E10 uses decimal 10 instead of hexadecimal 0A');
assertNotIncludes(ftsBusYaml, '00-00-10-0A', 'FTS14EM export never creates hexadecimal E10');
assertIncludes(ftsBusYaml, 'operating_mode: "UT"', 'FTS14EM UT mode is exported');
assertIncludes(ftsBusYaml, 'id_range: "1"', 'FTS14EM ID range is exported');
const ftsRtYaml = api.generateYaml({type:'fgw14usb',base_id:'FF-F2-6C-80'}, [{...ftsUt,name:'FTS14EM RT',eep:'F6-02-01-FTS14EM-RT',dev_id:'00-00-14-01',operating_mode:'RT',id_range:'401'}], [], '', 'de');
assertIncludes(ftsRtYaml, 'id: "00-00-14-10"', 'FTS14EM range 401 creates E10 as 00-00-14-10');
assertIncludes(ftsRtYaml, 'operating_mode: "RT"', 'FTS14EM RT mode is exported');
const ftsFamUsbYaml = api.generateYaml({type:'fam-usb',base_id:'FF-A6-07-00'}, [ftsUt], [], '', 'de');
assertNotIncludes(ftsFamUsbYaml, 'device_family: FTS14EM', 'FTS14EM is not exported below fam-usb');

console.log('All YAML generation regression tests passed.');

const fsr71Yaml = api.generateYaml(
  { type: 'fam-usb', base_id: '00-00-B0-00' },
  [{
    name: 'FSR71NP-4X-230V',
    eep: 'M5-38-08-FSR71NP-4X-230V',
    platform: 'light',
    dev_id: 'FF-95-BD-01',
    sender_id: '00-00-B0-18',
    sender_eep: 'A5-38-08',
  }]
);
for (let channel = 1; channel <= 4; channel += 1) {
  const suffix = String(channel).padStart(2, '0');
  const senderSuffix = (0x17 + channel).toString(16).toUpperCase().padStart(2, '0');
  assertIncludes(fsr71Yaml, `id: "FF-95-BD-${suffix}"`, `FSR71 channel ${channel} actuator ID`);
  assertIncludes(fsr71Yaml, `name: "FSR71NP-4x-230V Kanal ${channel}"`, `FSR71 channel ${channel} name`);
  assertIncludes(fsr71Yaml, `id: "00-00-B0-${senderSuffix}"`, `FSR71 channel ${channel} sender ID`);
  assertIncludes(fsr71Yaml, `channel: ${channel}`, `FSR71 channel ${channel} metadata`);
}

const fsr71PlainYaml = api.generateYaml(
  { type: 'fam-usb', base_id: 'FF-A6-07-00' },
  [{
    name: 'FSR71-4x230V',
    eep: 'M5-38-08',
    platform: 'light',
    dev_id: 'FF-95-BD-01',
    sender_id: 'FF-A6-07-19',
    sender_eep: 'A5-38-08',
  }]
);
for (let channel = 1; channel <= 4; channel += 1) {
  const actuatorSuffix = String(channel).padStart(2, '0');
  const senderSuffix = (0x18 + channel).toString(16).toUpperCase().padStart(2, '0');
  assertIncludes(fsr71PlainYaml, `id: "FF-95-BD-${actuatorSuffix}"`, `Plain FSR71 channel ${channel} actuator ID`);
  assertIncludes(fsr71PlainYaml, `name: "FSR71NP-4x-230V Kanal ${channel}"`, `Legacy FSR71 alias normalized channel ${channel} name`);
  assertIncludes(fsr71PlainYaml, `id: "FF-A6-07-${senderSuffix}"`, `Plain FSR71 channel ${channel} sender ID`);
  assertIncludes(fsr71PlainYaml, `device_family: FSR71NP-4x-230V`, `Legacy FSR71 alias normalized family ${channel}`);
  assertIncludes(fsr71PlainYaml, `channel: ${channel}`, `Legacy FSR71 alias channel ${channel} metadata`);
}
