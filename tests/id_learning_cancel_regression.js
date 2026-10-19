const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { transformSync } = require('esbuild');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

const timers = new Set();
class FakeChild extends EventEmitter {
  constructor(args) {
    super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter(); this.args = args; this.killCalls = 0;
  }
  kill() { this.killCalls += 1; return true; }
  complete(result) {
    if (result) this.stdout.emit('data', Buffer.from(JSON.stringify(result) + '\n'));
    this.emit('close', result?.ok ? 0 : 1);
  }
}
class FakePort extends EventEmitter {
  constructor(options) { super(); this.options = options; this.isOpen = false; this.closeCalls = 0; ports.push(this); }
  open(callback) { this.openCallback = callback; }
  opened() { this.isOpen = true; this.openCallback(null); }
  close(callback) { this.closeCalls += 1; this.closeCallback = callback; }
  closed() { this.isOpen = false; this.closeCallback(); }
}
const children = [];
const ports = [];
const handlers = new Map();
const context = {
  console:{ log() {}, error() {} }, Buffer, AbortController, process,
  getPythonLearnScriptPath:() => '/test/learn.py', getPythonScriptCwd:() => '/test',
  getPythonCommands:async () => ({ commands:[{ cmd:'python.exe', args:['-I', '/test/learn.py'] }], setup:{ attempts:[] } }),
  gatewaySerialParamsForLearning:() => ({ baudRate:57600, protocol:'esp2' }),
  parseLearnIdFromBuffer:() => ({ id:'01-02-03-04', rorg:'F6', protocol:'esp2' }),
  learnIdMatchesFilter:parsed => Boolean(parsed?.id),
  require(name) {
    if (name === 'child_process') return { spawn:(_, args) => { const child = new FakeChild(args); children.push(child); return child; } };
    if (name === 'serialport') return { SerialPort:FakePort };
    throw new Error('Unexpected module: ' + name);
  },
  setTimeout(callback, delay) { const handle = setTimeout(callback, delay); timers.add(handle); return handle; },
  clearTimeout(handle) { clearTimeout(handle); timers.delete(handle); },
  ipcMain:{ handle:(channel, handler) => handlers.set(channel, handler) },
};
vm.createContext(context);
vm.runInContext(main.slice(main.indexOf('const activeIdLearningRequests ='), main.indexOf('let activeWriteSenderProcess =')), context);
vm.runInContext(main.slice(main.indexOf('function listenForLearnTelegram('), main.indexOf('function parseFts14emRpsFrame(')), context);
vm.runInContext(main.slice(main.indexOf("ipcMain.handle('learn-device-id'"), main.indexOf("ipcMain.handle('read-base-id'")), context);
const learn = handlers.get('learn-device-id');
const learnFts = handlers.get('learn-fts14em-base-id');
const cancel = handlers.get('cancel-learn-device-id');
const makeOwner = id => Object.assign(new EventEmitter(), { id, sent:[], send(channel, payload) { this.sent.push({ channel, payload }); } });
const owner = makeOwner(10);
const event = { sender:owner };

