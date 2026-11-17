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
  senderIdForGateway, normalizeLoadedDeviceProfile, profileFor, senderProgrammingIsPending, reconcilePct14ImportedDevices, defaultExportGatewayForDevice, repairIncompatiblePrimaryAssignments, assignPct14BusDevices
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
// Execute the actual Devices -> YAML handlers (without rendering React).
// The user must see an explicit warning but may choose to preview YAML safely.
Object.assign(context, {
  gateway:fam,
  extraGateways:[fgw],
  devices:[{...device,export_gateway_key:a.gatewayKey(fam),sender_programming_pending:false}],
  importFam14Gateway:false,
  importFgw14Gateway:false,
  pct14DetectedFam14:false,
  pct14DetectedFgw14:false,
  pct14GatewayBaseId:busBase,
  multiBusEnabled:false,
  busSystems:[],
  language:'de',
  step:2,
  yaml:'previous YAML',
  generatedGatewayBlocks:[],
  importMsg:'',
  writeSenderSummary:null,
  t:(key,{count}={})=>count==null?key:`${key}:${count}`,
  window:{confirm:()=>false},
});
for(const key of ['Devices','Yaml','GeneratedGatewayBlocks','ImportMsg','Step','WriteSenderSummary']) {
  const property=key[0].toLowerCase()+key.slice(1);
  context['set'+key]=v=>{
    context[property]=typeof v==='function'?v(context[property]):v;
  };
}
const extraStart=app.indexOf('  const buildActiveExtraGateways =');
const extraEnd=app.indexOf('  // Keep an already generated YAML',extraStart);
const handleStart=app.indexOf('  const handleDeviceGatewaySelection =');
const handleEnd=app.indexOf('  const handleCopy =',handleStart);
assert(extraStart>0&&extraEnd>extraStart&&handleStart>0&&handleEnd>handleStart);
vm.runInContext(
  app.slice(extraStart,extraEnd)+app.slice(handleStart,handleEnd)+
  '\nthis.handlers={handleDeviceGatewaySelection,handleGenerate};',context
);
context.handlers.handleDeviceGatewaySelection(0,a.gatewayKey(fgw));
assert.equal(context.devices[0].export_gateway_key,a.gatewayKey(fgw));
assert.equal(context.devices[0].sender_programming_pending,true);
assert.equal(context.yaml,'');
context.handlers.handleGenerate();
assert.equal(context.step,2,'canceling pending-write warning stays on Devices');
context.window.confirm=msg=>{assert(String(msg).includes('routing.beforeYaml'));return true;};
context.handlers.handleGenerate();
assert.equal(context.step,3,'confirming warning permits a non-writing YAML preview');
assert(context.yaml.includes('device_type: fgw14usb'));
assert(!context.yaml.includes('device_type: fam-usb'));
assert.equal(context.generatedGatewayBlocks.length,2);

// Explicitly known controller (from PCT14 or a verified write): changing away
// and back must clear the warning without rewriting an unchanged actuator.
const knownFgw = {...device,export_gateway_key:a.gatewayKey(fgw),programmed_sender_id:'00-00-B0-02',sender_programming_pending:false};
const movedToRadio = a.assignDeviceExportGateway(knownFgw,a.gatewayKey(fam),a.gatewayKey(fam),busBase);
assert.equal(movedToRadio.sender_programming_pending,true);
assert.equal(a.pendingSenderDevices([movedToRadio],a.gatewayKey(fam),busBase).length,1);
const returnedToBus = a.assignDeviceExportGateway(movedToRadio,a.gatewayKey(fgw),a.gatewayKey(fam),busBase);
assert.equal(returnedToBus.sender_programming_pending,false);
assert.equal(a.pendingSenderDevices([returnedToBus],a.gatewayKey(fam),busBase).length,0);
assert.equal(returnedToBus.programmed_sender_id,'00-00-B0-02');
// A second gateway using the same logical controller ID also needs no write.
const fam14={type:'fam14',base_id:busBase};
const sameSender = a.assignDeviceExportGateway(returnedToBus,a.gatewayKey(fam14),a.gatewayKey(fam),busBase);
assert.equal(sameSender.sender_programming_pending,false);
// Unknown / unverified controller IDs must NOT silently become "written".
const unknown={...knownFgw,programmed_sender_id:'',sender_programming_pending:true};
const unknownChange=a.assignDeviceExportGateway(unknown,a.gatewayKey(fam),a.gatewayKey(fam),busBase);
const unknownReturn=a.assignDeviceExportGateway(unknownChange,a.gatewayKey(fgw),a.gatewayKey(fam),busBase);
assert.equal(a.senderProgrammingIsPending(unknownReturn,a.gatewayKey(fam),busBase),true);
// A previous explicit clean state can still be used as a local baseline.
const oldClean={...knownFgw,programmed_sender_id:'',sender_programming_pending:false};
const cleanMove=a.assignDeviceExportGateway(oldClean,a.gatewayKey(fam),a.gatewayKey(fam),busBase);
assert.equal(cleanMove.sender_programming_pending,true);
assert.equal(a.assignDeviceExportGateway(cleanMove,a.gatewayKey(fgw),a.gatewayKey(fam),busBase).sender_programming_pending,false);
// Re-import PCT14 controller evidence into a previously saved project without
// losing the user's selected gateway, custom name or other device options.
const a2 = {...knownFgw,export_gateway_key:a.gatewayKey(fam),name:'My heating device',
  programmed_sender_id:'',sender_programming_pending:true};
