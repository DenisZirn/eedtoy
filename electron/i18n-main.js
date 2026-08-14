const MAIN_MESSAGES = {
  de: {
    'menu.file': 'Datei',
    'menu.open': 'Projekt öffnen…',
    'menu.save': 'Projekt speichern',
    'menu.saveAs': 'Projekt speichern unter…',
    'menu.exit': 'Beenden',
    'menu.edit': 'Bearbeiten',
    'menu.undo': 'Rückgängig',
    'menu.redo': 'Wiederholen',
    'menu.cut': 'Ausschneiden',
    'menu.copy': 'Kopieren',
    'menu.paste': 'Einfügen',
    'menu.selectAll': 'Alles auswählen',
    'menu.deviceDatabase': 'Gerätedatenbank…',
    'menu.deviceDbImport': 'Gerätedatenbank importieren…',
    'menu.deviceDbExport': 'Gerätedatenbank exportieren…',
    'menu.closeWindow': 'Fenster schließen',
    'menu.language': 'Sprache',
    'menu.help': 'Hilfe',
    'menu.about': 'Über EEDTOY',
    'menu.aboutTitle': 'Über EEDTOY',

    'about.detail': 'Version {{version}}\n\nEntwickelt von D. Zirnbauer\nKein offizielles Produkt der ELTAKO GmbH\n\nLizenz: GPL-3.0-or-later',

    'project.defaultName': 'EEDTOY-Projekt',
    'project.saveDialogTitle': 'EEDTOY-Projekt speichern unter',
    'project.openDialogTitle': 'EEDTOY-Projekt öffnen',
    'project.filterProject': 'EEDTOY-Projekt',
    'project.filterJson': 'JSON-Datei',
    'project.invalidDocument': 'Die Datei enthält kein gültiges EEDTOY-Projekt.',
    'project.wrongFormat': 'Die Datei ist kein EEDTOY-Projekt.',
    'project.invalidSchema': 'Die Projektdatei hat keine gültige Schema-Version.',
    'project.unsupportedSchema': 'Die Projektdatei verwendet Schema {{schema}}. Diese EEDTOY-Version unterstützt maximal Schema {{maxSchema}}.',
    'project.missingState': 'Der Projektzustand fehlt oder ist beschädigt.',
    'project.invalidDevices': 'Die Geräteliste im Projekt ist beschädigt.',
    'project.invalidGateway': 'Die Gateway-Konfiguration im Projekt ist beschädigt.',
    'project.tooLargeToSave': 'Das Projekt ist größer als 10 MB und kann nicht gespeichert werden.',
    'project.tooLargeToOpen': 'Die Projektdatei ist größer als 10 MB und wird aus Sicherheitsgründen nicht geöffnet.',
    'project.invalidJson': 'Die Projektdatei enthält ungültiges JSON: {{error}}',
  },
  en: {
    'menu.file': 'File',
    'menu.open': 'Open project…',
    'menu.save': 'Save project',
    'menu.saveAs': 'Save project as…',
    'menu.exit': 'Exit',
    'menu.edit': 'Edit',
    'menu.undo': 'Undo',
    'menu.redo': 'Redo',
    'menu.cut': 'Cut',
    'menu.copy': 'Copy',
    'menu.paste': 'Paste',
    'menu.selectAll': 'Select all',
    'menu.deviceDatabase': 'Device database…',
    'menu.deviceDbImport': 'Import device database…',
    'menu.deviceDbExport': 'Export device database…',
    'menu.closeWindow': 'Close window',
    'menu.language': 'Language',
    'menu.help': 'Help',
    'menu.about': 'About EEDTOY',
    'menu.aboutTitle': 'About EEDTOY',

    'about.detail': 'Version {{version}}\n\nDeveloped by D. Zirnbauer\nNot an official product of ELTAKO GmbH\n\nLicense: GPL-3.0-or-later',

    'project.defaultName': 'EEDTOY-Project',
    'project.saveDialogTitle': 'Save EEDTOY project as',
    'project.openDialogTitle': 'Open EEDTOY project',
    'project.filterProject': 'EEDTOY project',
    'project.filterJson': 'JSON file',
    'project.invalidDocument': 'The file does not contain a valid EEDTOY project.',
    'project.wrongFormat': 'The file is not an EEDTOY project.',
    'project.invalidSchema': 'The project file does not contain a valid schema version.',
    'project.unsupportedSchema': 'The project file uses schema {{schema}}. This EEDTOY version supports schema {{maxSchema}} at most.',
    'project.missingState': 'The project state is missing or damaged.',
    'project.invalidDevices': 'The device list in the project is damaged.',
    'project.invalidGateway': 'The gateway configuration in the project is damaged.',
    'project.tooLargeToSave': 'The project is larger than 10 MB and cannot be saved.',
    'project.tooLargeToOpen': 'The project file is larger than 10 MB and will not be opened for security reasons.',
    'project.invalidJson': 'The project file contains invalid JSON: {{error}}',
  },
};

function normalizeLanguage(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'de';
}

function interpolate(template, variables = {}) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function mainText(language, key, variables = {}) {
  const normalized = normalizeLanguage(language);
  const value = MAIN_MESSAGES[normalized]?.[key] ?? MAIN_MESSAGES.de[key] ?? key;
  return interpolate(value, variables);
}

module.exports = {
  MAIN_MESSAGES,
  mainText,
  normalizeLanguage,
};
