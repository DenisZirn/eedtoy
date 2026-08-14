const fs = require('fs');
const source = fs.readFileSync('src/App.jsx', 'utf8');
function expect(text, message) {
  if (!source.includes(text)) throw new Error(message);
}
expect('"A5-10-12-FUTH55ED-HYGROSTAT": "A5-10-12-FUTH55-HYGROSTAT"', 'missing FUTH55ED profile-key alias');
expect('if (/^A5-10-12-FUTH(?:55|55ED|65D).*HYGROSTAT$/.test(rawEep)) return "A5-10-12";', 'missing defensive A5-10-12 YAML export');
expect('const eepOut = exportEepForDevice(d);', 'YAML generator does not use canonical EEP exporter');
expect('eep_out: "A5-10-12",', 'migration does not enforce A5-10-12');
console.log('FUTH55 Hygrostat EEP regression checks passed.');
