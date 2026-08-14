const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { mainText, normalizeLanguage } = require('./i18n-main');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Windows uses the AppUserModelID to associate the running window/taskbar
// entry with the packaged executable and its icon. Without this, Windows can
// show a generic Electron/default icon in some places.
if (process.platform === 'win32') {
  app.setAppUserModelId('io.github.deniszeltako.eedtoy');
}

function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, '../public/icon.ico');
}



let mainWindow = null;
let deviceDatabaseWindow = null;
let currentLanguage = 'de';

function t(key, variables = {}) {
  return mainText(currentLanguage, key, variables);
}

function languageFilePath() {
  return path.join(app.getPath('userData'), 'language.txt');
}

function deviceDatabaseFilePath() {
  return path.join(app.getPath('userData'), 'device-database.json');
}

async function loadDeviceDatabase() {
  try {
    const raw = await fs.readFile(deviceDatabaseFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function saveDeviceDatabase(database) {
  const safe = database && typeof database === 'object' && !Array.isArray(database) ? database : {};
  const target = deviceDatabaseFilePath();
  const temporary = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify(safe, null, 2), 'utf8');
  await fs.rename(temporary, target);
  const raw = await fs.readFile(target, 'utf8');
  const verified = JSON.parse(raw);
  if (!verified || typeof verified !== 'object' || Array.isArray(verified)) {
    throw new Error('Saved device database is invalid.');
  }
  return verified;
}

async function loadLanguage() {
  const candidates = [
    languageFilePath(),
    path.join(process.env.APPDATA || '', 'eedtoy', 'language.txt'),
  ];
  for (const candidate of candidates) {
    try {
      const value = (await fs.readFile(candidate, 'utf8')).trim();
      if (value) return normalizeLanguage(value);
    } catch (_) {}
  }
  return normalizeLanguage(app.getLocale());
}

async function persistLanguage(language) {
  currentLanguage = normalizeLanguage(language);
  await fs.mkdir(path.dirname(languageFilePath()), { recursive: true });
  await fs.writeFile(languageFilePath(), currentLanguage, 'utf8');
}

function sendMenuAction(action, targetWindow = mainWindow) {
  if (targetWindow && !targetWindow.isDestroyed()) targetWindow.webContents.send('menu-action', action);
}

function buildDeviceDatabaseMenu() {
  const template = [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.deviceDbImport'), accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('device-db-import', deviceDatabaseWindow) },
        { label: t('menu.deviceDbExport'), accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('device-db-export', deviceDatabaseWindow) },
        { type: 'separator' },
        { label: t('menu.closeWindow'), role: 'close' },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), role: 'undo' }, { label: t('menu.redo'), role: 'redo' }, { type: 'separator' },
        { label: t('menu.cut'), role: 'cut' }, { label: t('menu.copy'), role: 'copy' }, { label: t('menu.paste'), role: 'paste' },
        { label: t('menu.selectAll'), role: 'selectAll' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildApplicationMenu() {
  const template = [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open-project') },
        { label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save-project') },
        { label: t('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('save-project-as') },
        { type: 'separator' },
        { label: t('menu.exit'), role: 'quit' },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), role: 'undo' }, { label: t('menu.redo'), role: 'redo' }, { type: 'separator' },
        { label: t('menu.cut'), role: 'cut' }, { label: t('menu.copy'), role: 'copy' }, { label: t('menu.paste'), role: 'paste' },
        { label: t('menu.selectAll'), role: 'selectAll' }, { type: 'separator' },
        { label: t('menu.deviceDatabase'), click: () => createDeviceDatabaseWindow() }, { type: 'separator' },
        {
          label: t('menu.language'),
          submenu: [
            { label: 'Deutsch', type: 'radio', checked: currentLanguage === 'de', click: () => changeLanguage('de') },
            { label: 'English', type: 'radio', checked: currentLanguage === 'en', click: () => changeLanguage('en') },
          ],
        },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.about'), click: () => showAboutDialog() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function changeLanguage(language) {
  await persistLanguage(language);
  if (deviceDatabaseWindow && !deviceDatabaseWindow.isDestroyed() && deviceDatabaseWindow.isFocused()) buildDeviceDatabaseMenu();
  else buildApplicationMenu();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('language-changed', currentLanguage);
  if (deviceDatabaseWindow && !deviceDatabaseWindow.isDestroyed()) deviceDatabaseWindow.webContents.send('language-changed', currentLanguage);
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: t('menu.aboutTitle'),
    message: 'EEDTOY – ELTAKO EnOcean Device to YAML Generator',
    detail: t('about.detail', { version: app.getVersion() }),
    buttons: ['OK'],
    icon: getAppIconPath(),
  });
}

const PROJECT_FORMAT = 'eedtoy-project';
const PROJECT_SCHEMA_VERSION = 1;
const MAX_PROJECT_SIZE_BYTES = 10 * 1024 * 1024;

function safeProjectFileName(value) {
  const base = String(value || t('project.defaultName'))
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim();
  return base || t('project.defaultName');
}

function validateProjectDocument(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error(t('project.invalidDocument'));
  }
  if (project.project_format !== PROJECT_FORMAT) {
    throw new Error(t('project.wrongFormat'));
  }
  const schemaVersion = Number(project.schema_version || 0);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error(t('project.invalidSchema'));
  }
  if (schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(t('project.unsupportedSchema', { schema: schemaVersion, maxSchema: PROJECT_SCHEMA_VERSION }));
  }
  if (!project.state || typeof project.state !== 'object' || Array.isArray(project.state)) {
    throw new Error(t('project.missingState'));
  }
  if (!Array.isArray(project.state.devices)) {
    throw new Error(t('project.invalidDevices'));
  }
  if (!project.state.gateway || typeof project.state.gateway !== 'object' || Array.isArray(project.state.gateway)) {
    throw new Error(t('project.invalidGateway'));
  }
}

ipcMain.handle('save-project-as', async (_event, payload = {}) => {
  try {
    const project = payload.project;
    validateProjectDocument(project);
    const suggestedName = safeProjectFileName(payload.suggestedName || payload.currentFileName || t('project.defaultName'));
    const defaultPath = suggestedName.toLowerCase().endsWith('.eedtoy') ? suggestedName : `${suggestedName}.eedtoy`;
    const result = await dialog.showSaveDialog({
      title: t('project.saveDialogTitle'),
      defaultPath,
      filters: [
        { name: t('project.filterProject'), extensions: ['eedtoy'] },
        { name: t('project.filterJson'), extensions: ['json'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    let filePath = result.filePath;
    if (!path.extname(filePath)) filePath += '.eedtoy';
    const serialized = JSON.stringify(project, null, 2) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_SIZE_BYTES) {
      throw new Error(t('project.tooLargeToSave'));
    }
    await fs.writeFile(filePath, serialized, 'utf8');
    return { ok: true, path: filePath, fileName: path.basename(filePath) };
  } catch (error) {
    console.error('[save-project-as]', error);
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('save-project', async (_event, payload = {}) => {
  try {
    const project = payload.project;
    validateProjectDocument(project);
    const targetPath = String(payload.path || '').trim();
    if (!targetPath) return { ok: false, needsSaveAs: true };
    const serialized = JSON.stringify(project, null, 2) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_SIZE_BYTES) {
      throw new Error(t('project.tooLargeToSave'));
    }
    await fs.writeFile(targetPath, serialized, 'utf8');
    return { ok: true, path: targetPath, fileName: path.basename(targetPath) };
  } catch (error) {
    console.error('[save-project]', error);
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('get-language', async () => currentLanguage);
ipcMain.handle('set-language', async (_event, language) => {
  await changeLanguage(language);
  return { ok: true, language: currentLanguage };
});

ipcMain.handle('open-project', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: t('project.openDialogTitle'),
      filters: [
        { name: t('project.filterProject'), extensions: ['eedtoy', 'json'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };

    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_PROJECT_SIZE_BYTES) {
      throw new Error(t('project.tooLargeToOpen'));
    }
    const raw = await fs.readFile(filePath, 'utf8');
    let project;
    try {
      project = JSON.parse(raw);
    } catch (error) {
      throw new Error(t('project.invalidJson', { error: error.message || error }));
    }
    validateProjectDocument(project);
    return { ok: true, path: filePath, fileName: path.basename(filePath), project };
  } catch (error) {
    console.error('[open-project]', error);
    return { ok: false, error: error.message || String(error) };
  }
});

function attachNativeEditContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const hasSelection = Boolean(params.selectionText && params.selectionText.length > 0);
    const template = [];

    if (params.isEditable) {
      template.push(
        { label: t('menu.cut'), role: 'cut', enabled: hasSelection },
        { label: t('menu.copy'), role: 'copy', enabled: hasSelection },
        { label: t('menu.paste'), role: 'paste' },
        { type: 'separator' },
        { label: t('menu.selectAll'), role: 'selectAll' },
      );
    } else if (hasSelection) {
      template.push(
        { label: t('menu.copy'), role: 'copy' },
        { type: 'separator' },
        { label: t('menu.selectAll'), role: 'selectAll' },
      );
    }

    if (template.length) Menu.buildFromTemplate(template).popup({ window: win });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 850, minWidth: 800, minHeight: 600,
    icon: getAppIconPath(),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'EEDTOY – ELTAKO EnOcean Device to YAML Generator',
    backgroundColor: '#080d18',
  });
  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  attachNativeEditContextMenu(win);

  const showMainWindow = () => {
    if (!win.isDestroyed()) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  };

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[startup] did-fail-load', errorCode, errorDescription, validatedURL);
    showMainWindow();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[startup] render-process-gone', details);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error('[renderer]', message, `${sourceId}:${line}`);
  });

  if (isDev) {
    win.loadURL('http://localhost:5173').catch(error => console.error('[startup] loadURL failed', error));
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html')).catch(error => console.error('[startup] loadFile failed', error));
  }
  win.once('ready-to-show', showMainWindow);
  win.webContents.once('did-finish-load', () => setTimeout(showMainWindow, 50));
  setTimeout(showMainWindow, 1500);
}

function createDeviceDatabaseWindow() {
  if (deviceDatabaseWindow && !deviceDatabaseWindow.isDestroyed()) {
    if (deviceDatabaseWindow.isMinimized()) deviceDatabaseWindow.restore();
    deviceDatabaseWindow.show();
    deviceDatabaseWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 900, minHeight: 650,
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    icon: getAppIconPath(),
    title: t('menu.deviceDatabase'),
    backgroundColor: '#eef2f5',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  deviceDatabaseWindow = win;
  win.on('focus', () => buildDeviceDatabaseMenu());
  win.on('closed', () => {
    if (deviceDatabaseWindow === win) deviceDatabaseWindow = null;
    buildApplicationMenu();
  });
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.on('focus', buildApplicationMenu);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  attachNativeEditContextMenu(win);
  if (isDev) {
    win.loadURL('http://localhost:5173/?window=device-database').catch(error => console.error('[device-database] loadURL failed', error));
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'device-database' } }).catch(error => console.error('[device-database] loadFile failed', error));
  }
  win.once('ready-to-show', () => { if (!win.isDestroyed()) { win.show(); win.focus(); } });
}


let lastBusDisconnectInfo = null;

function rememberBusConnection(portPath, gatewayType, baudRate = 57600) {
  const type = String(gatewayType || '').toLowerCase();
  const port = String(portPath || '').trim();
  if (!port || !['fam14', 'fgw14usb'].includes(type)) return;
  lastBusDisconnectInfo = { portPath: port, gatewayType: type, baudRate: baudRate || 57600, at: Date.now() };
}

function sendBusDisconnect(portPath, gatewayType = 'fam14', baudRate = 57600, options = {}) {
  return new Promise((resolve) => {
    const type = String(gatewayType || '').toLowerCase();
    const portName = String(portPath || '').trim();
    if (!portName) return resolve({ ok: false, error: 'Kein COM-Port eingetragen.' });

    if (!['fam14', 'fgw14usb'].includes(type)) {
      return resolve({ ok: true, skipped: true, message: 'Für diesen Gateway-Typ ist kein RS485-Bus-Disconnect notwendig.' });
    }

    let port;
    try {
      const { SerialPort } = require('serialport');
      port = new SerialPort({ path: portName, baudRate: baudRate || 57600, autoOpen: false });
    } catch (e) {
      return resolve({ ok: false, error: 'SerialPort Fehler: ' + (e.message || e) });
    }

    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const done = () => resolve(result);
      try {
        if (port?.isOpen) port.close(() => setTimeout(done, options.closeDelayMs || 120));
        else done();
      } catch (_) { done(); }
    };

    const timer = setTimeout(() => finish({ ok: false, error: 'Timeout beim Bus-Disconnect.' }), options.timeoutMs || 2500);

    port.on('error', err => finish({ ok: false, error: 'Serieller Fehler beim Disconnect: ' + (err.message || err) }));
    port.open((err) => {
      if (err) return finish({ ok: false, error: `Port ${portName} konnte nicht geöffnet werden: ${err.message || err}` });
      const frame = buildEltakoBusUnlock();
      console.log('[disconnect-gateway] TX bus unlock', portName, baudRate || 57600, frame.toString('hex').match(/../g).join(' '));
      port.write(frame, (writeErr) => {
        if (writeErr) return finish({ ok: false, error: 'Bus-Disconnect konnte nicht gesendet werden: ' + (writeErr.message || writeErr) });
        try {
          port.drain(() => finish({ ok: true, portPath: portName, gatewayType: type, baudRate: baudRate || 57600, message: 'RS485-Bus wurde freigegeben und der COM-Port geschlossen.' }));
        } catch (_) {
          finish({ ok: true, portPath: portName, gatewayType: type, baudRate: baudRate || 57600, message: 'RS485-Bus wurde freigegeben und der COM-Port geschlossen.' });
        }
      });
    });
  });
}

// ── List serial ports ─────────────────────────────────────────────
ipcMain.handle('list-ports', async () => {
  const { ports } = await listSerialPortsRobust();
  return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer || '', vendorId: p.vendorId || '', source: p.source || '' }));
});


