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

const helperSource = `${appSource.slice(start, end)}\nthis.__api = { APP_VERSION, EEP_DB, generateYaml, normalizeFksSenderAssignments, getPct14Mapping, deduplicateExportDevices, buildSenderProgrammingEntries, isSeries14HeatingActuator, isFhk61RadioThermostat, operatingModeSenderFitsGateway, supportsLightSwitchSelection, effectivePlatformForDevice, applyCurrentDatabaseProfile, normalizeLoadedDeviceProfile, ftrModelForDevice, exportDeviceTypeForDevice };`;
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

assert(api.APP_VERSION === '1.1.05', 'Application version is 1.1.05');
assert(Object.keys(api.EEP_DB).length === 86, 'Approved device profile count is 86, including FHK61 variants');

const fhk61Models = ['FHK61-230V','FHK61U-230V','FHK61SSR-230V'];
for (const model of fhk61Models) {
  const profile = Object.values(api.EEP_DB).find(x => x.device_type === model && x.platform === 'climate');
  assert(profile && profile.sender_eep === 'A5-10-06', model + ' uses HA temperature-controller profile');
}
const pwmProfile = api.EEP_DB['A5-38-08-FHK61SSR-PWM'];
assert(pwmProfile.platform === 'number' && pwmProfile.teach_in_telegram === 'E0-40-00-80',
  'FHK61SSR direct PWM uses number entity and distinct learning telegram');
const pwmYaml = api.generateYaml(
  {type:'fam-usb',base_id:'FF-A6-04-80'},
  [{name:'FHK61SSR PWM Test',eep:'A5-38-08-FHK61SSR-PWM',platform:'number',
    dev_id:'05-00-00-01',sender_id:'FF-A6-04-B2',
    sender_eep:'A5-38-08',device_type:'FHK61SSR-230V',pwm_mode:'direct',pwm_period_seconds:180}],
  [], '', 'de'
);
assertIncludes(pwmYaml, '      number:', 'FHK61SSR PWM exported to HA number platform');
assertIncludes(pwmYaml, 'pwm_mode: "direct"', 'FHK61SSR direct PWM mode exported');
assertIncludes(pwmYaml, 'pwm_period_seconds: 180', 'FHK61SSR PWM period preserved');

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
assertIncludes(deYaml, '# Version: 1.1.05', 'German YAML version header');
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
assertNotIncludes(deYaml, 'frost_temperature:', 'FTR frost protection 8 C is a DB2 setpoint, not a separate YAML field');
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
const fksB = api.EEP_DB['A5-20-04-FKS-B'];
assert(fksB?.platform === 'climate', 'FKS-B is exported as a climate actuator');
assert(fksB?.eep_out === 'A5-20-04' && fksB?.sender_eep === 'A5-20-04', 'FKS-B uses the FKS-H compatible A5-20-04 profile in both directions');
assert(fksB?.teach_in_telegram === '80-20-0D-80', 'FKS-B has the A5-20-04 teach-in telegram');
assert(fksB?.min_target_temperature === 10 && fksB?.max_target_temperature === 30, 'FKS-B target range is 10 to 30 degrees Celsius');
const fksBYaml = api.generateYaml(gateway, [{name:'FKS-B Wohnzimmer',eep:'A5-20-04-FKS-B',platform:'climate',dev_id:'05-00-00-01',sender_id:'FF-AA-BB-10',sender_eep:'A5-20-04',device_type:'FKS-B'}], [], '', 'de');
assertIncludes(fksBYaml, 'name: "FKS-B Wohnzimmer"', 'FKS-B YAML keeps its own device name');
assertIncludes(fksBYaml, 'eep: "A5-20-04"', 'FKS-B YAML exports A5-20-04');
assertIncludes(fksBYaml, 'teach_in_telegram: "80-20-0D-80"', 'FKS-B YAML exports its teach-in telegram');
assertIncludes(fksBYaml, 'min_target_temperature: 10', 'FKS-B YAML exports minimum target temperature');
assertIncludes(fksBYaml, 'max_target_temperature: 30', 'FKS-B YAML exports maximum target temperature');

