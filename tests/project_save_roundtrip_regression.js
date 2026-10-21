const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(process.env.EEDTOY_TEST_APP_SOURCE || path.join(root, 'src/App.jsx'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eedtoy-project-save-'));
const handlers = new Map();
const dialogs = { openPath: '', savePath: '', cancelSave: false };
const backend = {
  console, Buffer, path, fs: fsp, MAX_PROJECT_SIZE_BYTES: 20 * 1024 * 1024,
  t: key => key, safeProjectFileName: value => value,
  ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
  dialog: {
    showSaveDialog: async () => ({ canceled: dialogs.cancelSave, filePath: dialogs.savePath }),
    showOpenDialog: async () => ({ canceled: false, filePaths: [dialogs.openPath] }),
  },
};
vm.createContext(backend);
const validateStart = main.indexOf('const PROJECT_FORMAT =');
assert(validateStart >= 0);
vm.runInContext(main.slice(validateStart, main.indexOf("ipcMain.handle('get-language'", validateStart)), backend);
const openStart = main.indexOf("ipcMain.handle('open-project'");
vm.runInContext(main.slice(openStart, main.indexOf('function attachNativeEditContextMenu', openStart)), backend);

function renderer(initial = {}) {
  const context = {
    console, Date, Blob: class {}, DOMParser: class {}, URL: {},
    step: 2, gateway: { type: 'fam-usb', base_id: 'FF-A6-04-80', serial_path: 'COM16' },
    devices: [], extraGateways: [], form: {}, editIdx: null, yaml: 'OLD YAML', generatedGatewayBlocks: [],
    importFam14Gateway: true, importFgw14Gateway: true, pct14DetectedFam14: false,
    pct14DetectedFgw14: false, pct14GatewayBaseId: '', writeBusPort: '', writeTargetGatewayKey: '',
    language: 'de', projectFilePath: '', projectFileName: '', projectActionsRef: { current: {} },
    isElectron: true, t: key => key, runtimeText: value => value, setTimeout: () => 0,
    window: { electronAPI: {
      saveProject: payload => handlers.get('save-project')(null, payload),
      saveProjectAs: payload => handlers.get('save-project-as')(null, payload),
      openProject: () => handlers.get('open-project')(null),
    } },
    ...initial,
  };
  for (const name of ['Step', 'Gateway', 'Devices', 'ExtraGateways', 'Form', 'EditIdx', 'Yaml', 'GeneratedGatewayBlocks',
    'ImportFam14Gateway', 'ImportFgw14Gateway', 'Pct14DetectedFam14', 'Pct14DetectedFgw14', 'Pct14GatewayBaseId',
    'WriteBusPort', 'WriteTargetGatewayKey', 'Errors', 'Copied', 'ImportMsg', 'MiniSafeImportMsg', 'DetectMsg',
    'LearnMsg', 'WriteSenderMsg', 'WriteSenderSummary', 'WriteSenderLog', 'ProjectFileName', 'ProjectFilePath', 'ProjectMsg']) {
    const key = name[0].toLowerCase() + name.slice(1);
    context['set' + name] = value => { context[key] = typeof value === 'function' ? value(context[key]) : value; };
  }
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const APP_VERSION'), source.indexOf('export default function App()'))
    + '\nthis.helpers = { normalizeLoadedDeviceProfile, createEmptyForm, profileFor };', context);
  Object.defineProperty(context, 'profile', { get: () => context.helpers.profileFor(context.form.eep) });
  const projectStart = source.indexOf('  const buildProjectDocument =');
  const projectEnd = source.indexOf('  useEffect(() => {', source.indexOf('  projectActionsRef.current =', projectStart));
  const formStart = source.indexOf('  const changeEep =');
  const formEnd = source.indexOf('  const handleImportFam14GatewayToggle', formStart);
  const gatewayStart = source.indexOf('  const buildActiveExtraGateways =');
  const gatewayEnd = source.indexOf('  // Keep an already generated YAML', gatewayStart);
  vm.runInContext(source.slice(projectStart, projectEnd) + source.slice(formStart, formEnd)
    + source.slice(gatewayStart, gatewayEnd)
    + '\nthis.actions = { handleSaveProject, handleSaveProjectAs, handleOpenProject, handleAdd, changeEep };', context);
  return context;
}

const fws = {
  name: 'Weather before edit', dev_id: '01-23-45-67', eep: 'A5-13-01', profile_key: 'A5-13-01',
  platform: 'sensor', device_type: 'FWS61', model: 'FWS61, FWG14MS', eltako: 'FWS61, FWG14MS',
  sender_id: '', sender_eep: '', room: 'Old room',
};
const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
  const file = path.join(temp, 'existing.eedtoy');
  fs.writeFileSync(file, 'OLD FILE');
  const app = renderer({ devices: [fws], form: { ...fws }, editIdx: 0, projectFilePath: file });
  app.actions.changeEep('A5-13-01-FWG14MS');
  app.form = { ...app.form, name: 'Wetter aktualisiert', room: 'Außen', fwg14ms_id_range: '2', bus_address: '00-00-00-3B' };
  await app.actions.handleSaveProject();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.state.devices[0].name, 'Wetter aktualisiert');
  assert.equal(saved.state.devices[0].room, 'Außen');
  assert.equal(saved.state.devices[0].profile_key, 'A5-13-01-FWG14MS');
  assert.equal(saved.state.devices[0].dev_id, '00-00-18-10');
  assert.equal(saved.state.devices[0].bus_address, '00-00-00-3B');
  assert(saved.state.yaml.includes('Wetter aktualisiert') && saved.state.yaml.includes('00-00-18-10'));
  assert(!saved.state.yaml.includes('OLD YAML'));
  dialogs.openPath = file;
  await app.actions.handleOpenProject();
  for (const [key, value] of Object.entries(saved.state.devices[0])) assert.deepEqual(plain(app.devices[0][key]), value, key);
  assert.equal(app.form.name, 'Wetter aktualisiert');
  assert.equal(app.form.fwg14ms_id_range, '2');
  console.log('PASS: actual project save/open IPC retains edited profile, ID, range, name, room and fresh YAML.');

  const fwsFile = path.join(temp, 'fws.eedtoy');
  const fwsApp = renderer({ devices: [{ ...fws, name: 'FWG14MS is only a free display name' }], projectFilePath: fwsFile });
  await fwsApp.actions.handleSaveProject();
  dialogs.openPath = fwsFile;
  await fwsApp.actions.handleOpenProject();
  assert.equal(fwsApp.devices[0].profile_key, 'A5-13-01');
  assert.equal(fwsApp.devices[0].dev_id, '01-23-45-67');
  assert.equal(fwsApp.devices[0].device_type, 'FWS61');
  console.log('PASS: an explicitly selected FWS61 is not converted to FWG14MS by old shared model text or its free name.');

  const before = fs.readFileSync(file, 'utf8');
  app.form = { ...app.form, dev_id: 'invalid ID' };
  // FWG14MS IDs are derived from the position, so invalidate its name instead.
  app.form.name = '';
  await app.actions.handleSaveProject();
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(app.projectMsg, 'project.invalidDeviceEdit');
  assert(Object.keys(app.errors).length > 0);
  console.log('PASS: invalid edits do not overwrite the file or report a false success.');

  const newFile = path.join(temp, 'new.eedtoy');
  dialogs.savePath = newFile;
  const newApp = renderer({ devices: [fws], form: { ...fws, name: 'Unconfirmed new device' }, editIdx: null });
  await newApp.actions.handleSaveProject();
  assert.equal(newApp.projectFilePath, newFile);
  assert.equal(JSON.parse(fs.readFileSync(newFile, 'utf8')).state.devices.length, 1);
  console.log('PASS: first Save uses Save As, while a new device still requires explicit Add.');

  const canceled = renderer({ devices: [fws], form: { ...fws, name: 'Canceled draft' }, editIdx: 0 });
  dialogs.cancelSave = true;
  await canceled.actions.handleSaveProjectAs();
  assert.equal(canceled.projectFilePath, '');
  assert.equal(canceled.devices[0].name, fws.name);
  dialogs.cancelSave = false;

  const legacy = JSON.parse(fs.readFileSync(fwsFile, 'utf8'));
  legacy.state.editIdx = 0;
  legacy.state.form = { ...fws, name: 'Draft from previous version', room: 'Recovered room' };
  fs.writeFileSync(fwsFile, JSON.stringify(legacy));
  dialogs.openPath = fwsFile;
  await fwsApp.actions.handleOpenProject();
  assert.equal(fwsApp.form.name, 'Draft from previous version');
  await fwsApp.actions.handleSaveProject();
  await fwsApp.actions.handleOpenProject();
  assert.equal(fwsApp.devices[0].name, 'Draft from previous version');
  assert.equal(fwsApp.devices[0].room, 'Recovered room');
  console.log('PASS: canceled Save As preserves state, and older saved edit forms can be recovered and saved correctly.');
  console.log('All project save/open roundtrip regressions passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