function normalizePortInfo(p, source = 'serialport') {
  return {
    path: p.path || p.DeviceID || p.deviceId || '',
    manufacturer: p.manufacturer || p.Manufacturer || p.Description || '',
    vendorId: p.vendorId || '',
    productId: p.productId || '',
    serialNumber: p.serialNumber || '',
    source,
  };
}

function uniquePorts(ports) {
  const seen = new Set();
  return ports.filter(p => {
    if (!p.path) return false;
    const key = p.path.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function listSerialPortsRobust(extraPath = '') {
  const found = [];
  let listError = '';

  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    found.push(...ports.map(p => normalizePortInfo(p, 'serialport')));
  } catch (e) {
    listError = e.message || String(e);
    console.error('[list-ports] SerialPort.list failed:', e);
  }

  // Windows fallback: some USB/COM drivers are visible through WMI/CIM even when
  // serialport.list() returns an empty array.
  if (process.platform === 'win32') {
    try {
      const { execFileSync } = require('child_process');
      const ps = "Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Description,Manufacturer,PNPDeviceID | ConvertTo-Json -Compress";
      const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 2500 });
      const trimmed = raw.trim();
      if (trimmed) {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of arr) {
          if (item?.DeviceID) found.push(normalizePortInfo({ path: item.DeviceID, manufacturer: item.Description || item.Manufacturer || '', serialNumber: item.PNPDeviceID || '' }, 'windows-cim'));
        }
      }
    } catch (e) {
      console.error('[list-ports] Windows CIM fallback failed:', e.message || e);
    }
  }

  if (extraPath && String(extraPath).trim()) {
    const manualPath = String(extraPath).trim();
    // Do not carry over Linux defaults such as /dev/ttyUSB0 on Windows.
    if (!(process.platform === 'win32' && manualPath.startsWith('/dev/'))) {
      found.unshift(normalizePortInfo({ path: manualPath, manufacturer: 'Manuell eingetragen' }, 'manual'));
    }
  }

  const ports = uniquePorts(found);
  console.log('[list-ports] found', ports.map(p => `${p.path} (${p.manufacturer || p.source})`).join(', ') || 'none');
  return { ports, error: listError };
}

// ── CRC8 table for ESP3 ───────────────────────────────────────────
const CRC8_TABLE = [
  0x00,0x07,0x0e,0x09,0x1c,0x1b,0x12,0x15,0x38,0x3f,0x36,0x31,0x24,0x23,0x2a,0x2d,
  0x70,0x77,0x7e,0x79,0x6c,0x6b,0x62,0x65,0x48,0x4f,0x46,0x41,0x54,0x53,0x5a,0x5d,
  0xe0,0xe7,0xee,0xe9,0xfc,0xfb,0xf2,0xf5,0xd8,0xdf,0xd6,0xd1,0xc4,0xc3,0xca,0xcd,
  0x90,0x97,0x9e,0x99,0x8c,0x8b,0x82,0x85,0xa8,0xaf,0xa6,0xa1,0xb4,0xb3,0xba,0xbd,
  0xc7,0xc0,0xc9,0xce,0xdb,0xdc,0xd5,0xd2,0xff,0xf8,0xf1,0xf6,0xe3,0xe4,0xed,0xea,
  0xb7,0xb0,0xb9,0xbe,0xab,0xac,0xa5,0xa2,0x8f,0x88,0x81,0x86,0x93,0x94,0x9d,0x9a,
  0x27,0x20,0x29,0x2e,0x3b,0x3c,0x35,0x32,0x1f,0x18,0x11,0x16,0x03,0x04,0x0d,0x0a,
  0x57,0x50,0x59,0x5e,0x4b,0x4c,0x45,0x42,0x6f,0x68,0x61,0x66,0x73,0x74,0x7d,0x7a,
  0x89,0x8e,0x87,0x80,0x95,0x92,0x9b,0x9c,0xb1,0xb6,0xbf,0xb8,0xad,0xaa,0xa3,0xa4,
  0xf9,0xfe,0xf7,0xf0,0xe5,0xe2,0xeb,0xec,0xc1,0xc6,0xcf,0xc8,0xdd,0xda,0xd3,0xd4,
  0x69,0x6e,0x67,0x60,0x75,0x72,0x7b,0x7c,0x51,0x56,0x5f,0x58,0x4d,0x4a,0x43,0x44,
  0x19,0x1e,0x17,0x10,0x05,0x02,0x0b,0x0c,0x21,0x26,0x2f,0x28,0x3d,0x3a,0x33,0x34,
  0x4e,0x49,0x40,0x47,0x52,0x55,0x5c,0x5b,0x76,0x71,0x78,0x7f,0x6a,0x6d,0x64,0x63,
  0x3e,0x39,0x30,0x37,0x22,0x25,0x2c,0x2b,0x06,0x01,0x08,0x0f,0x1a,0x1d,0x14,0x13,
  0xae,0xa9,0xa0,0xa7,0xb2,0xb5,0xbc,0xbb,0x96,0x91,0x98,0x9f,0x8a,0x8d,0x84,0x83,
  0xde,0xd9,0xd0,0xd7,0xc2,0xc5,0xcc,0xcb,0xe6,0xe1,0xe8,0xef,0xfa,0xfd,0xf4,0xf3
];
function crc8(data) { let c=0; for(const b of data) c=CRC8_TABLE[c^b]; return c; }