const fah = api.EEP_DB['A5-06-01-FAH'];
assert(fah?.platform === 'sensor' && fah?.eep_out === 'A5-06-01', 'FAH uses sensor EEP A5-06-01');
assert(fah?.teach_in_telegram === '18-08-0D-80', 'FAH has the documented A5-06-01 teach-in telegram');
assert(fah?.default_dc === 'illuminance', 'FAH uses the illuminance device class');
const fahYaml = api.generateYaml(gateway, [{name:'FAH Außenhelligkeit',eep:'A5-06-01-FAH',platform:'sensor',dev_id:'01-02-03-20',device_type:'FAH'}], [], '', 'de');
assertIncludes(fahYaml, 'eep: "A5-06-01"', 'FAH YAML exports A5-06-01');
assertIncludes(fahYaml, 'teach_in_telegram: "18-08-0D-80"', 'FAH YAML exports its teach-in telegram');
assertIncludes(fahYaml, 'device_type: "FAH"', 'FAH YAML identifies the technical device type');
assertIncludes(fahYaml, 'device_class: illuminance', 'FAH YAML exports illuminance');

const frw = api.EEP_DB['F6-02-01-FRW-WS'];
assert(frw?.platform === 'binary_sensor' && frw?.eep_out === 'F6-02-01', 'FRW-ws uses RPS EEP F6-02-01');
assert(frw?.default_dc === 'smoke', 'FRW-ws uses the smoke device class');
assert(frw?.battery_low_data === '0x30', 'FRW-ws stores data 0x30 as its low-battery telegram');
const frwYaml = api.generateYaml(gateway, [{name:'FRW-ws Flur',eep:'F6-02-01-FRW-WS',platform:'binary_sensor',dev_id:'01-02-03-21',device_type:'FRW-ws'}], [], '', 'de');
assertIncludes(frwYaml, 'eep: "F6-02-01"', 'FRW-ws YAML exports F6-02-01');
assertIncludes(frwYaml, 'device_type: "FRW-ws"', 'FRW-ws YAML identifies the technical device type');
assertIncludes(frwYaml, 'device_class: smoke', 'FRW-ws YAML exports the smoke entity');
assertIncludes(frwYaml, 'battery_low_data: "0x30"', 'FRW-ws YAML exports the low-battery data value');

const allGatewaySenderEntries = api.buildSenderProgrammingEntries([{name:'FSB14 Kanal 1',eep:'G5-3F-7F',platform:'cover',dev_id:'00-00-00-0B',sender_id:'00-00-B0-0B',sender_eep:'H5-3F-7F',room:'PCT14 Adresse 11 · Kanal 1',device_type:'FSB14'}],[{type:'fam14',base_id:'FF-F2-6C-80'},{type:'fgw14usb',base_id:'FF-F2-6C-80'},{type:'fam-usb',base_id:'FF-A6-07-00'}],'FF-F2-6C-80');
assert(allGatewaySenderEntries.length === 2, 'FAM14 and FGW14 duplicate controller IDs are programmed only once');
assert(allGatewaySenderEntries.some(entry => entry.sender_id === '00-00-B0-0B'), 'Internal Series-14 controller sender is included');
assert(allGatewaySenderEntries.some(entry => entry.sender_id === 'FF-A6-07-0B'), 'Dynamic FAM-USB sender is included');