async function testMainProcess() {
  const first = learn(event, 'COM3', 'fam14', 20000, 1, 'radio-rps');
  await tick();
  assert.equal(children.length, 1);
  assert(children[0].args.includes('--filter') && children[0].args.includes('radio-rps'), 'Selected radio filter reaches the Python receiver');
  const stopped = cancel(event, 1);
  let cancelFinished = false;
  stopped.then(() => { cancelFinished = true; });
  await tick();
  assert.equal(children[0].killCalls, 1, 'Cancellation terminates the Python receiver');
  assert.equal(cancelFinished, false, 'Cancellation waits until the receiver has exited');
  assert.equal((await learn(event, 'COM3', 'fam14', 20000, 2)).busy, true, 'Another request cannot reopen the port while its receiver is stopping');
  children[0].complete({ ok:true, id:'AA-BB-CC-DD' });
  assert.equal((await first).canceled, true, 'A late Python success is discarded after cancellation');
  assert.equal((await stopped).ok, true);
  assert.equal(ports.length, 0, 'Cancellation does not start the serial fallback');

  const second = learn(event, 'COM3', 'fam14', 20000, 2);
  await tick();
  assert.equal((await cancel({ sender:makeOwner(11) }, 2)).canceled, false, 'A different window cannot cancel this search');
  assert.equal((await cancel(event, 1)).canceled, false, 'An old request ID cannot cancel a new search');
  assert.equal(children[1].killCalls, 0);
  children[1].complete({ ok:true, id:'01-02-03-04' });
  assert.equal((await second).id, '01-02-03-04', 'A search can restart immediately after a completed cancellation');

  const fts = learnFts(event, 'COM3', 'fgw14usb', 30000, 3);
  await tick();
  const ftsChild = children.at(-1);
  assert(ftsChild.args.includes('--repeat-count') && ftsChild.args.includes('5'), 'FTS14EM still requires five presses');
  ftsChild.stderr.emit('data', Buffer.from('[python-learn-progress] {"id":"00-00-10-01","count":2}\n'));
  assert.equal(owner.sent.at(-1).payload.requestId, 3, 'Progress belongs to its exact learning request');
  const ftsStopped = cancel(event, 3);
  const sentCount = owner.sent.length;
  ftsChild.stderr.emit('data', Buffer.from('[python-learn-progress] {"id":"00-00-10-01","count":5}\n'));
  assert.equal(owner.sent.length, sentCount, 'Canceled FTS14EM requests do not forward late progress');
  ftsChild.complete();
  assert.equal((await fts).canceled, true);
  await ftsStopped;

  const originalSetup = context.getPythonCommands;
  const delayedSetup = deferred();
  context.getPythonCommands = () => delayedSetup.promise;
  const spawnCount = children.length;
  const settingUp = learn(event, 'COM3', 'fam14', 20000, 4);
  await tick();
  await cancel(event, 4);
  assert.equal((await settingUp).canceled, true, 'A request can be canceled during Python runtime preparation');
  delayedSetup.resolve(await originalSetup());
  await tick();
  assert.equal(children.length, spawnCount, 'Canceled runtime preparation never starts a receiver later');
  context.getPythonCommands = originalSetup;

  const fallback = learn(event, 'COM3', 'fam14', 20000, 5);
  await tick();
  children.at(-1).complete({ ok:false, error:'Python unavailable' });
  await tick();
  const openingPort = ports.at(-1);
  assert(openingPort, 'Ordinary Python failures still use the serial fallback');
  const portStopped = cancel(event, 5);
  let portCancelFinished = false;
  portStopped.then(() => { portCancelFinished = true; });
  await tick();
  assert.equal(portCancelFinished, false, 'Cancel while opening waits for the open callback');
  openingPort.opened();
  assert.equal(openingPort.closeCalls, 1, 'A late-opened serial handle is immediately closed');
  openingPort.emit('data', Buffer.from('late telegram'));
  await tick();
  assert.equal(portCancelFinished, false, 'Cancellation waits for the port close callback');
  openingPort.closed();
  assert.equal((await fallback).canceled, true);
  await portStopped;

  const rawSuccess = learn(event, 'COM3', 'fam14', 20000, 6);
  await tick();
  children.at(-1).complete({ ok:false, error:'Python unavailable' });
  await tick();
  const openPort = ports.at(-1);
  openPort.opened();
  openPort.emit('data', Buffer.from('telegram'));
  assert.equal(openPort.closeCalls, 1);
  openPort.closed();
  assert.equal((await rawSuccess).id, '01-02-03-04', 'Uncanceled serial learning still returns its detected ID');

  const onClose = learn(event, 'COM3', 'fam14', 20000, 7);
  await tick();
  const lastChild = children.at(-1);
  owner.emit('destroyed');
  assert.equal(lastChild.killCalls, 1, 'Closing a learning window terminates its receiver');
  lastChild.complete();
  assert.equal((await onClose).canceled, true);
  assert.equal(owner.listenerCount('destroyed'), 0);
  assert.equal(timers.size, 0, 'Completed requests clean up their timeout handles');
  console.log('PASS: Python/serial cancellation, port cleanup, setup cancellation, late messages, isolated requests and restart.');
}

