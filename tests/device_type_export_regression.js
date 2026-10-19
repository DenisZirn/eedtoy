const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const context = { console, Date, DOMParser:class {}, Blob:class {}, URL:{}, t:(key, values) => `${key}: ${values?.key || ''}` };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const APP_VERSION'), source.indexOf('export default function App()')) + `
this.api = { EEP_DB, DEFAULT_EEP_DB, DEVICE_DB_SCHEMA_VERSION, generateYaml, applyCurrentDatabaseProfile,
  migrateCustomDeviceDatabase, mergeDeviceDatabase, serializeDeviceDatabaseYaml, parseDeviceDatabaseYaml,
  normalizeLoadedDeviceProfile };
`, context);
const api = context.api;

function deviceFor(key, name = 'Schlafzimmer Licht') {
  const profile = api.EEP_DB[key];
  return {
    eep:key,
    profile_key:key,
    platform:profile.platform,
    name,
    dev_id:profile.device_family === 'FTS14EM' ? '00-00-10-01' : 'FE-EF-D6-FC',
    sender_id:'00-00-B0-01',
    physical_unique_id:'01-02-03-04',
    bus_address:'00-00-00-3B',
    fwg14ms_id_range:'1',
    id_range:'1',
    // Old project snapshots must never override the selected current profile.
    device_type:'WRONG-SNAPSHOT-TYPE',
    device_family:'WRONG-SNAPSHOT-FAMILY',
    model:'Wrong old model',
    eltako:'Wrong old model',
  };
}

const gateways = [
  { type:'fam14', base_id:'FF-BF-5C-80' },
  { type:'fgw14usb', base_id:'FF-BF-5C-80' },
  { type:'fam-usb', base_id:'FF-A6-07-00' },
];

function exported(input, language = 'de', gateway = gateways[0]) {
  const text = api.generateYaml(gateway, input, [], 'FF-BF-5C-80', language);
  // js-yaml rejects duplicate properties, including duplicate device_type.
  const parsed = yaml.load(text);
  const entries = Object.values(parsed.eltako.gateway[0].devices || {}).flat();
  for (const entry of entries) {
    for (const forbidden of ['device_family', 'profile_key', 'rocker_positions']) {
      assert(!Object.hasOwn(entry, forbidden), `${forbidden} must stay out of HA YAML`);
    }
  }
  return { text, entries, gateway:parsed.eltako.gateway[0] };
}

function withoutNames(entries) {
  return entries.map(({ name, ...entry }) => entry);
}

let checkedProfiles = 0;
let checkedExports = 0;
let checkedEntries = 0;
const names = ['Schlafzimmer Licht', 'F4USM61B FLGTF FKS-SV FSR71-4x230V', 'Room "north"\nLight', 'beliebig umbenannt'];
for (const [key, profile] of Object.entries(api.EEP_DB)) {
  assert.equal(typeof profile.device_type, 'string', `${key} stores its technical type as profile data`);
  assert(profile.device_type.trim(), `${key} has a nonempty technical type`);
  assert(!/[,\s]/.test(profile.device_type), `${key} identifies one technical type without translated labels or modes`);
  for (const gateway of gateways) {
    let baseline;
    for (const language of ['de', 'en']) {
      for (const name of names) {
        const result = exported([deviceFor(key, name)], language, gateway);
        assert.equal(result.gateway.device_type, gateway.type, 'Gateway type stays unchanged');
        const expectedCount = profile.device_family === 'FTS14EM'
          ? (gateway.type === 'fam-usb' ? 0 : 10)
          : profile.device_family === 'FSR71NP-4X-230V' ? 4
          : profile.device_family === 'F4USM61B' ? profile.id_count
          : key === 'A5-09-0C-FLGTF' ? 2 : 1;
        assert.equal(result.entries.length, expectedCount, `${key} exports its expected channels`);
        for (const entry of result.entries) {
          assert.equal(entry.device_type, profile.device_type, `${key} uses its profile's untranslated type`);
          const allowedEeps = key === 'A5-09-0C-FLGTF' ? ['A5-09-0C', 'A5-04-02'] : [profile.eep_out];
          assert(allowedEeps.includes(entry.eep), `${key} keeps the original EnOcean profile`);
        }
        const common = withoutNames(result.entries);
        if (expectedCount) {
          if (!baseline) baseline = common;
          assert.deepEqual(common, baseline, `${key} export behavior is independent of name and UI language`);
        }
        checkedExports += 1;
        checkedEntries += result.entries.length;
      }
    }
  }
  checkedProfiles += 1;
}
console.log(`PASS: ${checkedProfiles} profiles, ${checkedExports} YAML exports and ${checkedEntries} device entries have stable profile-based technical types.`);