// ── Helpers ───────────────────────────────────────────────────────
function fmtId(buf) {
  return Array.from(buf).map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join('-');
}
function allZero(buf) { return buf.every(b=>b===0); }

function buildEsp2Message(body) {
  let cs = 0;
  for (const b of body) cs = (cs + b) & 0xFF;
  return Buffer.from([0xA5, 0x5A, ...body, cs]);
}

function isValidFixedEsp2Frame(buf, i) {
  if (i < 0 || i + 14 > buf.length) return false;
  if (buf[i] !== 0xA5 || buf[i+1] !== 0x5A) return false;
  let cs = 0;
  for (let j = i + 2; j < i + 13; j++) cs = (cs + buf[j]) & 0xFF;
  return buf[i+13] === cs;
}

// ─────────────────────────────────────────────────────────────────
// PROTOCOL 1: Eltako FAM-USB specific (from eo-man source code)
// Command: AB 58 00 00 00 00 00 00 00 00 00
// Response body[2:6] = base ID
// This is the Eltako RS485 extended ESP2 format
// ─────────────────────────────────────────────────────────────────
function buildFamUsbRdIdBase() {
  // Exact ESP2 frame used by eltakobus for the FAM-USB AB-58 request.
  // ESP2Message.serialize() is: A5 5A + 11-byte body + checksum.
  // Body: AB 58 00 00 00 00 00 00 00 00 00, checksum = 0x03.
  // Do NOT prepend another length byte here; that produced an invalid 15-byte
  // frame in the old JavaScript fallback.
  return buildEsp2Message(Buffer.from([
    0xAB, 0x58, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
  ]));
}

// ─────────────────────────────────────────────────────────────────
// Legacy ESP3 CO_RD_IDBASE helper (not exposed by EEDTOY)
// ─────────────────────────────────────────────────────────────────
function buildEsp3RdIdBase() {
  const header = Buffer.from([0x00, 0x01, 0x00, 0x05]);
  const data   = Buffer.from([0x08]); // CO_RD_IDBASE
  return Buffer.from([0x55, ...header, crc8(header), ...data, crc8(data)]);
}

// ─────────────────────────────────────────────────────────────────
// PROTOCOL 3: Standard ESP2 CO_RD_IDBASE (FAM14, FGW14-USB)
// ─────────────────────────────────────────────────────────────────
function buildEsp2RdIdBase() {
  // ESP2 fixed frame. Body is 11 bytes; first byte is H_SEQ+LEN.
  // This command is kept as fallback for ESP2-compatible transceivers.
  return buildEsp2Message(Buffer.from([0x2A, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00]));
}

function buildEltakoBusLock() {
  // EltakoMessage(org=0xFF, payload=8*0, address=0xFF, request/TCT)
  return buildEsp2Message(Buffer.from([0xAB, 0xFF, 0,0,0,0,0,0,0,0, 0xFF]));
}

function buildEltakoBusUnlock() {
  // EltakoMessage(org=0xFF, payload=8*0, address=0x00, request/TCT)
  return buildEsp2Message(Buffer.from([0xAB, 0xFF, 0,0,0,0,0,0,0,0, 0x00]));
}

function buildFam14MemoryBaseIdRequest() {
  // EltakoMemoryRequest(address=255, row=1). FAM14 stores its base ID in memory row 1.
  return buildEsp2Message(Buffer.from([0xAB, 0xF1, 0,0,0,0,0,0,0,0x01, 0xFF]));
}

// ─────────────────────────────────────────────────────────────────
// PARSERS
// ─────────────────────────────────────────────────────────────────

// Parse FAM-USB Eltako response
// Response to AB 58 cmd: response.body[2:6] = base ID
// Eltako RS485 response frame: A5 5A | H_SEQ+LEN | body | CS
function tryParseEltakoFamUsb(buf) {
  for (let i = 0; i <= buf.length - 14; i++) {
    if (!isValidFixedEsp2Frame(buf, i)) continue;
    const body = buf.slice(i + 2, i + 13);

    // eo_man creates this synthetic info message after reading the FAM14 base ID.
    if (body[0] === 0x8B && body[1] === 0x98) {
      const id = body.slice(2, 6);
      if (!allZero(id)) return fmtId(id);
    }

    // Native response to AB-58: RMT header 0x8B, command 0x58, then Base-ID.
    // This mirrors the reference Python path which reads response.body[2:6].
    if (body[0] === 0x8B && body[1] === 0x58) {
      const id = body.slice(2, 6);
      if (!allZero(id)) return fmtId(id);
    }

    // Keep compatibility with adapters that wrap the command marker.
    if (body[0] === 0x8B && body[1] === 0xAB && body[2] === 0x58) {
      const id = body.slice(3, 7);
      if (!allZero(id)) return fmtId(id);
    }
  }
  return null;
}

function tryParseFam14MemoryResponse(buf) {
  for (let i = 0; i <= buf.length - 14; i++) {
    if (!isValidFixedEsp2Frame(buf, i)) continue;
    const body = buf.slice(i + 2, i + 13);
    // EltakoMemoryResponse(row=1): RMT=0x8B, ORG=0xF1, value in body[2:10], row/address in body[10].
    if (body[0] === 0x8B && body[1] === 0xF1 && body[10] === 0x01) {
      const id = body.slice(2, 6);
      if (!allZero(id)) return fmtId(id);
    }
  }
  return null;
}

// Parse standard ESP2 CO_RD_IDBASE response
// Response: ORG=0x02 (RCT), STATUS has bit7 set, ID at bytes 8-11
function tryParseEsp2(buf) {
  for (let i = 0; i <= buf.length - 14; i++) {
    if (!isValidFixedEsp2Frame(buf, i)) continue;
    const body = buf.slice(i + 2, i + 13);
    // Generic ESP2 base-id-info style response, if an adapter sends it in fixed ESP2 framing.
    if (body[0] === 0x8B && body[1] === 0x98) {
      const id = body.slice(2, 6);
      if (!allZero(id)) return fmtId(id);
    }
  }
  return null;
}