function makeRenderer() {
  const calls = [];
  const cancellations = [];
  const state = { learning:false, target:'', canceling:false, message:'', messageTarget:'device', form:{ eep:'F6-02-01-2CH', dev_id:'AA-BB-CC-DD', physical_unique_id:'11-22-33-44' } };
  const renderer = {
    isElectron:true, language:'de', gateway:{ serial_path:'COM3', type:'fam14' }, devices:[],
    form:state.form,
    learnRequestRef:{ current:null }, learnRequestSequenceRef:{ current:0 }, learnMessageTimerRef:{ current:null },
    setLearningId:value => { state.learning = value; },
    setLearningIdTarget:value => { state.target = value; },
    setCancelingLearnId:value => { state.canceling = value; },
    setLearnMsg:value => { state.message = value; },
    setLearnMsgTarget:value => { state.messageTarget = value; },
    setForm:update => { state.form = update(state.form); renderer.form = state.form; },
    setErrors() {}, t:(key, values) => key + (values ? ':' + JSON.stringify(values) : ''), runtimeText:value => value,
    normalizeId:value => value, fts14emRangeForBaseId:() => '1',
    profileFor:key => ({ device_family:key.includes('FTS14EM') ? 'FTS14EM' : '' }),
    idLearningFilterForProfile:key => key.startsWith('A5') ? 'radio-4bs' : 'radio-rps',
    setTimeout:() => 1, clearTimeout() {}, useEffect() {},
    window:{ electronAPI:{
      learnDeviceId(...args) { const task = { ...deferred(), args }; calls.push(task); return task.promise; },
      learnFts14emBaseId(...args) { const task = { ...deferred(), args }; calls.push(task); return task.promise; },
      cancelLearnDeviceId(id) { const task = { ...deferred(), id }; cancellations.push(task); return task.promise; },
      onFts14emLearnProgress(callback) { renderer.progress = callback; return () => { renderer.unsubscribed = true; }; },
    } },
  };
  vm.createContext(renderer);
  const start = app.indexOf('  const showLearnMessage = ');
  const end = app.indexOf('  const profile = profileFor(form.eep);', start);
  vm.runInContext(app.slice(start, end) + '\nthis.actions = { handleLearnDeviceId, handleCancelLearnDeviceId, handleLearnFts14emBaseId, handleLearnF4usmPhysicalId };', renderer);
  return { renderer, state, calls, cancellations, actions:renderer.actions };
}

