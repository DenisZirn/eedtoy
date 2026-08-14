const fs = require('fs');
const source = fs.readFileSync('src/App.jsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

const start = source.indexOf('const DEFAULT_EEP_DB = {');
const end = source.indexOf('const DEVICE_DB_STORAGE_KEY', start);
assert(start >= 0 && end > start, 'Default device database is present');
const databaseSource = source.slice(start, end);
const rows = [...databaseSource.matchAll(/^\s*"([^"]+)":\s*\{([^\n]+)\},?$/gm)];
const senderProfiles = rows
  .map((match) => ({ key: match[1], body: match[2] }))
  .filter((entry) => entry.body.includes('needs_sender:true'));
assert(senderProfiles.length > 0, 'Sender-based profiles are present');
for (const entry of senderProfiles) {
  assert(/teach_in_telegram:"[0-9A-F]{2}(?:-[0-9A-F]{2}){3}"/.test(entry.body), `${entry.key} has an editable teach-in telegram`);
}

assert(source.includes('if (p.teach_in_telegram) out += `        teach_in_telegram: "${p.teach_in_telegram}"\\n`;'), 'YAML exports teach-in telegram from the active database profile');
assert(!source.includes('teach_in_telegram: "E0-40-0D-80"'), 'YAML generator contains no hard-coded E0-40-0D-80 fallback');
assert(source.includes('const currentTeachIn = String(database[key]?.teach_in_telegram || "").trim();') && source.includes('!currentTeachIn'), 'Migration preserves non-empty user teach-in values and fills FIX48 empty defaults once');
assert(source.includes('teach_in_telegram: defaultTeachIn'), 'Migration adds missing verified database teach-in values once');

const noteFiles = fs.readdirSync('.').filter((name) => /^FIX\d+_NOTES\.txt$/i.test(name));
assert(noteFiles.length === 0, 'No individual FIX-number note files remain');
assert(fs.existsSync('FIX_NOTES.txt'), 'Single consolidated FIX_NOTES.txt exists');
console.log('All teach-in database regression tests passed.');

const pctMappings = [
  ['FSB14', 'G5-3F-7F-FSB14'],
  ['FD2G14', 'A5-38-08-FD2G14'],
  ['FRGBW14', '07-3F-7F-FRGBW14'],
  ['FRGBW71', '07-3F-7F-FRGBW71L'],
  ['FUD14', 'A5-38-08-FUD14'],
  ['F4SR14', 'M5-38-08-F4SR14-LED'],
  ['FMZ14', 'M5-38-08-FMZ14'],
];
for (const [model, profileKey] of pctMappings) {
  assert(source.includes(`name.startsWith("${model}")`) && source.includes(`eep:"${profileKey}"`), `PCT14 ${model} resolves to device-specific profile ${profileKey}`);
}