// Parse ESP3 CO_RD_IDBASE response
// Response type=0x02, data[0]=0x00 (OK), data[1:5] = base ID
function tryParseEsp3(buf) {
  for (let i = 0; i < buf.length - 7; i++) {
    if (buf[i] !== 0x55) continue;
    if (buf.length < i + 6) continue;
    const dataLen = (buf[i+1] << 8) | buf[i+2];
    const optLen  = buf[i+3];
    const type    = buf[i+4];
    if (crc8(buf.slice(i+1, i+5)) !== buf[i+5]) continue;
    const totalLen = 6 + dataLen + optLen + 1;
    if (buf.length < i + totalLen) continue;
    const dataStart = i + 6;
    if (crc8(buf.slice(dataStart, dataStart + dataLen + optLen)) !== buf[i + totalLen - 1]) continue;
    if (type === 0x02 && dataLen >= 5 && buf[dataStart] === 0x00) {
      const id = buf.slice(dataStart + 1, dataStart + 5);
      if (!allZero(id)) return fmtId(id);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// SERIAL READ / AUTO DETECT HELPERS
// ─────────────────────────────────────────────────────────────────
function parseBaseIdFromBuffer(buffer) {
  const fam14Memory = tryParseFam14MemoryResponse(buffer);
  if (fam14Memory) return { baseId: fam14Memory, parser: 'fam14-memory-row-1' };

  const fam = tryParseEltakoFamUsb(buffer);
  if (fam) return { baseId: fam, parser: 'eltako-fam-usb' };

  const esp3 = tryParseEsp3(buffer);
  if (esp3) return { baseId: esp3, parser: 'esp3' };

  const esp2 = tryParseEsp2(buffer);
  if (esp2) return { baseId: esp2, parser: 'esp2' };

  return null;
}

function buildCommandForProtocol(protocol) {
  if (protocol === 'fam14-memory') return [buildEltakoBusLock(), buildFam14MemoryBaseIdRequest()];
  if (protocol === 'esp2-fam-usb') return buildFamUsbRdIdBase();
  if (protocol === 'esp2') return buildEsp2RdIdBase();
  if (protocol === 'esp3') return buildEsp3RdIdBase();
  return null;
}

function readBaseIdFromPort(portPath, baudRate, protocol, options = {}) {
  const timeoutMs = options.timeoutMs || 1800;
  const retries = options.retries ?? 2;

  return new Promise((resolve) => {
    let port;
    try {
      const { SerialPort } = require('serialport');
      port = new SerialPort({ path: portPath, baudRate: baudRate || 57600, autoOpen: false });
    } catch (e) {
      return resolve({ ok: false, error: 'SerialPort Fehler: ' + e.message });
    }

    let buffer = Buffer.alloc(0);
    let resolved = false;
    let attempt = 0;
    let retryTimer = null;
    let finalTimer = null;
    const txFrames = [];
    const rxFrames = [];

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(retryTimer);
      clearTimeout(finalTimer);

      const finish = () => resolve({ ...result, txFrames, rxFrames });
      try {
        if (port?.isOpen) {
          // Important on Windows: wait until COM port is really closed before
          // the next baud/protocol attempt opens the same port again.
          port.close(() => setTimeout(finish, 150));
        } else {
          finish();
        }
      } catch {
        finish();
      }
    };

    const send = () => {
      if (resolved) return;
      if (attempt >= retries) {
        return done({ ok: false, error: `Keine Base-ID Antwort auf ${portPath} @ ${baudRate} baud (${protocol}).` });
      }
      const cmdOrFrames = buildCommandForProtocol(protocol);
      if (!cmdOrFrames) return done({ ok: false, error: 'Unbekanntes Protokoll: ' + protocol });
      const frames = Array.isArray(cmdOrFrames) ? cmdOrFrames : [cmdOrFrames];
      attempt += 1;

      const writeFrame = (index) => {
        if (resolved || index >= frames.length) return;
        const frame = frames[index];
        const tx = frame.toString('hex').match(/../g).join(' ');
        txFrames.push(tx);
        console.log('[read-base-id] TX', portPath, baudRate, protocol, tx);
        port.write(frame, (err) => {
          if (err) return done({ ok: false, error: 'Senden fehlgeschlagen: ' + err.message });
          try { port.drain(() => {}); } catch {}
          setTimeout(() => writeFrame(index + 1), 120);
        });
      };

      writeFrame(0);
      retryTimer = setTimeout(send, timeoutMs);
    };

    port.on('error', (err) => done({ ok: false, error: err.message }));

    port.on('data', (chunk) => {
      const rx = chunk.toString('hex').match(/../g).join(' ');
      rxFrames.push(rx);
      console.log('[read-base-id] RX', portPath, baudRate, protocol, rx);
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 4096) buffer = buffer.slice(-4096);

      const parsed = parseBaseIdFromBuffer(buffer);
      if (parsed) {
        return done({
          ok: true,
          baseId: parsed.baseId,
          protocol,
          parser: parsed.parser,
          baudRate,
          portPath,
        });
      }
    });

    port.open((err) => {
      if (err) return done({ ok: false, error: 'Port konnte nicht geöffnet werden: ' + err.message });
      finalTimer = setTimeout(() => done({ ok: false, error: `Timeout auf ${portPath} @ ${baudRate} baud (${protocol}).` }), timeoutMs * retries + 900);
      setTimeout(send, 250);
    });
  });
}

function guessGatewayType(candidate, manufacturer = '') {
  const m = manufacturer.toLowerCase();
  if (candidate.protocol === 'fam14-memory') return 'fam14';
  if (candidate.protocol === 'esp2-fam-usb') return 'fam-usb';
  if (candidate.protocol === 'esp2') return candidate.baudRate === 57600 ? 'fgw14usb' : 'fam-usb';
  return 'fam-usb';
}

function makeCandidatesForPort(portInfo) {
  const m = `${portInfo.manufacturer || ''} ${portInfo.path || ''}`.toLowerCase();
  const candidates = [];

  const add = (baudRate, protocol, label) => candidates.push({ baudRate, protocol, label });

  // Prefer likely matches first, but still try all relevant variants.
  if (m.includes('eltako') || m.includes('fam')) {
    add(9600, 'fam14-memory', 'Eltako FAM14 Base-ID aus Speicher');
    add(57600, 'fam14-memory', 'Eltako FAM14 Base-ID aus Speicher');
    add(9600, 'esp2-fam-usb', 'Eltako FAM-USB');
    add(57600, 'esp2', 'Eltako FAM14/FGW14-USB');
  }
  // Many Eltako gateways identify only as generic FTDI. Prefer Eltako
  // variants before ESP3 so a FAM/FGW is not disturbed by a wrong ESP3 query.
  if (m.includes('ftdi') || m.includes('eltako') || m.includes('fam') || m.includes('fgw')) {
    add(9600, 'esp2-fam-usb', 'Eltako FAM-USB');
    add(57600, 'esp2', 'Eltako FAM14/FGW14-USB');
  }
  if (m.includes('enocean') || m.includes('usb') || m.includes('serial') || m.includes('com')) {
  }

  add(9600, 'fam14-memory', 'Eltako FAM14 Base-ID aus Speicher');
  add(57600, 'fam14-memory', 'Eltako FAM14 Base-ID aus Speicher');
  add(9600, 'esp2-fam-usb', 'Eltako FAM-USB');
  add(57600, 'esp2', 'Eltako FAM14/FGW14-USB');
  add(9600, 'esp2', 'ESP2 9600 fallback');

  const seen = new Set();
  return candidates.filter(c => {
    const k = `${c.baudRate}:${c.protocol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function detectGatewayOnSerialPorts(preferredPath = '') {
  const { ports: serialPorts, error: listError } = await listSerialPortsRobust(preferredPath);

  const attempts = [];
  for (const portInfo of serialPorts) {
    const candidates = makeCandidatesForPort(portInfo);
    for (const candidate of candidates) {
      console.log('[detect-gateway] TRY', portInfo.path, candidate.baudRate, candidate.protocol);
      const result = await readBaseIdFromPort(portInfo.path, candidate.baudRate, candidate.protocol, { timeoutMs: 2200, retries: 2 });
      attempts.push({
        path: portInfo.path,
        manufacturer: portInfo.manufacturer,
        baudRate: candidate.baudRate,
        protocol: candidate.protocol,
        label: candidate.label,
        ok: result.ok,
        error: result.error || '',
        rxFrames: result.rxFrames || [],
      });

      if (!result.ok) {
        console.log('[detect-gateway] FAIL', portInfo.path, candidate.baudRate, candidate.protocol, result.error || 'no match');
      }

      if (result.ok) {
        const type = guessGatewayType(candidate, portInfo.manufacturer);
        rememberBusConnection(portInfo.path, type, candidate.baudRate || 57600);
        return {
          ok: true,
          gateway: {
            type,
            label: candidate.label,
            serial_path: portInfo.path,
            base_id: result.baseId,
            baudRate: candidate.baudRate,
            protocol: candidate.protocol,
            parser: result.parser,
            manufacturer: portInfo.manufacturer,
          },
          ports: serialPorts,
          attempts,
        };
      }

      // Give Windows/FTDI drivers a moment before reopening the same COM port
      // at another baud rate or protocol.
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return {
    ok: false,
    ports: serialPorts,
    attempts,
    error: serialPorts.length
      ? 'Serielle Ports wurden gefunden, aber keine gültige Base-ID Antwort empfangen. Prüfe Gateway-Typ, Baudrate und ob der Port von anderer Software belegt ist.'
      : 'Kein serieller Port gefunden. Trage den COM-Port manuell ein, z.B. COM3, oder prüfe Treiber/USB-Kabel/Gateway.' + (listError ? ' SerialPort.list Fehler: ' + listError : ''),
  };
}




// ─────────────────────────────────────────────────────────────────
// EMBEDDED PYTHON RUNTIME
// The Windows installer contains a complete, prevalidated Python 3.12
// runtime. EEDTOY never installs Python, invokes winget or uses a global
// customer Python installation.
// ─────────────────────────────────────────────────────────────────
let pythonRuntimeState = null;

function exists(p) {
  try { return require('fs').existsSync(p); } catch { return false; }
}

function runProcess(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: options.cwd || process.cwd(),
        windowsHide: true,
        shell: false,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...(options.env || {}) },
      });
    } catch (e) {
      return resolve({ ok: false, code: -1, stdout, stderr, error: e.message || String(e), cmd, args });
    }
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, options.timeoutMs || 30000);
    child.stdout.on('data', d => { stdout += d.toString('utf8'); });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });
    child.on('error', e => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr, error: e.message || String(e), cmd, args });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, cmd, args });
    });
  });
}

function getEmbeddedPythonPath() {
  const runtimeExecutable = process.platform === 'win32'
    ? path.join('python-runtime', 'python.exe')
    : path.join('python-runtime', 'bin', 'python3');
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath || '', runtimeExecutable)]
    : [
        process.env.EEDTOY_PYTHON || '',
        path.join(__dirname, '..', runtimeExecutable),
      ];
  return candidates.find(candidate => candidate && exists(candidate)) || candidates[0];
}

async function validatePythonRuntime(pythonPath) {
  const code = 'import serial, serial_asyncio, aiocoap, yaml, eltakobus; from eltakobus.serial import RS485SerialInterfaceV2; print("ok")';
  const result = await runProcess(pythonPath, ['-I', '-c', code], { timeoutMs: 20000 });
  return { ok: result.ok && String(result.stdout || '').includes('ok'), details: result };
}

async function ensurePythonRuntime() {
  if (pythonRuntimeState?.ok && exists(pythonRuntimeState.pythonPath)) return pythonRuntimeState;

  const pythonPath = getEmbeddedPythonPath();
  const attempts = [];
  if (!pythonPath || !exists(pythonPath)) {
    pythonRuntimeState = {
      ok: false,
      error: 'Die eingebettete EEDTOY Python-Laufzeit fehlt. Bitte EEDTOY mit dem vollständigen Installer neu installieren.',
      attempts: [{ step: 'embedded-runtime-present', ok: false, pythonPath }],
    };
    return pythonRuntimeState;
  }

  const validation = await validatePythonRuntime(pythonPath);
  attempts.push({
    step: 'validate-embedded-runtime',
    ok: validation.ok,
    pythonPath,
    stdout: (validation.details.stdout || '').slice(-2000),
    stderr: (validation.details.stderr || validation.details.error || '').slice(-4000),
  });

  if (!validation.ok) {
    pythonRuntimeState = {
      ok: false,
      error: 'Die mitgelieferte EEDTOY Python-Laufzeit ist beschädigt oder unvollständig. Bitte EEDTOY neu installieren.',
      attempts,
    };
    return pythonRuntimeState;
  }

  pythonRuntimeState = { ok: true, pythonPath, argsPrefix: ['-I'], attempts };
  return pythonRuntimeState;
}

async function getPythonCommands(script) {
  const setup = await ensurePythonRuntime();
  if (!setup.ok) return { ok: false, commands: [], setup };
  return {
    ok: true,
    commands: [{ cmd: setup.pythonPath, args: [...setup.argsPrefix, script] }],
    setup,
  };
}

// ─────────────────────────────────────────────────────────────────
// PYTHON BRIDGE: preferred detector for Eltako/FAM14 and FAM-USB
// ─────────────────────────────────────────────────────────────────
function getPythonDetectorScriptPath() {
  const fs = require('fs');
  const candidates = app.isPackaged
    ? [
        // In packaged Electron builds Python cannot execute scripts inside app.asar.
        // The python folder is therefore shipped as extraResources under resources/python.
        path.join(process.resourcesPath || '', 'python', 'detect_gateway.py'),
        path.join(process.cwd(), 'python', 'detect_gateway.py'),
        path.join(__dirname, '..', 'python', 'detect_gateway.py'),
      ]
    : [
        path.join(__dirname, '..', 'python', 'detect_gateway.py'),
        path.join(process.cwd(), 'python', 'detect_gateway.py'),
      ];
  return candidates.find(p => p && fs.existsSync(p)) || candidates[0];
}

function getPythonScriptCwd(scriptPath) {
  try { return path.dirname(scriptPath); } catch { return process.cwd(); }
}

async function runPythonDetector(preferredPath = '', mode = 'auto') {
  const { spawn } = require('child_process');
  const script = getPythonDetectorScriptPath();
  const commandInfo = await getPythonCommands(script);
  return new Promise((resolve) => {
    const attempts = commandInfo.setup?.attempts ? [...commandInfo.setup.attempts] : [];
    const commands = commandInfo.commands;

    const runOne = (index) => {
      if (index >= commands.length) {
        return resolve({
          ok: false,
          error: commandInfo.setup?.error || 'Python-Detector konnte nicht gestartet werden. Die private Python-Laufzeit konnte nicht vorbereitet werden.',
          attempts,
          ports: [],
          bridge: 'python',
        });
      }

      const c = commands[index];
      const args = [...c.args, '--preferred', preferredPath || '', '--mode', mode || 'auto'];
      console.log('[python-detect] START', c.cmd, args.join(' '));

      let stdout = '';
      let stderr = '';
      let started = false;
      let child;
      try {
        child = spawn(c.cmd, args, {
          cwd: getPythonScriptCwd(script),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        started = true;
      } catch (e) {
        attempts.push({ cmd: c.cmd, error: e.message || String(e) });
        return runOne(index + 1);
      }

      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
      }, 18000);

      child.stdout.on('data', d => { stdout += d.toString('utf8'); });
      child.stderr.on('data', d => {
        const text = d.toString('utf8');
        stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) {
          console.log(line);
          if (line.startsWith('[python-learn-progress] ')) {
            try {
              const progress = JSON.parse(line.slice('[python-learn-progress] '.length));
              if (typeof options.onProgress === 'function') options.onProgress(progress);
            } catch (_) {}
          }
        }
      });
      child.on('error', e => {
        clearTimeout(timer);
        attempts.push({ cmd: c.cmd, error: e.message || String(e), started });
        runOne(index + 1);
      });
      child.on('close', code => {
        clearTimeout(timer);
        attempts.push({ cmd: c.cmd, code, stderr: stderr.slice(-4000) });

        const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
        if (jsonLine) {
          try {
            const result = JSON.parse(jsonLine);
            result.bridge = 'python';
            result.pythonCommand = c.cmd;
            result.pythonStderr = stderr.slice(-8000);
            console.log('[python-detect] RESULT', JSON.stringify({ ok: result.ok, gateway: result.gateway, error: result.error }));
            return resolve(result);
          } catch (e) {
            attempts[attempts.length - 1].parseError = e.message;
            attempts[attempts.length - 1].stdout = stdout.slice(-4000);
          }
        }

        // If the command existed but the script failed because dependencies are
        // missing, trying the next Python executable usually will not help much,
        // but it is harmless and catches different PATH setups.
        runOne(index + 1);
      });
    };

    runOne(0);
  });
}


function getPythonLearnScriptPath() {
  const fs = require('fs');
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath || '', 'python', 'learn_device_id.py'),
        path.join(process.cwd(), 'python', 'learn_device_id.py'),
        path.join(__dirname, '..', 'python', 'learn_device_id.py'),
      ]
    : [
        path.join(__dirname, '..', 'python', 'learn_device_id.py'),
        path.join(process.cwd(), 'python', 'learn_device_id.py'),
      ];
  return candidates.find(p => p && fs.existsSync(p)) || candidates[0];
}

async function runPythonLearnDeviceId(portPath = '', gatewayType = 'auto', timeoutMs = 20000, options = {}) {
  const { spawn } = require('child_process');
  const script = getPythonLearnScriptPath();
  const commandInfo = await getPythonCommands(script);
  return new Promise((resolve) => {
    const attempts = commandInfo.setup?.attempts ? [...commandInfo.setup.attempts] : [];
    const mode = String(gatewayType || 'auto').toLowerCase();
    const timeoutSec = Math.max(5, Math.round((Number(timeoutMs) || 20000) / 1000));
    const commands = commandInfo.commands;

    const runOne = (index) => {
      if (index >= commands.length) {
        return resolve({
          ok: false,
          error: commandInfo.setup?.error || 'Python-Lerntelegramm-Listener konnte nicht gestartet werden. Die private Python-Laufzeit konnte nicht vorbereitet werden.',
          attempts,
          bridge: 'python',
        });
      }

      const c = commands[index];
      const args = [...c.args, '--port', String(portPath || '').trim(), '--mode', mode, '--timeout', String(timeoutSec)];
      if (options.repeatCount) args.push('--repeat-count', String(options.repeatCount));
      if (options.requiredRorg) args.push('--required-rorg', String(options.requiredRorg));
      if (options.requiredDataByte3 != null) args.push('--required-data-byte3', String(options.requiredDataByte3));
      console.log('[python-learn] START', c.cmd, args.join(' '));

      let stdout = '';
      let stderr = '';
      let child;
      try {
        child = spawn(c.cmd, args, {
          cwd: getPythonScriptCwd(script),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
      } catch (e) {
        attempts.push({ cmd: c.cmd, error: e.message || String(e) });
        return runOne(index + 1);
      }

      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
      }, (timeoutSec + 8) * 1000);

      child.stdout.on('data', d => { stdout += d.toString('utf8'); });
      child.stderr.on('data', d => {
        const text = d.toString('utf8');
        stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) {
          console.log(line);
          if (line.startsWith('[python-learn-progress] ')) {
            try {
              const progress = JSON.parse(line.slice('[python-learn-progress] '.length));
              if (typeof options.onProgress === 'function') options.onProgress(progress);
            } catch (_) {}
          }
        }
      });
      child.on('error', e => {
        clearTimeout(timer);
        attempts.push({ cmd: c.cmd, error: e.message || String(e) });
        runOne(index + 1);
      });
      child.on('close', code => {
        clearTimeout(timer);
        attempts.push({ cmd: c.cmd, code, stderr: stderr.slice(-4000) });
        const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
        if (jsonLine) {
          try {
            const result = JSON.parse(jsonLine);
            result.bridge = 'python';
            result.pythonCommand = c.cmd;
            result.pythonStderr = stderr.slice(-8000);
            console.log('[python-learn] RESULT', JSON.stringify({ ok: result.ok, id: result.id, error: result.error }));
            return resolve(result);
          } catch (e) {
            attempts[attempts.length - 1].parseError = e.message;
            attempts[attempts.length - 1].stdout = stdout.slice(-4000);
          }
        }
        runOne(index + 1);
      });
    };

    runOne(0);
  });
}


let activeWriteSenderProcess = null;

function getPythonWriteSendersScriptPath() {
  const fs = require('fs');
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath || '', 'python', 'write_senders.py'),
        path.join(process.cwd(), 'python', 'write_senders.py'),
        path.join(__dirname, '..', 'python', 'write_senders.py'),
      ]
    : [
        path.join(__dirname, '..', 'python', 'write_senders.py'),
        path.join(process.cwd(), 'python', 'write_senders.py'),
      ];
  return candidates.find(p => p && fs.existsSync(p)) || candidates[0];
}

async function runPythonWriteSenders({ portPath = '', gatewayType = 'fam14', baudRate = 57600, entries = [] } = {}, { onProgress } = {}) {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const script = getPythonWriteSendersScriptPath();
  const commandInfo = await getPythonCommands(script);
  return new Promise((resolve) => {
    const attempts = commandInfo.setup?.attempts ? [...commandInfo.setup.attempts] : [];

    if (!portPath || !String(portPath).trim()) {
      return resolve({ ok: false, error: 'Kein Bus-COM-Port eingetragen. Bitte FAM14/FGW14-USB COM-Port wählen oder manuell eintragen.' });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return resolve({ ok: false, error: 'Keine programmierbaren Series-14-Sender-IDs vorhanden. Importiere zuerst PCT14-Geräte und generiere die Sender-IDs.' });
    }

    let senderMapPath = '';
    try {
      senderMapPath = path.join(os.tmpdir(), `eedtoy-sender-map-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
      fs.writeFileSync(senderMapPath, JSON.stringify({ entries }, null, 2), 'utf8');
    } catch (e) {
      return resolve({ ok: false, error: 'Sender-ID-Liste konnte nicht vorbereitet werden: ' + (e.message || e) });
    }

    const commands = commandInfo.commands;

    const cleanup = () => {
      try { if (senderMapPath) fs.unlinkSync(senderMapPath); } catch {}
    };

    const runOne = (index) => {
      if (index >= commands.length) {
        cleanup();
        return resolve({
          ok: false,
          error: commandInfo.setup?.error || 'Python-Sender-Schreiber konnte nicht gestartet werden. Die private Python-Laufzeit konnte nicht vorbereitet werden.',
          attempts,
          bridge: 'python',
        });
      }

      const c = commands[index];
      const args = [
        ...c.args,
        '--port', String(portPath || '').trim(),
        '--gateway-type', String(gatewayType || 'fam14'),
        '--baud', String(baudRate || 57600),
        '--sender-map', senderMapPath,
      ];
      console.log('[python-write-senders] START', c.cmd, args.join(' '));

      let stdout = '';
      let stderr = '';
      let stderrLineBuffer = '';
      let processedCount = 0;
      let child;
      let cancelRequested = false;
      const totalCount = entries.length;
      const emitProgress = (progress) => {
        if (typeof onProgress === 'function') {
          try { onProgress({ total: totalCount, processed: processedCount, ...progress }); } catch (_) {}
        }
      };
      try {
        child = spawn(c.cmd, args, {
          cwd: getPythonScriptCwd(script),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        activeWriteSenderProcess = {
          child,
          requestCancel: () => {
            cancelRequested = true;
            emitProgress({ phase: 'canceling' });
            try { child.kill(); } catch (_) {}
          },
        };
        emitProgress({ phase: 'starting' });
      } catch (e) {
        attempts.push({ cmd: c.cmd, error: e.message || String(e) });
        return runOne(index + 1);
      }

      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
      }, 180000);

      child.stdout.on('data', d => { stdout += d.toString('utf8'); });
      child.stderr.on('data', d => {
        const text = d.toString('utf8');
        stderr += text;
        stderrLineBuffer += text;
        const lines = stderrLineBuffer.split(/\r?\n/);
        stderrLineBuffer = lines.pop() || '';
        for (const line of lines.filter(Boolean)) {
          console.log(line);
          if (!line.startsWith('[python-write-senders] ')) continue;
          const message = line.slice('[python-write-senders] '.length).trim();
          if (message.startsWith('connect ')) emitProgress({ phase: 'connecting', message });
          else if (message.startsWith('bus locked')) emitProgress({ phase: 'scanning', message });
          else if (
            message.startsWith('Sender-ID ') ||
            message.startsWith('Home-Assistant Sender-ID ') ||
            message.startsWith('Fehler beim Schreiben ') ||
            message.startsWith('Update für Gerät ')
          ) {
            processedCount = Math.min(totalCount, processedCount + 1);
            emitProgress({ phase: 'writing', message });
          }
        }
      });
      child.on('error', e => {
        clearTimeout(timer);
        if (activeWriteSenderProcess?.child === child) activeWriteSenderProcess = null;
        if (cancelRequested) {
          cleanup();
          emitProgress({ phase: 'canceled' });
          return resolve({ ok: false, canceled: true, error: 'Schreibvorgang abgebrochen.', events: [], processed: processedCount, total: totalCount });
        }
        attempts.push({ cmd: c.cmd, error: e.message || String(e) });
        runOne(index + 1);
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (activeWriteSenderProcess?.child === child) activeWriteSenderProcess = null;
        if (cancelRequested) {
          cleanup();
          emitProgress({ phase: 'canceled' });
          return resolve({ ok: false, canceled: true, error: 'Schreibvorgang abgebrochen.', events: [], processed: processedCount, total: totalCount });
        }
        attempts.push({ cmd: c.cmd, code, stderr: stderr.slice(-4000) });
        const jsonLine = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
        if (jsonLine) {
          try {
            const result = JSON.parse(jsonLine);
            result.bridge = 'python';
            result.pythonCommand = c.cmd;
            result.pythonStderr = stderr.slice(-12000);
            cleanup();
            processedCount = totalCount;
            emitProgress({ phase: 'done', message: result.message || '' });
            console.log('[python-write-senders] RESULT', JSON.stringify({ ok: result.ok, counts: result.counts, error: result.error }));
            return resolve(result);
          } catch (e) {
            attempts[attempts.length - 1].parseError = e.message;
            attempts[attempts.length - 1].stdout = stdout.slice(-4000);
          }
        }
        runOne(index + 1);
      });
    };

    runOne(0);
  });
}