const fhkDevice = {name:'FHK14 Heizkreis',eep:'A5-10-06',platform:'climate',dev_id:'00-00-00-06',sender_id:'00-00-B0-06',sender_eep:'A5-10-06',room:'PCT14 Adresse 6',device_type:'FHK14'};
const fhkPreferredEntry = api.buildSenderProgrammingEntries([fhkDevice],[{type:'fam14',base_id:'FF-F2-6C-80'},{type:'fam-usb',base_id:'FF-A6-07-00'},{type:'fgw14usb',base_id:'FF-F2-6C-80'}],'FF-F2-6C-80');
assert(fhkPreferredEntry.length === 1, 'FHK14 exports exactly one Function Group 3 controller sender');
assert(fhkPreferredEntry[0].source_gateway_type === 'fgw14usb', 'FHK14 prefers FGW14-USB over FAM-USB and FAM14');
const fhkFamUsbEntry = api.buildSenderProgrammingEntries([fhkDevice],[{type:'fam14',base_id:'FF-F2-6C-80'},{type:'fam-usb',base_id:'FF-A6-07-00'}],'FF-F2-6C-80');
assert(fhkFamUsbEntry.length === 1 && fhkFamUsbEntry[0].source_gateway_type === 'fam-usb', 'FHK14 uses FAM-USB when no FGW14-USB is available');
const fhkFam14Entry = api.buildSenderProgrammingEntries([fhkDevice],[{type:'fam14',base_id:'FF-F2-6C-80'}],'FF-F2-6C-80');
assert(fhkFam14Entry.length === 1 && fhkFam14Entry[0].source_gateway_type === 'fam14', 'FHK14 uses FAM14 as the last fallback');
const faeDevice = {name:'FAE14LPR Heizkreis 1',eep:'A5-10-06-FAE14LPR',platform:'climate',dev_id:'00-00-00-39',sender_id:'00-00-B0-39',sender_eep:'A5-10-06',room:'PCT14 Adresse 57 · Kanal 1',device_type:'FAE14LPR'};
const faePreferredEntry = api.buildSenderProgrammingEntries([faeDevice],[{type:'fam14',base_id:'FF-BF-5C-80'},{type:'fam-usb',base_id:'FF-A6-04-80'},{type:'fgw14usb',base_id:'FF-BF-5C-80'}],'FF-BF-5C-80');
assert(faePreferredEntry.length === 1, 'FAE14LPR exports exactly one controller sender per channel');
assert(faePreferredEntry[0].source_gateway_type === 'fgw14usb', 'FAE14LPR uses the same controller gateway priority as FHK14');
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
assertNotIncludes(ftsFamUsbYaml, 'device_type: "FTS14EM"', 'FTS14EM is not exported below fam-usb');

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
    profile_key: 'M5-38-08-FSR71NP-4X-230V',
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
  assertIncludes(fsr71PlainYaml, `device_type: "FSR71NP-4x-230V"`, `Saved FSR71 profile supplies the technical type for channel ${channel}`);
  assertIncludes(fsr71PlainYaml, `channel: ${channel}`, `Legacy FSR71 alias channel ${channel} metadata`);
}

 
// Separate operating-mode sender is optional; existing project YAML remains
// byte-compatible when no explicit sender is configured.
const heatingGateway = {type:'fam-usb',base_id:'FF-A6-04-80'};
const baseHeating = {name:'FHK14 Heizung',eep:'A5-10-06',platform:'climate',
  device_type:'FHK14',dev_id:'00-00-00-06',sender_id:'FF-A6-04-86',
  sender_eep:'A5-10-06',imported_from_pct14:true};
const noModeYaml = api.generateYaml(heatingGateway,[baseHeating],[], 'FF-BF-5C-80');
assertNotIncludes(noModeYaml,'operating_mode_sender_id:', 'Legacy heating YAML omits new optional field');
const modeHeating = {...baseHeating,operating_mode_sender_id:'FF-A6-04-A8'};
const separateModeYaml = api.generateYaml(heatingGateway,[modeHeating],[], 'FF-BF-5C-80');
assertIncludes(separateModeYaml,'operating_mode_sender_id: "FF-A6-04-A8"', 'Series-14 separate operating sender exported');
assertIncludes(separateModeYaml,'id: "FF-A6-04-86"', 'Existing controller sender unchanged');
const heatingEntries = api.buildSenderProgrammingEntries(
  [modeHeating], [heatingGateway], 'FF-BF-5C-80', '', 'fam-usb|FF-A6-04-80');
assert(heatingEntries.length===1 && heatingEntries[0].operating_mode_sender_id==='FF-A6-04-A8',
  'FG4 sender passed to the Series-14 writer without another device entry');
assert(heatingEntries[0].sender_id==='FF-A6-04-86',
  'Temperature sender remains the original channel controller');
assert(api.operatingModeSenderFitsGateway('FF-A6-04-A8',heatingGateway),
  'FAM-USB operating-mode sender must be inside Base-ID range');
assert(!api.operatingModeSenderFitsGateway('AA-BB-CC-DD',heatingGateway),
  'Foreign Base-ID must be rejected for FAM-USB');