async function testRenderer() {
  const { renderer, state, calls, cancellations, actions } = makeRenderer();
  const first = actions.handleLearnDeviceId();
  assert.equal(state.target, 'device');
  assert.equal(calls[0].args[4], 'radio-rps', 'Selected profile filter travels with the cancellable learning request');
  await actions.handleLearnDeviceId();
  assert.equal(calls.length, 1, 'Rapid double clicks cannot start a second receiver');
  const stopped = actions.handleCancelLearnDeviceId();
  await actions.handleCancelLearnDeviceId();
  assert.equal(cancellations.length, 1, 'Rapid repeated cancel clicks send one cancellation');
  assert.equal(state.canceling, true);
  assert.equal(state.learning, true, 'The button cannot restart a search until the receiver is closed');
  calls[0].resolve({ ok:true, id:'FF-FF-FF-FF' });
  await first;
  assert.equal(state.form.dev_id, 'AA-BB-CC-DD', 'Canceled detection never changes the ID field');
  assert.equal(state.learning, true, 'A late success does not prematurely unlock a stopping search');
  cancellations[0].resolve({ ok:true });
  await stopped;
  assert.equal(state.learning, false);
  assert.equal(state.target, '');
  assert.equal(state.canceling, false);
  assert.equal(state.message, 'status.learnCanceled');
  assert.equal(state.messageTarget, 'device');
  const second = actions.handleLearnDeviceId();
  calls[1].resolve({ ok:true, id:'01-02-03-04' });
  await second;
  assert.equal(state.form.dev_id, '01-02-03-04');
  assert.equal(state.learning, false);

  const battery = actions.handleLearnF4usmPhysicalId();
  assert.equal(state.target, 'battery');
  assert.equal(calls[2].args[4], 'radio-4bs', 'Battery ID learning also excludes unrelated bus IDs and telegram types');
  const stopBattery = actions.handleCancelLearnDeviceId();
  cancellations.at(-1).resolve({ ok:true });
  await stopBattery;
  assert.equal(state.messageTarget, 'battery', 'A completed battery cancellation stays associated with the battery field');
  const nextSearch = actions.handleLearnDeviceId();
  calls[2].resolve({ ok:true, id:'05-05-05-05' });
  await battery;
  assert.equal(state.form.physical_unique_id, '11-22-33-44', 'Late battery detection does not change the battery ID');
  assert.equal(state.learning, true, 'Completion of an old request cannot reset the newer request');
  assert.equal(state.messageTarget, 'device', 'A late battery result cannot move the current device message to the battery field');
  calls[3].resolve({ ok:true, id:'06-06-06-06' });
  await nextSearch;

  renderer.form.eep = 'F6-02-01-FTS14EM-UT';
  const fts = actions.handleLearnFts14emBaseId();
  const requestId = calls.at(-1).args[3];
  renderer.progress({ requestId, count:2, id:'00-00-10-01' });
  assert(state.message.includes('2/5'));
  const message = state.message;
  renderer.progress({ requestId:requestId - 1, count:5, id:'00-00-10-01' });
  assert.equal(state.message, message, 'Progress from an earlier search is ignored');
  const stopFts = actions.handleCancelLearnDeviceId();
  assert.equal(renderer.unsubscribed, true, 'Cancel immediately removes the progress listener');
  renderer.progress({ requestId, count:5, id:'00-00-10-01' });
  assert.equal(state.message, 'status.learnCanceling');
  cancellations.at(-1).resolve({ ok:true });
  await stopFts;
  calls.at(-1).resolve({ ok:true, id:'00-00-10-01' });
  await fts;
  assert.equal(state.form.dev_id, '06-06-06-06');

  const rejected = actions.handleLearnDeviceId();
  const rejectedCancel = actions.handleCancelLearnDeviceId();
  cancellations.at(-1).resolve({ ok:false, error:'Cannot stop receiver' });
  await rejectedCancel;
  assert.equal(state.learning, true, 'A failed cancellation does not pretend to release the receiver');
  calls.at(-1).resolve({ ok:true, id:'07-07-07-07' });
  await rejected;
  assert.equal(state.form.dev_id, '06-06-06-06', 'Clicking cancel suppresses late IDs even if the cancellation call fails');
  assert.equal(state.learning, false);

  assert(app.includes('learningIdTarget === "device" ? handleCancelLearnDeviceId'), 'Primary ID button toggles to cancel');
  assert(app.includes('learningIdTarget === "battery" ? handleCancelLearnDeviceId'), 'Battery button toggles to cancel');
  assert(app.includes('disabled={cancelingLearnId || (learningId && learningIdTarget !== "device")}'), 'The active ID button remains clickable for cancellation');
  console.log('PASS: Button lifecycle, repeated clicks, late results, battery IDs, FTS14EM progress and cancellation errors.');
}

// Compile the actual device-ID field JSX so this regression exercises the
// rendered button bindings and message placement, not only isolated handlers.
const fieldsStart = app.indexOf('                  <label>{t("devices.deviceId")}</label>');
const fieldsEnd = app.indexOf('                </div>\n                <div>\n                  <label>{t("devices.roomOptional")}', fieldsStart);
assert(fieldsStart >= 0 && fieldsEnd > fieldsStart, 'Device-ID fields found');
const fieldModule = { exports:{} };
const fieldCode = transformSync(`module.exports = function renderFields(scope) {
  const { profile, form, errors, setForm, setErrors, learningIdTarget, cancelingLearnId, learningId,
    learnMsg, learnMsgTarget, t, language, handleCancelLearnDeviceId, handleLearnFts14emBaseId,
    handleLearnDeviceId, handleLearnF4usmPhysicalId } = scope;
  return <div>${app.slice(fieldsStart, fieldsEnd)}</div>;
}`, { loader:'jsx', format:'cjs', jsx:'automatic' }).code;
vm.runInNewContext(fieldCode, { module:fieldModule, require });

function flattenElements(element, output = []) {
  if (Array.isArray(element)) element.forEach(child => flattenElements(child, output));
  else if (element?.props) {
    output.push(element);
    flattenElements(element.props.children, output);
  }
  return output;
}

