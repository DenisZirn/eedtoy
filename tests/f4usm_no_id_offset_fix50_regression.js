const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!app.includes('First ID offset'), 'English first-ID offset field still exists');
assert(!app.includes('Erster ID-Versatz'), 'German first-ID offset field still exists');

const runtimeWithoutMigration = app.replace(/if \(Object\.prototype\.hasOwnProperty\.call\(profile, "id_offset_start"\)\)[\s\S]*?database\[key\] = cleaned;\n\s*}/, '');
assert(!runtimeWithoutMigration.includes('id_offset_start'), 'Obsolete F4USM61B ID offset is still used outside migration cleanup');

assert(app.includes('const id = addIdOffset(device.dev_id, index);'), 'F4USM61B channels do not start at the original ID');
assert(app.includes('Channel 1 = Base-ID, channel 2 = Base-ID + 1.'), 'Expected original-ID mapping documentation missing');

for (let mode = 1; mode <= 8; mode += 1) {
  const key = `F4USM61B-M${mode}`;
  const line = app.split('\n').find(value => value.includes(key) && value.includes('device_family:"F4USM61B"'));
  assert(line, `Missing F4USM61B mode ${mode}`);
  assert(!line.includes('id_offset_start'), `Mode ${mode} still contains id_offset_start`);
}

console.log('F4USM61B FIX50 no-offset regression passed.');