// ─────────────────────────────────────────────────────────────────
// DEVICE-ID LEARN TELEGRAM LISTENER
// ─────────────────────────────────────────────────────────────────
function parseLearnIdEsp3(buf) {
  for (let i = 0; i < buf.length - 7; i++) {
    if (buf[i] !== 0x55) continue;
    if (buf.length < i + 6) continue;
    const dataLen = (buf[i + 1] << 8) | buf[i + 2];
    const optLen = buf[i + 3];
    const type = buf[i + 4];
    if (crc8(buf.slice(i + 1, i + 5)) !== buf[i + 5]) continue;
    const totalLen = 6 + dataLen + optLen + 1;
    if (buf.length < i + totalLen) continue;
    const dataStart = i + 6;
    const crcIndex = i + totalLen - 1;
    if (crc8(buf.slice(dataStart, dataStart + dataLen + optLen)) !== buf[crcIndex]) continue;

    // RADIO_ERP1: RORG + user data + SenderID(4) + STATUS.
    if (type === 0x01 && dataLen >= 6) {
      const rorg = buf[dataStart];
      if ([0xF6, 0xD5, 0xA5, 0xD2].includes(rorg)) {
        const sender = buf.slice(dataStart + dataLen - 5, dataStart + dataLen - 1);
        if (!allZero(sender)) return { id: fmtId(sender), rorg: rorg.toString(16).toUpperCase().padStart(2, '0'), data_byte3: buf[dataStart + 1], protocol: 'esp3' };
      }
    }
  }
  return null;
}

