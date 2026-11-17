const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('src/App.jsx', 'utf8');
const start = app.indexOf('const APP_VERSION');
const end = app.indexOf('export default function App()');
assert(start >= 0 && end > start);
const context = {console, Date, Blob: class {}, DOMParser: class {}, URL: {}};
vm.createContext(context);
vm.runInContext(app.slice(start, end) + `
this.api = {
  gatewayKey, generateYaml, exportGatewayForDevice, gatewayCanExportDevice,
  assignDeviceExportGateway, pendingSenderDevices, buildSenderProgrammingEntries,
  senderIdForGateway, normalizeLoadedDeviceProfile, profileFor
};
`, context);
const a = context.api;
const fam = {type:'fam-usb',base_id:'FF-A6-07-00'};
const fgw = {type:'fgw14usb',base_id:'FF-F2-6C-80'};
const busBase = 'FF-F2-6C-80';
const device = {
  name:'FHK14 Test', device_type:'FHK14', eep:'A5-10-06', platform:'climate',
  dev_id:'00-00-00-02', sender_id:'00-00-B0-02', sender_eep:'A5-10-06',
  room:'PCT14 Adresse 2', imported_from_pct14:true,
  sender_programming_pending:true,
  bus_base_id:busBase,
};
const blocks = yaml => yaml.split(/  - id: \d+\n/).slice(1);
const physicalFhk = name => name.includes('name: "FHK14 Test"');

assert.equal(a.exportGatewayForDevice(device,a.gatewayKey(fam)),a.gatewayKey(fam));
assert.equal(a.profileFor(device.eep).needs_sender,true);
const baseYaml = a.generateYaml(fam,[device],[fgw],busBase,'de',a.gatewayKey(fam));
assert.equal(blocks(baseYaml).length,1,'legacy device is only exported under configured primary gateway');
assert(baseYaml.includes('device_type: fam-usb'));
assert(baseYaml.includes('id: "FF-F2-6C-82"'));
assert(!baseYaml.includes('device_type: fgw14usb'));

const switched = a.assignDeviceExportGateway(device,a.gatewayKey(fgw),a.gatewayKey(fam));
assert.equal(switched.export_gateway_key,a.gatewayKey(fgw));
assert.equal(switched.sender_programming_pending,true);
const switchedYaml = a.generateYaml(fam,[switched],[fgw],busBase,'de',a.gatewayKey(fam));
assert.equal(blocks(switchedYaml).length,1);
assert(switchedYaml.includes('device_type: fgw14usb'));
assert(switchedYaml.includes('id: "00-00-00-02"'));
assert(switchedYaml.includes('id: "00-00-B0-02"'));
assert(!switchedYaml.includes('device_type: fam-usb'));
assert.equal(switchedYaml.split('name: "FHK14 Test"').length-1,1);

const sendEntries = a.buildSenderProgrammingEntries([switched],[fam,fgw],busBase,'',a.gatewayKey(fam));
assert.equal(sendEntries.length,1);
assert.equal(sendEntries[0].sender_id,'00-00-B0-02');
assert.equal(sendEntries[0].source_gateway_type,'fgw14usb');
assert.equal(sendEntries[0].device_id,'FF-F2-6C-82');
assert.equal(a.pendingSenderDevices([switched],a.gatewayKey(fam)).length,1);
assert.equal(a.pendingSenderDevices([{...switched,sender_programming_pending:false}],a.gatewayKey(fam)).length,0);

const backToFam = a.assignDeviceExportGateway(
  {...switched,sender_programming_pending:false},a.gatewayKey(fam),a.gatewayKey(fam)
);
assert.equal(backToFam.sender_programming_pending,true);
const famEntries = a.buildSenderProgrammingEntries([backToFam],[fam,fgw],busBase,'',a.gatewayKey(fam));
assert.equal(famEntries.length,1);
assert.equal(famEntries[0].sender_id,'FF-A6-07-02');
assert.equal(famEntries[0].source_gateway_type,'fam-usb');

const excluded = a.assignDeviceExportGateway(switched,'',a.gatewayKey(fam));
assert.equal(a.exportGatewayForDevice(excluded,a.gatewayKey(fam)),'');
assert(!physicalFhk(a.generateYaml(fam,[excluded],[fgw],busBase,'de',a.gatewayKey(fam))));
assert.equal(a.buildSenderProgrammingEntries([excluded],[fam,fgw],busBase,'',a.gatewayKey(fam)).length,0);

const passive = {name:'Contact',eep:'D5-00-01',platform:'binary_sensor',dev_id:'01-02-03-04'};
const movedPassive = a.assignDeviceExportGateway(passive,a.gatewayKey(fgw),a.gatewayKey(fam));
assert.equal(movedPassive.sender_programming_pending,false);
const reopened = a.normalizeLoadedDeviceProfile(JSON.parse(JSON.stringify(switched)));
assert.equal(reopened.export_gateway_key,a.gatewayKey(fgw));
assert.equal(reopened.sender_programming_pending,true);
assert.equal(a.generateYaml(fam,[reopened],[fgw],busBase,'de',a.gatewayKey(fam)).includes('device_type: fam-usb'),false);

assert(app.includes('t("routing.beforeYaml"'));
assert(app.includes('handleDeviceGatewaySelection(i,e.target.checked?gatewayKey(gw):"")'));
assert(app.includes('fullyWritten'));
assert(app.includes('sender_programming_pending: false'));
console.log('PASS: exclusive YAML gateway routing, physical/sender IDs, pending write warnings, and project compatibility.');
