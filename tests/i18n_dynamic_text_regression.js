const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`PASS: ${label}`);
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS: ${label}`);
}

const root = path.join(__dirname, '..');
const i18nPath = path.join(root, 'src', 'i18n.js');
const appPath = path.join(root, 'src', 'App.jsx');
const storage = new Map();

let source = fs.readFileSync(i18nPath, 'utf8').replace(/export\s+/g, '');
source += '\nthis.__api = { messages, deviceLabelTranslations, translate, translateGroup, translateDeviceLabel, translatePlatform, translateRuntimeText, getStoredLanguage, storeLanguage };';

const context = {
  console,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  document: { documentElement: { lang: 'de' } },
  window: {},
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'src/i18n.js' });
const api = context.__api;

assertEqual(api.translate('de', 'common.deviceCountPlural', { count: 0 }), '0 Geräte', 'German device count');
assertEqual(api.translate('en', 'common.deviceCountPlural', { count: 40 }), '40 devices', 'English dynamic device count');
assertEqual(api.translate('de', 'common.copied'), '✓ Kopiert', 'German copied confirmation');
assertEqual(api.translate('en', 'common.copied'), '✓ Copied', 'English copied confirmation');
assertEqual(api.translate('de', 'gateway.disconnect'), 'Gateway trennen', 'German gateway disconnect label');
assertEqual(api.translate('de', 'footer.developerNotice'), 'Entwickelt von D. Zirnbauer · Kein offizielles Produkt der ELTAKO GmbH', 'German footer notice');
assertEqual(api.translate('en', 'common.saveProjectAs'), 'Save project as …', 'Save project as label');
assertEqual(api.translate('en', 'page.devicesSubtitle'), 'Import devices from PCT14, detect IDs and edit device settings', 'Device page subtitle');
assertEqual(api.translate('en', 'yaml.backToDevices'), '← Edit devices', 'YAML navigation');
assertEqual(api.translateRuntimeText('en', 'Kein Bus-COM-Port eingetragen. Bitte FAM14/FGW14-USB COM-Port wählen oder manuell eintragen.'), 'No bus COM port has been entered. Select or manually enter the FAM14/FGW14-USB COM port.', 'Backend error translation');
assertEqual(api.translateRuntimeText('en', 'Die Gateway-Erkennung lieferte keine Base-ID.'), 'Gateway detection did not return a base ID.', 'Gateway base-ID fallback translation');
assertEqual(api.translate('de', 'gateway.desc.famUsb'), 'ESP2 · 9600 Baud · Funk', 'German gateway description');
assertEqual(api.translate('en', 'gateway.desc.famUsb'), 'ESP2 · 9,600 baud · wireless', 'English gateway description');
assertEqual(
  api.translateDeviceLabel('en', 'FUTH65D / FHK14 / F4HK14 / FAE14SSR – Heizung/Klima Temperatur + Sollwert + Fan (A5-10-06)'),
  'FUTH65D / FHK14 / F4HK14 / FAE14SSR – Heating/climate: temperature, setpoint and fan control (A5-10-06)',
  'Climate profile is translated as a complete technical label',
);
assertEqual(
  api.translateDeviceLabel('en', 'FRGBW14 – RGBW/Farbsteuerung freies Profil (07-37-F7)'),
  'FRGBW14 – RGBW colour control, free profile (07-37-F7)',
  'RGBW profile wording',
);
assertEqual(
  api.translateDeviceLabel('en', 'FWZ12, FWZ14, DSZ14 – Funk-/Wechselstromzähler kWh (A5-12-01)'),
  'FWZ12, FWZ14, DSZ14 – Wireless single-phase energy meters, kWh (A5-12-01)',
  'Meter profile wording',
);
assertEqual(
  api.translateDeviceLabel('en', 'FTR55/65-Familie – Betriebsart FHK: Soll- und Isttemperatur (A5-10-06)'),
  'FTR55/65 family – FHK operating mode: setpoint and room temperature (A5-10-06)',
  'FTR FHK profile wording',
);
assertEqual(
  api.translateDeviceLabel('en', 'FTR55/65-Familie – Betriebsart TF61: Heizanforderung EIN/AUS (A5-38-08)'),
  'FTR55/65 family – TF61 operating mode: heating demand ON/OFF (A5-38-08)',
  'FTR TF61 profile wording',
);
assertEqual(
  api.translateDeviceLabel('en', 'FDG14 – DALI-Gateway / Dimmaktor (A5-38-08)'),
  'FDG14 – DALI gateway / dimming actuator (A5-38-08)',
  'FDG14 profile wording',
);

api.storeLanguage('en');
assertEqual(api.getStoredLanguage(), 'en', 'Language persistence');
assertEqual(context.document.documentElement.lang, 'en', 'Document language attribute');

const germanUiTerms = /(Gerät|Geräte|Fenster|Raum|Temperatur|Feuchte|Aktoren|schreiben|einfügen|bearbeiten|auswählen|löschen|zurück|Weiter|Kopiert|nicht|Bitte|seriell|Öffnungs|Schließ|Erkannt|Importiert|Unterstützt|Datei|Fehler|Suche|warte|Betriebsart|Helligkeit|Rauch|Jalousie|Rollladen|Taster|Näherung|Dimmaktor|Zähler|Wetterstation|Sollwert|Belegung|Heizung|Stellantrieb)/i;
for (const [key, value] of Object.entries(api.messages.en)) {
  assert(!germanUiTerms.test(value), `English UI text contains no German wording: ${key}`);
}

const deKeys = Object.keys(api.messages.de).sort();
const enKeys = Object.keys(api.messages.en).sort();
assertEqual(JSON.stringify(enKeys), JSON.stringify(deKeys), 'German and English translation keys are identical');

function placeholders(value) {
  return [...String(value).matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
}
for (const key of deKeys) {
  assertEqual(
    JSON.stringify(placeholders(api.messages.en[key])),
    JSON.stringify(placeholders(api.messages.de[key])),
    `Placeholder parity: ${key}`,
  );
}

const appSource = fs.readFileSync(appPath, 'utf8');
assert(!appSource.includes('MutationObserver'), 'No DOM translation observer');
assert(!source.includes('createTreeWalker'), 'No DOM text-node rewriting');
assert(appSource.includes('/PCT14\\s+(Adresse|address)\\b/i'), 'PCT14 imported devices remain detectable in both languages');

const referencedKeys = [...appSource.matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(referencedKeys)) {
  assert(api.translate('de', key) !== key, `German translation exists: ${key}`);
  assert(api.translate('en', key) !== key, `English translation exists: ${key}`);
}

// Normalize line endings before hashing so the database guard behaves identically
// on Windows (CRLF) and Linux/macOS (LF).
const databaseSource = appSource
  .slice(appSource.indexOf('const DEFAULT_EEP_DB = {'), appSource.indexOf('const DEVICE_DB_STORAGE_KEY'))
  .replace(/\r\n/g, '\n');
const deviceRows = [...databaseSource.matchAll(/group:"([^"]+)"\s*,\s*label:"([^"]+)"/g)]
  .map((match) => ({ group: match[1], label: match[2] }));
assertEqual(deviceRows.length, 75, 'Approved device profile count is 75');
assertEqual(crypto.createHash('sha256').update(databaseSource).digest('hex'), '6d82b5481f06a03609cd8a7c84992b427141ed1d5985d3fdfc448544bcd45bc4', 'Approved device database content unchanged');
assert(Object.keys(api.deviceLabelTranslations).length > 0, 'Exact English device-label table is available');

const remainingGerman = /(Taster|Näherung|Fenster|Türkontakt|Bewegung|Helligkeit|Rauch|Hitze|Temperatur\b|Feuchte|Datenübermittlung|Punkt-Regler|Heizkörper|Funk-|Wechselstrom|Drehstrom|Wetterstation|Regen|Dimmaktor|Relais|Farbsteuerung|freies Profil|Jalousie|Rollladen|Betriebsart|Raumregler|Sollwert|Belegung)/;
for (const row of deviceRows) {
  const translatedGroup = api.translateGroup('en', row.group);
  const translatedLabel = api.translateDeviceLabel('en', row.label);
  assert(!remainingGerman.test(translatedGroup), `Group translated: ${row.group}`);
  assert(!remainingGerman.test(translatedLabel), `Device label translated: ${row.label}`);
  assert(!translatedLabel.includes('temperaturee'), `Device label has no overlapping replacement artifact: ${row.label}`);
}

console.log('All key-based i18n regression tests passed.');