function parseLearnIdEsp2(buf) {
  for (let i = 0; i <= buf.length - 14; i++) {
    if (!isValidFixedEsp2Frame(buf, i)) continue;
    const body = buf.slice(i + 2, i + 13);

    // Common ESP2 radio frame layout: H_SEQ/LEN, RORG, DATA3..DATA0, ID3..ID0, STATUS.
    const rorg = body[1];
    if ([0xF6, 0xD5, 0xA5, 0xD2].includes(rorg)) {
      const sender = body.slice(6, 10);
      if (!allZero(sender)) return { id: fmtId(sender), rorg: rorg.toString(16).toUpperCase().padStart(2, '0'), data_byte3: body[2], protocol: 'esp2' };
    }

    // Some translated/extended frames put the RORG at body[0]. Keep this as a safe fallback.
    const rorg0 = body[0];
    if ([0xF6, 0xD5, 0xA5, 0xD2].includes(rorg0)) {
      const sender = body.slice(5, 9);
      if (!allZero(sender)) return { id: fmtId(sender), rorg: rorg0.toString(16).toUpperCase().padStart(2, '0'), data_byte3: body[1], protocol: 'esp2-alt' };
    }
  }
  return null;
}

function parseLearnIdFromBuffer(buf) {
  return parseLearnIdEsp3(buf) || parseLearnIdEsp2(buf);
}

