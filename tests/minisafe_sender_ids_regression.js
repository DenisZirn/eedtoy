const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = fs.readFileSync('src/App.jsx', 'utf8');
const context = { console, Date, DOMParser: class {}, Blob: class {}, URL: {} };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const APP_VERSION'), source.indexOf('export default function App()')) +
  '\nthis.api = {parseMiniSafeDevices, generateYaml, normalizeFksSenderAssignments, autoSenderIdForGateway, EEP_DB, applyCurrentDatabaseProfile, senderIdForGateway};', context);
const api = context.api;
const handlerStart = source.indexOf('  const importMiniSafeDevices = () => {');
const handlerEnd = source.indexOf('  const handlePct14Import', handlerStart);
assert(handlerStart > 0 && handlerEnd > handlerStart);
vm.runInContext(`this.importRows = (miniSafePreview, gateway, miniSafeUseSenderIds = false, devices = []) => {
  const result = {devices, open:true, error:'', message:''};
  const t = (key, values) => key + (values ? JSON.stringify(values) : '');
  const setDevices = value => { result.devices = value; };
  const setMiniSafeOpen = value => { result.open = value; };
  const setMiniSafeError = value => { result.error = value; };
  const setMiniSafeImportMsg = value => { result.message = value; };
  const setTimeout = () => {};
  ${source.slice(handlerStart, handlerEnd)}
  importMiniSafeDevices();
  return result;
};`, context);

const makeDevice = (name, address, sid, deviceText, senderID) => ({name, room:1,
  info:{type:'ENOCEAN', vendor:'eltako', virtual:false, gateway:1, address, sid, deviceText, ...(senderID ? {senderID} : {})}});
const devices = [
  makeDevice('Sensor', '01020304', '0A', 'FTR55DSB / FTR65DSB'),
  makeDevice('Dimmer', '05909C00', '09', 'FUD61NPN-230V', 'FFFA77A0'),
  makeDevice('Relay', '01A34FC8', '01', 'FSR61-230V'),
  makeDevice('Button', '0025927A', '11', 'Funktaster (4 Tasten)'),
];
const states = [
  {type:'ENOCEAN', sid:'01', adr:'01A34FC8', senderID:'FFFA77A2'},
  // Unconfigured state rows must never create additional imported devices.
  {type:'ENOCEAN', sid:'02', adr:'00000002', senderID:'FFFA77A3'},
  // Same SID, different physical address: must not be joined to the relay.
  {type:'ENOCEAN', sid:'01', adr:'12345678', senderID:'DEADBEEF'},
  {type:'OTHER', sid:'09', adr:'05909C00', senderID:'ABCD1234'},
];
const config = {system:{rooms:[{name:'Test room', index:1}], devices,
  gateways:[{info:{password:'DO-NOT-IMPORT', _token:'PRIVATE-TOKEN'}}]}};
const email = 'Developer Info:\nApp:\n{"appName":"GFA5"}\nConfig:\n' + JSON.stringify(config) +
  '\n\n192.0.2.1: GetSI\n{"ENOCEAN":{"baseAdr":"FFFA7780"}}\n\n192.0.2.1: getStates\n' + JSON.stringify(states);
const rows = api.parseMiniSafeDevices(email);
assert.equal(rows.length, 4);
assert.equal(rows[1].sender_id, 'FF-FA-77-A0');
assert.equal(rows[2].sender_id, 'FF-FA-77-A2');
assert.equal(rows[2].dev_id, '01-A3-4F-C8');
assert.equal(rows[2].room, 'Test room');
assert.equal(rows[0].sender_id, '');
assert(!JSON.stringify(rows).includes('DO-NOT-IMPORT'));
assert(!JSON.stringify(rows).includes('PRIVATE-TOKEN'));

