const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}
assert(source.includes('const DEVICE_DB_MODE_AUTHORITATIVE = "authoritative"'), 'authoritative database marker exists');
assert(source.includes('if (stored[DEVICE_DB_MODE_KEY] === DEVICE_DB_MODE_AUTHORITATIVE)'), 'saved authoritative database bypasses default merge');
assert(source.includes('database[DEVICE_DB_MODE_KEY] = DEVICE_DB_MODE_AUTHORITATIVE'), 'saving marks the full database authoritative');
assert(source.includes('if (schemaVersion < DEVICE_DB_SCHEMA_VERSION)'), 'authoritative database supports one-time schema migration');
assert(source.includes('database[DEVICE_DB_SCHEMA_KEY] = DEVICE_DB_SCHEMA_VERSION'), 'schema migration is recorded so later deletions remain deleted');
assert(!source.includes('const deletedDefaultKeys = Object.keys(DEFAULT_EEP_DB)'), 'save no longer tracks deletions as a default overlay');
assert(source.includes('const currentDevices = devices.map(applyCurrentDatabaseProfile)'), 'YAML export resolves current database profiles');
assert(source.includes('...profile,'), 'current profile fields are applied generically before YAML export');
console.log('All authoritative device database regression tests passed.');