function gatewaySerialParamsForLearning(gatewayType) {
  const type = String(gatewayType || '').toLowerCase();
  if (type === 'fam-usb') return { baudRate: 9600, protocol: 'esp2' };
  if (type === 'fam14' || type === 'fgw14usb') return { baudRate: 57600, protocol: 'esp2' };
  return { baudRate: 57600, protocol: 'esp3' };
}

function listenForLearnTelegram(portPath, gatewayType, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!portPath || !String(portPath).trim()) {
      return resolve({ ok: false, error: 'Kein serieller Port eingetragen. Bitte im Gateway-Schritt COM-Port auswählen oder manuell eintragen.' });
    }

    let port;
    const params = gatewaySerialParamsForLearning(gatewayType);
    try {
      const { SerialPort } = require('serialport');
      port = new SerialPort({ path: String(portPath).trim(), baudRate: params.baudRate, autoOpen: false });
    } catch (e) {
      return resolve({ ok: false, error: 'SerialPort Fehler: ' + e.message });
    }

    let buffer = Buffer.alloc(0);
    let resolved = false;
    const started = Date.now();

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const done = () => resolve({ ...result, baudRate: params.baudRate, gatewayType, elapsedMs: Date.now() - started });
      try {
        if (port?.isOpen) port.close(() => done());
        else done();
      } catch (_) { done(); }
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: `Kein Lerntelegramm innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden empfangen.` });
    }, Math.max(3000, Number(timeoutMs) || 15000));

    port.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 4096) buffer = buffer.slice(-2048);
      const rx = chunk.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
      console.log('[learn-device-id] RX', portPath, params.baudRate, params.protocol, rx);
      const parsed = parseLearnIdFromBuffer(buffer);
      if (parsed?.id) {
        console.log('[learn-device-id] FOUND', parsed.id, 'rorg', parsed.rorg, 'protocol', parsed.protocol);
        finish({ ok: true, id: parsed.id, rorg: parsed.rorg, protocol: parsed.protocol });
      }
    });

    port.on('error', err => finish({ ok: false, error: 'Serieller Fehler: ' + (err.message || err) }));
    port.open(err => {
      if (err) return finish({ ok: false, error: `Port ${portPath} konnte nicht geöffnet werden: ${err.message || err}` });
      console.log('[learn-device-id] LISTEN', portPath, params.baudRate, params.protocol, `${timeoutMs}ms`);
    });
  });
}

function parseFts14emRpsFrame(frame) {
  const buf = Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []);
  if (buf.length !== 14 || !isValidFixedEsp2Frame(buf, 0)) return null;

  const body = buf.slice(2, 13);
  // FTS14EM sends Series-14 internal RPS telegrams (ESP2 ORG 0x05).
  if (body[1] !== 0x05) return null;
  if (body[3] !== 0x00 || body[4] !== 0x00 || body[5] !== 0x00) return null;

  const data = body[2];
  if (data !== 0x70 && data !== 0x00) return null;

  const sender = body.slice(6, 10);
  if (allZero(sender)) return null;

  // For base-ID learning the user presses E1. The documented/implemented E1
  // ranges are 00-00-10-01 .. 00-00-14-01. Restricting to those IDs prevents
  // unrelated RPS traffic on the Series-14 bus from being learned by mistake.
  if (sender[0] !== 0x00 || sender[1] !== 0x00 || sender[2] < 0x10 || sender[2] > 0x14 || sender[3] !== 0x01) {
    return null;
  }

  return {
    id: fmtId(sender),
    rorg: '05',
    dataByte3: data,
    pressed: data === 0x70,
    released: data === 0x00,
  };
}

function listenForFts14emBaseIdViaFgw(portPath, timeoutMs = 30000, onProgress = null) {
  return new Promise((resolve) => {
    const portName = String(portPath || '').trim();
    if (!portName) return resolve({ ok: false, error: 'Kein serieller Port eingetragen.' });

    let port;
    try {
      const { SerialPort } = require('serialport');
      port = new SerialPort({ path: portName, baudRate: 57600, autoOpen: false });
    } catch (e) {
      return resolve({ ok: false, error: 'SerialPort Fehler: ' + (e.message || e) });
    }

    let buffer = Buffer.alloc(0);
    let resolved = false;
    let receivedFrames = 0;
    let ftsFrames = 0;
    const pressCounts = new Map();
    const armed = new Map();
    const lastCountedAt = new Map();

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const done = () => resolve({
        ...result,
        gatewayType: 'fgw14usb',
        baudRate: 57600,
        protocol: 'esp2-fgw14usb-raw',
        receivedFrames,
        ftsFrames,
      });
      try {
        if (port?.isOpen) port.close(() => setTimeout(done, 80));
        else done();
      } catch (_) { done(); }
    };

    const handleParsed = (parsed) => {
      if (!parsed) return;
      ftsFrames += 1;
      const id = parsed.id;
      if (parsed.released) {
        armed.set(id, true);
        return;
      }
      if (!parsed.pressed) return;

      const now = Date.now();
      const wasArmed = armed.get(id) !== false;
      const last = lastCountedAt.get(id) || 0;
      if (!wasArmed && now - last < 250) return;

      armed.set(id, false);
      lastCountedAt.set(id, now);
      const count = (pressCounts.get(id) || 0) + 1;
      pressCounts.set(id, count);
      if (typeof onProgress === 'function') {
        try { onProgress({ id, count, required: 5 }); } catch (_) {}
      }
      console.log('[fts14em-fgw-learn] PRESS', id, `${count}/5`);

      if (count >= 5) {
        finish({ ok: true, id, rorg: '05', data_byte3: 0x70, repeat_count: count });
      }
    };

    const processBuffer = () => {
      while (!resolved && buffer.length >= 2) {
        let start = -1;
        for (let i = 0; i < buffer.length - 1; i += 1) {
          if (buffer[i] === 0xA5 && buffer[i + 1] === 0x5A) { start = i; break; }
        }
        if (start < 0) {
          buffer = buffer.slice(-1);
          return;
        }
        if (start > 0) buffer = buffer.slice(start);
        if (buffer.length < 14) return;
        if (!isValidFixedEsp2Frame(buffer, 0)) {
          buffer = buffer.slice(1);
          continue;
        }

        const frame = buffer.slice(0, 14);
        buffer = buffer.slice(14);
        receivedFrames += 1;
        handleParsed(parseFts14emRpsFrame(frame));
      }
    };

    port.on('error', err => finish({ ok: false, error: 'Serieller Fehler: ' + (err.message || err) }));
    port.on('data', chunk => {
      const rx = chunk.toString('hex').match(/../g)?.join(' ') || '';
      console.log('[fts14em-fgw-learn] RX', portName, rx);
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 8192) buffer = buffer.slice(-4096);
      processBuffer();
    });

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: `Keine FTS14EM-E1-Basis-ID innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden erkannt. ESP2-Rahmen: ${receivedFrames}, passende FTS14EM-Rahmen: ${ftsFrames}.`,
      });
    }, Math.max(5000, Number(timeoutMs) || 30000));

    port.open(err => {
      if (err) return finish({ ok: false, error: `Port ${portName} konnte nicht geöffnet werden: ${err.message || err}` });
      console.log('[fts14em-fgw-learn] LISTEN', portName, '57600 baud');
    });
  });
}


// ─────────────────────────────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────────────────────────────

ipcMain.handle('learn-device-id', async (_, portPath, gatewayType, timeoutMs) => {
  try {
    // Prefer the Python/eltakobus listener for Eltako gateways. FAM14/FGW14
    // need echo handling and ESP2 bus parsing; raw SerialPort reads in JS often
    // miss or misparse button/LRN telegrams.
    const py = await runPythonLearnDeviceId(portPath, gatewayType, timeoutMs || 20000);
    if (py.ok && py.id) return py;

    console.log('[learn-device-id] Python listener failed, falling back to JS raw listener:', py.error);
    const js = await listenForLearnTelegram(portPath, gatewayType, timeoutMs || 20000);
    if (!js.ok && py.error) {
      js.error = `${js.error || 'Keine ID erkannt.'} Python: ${py.error}`;
      js.pythonStderr = py.pythonStderr;
    }
    js.bridge = js.bridge || 'javascript-fallback';
    return js;
  } catch (e) {
    console.error('[learn-device-id]', e);
    return { ok: false, error: 'ID-Auto-Detect fehlgeschlagen: ' + (e.message || e) };
  }
});


