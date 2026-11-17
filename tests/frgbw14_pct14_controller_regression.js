const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DOMParser: Parser } = require('@xmldom/xmldom');

function elementChildren(node) {
  return Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
}
function descendants(node, name) {
  const result = [];
  for (const child of elementChildren(node)) {
    if (String(child.nodeName).toLowerCase() === String(name).toLowerCase()) result.push(child);
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
  let current = [node];
  for (const part of source.split(/\s+/)) current = current.flatMap(parent => descendants(parent, part));
  return current;
}
function installSelectors(node) {
  node.querySelectorAll = selector => selectAll(node, selector);
  node.querySelector = selector => selectAll(node, selector)[0] || null;
  for (const child of Array.from(node.childNodes || [])) installSelectors(child);
  return node;
}
class DOMParser {
  parseFromString(xml) {
    return installSelectors(new Parser().parseFromString(xml, 'application/xml'));
  }
}

const src = fs.readFileSync(path.join(__dirname,'..','src','App.jsx'),'utf8');
const start = src.indexOf('const APP_VERSION');
const end = src.indexOf('export default function App()');
assert(start >= 0 && end > start);
const context = {console, Date, DOMParser, Blob:class {}, URL:{}};
vm.createContext(context);
vm.runInContext(src.slice(start,end) + '\nthis.api={parsePct14Xml,getPct14Mapping,buildSenderProgrammingEntries,gatewayKey};',context);
const {api} = context;
assert.equal(api.getPct14Mapping('FRGBW14').sender_eep,'07-3F-7F');

const xml = `<?xml version="1.0"?>
<exchange>
  <rootdevice><rootdevicedata><baseid>
    <baseid_byte_0>255</baseid_byte_0><baseid_byte_1>242</baseid_byte_1>
    <baseid_byte_2>108</baseid_byte_2><baseid_byte_3>128</baseid_byte_3>
  </baseid></rootdevicedata></rootdevice>
  <devices><device><name>FRGBW14</name>
    <header><address>7</address><addressrange>1</addressrange><numberofblocks>127</numberofblocks></header>
    <channels numberofchannels="1"><channel channelnumber="1" description="RGBW"/></channels>
    <data><rangeofid numberofentries="2">
      <entry><entry_number>1</entry_number><entry_id>45076</entry_id><entry_function>32</entry_function><entry_button>0</entry_button><entry_channel>1</entry_channel></entry>
      <entry><entry_number>2</entry_number><entry_id>45063</entry_id><entry_function>81</entry_function><entry_button>0</entry_button><entry_channel>15</entry_channel></entry>
    </rangeofid></data>
  </device></devices>
</exchange>`;

const parsed=api.parsePct14Xml(xml,'',{},'de');
assert.equal(parsed.devices.length,1,'FRGBW14 is one logical RGBW device');
assert.equal(parsed.devices[0].device_type,'FRGBW14');
assert.equal(parsed.devices[0].programmed_sender_id,'00-00-B0-07','function 81 + mask 15 is actual learned controller');
const gw={type:'fgw14usb',base_id:'FF-F2-6C-80'};
const device={...parsed.devices[0],imported_from_pct14:true,export_gateway_key:api.gatewayKey(gw)};
const writes=api.buildSenderProgrammingEntries([device],[gw],parsed.baseId,'',api.gatewayKey(gw));
assert.equal(writes.length,1,'only one writer request for all four RGBW channels');
assert.equal(writes[0].sender_id,'00-00-B0-07');
assert.equal(writes[0].sender_eep,'07-3F-7F');
console.log('PASS: FRGBW14 PCT14 function 81 with mask 15, one logical sender request.');