for (const [key, expected] of [
  ['F6-02-01-2CH', 'F2T55'],
  ['F6-02-01-4CH', 'FT55'],
  ['A5-20-04-FKS-B', 'FKS-B'],
  ['F6-02-01-F2L14', 'F2L14'],
  ['A5-13-01-FWG14MS', 'FWG14MS'],
]) {
  const entry = exported([deviceFor(key)]).entries[0];
  assert.equal(entry.device_type, expected, `${key} exports the expected technical type`);
  assert.equal(entry.name, 'Schlafzimmer Licht', 'Custom display name remains the HA name');
}
for (const [key, profile] of Object.entries(api.EEP_DB).filter(([, p]) => p.device_family === 'F4USM61B')) {
  const entry = exported([deviceFor(key)]).entries[0];
  assert.equal(entry.device_type, 'F4USM61B');
  assert.equal(entry.operating_mode, profile.operating_mode);
  assert.equal(entry.base_id, 'FE-EF-D6-FC');
}
console.log('PASS: F2T55, FT55, FKS-B, F2L14, FWG14MS and all eight F4USM61B modes have the expected types.');

const renamed = exported([{ ...deviceFor('F6-02-01-2CH'), name:'Room "north"\nLight' }]).entries[0];
assert.equal(renamed.name, 'Room "north"\nLight', 'Quotes and line breaks in display names remain valid YAML');

const plainButton = exported([{
  ...deviceFor('F6-02-01-4CH'),
  device_family:'F4USM61B', operating_mode:7, base_id:'AA-BB-CC-DD',
  f2l14_mode:'additive', stage_1_id:'00-00-00-01', stage_2_id:'00-00-00-02',
  room_controller_mode:'fhk', rocker_positions:['left', 'right'],
}]).entries[0];
for (const field of ['device_family', 'profile_key', 'rocker_positions', 'operating_mode', 'base_id', 'sender', 'stage_1_id', 'stage_2_id', 'f2l14_mode', 'room_controller_mode']) {
  assert(!Object.hasOwn(plainButton, field), `FT55 does not inherit ${field} from a previously selected profile`);
}
const fan = exported([{ ...deviceFor('F6-02-01-F2L14'), f2l14_mode:'additive', stage_1_id:'00-00-00-3C', stage_2_id:'00-00-00-3D' }]).entries[0];
assert.equal(fan.f2l14_mode, 'additive');
assert.equal(fan.stage_1_id, '00-00-00-3C');
assert.equal(fan.stage_2_id, '00-00-00-3D');
assert.equal(fan.speed_count, 2);
assert.equal(fan.sender.id, '00-00-B0-01');
const controller = exported([deviceFor('A5-10-06-FTR-FHK')]).entries[0];
assert.equal(controller.room_controller_mode, 'fhk');
const fts = exported([deviceFor('F6-02-01-FTS14EM-RT')]).entries[0];
assert.equal(fts.operating_mode, 'RT');
assert.equal(fts.input_number, 1);
console.log('PASS: Only the relevant profiles retain operating modes, senders, base IDs, fan stages and controller options.');

const typeFromSelectedProfile = exported([{ ...deviceFor('F6-02-01-2CH'), eep:'F6-02-01', name:'FT55', device_type:'FT55' }]).entries[0];
assert.equal(typeFromSelectedProfile.device_type, 'F2T55', 'Persisted profile_key wins over a raw EEP, stale type and renamed display name');
const unknown = exported([{ name:'F2T55', eep:'F6-02-01', platform:'binary_sensor', dev_id:'01-02-03-04' }]).entries[0];
assert(!Object.hasOwn(unknown, 'device_type'), 'An ambiguous EEP-only device is never identified from its free display name');

