const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const yaml = require('js-yaml');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const context = { console, Date, DOMParser:class {}, Blob:class {}, URL:{}, t:key=>key };
vm.createContext(context);
vm.runInContext(
  source.slice(source.indexOf('const APP_VERSION'), source.indexOf('export default function App()'))
    + '\nthis.api={EEP_DB,DEFAULT_EEP_DB,DEVICE_DB_SCHEMA_VERSION,migrateCustomDeviceDatabase,generateYaml};',
  context,
);
const api = context.api;

assert(api.DEVICE_DB_SCHEMA_VERSION >= 62);
const modes = [
  ['A5-10-06-FHK61', 'FHK61-230V', 'climate', 'A5-10-06', '40-30-0D-87'],
  ['A5-10-06-FHK61U', 'FHK61U-230V', 'climate', 'A5-10-06', '40-30-0D-87'],
  ['A5-10-06-FHK61SSR', 'FHK61SSR-230V', 'climate', 'A5-10-06', '40-30-0D-87'],
  ['A5-38-08-FHK61SSR-PWM', 'FHK61SSR-230V', 'number', 'A5-38-08', 'E0-40-00-80'],
];
const gateway = {type:'fam-usb', base_id:'FF-A6-04-80'};
for (const [key, type, platform, eep, teachIn] of modes) {
  const profile = api.EEP_DB[key];
  assert(profile, 'profile exists: ' + key);
  assert.equal(profile.device_type, type);
  assert.equal(profile.platform, platform);
  assert.equal(profile.eep_out, eep);
  assert.equal(profile.teach_in_telegram, teachIn);
  const entry = {
    eep:key, profile_key:key, platform, dev_id:'FE-EF-D6-FC',
    name:'Heizung Kanal 1', sender_id:'FF-A6-04-C0',
  };
  const doc = yaml.load(api.generateYaml(gateway, [entry], [], 'FF-BF-5C-80', 'de'));
  const blocks = Object.values(doc.eltako.gateway[0].devices || {}).flat();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].eep, eep);
  assert.equal(blocks[0].device_type, type);
  assert.equal(blocks[0].teach_in_telegram, teachIn);
  if (platform === 'number') {
    assert.equal(blocks[0].pwm_mode, 'direct');
    assert.equal(blocks[0].pwm_period_seconds, 120);
    assert.equal(blocks[0].pwm_repeater, false);
  } else {
    assert(!('pwm_mode' in blocks[0]), 'climate profile never exports direct PWM');
  }
}
const old = {__eedtoy_database_mode:'authoritative', __eedtoy_database_schema:61,
             'A5-10-06':{...api.DEFAULT_EEP_DB['A5-10-06'],label:'User modified'}};
const migrated = api.migrateCustomDeviceDatabase(old);
for (const [key] of modes) assert(migrated[key], 'authoritative DB migration keeps '+key);
assert.equal(migrated['A5-10-06'].label,'User modified');
console.log('FHK61 family EEDTOY profile, export and migration regressions passed');