async function testRenderedIdFields() {
  const { renderer, state, calls, cancellations, actions } = makeRenderer();
  renderer.form.eep = 'F6-02-01-F4USM61B-M1';
  function render() {
    const tree = fieldModule.exports({
      ...renderer, ...actions, profile:{ device_family:'F4USM61B', operating_mode:1 }, errors:{},
      form:state.form, learningIdTarget:state.target, cancelingLearnId:state.canceling, learningId:state.learning,
      learnMsg:state.message, learnMsgTarget:state.messageTarget,
    });
    const elements = flattenElements(tree);
    return { html:renderToStaticMarkup(tree), buttons:elements.filter(element => element.type === 'button'),
      inputs:elements.filter(element => element.type === 'input'), statuses:elements.filter(element => element.props.role === 'status') };
  }
  function assertStatus(target) {
    const view = render();
    assert.equal(view.statuses.length, 1, 'Only the relevant ID field has a status message');
    assert.equal(view.statuses[0].props.id, `${target}-id-learning-status`);
    assert.equal(view.inputs[target === 'device' ? 0 : 1].props['aria-describedby'], `${target}-id-learning-status`);
    assert.equal(view.inputs[target === 'device' ? 1 : 0].props['aria-describedby'], undefined);
    const statusPosition = view.html.indexOf(`id="${target}-id-learning-status"`);
    const batteryLabelPosition = view.html.indexOf('Batterie-ID</label>');
    if (target === 'device') assert(statusPosition < batteryLabelPosition, 'Device status is above the separate battery field');
    else assert(statusPosition > batteryLabelPosition, 'Battery status is inside the separate battery section');
    return view;
  }

  const device = render().buttons[0].props.onClick();
  assert.equal(state.target, 'device');
  assert.equal(calls.length, 1, 'Clicking the normal button starts exactly one device request');
  assert.equal(calls[0].args[4], 'radio-rps');
  assert(!state.message.includes('Batterie-ID'));
  let view = assertStatus('device');
  assert.equal(view.buttons[0].props.children, 'common.cancel');
  assert.equal(view.buttons[1].props.disabled, true, 'The battery button remains inactive during normal ID detection');
  calls[0].resolve({ ok:true, id:'FE-EF-D6-D5' });
  await device;
  assert.equal(state.form.dev_id, 'FE-EF-D6-D5');
  assert.equal(state.form.physical_unique_id, '11-22-33-44', 'Normal ID detection leaves the battery ID untouched');
  assertStatus('device');

  const battery = render().buttons[1].props.onClick();
  assert.equal(state.target, 'battery');
  assert.equal(calls[1].args[4], 'radio-4bs');
  assert(state.message.includes('Batterie-ID'));
  view = assertStatus('battery');
  assert.equal(view.buttons[1].props.children, 'common.cancel');
  assert.equal(view.buttons[0].props.disabled, true);
  calls[1].resolve({ ok:true, id:'05-A9-8E-FA' });
  await battery;
  assert.equal(state.form.physical_unique_id, '05-A9-8E-FA');
  assert.equal(state.form.dev_id, 'FE-EF-D6-D5', 'Battery detection leaves the normal ID untouched');
  assertStatus('battery');

  for (const [target, index] of [['device', 0], ['battery', 1]]) {
    const pending = render().buttons[index].props.onClick();
    const stopping = render().buttons[index].props.onClick();
    assertStatus(target);
    calls.at(-1).resolve({ ok:false, canceled:true });
    await pending;
    cancellations.at(-1).resolve({ ok:true });
    await stopping;
    assert.equal(state.target, '', 'The receiver is no longer active after cancellation');
    assert.equal(state.message, 'status.learnCanceled');
    assertStatus(target);

    const failed = render().buttons[index].props.onClick();
    calls.at(-1).resolve({ ok:false, error:'No matching telegram' });
    await failed;
    assertStatus(target);
  }

  renderer.gateway.serial_path = '';
  await render().buttons[1].props.onClick();
  assertStatus('battery');
  await render().buttons[0].props.onClick();
  assertStatus('device');
  console.log('PASS: Actual F4USM61B field rendering, separate button actions, status placement, result fields, cancellation and errors.');
}

(async () => {
  await testMainProcess();
  await testRenderer();
  await testRenderedIdFields();
  console.log('All cancellable ID-learning regression tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const timer of timers) clearTimeout(timer);
});
