const fs = require('fs');
const src = fs.readFileSync('src/App.jsx', 'utf8');
const expected = {
  'D5-00-01': '00-00-00-00',
  'F6-10-00-FFG7B': 'F0',
  'A5-14-09-FFG7B': '50-48-0D-80',
  'A5-07-01': '1C-08-0D-80',
  'A5-08-01-FBH-FBHT': '20-08-0D-85',
  'A5-30-03-FHMB': 'C0-18-2D-80',
  'A5-04-02-FLGTF': '10-10-0D-87',
  'A5-09-0C-FLGTF': '24-60-0D-80',
  'A5-09-04-FCO2TF65': '24-20-0D-80',
  'A5-12-01': '48-08-0D-80',
  'A5-12-01-F3Z14D': '48-08-0D-80',
  'A5-13-01': '4C-08-0D-80',
};
for (const [key, telegram] of Object.entries(expected)) {
  const pattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"\\s*:\\s*\\{[^\\n]*teach_in_telegram:\\s*"${telegram}"`);
  if (!pattern.test(src)) throw new Error(`Missing or wrong teach-in for ${key}: ${telegram}`);
}
if (!src.includes('const DEVICE_DB_SCHEMA_VERSION = 51;')) throw new Error('Schema is not 50');
if (!src.includes('schemaVersion < 48 && fix48TeachInKeys.has(key) && !currentTeachIn')) throw new Error('FIX48 empty-value migration missing');
console.log('FIX48 teach-in completeness regression passed.');