const currentButtonProfile = api.EEP_DB['F6-02-01-2CH'];
api.EEP_DB['F6-02-01-2CH'] = { ...currentButtonProfile, device_type:'F2T55-Custom', eltako:'Freely translated profile display label' };
assert.equal(exported([deviceFor('F6-02-01-2CH')], 'en').entries[0].device_type, 'F2T55-Custom', 'Export reads the current database technical type, not stale snapshots or translated labels');
api.EEP_DB['F6-02-01-2CH'] = currentButtonProfile;

const customKey = 'CUSTOM-PROFILE';
api.EEP_DB[customKey] = { label:'Custom sensor', platform:'sensor', eep_out:'A5-04-02', device_type:'Custom-Device' };
assert.equal(exported([deviceFor(customKey)]).entries[0].device_type, 'Custom-Device', 'Custom database profiles use the same central type export');
delete api.EEP_DB[customKey];

const legacyProfiles = Object.fromEntries(Object.entries(api.DEFAULT_EEP_DB).map(([key, { device_type, ...profile }]) => [key, profile]));
legacyProfiles['F6-02-01-2CH'].label = 'User-edited profile display label';
const migrated = api.migrateCustomDeviceDatabase({ ...legacyProfiles, __eedtoy_database_mode:'authoritative', __eedtoy_database_schema:57 });
assert.equal(migrated.__eedtoy_database_schema, 58);
for (const [key, profile] of Object.entries(api.DEFAULT_EEP_DB)) {
  assert.equal(migrated[key].device_type, profile.device_type, `${key} is upgraded with its explicit technical type`);
}
assert.equal(migrated['F6-02-01-2CH'].label, 'User-edited profile display label', 'Type migration preserves edited profile labels');
const persisted = api.parseDeviceDatabaseYaml(api.serializeDeviceDatabaseYaml(migrated));
for (const [key, profile] of Object.entries(api.DEFAULT_EEP_DB)) assert.equal(persisted[key].device_type, profile.device_type);
const explicitlyEdited = api.migrateCustomDeviceDatabase({
  __eedtoy_database_mode:'authoritative', __eedtoy_database_schema:57,
  'F6-02-01-2CH':{ ...currentButtonProfile, device_type:'Custom-Technical-Type' },
});
assert.equal(explicitlyEdited['F6-02-01-2CH'].device_type, 'Custom-Technical-Type', 'Migration preserves an explicitly configured technical type');
assert(!Object.hasOwn(explicitlyEdited, 'F6-02-01-4CH'), 'Type migration never restores a deliberately deleted FT55 profile');
const legacyMerged = api.mergeDeviceDatabase(api.DEFAULT_EEP_DB, { 'F6-02-01-2CH':legacyProfiles['F6-02-01-2CH'] });
assert.equal(legacyMerged['F6-02-01-2CH'].device_type, 'F2T55', 'Legacy overlay databases also receive missing known technical types');
console.log('PASS: Database migrations and YAML database roundtrips retain profile types and user edits.');

const payloadStart = source.indexOf('  const buildDeviceDatabasePayload = (entries) => {');
const payloadEnd = source.indexOf('  const f4usmModePresets = {', payloadStart);
assert(payloadStart >= 0 && payloadEnd > payloadStart);
vm.runInContext(source.slice(payloadStart, payloadEnd).replace('const buildDeviceDatabasePayload =', 'this.buildDeviceDatabasePayload ='), context);
const payload = context.buildDeviceDatabasePayload([{ key:'F6-02-01-FTS14EM-RT', ...api.EEP_DB['F6-02-01-FTS14EM-RT'] }]);
assert.equal(payload['F6-02-01-FTS14EM-RT'].device_type, 'FTS14EM');
assert.equal(payload['F6-02-01-FTS14EM-RT'].operating_mode, 'RT', 'Saving database metadata retains string operating modes');
assert.throws(() => context.buildDeviceDatabasePayload([{ key:customKey, label:'Custom profile', platform:'sensor' }]), /database.deviceTypeRequired/, 'New custom profiles must explicitly specify a technical type');

console.log('All central device_type export regression tests passed.');
