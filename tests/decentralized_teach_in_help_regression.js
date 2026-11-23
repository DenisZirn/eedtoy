const assert = require('assert');
const fs = require('fs');
const path = require('path');
const guide = require('../electron/decentralized-teach-in-guide.js');

const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '../electron/preload.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../electron/decentralized-teach-in.html'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '../electron/decentralized-teach-in-ui.js'), 'utf8');
const dictionary = fs.readFileSync(path.join(__dirname, '../electron/i18n-main.js'), 'utf8');

assert(guide.catalog.length >= 18, 'Catalog has Series 61 and 62 examples');
assert(guide.catalog.some(x=>x.series==='61') && guide.catalog.some(x=>x.series==='62'));
assert(guide.findModel('FHK61U-230V').model==='FHK61U-230V');
assert(guide.findModel('FJ62/12-36V DC').model==='FJ62/12-36V DC');
assert(guide.findModel('does-not-exist')===null);
assert(!guide.catalog.some(x=>x.series==='72'), 'Do not invent unverified Series-72 models');
assert(guide.isOfficialManualLink('https://www.eltako.com/de/service/downloads-zone/'));
assert(!guide.isOfficialManualLink('https://evil.example/manual.pdf'));
assert(!guide.isOfficialManualLink('http://www.eltako.com/manual.pdf'));
assert(!guide.isOfficialManualLink('https://www.eltako.com.evil.example'));

const fhk=guide.findModel('FHK61-230V');
const home=guide.stepsFor(fhk,'controller','de').steps.join(' ');
const mode=guide.stepsFor(fhk,'mode','de').steps.join(' ');
assert(home.includes('Home Assistant') && home.includes('Einlerntelegramm senden'),
  'Temperature teach-in has exact Home Assistant button step');
assert(mode.includes('Home Assistant') && mode.includes('Einlerntelegramm senden'),
  'RPS operating-mode teach-in has exact Home Assistant button step');
assert(mode.includes('4,5') && mode.includes('LRN'));
assert(mode.includes('0x70') && mode.includes('0x50') && mode.includes('0x30') && mode.includes('0x10'));
assert(!home.includes('unteren Drehschalter auf Rechtsanschlag 4,5'),
  'Do not assign RPS rotary setting unconditionally to temperature learning');

for (const model of ['FSR61NP-230V','FSB61-230V','FD62NP-230V','FJ62NP-230V']) {
 const item=guide.findModel(model);
 const steps=guide.stepsFor(item,'controller','de').steps.join(' ');
 assert(steps.includes('Home Assistant') && steps.includes('Einlerntelegramm senden'),
   model+' has explicit HA learning step');
 assert(steps.includes('Aktor'),model+' has physical confirmation');
}
const series62=guide.stepsFor(guide.findModel('FJ62NP-230V'),'controller','de').steps.join(' ');
assert(series62.includes('Kein LRN-Drehschalter') && series62.includes('4-mal kurz'),
  'FJ62 requires tap sequence, never LRN');
const unknown72=guide.stepsFor(null,'controller','de').steps.join(' ');
assert(unknown72.includes('Home Assistant') && unknown72.includes('Einlerntelegramm senden'));
assert(!unknown72.includes('4-mal kurz'), 'Do not guess Series-72 tapping sequence');

assert(html.includes('decentralized-teach-in-guide.js') && html.includes('decentralized-teach-in-ui.js'));
assert(html.includes('data-series="72"') && html.includes('id="search"'));
assert(ui.includes('textContent=step'), 'All instructions rendered as plain text');
assert(!/innerHTML\s*=/.test(ui), 'Untrusted search text cannot inject HTML');
assert(main.includes("t('menu.decentralizedTeachIn')") &&
       main.includes("ipcMain.handle('open-decentralized-teach-in-help'"));
assert(main.includes("sandbox: true") && main.includes('isOfficialUrl(url)'));
assert(preload.includes('openDecentralizedTeachInHelp'));
assert(app.includes('Einlernhilfe für diesen Aktor öffnen'));
assert(dictionary.includes('Dezentrale Aktoren einlernen'));
assert(!/writeSenderIdsToDevices|sendRps|write_mem_line|SerialPort|send-teach-in/.test(html+ui),
  'Help window must never write to hardware or claim to transmit telegrams');
console.log('PASS: decentralized actuator teach-in help, HA steps, models, links and security');
