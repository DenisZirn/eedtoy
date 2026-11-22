const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const start = mainSource.indexOf("const SENDER_WRITE_LOG_NAME = ");
const end = mainSource.indexOf("let activeWriteSenderProcess = null;", start);
assert(start > 0 && end > start, 'Automatic write-log helper must be present');
const source = mainSource.slice(start, end);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eedtoy-write-log-test-'));
const installDir = path.join(root, 'Install');
const userDir = path.join(root, 'UserData');
fs.mkdirSync(installDir, { recursive: true });
fs.mkdirSync(userDir, { recursive: true });
const realLog = path.join(installDir, 'EEDTOY-Schreibdiagnose.log');

const makeLogger = (fsImpl) => vm.runInNewContext(
  source + '\ncreateSenderWriteDiagnosticsLog;',
  {
    app: { getPath(name) {
      if (name === 'exe') return path.join(installDir, 'EEDTOY.exe');
      if (name === 'userData') return userDir;
      throw new Error('Unexpected app.getPath ' + name);
    } },
    isDev: false,
    path, fsSync: fsImpl, console,
  },
  { filename: 'main-write-log-helper.js' }
);

try {
  // Normal per-user installation: log next to EEDTOY.exe.
  let logger = makeLogger(fs)();
  assert.equal(logger.filePath, realLog);
  logger.write('PYTHON FD2G14 row read timeout base=41 row=14');
  logger.write('PYTHON FD2G14 retry new RS485 session');
  logger.close();
  assert.match(fs.readFileSync(realLog, 'utf8'), /row=14/);
  assert.match(fs.readFileSync(realLog, 'utf8'), /new RS485 session/);

  // Log rotation is bounded and retains previous diagnostic data.
  fs.writeFileSync(realLog, Buffer.alloc(5 * 1024 * 1024, 0x61));
  logger = makeLogger(fs)();
  logger.write('next run');
  logger.close();
  assert.equal(fs.statSync(realLog + '.1').size, 5 * 1024 * 1024);
  assert.match(fs.readFileSync(realLog, 'utf8'), /next run/);

  // Program Files may reject writes: fallback must use per-user directory.
  const deniedInstall = Object.create(fs);
  deniedInstall.openSync = (file, ...args) => {
    if (String(file).startsWith(installDir)) {
      const error = new Error('EACCES: install directory is not writable');
      error.code = 'EACCES';
      throw error;
    }
    return fs.openSync(file, ...args);
  };
  logger = makeLogger(deniedInstall)();
  assert.equal(logger.filePath, path.join(userDir, 'EEDTOY-Schreibdiagnose.log'));
  logger.write('fallback works');
  logger.close();
  assert.match(fs.readFileSync(logger.filePath, 'utf8'), /fallback works/);

  // Both folders unavailable: report error, never crash the sender writer.
  const nowhere = Object.create(fs);
  nowhere.openSync = () => {
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  };
  logger = makeLogger(nowhere)();
  assert.equal(logger.filePath, '');
  assert.match(logger.error, /EACCES/);
  logger.write('no-op');
  logger.close();

  assert(mainSource.includes("diagnostics.write('PYTHON ' + line)"),
    'Python stderr lines must be written as they arrive');
  assert(mainSource.includes("diagnostics.write('PYTHON RESULT '"),
    'Final Python result must be logged');
  assert(mainSource.includes("diagnostics.write('EVENT '"),
    'Final sender-write events must be logged');
  assert(mainSource.includes('diagnostics.close();'),
    'Diagnostic file must close at the end of each run');
  assert(uiSource.includes('writeSenderDiagnosticPath'),
    'Actual log path must be exposed to the user');
  assert(uiSource.includes('writeSenderDiagnosticError'),
    'Log write failures must be visible');

  console.log('PASS: continuous sender-write diagnostics, log rotation, Windows install-folder fallback and UI path');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