assert(api.operatingModeSenderFitsGateway('00-00-B0-05',{type:'fgw14usb',base_id:'FF-BF-5C-80'}),
  'Series-14 writer allows virtual sender IDs');
assert(!api.operatingModeSenderFitsGateway('FF-A6-04-A8',{type:'fgw14usb',base_id:'FF-BF-5C-80'}),
  'Series-14 writer rejects radio ID when a virtual bus sender is needed');
const heatingChannels=Array.from({length:4},(_,index)=>({
  ...modeHeating,device_type:'F4HK14',name:'F4HK14 Kanal '+(index+1),
  dev_id:'00-00-00-'+(0x40+index).toString(16).toUpperCase(),
  operating_mode_sender_id:'FF-A6-04-'+(0xA8+index).toString(16).toUpperCase()
}));
const channels=api.buildSenderProgrammingEntries(
  heatingChannels,[heatingGateway],'FF-BF-5C-80','','fam-usb|FF-A6-04-80');
assert(channels.length===4 &&
  new Set(channels.map(x=>x.operating_mode_sender_id)).size===4 &&
  new Set(channels.map(x=>x.sender_id)).size===4,
  'F4HK14 channels use independently routed controller and operating-mode IDs');
const fhk61Profile='A5-10-06-FHK61-230V';
const fhk61={name:'FHK61',eep:fhk61Profile,platform:'climate',
  device_type:'FHK61-230V',dev_id:'01-02-03-04',sender_id:'FF-A6-04-86',
  operating_mode_sender_id:'FF-A6-04-A9'};
const radioModeYaml=api.generateYaml(heatingGateway,[fhk61],[], 'FF-BF-5C-80');
assertIncludes(radioModeYaml,'operating_mode_sender_id: "FF-A6-04-A9"',
  'FHK61 physical radio teach-in sender role exported separately');
const pwmModeYaml=api.generateYaml(heatingGateway,[{
 ...fhk61,eep:'A5-38-08-FHK61SSR-PWM',device_type:'FHK61SSR-230V',
 platform:'number',sender_eep:'A5-38-08',pwm_mode:'direct'
}],[], 'FF-BF-5C-80');
assertNotIncludes(pwmModeYaml,'operating_mode_sender_id:',
  'SSR direct PWM remains independent from RPS operating-mode learning');


// Light/Switch is a YAML-only user override. Old projects fall back to
// the database, unchanged sender IDs / EEP and identical physical actuation.
const relayGw={type:'fam-usb',base_id:'FF-A6-04-80'};
const relayBase={eep:'M5-38-08-FSR61NP-230V',profile_key:'M5-38-08-FSR61NP-230V',
  device_type:'FSR61NP-230V',name:'Steckdose Garten',dev_id:'FF-AC-10-01',
  sender_id:'FF-A6-04-95',sender_eep:'A5-38-08',platform:'light'};
const dbRelay=api.EEP_DB[relayBase.eep];
assert(api.supportsLightSwitchSelection(dbRelay),'FSR relay supports Light/Switch');
assert(api.effectivePlatformForDevice(relayBase,dbRelay)==='light',
  'Database default remains Light when override is absent');
const legacyYaml=api.generateYaml(relayGw,[relayBase]);
assertIncludes(legacyYaml,'      light:', 'Legacy relay still exports as Light');
assertNotIncludes(legacyYaml,'      switch:', 'No unexpected Switch from old project');
const switched={...relayBase,platform_override:'switch'};
const loadedSwitched=api.normalizeLoadedDeviceProfile(switched);
assert(loadedSwitched.platform_override==='switch','Switch override persists on project load');
const appliedSwitched=api.applyCurrentDatabaseProfile(loadedSwitched);
assert(appliedSwitched.platform==='switch', 'Database refresh respects Switch override');
const switchYaml=api.generateYaml(relayGw,[switched]);
assertIncludes(switchYaml,'      switch:', 'Switch override chooses YAML switch section');
assertNotIncludes(switchYaml,'      light:', 'Switch override removes device from YAML light section');
assertIncludes(switchYaml,'eep: "M5-38-08"','Switch retains device EEP');
assertIncludes(switchYaml,'id: "FF-A6-04-95"','Switch retains controller sender ID');
assertIncludes(switchYaml,'eep: "A5-38-08"','Switch retains controller sender EEP');
const backToDb={...switched,platform_override:''};
assert(api.effectivePlatformForDevice(backToDb,dbRelay)==='light',
  'Selecting original Light restores database default');