for (const gateway of [
  {type:'fam-usb', base_id:'FF-A6-04-80'},
  {type:'fam-usb', base_id:'FF-A6-04-00'},
  {type:'fam14', base_id:'FF-BF-5C-80'},
  {type:'fgw14usb', base_id:'FF-BF-5C-80'},
]) {
  const expected = gateway.type === 'fam-usb'
    ? (gateway.base_id.endsWith('80') ? ['FF-A6-04-81', 'FF-A6-04-82'] : ['FF-A6-04-01', 'FF-A6-04-02'])
    : ['00-00-B0-01', '00-00-B0-02'];
  const automatic = context.importRows(rows, gateway);
  assert.equal(automatic.error, '');
  assert.equal(automatic.open, false);
  const actors = automatic.devices.filter(d => api.EEP_DB[d.eep].needs_sender);
  assert.deepEqual(Array.from(actors, d => d.sender_id), expected);
  assert.equal(automatic.devices[0].sender_id, '', 'sensor must not consume a sender ID');
  assert.equal(automatic.devices[3].sender_id, '', 'button must not get a sender ID');
  assert.equal(actors[0].sender_id_source, undefined);
  const normalYaml = api.generateYaml(gateway, automatic.devices);
  for (const id of expected) assert(normalYaml.includes(`          id: "${id}"`));
  assert(normalYaml.includes('eep: "M5-38-08"'), 'relay feedback profile must remain compatible');
  assert(normalYaml.includes('          eep: "A5-38-08"'), 'actuator control profile must remain A5');
  assert(!normalYaml.includes('FF-FA-77-A2'));
  const again = context.importRows(rows, gateway, false, automatic.devices);
  assert.equal(again.devices.length, 4, 're-import must not duplicate devices');
  assert.equal(api.autoSenderIdForGateway(gateway, automatic.devices), gateway.type === 'fam-usb'
    ? (gateway.base_id.endsWith('80') ? 'FF-A6-04-83' : 'FF-A6-04-03') : '00-00-B0-03');

  const imported = context.importRows(rows, gateway, true);
  assert.equal(imported.error, '');
  const importedActors = imported.devices.filter(d => api.EEP_DB[d.eep].needs_sender);
  assert.deepEqual(Array.from(importedActors, d => d.sender_id), ['FF-FA-77-A0', 'FF-FA-77-A2']);
  assert(importedActors.every(d => d.sender_id_source === 'minisafe2'));
  const yaml = api.generateYaml(gateway, imported.devices);
  assert(yaml.includes('          id: "FF-FA-77-A0"'));
  assert(yaml.includes('          id: "FF-FA-77-A2"'));
  assert(yaml.includes('device_type: "FSR61-230V"'));
  assert(!yaml.includes('sender_id_source:') && !yaml.includes('source_sid:'));
  const saved = JSON.parse(JSON.stringify(imported.devices)).map(api.applyCurrentDatabaseProfile);
  assert.equal(api.generateYaml(gateway, saved), yaml, 'project save/load must preserve imported sender IDs');
}

// Full email and raw JSON inputs: direct IDs and SID-based state association.
assert.equal(api.parseMiniSafeDevices(JSON.stringify({...config, getStates:states}))[2].sender_id, 'FF-FA-77-A2');
const sidOnly = JSON.parse(JSON.stringify(config));
delete sidOnly.system.devices[1].info.senderID;
const sidEmail = 'Config:\n' + JSON.stringify(sidOnly) + '\n192.0.2.1: getStates\n' + JSON.stringify([
  ...states, {type:'ENOCEAN', sid:'9', adr:'05909C00', senderID:'ff-fa-77-a0'}]);
