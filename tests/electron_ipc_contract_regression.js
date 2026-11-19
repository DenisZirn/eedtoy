const fs = require('fs');
const path = require('path');

function assert(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS: ${label}`);
}

const root = path.join(__dirname, '..');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

const invokedChannels = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1]);
const handledChannels = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((match) => match[1]));
for (const channel of invokedChannels) {
  assert(handledChannels.has(channel), `IPC invoke channel has a main-process handler: ${channel}`);
}

const exposedMethods = new Set([...preload.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]));
const appMethods = new Set([...app.matchAll(/window\.electronAPI\.([A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]));
for (const method of appMethods) {
  assert(exposedMethods.has(method), `Renderer method is exposed by preload: ${method}`);
}

assert(main.includes("sendMenuAction('new-project')"), 'Main menu exposes New Project action');
assert(app.includes('if (action === "new-project") window.location.reload();'), 'Renderer resets state for New Project');
assert(main.includes("accelerator: 'CmdOrCtrl+N'"), 'New Project uses Ctrl/Cmd+N');

for (const eventChannel of ['menu-action', 'language-changed']) {
  assert(preload.includes(`ipcRenderer.on('${eventChannel}'`), `Preload listens for ${eventChannel}`);
  assert(main.includes(`webContents.send('${eventChannel}'`), `Main process emits ${eventChannel}`);
}

console.log('All Electron IPC contract regression tests passed.');