const switchedBack=api.generateYaml(relayGw,[backToDb]);
assertIncludes(switchedBack,'      light:','Switch-to-Light reset exports database platform');
assertNotIncludes(switchedBack,'      switch:','Switch section disappears after reset');
const rgbProfile=api.EEP_DB['07-3F-7F-FRGBW14'];
assert(!api.supportsLightSwitchSelection(rgbProfile),'RGBW actuator cannot be converted to Switch');
const rgbDevice={eep:'07-3F-7F-FRGBW14',device_type:'FRGBW14',
  name:'RGBW',dev_id:'FF-AC-10-07',sender_id:'FF-A6-04-96',
  platform_override:'switch',platform:'light'};
assert(api.effectivePlatformForDevice(rgbDevice,rgbProfile)==='light',
  'Invalid saved RGBW override is ignored');
assert(!api.supportsLightSwitchSelection(api.EEP_DB['A5-10-06']),
  'Heating/climate entities cannot be converted');
const fourRelay={...relayBase,eep:'M5-38-08-FSR71NP-4X-230V',profile_key:'M5-38-08-FSR71NP-4X-230V',
  device_type:'FSR71NP-4x-230V',name:'FSR71NP-4x-230V',platform_override:'switch'};
const fourYaml=api.generateYaml(relayGw,[fourRelay]);
for(let ch=1;ch<=4;ch++)assertIncludes(fourYaml,`channel: ${ch}`,
  `Four-channel relay keeps channel ${ch} as Switch`);
assertIncludes(fourYaml,'      switch:', 'Expanded relay uses Switch YAML group');
assertNotIncludes(fourYaml,'      light:', 'Expanded Switch relay not duplicated in Light');


// Dimmers must always stay lights, even if a user saved an outdated
// platform_override='switch' before the Light/Switch selector was restricted.
for (const profileKey of [
  'A5-38-08-FUD14', 'A5-38-08-FUD71',
  'A5-38-08-FUD61NP-230V', 'A5-38-08-FUD61NPN-230V',
  'A5-38-08-FD62NP-230V', 'A5-38-08-FD62NPN-230V',
  'A5-38-08-FDG14', 'A5-38-08-FD2G14',
]) {
  const dimmer = api.EEP_DB[profileKey];
  assert(dimmer && dimmer.platform === 'light', profileKey + ' database platform light');
  assert(!api.supportsLightSwitchSelection(dimmer),
    profileKey + ' does not show Light/Switch selector');
  const legacy = {
    name: dimmer.device_type, eep:profileKey, profile_key:profileKey,
    device_type:dimmer.device_type, dev_id:'FF-AC-10-08',
    sender_id:'FF-A6-04-96',sender_eep:'A5-38-08',
    platform:'switch',platform_override:'switch'
  };
  assert(api.effectivePlatformForDevice(legacy,dimmer) === 'light',
    profileKey + ' ignores previously saved Switch override');
  const normalized = api.applyCurrentDatabaseProfile(legacy);
  assert(normalized.platform === 'light',
    profileKey + ' project reload normalizes to Light');
  const yaml = api.generateYaml(relayGw,[legacy]);
  assertIncludes(yaml,'      light:', profileKey + ' exports in light section');
  assertNotIncludes(yaml,'      switch:',profileKey + ' never exports as switch');
}
assert(api.supportsLightSwitchSelection(dbRelay),
  'Simple FSR relay still offers Light/Switch after dimmer restriction');