assert.equal(api.parseMiniSafeDevices(sidEmail)[1].sender_id, 'FF-FA-77-A0');
const missing = api.parseMiniSafeDevices(JSON.stringify(sidOnly));
const before = [{dev_id:'05-00-00-01', eep:'A5-38-08-FUD61NPN-230V', sender_id:'FF-A6-04-81'}];
const failure = context.importRows(missing, {type:'fam-usb', base_id:'FF-A6-04-80'}, true, before);
assert(failure.error.startsWith('minisafe.senderMissing'));
assert.equal(failure.devices, before, 'failed import must not write a partial device list');
assert.equal(failure.open, true);
const invalid = api.parseMiniSafeDevices(JSON.stringify({system:{devices:[makeDevice('Bad sender', '01010101', '01', 'FSR61-230V', '01')]}}));
assert(context.importRows(invalid, {type:'fam14'}, true).error.startsWith('minisafe.senderInvalid'));
const conflictConfig = JSON.parse(JSON.stringify(config));
conflictConfig.system.devices[2].info.senderID = 'FFFA7790';
const conflictRows = api.parseMiniSafeDevices('Config:\n' + JSON.stringify(conflictConfig) + '\n192.0.2.1: getStates\n' + JSON.stringify(states));
assert(context.importRows(conflictRows, {type:'fam14'}, true).error.startsWith('minisafe.senderAmbiguous'));
const noBase = context.importRows(rows, {type:'fam-usb', base_id:''});
assert(noBase.error.startsWith('minisafe.senderUnavailable'));
assert.equal(noBase.devices.length, 0);
const occupied = [{dev_id:'10-00-00-00', eep:'A5-38-08-FUD61NPN-230V', sender_id:'FF-A6-04-81'}];
const occupiedImport = context.importRows(rows, {type:'fam-usb', base_id:'FF-A6-04-80'}, false, occupied);
assert.equal(occupiedImport.devices[2].sender_id, 'FF-A6-04-82');
assert.equal(occupiedImport.devices[3].sender_id, 'FF-A6-04-83');

// FKS-SV has a separate normalizer: an explicitly imported absolute sender must survive it.
const fksRow = [{...rows[1], profileKey:'A5-20-01-FKS-SV'}];
assert(api.EEP_DB[fksRow[0].profileKey], 'FKS-SV fixture must select the actual DB profile');
const fks = context.importRows(fksRow, {type:'fam-usb', base_id:'FF-A6-04-80'}, true);
const normalized = api.normalizeFksSenderAssignments({type:'fam-usb', base_id:'FF-A6-04-80'}, fks.devices);
assert.equal(normalized.devices[0].sender_id, 'FF-FA-77-A0');
assert.equal(api.senderIdForGateway(normalized.devices[0], {type:'fam-usb', base_id:'FF-A6-04-80'}), 'FF-FA-77-A0');

// Compile the actual dialog JSX and operate the actual checkbox binding.
const modalStart = source.indexOf('      {miniSafeOpen&&(');
const modalEnd = source.indexOf('      {deviceDbOpen', modalStart);
const jsx = source.slice(modalStart, modalEnd).trim();
const ui = {React, miniSafeOpen:true, miniSafeText:'', miniSafeError:'', miniSafeFileName:'', miniSafePreview:[], miniSafeUseSenderIds:false,
  t:key=>key, setMiniSafeOpen(){}, setMiniSafeText(){}, setMiniSafeError(){}, setMiniSafePreview(){},
  setMiniSafeUseSenderIds(value){ui.miniSafeUseSenderIds=value;}, pasteMiniSafeClipboard(){}, handleMiniSafeFile(){}, importMiniSafeDevices(){}};
vm.createContext(ui);
vm.runInContext(transformSync('this.render = () => <>' + jsx + '</>;', {loader:'jsx', jsx:'transform'}).code, ui);
const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {const found=find(child,predicate);if(found)return found;}
  return null;
};
const checkbox = find(ui.render(), node => node.type === 'input' && node.props.type === 'checkbox');
assert(checkbox && checkbox.props.checked === false, 'sender import must default to off');
checkbox.props.onChange({target:{checked:true}});
assert.equal(ui.miniSafeUseSenderIds, true);
assert(renderToStaticMarkup(ui.render()).includes('minisafe.senderImportHint'));
assert(!renderToStaticMarkup(ui.render()).includes('minisafe.senderIgnored'));

console.log('MiniSafe2 sender IDs: automatic FAM-USB/RS485 allocation, SID lookup, import, YAML, persistence, errors and checkbox: OK');