ipcMain.handle('learn-fts14em-base-id', async (event, portPath, gatewayType, timeoutMs) => {
  try {
    const type = String(gatewayType || '').toLowerCase();
    const onProgress = progress => event.sender.send('fts14em-learn-progress', progress);

    // FAM14 and FGW14-USB are both wired ESP2 gateways and must use the same
    // RS485SerialInterfaceV2 receive path.  The Python listener keeps the two
    // modes separate for their gateway-specific timing/echo behavior.  Do not
    // bypass eltakobus with a raw SerialPort listener here: that was the FIX69
    // regression which prevented FTS14EM learning through FGW14-USB.
    const result = await runPythonLearnDeviceId(portPath, gatewayType, timeoutMs || 30000, {
      repeatCount: 5,
      requiredRorg: '05',
      requiredDataByte3: 0x70,
      onProgress,
    });
    return result;
  } catch (e) {
    console.error('[learn-fts14em-base-id]', e);
    return { ok: false, error: 'FTS14EM-Basis-ID-Erkennung fehlgeschlagen: ' + (e.message || e) };
  }
});

ipcMain.handle('read-base-id', async (_, portPath, baudRate, protocol) => {
  const proto = protocol || 'esp2';
  if (proto === 'fam14-python' || proto === 'eltakobus-fam14' || proto === 'fam-usb-python' || proto === 'eltakobus-fam-usb' || proto === 'fgw14-python') {
    const isFamUsb = proto === 'fam-usb-python' || proto === 'eltakobus-fam-usb';
    const isFgw14 = proto === 'fgw14-python';
    const detectorMode = isFgw14 ? 'fgw14' : (isFamUsb ? 'fam-usb' : 'fam14');
    const expectedType = isFgw14 ? 'fgw14usb' : (isFamUsb ? 'fam-usb' : 'fam14');
    const py = await runPythonDetector(portPath || '', detectorMode);
    if (py.ok && py.gateway) {
      const detectedType = py.gateway.type || expectedType;
      rememberBusConnection(py.gateway.serial_path || portPath, detectedType, py.gateway.baudRate || 57600);
      if (py.gateway.base_id) return { ok:true, baseId:py.gateway.base_id, gatewayType:detectedType, protocol:py.gateway.protocol, parser:py.gateway.parser, baudRate:py.gateway.baudRate, portPath:py.gateway.serial_path, bridge:'python' };
      if (detectedType === 'fgw14usb') return { ok:true, baseId:'', gatewayType:'fgw14usb', detectedWithoutBaseId:true, protocol:py.gateway.protocol, parser:py.gateway.parser, baudRate:py.gateway.baudRate, portPath:py.gateway.serial_path, bridge:'python' };
    }
    return { ok:false, error:py.error || (isFgw14 ? 'FGW14-USB konnte auf dem angegebenen Port nicht erkannt werden.' : 'Die Gateway-Erkennung lieferte keine Base-ID.'), attempts:py.attempts || [], bridge:'python' };
  }
  const result = await readBaseIdFromPort(portPath, baudRate || 57600, proto, { timeoutMs:1800, retries:3 });
  if (result.ok) return result;
  return { ok:false, error:`${result.error}\nPort: ${portPath}\nBaudrate: ${baudRate || 57600}\nProtokoll: ${proto}`, txFrames:result.txFrames || [], rxFrames:result.rxFrames || [] };
});

ipcMain.handle('detect-gateway', async (_, preferredPath) => {
  try {
    // Preferred path: Python detector with Philipp-Grimm/eltakobus-style FAM14/FAM-USB logic.
    const py = await runPythonDetector(preferredPath || '', 'auto');
    if (py.ok) {
      if (py.gateway) rememberBusConnection(py.gateway.serial_path, py.gateway.type, py.gateway.baudRate || 57600);
      return py;
    }

    // Keep the old JavaScript raw-byte detector as a fallback for systems where
    // Python or eltakobus are not installed yet.
    console.log('[detect-gateway] Python bridge failed, falling back to JS detector:', py.error);
    const js = await detectGatewayOnSerialPorts(preferredPath);
    if (js.ok) {
      js.bridge = 'javascript-fallback';
      js.pythonError = py.error;
      js.pythonAttempts = py.attempts || [];
      return js;
    }
    js.bridge = 'javascript-fallback';
    js.pythonError = py.error;
    return js;
  } catch (e) {
    console.error('[detect-gateway]', e);
    return { ok: false, error: 'Gateway-Erkennung fehlgeschlagen: ' + e.message, ports: [], attempts: [] };
  }
});



ipcMain.handle('disconnect-gateway', async (_, payload) => {
  try {
    const info = payload || {};
    const portPath = info.portPath || info.serial_path || lastBusDisconnectInfo?.portPath || '';
    const gatewayType = info.gatewayType || info.type || lastBusDisconnectInfo?.gatewayType || 'fam14';
    const baudRate = info.baudRate || lastBusDisconnectInfo?.baudRate || 57600;
    const result = await sendBusDisconnect(portPath, gatewayType, baudRate);
    if (result.ok) lastBusDisconnectInfo = null;
    return result;
  } catch (e) {
    console.error('[disconnect-gateway]', e);
    return { ok: false, error: 'Disconnect fehlgeschlagen: ' + (e.message || e) };
  }
});

ipcMain.handle('write-sender-ids-to-devices', async (event, payload) => {
  try {
    return await runPythonWriteSenders(payload || {}, {
      onProgress: (progress) => {
        try { event.sender.send('write-sender-progress', progress); } catch (_) {}
      },
    });
  } catch (e) {
    console.error('[write-sender-ids-to-devices]', e);
    return { ok: false, error: 'Sender-ID Schreiben fehlgeschlagen: ' + (e.message || e) };
  }
});

ipcMain.handle('cancel-write-sender-ids', async () => {
  if (!activeWriteSenderProcess) return { ok: false, running: false };
  try {
    activeWriteSenderProcess.requestCancel();
    return { ok: true, running: true };
  } catch (e) {
    return { ok: false, running: true, error: e.message || String(e) };
  }
});




ipcMain.on('open-device-database', () => createDeviceDatabaseWindow());
ipcMain.on('close-device-database', () => {
  if (deviceDatabaseWindow && !deviceDatabaseWindow.isDestroyed()) deviceDatabaseWindow.close();
});
ipcMain.handle('open-device-database-file', async () => {
  const result = await dialog.showOpenDialog(deviceDatabaseWindow || mainWindow, {
    title: t('menu.deviceDbImport'),
    properties: ['openFile'],
    filters: [
      { name: 'Gerätedatenbank', extensions: ['yaml', 'yml', 'json'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const filePath = result.filePaths[0];
  return { filePath, fileName: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') };
});

ipcMain.handle('save-device-database-file', async (_event, content) => {
  const result = await dialog.showSaveDialog(deviceDatabaseWindow || mainWindow, {
    title: t('menu.deviceDbExport'),
    defaultPath: 'eedtoy-device-database.yaml',
    filters: [
      { name: 'YAML', extensions: ['yaml', 'yml'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, String(content ?? ''), 'utf8');
  return result.filePath;
});

ipcMain.handle('load-device-database', async () => loadDeviceDatabase());
ipcMain.handle('save-device-database', async (_event, database) => {
  try {
    const saved = await saveDeviceDatabase(database);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-database-changed', saved);
    }
    return { ok: true, database: saved, filePath: deviceDatabaseFilePath() };
  } catch (error) {
    console.error('[save-device-database]', error);
    return { ok: false, error: error?.message || String(error), filePath: deviceDatabaseFilePath() };
  }
});
ipcMain.on('device-database-saved', async (_event, database) => {
  try {
    const saved = await saveDeviceDatabase(database);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-database-changed', saved);
    }
    if (deviceDatabaseWindow && !deviceDatabaseWindow.isDestroyed()) deviceDatabaseWindow.close();
  } catch (error) {
    console.error('[device-database-saved]', error);
  }
});

process.on('uncaughtException', error => console.error('[uncaughtException]', error));
process.on('unhandledRejection', error => console.error('[unhandledRejection]', error));

app.whenReady().then(async () => {
  currentLanguage = await loadLanguage();
  buildApplicationMenu();
  createWindow();
});
app.on('before-quit', () => {
  if (lastBusDisconnectInfo) {
    // Best-effort: explicit UI disconnect is preferred, but this sends an RS485
    // bus unlock when the user closes the app after using FAM14/FGW14-USB.
    sendBusDisconnect(lastBusDisconnectInfo.portPath, lastBusDisconnectInfo.gatewayType, lastBusDisconnectInfo.baudRate, { timeoutMs: 1200, closeDelayMs: 50 }).catch(() => {});
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