const refreshed = a.reconcilePct14ImportedDevices([a2],
  [{...device,programmed_sender_id:'00-00-B0-02'}],fam,busBase);
assert.equal(refreshed.length,1);
assert.equal(refreshed[0].name,'My heating device');
assert.equal(refreshed[0].export_gateway_key,a.gatewayKey(fam));
assert.equal(refreshed[0].programmed_sender_id,'00-00-B0-02');
assert.equal(refreshed[0].sender_programming_pending,true);
assert.equal(a.assignDeviceExportGateway(refreshed[0],a.gatewayKey(fgw),a.gatewayKey(fam),busBase).sender_programming_pending,false);
const noEvidence=a.reconcilePct14ImportedDevices([a2],[{...device,programmed_sender_id:''}],fam,busBase);
assert.equal(noEvidence[0].sender_programming_pending,true);
assert.equal(noEvidence[0].programmed_sender_id,'');
console.log('PASS: PCT14 reimport updates controller evidence without overwriting selected gateway.');
console.log('PASS: roundtrip to already programmed controller clears warning; unverified route stays pending.');
console.log('PASS: real UI handlers mark changed controller IDs pending and warn before preview.');
// FTS14EM cannot be exported using FAM-USB. Detect a compatible
// PCT14 Series-14 gateway on initial import and repair legacy FAM-USB
// defaults only when the matching physical bus is known.
const fts={
  eep:'F6-02-01-FTS14EM-UT', name:'FTS14EM', dev_id:'00-00-13-01',
  room:'PCT14 Adresse 31', imported_from_pct14:true,
  platform:'binary_sensor', device_type:'FTS14EM',
};
const fam14={type:'fam14',base_id:busBase};
const otherBus={type:'fam14',base_id:'FF-00-12-80'};
const routes=[fam14,fgw,otherBus];
assert.equal(a.defaultExportGatewayForDevice(fts,fam,routes,busBase),a.gatewayKey(fam14));
const initial=a.reconcilePct14ImportedDevices([], [fts],fam,busBase,routes);
assert.equal(initial.length,1);
assert.equal(initial[0].export_gateway_key,a.gatewayKey(fam14));
assert.equal(a.generateYaml(fam,initial,routes,busBase,'de',a.gatewayKey(fam))
  .includes('device_type: fam-usb'),false);
const legacy={...fts,export_gateway_key:a.gatewayKey(fam)};
const repaired=a.repairIncompatiblePrimaryAssignments([legacy],fam,routes,busBase);
assert.equal(repaired[0].export_gateway_key,a.gatewayKey(fam14));
assert.equal(a.repairIncompatiblePrimaryAssignments([legacy],fam,[],busBase)[0].export_gateway_key,a.gatewayKey(fam));
assert.equal(a.repairIncompatiblePrimaryAssignments([{...fts,export_gateway_key:''}],fam,routes,busBase)[0].export_gateway_key,'');
assert.equal(a.repairIncompatiblePrimaryAssignments(
 [{...fts,export_gateway_key:a.gatewayKey(fgw)}],fam,routes,busBase
)[0].export_gateway_key,a.gatewayKey(fgw));
const otherDevice={...fts,bus_base_id:otherBus.base_id};
const selected=a.reconcilePct14ImportedDevices([], [otherDevice],fam,otherBus.base_id,routes);
assert.equal(selected[0].export_gateway_key,a.gatewayKey(otherBus),'FTS14EM is assigned to its own bus');
const multi=a.assignPct14BusDevices([], [fts], {id:'house',base_id:busBase},fam,routes);
assert.equal(multi[0].export_gateway_key,a.gatewayKey(fam14));
assert.equal(a.repairIncompatiblePrimaryAssignments(
 [{...fts,export_gateway_key:a.gatewayKey(fam)}],fam,[fam14],busBase
)[0].export_gateway_key,a.gatewayKey(fam14));
console.log('PASS: FTS14EM import, saved legacy route repair, gateway activation, explicit exclusions and bus isolation.');

console.log('PASS: exclusive YAML gateway routing, physical/sender IDs, pending write warnings, and project compatibility.');