// FTR55/FTR65 hardware variant must be independent of FHK / TF61 mode.
// Former builds exported FTR65DSB for the entire shared profile family.
const ftrVariants = [
  "FTR65DSB", "FTR55DSB", "FTR55EHB", "FTR55ESB",
  "FTR65HB", "FTRF65HB", "FTR55HB", "FTR65SB",
  "FTRF65SB", "FTR55SB"
];
for(const mode of [
  {eep:"A5-10-06-FTR-FHK", out:"A5-10-06", platform:"sensor", role:"fhk"},
  {eep:"A5-38-08-FTR-TF61", out:"A5-38-08", platform:"binary_sensor", role:"tf61"}
]) {
  for(const model of ftrVariants) {
    const current = {
      eep:mode.eep, profile_key:mode.eep, name:model+" Testwand",
      dev_id:"05-A3-EA-85",platform:mode.platform,
      ftr_model:model, device_type:"FTR65DSB"
    };
    assert(api.ftrModelForDevice(current)===model,
      model+" / "+mode.role+" explicitly saved model");
    const imported=api.applyCurrentDatabaseProfile(current);
    assert(imported.device_type===model,model+" / "+mode.role+" reload keeps physical model");
    const exported=api.generateYaml(
      {type:"fam-usb",base_id:"05-A3-EA-80"},[current],[], "", "de"
    );
    assertIncludes(exported,`device_type: "${model}"`,
      model+" / "+mode.role+" YAML exports correct physical model");
    assertIncludes(exported,`room_controller_mode: "${mode.role}"`,
      model+" / "+mode.role+" mode unchanged");
    assertIncludes(exported,`eep: "${mode.out}"`,
      model+" / "+mode.role+" EEP unchanged");
    assertNotIncludes(exported, 'frost_temperature:',
      model+" / "+mode.role+" does not export a separate frost protection YAML field");
  }
}
const oldFtrProject = {eep:"A5-10-06-FTR-FHK",name:"FTR55ESB Testwand",
  dev_id:"05-A3-EA-85",device_type:"FTR65DSB",platform:"sensor"};
assert(api.normalizeLoadedDeviceProfile(oldFtrProject).ftr_model==="FTR55ESB",
  "Legacy project recovers FTR55ESB from unique name");
assertIncludes(api.generateYaml(
  {type:"fam-usb",base_id:"05-A3-EA-80"},[oldFtrProject]),
  'device_type: "FTR55ESB"',
  "Previously exported FTR65DSB corrected for FTR55ESB Testwand");
const userSelectedFtr={...oldFtrProject,ftr_model:"FTR55EHB"};
assert(api.ftrModelForDevice(userSelectedFtr)==="FTR55EHB",
  "Explicit model selection takes precedence over legacy name");
assert(api.ftrModelForDevice({
  ...oldFtrProject,name:"Wohnzimmer",device_type:"FTR55DSB"
})==="FTR55DSB","Old project with a valid specific device type retains it");


// A user-customized local device database may still carry the obsolete
// frost_temperature value. The FTR-specific YAML writer must ignore it,
// while other device profiles retain their existing export behavior.
const ftrDb = api.EEP_DB["A5-10-06-FTR-FHK"];
assert(!Object.prototype.hasOwnProperty.call(ftrDb, "frost_temperature"),
  "Default FTR device database does not store a separate frost-temperature value");
assert(String(ftrDb.note).includes("DB2") && String(ftrDb.label).includes("8 °C"),
  "8 C frost protection remains visible as DB2 protocol guidance");
const savedFtrProfile = {...ftrDb};
try {
  ftrDb.frost_temperature = 8;
  const oldDbProject = {
    eep:"A5-10-06-FTR-FHK",platform:"sensor",name:"FTR55ESB Testwand",
    device_type:"FTR55ESB",ftr_model:"FTR55ESB",dev_id:"05-A3-EA-85"
  };
  const ftrFromOldDb = api.generateYaml({
    type:"fam-usb",base_id:"05-A3-EA-80"
  },[oldDbProject]);
  assertNotIncludes(ftrFromOldDb,"frost_temperature:",
    "Legacy local FTR database values do not reintroduce separate YAML frost setting");
  assertIncludes(ftrFromOldDb,'device_type: "FTR55ESB"',
    "Legacy local FTR DB keeps actual physical device type");
} finally {
  if (savedFtrProfile.frost_temperature === undefined) delete ftrDb.frost_temperature;
  else ftrDb.frost_temperature = savedFtrProfile.frost_temperature;
}
