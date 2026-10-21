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
  + '\nthis.__api = { EEP_DB, getPct14Mapping, parsePct14Xml, generateYaml, buildSenderProgrammingEntries, migrateCustomDeviceDatabase };';
const context = { console, Date, DOMParser, Blob: class UnsupportedBlob {}, URL: {} };
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: 'src/App.f2l14-helpers.jsx' });
const api = context.__api;

// Exact structural values from the supplied PCT14 export: address 60,
// address range 2, two channels, device type 25 and no learned IDs yet.
const pct14Xml = `<?xml version="1.0"?>
<exchange>
  <rootdevice><rootdevicedata><baseid>
    <baseid_byte_0>255</baseid_byte_0><baseid_byte_1>191</baseid_byte_1>
    <baseid_byte_2>92</baseid_byte_2><baseid_byte_3>128</baseid_byte_3>
  </baseid></rootdevicedata></rootdevice>
  <devices><device>
    <name>F2L14</name><description></description>
    <header><address>60</address><addressrange>2</addressrange><numberofblocks>127</numberofblocks>
      <offsetfirstblock>8</offsetfirstblock><versionofinstructionmanual>4</versionofinstructionmanual>
      <devicetype>25</devicetype><versionofsoftware>65</versionofsoftware></header>
    <channels numberofchannels="2">
      <channel channelnumber="1" description=""/><channel channelnumber="2" description=""/>
    </channels>
    <data><rangeofconfig numberoffeedbackids="0"></rangeofconfig><rangeofid numberofentries="0"></rangeofid></data>
  </device></devices>
</exchange>`;

const mapping = api.getPct14Mapping('F2L14');
assert(mapping?.eep === 'F6-02-01-F2L14', 'PCT14 maps F2L14 to its dedicated profile');
assert(mapping?.logical_fan === true, 'F2L14 mapping collapses two addresses into one logical fan');
const imported = api.parsePct14Xml(pct14Xml, '', {}, 'de');
assert(imported.devices.length === 1, 'F2L14 imports as exactly one device');
const fan = imported.devices[0];
assert(fan.platform === 'fan' && fan.device_family === 'F2L14', 'Imported F2L14 is a fan entity');
assert(fan.dev_id === '00-00-00-3C', 'F2L14 uses address 60 as its logical ID');
assert(fan.stage_1_id === '00-00-00-3C', 'F2L14 stage 1 feedback uses address 60');
assert(fan.stage_2_id === '00-00-00-3D', 'F2L14 stage 2 feedback uses address 61');
assert(fan.sender_id === '00-00-B0-3C', 'F2L14 receives one virtual double-rocker sender');
assert(fan.f2l14_mode === 'exclusive', 'Empty F2L14 imports with the safe exclusive default');

const additiveXml = pct14Xml.replace(
  '<rangeofid numberofentries="0"></rangeofid>',
  '<rangeofid numberofentries="1"><entry><entry_number>1</entry_number><entry_id>118689027</entry_id><entry_function>56</entry_function><entry_button>7</entry_button><entry_channel>3</entry_channel><entry_value>1</entry_value></entry></rangeofid>'
);
const exclusiveXml = pct14Xml.replace(
  '<rangeofid numberofentries="0"></rangeofid>',
  '<rangeofid numberofentries="1"><entry><entry_number>1</entry_number><entry_id>168494857</entry_id><entry_function>56</entry_function><entry_button>7</entry_button><entry_channel>3</entry_channel><entry_value>0</entry_value></entry></rangeofid>'
);
assert(api.parsePct14Xml(additiveXml, '', {}, 'de').devices[0].f2l14_mode === 'additive', 'PCT14 value 1 imports as additive');
assert(api.parsePct14Xml(exclusiveXml, '', {}, 'de').devices[0].f2l14_mode === 'exclusive', 'PCT14 value 0 imports as exclusive');

const busYaml = api.generateYaml({ type:'fam14', base_id:'FF-BF-5C-80' }, imported.devices, [], imported.baseId, 'de');
assertIncludes(busYaml, 'fan:', 'F2L14 exports in the fan platform');
assertIncludes(busYaml, 'device_type: "F2L14"', 'F2L14 technical device type is exported');
assertIncludes(busYaml, 'stage_1_id: "00-00-00-3C"', 'Bus YAML keeps stage 1 bus address');
assertIncludes(busYaml, 'stage_2_id: "00-00-00-3D"', 'Bus YAML keeps stage 2 bus address');
assertIncludes(busYaml, 'speed_count: 2', 'F2L14 exports exactly two fan speeds');
assertIncludes(busYaml, 'eep: "F6-02-01"', 'F2L14 uses F6-02-01 for feedback and control');
assertIncludes(busYaml, 'id: "00-00-B0-3C"', 'F2L14 exports one double-rocker sender ID');
const programmingEntries = api.buildSenderProgrammingEntries(imported.devices, [{ type:'fam14', base_id:'FF-BF-5C-80' }], imported.baseId);
assert(programmingEntries.length === 1, 'F2L14 exports one direct sender-programming entry');
assert(programmingEntries[0].device_id === 'FF-BF-5C-BC', 'F2L14 programming targets its physical Series-14 base address');
assert(programmingEntries[0].sender_id === '00-00-B0-3C', 'F2L14 programming uses the HA double-rocker sender');
assert(programmingEntries[0].sender_eep === 'F6-02-01', 'F2L14 programming uses the RPS profile');
assert(programmingEntries[0].f2l14_mode === 'exclusive', 'F2L14 programming carries the selected exclusive mode');

const additiveProgramming = api.buildSenderProgrammingEntries(
  [{ ...fan, f2l14_mode:'additive' }],
  [{ type:'fam14', base_id:'FF-BF-5C-80' }],
  imported.baseId
);
assert(additiveProgramming[0].f2l14_mode === 'additive', 'F2L14 programming carries the selected additive mode');

const radioYaml = api.generateYaml({ type:'fam-usb', base_id:'FF-A6-04-80' }, imported.devices, [], imported.baseId, 'de');
assertIncludes(radioYaml, 'stage_1_id: "FF-BF-5C-BC"', 'FAM-USB YAML resolves stage 1 to the PCT14 base ID');
assertIncludes(radioYaml, 'stage_2_id: "FF-BF-5C-BD"', 'FAM-USB YAML resolves stage 2 to the PCT14 base ID');
assertIncludes(radioYaml, 'id: "FF-A6-04-BC"', 'FAM-USB YAML resolves the virtual sender ID');

const migrated = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 55,
  DUMMY: { label:'Benutzerprofil' },
});
assert(Boolean(migrated['F6-02-01-F2L14']), 'Schema 55 databases receive F2L14 once');
assert(migrated.__eedtoy_database_schema === 59, 'Migration stores schema 59');
const deliberatelyRemoved = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode: 'authoritative',
  __eedtoy_database_schema: 56,
  DUMMY: { label:'Benutzerprofil' },
});
assert(!deliberatelyRemoved['F6-02-01-F2L14'], 'A later deliberate F2L14 deletion remains deleted');

console.log('All F2L14 PCT14/XML regression tests passed.');
