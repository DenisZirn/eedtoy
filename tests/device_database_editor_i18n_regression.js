const fs = require('fs');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const i18n = fs.readFileSync('src/i18n.js', 'utf8');
function must(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}
must(app, 'translateGroup(language,v)', 'group dropdown uses translated labels');
must(app, 'translateDeviceName(language, item.eltako)', 'device list translates device names');
must(app, 'translateDeviceLabel(language,entry.label', 'editor translates display labels');
must(i18n, "'Taster / Schalter': 'Pushbuttons / switches'", 'pushbutton group translation exists');
must(i18n, "['2-Kanal', '2-channel']", 'device name channel translation exists');
must(i18n, "['4-fach-Taster', '4-channel pushbutton']", 'F4USM mode translation exists');
