const fs = require('fs');
const src = fs.readFileSync('src/App.jsx', 'utf8');

function expect(text, message) {
  if (!src.includes(text)) throw new Error(message);
}

expect('function resolveProfileKeyForDevice(device)', 'profile resolver missing');
expect('state.devices.map(normalizeLoadedDeviceProfile)', 'loaded project devices are not normalized');
expect('setForm(normalizeLoadedDeviceProfile(devices[i]))', 'edit dialog does not normalize device profile');
expect('profile_key: form.eep', 'selected database profile key is not persisted');
expect('Never silently', 'silent fallback protection missing');
expect('Unbekanntes gespeichertes Profil', 'unknown profile is not shown explicitly');

console.log('project profile resolution regression: OK');
