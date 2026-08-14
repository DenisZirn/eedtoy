const fs = require('fs');
const src = fs.readFileSync('src/App.jsx', 'utf8');
function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(src.includes('function firstAvailableProfileKey()'), 'missing current database default profile resolver');
assert(src.includes('function createEmptyForm(preferredProfileKey = "")'), 'missing empty-form factory');
assert(!src.includes('eep:"A5-04-02"'), 'raw A5-04-02 must not be the empty-form profile key');
assert(src.includes('loadedEditIdx !== null\n      ? normalizeLoadedDeviceProfile(loadedDevices[loadedEditIdx])\n      : createEmptyForm()'), 'project loading must ignore stale saved form when no device is being edited');
assert(src.includes('const nextEmpty = createEmptyForm(form.eep);'), 'post-add reset must retain only a valid database key');
console.log('empty form profile FIX49 regression OK');
