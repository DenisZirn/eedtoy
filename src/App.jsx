import { useEffect, useRef, useState } from "react";
import { getStoredLanguage, storeLanguage, translate, translateDeviceLabel, translateDeviceName, translateGroup, translatePlatform, translateRuntimeText } from "./i18n.js";

const APP_VERSION = "1.0.96";


function serializeDeviceDatabaseYaml(database) {
  const lines = [
    "eedtoy_device_database: true",
    "schema_version: 1",
    "devices:",
  ];
  for (const [key, value] of Object.entries(deviceDatabaseEntriesOnly(database))) {
    lines.push(`  - key: ${JSON.stringify(key)}`);
    lines.push(`    value: ${JSON.stringify(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseDeviceDatabaseYaml(text) {
  const result = {};
  let currentKey = null;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("- key:")) {
      currentKey = JSON.parse(line.slice(line.indexOf(":") + 1).trim());
      continue;
    }
    if (line.startsWith("value:") && currentKey != null) {
      const value = JSON.parse(line.slice(line.indexOf(":") + 1).trim());
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid device entry");
      result[currentKey] = value;
      currentKey = null;
    }
  }
  if (!Object.keys(result).length) throw new Error("No devices found");
  result[DEVICE_DB_MODE_KEY] = DEVICE_DB_MODE_AUTHORITATIVE;
  result[DEVICE_DB_SCHEMA_KEY] = DEVICE_DB_SCHEMA_VERSION;
  return result;
}

// ─────────────────────────────────────────────────────────────────
// EEP Database — Eltako Home Assistant Integration
// ─────────────────────────────────────────────────────────────────
const DEFAULT_EEP_DB = {
  // ── Taster / Schalter ────────────────────────────────────────
  "F6-02-01-2CH": { group:"Taster / Schalter", label:"F2T55 – Taster 2-Kanal EU (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", eltako:"F2T55 2-Kanal" },
  "F6-02-01-4CH": { group:"Taster / Schalter", label:"FT55, F4T55E – Taster 4-Kanal EU (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", eltako:"FT55, F4T55E 4-Kanal" },
  "F6-01-01": { group:"Taster / Schalter", label:"FNSN55EB, FNS65EB – Näherungsschalter (F6-01-01)", eep_out:"F6-01-01", platform:"binary_sensor", device_classes:["presence"], default_dc:"presence", eltako:"FNSN55EB, FNS65EB", needs_sender:false },
  "F6-02-01-FTS14EM-UT": { group:"Taster / Schalter", label:"FTS14EM UT", platform:"binary_sensor", eep_out:"F6-02-01", device_family:"FTS14EM", operating_mode:"UT", id_count:10, eltako:"FTS14EM UT" },
  "F6-02-01-FTS14EM-RT": { group:"Taster / Schalter", label:"FTS14EM RT", platform:"binary_sensor", eep_out:"F6-02-01", device_family:"FTS14EM", operating_mode:"RT", id_count:10, eltako:"FTS14EM RT" },

  // ── Kontakte ──────────────────────────────────────────────────
  "D5-00-01": { group:"Kontakt", label:"FTK, FTKB, FFKB, FTKB-gr – Fenster-/Türkontakt (D5-00-01)", platform:"binary_sensor", eep_out:"D5-00-01", teach_in_telegram:"00-00-00-00", device_classes:["window","door","opening"], default_dc:"window", eltako:"FTK, FTKB, FFKB, FTKB-gr" },
  "F6-10-00-FFG7B": { group:"Kontakt", label:"FTKE, FFTE, FFG7B – Fensterkontakt / Fenstergriff (F6-10-00)", platform:"sensor", eep_out:"F6-10-00", teach_in_telegram:"F0", ffg7b_three_state:true, eltako:"FTKE, FFTE, FFG7B" },
  "A5-14-09-FFG7B": { group:"Kontakt", label:"FFG7B – Fensterkontakt / Fenstergriff (A5-14-09)", platform:"sensor", eep_out:"A5-14-09", teach_in_telegram:"50-48-0D-80", ffg7b_three_state:true, eltako:"FFG7B" },

  // ── Bewegungsmelder ───────────────────────────────────────────
  "A5-07-01": { group:"Bewegungsmelder", label:"FBH55ESB, FB55EB – Bewegungsmelder (A5-07-01)", platform:"binary_sensor", eep_out:"A5-07-01", teach_in_telegram:"1C-08-0D-80", device_classes:["motion","occupancy"], default_dc:"motion", eltako:"FBH55ESB, FB55EB" },
  "A5-08-01-FBH-FBHT": { group:"Bewegungsmelder", label:"FBH55ESB / FBHT55ESB – Bewegung + Helligkeit automatisch (A5-08-01)", platform:"sensor", eep_out:"A5-08-01", teach_in_telegram:"20-08-0D-85", eltako:"FBH55ESB, FBHT55ESB", fbht_temperature:true },

  // ── Rauch / Hitze ─────────────────────────────────────────────
  "A5-30-03-FRWB": { group:"Rauch / Hitze", label:"FRWB – Rauchmelder (A5-30-03)", platform:"binary_sensor", eep_out:"A5-30-03", teach_in_telegram:"C0-18-2D-80", device_classes:["smoke"], default_dc:"smoke", eltako:"FRWB" },
  "A5-30-03-FHMB": { group:"Rauch / Hitze", label:"FHMB – Rauch-/Hitzemelder (A5-30-03)", platform:"binary_sensor", eep_out:"A5-30-03", teach_in_telegram:"C0-18-2D-80", device_classes:["smoke","heat"], default_dc:"smoke", eltako:"FHMB" },

  // ── Temperatur / Feuchte ──────────────────────────────────────
  "A5-04-02-FFT60SB": { group:"Temperatur / Feuchte", label:"FFT60SB – Temperatur + Feuchte −20…60 °C (A5-04-02)", platform:"sensor", eep_out:"A5-04-02", teach_in_telegram:"10-10-0D-87", eltako:"FFT60SB" },
  "A5-04-03-FFT60SB": { group:"Temperatur / Feuchte", label:"FFT60SB – Temperatur + Feuchte −20…60 °C (A5-04-03)", platform:"sensor", eep_out:"A5-04-03", teach_in_telegram:"10-18-0D-80", eltako:"FFT60SB" },
  "A5-04-02-FTFSB": { group:"Temperatur / Feuchte", label:"FTFSB – Temperatur + Feuchte −20…60 °C (A5-04-02)", platform:"sensor", eep_out:"A5-04-02", teach_in_telegram:"10-10-0D-87", eltako:"FTFSB" },
  "A5-04-03-FTFSB": { group:"Temperatur / Feuchte", label:"FTFSB – Temperatur + Feuchte −20…60 °C (A5-04-03)", platform:"sensor", eep_out:"A5-04-03", teach_in_telegram:"10-18-0D-80", eltako:"FTFSB" },
  "A5-04-02-FLGTF": { group:"Temperatur / Feuchte", label:"FLGTF – Temperatur + Feuchte −20…60 °C / 0…100 % (A5-04-02)", platform:"sensor", eep_out:"A5-04-02", teach_in_telegram:"10-10-0D-87", eltako:"FLGTF" },

  // ── Luftqualität ──────────────────────────────────────────────
  "A5-09-0C-FLGTF": { group:"Luftqualität", label:"FLGTF – TVOC + Temperatur + Feuchte automatisch (A5-09-0C + A5-04-02)", platform:"sensor", eep_out:"A5-09-0C", teach_in_telegram:"24-60-0D-80", eltako:"FLGTF" },
  "A5-09-04-FCO2TF65": { group:"Luftqualität", label:"FCO2TF65 – CO2 + Temperatur + Feuchte (A5-09-04)", platform:"sensor", eep_out:"A5-09-04", teach_in_telegram:"24-20-0D-80", eltako:"FCO2TF65" },

  // ── Raumregler / Klima ────────────────────────────────────────
  "A5-10-06": { group:"Raumregler / Klima", label:"FHK14 / F4HK14 / FAE14SSR – Heizung/Klima Temperatur + Sollwert + Fan (A5-10-06)", platform:"climate", eep_out:"A5-10-06", needs_sender:true, teach_in_telegram:"40-30-0D-87", sender_eep:"A5-10-06", eltako:"FHK14, F4HK14, FAE14SSR" },
  "A5-10-06-FAE14LPR": { group:"Raumregler / Klima", label:"FAE14LPR – Heizung/Klima wie FAE14SSR (A5-10-06)", platform:"climate", eep_out:"A5-10-06", needs_sender:true, sender_eep:"A5-10-06", teach_in_telegram:"40-30-0D-87", device_family:"FAE14LPR", bidirectional:true, min_target_temperature:16, max_target_temperature:25, eltako:"FAE14LPR" },
  "A5-10-06-FUTH55": { group:"Raumregler / Klima", label:"FUTH55 / FUTH55ED / FUTH65D – Temperaturregler + Sollwert (A5-10-06)", platform:"climate", eep_out:"A5-10-06", needs_sender:true, sender_eep:"A5-10-06", futh55ed_mode:"fhk", teach_in_telegram:"40-30-0D-87", min_target_temperature:12, max_target_temperature:28, eltako:"FUTH55, FUTH55ED, FUTH65D", note:"Für die Sollwertsteuerung muss die Home-Assistant-Sender-ID im FUTH55 eingelernt werden." },
  "A5-10-12-FUTH55-HYGROSTAT": { group:"Raumregler / Klima", label:"FUTH55 / FUTH55ED / FUTH65D – Hygrostat: Temperatur + Feuchte + Sollwert (A5-10-12)", platform:"sensor", eep_out:"A5-10-12", futh55ed_mode:"hygrostat", teach_in_telegram:"40-90-0D-80", eltako:"FUTH55, FUTH55ED, FUTH65D" },
  "A5-10-06-FTR-FHK": { group:"Raumregler / Klima", label:"FTR55/65-Familie – Betriebsart FHK: Soll- und Isttemperatur (A5-10-06)", platform:"sensor", eep_out:"A5-10-06", room_controller_mode:"fhk", teach_in_telegram:"40-30-0D-87", min_target_temperature:12, max_target_temperature:28, frost_temperature:8, eltako:"FTR65DSB, FTR55DSB, FTR55EHB, FTR55ESB, FTR65HB, FTRF65HB, FTR55HB, FTR65SB, FTRF65SB, FTR55SB" },
  "A5-38-08-FTR-TF61": { group:"Raumregler / Klima", label:"FTR55/65-Familie – Betriebsart TF61: Heizanforderung EIN/AUS (A5-38-08)", platform:"binary_sensor", eep_out:"A5-38-08", room_controller_mode:"tf61", teach_in_telegram:"E0-40-0D-80", hysteresis:1, eltako:"FTR65DSB, FTR55DSB, FTR55EHB, FTR55ESB, FTR65HB, FTRF65HB, FTR55HB, FTR65SB, FTRF65SB, FTR55SB" },

  // ── Heizung / Stellantrieb ───────────────────────────────────
  "A5-20-01-FKS-SV": { group:"Heizung / Stellantrieb", label:"FKS-SV – Smart Valve / Heizkörper-Stellantrieb (A5-20-01)", platform:"climate", needs_sender:true, teach_in_telegram:"80-08-0D-80", sender_eep:"A5-20-01", eep_out:"A5-20-01", fks_sv_device:true, eltako:"FKS-SV" },

  // ── Zähler ────────────────────────────────────────────────────
  "A5-12-01": { group:"Zähler", label:"FWZ12, FWZ14, DSZ14 – Funk-/Wechselstromzähler kWh (A5-12-01)", platform:"sensor", eep_out:"A5-12-01", teach_in_telegram:"48-08-0D-80", eltako:"FWZ12, FWZ14, DSZ14" },
  "A5-12-01-F3Z14D": { group:"Zähler", label:"F3Z14D – 3-Kanal-S0-Drehstromzähler (A5-12-01)", platform:"sensor", eep_out:"A5-12-01", teach_in_telegram:"48-08-0D-80", meter_tariffs:"[1]", eltako:"F3Z14D" },

  // ── Wetterstation ─────────────────────────────────────────────
  "A5-13-01": { group:"Wetterstation", label:"FWS61, FWG14MS – Wetterstation Wind + Regen + Temperatur (A5-13-01)", platform:"sensor", eep_out:"A5-13-01", teach_in_telegram:"4C-08-0D-80", eltako:"FWS61, FWG14MS" },

  // ── Licht / Dimmer ────────────────────────────────────────────
  "A5-38-08-FUD14": { group:"Licht / Dimmer", label:"FUD14 – Dimmaktor (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FUD14" },
  "A5-38-08-FDG14": { group:"Licht / Dimmer", label:"FDG14 – DALI-Gateway / Dimmaktor (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", dimming_speed:0, eltako:"FDG14" },
  "A5-38-08-FUD71": { group:"Licht / Dimmer", label:"FUD71 – Dimmaktor (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FUD71" },
  "A5-38-08-FD2G14": { group:"Licht / Dimmer", label:"FD2G14 – DALI-Gateway (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FD2G14" },
  "A5-38-08-FUD61NP-230V": { group:"Licht / Dimmer", label:"FUD61NP-230V – Dimmaktor (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FUD61NP-230V" },
  "A5-38-08-FUD61NPN-230V": { group:"Licht / Dimmer", label:"FUD61NPN-230V – Dimmer/Relais (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FUD61NPN-230V" },
  "A5-38-08-FD62NP-230V": { group:"Licht / Dimmer", label:"FD62NP-230V – Dimmer/Relais (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FD62NP-230V" },
  "A5-38-08-FD62NPN-230V": { group:"Licht / Dimmer", label:"FD62NPN-230V – Dimmer/Relais (A5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"A5-38-08", eltako:"FD62NPN-230V" },

  // ── Licht / RGBW ──────────────────────────────────────────────
  "07-3F-7F-FRGBW14": { group:"Licht / RGBW", label:"FRGBW14 – RGBW/Farbsteuerung freies Profil (07-3F-7F)", platform:"light", needs_sender:true, teach_in_telegram:"FF-F8-0D-87", sender_eep:"07-3F-7F", eep_out:"07-3F-7F", eltako:"FRGBW14", rgbw:true },
  "07-3F-7F-FRGBW71L": { group:"Licht / RGBW", label:"FRGBW71L – RGBW/Farbsteuerung freies Profil (07-3F-7F)", platform:"light", needs_sender:true, teach_in_telegram:"FF-F8-0D-87", sender_eep:"07-3F-7F", eep_out:"07-3F-7F", eltako:"FRGBW71L", rgbw:true },

  // ── Licht / Relais ────────────────────────────────────────────
  "M5-38-08-FSR14-2X": { group:"Licht / Relais", label:"FSR14-2x – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR14-2x" },
  "M5-38-08-FSR14-4X": { group:"Licht / Relais", label:"FSR14-4x – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR14-4x" },
  "M5-38-08-F4SR14-LED": { group:"Licht / Relais", label:"F4SR14-LED – 4-Kanal Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"F4SR14-LED", channels:4 },
  "M5-38-08-FSR71-2X-230V": { group:"Licht / Relais", label:"FSR71-2x-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR71-2x-230V" },
  "M5-38-08-FSR71NP-2X-230V": { group:"Licht / Relais", label:"FSR71NP-2x-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR71NP-2x-230V" },
  "M5-38-08-FSR71NP-4X-230V": { group:"Licht / Relais", label:"FSR71NP-4x-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR71NP-4x-230V", device_family:"FSR71NP-4X-230V", channels:4 },
  "M5-38-08-FMZ14": { group:"Licht / Relais", label:"FMZ14 – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"F6-02-01", eep_out:"M5-38-08", eltako:"FMZ14" },
  "M5-38-08-FSR61-230V": { group:"Licht / Relais", label:"FSR61-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR61-230V" },
  "M5-38-08-FSR61NP-230V": { group:"Licht / Relais", label:"FSR61NP-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR61NP-230V" },
  "M5-38-08-FSR61-8-24VUC": { group:"Licht / Relais", label:"FSR61/8-24V UC – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR61/8-24V UC" },
  "M5-38-08-FSR61G-230V": { group:"Licht / Relais", label:"FSR61G-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR61G-230V" },
  "M5-38-08-FSR61LN-230V": { group:"Licht / Relais", label:"FSR61LN-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FSR61LN-230V" },
  "M5-38-08-FLC61NP-230V": { group:"Licht / Relais", label:"FLC61NP-230V – Relais/Lichtaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FLC61NP-230V" },
  "M5-38-08-FR62-230V": { group:"Licht / Relais", label:"FR62-230V – Relais/Steckdosenaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FR62-230V" },
  "M5-38-08-FR62NP-230V": { group:"Licht / Relais", label:"FR62NP-230V – Relais/Steckdosenaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FR62NP-230V" },
  "M5-38-08-FL62-230V": { group:"Licht / Relais", label:"FL62-230V – Relais/Steckdosenaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FL62-230V" },
  "M5-38-08-FL62NP-230V": { group:"Licht / Relais", label:"FL62NP-230V – Relais/Steckdosenaktor (M5-38-08)", platform:"light", needs_sender:true, teach_in_telegram:"E0-40-0D-80", sender_eep:"A5-38-08", eep_out:"M5-38-08", eltako:"FL62NP-230V" },

  // ── Jalousie / Rollladen ──────────────────────────────────────
  "G5-3F-7F-FSB14": { group:"Jalousie / Rollladen", label:"FSB14, FSB14/12-24V DC – Jalousie / Rollladen (G5-3F-7F)", platform:"cover", needs_sender:true, teach_in_telegram:"FF-F8-0D-80", sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", device_classes:["shutter","blind","awning","curtain"], default_dc:"shutter", eltako:"FSB14, FSB14/12-24V DC" },
  "G5-3F-7F-FSB61-230V": { group:"Jalousie / Rollladen", label:"FSB61-230V – Jalousie / Rollladen (G5-3F-7F)", platform:"cover", needs_sender:true, teach_in_telegram:"FF-F8-0D-80", sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", device_classes:["shutter","blind","awning","curtain"], default_dc:"shutter", eltako:"FSB61-230V" },
  "G5-3F-7F-FSB71-230V": { group:"Jalousie / Rollladen", label:"FSB71-230V – Jalousie / Rollladen (G5-3F-7F)", platform:"cover", needs_sender:true, teach_in_telegram:"FF-F8-0D-80", sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", device_classes:["shutter","blind","awning","curtain"], default_dc:"shutter", eltako:"FSB71-230V" },
  "G5-3F-7F-FSB61NP-230V": { group:"Jalousie / Rollladen", label:"FSB61NP-230V – Jalousie / Rollladen (G5-3F-7F)", platform:"cover", needs_sender:true, teach_in_telegram:"FF-F8-0D-80", sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", device_classes:["shutter","blind","awning","curtain"], default_dc:"shutter", eltako:"FSB61NP-230V" },
  "G5-3F-7F-FJ62-12-36VDC": { group:"Jalousie / Rollladen", label:"FJ62/12-36V DC – Jalousie / Rollladen (G5-3F-7F)", platform:"cover", needs_sender:true, teach_in_telegram:"FF-F8-0D-80", sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", device_classes:["shutter","blind","awning","curtain"], default_dc:"shutter", eltako:"FJ62/12-36V DC" },
  "G5-3F-7F-FJ62NP-230V": { group:"Jalousie / Rollladen", label:"FJ62NP-230V – Jalousie / Rollladen (G5-3F-7F)", platform:"cover", needs_sender:true, teach_in_telegram:"FF-F8-0D-80", sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", device_classes:["shutter","blind","awning","curtain"], default_dc:"shutter", eltako:"FJ62NP-230V" },

  // ── Funk-Modul ────────────────────────────────────────────────
  "F6-02-01-FSM60B-BA1": { group:"Funk-Modul", label:"FSM60B Betriebsart 1 (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", eltako:"FSM60B Betriebsart 1" },
  "F6-02-01-FSM60B-BA2": { group:"Funk-Modul", label:"FSM60B Betriebsart 2 (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", eltako:"FSM60B Betriebsart 2" },
  "A5-30-03-FSM60B-BA3": { group:"Funk-Modul", label:"FSM60B Betriebsart 3 (A5-30-03)", platform:"binary_sensor", eep_out:"A5-30-03", device_classes:["moisture"], default_dc:"moisture", eltako:"FSM60B Betriebsart 3" },
  "A5-30-01-FSM60B-BA4": { group:"Funk-Modul", label:"FSM60B Betriebsart 4 (A5-30-01)", platform:"switch", eep_out:"A5-30-01", eltako:"FSM60B Betriebsart 4" },

  // ── F4USM61B Universal-Sendemodul ────────────────────────────
  "F6-02-01-F4USM61B-M1": { group:"Funk-Modul", label:"F4USM61B – Modus 1: 4-fach-Taster (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", eltako:"F4USM61B Modus 1", device_family:"F4USM61B", operating_mode:1, battery_status:true, battery_eep:"A5-07-01", id_count:1, channels:1, invert:false },
  "A5-38-08-F4USM61B-M2": { group:"Funk-Modul", label:"F4USM61B – Modus 2: 2 × EIN/AUS (A5-38-08)", platform:"binary_sensor", eep_out:"A5-38-08", eltako:"F4USM61B Modus 2", device_family:"F4USM61B", operating_mode:2, battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:false },
  "A5-08-01-F4USM61B-M3": { group:"Funk-Modul", label:"F4USM61B – Modus 3: 2 × Bewegung (A5-08-01)", platform:"sensor", eep_out:"A5-08-01", eltako:"F4USM61B Modus 3", device_family:"F4USM61B", operating_mode:3, id_count:2, channels:2, invert:false },
  "D5-00-01-F4USM61B-M4": { group:"Funk-Modul", label:"F4USM61B – Modus 4: 2 × Fenster-/Türkontakt (D5-00-01)", platform:"binary_sensor", eep_out:"D5-00-01", device_classes:["window","door","opening"], default_dc:"window", eltako:"F4USM61B Modus 4", device_family:"F4USM61B", operating_mode:4, battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:false },
  "F6-02-01-F4USM61B-M5": { group:"Funk-Modul", label:"F4USM61B – Modus 5: 2 × 2-fach-Taster (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", eltako:"F4USM61B Modus 5", device_family:"F4USM61B", operating_mode:5, battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:false },
  "A5-08-01-F4USM61B-M6": { group:"Funk-Modul", label:"F4USM61B – Modus 6: Bewegung invertiert (A5-08-01)", platform:"sensor", eep_out:"A5-08-01", eltako:"F4USM61B Modus 6", device_family:"F4USM61B", operating_mode:6, id_count:2, channels:2, invert:true },
  "D5-00-01-F4USM61B-M7": { group:"Funk-Modul", label:"F4USM61B – Modus 7: Fenster-/Türkontakt invertiert (D5-00-01)", platform:"binary_sensor", eep_out:"D5-00-01", device_classes:["window","door","opening"], default_dc:"window", eltako:"F4USM61B Modus 7", device_family:"F4USM61B", operating_mode:7, battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:true },
  "A5-07-01-F4USM61B-M8": { group:"Funk-Modul", label:"F4USM61B – Modus 8: 2 × Bewegungsmelder (A5-07-01)", platform:"binary_sensor", eep_out:"A5-07-01", device_classes:["motion","occupancy"], default_dc:"motion", eltako:"F4USM61B Modus 8", device_family:"F4USM61B", operating_mode:8, id_count:2, channels:2, invert:false },
};

const DEVICE_DB_STORAGE_KEY = "eedtoy.customDeviceDatabase.v1";
const DEVICE_DB_DELETED_KEYS = "__deleted_keys";
const DEVICE_DB_MODE_KEY = "__eedtoy_database_mode";
const DEVICE_DB_SCHEMA_KEY = "__eedtoy_database_schema";
const DEVICE_DB_SCHEMA_VERSION = 51;
const DEVICE_DB_MODE_AUTHORITATIVE = "authoritative";
const PROFILE_KEY_ALIASES = {
  "07-37-F7-FRGBW14": "07-3F-7F-FRGBW14",
  "07-3F-F7-FRGBW14": "07-3F-7F-FRGBW14",
  "07-37-F7-FRGBW71L": "07-3F-7F-FRGBW71L",
  "07-3F-F7-FRGBW71L": "07-3F-7F-FRGBW71L",
  "A5-10-12-FUTH55ED-HYGROSTAT": "A5-10-12-FUTH55-HYGROSTAT",
  "A5-10-12-FUTH65D-HYGROSTAT": "A5-10-12-FUTH55-HYGROSTAT",
  "F6-02-01-FAE14LPR": "A5-10-06-FAE14LPR",
};

function deviceDatabaseEntriesOnly(database) {
  const source = database && typeof database === "object" && !Array.isArray(database) ? database : {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => ![DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)));
}

function mergeDeviceDatabase(defaults, custom) {
  const stored = custom && typeof custom === "object" && !Array.isArray(custom) ? { ...custom } : {};

  // Once the user has saved the editor, the saved database is the complete and
  // authoritative database. Defaults are no longer merged at startup. This is
  // what makes additions, edits, key renames and deletions survive restarts.
  if (stored[DEVICE_DB_MODE_KEY] === DEVICE_DB_MODE_AUTHORITATIVE) {
    return deviceDatabaseEntriesOnly(stored);
  }

  // Compatibility for databases created by older EEDTOY versions. Those files
  // were sparse overlays and therefore still need the former merge once. The
  // next explicit Save converts them to authoritative format.
  const deletedKeys = Array.isArray(stored[DEVICE_DB_DELETED_KEYS]) ? stored[DEVICE_DB_DELETED_KEYS] : [];
  const legacyEntries = deviceDatabaseEntriesOnly(stored);
  const merged = { ...defaults, ...legacyEntries };
  for (const key of deletedKeys) delete merged[String(key || "").toUpperCase()];
  return merged;
}
function migrateCustomDeviceDatabase(input) {
  const database = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};

  // One-time schema migration for FIX44: the FTFSB profiles were missing from
  // the built-in database in FIX43. Add them once to existing authoritative
  // databases, then record the schema so a later deliberate deletion stays deleted.
  const schemaVersion = Number(database[DEVICE_DB_SCHEMA_KEY] || 0);
  if (database[DEVICE_DB_MODE_KEY] === DEVICE_DB_MODE_AUTHORITATIVE) {
    if (schemaVersion < DEVICE_DB_SCHEMA_VERSION) {
      for (const key of ["A5-04-02-FTFSB", "A5-04-03-FTFSB"]) {
        if (!database[key]) database[key] = { ...DEFAULT_EEP_DB[key] };
      }
      // FIX45: Older databases could store the FUTH55ED/FUTH65D model-specific
      // database key as the YAML EEP. Consolidate those aliases to the verified
      // profile and enforce the actual EnOcean EEP A5-10-12.
      for (const oldKey of ["A5-10-12-FUTH55ED-HYGROSTAT", "A5-10-12-FUTH65D-HYGROSTAT"]) {
        if (database[oldKey]) {
          database["A5-10-12-FUTH55-HYGROSTAT"] = {
            ...DEFAULT_EEP_DB["A5-10-12-FUTH55-HYGROSTAT"],
            ...database[oldKey],
            eep_out: "A5-10-12",
            futh55ed_mode: "hygrostat",
          };
          delete database[oldKey];
        }
      }
      if (database["A5-10-12-FUTH55-HYGROSTAT"]) {
        database["A5-10-12-FUTH55-HYGROSTAT"] = {
          ...database["A5-10-12-FUTH55-HYGROSTAT"],
          eep_out: "A5-10-12",
          futh55ed_mode: "hygrostat",
        };
      }

      // FIX46/FIX48: Teach-in telegrams are editable profile data. Populate
      // newly verified defaults once when upgrading an older authoritative
      // database. After schema 48 has been stored, later user edits (including
      // clearing a value) remain untouched.
      const fix48TeachInKeys = new Set([
        "D5-00-01", "F6-10-00-FFG7B", "A5-14-09-FFG7B",
        "A5-07-01", "A5-08-01-FBH-FBHT", "A5-30-03-FHMB",
        "A5-04-02-FLGTF", "A5-09-0C-FLGTF", "A5-09-04-FCO2TF65",
        "A5-12-01", "A5-12-01-F3Z14D", "A5-13-01",
      ]);
      for (const [key, defaultProfile] of Object.entries(DEFAULT_EEP_DB)) {
        const defaultTeachIn = String(defaultProfile?.teach_in_telegram || "").trim();
        if (!defaultTeachIn) continue;
        if (!database[key] && fix48TeachInKeys.has(key)) {
          database[key] = { ...defaultProfile };
          continue;
        }
        if (!database[key]) continue;
        const currentTeachIn = String(database[key]?.teach_in_telegram || "").trim();
        if (!Object.prototype.hasOwnProperty.call(database[key], "teach_in_telegram") ||
            (schemaVersion < 48 && fix48TeachInKeys.has(key) && !currentTeachIn)) {
          database[key] = { ...database[key], teach_in_telegram: defaultTeachIn };
        }
      }
      // FIX63: FAE14LPR is a two-channel climate actuator and uses the same
      // A5-10-06 controller programming path as FAE14SSR. Migrate the former
      // F6-02-01 sensor-only profile once so existing authoritative databases
      // receive the corrected profile without requiring a database reset.
      if (schemaVersion < 51) {
        const oldFae = database["F6-02-01-FAE14LPR"];
        database["A5-10-06-FAE14LPR"] = {
          ...DEFAULT_EEP_DB["A5-10-06-FAE14LPR"],
          ...(oldFae || database["A5-10-06-FAE14LPR"] || {}),
          platform: "climate",
          eep_out: "A5-10-06",
          needs_sender: true,
          sender_eep: "A5-10-06",
          device_family: "FAE14LPR",
          bidirectional: true,
        };
        delete database["F6-02-01-FAE14LPR"];
      }

      // FIX50: The documented first-ID offset was a manual typo. F4USM61B
      // channel 1 always starts at the original learned ID; remove the obsolete
      // field from every persisted F4USM61B profile.
      for (const [key, profile] of Object.entries(database)) {
        if (String(profile?.device_family || "").toUpperCase() !== "F4USM61B") continue;
        if (Object.prototype.hasOwnProperty.call(profile, "id_offset_start")) {
          const cleaned = { ...profile };
          delete cleaned.id_offset_start;
          database[key] = cleaned;
        }
      }
      database[DEVICE_DB_SCHEMA_KEY] = DEVICE_DB_SCHEMA_VERSION;
    }
    return database;
  }
  const oldFrwb = database["A5-30-01"];
  if (oldFrwb && String(oldFrwb.eltako || oldFrwb.label || "").toUpperCase().includes("FRWB")) {
    delete database["A5-30-01"];
  }
  const oldShared = database["A5-30-03"];
  if (oldShared) {
    const text = String(oldShared.eltako || oldShared.label || "").toUpperCase();
    if (text.includes("FHMB")) database["A5-30-03-FHMB"] = { ...oldShared, eep_out: "A5-30-03" };
    else if (text.includes("FRWB")) database["A5-30-03-FRWB"] = { ...oldShared, eep_out: "A5-30-03" };
    delete database["A5-30-03"];
  }

  // FIX42: Migrate legacy/mistyped RGBW free-profile keys to 07-3F-7F.
  for (const [oldKey, newKey] of Object.entries(PROFILE_KEY_ALIASES)) {
    if (database[oldKey]) {
      database[newKey] = { ...database[oldKey], eep_out:"07-3F-7F", sender_eep:"07-3F-7F" };
      delete database[oldKey];
    }
  }

  // FIX30: Older device databases contained several obsolete FUTH55/FUTH55ED/
  // FUTH65D operating modes. Keep exactly the two verified profiles and remove
  // stale duplicates during startup/import, otherwise old persisted entries
  // reappear even though the built-in database was corrected.
  const allowedFuthKeys = new Set(["A5-10-06-FUTH55", "A5-10-12-FUTH55-HYGROSTAT"]);
  for (const [key, entry] of Object.entries(database)) {
    if ([DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)) continue;
    const text = `${key} ${entry?.label || ""} ${entry?.eltako || ""}`.toUpperCase();
    if (text.includes("FUTH") && !allowedFuthKeys.has(key)) delete database[key];
  }

  // FIX36: FTS14EM UT/RT are authoritative built-in profiles. Remove stale
  // persisted variants so older databases cannot hide or rename these entries.
  for (const key of Object.keys(database)) {
    if ([DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)) continue;
    const entry = database[key] || {};
    const text = `${key} ${entry.label || ""} ${entry.eltako || ""}`.toUpperCase();
    if (text.includes("FTS14EM")) delete database[key];
  }
  return database;
}
function loadCustomDeviceDatabase() {
  try {
    const raw = window.localStorage.getItem(DEVICE_DB_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return migrateCustomDeviceDatabase(parsed);
  } catch (_) { return {}; }
}
let EEP_DB = mergeDeviceDatabase(DEFAULT_EEP_DB, loadCustomDeviceDatabase());


const PC = { binary_sensor:"#22c55e", sensor:"#0ea5e9", light:"#f59e0b", switch:"#a78bfa", cover:"#fb923c", climate:"#f43f5e" };
const PI = { binary_sensor:"🔔", sensor:"📊", light:"💡", switch:"🔌", cover:"🪟", climate:"🌡️" };

const GENERIC_EEP_PROFILES = {
  "A5-38-08": { platform:"light", needs_sender:true, sender_eep:"A5-38-08", eep_out:"A5-38-08" },
  "M5-38-08": { platform:"light", needs_sender:true, sender_eep:"A5-38-08", eep_out:"M5-38-08" },
  "G5-3F-7F": { platform:"cover", needs_sender:true, sender_eep:"H5-3F-7F", eep_out:"G5-3F-7F", default_dc:"shutter" },
  "A5-10-06": { platform:"climate", needs_sender:true, sender_eep:"A5-10-06", eep_out:"A5-10-06" },
  "A5-12-01": { platform:"sensor", needs_sender:false, eep_out:"A5-12-01" },
  "A5-09-0C": { platform:"sensor", needs_sender:false, eep_out:"A5-09-0C" },
  "A5-09-04": { platform:"sensor", needs_sender:false, eep_out:"A5-09-04" },
  "A5-04-02": { platform:"sensor", needs_sender:false, eep_out:"A5-04-02" },
  "A5-07-01": { platform:"binary_sensor", needs_sender:false, eep_out:"A5-07-01", default_dc:"motion" },
  "A5-08-01": { platform:"sensor", needs_sender:false, eep_out:"A5-08-01" },
  "A5-20-01": { platform:"climate", needs_sender:true, sender_eep:"A5-20-01", eep_out:"A5-20-01" },
  "A5-20-04": { platform:"sensor", needs_sender:false, eep_out:"A5-20-04" },
  "A5-14-09": { platform:"sensor", needs_sender:false, eep_out:"A5-14-09", ffg7b_three_state:true },
  "07-3F-7F": { platform:"light", needs_sender:true, sender_eep:"07-3F-7F", eep_out:"07-3F-7F" },
  "07-37-F7": { platform:"light", needs_sender:true, sender_eep:"07-3F-7F", eep_out:"07-3F-7F" },
  "07-3F-F7": { platform:"light", needs_sender:true, sender_eep:"07-3F-7F", eep_out:"07-3F-7F" },
};

function profileFor(eep) {
  const key = String(eep || "").toUpperCase();
  const resolvedKey = PROFILE_KEY_ALIASES[key] || key;
  return EEP_DB[resolvedKey] || GENERIC_EEP_PROFILES[resolvedKey] || {};
}

function normalizeProfileSearchText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function resolveProfileKeyForDevice(device) {
  if (!device || typeof device !== "object") return "";

  const storedProfileKey = String(device.profile_key || "").toUpperCase();
  const aliasedProfileKey = PROFILE_KEY_ALIASES[storedProfileKey] || storedProfileKey;
  if (EEP_DB[aliasedProfileKey]) return aliasedProfileKey;

  const storedEep = String(device.eep || "");
  if (EEP_DB[storedEep]) return storedEep;

  const descriptor = normalizeProfileSearchText([
    device.device_type,
    device.model,
    device.eltako,
    device.device_family,
    device.name,
  ].filter(Boolean).join(" "));
  const storedPlatform = String(device.platform || "").toLowerCase();
  const storedSenderEep = String(device.sender_eep || "").toUpperCase();

  const candidates = Object.entries(EEP_DB).filter(([key, profile]) => {
    const outputEep = String(profile.eep_out || key).toUpperCase();
    return outputEep === storedEep.toUpperCase();
  });

  let bestKey = "";
  let bestScore = -1;
  for (const [key, profile] of candidates) {
    let score = 0;
    const profilePlatform = String(profile.platform || "").toLowerCase();
    const profileSenderEep = String(profile.sender_eep || "").toUpperCase();
    const profileFamily = normalizeProfileSearchText(profile.device_family);
    const profileNames = [profile.eltako, profile.label]
      .filter(Boolean)
      .flatMap(value => String(value).split(/[,/]/))
      .map(normalizeProfileSearchText)
      .filter(value => value.length >= 3);

    if (storedPlatform && profilePlatform === storedPlatform) score += 20;
    if (storedSenderEep && profileSenderEep === storedSenderEep) score += 15;
    if (profileFamily && descriptor.includes(profileFamily)) score += 80;
    for (const name of profileNames) {
      if (descriptor === name) score += 160;
      else if (descriptor.includes(name)) score += 100;
      else if (name.includes(descriptor) && descriptor.length >= 4) score += 60;
    }
    // Prefer a device-specific database entry over a generic EEP fallback.
    if (key !== storedEep) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  // A unique EEP candidate is safe even for older projects without model data.
  if (candidates.length === 1) return candidates[0][0];
  // For ambiguous EEPs require an identifying model/name match. Never silently
  // fall back to the first select option (F2T55).
  return bestScore >= 60 ? bestKey : "";
}

function normalizeLoadedDeviceProfile(device) {
  const normalized = { ...emptyForm, ...(device || {}) };
  const profileKey = resolveProfileKeyForDevice(normalized);
  return profileKey ? { ...normalized, eep: profileKey, profile_key: profileKey } : normalized;
}

// Apply the current device-database profile before editing or YAML export.
// Project-specific values (IDs, custom name, room, channel, timings, sender ID)
// remain untouched; profile-controlled values always come from the current DB.
function applyCurrentDatabaseProfile(device) {
  const normalized = normalizeLoadedDeviceProfile(device);
  const profileKey = resolveProfileKeyForDevice(normalized);
  if (!profileKey) return normalized;
  const profile = EEP_DB[profileKey] || {};
  const instanceValues = {
    dev_id: normalized.dev_id,
    sender_id: normalized.sender_id,
    name: normalized.name,
    room: normalized.room,
    channel: normalized.channel,
    base_id: normalized.base_id,
    id_range: normalized.id_range,
    input_number: normalized.input_number,
    physical_unique_id: normalized.physical_unique_id,
    time_opens: normalized.time_opens,
    time_closes: normalized.time_closes,
    device_class: normalized.device_class,
    meter_tariffs: normalized.meter_tariffs,
    min_target_temperature: normalized.min_target_temperature,
    max_target_temperature: normalized.max_target_temperature,
  };
  return {
    ...normalized,
    ...profile,
    ...Object.fromEntries(Object.entries(instanceValues).filter(([, value]) => value !== undefined && value !== null && value !== "")),
    profile_key: profileKey,
    eep: profileKey,
    platform: profile.platform || normalized.platform,
    sender_eep: profile.sender_eep || "",
    device_family: profile.device_family || "",
    device_type: profile.eltako || normalized.device_type,
    model: profile.eltako || normalized.model,
    eltako: profile.eltako || normalized.eltako,
  };
}

function deviceTypeForDevice(device) {
  const p = profileFor(device?.eep);
  return device?.device_type || device?.model || device?.eltako || p.eltako || String(device?.name || "").split(" ")[0] || "Gerät";
}

function isRgbwDevice(device) {
  const p = profileFor(device?.eep);
  const typeText = `${deviceTypeForDevice(device)} ${device?.name || ""} ${device?.eep || ""}`.toUpperCase();
  return Boolean(p.rgbw || typeText.includes("FRGBW") || ["07-3F-7F","07-37-F7","07-3F-F7"].includes(String(device?.eep || "").toUpperCase()));
}

function orderedGatewayBlocks(gateway, extraGateways = []) {
  const gatewayOrder = { fam14: 1, "fam-usb": 2, fgw14usb: 3 };
  return [gateway, ...extraGateways]
    .filter(Boolean)
    .filter((gw, idx, arr) => arr.findIndex(x => x.type === gw.type && (x.base_id || "") === (gw.base_id || "")) === idx)
    .sort((a, b) => (gatewayOrder[a.type] || 99) - (gatewayOrder[b.type] || 99));
}

function gatewayKey(gw) {
  return `${gw?.type || ""}|${gw?.base_id || ""}`;
}


const FTS14EM_ID_RANGES = [
  { value: "1", label: "1", baseId: "00-00-10-01" },
  { value: "101", label: "101", baseId: "00-00-11-01" },
  { value: "201", label: "201", baseId: "00-00-12-01" },
  { value: "301", label: "301", baseId: "00-00-13-01" },
  { value: "401", label: "401", baseId: "00-00-14-01" },
];

function fts14emBaseIdForRange(range) {
  return FTS14EM_ID_RANGES.find(item => item.value === String(range || "1"))?.baseId || "00-00-10-01";
}

function fts14emRangeForBaseId(id) {
  const normalized = normalizeId(id);
  return FTS14EM_ID_RANGES.find(item => item.baseId === normalized)?.value || "";
}

function addFts14emInputOffset(id, offset) {
  const normalized = normalizeId(id);
  const match = normalized.match(/^00-00-(10|11|12|13|14)-01$/);
  if (!match) return "";
  const inputNumber = Number(offset || 0) + 1;
  if (inputNumber < 1 || inputNumber > 10) return "";
  return `00-00-${match[1]}-${String(inputNumber).padStart(2, "0")}`;
}

function addIdOffset(id, offset) {
  const clean = String(id || "").replace(/-/g, "");
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) return "";
  const value = (parseInt(clean, 16) + Number(offset || 0)) >>> 0;
  return [24,16,8,0].map(shift => ((value >>> shift) & 0xff).toString(16).padStart(2, "0").toUpperCase()).join("-");
}

function exportEepForDevice(device) {
  const rawEep = String(device?.eep || "").toUpperCase();
  if (/^A5-10-12-FUTH(?:55|55ED|65D).*HYGROSTAT$/.test(rawEep)) return "A5-10-12";
  const profile = profileFor(rawEep);
  return profile.eep_out ?? rawEep.replace(/-SW$/, "");
}

function isFlgtfDevice(device) {
  const text = `${device?.name || ""} ${device?.device_type || ""} ${device?.model || ""} ${device?.eltako || ""}`.toUpperCase();
  return text.includes("FLGTF") || String(device?.eep || "").includes("FLGTF");
}

function flgtfBaseName(name, suffix) {
  const clean = String(name || "FLGTF").replace(/\s+(TVOC|LUFTGÜTE|LUFTGUETE|TEMPERATUR\s*\+?\s*FEUCHTE|TEMPERATUR|FEUCHTE)$/i, "").trim();
  return `${clean || "FLGTF"} ${suffix}`.trim();
}


function normalizeId(id) {
  const clean = String(id || "").trim().toUpperCase();
  return /^[0-9A-F]{2}(-[0-9A-F]{2}){3}$/.test(clean) ? clean : "";
}

function isFksSvDevice(device) {
  const profile = profileFor(device?.eep);
  return Boolean(profile.fks_sv_device || String(device?.name || "").toUpperCase().includes("FKS-SV"));
}

function isFbhOperatingMode(device) {
  const eep = exportEepForDevice(device);
  return eep === "A5-07-01" || eep === "A5-08-01";
}

function isRoomControllerOperatingMode(device) {
  const profile = profileFor(device?.eep);
  return Boolean(profile.room_controller_mode || profile.futh55ed_mode);
}

function duplicateDeviceKey(device) {
  const id = normalizeId(device?.dev_id);
  const eep = exportEepForDevice(device);
  if (!id || !eep) return "";
  // A5-07-01 (TF mode) and A5-08-01 (FBH mode) are mutually exclusive
  // operating modes of the same FBH55ESB/FBHT55ESB transmitter. Exporting
  // both for one physical ID makes the integration lookup ambiguous.
  if (isFbhOperatingMode(device)) return `${id}|FBH-BETRIEBSART`;
  if (isRoomControllerOperatingMode(device)) return `${id}|RAUMREGLER-BETRIEBSART`;
  return `${id}|${eep}`;
}

function deduplicateExportDevices(devices) {
  const result = [];
  const indexByKey = new Map();
  let removed = 0;
  for (const device of devices || []) {
    const key = duplicateDeviceKey(device);
    if (!key) {
      result.push(device);
      continue;
    }
    if (indexByKey.has(key)) {
      // The last row is the deliberate user choice. This fixes cases where an
      // older generic "Fensterkontakt" row and a later FTKE row have the same
      // physical ID and EEP.
      result[indexByKey.get(key)] = device;
      removed += 1;
      continue;
    }
    indexByKey.set(key, result.length);
    result.push(device);
  }
  return { devices: result, removed };
}

function senderIdFromOffsetForGateway(gw, offset) {
  if (!Number.isInteger(offset) || offset < 1 || offset > 0x7F) return "";
  if (gw?.type === "fam14" || gw?.type === "fgw14usb") return busIdFromAddress(0xB000 + offset);
  if (gw?.base_id) return addToBaseId(gw.base_id, offset);
  return "";
}

function fksSenderIdForGateway(device, gw) {
  const offset = senderOffsetFromId(device?.sender_id);
  return senderIdFromOffsetForGateway(gw, offset) || normalizeId(device?.sender_id);
}

function usedControllerIdsForGateway(devices, gw, pct14BaseId = "", excludeDevice = null) {
  const used = new Set();
  for (const device of devices || []) {
    if (device === excludeDevice) continue;
    const physical = normalizeId(deviceIdForGateway(device, gw, pct14BaseId));
    if (physical) used.add(physical);
    const profile = profileFor(device?.eep);
    if (!profile.needs_sender || isFksSvDevice(device)) continue;
    const sender = normalizeId(senderIdForGateway(device, gw, pct14BaseId));
    if (sender) used.add(sender);
  }
  return used;
}

function allocateFreeSenderId(gw, used) {
  for (let offset = 1; offset <= 0x7F; offset++) {
    const candidate = normalizeId(senderIdFromOffsetForGateway(gw, offset));
    if (candidate && !used.has(candidate)) return candidate;
  }
  return "";
}

function normalizeFksSenderAssignments(gateway, devices, pct14BaseId = "") {
  const deduped = deduplicateExportDevices(devices).devices;
  const used = usedControllerIdsForGateway(deduped, gateway, pct14BaseId);
  let changed = 0;
  const normalized = deduped.map(device => {
    if (!isFksSvDevice(device)) return device;
    let candidate = normalizeId(fksSenderIdForGateway(device, gateway));
    if (!candidate || used.has(candidate)) candidate = allocateFreeSenderId(gateway, used);
    if (!candidate) return device;
    used.add(candidate);
    if (normalizeId(device.sender_id) !== candidate || String(device.sender_eep || "").toUpperCase() !== "A5-20-01") changed += 1;
    return { ...device, sender_id: candidate, sender_eep: "A5-20-01" };
  });
  return { devices: normalized, changed };
}

function expandFlgtfExportDevices(devices) {
  const result = [];
  const has = (id, eepOut) => result.some(d => String(d.dev_id || "").toUpperCase() === String(id || "").toUpperCase() && exportEepForDevice(d) === eepOut);

  for (const device of devices || []) {
    if (!isFlgtfDevice(device)) {
      result.push(device);
      continue;
    }

    const eepOut = exportEepForDevice(device);
    const baseName = flgtfBaseName(device.name, "").trim() || "FLGTF";

    if (eepOut === "A5-09-0C") {
      const tvocDevice = {
        ...device,
        name: baseName,
        device_type: "FLGTF",
        model: "FLGTF",
        eltako: "FLGTF",
      };
      if (!has(tvocDevice.dev_id, "A5-09-0C")) result.push(tvocDevice);

      const tempHumidityId = addIdOffset(device.dev_id, 1);
      if (tempHumidityId && !has(tempHumidityId, "A5-04-02")) {
        result.push({
          ...device,
          dev_id: tempHumidityId,
          eep: "A5-04-02",
          name: baseName,
          platform: "sensor",
          device_type: "FLGTF",
          model: "FLGTF",
          eltako: "FLGTF",
          sender_id: "",
          sender_eep: "",
        });
      }
      continue;
    }

    // FLGTF temperature/humidity-only mode (A5-04-02) is also selectable.
    // Keep the physical name stable so Home Assistant groups it consistently.
    result.push({
      ...device,
      name: baseName,
      device_type: "FLGTF",
      model: "FLGTF",
      eltako: "FLGTF",
    });
  }

  return result;
}


function expandMultiIdExportDevices(devices) {
  const result = [];
  for (const device of devices || []) {
    const profile = profileFor(device?.eep);
    const family = String(profile.device_family || device?.device_family || "").toUpperCase();

    if (family === "FTS14EM") {
      const baseName = String(device.name || "FTS14EM").replace(/\s+E(?:ingang\s*)?\d+$/i, "").trim();
      const baseId = normalizeId(device.dev_id);
      const mode = String(device.operating_mode || profile.operating_mode || "UT").toUpperCase();
      for (let index = 0; index < 10; index += 1) {
        const id = addFts14emInputOffset(device.dev_id, index);
        if (!id) continue;
        result.push({
          ...device,
          dev_id: id,
          name: `${baseName} E${index + 1}`,
          device_type: "FTS14EM",
          model: "FTS14EM",
          eltako: "FTS14EM",
          device_family: "FTS14EM",
          operating_mode: mode,
          base_id: baseId,
          id_range: String(device.id_range || fts14emRangeForBaseId(baseId) || "1"),
          input_number: index + 1,
          invert: Boolean(device.invert),
        });
      }
      continue;
    }

    const normalizedDeviceName = String(device?.name || device?.device_type || device?.model || device?.eltako || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const isFsr71FourChannel = family === "FSR71NP-4X-230V"
      || family === "FSR71-4X-230V"
      || normalizedDeviceName.includes("FSR714X230V")
      || normalizedDeviceName.includes("FSR71NP4X230V");

    if (isFsr71FourChannel) {
      const baseName = "FSR71NP-4x-230V";
      const channelCount = 4;
      for (let index = 0; index < channelCount; index += 1) {
        const channelDeviceId = addIdOffset(device.dev_id, index);
        const channelSenderId = addIdOffset(device.sender_id, index);
        if (!channelDeviceId || !channelSenderId) continue;
        result.push({
          ...device,
          dev_id: channelDeviceId,
          sender_id: channelSenderId,
          name: `${baseName} Kanal ${index + 1}`,
          device_type: baseName,
          model: baseName,
          eltako: baseName,
          device_family: "FSR71NP-4X-230V",
          channel: index + 1,
          base_id: normalizeId(device.dev_id),
          sender_base_id: normalizeId(device.sender_id),
        });
      }
      continue;
    }

    const isF4usm = family === "F4USM61B";
    if (!isF4usm) {
      result.push(device);
      continue;
    }

    const modeFromProfileKey = Number(String(device?.eep || "").match(/-F4USM61B-M([1-8])$/i)?.[1] || 0);
    const operatingMode = Number(device?.operating_mode || modeFromProfileKey || profile.operating_mode || 0);

    // F4USM61B channel IDs always start at the original learned ID.
    // Channel 1 = Base-ID, channel 2 = Base-ID + 1.
    const defaultCount = operatingMode === 1 ? 1 : 2;
    const configuredCount = device?.id_count ?? profile.id_count ?? defaultCount;
    const count = Math.max(1, Math.min(2, Number(configuredCount)));
    const baseName = String(device.name || profile.eltako || "F4USM61B").replace(/\s+Kanal\s+\d+$/i, "").trim();

    const baseId = normalizeId(device.dev_id);
    const physicalId = normalizeId(device.physical_unique_id);
    const usesSeparateBatteryId = [1, 2, 4, 5, 7].includes(operatingMode);

    for (let index = 0; index < count; index += 1) {
      const id = addIdOffset(device.dev_id, index);
      if (!id) continue;
      result.push({
        ...device,
        dev_id: id,
        name: count > 1 ? `${baseName} Kanal ${index + 1}` : baseName,
        device_type: "F4USM61B",
        model: "F4USM61B",
        eltako: "F4USM61B",
        device_family: "F4USM61B",
        operating_mode: operatingMode,
        base_id: baseId,
        physical_unique_id: usesSeparateBatteryId ? physicalId : undefined,
        invert: false,
        channel: index + 1,
      });
    }
  }
  return result;
}

// ─── YAML Generator — grimmpp eltako: format ─────────────────────
function generateYaml(gateway, devices, extraGateways = [], pct14BaseId = "", language = "de") {
  if (!devices.length) return "";
  // Resolve every device against the current database at export time. This makes
  // edits to EEP, sender EEP, platform and profile options immediately effective
  // for already imported or loaded projects instead of exporting stale snapshots.
  const currentDevices = devices.map(applyCurrentDatabaseProfile);
  const deduplication = deduplicateExportDevices(currentDevices);
  const exportDevices = expandMultiIdExportDevices(expandFlgtfExportDevices(deduplication.devices));

  const byPlat = {};
  for (const d of exportDevices) {
    if (!byPlat[d.platform]) byPlat[d.platform] = [];
    byPlat[d.platform].push(d);
  }

  let out = `# ============================================================\n`;
  out += `# EEDTOY – ELTAKO EnOcean Device to YAML Generator\n`;
  out += `# Author: D. Zirnbauer\n`;
  out += `# Version: ${APP_VERSION}\n`;
  const generatedLabel = language === "en" ? "Generated" : "Generiert";
  const generatedLocale = language === "en" ? "en-GB" : "de-DE";
  out += `# ${generatedLabel}: ${new Date().toLocaleString(generatedLocale)}\n`;
  out += `# Home Assistant ELTAKO YAML Export\n`;
  out += `# ============================================================\n\n`;

  out += `eltako:\n`;
  out += `  gateway:\n`;

  const gatewayBlocks = orderedGatewayBlocks(gateway, extraGateways);

  const writeGatewayBlock = (gw, index) => {
    // Format bewusst wie in der Grimm/Home-Assistant-Eltako-Konfiguration:
    // gateway: gefolgt von einer Sequenz auf derselben YAML-Ebene.
    out += `  - id: ${index + 1}\n`;
    out += `    device_type: ${gw.type}\n`;
    if (gw.base_id && GATEWAY_TYPES.find(g=>g.value===gw.type)?.has_base_id)
      out += `    base_id: ${gw.base_id}\n`;
    // serial_path wird nicht exportiert; der Port wird im HA-Config-Flow gewählt.
    out += `    devices:\n`;

    const ORDER = ["light","switch","cover","sensor","binary_sensor","climate"];
    for (const plat of ORDER) {
      const platformDevices = (byPlat[plat] || []).filter(d => {
        const p = profileFor(d.eep);
        const family = String(p.device_family || d.device_family || "").toUpperCase();
        return !(family === "FTS14EM" && String(gw.type || "").toLowerCase() === "fam-usb");
      });
      if (!platformDevices.length) continue;
      out += `      ${plat}:\n`;
      for (const d of platformDevices) {
        const p = profileFor(d.eep);
        const eepOut = exportEepForDevice(d);
        const exportDevId = deviceIdForGateway(d, gw, pct14BaseId);
        const exportSenderId = senderIdForGateway(d, gw, pct14BaseId);
        out += `      - id: "${exportDevId}"\n`;
        out += `        eep: "${eepOut}"\n`;
        out += `        name: "${d.name}"\n`;
        const deviceFamily = String(p.device_family || d.device_family || "").toUpperCase();
        if (deviceFamily === "FTS14EM") {
          out += `        device_family: FTS14EM\n`;
          out += `        operating_mode: "${String(d.operating_mode || p.operating_mode || "UT").toUpperCase()}"\n`;
          if (d.base_id) out += `        base_id: "${d.base_id}"\n`;
          if (d.id_range) out += `        id_range: "${d.id_range}"\n`;
          if (d.input_number) out += `        input_number: ${Number(d.input_number)}\n`;
          if (d.invert) out += `        inverted: true\n`;
        }
        if (deviceFamily === "FAE14LPR") {
          out += `        device_family: FAE14LPR\n`;
        }
        if (deviceFamily === "FSR71NP-4X-230V" || deviceFamily === "FSR71-4X-230V") {
          out += `        device_family: FSR71NP-4x-230V\n`;
          if (d.channel) out += `        channel: ${Number(d.channel)}\n`;
        }
        if (deviceFamily === "F4USM61B") {
          const operatingMode = Number(d.operating_mode || p.operating_mode || 0);
          out += `        device_family: F4USM61B\n`;
          if (operatingMode) out += `        operating_mode: ${operatingMode}\n`;
          if (d.base_id) out += `        base_id: "${d.base_id}"\n`;
          if (d.physical_unique_id) out += `        physical_unique_id: "${d.physical_unique_id}"\n`;
          // F4USM61B inversion is defined exclusively by operating_mode in the HA integration.
          // Do not export a generic inverted flag, which can cause double inversion.
        }
        if (p.fbht_temperature) out += `        fbht_temperature: true\n`;
        if (p.ffg7b_three_state) out += `        ffg7b_three_state: true\n`;
        if (p.futh55ed_mode) out += `        futh55ed_mode: "${p.futh55ed_mode}"\n`;
        if (p.room_controller_mode) out += `        room_controller_mode: "${p.room_controller_mode}"\n`;
        if (p.teach_in_telegram) out += `        teach_in_telegram: "${p.teach_in_telegram}"\n`;
        if (p.hysteresis != null) out += `        hysteresis: ${p.hysteresis}\n`;
        if (p.frost_temperature != null) out += `        frost_temperature: ${p.frost_temperature}\n`;
        if (p.dimming_speed != null) out += `        dimming_speed: ${p.dimming_speed}\n`;
        if (p.room_controller_mode && p.min_target_temperature != null) out += `        min_target_temperature: ${p.min_target_temperature}\n`;
        if (p.room_controller_mode && p.max_target_temperature != null) out += `        max_target_temperature: ${p.max_target_temperature}\n`;
        if (p.bidirectional) out += `        bidirectional: true\n`;
        // Die Grimm-Integration erwartet hier keine freie comment-Eigenschaft.
        // Zur Nachvollziehbarkeit bleibt sie als YAML-Kommentar erhalten.
        if (d.room)        out += `        #comment: "${d.room}"\n`;
        if (plat === "sensor" && eepOut === "A5-12-01") {
          out += `        meter_tariffs: ${d.meter_tariffs || p.meter_tariffs || "[]"}\n`;
        }
        if (plat === "cover") {
          out += `        device_class: ${d.device_class || p.default_dc || "shutter"}\n`;
        }
        if (plat === "binary_sensor" && (d.device_class || p.default_dc)) {
          out += `        device_class: ${d.device_class || p.default_dc}\n`;
        }
        if (p.needs_sender) {
          out += `        sender:\n`;
          out += `          id: "${exportSenderId || d.sender_id || "00-00-B0-01"}"\n`;
          out += `          eep: "${p.sender_eep || d.sender_eep || eepOut}"\n`;
        }
        if (plat === "cover") {
          out += `        time_closes: ${d.time_closes || 25}\n`;
          out += `        time_opens: ${d.time_opens || 25}\n`;
        }
        if (plat === "climate") {
          // Grimm/Home-Assistant-Eltako erwartet beim FHK14 die Temperaturangaben
          // im gleichen Format wie der originale Generator, hier bewusst in Celsius.
          out += `        temperature_unit: '°C'\n`;
          out += `        min_target_temperature: ${d.min_target_temperature || 16}\n`;
          out += `        max_target_temperature: ${d.max_target_temperature || 25}\n`;
        }
        out += `\n`;
      }
    }
  };

  gatewayBlocks.forEach(writeGatewayBlock);
  return out;
}

const GATEWAY_TYPES = [
  { value:"fam-usb",  label:"Eltako FAM-USB",  descKey:"gateway.desc.famUsb", has_base_id:true, has_serial:true, has_lan:false, baud:9600, proto:"fam-usb-python" },
  { value:"fam14",    label:"Eltako FAM14",     descKey:"gateway.desc.fam14", has_base_id:true, has_serial:true, has_lan:false, baud:57600, proto:"fam14-python" },
  { value:"fgw14usb", label:"Eltako FGW14-USB", descKey:"gateway.desc.fgw14Usb", has_base_id:true, has_serial:true, has_lan:false, baud:57600, proto:"fgw14-python" },
];



// ─── PCT14 XML Import ─────────────────────────────────────────────
function byteIdFromDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const bytes = [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  return bytes.map(b => b.toString(16).padStart(2, "0").toUpperCase()).join("-");
}

function idFromBytes(bytes) {
  return bytes.map(b => Number(b).toString(16).padStart(2, "0").toUpperCase()).join("-");
}

function addToBaseId(baseId, offset) {
  const clean = (baseId || "").replace(/-/g, "");
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) return "";
  const value = (parseInt(clean, 16) + Number(offset || 0)) >>> 0;
  return [24,16,8,0].map(shift => ((value >>> shift) & 0xff).toString(16).padStart(2, "0").toUpperCase()).join("-");
}


function busIdFromAddress(offset) {
  const value = Number(offset || 0) >>> 0;
  return [24,16,8,0].map(shift => ((value >>> shift) & 0xff).toString(16).padStart(2, "0").toUpperCase()).join("-");
}

function addressFromBusId(id) {
  const clean = String(id || "").replace(/-/g, "");
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) return null;
  return parseInt(clean, 16) >>> 0;
}

function isPct14ImportedDevice(device) {
  return /PCT14\s+(Adresse|address)\b/i.test(String(device?.room || ""));
}

function deviceIdForGateway(device, gw, pct14BaseId) {
  const offset = addressFromBusId(device.dev_id);
  if (offset == null || !isPct14ImportedDevice(device)) return device.dev_id;
  if (gw?.type === "fam-usb" && pct14BaseId) {
    return addToBaseId(pct14BaseId, offset) || device.dev_id;
  }
  return busIdFromAddress(offset);
}

function senderIdForGateway(device, gw, pct14BaseId) {
  if (isFksSvDevice(device)) return fksSenderIdForGateway(device, gw);
  const offset = addressFromBusId(device.dev_id);
  if (offset == null || !isPct14ImportedDevice(device)) return device.sender_id;
  if (gw?.type === "fam-usb" && gw.base_id && pct14BaseId) {
    return addToBaseId(gw.base_id, offset) || device.sender_id;
  }
  return busIdFromAddress(0xB000 + offset);
}

function busDeviceIdForProgramming(device, pct14BaseId) {
  const offset = addressFromBusId(device.dev_id);
  if (offset == null || !isPct14ImportedDevice(device) || !pct14BaseId) return "";
  return addToBaseId(pct14BaseId, offset);
}

function buildSenderProgrammingEntries(devices, targetGateways, pct14BaseId) {
  const gateways = Array.isArray(targetGateways) ? targetGateways.filter(Boolean) : [targetGateways].filter(Boolean);
  if (!gateways.length || !pct14BaseId) return [];

  const entries = [];
  const seen = new Set();
  for (const d of devices || []) {
    const p = profileFor(d.eep);
    if (!p.needs_sender || !isPct14ImportedDevice(d)) continue;

    const device_id = busDeviceIdForProgramming(d, pct14BaseId);
    const sender_eep = String(d.sender_eep || p.sender_eep || p.eep_out || d.eep || "").trim().toUpperCase();
    if (!device_id || !sender_eep) continue;

    for (const targetGateway of gateways) {
      const sender_id = senderIdForGateway(d, targetGateway, pct14BaseId);
      if (!sender_id) continue;
      const requirementKey = `${device_id}|${sender_id}|${sender_eep}`;
      if (seen.has(requirementKey)) continue;
      seen.add(requirementKey);

      entries.push({
        device_id,
        sender_id,
        sender_eep,
        device_eep: d.eep || p.eep_out || p.eep || "",
        device_type: deviceTypeForDevice(d),
        platform: d.platform || p.platform || "",
        name: d.name || device_id,
        source_gateway_type: targetGateway.type || "",
        source_gateway_base_id: targetGateway.base_id || "",
      });
    }
  }
  return entries;
}

function senderOffsetFromId(id) {
  const clean = String(id || "").replace(/-/g, "");
  if (!/^[0-9a-fA-F]{8}$/.test(clean)) return null;
  return parseInt(clean.slice(-2), 16);
}

function nextFreeSenderOffset(deviceList) {
  const used = new Set();
  for (const device of deviceList || []) {
    for (const value of [device?.sender_id, device?.dev_id]) {
      const offset = senderOffsetFromId(value);
      if (Number.isInteger(offset) && offset > 0 && offset <= 0x7F) used.add(offset);
    }
  }
  for (let i = 1; i <= 0x7F; i++) {
    if (!used.has(i)) return i;
  }
  return 1;
}

function autoSenderIdForGateway(gw, deviceList) {
  const offset = nextFreeSenderOffset(deviceList);
  if (gw?.type === "fam14" || gw?.type === "fgw14usb") return busIdFromAddress(0xB000 + offset);
  if (gw?.base_id) return addToBaseId(gw.base_id, offset);
  return "";
}

function textOf(node, selector, fallback = "") {
  return node.querySelector(selector)?.textContent?.trim() ?? fallback;
}

function getPct14Mapping(modelName) {
  const name = (modelName || "").toUpperCase();
  if (name.startsWith("FGW14")) return { gateway:"fgw14usb" };
  if (name.startsWith("FSB14")) return { eep:"G5-3F-7F-FSB14", platform:"cover", time_opens:"25", time_closes:"25" };
  if (name.startsWith("FD2G14")) return { eep:"A5-38-08-FD2G14", platform:"light", dali:true };
  if (name.startsWith("FDG14")) return { eep:"A5-38-08-FDG14", platform:"light", dali:true };
  if (name.startsWith("FRGBW14")) return { eep:"07-3F-7F-FRGBW14", platform:"light", sender_eep:"07-3F-7F", channels:1, rgbw:true };
  if (name.startsWith("FRGBW71")) return { eep:"07-3F-7F-FRGBW71L", platform:"light", sender_eep:"07-3F-7F", channels:1, rgbw:true };
  if (name.startsWith("FUD14")) return { eep:"A5-38-08-FUD14", platform:"light" };
  if (name.startsWith("F4SR14")) return { eep:"M5-38-08-F4SR14-LED", platform:"light" };
  if (name.startsWith("FSR14SSR")) return { eep:"M5-38-08-FSR14-2X", platform:"light" };
  if (name.startsWith("FSR14-4") || name.startsWith("FSR14_4")) return { eep:"M5-38-08-FSR14-4X", platform:"light" };
  if (name.startsWith("FSR14-2") || name.startsWith("FSR14_2")) return { eep:"M5-38-08-FSR14-2X", platform:"light" };
  if (name.startsWith("FSR14")) return { eep:"M5-38-08-FSR14-2X", platform:"light" };
  if (name.startsWith("FMZ14")) return { eep:"M5-38-08-FMZ14", platform:"light", sender_eep:"F6-02-01" };
  if (name.startsWith("FAE14LPR")) return { eep:"A5-10-06-FAE14LPR", platform:"climate", min_target_temperature:16, max_target_temperature:25 };
  if (name.startsWith("FTS14EM")) return { eep:"F6-02-01-FTS14EM-UT", platform:"binary_sensor", fts14em:true };
  if (name.startsWith("FHK14") || name.startsWith("F4HK14") || name.startsWith("FAE14SSR")) return { eep:"A5-10-06", platform:"climate", min_target_temperature:16, max_target_temperature:25 };
  if (name.startsWith("FWG14MS")) return { eep:"A5-13-01", platform:"sensor", weather:true };
  if (name.startsWith("F3Z14D")) return { eep:"A5-12-01-F3Z14D", platform:"sensor", channels:3, meter_tariffs:"[1]" };
  if (name.startsWith("FWZ14") || name.startsWith("DSZ14")) return { eep:"A5-12-01", platform:"sensor" };
  return null;
}

function normalizePct14ModelName(modelName, language = "de") {
  const upper = String(modelName || "").toUpperCase();
  if (upper.startsWith("FSR14-4") || upper.startsWith("FSR14_4")) return "FSR14-4x";
  if (upper.startsWith("FSR14-2") || upper.startsWith("FSR14_2")) return "FSR14-2x";
  if (upper.startsWith("FSR14-1") || upper.startsWith("FSR14_1")) return "FSR14_1X";
  if (upper.startsWith("F4SR14")) return "F4SR14_LED";
  if (upper.startsWith("FWG14MS")) return "FWG14MS";
  if (upper.startsWith("F3Z14D")) return "F3Z14D";
  return modelName || (language === "en" ? "Device" : "Gerät");
}

function parsePct14Xml(text, currentBaseId = "", options = {}, language = "de") {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error(language === "en" ? "The file is not a valid PCT14 XML file." : "Die Datei ist keine gültige PCT14-XML-Datei.");

  const rootBase = doc.querySelector("rootdevice rootdevicedata baseid");
  const baseId = rootBase ? idFromBytes([
    textOf(rootBase, "baseid_byte_0", "0"),
    textOf(rootBase, "baseid_byte_1", "0"),
    textOf(rootBase, "baseid_byte_2", "0"),
    textOf(rootBase, "baseid_byte_3", "0"),
  ]) : currentBaseId;

  const imported = [];
  const unsupported = [];
  const extraGateways = [];
  let missingSender = 0;
  const hasFam14Gateway = Boolean(rootBase && baseId);
  let hasFgw14Gateway = false;

  if (options.includeFam14Gateway && hasFam14Gateway) {
    extraGateways.push({ type:"fam14", base_id: baseId, source:"pct14-rootdevice" });
  }

  for (const device of Array.from(doc.querySelectorAll("devices > device"))) {
    const model = textOf(device, "name");
    const mapping = getPct14Mapping(model);
    const address = Number(textOf(device, "header > address", "0"));

    // Robustheit: Unbekannte oder noch nicht gemappte PCT14-Geräte dürfen den
    // kompletten Import nicht abbrechen. Vor v1.0.61 wurde hier bereits auf
    // mapping.channels zugegriffen, obwohl mapping bei unbekannten Geräten null
    // sein kann. Das führte zu: Cannot read properties of null (reading 'channels').
    if (!mapping) {
      unsupported.push(model || `${language === "en" ? "Address" : "Adresse"} ${address}`);
      continue;
    }

    const addressRange = Math.max(1, Number(textOf(device, "header > addressrange", "1")) || 1);
    const channels = Array.from(device.querySelectorAll("channels > channel"));
    const groups = Array.from(device.querySelectorAll("groups > group"));
    const channelCount = Number(mapping.channels || 0) || Math.max(addressRange, channels.length || groups.length || 1);

    if (mapping.gateway === "fgw14usb") {
      hasFgw14Gateway = true;
      if (options.includeFgw14Gateway) {
        extraGateways.push({ type:"fgw14usb", base_id: baseId || currentBaseId, source:"pct14-fgw14" });
      }
      continue;
    }

    // FTS14EM is not a conventional Series-14 multi-channel actuator. PCT14's
    // device address is the configured FTS14EM basis ID; EEDTOY stores one base
    // entry and expands it to E1...E10 during YAML export. Treating addressrange
    // as ordinary channels would multiply the device to 100 exported entries.
    if (mapping.fts14em) {
      const rawDeviceText = String(device.textContent || "").toUpperCase();
      const operatingMode = /(^|[^A-Z])RT([^A-Z]|$)/.test(rawDeviceText) ? "RT" : "UT";
      const profileKey = "F6-02-01-FTS14EM-UT";
      const modelName = normalizePct14ModelName(model, language);
      imported.push({
        ...emptyForm,
        name: `${modelName} ${operatingMode}`,
        dev_id: busIdFromAddress(address),
        eep: profileKey,
        platform: "binary_sensor",
        device_type: "FTS14EM",
        model: "FTS14EM",
        eltako: "FTS14EM",
        device_family: "FTS14EM",
        operating_mode: operatingMode,
        room: `PCT14 ${language === "en" ? "address" : "Adresse"} ${address} · ${language === "en" ? "Base ID" : "Basis-ID"} · ${operatingMode}`,
      });
      continue;
    }

    const senderByChannel = new Map();
    for (const entry of Array.from(device.querySelectorAll("rangeofid > entry"))) {
      const raw = textOf(entry, "entry_id", "");
      const id = byteIdFromDecimal(raw);
      let ch = Number(textOf(entry, "entry_channel", "0"));
      if (mapping.dali) {
        const group = textOf(entry, "entry_group", "");
        if (group !== "") ch = Number(group) + 1;
      }
      if (/^00-00-B0-[0-9A-F]{2}$/.test(id) && ch > 0 && !senderByChannel.has(ch)) {
        senderByChannel.set(ch, id);
      }
    }

    for (let i = 0; i < channelCount; i++) {
      const channelNumber = i + 1;
      const channel = channels.find(c => Number(c.getAttribute("channelnumber")) === channelNumber);
      const group = groups.find(g => Number(g.getAttribute("groupnumber")) === i);
      const channelDesc = channel?.getAttribute("description")?.trim() || group?.getAttribute("description")?.trim() || "";
      // PCT14-Series-14-Geräte werden in der grimmpp-Integration als Busadresse
      // 00-00-00-xx geführt. Die Gateway-base_id bleibt beim Gateway selbst.
      const devId = busIdFromAddress(address + i);
      const p = profileFor(mapping.eep);
      const fallbackSenderId = p.needs_sender ? busIdFromAddress(0xB000 + address + i) : "";
      // Für Series-14-Busgeräte muss die Sender-ID dem Bus-Offset entsprechen.
      // PCT14-Einträge können bei Mehrkanalgeräten je nach Funktion mehrfach vorkommen
      // und sind dafür nicht zuverlässiger als Adresse + Kanaloffset.
      const senderId = fallbackSenderId || senderByChannel.get(channelNumber) || "";
      if (p.needs_sender && !senderId) missingSender++;

      imported.push({
        ...emptyForm,
        name: channelDesc || `${normalizePct14ModelName(model, language)} ${devId}${channelCount > 1 ? ` (${channelNumber}/${channelCount})` : ""}`,
        dev_id: devId,
        eep: mapping.eep,
        platform: mapping.platform,
        device_type: normalizePct14ModelName(model, language),
        model: normalizePct14ModelName(model, language),
        eltako: normalizePct14ModelName(model, language),
        room: `PCT14 ${language === "en" ? "address" : "Adresse"} ${address}${channelCount > 1 ? ` · ${language === "en" ? "Channel" : "Kanal"} ${channelNumber}` : ""}${mapping.dali ? ` · ${language === "en" ? "DALI gateway" : "DALI-Gateway"}` : ""}${mapping.rgbw ? ` · ${language === "en" ? "RGBW profile" : "RGBW-Profil"}` : ""}`,
        sender_id: senderId,
        sender_eep: mapping.sender_eep ?? p.sender_eep ?? "",
        device_class: mapping.platform === "cover" ? "shutter" : "",
        time_opens: mapping.time_opens ?? "",
        time_closes: mapping.time_closes ?? "",
        min_target_temperature: mapping.min_target_temperature ?? "",
        max_target_temperature: mapping.max_target_temperature ?? "",
        meter_tariffs: mapping.meter_tariffs ?? "",
      });
    }
  }

  return {
    baseId,
    devices: imported.filter(d => d.dev_id),
    unsupported,
    missingSender,
    extraGateways,
    hasFam14Gateway,
    hasFgw14Gateway,
  };
}

// ─── Empty form ───────────────────────────────────────────────────
function firstAvailableProfileKey() {
  return Object.keys(EEP_DB)[0] || "";
}

function createEmptyForm(preferredProfileKey = "") {
  const resolvedPreferred = PROFILE_KEY_ALIASES[String(preferredProfileKey || "").toUpperCase()] || String(preferredProfileKey || "");
  const profileKey = EEP_DB[resolvedPreferred] ? resolvedPreferred : firstAvailableProfileKey();
  return { name:"", dev_id:"", physical_unique_id:"", eep:profileKey, room:"", device_class:"", sender_id:"", sender_eep:"", time_opens:"", time_closes:"", min_target_temperature:"", max_target_temperature:"", device_type:"", model:"", eltako:"", id_range:"1" };
}

const emptyForm = createEmptyForm();
function preferredGatewayPortForAutoDetect(ports, gatewayType) {
  const list = Array.isArray(ports) ? ports.filter(port => port && port.path) : [];
  const type = String(gatewayType || "").toLowerCase();
  const records = list.map(port => ({
    port,
    path: String(port.path || ""),
    pathLower: String(port.path || "").toLowerCase(),
    manufacturerLower: String(port.manufacturer || "").toLowerCase(),
  }));

  // Never prefer generic UART/Bluetooth pseudo ports when a real USB gateway
  // can be identified from the same list that is shown in the manual selector.
  const usable = records.filter(item =>
    !item.pathLower.includes("bluetooth") &&
    !item.pathLower.includes("blth") &&
    !/(^|[./_-])urt\d*($|[./_-])/i.test(item.path)
  );

  if (type === "fam-usb") {
    const enocean = usable.filter(item =>
      item.manufacturerLower.includes("enocean") &&
      item.pathLower.includes("serial")
    );

    // A FAM-USB exposes two EnOcean serial interfaces. Depending on the macOS
    // driver/device generation the pair can be named ...B0/...B1 or simply
    // ...0/...1 (for example ...200/...201). Interface 1 is the usable
    // data/programmer port. Detect the pair from the actual port list instead
    // of hard-coding any customer/device serial number.
    const pairedInterface1 = enocean.find(item => {
      if (/b1$/i.test(item.path)) {
        const prefix = item.path.slice(0, -2);
        return enocean.some(other => other.path !== item.path && other.path.toLowerCase() === `${prefix}B0`.toLowerCase());
      }
      if (/1$/.test(item.path)) {
        const prefix = item.path.slice(0, -1);
        return enocean.some(other => other.path !== item.path && other.path === `${prefix}0`);
      }
      return false;
    });
    if (pairedInterface1) return pairedInterface1.path;

    // Keep compatibility with devices where only interface 1 is enumerated.
    const interface1 = enocean.find(item => /b1$/i.test(item.path))
      || enocean.find(item => /1$/.test(item.path));
    if (interface1) return interface1.path;

    // Never knowingly select interface 0. If we cannot identify interface 1,
    // report no automatic match and leave the manual selector available.
    const nonInterface0 = enocean.find(item => !/b0$/i.test(item.path) && !/0$/.test(item.path));
    return nonInterface0 ? nonInterface0.path : "";
  }

  if (type === "fam14" || type === "fgw14usb") {
    const ftdi = usable.find(item =>
      item.manufacturerLower.includes("ftdi") &&
      item.pathLower.includes("serial")
    );
    return ftdi ? ftdi.path : "";
  }

  return "";
}

const emptyGW   = { type:"fam-usb", base_id:"", serial_path:"", lan_address:"" };

// ─── App ──────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]       = useState(1); // 1=gateway, 2=devices, 3=yaml
  const [gateway, setGateway] = useState(emptyGW);
  const [devices, setDevices] = useState([]);
  const [extraGateways, setExtraGateways] = useState([]);
  const [form, setForm]       = useState(emptyForm);
  const [editIdx, setEditIdx] = useState(null);
  const [errors, setErrors]   = useState({});
  const [yaml, setYaml]       = useState("");
  const [generatedGatewayBlocks, setGeneratedGatewayBlocks] = useState([]);
  const [copied, setCopied]   = useState(false);
  const [ports, setPorts]     = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [disconnectingGateway, setDisconnectingGateway] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [learningId, setLearningId] = useState(false);
  const [learnMsg, setLearnMsg] = useState("");
  const [importFam14Gateway, setImportFam14Gateway] = useState(true);
  const [importFgw14Gateway, setImportFgw14Gateway] = useState(true);
  const [pct14DetectedFam14, setPct14DetectedFam14] = useState(false);
  const [pct14DetectedFgw14, setPct14DetectedFgw14] = useState(false);
  const [pct14GatewayBaseId, setPct14GatewayBaseId] = useState("");
  const [writeBusPort, setWriteBusPort] = useState("");
  const [writeTargetGatewayKey, setWriteTargetGatewayKey] = useState("");
  const [writingSenders, setWritingSenders] = useState(false);
  const [writeSenderMsg, setWriteSenderMsg] = useState("");
  const [writeSenderLog, setWriteSenderLog] = useState([]);
  const [writeSenderProgress, setWriteSenderProgress] = useState({ processed:0, total:0, phase:"idle", message:"" });
  const [projectMsg, setProjectMsg] = useState("");
  const [projectFileName, setProjectFileName] = useState("");
  const [projectFilePath, setProjectFilePath] = useState("");
  const [deviceDbOpen, setDeviceDbOpen] = useState(false);
  const [deviceDbEntries, setDeviceDbEntries] = useState(() => Object.entries(EEP_DB).filter(([key]) => ![DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)).map(([key, value]) => ({ key, ...value })));
  const deviceDbEntriesRef = useRef(deviceDbEntries);
  const [deviceDbSelected, setDeviceDbSelected] = useState(0);
  const [deviceDbRevision, setDeviceDbRevision] = useState(0);
  const [deviceDbContextMenu, setDeviceDbContextMenu] = useState(null);
  const deviceDbImportRef = useRef(null);
  const [language, setLanguage] = useState(getStoredLanguage);
  const t = (key, variables = {}) => translate(language, key, variables);
  const runtimeText = (value) => translateRuntimeText(language, value);
  const projectActionsRef = useRef({ open: null, save: null, saveAs: null });

  const isElectron = typeof window !== "undefined" && window.electronAPI?.isElectron;
  const isDeviceDatabaseWindow = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("window") === "device-database";
  void deviceDbRevision;

  const buildProjectDocument = () => ({
    project_format: "eedtoy-project",
    schema_version: 1,
    app_version: APP_VERSION,
    saved_at: new Date().toISOString(),
    state: {
      step,
      gateway,
      devices,
      extraGateways,
      form,
      editIdx,
      yaml,
      generatedGatewayBlocks,
      importFam14Gateway,
      importFgw14Gateway,
      pct14DetectedFam14,
      pct14DetectedFgw14,
      pct14GatewayBaseId,
      writeBusPort,
      writeTargetGatewayKey,
    },
  });

  const showProjectMessage = (message, timeout = 10000) => {
    setProjectMsg(message);
    if (timeout > 0) setTimeout(() => setProjectMsg(""), timeout);
  };

  const handleSaveProject = async () => {
    if (!isElectron) {
      showProjectMessage(t("project.desktopSaveOnly"));
      return;
    }
    if (!projectFilePath) return handleSaveProjectAs();
    const result = await window.electronAPI.saveProject({ project: buildProjectDocument(), path: projectFilePath });
    if (result?.needsSaveAs) return handleSaveProjectAs();
    if (!result?.ok) {
      showProjectMessage(t("project.saveFailed", { error: runtimeText(result?.error || t("project.unknownError")) }));
      return;
    }
    setProjectFileName(result.fileName || projectFileName);
    showProjectMessage(t("project.saved", { file: result.fileName || result.path }));
  };

  const handleSaveProjectAs = async () => {
    if (!isElectron) {
      showProjectMessage(t("project.desktopSaveOnly"));
      return;
    }
    const suggestedName = projectFileName
      ? projectFileName.replace(/\.(eedtoy|json)$/i, "")
      : `EEDTOY-${language === "en" ? "Project" : "Projekt"}-${new Date().toISOString().slice(0, 10)}`;
    const result = await window.electronAPI.saveProjectAs({
      project: buildProjectDocument(),
      suggestedName,
      currentFileName: projectFileName,
    });
    if (result?.canceled) return;
    if (!result?.ok) {
      showProjectMessage(t("project.saveFailed", { error: runtimeText(result?.error || t("project.unknownError")) }));
      return;
    }
    setProjectFileName(result.fileName || `EEDTOY-${language === "en" ? "Project" : "Projekt"}.eedtoy`);
    setProjectFilePath(result.path || "");
    showProjectMessage(t("project.saved", { file: result.fileName || result.path }));
  };

  const handleOpenProject = async () => {
    if (!isElectron) {
      showProjectMessage(t("project.desktopOpenOnly"));
      return;
    }
    const result = await window.electronAPI.openProject();
    if (result?.canceled) return;
    if (!result?.ok) {
      showProjectMessage(t("project.openFailed", { error: runtimeText(result?.error || t("project.unknownError")) }));
      return;
    }

    const project = result.project || {};
    const state = project.state || {};
    const loadedGateway = state.gateway && typeof state.gateway === "object" ? { ...emptyGW, ...state.gateway } : emptyGW;
    const loadedDevices = Array.isArray(state.devices) ? state.devices.map(normalizeLoadedDeviceProfile) : [];
    const loadedGateways = Array.isArray(state.extraGateways) ? state.extraGateways : [];
    const loadedImportFam14Gateway = state.importFam14Gateway !== false;
    const loadedImportFgw14Gateway = state.importFgw14Gateway !== false;
    const loadedPct14DetectedFam14 = Boolean(state.pct14DetectedFam14);
    const loadedPct14DetectedFgw14 = Boolean(state.pct14DetectedFgw14);
    const loadedPct14GatewayBaseId = typeof state.pct14GatewayBaseId === "string" ? state.pct14GatewayBaseId : "";
    const loadedStep = [1, 2, 3].includes(Number(state.step)) ? Number(state.step) : 1;
    const loadedEditIdx = Number.isInteger(state.editIdx) && state.editIdx >= 0 && state.editIdx < loadedDevices.length
      ? state.editIdx
      : null;

    const activeLoadedGateways = loadedGateways.filter(gw => gw?.source !== "pct14-rootdevice" && gw?.source !== "pct14-fgw14");
    if (loadedImportFam14Gateway && loadedPct14DetectedFam14 && loadedPct14GatewayBaseId) {
      activeLoadedGateways.push({ type:"fam14", base_id:loadedPct14GatewayBaseId, source:"pct14-rootdevice" });
    }
    if (loadedImportFgw14Gateway && loadedPct14DetectedFgw14 && loadedPct14GatewayBaseId) {
      activeLoadedGateways.push({ type:"fgw14usb", base_id:loadedPct14GatewayBaseId, source:"pct14-fgw14" });
    }
    const loadedGatewayBlocks = Array.isArray(state.generatedGatewayBlocks) && state.generatedGatewayBlocks.length
      ? state.generatedGatewayBlocks
      : orderedGatewayBlocks(loadedGateway, activeLoadedGateways);
    const loadedYaml = loadedDevices.length > 0
      ? generateYaml(loadedGateway, loadedDevices, loadedGatewayBlocks.slice(1), loadedPct14GatewayBaseId, language)
      : "";

    setGateway(loadedGateway);
    setDevices(loadedDevices);
    setExtraGateways(loadedGateways);
    // A saved form is only meaningful while a real device is actively being edited.
    // For an empty/add form always start with a valid current database key; never
    // resurrect a stale raw EEP such as A5-04-02 as an unknown profile.
    setForm(loadedEditIdx !== null
      ? normalizeLoadedDeviceProfile(loadedDevices[loadedEditIdx])
      : createEmptyForm());
    setEditIdx(loadedEditIdx);
    setYaml(loadedYaml);
    setGeneratedGatewayBlocks(loadedGatewayBlocks);
    setImportFam14Gateway(loadedImportFam14Gateway);
    setImportFgw14Gateway(loadedImportFgw14Gateway);
    setPct14DetectedFam14(loadedPct14DetectedFam14);
    setPct14DetectedFgw14(loadedPct14DetectedFgw14);
    setPct14GatewayBaseId(loadedPct14GatewayBaseId);
    setWriteBusPort(typeof state.writeBusPort === "string" ? state.writeBusPort : "");
    setWriteTargetGatewayKey(typeof state.writeTargetGatewayKey === "string" ? state.writeTargetGatewayKey : "");
    setErrors({});
    setCopied(false);
    setImportMsg("");
    setDetectMsg("");
    setLearnMsg("");
    setWriteSenderMsg("");
    setWriteSenderLog([]);
    setStep(loadedStep === 3 && !loadedYaml ? 2 : loadedStep);
    setProjectFileName(result.fileName || `EEDTOY-${language === "en" ? "Project" : "Projekt"}.eedtoy`);
    setProjectFilePath(result.path || "");

    const sourceVersion = project.app_version && project.app_version !== APP_VERSION
      ? t("project.versionInfo", { source: project.app_version, current: APP_VERSION })
      : "";
    showProjectMessage(t("project.opened", { file: result.fileName, versionInfo: sourceVersion }), 14000);
  };

  projectActionsRef.current = {
    open: handleOpenProject,
    save: handleSaveProject,
    saveAs: handleSaveProjectAs,
  };

  useEffect(() => {
    if (!isElectron) return undefined;
    let disposed = false;

    window.electronAPI.loadDeviceDatabase?.().then((storedDatabase) => {
      if (disposed) return;
      const stored = migrateCustomDeviceDatabase(storedDatabase);
      if (JSON.stringify(stored) !== JSON.stringify(storedDatabase || {})) {
        window.electronAPI.saveDeviceDatabase?.(stored).catch(() => {});
        try { window.localStorage.setItem(DEVICE_DB_STORAGE_KEY, JSON.stringify(stored)); } catch {}
      }
      let migrated = stored;
      if (!Object.keys(stored).length) {
        // No persisted Electron device database: start from the current built-in
        // defaults. Do not resurrect an outdated database from localStorage.
        migrated = {};
        try { window.localStorage.removeItem(DEVICE_DB_STORAGE_KEY); } catch {}
      }
      EEP_DB = mergeDeviceDatabase(DEFAULT_EEP_DB, migrated);
      replaceDeviceDbEntries(Object.entries(EEP_DB).filter(([key]) => ![DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)).map(([key, value]) => ({ key, ...value })));
      setDeviceDbRevision(value => value + 1);
    }).catch(() => {});

    window.electronAPI.getLanguage().then((value) => {
      if (disposed) return;
      const next = value === "en" ? "en" : "de";
      setLanguage(next);
      storeLanguage(next);
    }).catch(() => {});

    const cleanupMenu = window.electronAPI.onMenuAction((action) => {
      if (action === "open-project") projectActionsRef.current.open?.();
      if (action === "save-project") projectActionsRef.current.save?.();
      if (action === "save-project-as") projectActionsRef.current.saveAs?.();
      if (action === "device-database") window.electronAPI?.openDeviceDatabase?.();
      if (action === "device-db-import" && isDeviceDatabaseWindow) openDeviceDatabaseImportDialog();
      if (action === "device-db-export" && isDeviceDatabaseWindow) exportDeviceDatabase();
    });
    const cleanupLanguage = window.electronAPI.onLanguageChanged((value) => {
      const next = value === "en" ? "en" : "de";
      setLanguage(next);
      storeLanguage(next);
    });
    const cleanupDeviceDatabase = window.electronAPI.onDeviceDatabaseChanged?.((customDatabase) => {
      const custom = migrateCustomDeviceDatabase(customDatabase);
      EEP_DB = mergeDeviceDatabase(DEFAULT_EEP_DB, custom);
      try {
        window.localStorage.setItem(DEVICE_DB_STORAGE_KEY, JSON.stringify(custom));
      } catch {}
      replaceDeviceDbEntries(Object.entries(EEP_DB).filter(([key]) => ![DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)).map(([key, value]) => ({ key, ...value })));
      setDeviceDbRevision(value => value + 1);
    });

    return () => {
      disposed = true;
      cleanupMenu?.();
      cleanupLanguage?.();
      cleanupDeviceDatabase?.();
    };
  }, [isElectron]);

  useEffect(() => {
    storeLanguage(language);
  }, [language]);

  const handleScanPorts = async () => {
    if (!isElectron) return;
    const found = await window.electronAPI.listPorts();
    setPorts(found);
    if (found.length > 0) {
      setGateway(g => ({ ...g, serial_path: found.some(p => p.path === g.serial_path) ? g.serial_path : found[0].path }));
      setDetectMsg(t(found.length === 1 ? "status.serialPortsFound" : "status.serialPortsFoundPlural", { count: found.length, ports: found.map(p => p.path).join(", ") }));
    } else {
      setDetectMsg(t("status.noSerialPort"));
    }
    setTimeout(() => setDetectMsg(''), 8000);
  };

  const handleDetectBaseId = async () => {
    if (!isElectron) return;
    setDetecting(true);
    setDetectMsg(t("status.connectingGateway"));
    const gw = GATEWAY_TYPES.find(g => g.value === gateway.type);
    const baud = gw?.baud || 57600;
    const proto = gw?.proto || 'auto';
    const result = await window.electronAPI.readBaseId(gateway.serial_path, baud, proto);
    setDetecting(false);
    if (result.ok) {
      setGateway(g => ({ ...g, base_id: result.baseId, serial_path: result.portPath || g.serial_path }));
      setDetectMsg(t("status.baseIdDetected", { baseId: result.baseId, protocol: result.protocol || proto, baud: result.baudRate || baud, bridge: result.bridge ? `, ${result.bridge}` : "" }));
    } else {
      setDetectMsg("✗ " + runtimeText(result.error));
    }
    setTimeout(() => setDetectMsg(""), 8000);
  };

  const handleAutoDetectGateway = async () => {
    if (!isElectron) return;
    setDetecting(true);
    setDetectMsg(t("status.detectAllPorts"));

    // macOS auto-detect deliberately reuses the exact same Base-ID read path
    // as the manual "Base-ID auslesen" button. Only the physical USB port is
    // selected automatically here. This prevents the generic v1.0.95 auto
    // detector from continuing to unrelated UART pseudo ports after the real
    // gateway candidate was already identified from Electron's port list.
    const detectedPorts = await window.electronAPI.listPorts();
    if (Array.isArray(detectedPorts)) setPorts(detectedPorts);

    const preferredPort = preferredGatewayPortForAutoDetect(detectedPorts, gateway.type);
    if (!preferredPort) {
      setDetecting(false);
      setDetectMsg("✗ Kein passender serieller Port für den gewählten Gateway-Typ gefunden.");
      setTimeout(() => setDetectMsg(""), 12000);
      return;
    }

    const gw = GATEWAY_TYPES.find(g => g.value === gateway.type);
    const baud = gw?.baud || 57600;
    // On macOS the FAM-USB auto path must not depend on the embedded Python
    // detector.  The port has already been identified as the EnOcean B1
    // interface above, so query its Base-ID directly with the native ESP2
    // AB-58 request.  Manual Base-ID reading remains unchanged.
    const proto = gateway.type === "fam-usb" ? "esp2-fam-usb" : (gw?.proto || "auto");
    const result = await window.electronAPI.readBaseId(preferredPort, baud, proto);
    setDetecting(false);

    if (result.ok) {
      setGateway(g => ({
        ...g,
        serial_path: result.portPath || preferredPort,
        base_id: result.baseId || "",
      }));
      setDetectMsg(t("status.gatewayDetected", {
        label: gw?.label || gateway.type,
        port: result.portPath || preferredPort,
        baseId: result.baseId || "",
        protocol: result.protocol || proto,
        baud: result.baudRate || baud,
        bridge: result.bridge ? `, ${result.bridge}` : "",
      }));
    } else {
      setDetectMsg("✗ " + runtimeText(result.error || "Gateway konnte auf dem automatisch gewählten Port nicht erkannt werden."));
    }
    setTimeout(() => setDetectMsg(""), 12000);
  };



  const handleDisconnectGateway = async () => {
    if (!isElectron) return;
    const port = (gateway.serial_path || "").trim();
    if (!port) {
      setDetectMsg(t("status.disconnectMissingPort"));
      setTimeout(() => setDetectMsg(""), 9000);
      return;
    }

    if (!["fam14", "fgw14usb"].includes(gateway.type)) {
      setDetectMsg(t("status.disconnectNotNeeded"));
      setTimeout(() => setDetectMsg(""), 9000);
      return;
    }

    setDisconnectingGateway(true);
    setDetectMsg(t("status.disconnecting"));
    const result = await window.electronAPI.disconnectGateway({
      portPath: port,
      gatewayType: gateway.type,
      baudRate: 57600,
    });
    setDisconnectingGateway(false);

    if (result.ok) {
      setDetectMsg(t("status.disconnectSuccess"));
    } else {
      setDetectMsg(t("status.disconnectFailed", { error: runtimeText(result.error || t("project.unknownError")) }));
    }
    setTimeout(() => setDetectMsg(""), 10000);
  };

  const handleLearnDeviceId = async () => {
    if (!isElectron) {
      setLearnMsg(t("status.learnDesktopOnly"));
      return;
    }
    if (!gateway.serial_path?.trim()) {
      setLearnMsg(t("status.learnMissingPort"));
      return;
    }
    setLearningId(true);
    setLearnMsg(t("status.learning"));
    const result = await window.electronAPI.learnDeviceId(gateway.serial_path, gateway.type, 20000);
    setLearningId(false);
    if (result.ok && result.id) {
      setForm(f => ({ ...f, dev_id: result.id }));
      setLearnMsg(t("status.deviceIdDetected", { id: result.id, rorg: result.rorg ? ` (RORG ${result.rorg})` : "" }));
      setTimeout(() => setLearnMsg(""), 10000);
    } else {
      setLearnMsg("✗ " + runtimeText(result.error || t("status.noDeviceId")));
      setTimeout(() => setLearnMsg(""), 12000);
    }
  };

  const handleLearnFts14emBaseId = async () => {
    if (!isElectron) {
      setLearnMsg(t("status.learnDesktopOnly"));
      return;
    }
    if (!gateway.serial_path?.trim()) {
      setLearnMsg(t("status.learnMissingPort"));
      return;
    }
    if (!["fam14", "fgw14usb"].includes(String(gateway.type || "").toLowerCase())) {
      setLearnMsg(language === "en"
        ? "✗ FTS14EM telegrams are available only through the ELTAKO RS485 bus (FGW14-USB/FAM14)."
        : "✗ FTS14EM-Telegramme sind nur über den ELTAKO-RS485-Bus (FGW14-USB/FAM14) verfügbar.");
      return;
    }

    const selectedProfile = profileFor(form.eep);
    if (String(selectedProfile.device_family || "").toUpperCase() !== "FTS14EM") {
      return handleLearnDeviceId();
    }

    setLearningId(true);
    setLearnMsg(language === "en"
      ? "Press the same button connected to E1 five times. Detected presses: 0/5"
      : "Dieselbe an E1 angeschlossene Taste fünfmal drücken. Erkannte Betätigungen: 0/5");

    let removeProgressListener = null;
    if (window.electronAPI.onFts14emLearnProgress) {
      removeProgressListener = window.electronAPI.onFts14emLearnProgress(progress => {
        const count = Math.min(5, Number(progress?.count || 0));
        const id = progress?.id ? ` (${progress.id})` : "";
        setLearnMsg(language === "en"
          ? `Press the same E1 button five times. Detected presses: ${count}/5${id}`
          : `Dieselbe E1-Taste fünfmal drücken. Erkannte Betätigungen: ${count}/5${id}`);
      });
    }

    let result;
    try {
      result = await window.electronAPI.learnFts14emBaseId(
        gateway.serial_path,
        gateway.type,
        30000
      );
    } finally {
      if (typeof removeProgressListener === "function") removeProgressListener();
      setLearningId(false);
    }

    if (!(result?.ok && result.id)) {
      setLearnMsg("✗ " + runtimeText(result?.error || t("status.noDeviceId")));
      setTimeout(() => setLearnMsg(""), 15000);
      return;
    }

    const detectedId = normalizeId(result.id);
    const duplicateIndex = devices.findIndex(existing =>
      String(existing.device_family || profileFor(existing.eep).device_family || "").toUpperCase() === "FTS14EM" &&
      normalizeId(existing.dev_id) === detectedId
    );
    if (duplicateIndex >= 0) {
      setForm(f => ({ ...f, dev_id: detectedId }));
      setLearnMsg(language === "en"
        ? `✗ FTS14EM base ID ${detectedId} is already present. Nothing was added.`
        : `✗ Die FTS14EM-Basis-ID ${detectedId} ist bereits vorhanden. Es wurde nichts hinzugefügt.`);
      setTimeout(() => setLearnMsg(""), 15000);
      return;
    }

    // Detection only fills the form. The user must explicitly confirm by
    // clicking Add, so noisy bus traffic can never create entries by itself.
    setForm(f => ({ ...f, dev_id: detectedId, id_range: fts14emRangeForBaseId(detectedId) || f.id_range || "1" }));
    setErrors({});
    setLearnMsg(language === "en"
      ? `✓ Device ID detected: ${detectedId}`
      : `✓ Geräte-ID erkannt: ${detectedId}`);
    setTimeout(() => setLearnMsg(""), 20000);
  };

  const handleLearnF4usmPhysicalId = async () => {
    if (!isElectron) {
      setLearnMsg(t("status.learnDesktopOnly"));
      return;
    }
    if (!gateway.serial_path?.trim()) {
      setLearnMsg(t("status.learnMissingPort"));
      return;
    }
    setLearningId(true);
    setLearnMsg(language === "en"
      ? "Set all jumpers and press E2 now. Waiting for the F4USM61B battery ID..."
      : "Alle Jumper stecken und jetzt E2 betätigen. Warte auf die F4USM61B-Batterie-ID ...");
    const result = await window.electronAPI.learnDeviceId(gateway.serial_path, gateway.type, 30000);
    setLearningId(false);
    if (result.ok && result.id) {
      setForm(f => ({ ...f, physical_unique_id: result.id }));
      setLearnMsg(language === "en" ? `Battery ID detected: ${result.id}` : `Batterie-ID erkannt: ${result.id}`);
      setTimeout(() => setLearnMsg(""), 12000);
    } else {
      setLearnMsg("✗ " + runtimeText(result.error || t("status.noDeviceId")));
      setTimeout(() => setLearnMsg(""), 12000);
    }
  };

  const profile = profileFor(form.eep);

  const changeEep = (eep) => {
    const p = profileFor(eep);
    const family = String(p.device_family || "").toUpperCase();
    const isF4usm = family === "F4USM61B";
    const isFts14em = family === "FTS14EM";
    const operatingMode = isF4usm ? Number(p.operating_mode || 0) : (isFts14em ? String(p.operating_mode || "UT").toUpperCase() : 0);
    setForm(f => ({
      ...f,
      eep,
      device_class: p.default_dc ?? "",
      sender_eep: p.sender_eep ?? "",
      sender_id: p.needs_sender ? (f.sender_id || autoSenderIdForGateway(gateway, devices)) : "",
      // Snapshot all F4USM61B mode metadata into the device form. This avoids
      // stale values (for example operating_mode 6) surviving a profile change.
      device_family: isF4usm ? "F4USM61B" : (isFts14em ? "FTS14EM" : ""),
      operating_mode: operatingMode,
      id_range: isFts14em ? (f.id_range || "1") : "1",
      dev_id: isFts14em ? (f.dev_id || fts14emBaseIdForRange(f.id_range || "1")) : f.dev_id,
      id_count: isF4usm ? Number(p.id_count || (operatingMode === 1 ? 1 : 2)) : undefined,
      channels: isF4usm ? Number(p.channels || (operatingMode === 1 ? 1 : 2)) : undefined,
      invert: false,
      battery_status: isF4usm ? Boolean(p.battery_status) : false,
      battery_eep: isF4usm ? String(p.battery_eep || "") : "",
      physical_unique_id: isF4usm && [1, 2, 4, 5, 7].includes(operatingMode) ? f.physical_unique_id : "",
    }));
    setErrors({});
  };

  const validate = (f) => {
    const e = {};
    if (!f.name.trim()) e.name = t("validation.required");
    if (!f.dev_id.trim()) e.dev_id = t("validation.required");
    else if (!/^[0-9a-fA-F]{2}(-[0-9a-fA-F]{2}){3}$/.test(f.dev_id.trim()))
      e.dev_id = "Format: FF-AA-BB-CC";
    const selectedProfile = profileFor(f.eep);
    if (String(selectedProfile.device_family || "").toUpperCase() === "FTS14EM" && !addFts14emInputOffset(f.dev_id, 0)) {
      e.dev_id = language === "en"
        ? "Use an FTS14EM E1 base ID from 00-00-10-01 to 00-00-14-01."
        : "Eine FTS14EM-E1-Basis-ID von 00-00-10-01 bis 00-00-14-01 verwenden.";
    }
    const selectedMode = Number(selectedProfile.operating_mode || 0);
    if (String(selectedProfile.device_family || "").toUpperCase() === "F4USM61B" && [1, 2, 4, 5, 7].includes(selectedMode)) {
      if (!String(f.physical_unique_id || "").trim()) e.physical_unique_id = language === "en" ? "Learn or enter the battery ID." : "Batterie-ID einlernen oder eingeben.";
      else if (!/^[0-9a-fA-F]{2}(-[0-9a-fA-F]{2}){3}$/.test(String(f.physical_unique_id).trim())) e.physical_unique_id = "Format: FF-AA-BB-CC";
    }
    if (profile.needs_sender) {
      if (!f.sender_id.trim()) e.sender_id = t("validation.senderBaseIdMissing");
      else if (!/^[0-9a-fA-F]{2}(-[0-9a-fA-F]{2}){3}$/.test(f.sender_id.trim()))
        e.sender_id = "Format: FF-AA-BB-CC";
    }
    return e;
  };

  const handleAdd = () => {
    const autoSender = profile.needs_sender ? autoSenderIdForGateway(gateway, devices) : "";
    const selectedFamily = String(profile.device_family || "").toUpperCase();
    const isF4usmProfile = selectedFamily === "F4USM61B";
    const isFts14emProfile = selectedFamily === "FTS14EM";
    const selectedOperatingMode = isF4usmProfile
      ? Number(profile.operating_mode || form.operating_mode || 0)
      : (isFts14emProfile ? String(profile.operating_mode || form.operating_mode || "UT").toUpperCase() : 0);
    const entry = {
      ...form,
      profile_key: form.eep,
      sender_id: profile.needs_sender ? (form.sender_id.trim() || autoSender) : "",
      sender_eep: profile.needs_sender ? (form.sender_eep || profile.sender_eep || "") : "",
      platform: profile.platform ?? "sensor",
      device_type: form.device_type || profile.eltako || "",
      model: form.model || profile.eltako || "",
      eltako: form.eltako || profile.eltako || "",
      device_family: isF4usmProfile ? "F4USM61B" : (isFts14emProfile ? "FTS14EM" : (form.device_family || "")),
      operating_mode: selectedOperatingMode,
      id_range: isFts14emProfile ? String(form.id_range || fts14emRangeForBaseId(form.dev_id) || "1") : form.id_range,
      id_count: isF4usmProfile ? Number(form.id_count ?? profile.id_count ?? (selectedOperatingMode === 1 ? 1 : 2)) : (isFts14emProfile ? 10 : form.id_count),
      channels: isF4usmProfile ? Number(form.channels ?? profile.channels ?? (selectedOperatingMode === 1 ? 1 : 2)) : form.channels,
      invert: isF4usmProfile ? false : Boolean(form.invert),
      battery_status: isF4usmProfile ? Boolean(profile.battery_status) : Boolean(form.battery_status),
      battery_eep: isF4usmProfile ? String(profile.battery_eep || "") : String(form.battery_eep || ""),
    };
    const e = validate(entry);
    const duplicateIndex = devices.findIndex((existing, index) =>
      index !== editIdx && duplicateDeviceKey(existing) && duplicateDeviceKey(existing) === duplicateDeviceKey(entry)
    );
    if (duplicateIndex >= 0) {
      e.dev_id = isFbhOperatingMode(entry)
        ? t("validation.duplicateFbh", { name: devices[duplicateIndex].name })
        : t("validation.duplicateDevice", { eep: exportEepForDevice(entry), name: devices[duplicateIndex].name });
    }
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});

    const nextDevices = editIdx !== null
      ? devices.map((x,i) => i===editIdx ? entry : x)
      : [...devices, entry];
    setDevices(nextDevices);

    if (editIdx !== null) setEditIdx(null);

    const nextEmpty = createEmptyForm(form.eep);
    const nextProfile = profileFor(nextEmpty.eep);
    if (nextProfile.needs_sender) {
      nextEmpty.sender_eep = nextProfile.sender_eep ?? "";
      nextEmpty.sender_id = autoSenderIdForGateway(gateway, nextDevices);
    }
    setForm(nextEmpty);
  };



  const handleImportFam14GatewayToggle = (checked) => {
    setImportFam14Gateway(checked);
    setExtraGateways(existing => {
      let next = existing.filter(gw => gw.source !== "pct14-rootdevice");
      if (checked && pct14DetectedFam14 && pct14GatewayBaseId) {
        next = [...next, { type:"fam14", base_id:pct14GatewayBaseId, source:"pct14-rootdevice" }];
      }
      return next;
    });
  };

  const handleImportFgw14GatewayToggle = (checked) => {
    setImportFgw14Gateway(checked);
    setExtraGateways(existing => {
      let next = existing.filter(gw => gw.source !== "pct14-fgw14");
      if (checked && pct14DetectedFgw14 && pct14GatewayBaseId) {
        next = [...next, { type:"fgw14usb", base_id:pct14GatewayBaseId, source:"pct14-fgw14" }];
      }
      return next;
    });
  };

  const readTextFileUtf8 = async (file) => {
    const buffer = await file.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  };

  const handlePct14Import = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await readTextFileUtf8(file);
      const result = parsePct14Xml(text, gateway.base_id, {
        includeFam14Gateway: importFam14Gateway,
        includeFgw14Gateway: importFgw14Gateway,
      }, language);
      setPct14DetectedFam14(Boolean(result.hasFam14Gateway));
      setPct14DetectedFgw14(Boolean(result.hasFgw14Gateway));
      setPct14GatewayBaseId(result.baseId || "");
      if (result.baseId && !gateway.base_id && gateway.type === "fam14" && !importFam14Gateway) {
        setGateway(g => ({ ...g, base_id: result.baseId }));
      }
      setExtraGateways(existing => {
        // PCT14-importierte Gateways werden bei jedem Import neu aus der XML-Option gebildet.
        // Damit wirkt die Checkbox zuverlässig: Ist sie aus, wird ein zuvor importiertes FAM14
        // aus dem YAML-Export wieder entfernt. Manuell/anderweitig gesetzte Gateways bleiben erhalten.
        const merged = existing.filter(gw => gw.source !== "pct14-rootdevice" && gw.source !== "pct14-fgw14");
        for (const gw of (result.extraGateways || [])) {
          if (!merged.some(x => x.type === gw.type && (x.base_id || "") === (gw.base_id || ""))) merged.push(gw);
        }
        return merged;
      });
      if (!result.devices.length) {
        setImportMsg(t("import.noSupportedDevices", { file: file.name }));
        return;
      }
      setDevices(existing => [...existing, ...result.devices]);
      const unsupportedText = result.unsupported.length ? t("import.notImported", { devices: `${[...new Set(result.unsupported)].slice(0, 8).join(", ")}${result.unsupported.length > 8 ? " …" : ""}` }) : "";
      const senderText = result.missingSender ? t("import.missingSender", { count: result.missingSender }) : "";
      const importNoun = t(result.devices.length === 1 ? "import.oneDeviceChannel" : "import.manyDevicesChannels");
      setImportMsg(t("import.success", { count: result.devices.length, noun: importNoun, file: file.name, baseId: result.baseId ? t("import.baseIdInfo", { baseId: result.baseId }) : "", sender: senderText, unsupported: unsupportedText }));
      setTimeout(() => setImportMsg(""), 20000);
    } catch (err) {
      setImportMsg(t("import.failed", { error: runtimeText(err.message || err) }));
    }
  };

  const handleEdit   = (i) => { setForm(normalizeLoadedDeviceProfile(devices[i])); setEditIdx(i); setErrors({}); window.scrollTo({top:0,behavior:"smooth"}); };
  const handleDelete = (i) => { setDevices(d => d.filter((_,j)=>j!==i)); if(editIdx===i){setEditIdx(null);setForm(createEmptyForm());} };
  const handleDeleteAllDevices = () => {
    if (!devices.length) return;
    const ok = window.confirm(t("import.deleteConfirm", { count: devices.length }));
    if (!ok) return;
    setDevices([]);
    setEditIdx(null);
    setForm(createEmptyForm());
    setErrors({});
    setImportMsg(t("import.listCleared"));
    setTimeout(() => setImportMsg(""), 6000);
  };

  const buildActiveExtraGateways = () => {
    const active = extraGateways.filter(gw => gw.source !== "pct14-rootdevice" && gw.source !== "pct14-fgw14");
    if (importFam14Gateway && pct14DetectedFam14 && pct14GatewayBaseId) {
      active.push({ type:"fam14", base_id:pct14GatewayBaseId, source:"pct14-rootdevice" });
    }
    if (importFgw14Gateway && pct14DetectedFgw14 && pct14GatewayBaseId) {
      active.push({ type:"fgw14usb", base_id:pct14GatewayBaseId, source:"pct14-fgw14" });
    }
    return active;
  };

  // Keep an already generated YAML preview in the selected UI language.
  // Without this, changing the language only translated the controls while
  // the YAML header and explanatory comments remained in the previous language.
  useEffect(() => {
    if (!yaml || devices.length === 0) return;
    const snapshot = generatedGatewayBlocks.length
      ? generatedGatewayBlocks
      : orderedGatewayBlocks(gateway, buildActiveExtraGateways());
    const [snapshotPrimary, ...snapshotExtras] = snapshot;
    setYaml(generateYaml(snapshotPrimary || gateway, devices, snapshotExtras, pct14GatewayBaseId, language));
  }, [language]);

  const handleGenerate = () => {
    const normalized = normalizeFksSenderAssignments(gateway, devices, pct14GatewayBaseId);
    if (normalized.changed || normalized.devices.length !== devices.length) setDevices(normalized.devices);
    const gatewaySnapshot = orderedGatewayBlocks(gateway, buildActiveExtraGateways()).map(gw => ({ ...gw }));
    const [snapshotPrimary, ...snapshotExtras] = gatewaySnapshot;
    setGeneratedGatewayBlocks(gatewaySnapshot);
    setYaml(generateYaml(snapshotPrimary || gateway, normalized.devices, snapshotExtras, pct14GatewayBaseId, language));
    setStep(3);
  };
  const handleCopy = () => { navigator.clipboard.writeText(yaml); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const handleDL   = () => {
    const b = new Blob([yaml],{type:"text/yaml"});
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href=u; a.download="eltako_config.yaml"; a.click();
    URL.revokeObjectURL(u);
  };

  const currentGatewayBlocks = orderedGatewayBlocks(gateway, buildActiveExtraGateways());
  const activeGatewayBlocks = yaml && generatedGatewayBlocks.length
    ? generatedGatewayBlocks
    : currentGatewayBlocks;
  const senderProgrammingEntries = buildSenderProgrammingEntries(devices, activeGatewayBlocks, pct14GatewayBaseId);
  const senderGatewaySummary = activeGatewayBlocks
    .map(gw => `${gw.type}${gw.base_id ? ` (${gw.base_id})` : ""}`)
    .join(" · ");
  const hasRs485Gateway = activeGatewayBlocks.some(gw => ["fam14", "fgw14usb"].includes(gw.type));
  const defaultBusWritePort = ["fam14", "fgw14usb"].includes(gateway.type) ? gateway.serial_path : "";
  const busWritePort = (writeBusPort || defaultBusWritePort || "").trim();
  const busWriteGatewayConnected = hasRs485Gateway && Boolean(busWritePort);
  const busWriteHint = t("senderWrite.hint");
  const canWriteSenderIds = !writingSenders && busWriteGatewayConnected && senderProgrammingEntries.length > 0;

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onWriteSenderProgress) return undefined;
    return window.electronAPI.onWriteSenderProgress((progress) => {
      setWriteSenderProgress(previous => ({ ...previous, ...(progress || {}) }));
    });
  }, [isElectron]);

  const handleCancelWriteSenderIds = async () => {
    if (!isElectron || !writingSenders || !window.electronAPI?.cancelWriteSenderIds) return;
    setWriteSenderProgress(previous => ({ ...previous, phase:"canceling" }));
    await window.electronAPI.cancelWriteSenderIds();
  };

  const handleDisconnectWriteGateway = async () => {
    if (!isElectron || disconnectingGateway || !window.electronAPI?.disconnectGateway) return;
    const port = busWritePort;
    if (!port || !hasRs485Gateway) return;

    setDisconnectingGateway(true);
    if (writingSenders && window.electronAPI?.cancelWriteSenderIds) {
      setWriteSenderProgress(previous => ({ ...previous, phase:"canceling" }));
      await window.electronAPI.cancelWriteSenderIds();
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    const result = await window.electronAPI.disconnectGateway({
      portPath: port,
      gatewayType: "fam14",
      baudRate: 57600,
    });
    setDisconnectingGateway(false);
    if (result.ok) {
      setWriteSenderMsg(t("status.disconnectSuccess"));
    } else {
      setWriteSenderMsg(t("status.disconnectFailed", { error: runtimeText(result.error || t("project.unknownError")) }));
    }
  };

  const handleWriteSenderIds = async () => {
    if (!isElectron) {
      setWriteSenderMsg(t("senderWrite.desktopOnly"));
      return;
    }
    if (!activeGatewayBlocks.length) {
      setWriteSenderMsg(t("senderWrite.noGateway"));
      return;
    }
    const port = busWritePort;
    if (!hasRs485Gateway) {
      setWriteSenderMsg(t("senderWrite.wrongGateway"));
      return;
    }
    if (!port) {
      setWriteSenderMsg(t("senderWrite.noPort"));
      return;
    }
    if (!pct14GatewayBaseId) {
      setWriteSenderMsg(t("senderWrite.noBaseId"));
      return;
    }
    if (!senderProgrammingEntries.length) {
      setWriteSenderMsg(t("senderWrite.noEntries"));
      return;
    }
    const ok = window.confirm(t("senderWrite.confirm", { port, gateway: senderGatewaySummary || "-", count: senderProgrammingEntries.length }));
    if (!ok) return;

    setWritingSenders(true);
    setWriteSenderLog([]);
    setWriteSenderProgress({ processed:0, total:senderProgrammingEntries.length, phase:"starting", message:"" });
    setWriteSenderMsg(t("senderWrite.progress", { count: senderProgrammingEntries.length }));
    const result = await window.electronAPI.writeSenderIdsToDevices({
      portPath: port,
      gatewayType: "fam14",
      baudRate: 57600,
      targetGateways: activeGatewayBlocks,
      entries: senderProgrammingEntries,
    });
    setWritingSenders(false);
    setWriteSenderLog(result.events || []);
    if (result?.canceled) {
      setWriteSenderProgress(previous => ({ ...previous, phase:"canceled" }));
      setWriteSenderMsg(`Abgebrochen nach ${result.processed || 0} von ${result.total || senderProgrammingEntries.length} Sender-IDs.`);
      return;
    }
    if (result.ok) {
      const c = result.counts || {};
      setWriteSenderMsg(t("senderWrite.done", { updated: c.updated || 0, exists: c.exists || 0, unsupported: c.unsupported || 0, errors: c.error || 0 }));
    } else {
      setWriteSenderMsg("✗ " + runtimeText(result.error || t("senderWrite.failed")));
    }
  };

  const replaceDeviceDbEntries = (updater) => {
    setDeviceDbEntries(previous => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      deviceDbEntriesRef.current = next;
      return next;
    });
  };
  const updateDeviceDbField = (field, value) => {
    replaceDeviceDbEntries(entries => entries.map((entry, index) => index === deviceDbSelected ? { ...entry, [field]: value } : entry));
  };
  const addDeviceDbEntry = () => {
    const entry = { key:`CUSTOM-${Date.now()}`, group:"Temperatur / Feuchte", label:"Neues Gerät", platform:"sensor", eep_out:"A5-04-02", eltako:"Neues Gerät" };
    replaceDeviceDbEntries(entries => [...entries, entry]);
    setDeviceDbSelected(deviceDbEntries.length);
  };
  const duplicateDeviceDbEntry = () => {
    const source = deviceDbEntries[deviceDbSelected];
    if (!source) return;
    const copy = { ...source, key:`${source.key}-COPY-${Date.now()}`, label:`${source.label} (Kopie)` };
    replaceDeviceDbEntries(entries => [...entries, copy]);
    setDeviceDbSelected(deviceDbEntries.length);
  };
  const deleteDeviceDbEntry = () => {
    if (!deviceDbEntries[deviceDbSelected]) return;
    if (!window.confirm(language === "en" ? "Delete selected device?" : "Ausgewähltes Gerät löschen?")) return;
    replaceDeviceDbEntries(entries => entries.filter((_, index) => index !== deviceDbSelected));
    setDeviceDbSelected(index => Math.max(0, index - 1));
  };
  const buildDeviceDatabasePayload = (entries) => {
    const database = {};
    const seenKeys = new Set();
    for (const entry of entries) {
      const { key, ...value } = entry || {};
      const normalizedKey = String(key || "").trim().toUpperCase();
      if (!normalizedKey || !String(value.label || "").trim() || !String(value.platform || "").trim()) continue;
      if (seenKeys.has(normalizedKey)) {
        throw new Error(language === "en"
          ? `Database key is used more than once: ${normalizedKey}`
          : `Datenbankschlüssel ist mehrfach vergeben: ${normalizedKey}`);
      }
      seenKeys.add(normalizedKey);
      const normalized = {
        ...value,
        group: String(value.group || "").trim(),
        label: String(value.label || "").trim(),
        platform: String(value.platform || "sensor").trim(),
        eep_out: String(value.eep_out || "").trim().toUpperCase(),
        eltako: String(value.eltako || "").trim(),
        default_dc: String(value.default_dc || "").trim(),
        teach_in_telegram: String(value.teach_in_telegram || "").trim().toUpperCase(),
        sender_eep: String(value.sender_eep || "").trim().toUpperCase(),
        needs_sender: Boolean(value.needs_sender),
        rgbw: Boolean(value.rgbw),
        bidirectional: Boolean(value.bidirectional),
        device_family: String(value.device_family || "").trim().toUpperCase(),
        operating_mode: Number(value.operating_mode || 0),
        id_count: Math.max(1, Number(value.id_count || 1)),
        channels: Math.max(1, Number(value.channels || 1)),
        invert: Boolean(value.invert),
        battery_status: Boolean(value.battery_status),
        battery_eep: String(value.battery_eep || "").trim().toUpperCase(),
      };
      if (normalized.default_dc) {
        const currentClasses = Array.isArray(value.device_classes) ? value.device_classes.filter(Boolean) : [];
        normalized.device_classes = [...new Set([normalized.default_dc, ...currentClasses])];
      }
      database[normalizedKey] = normalized;
    }
    database[DEVICE_DB_MODE_KEY] = DEVICE_DB_MODE_AUTHORITATIVE;
    database[DEVICE_DB_SCHEMA_KEY] = DEVICE_DB_SCHEMA_VERSION;
    return database;
  };


  const f4usmModePresets = {
    1:{ key:"F6-02-01-F4USM61B-M1", label:"F4USM61B – Modus 1: 4-fach-Taster (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", battery_status:true, battery_eep:"A5-07-01", id_count:1, channels:1, invert:false },
    2:{ key:"A5-38-08-F4USM61B-M2", label:"F4USM61B – Modus 2: 2 × EIN/AUS (A5-38-08)", platform:"binary_sensor", eep_out:"A5-38-08", battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:false },
    3:{ key:"A5-08-01-F4USM61B-M3", label:"F4USM61B – Modus 3: 2 × Bewegung (A5-08-01)", platform:"sensor", eep_out:"A5-08-01", id_count:2, channels:2, invert:false },
    4:{ key:"D5-00-01-F4USM61B-M4", label:"F4USM61B – Modus 4: 2 × Fenster-/Türkontakt (D5-00-01)", platform:"binary_sensor", eep_out:"D5-00-01", default_dc:"window", device_classes:["window","door","opening"], battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:false },
    5:{ key:"F6-02-01-F4USM61B-M5", label:"F4USM61B – Modus 5: 2 × 2-fach-Taster (F6-02-01)", platform:"binary_sensor", eep_out:"F6-02-01", battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:false },
    6:{ key:"A5-08-01-F4USM61B-M6", label:"F4USM61B – Modus 6: Bewegung invertiert (A5-08-01)", platform:"sensor", eep_out:"A5-08-01", id_count:2, channels:2, invert:true },
    7:{ key:"D5-00-01-F4USM61B-M7", label:"F4USM61B – Modus 7: Fenster-/Türkontakt invertiert (D5-00-01)", platform:"binary_sensor", eep_out:"D5-00-01", default_dc:"window", device_classes:["window","door","opening"], battery_status:true, battery_eep:"A5-07-01", id_count:2, channels:2, invert:true },
    8:{ key:"A5-07-01-F4USM61B-M8", label:"F4USM61B – Modus 8: 2 × Bewegungsmelder (A5-07-01)", platform:"binary_sensor", eep_out:"A5-07-01", default_dc:"motion", device_classes:["motion","occupancy"], id_count:2, channels:2, invert:false },
  };
  const applyF4usmModePreset = (modeValue) => {
    const mode = Number(modeValue || 1);
    const preset = f4usmModePresets[mode] || f4usmModePresets[1];
    replaceDeviceDbEntries(entries => entries.map((entry, index) => index === deviceDbSelected ? {
      ...entry,
      ...preset,
      eltako:`F4USM61B Modus ${mode}`,
      group:"Funk-Modul",
      device_family:"F4USM61B",
      operating_mode:mode,
      needs_sender:false,
      sender_eep:"",
    } : entry));
  };

  const saveDeviceDatabase = async () => {
    // Read from the synchronously maintained ref so the last edited field is
    // included even when the user clicks Save immediately after changing it.
    const snapshot = deviceDbEntriesRef.current.map(entry => ({ ...entry }));
    const database = buildDeviceDatabasePayload(snapshot);
    try {
      const result = isElectron && window.electronAPI?.saveDeviceDatabase
        ? await window.electronAPI.saveDeviceDatabase(database)
        : { ok: true, database };
      if (!result?.ok) throw new Error(result?.error || "save failed");

      const persisted = result.database && typeof result.database === "object" ? result.database : database;
      const verification = isElectron && window.electronAPI?.loadDeviceDatabase
        ? await window.electronAPI.loadDeviceDatabase()
        : persisted;
      if (JSON.stringify(verification) !== JSON.stringify(persisted)) {
        throw new Error(language === "en" ? "Read-back verification failed." : "Kontrolle nach dem Speichern fehlgeschlagen.");
      }

      window.localStorage.setItem(DEVICE_DB_STORAGE_KEY, JSON.stringify(persisted));
      EEP_DB = mergeDeviceDatabase(DEFAULT_EEP_DB, persisted);
      // Keep the editor state exactly as entered. Rebuilding the form from the
      // merged database here made fields visibly jump back after confirming
      // the save dialog, even though the JSON file had been written.
      replaceDeviceDbEntries(snapshot);
      setDeviceDbRevision(value => value + 1);
      window.alert(language === "en"
        ? `Device database saved and verified.\n${result.filePath || ""}`
        : `Gerätedatenbank gespeichert und kontrolliert.\n${result.filePath || ""}`);
    } catch (error) {
      window.alert((language === "en" ? "Could not save device database: " : "Gerätedatenbank konnte nicht gespeichert werden: ") + (error?.message || error));
    }
  };
  const closeDeviceDbContextMenu = () => setDeviceDbContextMenu(null);
  const showDeviceDbContextMenu = (event, index = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (Number.isInteger(index)) setDeviceDbSelected(index);
    const menuWidth = 235;
    const menuHeight = index === null ? 145 : 285;
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    setDeviceDbContextMenu({ x, y, index });
  };
  const copyDeviceDbValue = async (value) => {
    const text = String(value || "");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    closeDeviceDbContextMenu();
  };
  const restoreSelectedDeviceDbEntry = () => {
    const current = deviceDbEntriesRef.current[deviceDbSelected];
    if (!current) return;
    const standard = DEFAULT_EEP_DB[current.key];
    if (!standard) {
      window.alert(language === "en" ? "This custom device has no default value." : "Für dieses benutzerdefinierte Gerät gibt es keinen Standardwert.");
      closeDeviceDbContextMenu();
      return;
    }
    replaceDeviceDbEntries(entries => entries.map((item, index) => index === deviceDbSelected ? { key: current.key, ...standard } : item));
    closeDeviceDbContextMenu();
  };
  const exportDeviceDatabase = async () => {
    try {
      const database = buildDeviceDatabasePayload(deviceDbEntriesRef.current);
      const yamlText = serializeDeviceDatabaseYaml(database);
      if (isElectron && window.electronAPI?.saveDeviceDatabaseFile) {
        await window.electronAPI.saveDeviceDatabaseFile(yamlText);
      } else {
        const blob = new Blob([yamlText], { type: "application/yaml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "eedtoy-device-database.yaml";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      window.alert((language === "en" ? "Could not export device database: " : "Gerätedatenbank konnte nicht exportiert werden: ") + (error?.message || error));
    }
    closeDeviceDbContextMenu();
  };

  const applyImportedDeviceDatabase = (fileText) => {
    let parsed;
    try {
      parsed = JSON.parse(fileText);
    } catch {
      parsed = parseDeviceDatabaseYaml(fileText);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(language === "en" ? "Invalid database structure." : "Ungültige Datenbankstruktur.");
    const migrated = migrateCustomDeviceDatabase(parsed);
    const imported = Object.entries(deviceDatabaseEntriesOnly(migrated)).map(([key, value]) => ({ key, ...value }));
    if (!imported.length) throw new Error(language === "en" ? "No devices found." : "Keine Geräte gefunden.");
    replaceDeviceDbEntries(imported);
    setDeviceDbSelected(0);
  };

  const openDeviceDatabaseImportDialog = async () => {
    try {
      if (isElectron && window.electronAPI?.openDeviceDatabaseFile) {
        const selected = await window.electronAPI.openDeviceDatabaseFile();
        if (!selected) return;
        applyImportedDeviceDatabase(selected.content);
      } else {
        deviceDbImportRef.current?.click();
      }
    } catch (error) {
      window.alert((language === "en" ? "Could not import device database: " : "Gerätedatenbank konnte nicht importiert werden: ") + (error?.message || error));
    }
    closeDeviceDbContextMenu();
  };

  const importDeviceDatabase = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      applyImportedDeviceDatabase(await file.text());
    } catch (error) {
      window.alert((language === "en" ? "Could not import device database: " : "Gerätedatenbank konnte nicht importiert werden: ") + (error?.message || error));
    }
    closeDeviceDbContextMenu();
  };

  const resetDeviceDatabase = async () => {
    if (!window.confirm(language === "en" ? "Restore the default device database?" : "Standard-Gerätedatenbank wiederherstellen?")) return;
    try {
      if (isElectron && window.electronAPI?.saveDeviceDatabase) await window.electronAPI.saveDeviceDatabase({});
      window.localStorage.removeItem(DEVICE_DB_STORAGE_KEY);
      EEP_DB = { ...DEFAULT_EEP_DB };
      replaceDeviceDbEntries(Object.entries(EEP_DB).filter(([key]) => ![DEVICE_DB_DELETED_KEYS, DEVICE_DB_MODE_KEY, DEVICE_DB_SCHEMA_KEY].includes(key)).map(([key, value]) => ({ key, ...value })));
      setDeviceDbSelected(0);
      setDeviceDbRevision(value => value + 1);
    } catch (error) {
      window.alert((language === "en" ? "Could not restore defaults: " : "Standarddaten konnten nicht wiederhergestellt werden: ") + (error?.message || error));
    }
  };

  if (isDeviceDatabaseWindow) {
    const entry = deviceDbEntries[deviceDbSelected] || {};
    const platformOptions = ["sensor","binary_sensor","switch","light","cover","climate"];
    const deviceClassOptions = {
      sensor:["temperature","humidity","power","energy","voltage","current","wind_speed","carbon_dioxide","volatile_organic_compounds_parts","battery"],
      binary_sensor:["door","window","opening","motion","occupancy","smoke","heat","moisture","battery","problem"],
      switch:["switch","outlet"], light:[], cover:["shutter","blind","awning","curtain","garage"], climate:[]
    };
    const closeWindow = () => window.electronAPI?.closeDeviceDatabase?.() || window.close();
    return <div className="dbWindow" onClick={closeDeviceDbContextMenu} onContextMenu={event=>{ if (event.target === event.currentTarget) showDeviceDbContextMenu(event, null); }}>
      <style>{`
        :root{font-family:Segoe UI,Arial,sans-serif;color:#1f2937;background:#eef2f5}*{box-sizing:border-box}body{margin:0;overflow:hidden}
        .dbWindow{height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:#eef2f5}
        .dbHeader{padding:14px 18px;background:#fff;border-bottom:1px solid #d6dee6;display:flex;justify-content:space-between;align-items:center}
        .dbHeader h1{font-size:18px;margin:0}.sub{font-size:12px;color:#64748b;margin-top:3px}
        .dbBody{display:grid;grid-template-columns:minmax(300px,380px) minmax(520px,1fr);min-height:0}
        .dbList{background:#f8fafc;border-right:1px solid #d6dee6;padding:12px;overflow:auto}
        .dbEditor{padding:18px 22px;overflow:auto}.toolbar{display:flex;gap:8px;margin-bottom:12px}
        button{font:inherit;border:1px solid #b9c7d3;border-radius:7px;background:#fff;padding:8px 12px;cursor:pointer}button.primary{background:#0079a9;color:#fff;border-color:#0079a9}button.danger{color:#b42318;border-color:#f0b7b2}
        .deviceItem{display:block;width:100%;text-align:left;padding:9px 10px;margin-bottom:5px;border-radius:7px;background:#fff}.deviceItem.active{border:2px solid #0ea5e9;background:#e0f2fe}
        .deviceTitle{font-weight:700;font-size:13px}.deviceMeta{font-size:11px;color:#64748b;margin-top:2px}
        .formGrid{display:grid;grid-template-columns:repeat(2,minmax(240px,1fr));gap:14px 18px}.field label{display:block;font-size:12px;font-weight:650;margin-bottom:5px;color:#334155}
        input,select{width:100%;height:38px;border:1px solid #b9c7d3;border-radius:6px;background:#fff;padding:7px 9px;font:inherit}
        .dbFooter{padding:12px 18px;background:#fff;border-top:1px solid #d6dee6;display:flex;justify-content:space-between;align-items:center}.footerRight{display:flex;gap:8px}
        .dbContextMenu{position:fixed;z-index:1000;width:235px;background:#fff;border:1px solid #b9c7d3;border-radius:8px;box-shadow:0 14px 35px rgba(15,23,42,.24);padding:6px}
        .dbContextMenu button{width:100%;border:0;background:transparent;text-align:left;padding:8px 10px;border-radius:5px}.dbContextMenu button:hover{background:#e0f2fe}.dbContextMenu .separator{height:1px;background:#e2e8f0;margin:5px 2px}.dbContextMenu button.dangerItem{color:#b42318}
        @media(max-width:900px){.dbBody{grid-template-columns:300px 1fr}.formGrid{grid-template-columns:1fr}}
      `}</style>
      <header className="dbHeader">
        <div><h1>{language==="en"?"Device database":"Gerätedatenbank"}</h1><div className="sub">{language==="en"?"Changes are stored locally and survive EEDTOY updates.":"Änderungen werden lokal gespeichert und bleiben bei EEDTOY-Updates erhalten."}</div></div>
        <button onClick={closeWindow}>✕</button>
      </header>
      <div className="dbBody">
        <aside className="dbList" onContextMenu={event=>{ if (!event.target.closest(".deviceItem")) showDeviceDbContextMenu(event, null); }}>
          <div className="toolbar"><button className="primary" onClick={addDeviceDbEntry}>+ {language==="en"?"New":"Neu"}</button><button onClick={duplicateDeviceDbEntry}>{language==="en"?"Duplicate":"Duplizieren"}</button></div>
          {deviceDbEntries.map((item,index)=><button className={`deviceItem ${index===deviceDbSelected?"active":""}`} key={`${item.key}-${index}`} onClick={()=>setDeviceDbSelected(index)} onContextMenu={event=>showDeviceDbContextMenu(event,index)}><div className="deviceTitle">{item.eltako ? translateDeviceName(language, item.eltako) : translateDeviceLabel(language, item.label)}</div><div className="deviceMeta">{item.platform} · {item.eep_out||item.key}</div></button>)}
        </aside>
        <main className="dbEditor">
          <div className="formGrid">
            <div className="field"><label>{language==="en"?"Database key":"Datenbankschlüssel"}</label><input value={entry.key||""} onChange={e=>updateDeviceDbField("key",e.target.value.toUpperCase())}/></div>
            <div className="field"><label>{language==="en"?"Device name":"Gerätename"}</label><input value={language==="en"?translateDeviceName(language,entry.eltako||""):(entry.eltako||"")} onChange={e=>updateDeviceDbField("eltako",e.target.value)}/></div>
            <div className="field"><label>{language==="en"?"Display label":"Anzeigetext"}</label><input value={language==="en"?translateDeviceLabel(language,entry.label||""):(entry.label||"")} onChange={e=>updateDeviceDbField("label",e.target.value)}/></div>
            <div className="field"><label>{language==="en"?"Category":"Kategorie"}</label><select value={entry.platform||"sensor"} onChange={e=>updateDeviceDbField("platform",e.target.value)}>{platformOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
            <div className="field"><label>{language==="en"?"Group":"Gruppe"}</label><select value={entry.group||""} onChange={e=>updateDeviceDbField("group",e.target.value)}>{[...new Set(Object.values(DEFAULT_EEP_DB).map(v=>v.group))].map(v=><option key={v} value={v}>{translateGroup(language,v)}</option>)}</select></div>
            <div className="field"><label>EEP</label><input value={entry.eep_out||""} onChange={e=>updateDeviceDbField("eep_out",e.target.value.toUpperCase())}/></div>
            <div className="field"><label>{language==="en"?"Device class":"Geräteklasse"}</label><select value={entry.default_dc||""} onChange={e=>updateDeviceDbField("default_dc",e.target.value)}><option value="">—</option>{(deviceClassOptions[entry.platform]||[]).map(v=><option key={v}>{v}</option>)}</select></div>
            <div className="field"><label>{language==="en"?"Teach-in telegram":"Lerntelegramm"}</label><input value={entry.teach_in_telegram||""} onChange={e=>updateDeviceDbField("teach_in_telegram",e.target.value.toUpperCase())}/></div>
            <div className="field"><label>{language==="en"?"Sender required":"Sender erforderlich"}</label><select value={entry.needs_sender?"yes":"no"} onChange={e=>updateDeviceDbField("needs_sender",e.target.value==="yes")}><option value="no">{language==="en"?"No":"Nein"}</option><option value="yes">{language==="en"?"Yes":"Ja"}</option></select></div>
            {entry.needs_sender&&<div className="field"><label>{language==="en"?"Sender EEP":"Sender-EEP"}</label><input value={entry.sender_eep||""} onChange={e=>updateDeviceDbField("sender_eep",e.target.value.toUpperCase())}/></div>}
            {entry.platform==="cover"&&<><div className="field"><label>{language==="en"?"Channels":"Kanäle"}</label><input type="number" min="1" value={entry.channels||1} onChange={e=>updateDeviceDbField("channels",Number(e.target.value)||1)}/></div><div className="field"><label>{language==="en"?"Default opening time":"Standard-Öffnungszeit"}</label><input type="number" min="1" value={entry.time_opens||25} onChange={e=>updateDeviceDbField("time_opens",Number(e.target.value)||25)}/></div><div className="field"><label>{language==="en"?"Default closing time":"Standard-Schließzeit"}</label><input type="number" min="1" value={entry.time_closes||25} onChange={e=>updateDeviceDbField("time_closes",Number(e.target.value)||25)}/></div></>}
            {entry.platform==="climate"&&<><div className="field"><label>{language==="en"?"Min. temperature":"Min. Temperatur"}</label><input type="number" step="0.5" value={entry.min_target_temperature??16} onChange={e=>updateDeviceDbField("min_target_temperature",Number(e.target.value))}/></div><div className="field"><label>{language==="en"?"Max. temperature":"Max. Temperatur"}</label><input type="number" step="0.5" value={entry.max_target_temperature??25} onChange={e=>updateDeviceDbField("max_target_temperature",Number(e.target.value))}/></div><div className="field"><label>{language==="en"?"Frost protection temperature":"Frostschutztemperatur"}</label><input type="number" step="0.5" value={entry.frost_temperature??8} onChange={e=>updateDeviceDbField("frost_temperature",Number(e.target.value))}/></div><div className="field"><label>{language==="en"?"Hysteresis":"Hysterese"}</label><input type="number" step="0.1" value={entry.hysteresis??1} onChange={e=>updateDeviceDbField("hysteresis",Number(e.target.value))}/></div></>}
            {entry.platform==="light"&&<><div className="field"><label>RGBW</label><select value={entry.rgbw?"yes":"no"} onChange={e=>updateDeviceDbField("rgbw",e.target.value==="yes")}><option value="no">{language==="en"?"No":"Nein"}</option><option value="yes">{language==="en"?"Yes":"Ja"}</option></select></div><div className="field"><label>{language==="en"?"Dimming speed":"Dimmgeschwindigkeit"}</label><input type="number" min="0" value={entry.dimming_speed??0} onChange={e=>updateDeviceDbField("dimming_speed",Number(e.target.value))}/></div></>}
            {entry.platform==="sensor" && (entry.group==="Zähler" || String(entry.eep_out||entry.key||"").startsWith("A5-12-"))&&<div className="field"><label>{language==="en"?"Meter tariffs":"Zählertarife"}</label><input value={entry.meter_tariffs||""} onChange={e=>updateDeviceDbField("meter_tariffs",e.target.value)} placeholder="[1]"/></div>}

            {String(entry.device_family||"").toUpperCase()==="F4USM61B"&&<>
              <div className="field"><label>{language==="en"?"Operating mode":"Betriebsart"}</label><select value={entry.operating_mode||1} onChange={e=>applyF4usmModePreset(e.target.value)}>{[1,2,3,4,5,6,7,8].map(mode=><option key={mode} value={mode}>{language==="en"?`Mode ${mode}`:`Modus ${mode}`}</option>)}</select></div>
              <div className="field"><label>{language==="en"?"Radio IDs":"Anzahl Funk-IDs"}</label><input type="number" min="1" max="2" value={entry.id_count||1} onChange={e=>updateDeviceDbField("id_count",Number(e.target.value)||1)}/></div>
              <div className="field"><label>{language==="en"?"Channels":"Kanäle"}</label><input type="number" min="1" max="2" value={entry.channels||1} onChange={e=>updateDeviceDbField("channels",Number(e.target.value)||1)}/></div>
              <div className="field"><label>{language==="en"?"Inverted":"Invertiert"}</label><select value={entry.invert?"yes":"no"} onChange={e=>updateDeviceDbField("invert",e.target.value==="yes")}><option value="no">{language==="en"?"No":"Nein"}</option><option value="yes">{language==="en"?"Yes":"Ja"}</option></select></div>
              <div className="field"><label>{language==="en"?"Device family":"Gerätefamilie"}</label><input value={entry.device_family||""} onChange={e=>updateDeviceDbField("device_family",e.target.value.toUpperCase())}/></div>
            </>}
          </div>
          <div style={{marginTop:18}}><button className="danger" onClick={deleteDeviceDbEntry}>{language==="en"?"Delete device":"Gerät löschen"}</button></div>
        </main>
      </div>
      <input ref={deviceDbImportRef} type="file" accept="application/yaml,text/yaml,.yaml,.yml,application/json,.json" hidden onChange={importDeviceDatabase}/>
      {deviceDbContextMenu&&<div className="dbContextMenu" style={{left:deviceDbContextMenu.x,top:deviceDbContextMenu.y}} onClick={event=>event.stopPropagation()} onContextMenu={event=>event.preventDefault()}>
        {deviceDbContextMenu.index===null?<>
          <button onClick={()=>{addDeviceDbEntry();closeDeviceDbContextMenu();}}>+ {language==="en"?"New device":"Neues Gerät"}</button>
          <div className="separator"/>
          <button onClick={()=>{openDeviceDatabaseImportDialog();}}>{language==="en"?"Import database…":"Datenbank importieren…"}</button>
          <button onClick={exportDeviceDatabase}>{language==="en"?"Export database…":"Datenbank exportieren…"}</button>
        </>:<>
          <button onClick={closeDeviceDbContextMenu}>{language==="en"?"Edit":"Bearbeiten"}</button>
          <button onClick={()=>{duplicateDeviceDbEntry();closeDeviceDbContextMenu();}}>{language==="en"?"Duplicate":"Duplizieren"}</button>
          <button onClick={()=>{addDeviceDbEntry();closeDeviceDbContextMenu();}}>+ {language==="en"?"New device":"Neues Gerät"}</button>
          <div className="separator"/>
          <button onClick={()=>copyDeviceDbValue(deviceDbEntriesRef.current[deviceDbSelected]?.key)}>{language==="en"?"Copy database key":"Datenbankschlüssel kopieren"}</button>
          <button onClick={()=>copyDeviceDbValue(deviceDbEntriesRef.current[deviceDbSelected]?.eep_out)}>{language==="en"?"Copy EEP":"EEP kopieren"}</button>
          <button onClick={restoreSelectedDeviceDbEntry}>{language==="en"?"Restore default":"Standardwert wiederherstellen"}</button>
          <div className="separator"/>
          <button className="dangerItem" onClick={()=>{deleteDeviceDbEntry();closeDeviceDbContextMenu();}}>{language==="en"?"Delete":"Löschen"}</button>
        </>}
      </div>}
      <footer className="dbFooter"><button onClick={resetDeviceDatabase}>{language==="en"?"Restore defaults":"Standard wiederherstellen"}</button><div className="footerRight"><button onClick={closeWindow}>{language==="en"?"Cancel":"Abbrechen"}</button><button className="primary" onClick={saveDeviceDatabase}>{language==="en"?"Save":"Speichern"}</button></div></footer>
    </div>;
  }

  return (
    <div className="appShell">
      <style>{`
        :root{
          --bg:#eef2f5;
          --sidebar:#003b5c;
          --sidebar-2:#005f8f;
          --panel:#ffffff;
          --panel-soft:#f7f9fb;
          --line:#d6dee6;
          --line-strong:#b9c7d3;
          --text:#1f2937;
          --muted:#667485;
          --muted-2:#8a96a3;
          --brand:#0079a9;
          --brand-dark:#005c82;
          --brand-soft:#e6f6fb;
          --accent:#f2a900;
          --ok:#20845a;
          --danger:#b42318;
        }
        *{box-sizing:border-box}
        body{margin:0;background:var(--bg);font-family:'Segoe UI','Segoe UI Symbol',Arial,sans-serif;color:var(--text)}
        ::-webkit-scrollbar{width:8px;height:8px}
        ::-webkit-scrollbar-track{background:#edf1f4}
        ::-webkit-scrollbar-thumb{background:#aebbc7;border-radius:8px}
        .appShell{min-height:100vh;display:grid;grid-template-columns:280px minmax(0,1fr);background:var(--bg)}
        .sidebar{background:linear-gradient(180deg,var(--sidebar),#002d46);color:#dbe5ee;display:flex;flex-direction:column;border-right:1px solid #00263a;min-height:100vh;position:sticky;top:0}
        .brandBlock{padding:1.35rem 1.25rem 1.1rem;border-bottom:1px solid rgba(255,255,255,.08)}
        .brandKicker{font-size:.68rem;text-transform:uppercase;letter-spacing:.16em;color:#7fb2c7;font-weight:700;margin-bottom:.45rem}
        .brandTitle{font-size:1.2rem;font-weight:800;letter-spacing:-.02em;color:#fff}
        .brandSub{margin-top:.35rem;font-size:.76rem;color:#98a9b8;line-height:1.45}
        .navSteps{padding:1rem .85rem;display:flex;flex-direction:column;gap:.35rem}
        .step{display:grid;grid-template-columns:28px 1fr;align-items:center;gap:.65rem;padding:.7rem .75rem;border-radius:10px;cursor:pointer;color:#a8b7c5;border:1px solid transparent;transition:background .15s,border .15s,color .15s}
        .step:hover{background:rgba(255,255,255,.06);color:#fff}
        .step.active{background:#243344;border-color:#33536a;color:#fff}
        .step.done{color:#bde8d3;background:rgba(32,132,90,.12)}
        .stepBadge{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;background:#0f1720;border:1px solid rgba(255,255,255,.12);color:#91a2b3}
        .step.active .stepBadge{background:#00a3d7;color:white;border-color:#7bd7f2}
        .step.done .stepBadge{background:var(--ok);color:white;border-color:#51b686}
        .stepText{font-size:.86rem;font-weight:700}.stepHint{font-size:.68rem;color:#7f91a2;margin-top:.15rem;font-weight:500}
        .sideStatus{margin-top:auto;padding:1rem 1.25rem;border-top:1px solid rgba(255,255,255,.08);font-size:.72rem;color:#95a7b7;line-height:1.6}
        .workspace{min-width:0;display:flex;flex-direction:column}
        .topbar{height:74px;background:#fff;border-bottom:3px solid var(--brand);display:flex;align-items:center;justify-content:space-between;padding:0 1.75rem;position:sticky;top:0;z-index:5}
        .pageTitle{font-size:1.05rem;font-weight:800;color:#111827}.pageSub{font-size:.76rem;color:var(--muted);margin-top:.18rem}
        .topMeta{display:flex;align-items:center;gap:.5rem;font-size:.72rem;color:var(--muted)}
        .projectActions{flex-wrap:wrap;justify-content:flex-end}.projectActions .btn{white-space:nowrap;padding:.48rem .72rem;font-size:.76rem}
        .statusPill{border:1px solid var(--line);background:var(--panel-soft);border-radius:999px;padding:.32rem .62rem;color:#405061;font-weight:700}
        .content{padding:1.5rem 1.75rem 2rem;max-width:1260px;width:100%;margin:0 auto}
        input,select{font-family:'Segoe UI','Segoe UI Symbol',Arial,sans-serif;background:#fff;border:1px solid var(--line-strong);color:var(--text);padding:.62rem .75rem;border-radius:7px;font-size:.88rem;width:100%;outline:none;transition:border .15s,box-shadow .15s;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
        input:focus,select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(0,107,143,.13)}
        input.err{border-color:var(--danger);box-shadow:0 0 0 3px rgba(180,35,24,.10)}
        label{display:block;font-size:.72rem;color:#53616f;margin-bottom:.32rem;letter-spacing:.02em;font-weight:700}
        code{font-family:'Cascadia Mono','Consolas',monospace;background:#eef2f5;border:1px solid #d9e0e7;border-radius:4px;padding:.05rem .25rem;color:#245873}
        .em{color:var(--danger);font-size:.7rem;margin-top:.25rem}
        .card{background:var(--panel)!important;border:1px solid var(--line)!important;border-radius:12px!important;overflow:hidden;box-shadow:0 2px 10px rgba(22,34,45,.05)}
        .sectionHead{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.15rem;border-bottom:1px solid var(--line);background:#fbfcfd}
        .sectionTitle{font-size:.86rem;font-weight:800;color:#1f2937}.sectionText{font-size:.72rem;color:var(--muted);margin-top:.15rem}
        .btn{font-family:'Segoe UI','Segoe UI Symbol',Arial,sans-serif;cursor:pointer;border-radius:7px;font-size:.82rem;padding:.58rem 1rem;transition:background .15s,border .15s,transform .08s,box-shadow .15s;border:1px solid transparent;font-weight:700;background:#fff}
        .btn:hover{transform:translateY(-1px)}.btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
        .pri{background:var(--brand);color:#fff;box-shadow:none}.pri:hover{background:var(--brand-dark)}
        .ghost{background:#fff;color:var(--brand);border:1px solid #b9cbd6}.ghost:hover{background:var(--brand-soft);border-color:#8fb0c2}
        .del{background:#fff;color:var(--danger);border:1px solid #f1b7b1;padding:.32rem .7rem;font-size:.75rem}.del:hover{background:#fff0ee;border-color:#e2857a}
        .edit{background:#fff;color:#53616f;border:1px solid var(--line);padding:.32rem .7rem;font-size:.75rem}.edit:hover{border-color:#8fb0c2;color:var(--brand);background:var(--brand-soft)}
        .rh:hover{background:#f8fafb!important}
        select optgroup{color:var(--brand);font-style:normal;font-weight:800;background:#fff}
        select option{background:#fff;color:var(--text);font-family:'Segoe UI','Segoe UI Symbol',Arial,sans-serif}
        .gatewayGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem}
        .gatewayTile{padding:.85rem;border-radius:9px;cursor:pointer;transition:all .15s;border:1px solid var(--line);background:#fff;color:var(--text)}
        .gatewayTile:hover{border-color:#8fb0c2;background:#f8fbfd}
        .gatewayTile.active{border-color:var(--brand);background:var(--brand-soft);box-shadow:inset 4px 0 0 var(--brand)}
        .gatewayName{font-weight:800;font-size:.82rem;color:#17212b;margin-bottom:.22rem}
        .gatewayDesc{font-size:.67rem;color:#607080;line-height:1.35}
        .gatewayTile.active .gatewayName{color:#003f55}
        .gatewayTile.active .gatewayDesc{color:#426273}
        .twoCol{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:1rem;align-items:start}
        @media (max-width: 920px){.appShell{grid-template-columns:1fr}.sidebar{position:relative;min-height:auto}.navSteps{flex-direction:row;overflow:auto}.sideStatus{display:none}.twoCol{grid-template-columns:1fr}.topbar{position:relative;height:auto;min-height:74px;align-items:flex-start;gap:.75rem;padding-top:.85rem;padding-bottom:.85rem;flex-direction:column}.projectActions{justify-content:flex-start}.content{padding:1rem}}
      `}</style>

      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandKicker">ELTAKO · ENOCEAN · YAML</div>
          <div className="brandTitle">EEDTOY</div>
          <div className="brandSub">ELTAKO EnOcean Device to YAML Generator</div>
        </div>
        <div className="navSteps">
          {[
            {n:1,label:t("nav.gateway"),hint:t("nav.gatewayHint")},
            {n:2,label:t("nav.devices"),hint:t("nav.devicesHint")},
            {n:3,label:t("nav.yaml"),hint:t("nav.yamlHint")},
          ].map(s=>(
            <div key={s.n} className={`step ${step===s.n?"active":step>s.n?"done":"inactive"}`} onClick={()=>{ if(s.n<3||yaml) setStep(s.n); }}>
              <span className="stepBadge">{step>s.n?"✓":s.n}</span>
              <span><div className="stepText">{s.label}</div><div className="stepHint">{s.hint}</div></span>
            </div>
          ))}
        </div>
        <div className="sideStatus">
          <div><strong>{t("common.gateway")}:</strong> {gateway.type}</div>
          <div><strong>{t("common.baseId")}:</strong> {gateway.base_id || t("common.notSet")}</div>
          <div><strong>{t("common.devices")}:</strong> {devices.length}</div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="pageTitle">{step===1?t("page.gatewayTitle"):step===2?t("page.devicesTitle"):t("page.yamlTitle")}</div>
            <div className="pageSub">{step===1?t("page.gatewaySubtitle"):step===2?t("page.devicesSubtitle"):t("page.yamlSubtitle")}</div>
          </div>
          <div className="topMeta projectActions">
            {projectFileName&&<span className="statusPill" title={t("common.projectFileTitle")}>{projectFileName}</span>}
            <button className="btn ghost" onClick={handleOpenProject} disabled={!isElectron} title={t("common.openProjectTitle")}>{t("common.openProject")}</button>
            <button className="btn pri" onClick={handleSaveProjectAs} disabled={!isElectron} title={t("common.saveProjectAsTitle")}>{t("common.saveProjectAs")}</button>
            <span className="statusPill">{t(devices.length === 1 ? "common.deviceCount" : "common.deviceCountPlural", { count: devices.length })}</span>
          </div>
        </header>
        <div className="content">
        {projectMsg&&(
          <div style={{marginBottom:"1rem",padding:".72rem .9rem",borderRadius:8,border:`1px solid ${projectMsg.startsWith("✓")?"#9fd3b7":projectMsg.startsWith("✗")?"#f1b7b1":"#b9cbd6"}`,background:projectMsg.startsWith("✓")?"#effaf4":projectMsg.startsWith("✗")?"#fff0ee":"#eef5f8",color:projectMsg.startsWith("✓")?"#17633d":projectMsg.startsWith("✗")?"#9c251c":"#245873",fontSize:".76rem",fontWeight:650,lineHeight:1.5}}>
            {projectMsg}
          </div>
        )}
        {/* ─── STEP 1: GATEWAY ─── */}
        {step===1&&(
          <div className="card" style={{padding:"1.25rem"}}>
            <div style={{fontSize:".72rem",color:"#53616f",marginBottom:"1rem",fontWeight:600}}>{t("gateway.select")}</div>

            {/* Gateway type cards */}
            <div className="gatewayGrid" style={{marginBottom:"1rem"}}>
              {GATEWAY_TYPES.map(gw=>(
                <div key={gw.value} onClick={()=>setGateway(g=>({...g,type:gw.value}))}
                  className={`gatewayTile ${gateway.type===gw.value ? "active" : ""}`}>
                  <div className="gatewayName">{gw.label}</div>
                  <div className="gatewayDesc">{t(gw.descKey)}</div>
                </div>
              ))}
            </div>

            {isElectron && (
              <div style={{margin:".8rem 0 1rem",display:"flex",gap:".6rem",alignItems:"center",flexWrap:"wrap"}}>
                <button className="btn ghost" onClick={handleAutoDetectGateway} disabled={detecting || disconnectingGateway}>
                  {detecting ? t("gateway.searching") : t("gateway.detect")}
                </button>
                <button
                  className="btn ghost"
                  onClick={handleDisconnectGateway}
                  disabled={detecting || disconnectingGateway || !gateway.serial_path?.trim() || !["fam14","fgw14usb"].includes(gateway.type)}
                  title={!["fam14","fgw14usb"].includes(gateway.type)
                    ? t("gateway.disconnectTitleWrongType")
                    : !gateway.serial_path?.trim()
                      ? t("gateway.disconnectTitleMissingPort")
                      : t("gateway.disconnectTitleReady")}
                >
                  {disconnectingGateway ? t("gateway.disconnecting") : t("gateway.disconnect")}
                </button>
                <div style={{fontSize:".68rem",color:"#64748b"}}>
                  {t("gateway.detectHelp")}
                </div>
              </div>
            )}

            {/* Dynamic fields based on selected gateway */}
            {(()=>{
              const gw = GATEWAY_TYPES.find(g=>g.value===gateway.type);
              return (
                <div style={{display:"grid",gridTemplateColumns:"minmax(300px,1fr) minmax(360px,1.2fr) minmax(260px,1fr)",gap:".75rem",marginBottom:"1rem",alignItems:"start"}}>
                  {gw?.has_serial&&(
                    <div>
                      <label>{t("gateway.serialPort")}</label>
                      <div style={{display:"flex",gap:".4rem"}}>
              <div style={{display:"flex",flexDirection:"column",gap:".35rem",flex:1}}>
                <select
                  value={ports.some(p=>p.path===gateway.serial_path) ? gateway.serial_path : "__manual__"}
                  onChange={e=>{
                    const value = e.target.value;
                    setGateway(g=>({...g,serial_path:value==="__manual__"?"":value}));
                  }}
                >
                  <option value="__manual__">{language==="en"?"Enter COM port manually":"COM-Port manuell eingeben"}</option>
                  {ports.map(p=>(
                    <option key={p.path} value={p.path}>
                      {p.manufacturer?`${p.path} — ${p.manufacturer}`:p.path}
                    </option>
                  ))}
                </select>
                {!ports.some(p=>p.path===gateway.serial_path)&&(
                  <input
                    value={gateway.serial_path}
                    onChange={e=>setGateway(g=>({...g,serial_path:e.target.value}))}
                    placeholder={t("gateway.serialPortPlaceholder")}
                  />
                )}
              </div>
                        {isElectron&&(
                          <button className="btn ghost" style={{padding:".4rem .7rem",fontSize:".7rem",whiteSpace:"nowrap"}} onClick={handleScanPorts}>{t("common.search")}</button>
                        )}
                      </div>
                      <div style={{fontSize:".62rem",color:"#6b7280",marginTop:".2rem"}}>
                        {isElectron ? t("gateway.scanPortsHelp") : t("gateway.serialPortBrowserHelp")}
                      </div>
                    </div>
                  )}
                  {gw?.has_base_id&&(
                    <div>
                      <label>Base-ID</label>
                      <div style={{display:"flex",gap:".4rem"}}>
                        <input value={gateway.base_id} onChange={e=>setGateway(g=>({...g,base_id:e.target.value}))} placeholder="FF-AA-80-00" style={{flex:"0 0 150px",minWidth:150}}/>
                        {isElectron&&(
                          <button className="btn ghost" style={{padding:".4rem .9rem",fontSize:".72rem",whiteSpace:"nowrap",minWidth:142}} onClick={handleDetectBaseId} disabled={detecting}>
                            {detecting ? t("gateway.readingBaseId") : t("gateway.readBaseId")}
                          </button>
                        )}
                      </div>
                      <div style={{fontSize:".62rem",color:"#6b7280",marginTop:".2rem"}}>
                        {isElectron ? t("gateway.readBaseIdHelp") : t("gateway.baseIdBackHelp")}
                      </div>
                    </div>
                  )}
                  {gw?.has_lan&&(
                    <div>
                      <label>{t("gateway.ipAddress")}</label>
                      <input value={gateway.lan_address} onChange={e=>setGateway(g=>({...g,lan_address:e.target.value}))} placeholder="192.168.1.100"/>
                      <div style={{fontSize:".62rem",color:"#6b7280",marginTop:".2rem"}}>{t("gateway.port5100")}</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Detect status message */}
            {detectMsg&&(
              <div style={{fontSize:".72rem",padding:".5rem .75rem",borderRadius:5,marginBottom:"1rem",
                background: detectMsg.startsWith("✓")?"#14532d22":"#450a0a22",
                color: detectMsg.startsWith("✓")?"#22c55e":"#f87171",
                border: `1px solid ${detectMsg.startsWith("✓")?"#14532d":"#450a0a"}`}}>
                {detectMsg}
              </div>
            )}

            <div style={{background:"#eef5f8",border:"1px solid #c6d9e4",borderRadius:7,padding:".75rem",marginBottom:"1.2rem",fontSize:".7rem",color:"#64748b",lineHeight:1.8}}>
              <strong style={{color:"#53616f"}}>{t("gateway.setupHeading")}</strong><br/>
              {t("gateway.setup1")}<br/>
              {t("gateway.setup2")}<br/>
              {t("gateway.setup3")}<br/>
              {t("gateway.setup4Before")}
            </div>

            <button className="btn pri" onClick={()=>setStep(2)}>{t("gateway.continueToDevices")}</button>
          </div>
        )}

        {/* ─── STEP 2: DEVICES ─── */}
        {step===2&&(
          <>

            {/* PCT14 Import */}
            <div className="card" style={{padding:"1.1rem",marginBottom:"1rem"}}>
              <div style={{fontSize:".72rem",color:"#53616f",marginBottom:".7rem",fontWeight:600}}>{t("devices.importTitle")}</div>
              <div style={{fontSize:".68rem",color:"#64748b",lineHeight:1.7,marginBottom:".8rem"}}>
                {t("devices.importDescription")}
              </div>
              {(pct14DetectedFam14 || pct14DetectedFgw14) && (
                <div style={{border:"1px solid #c6d9e4",background:"#f2f8fb",borderRadius:8,padding:".7rem .8rem",marginBottom:".85rem"}}>
                  <div style={{fontSize:".68rem",color:"#53616f",fontWeight:800,marginBottom:".55rem"}}>{t("devices.detectedFromPct14")}</div>
                  {pct14DetectedFam14 && (
                    <label style={{display:"flex",alignItems:"center",gap:".55rem",fontSize:".72rem",color:"#405061",fontWeight:700,marginBottom:pct14DetectedFgw14?".55rem":0}}>
                      <input
                        type="checkbox"
                        checked={importFam14Gateway}
                        onChange={e=>handleImportFam14GatewayToggle(e.target.checked)}
                        style={{width:"auto",margin:0}}
                      />
                      {t("devices.useFam14Gateway")}
                    </label>
                  )}
                  {pct14DetectedFgw14 && (
                    <label style={{display:"flex",alignItems:"center",gap:".55rem",fontSize:".72rem",color:"#405061",fontWeight:700,marginBottom:0}}>
                      <input
                        type="checkbox"
                        checked={importFgw14Gateway}
                        onChange={e=>handleImportFgw14GatewayToggle(e.target.checked)}
                        style={{width:"auto",margin:0}}
                      />
                      {t("devices.useFgw14Gateway")}
                    </label>
                  )}
                </div>
              )}
              <label className="btn ghost" style={{display:"inline-block",width:"auto"}}>
                {t("devices.chooseFile")}
                <input type="file" accept=".xml,.html,.htm,text/xml,text/html" onChange={handlePct14Import} style={{display:"none"}} />
              </label>
              {importMsg&&(
                <div style={{fontSize:".72rem",padding:".5rem .75rem",borderRadius:5,marginTop:".8rem",
                  background: importMsg.startsWith("✓")?"#14532d22":"#450a0a22",
                  color: importMsg.startsWith("✓")?"#22c55e":"#f87171",
                  border: `1px solid ${importMsg.startsWith("✓")?"#14532d":"#450a0a"}`}}>
                  {importMsg}
                </div>
              )}
            </div>

            {/* Form */}
            <div className="card" style={{padding:"1.1rem",marginBottom:"1rem"}}>
              <div style={{fontSize:".72rem",color:"#53616f",marginBottom:".9rem",fontWeight:600}}>
                {editIdx!==null ? t("devices.editHeading", { number: editIdx + 1 }) : t("devices.addHeading")}
              </div>

              {/* Name · ID · Raum */}
              <div style={{display:"grid",gridTemplateColumns:"minmax(180px,1fr) minmax(340px,1.4fr) minmax(180px,1fr)",gap:".65rem",marginBottom:".65rem"}}>
                <div>
                  <label>{t("devices.name")}</label>
                  <input className={errors.name?"err":""} value={form.name} onChange={e=>{setForm(f=>({...f,name:e.target.value})); setErrors({});}} placeholder={t("devices.namePlaceholder")}/>
                  {errors.name&&<div className="em">{errors.name}</div>}
                </div>
                <div>
                  {String(profile.device_family || "").toUpperCase() === "FTS14EM" && (
                    <>
                      <label>{language === "en" ? "ID range" : "ID-Bereich"}</label>
                      <select
                        value={form.id_range || "1"}
                        onChange={e => {
                          const previousExpected = fts14emBaseIdForRange(form.id_range || "1");
                          const nextRange = e.target.value;
                          const nextExpected = fts14emBaseIdForRange(nextRange);
                          setForm(f => ({
                            ...f,
                            id_range: nextRange,
                            dev_id: !f.dev_id || normalizeId(f.dev_id) === previousExpected ? nextExpected : f.dev_id,
                          }));
                          setErrors({});
                        }}
                        style={{marginBottom:".5rem"}}
                      >
                        {FTS14EM_ID_RANGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </>
                  )}
                  <label>{t("devices.deviceId")}</label>
                  <div style={{display:"flex",gap:".35rem"}}>
                    <input className={errors.dev_id?"err":""} value={form.dev_id} onChange={e=>{setForm(f=>({...f,dev_id:e.target.value})); setErrors({});}} placeholder={String(profile.device_family || "").toUpperCase() === "FTS14EM" ? "00-00-10-01" : "FF-AA-BB-CC"} style={{flex:1,minWidth:170}}/>
                    <button
                      className="btn ghost"
                      onClick={String(profile.device_family || "").toUpperCase() === "FTS14EM" ? handleLearnFts14emBaseId : handleLearnDeviceId}
                      disabled={learningId}
                      title={String(profile.device_family || "").toUpperCase() === "FTS14EM"
                        ? (language === "en" ? "Press the same E1 button five times; detection only fills the ID field" : "Dieselbe E1-Taste fünfmal drücken; die Erkennung füllt nur das ID-Feld")
                        : t("devices.autoDetectTitle")}
                      style={{width:"auto",whiteSpace:"nowrap",padding:".55rem .7rem"}}
                    >
                      {learningId
                        ? "…"
                        : String(profile.device_family || "").toUpperCase() === "FTS14EM"
                          ? (language === "en" ? "Detect base ID (5× E1)" : "Basis-ID erkennen (5× E1)")
                          : t("devices.autoDetect")}
                    </button>
                  </div>
                  {errors.dev_id&&<div className="em">{errors.dev_id}</div>}
                  {String(profile.device_family || "").toUpperCase() === "FTS14EM" && (
                    <div style={{fontSize:".65rem",marginTop:".35rem",color:"#53616f",lineHeight:1.45}}>
                      {language === "en"
                        ? "Select the ID range, use FGW14-USB/FAM14 and press the same E1 button five times. Detection fills only the ID field; click Add to save the device."
                        : "ID-Bereich auswählen, FGW14-USB/FAM14 verwenden und dieselbe E1-Taste fünfmal drücken. Die Erkennung füllt nur das ID-Feld; erst Hinzufügen speichert das Gerät."}
                    </div>
                  )}
                  {String(profile.device_family || "").toUpperCase() === "F4USM61B" && [1,2,4,5,7].includes(Number(profile.operating_mode || 0)) && <>
                    <label style={{marginTop:8}}>{language === "en" ? "Battery ID" : "Batterie-ID"}</label>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input className={errors.physical_unique_id?"err":""} value={form.physical_unique_id || ""} onChange={e=>{setForm(f=>({...f,physical_unique_id:e.target.value}));setErrors({});}} placeholder="05-A9-8E-FA" style={{flex:1,minWidth:170}}/>
                      <button className="btn ghost" onClick={handleLearnF4usmPhysicalId} disabled={learningId} title={language === "en" ? "Set all jumpers, then press E2" : "Alle Jumper stecken, danach E2 betätigen"} style={{width:"auto",whiteSpace:"nowrap",padding:".55rem .7rem"}}>
                        {learningId ? "…" : (language === "en" ? "Learn battery ID" : "Batterie-ID einlernen")}
                      </button>
                    </div>
                    {errors.physical_unique_id&&<div className="em">{errors.physical_unique_id}</div>}
                  </>}
                  {learnMsg&&<div style={{fontSize:".65rem",marginTop:".35rem",color:learnMsg.startsWith("✓")?"#22c55e":learnMsg.startsWith("✗")?"#f87171":"#2f6f8f",lineHeight:1.45}}>{learnMsg}</div>}
                </div>
                <div>
                  <label>{t("devices.roomOptional")}</label>
                  <input value={form.room} onChange={e=>setForm(f=>({...f,room:e.target.value}))} placeholder={t("devices.roomPlaceholder")}/>
                </div>
              </div>

              {/* EEP */}
              <div style={{marginBottom:".65rem"}}>
                <label>{t("devices.deviceEep")}</label>
                <select value={form.eep} onChange={e=>changeEep(e.target.value)}>
                  {!EEP_DB[form.eep] && form.eep && (
                    <option value={form.eep} disabled>{language === "en" ? `Unknown saved profile (${form.eep})` : `Unbekanntes gespeichertes Profil (${form.eep})`}</option>
                  )}
                  {[...new Set(Object.values(EEP_DB).map(e => e.group))].map(g=>(
                    <optgroup key={g} label={`── ${translateGroup(language, g)}`}>
                      {Object.entries(EEP_DB).filter(([,v])=>v.group===g).map(([k,v])=>(
                        <option key={k} value={k}>{translateDeviceLabel(language, v.label)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Info */}
              {profile.eltako&&(
                <div style={{fontSize:".7rem",color:"#2f6f8f",background:"#eef5f8",border:"1px solid #c6d9e4",borderRadius:5,padding:".38rem .7rem",marginBottom:".65rem",lineHeight:1.5}}>
                   <strong>{profile.eltako}</strong>
                  {"  "}<span style={{color:PC[profile.platform]??""}}>{PI[profile.platform]??""} {profile.platform}</span>
                </div>
              )}

              {/* device_class */}
              {profile.device_classes&&(
                <div style={{maxWidth:220,marginBottom:".65rem"}}>
                  <label>{t("devices.deviceClass")}</label>
                  <select value={form.device_class} onChange={e=>setForm(f=>({...f,device_class:e.target.value}))}>
                    {profile.device_classes.map(dc=><option key={dc} value={dc}>{dc}</option>)}
                  </select>
                </div>
              )}

              {/* Sender */}
              {profile.needs_sender&&(
                <div style={{background:"#eef5f8",border:"1px solid #c6d9e4",borderRadius:7,padding:".75rem",marginBottom:".65rem"}}>
                  <div style={{fontSize:".66rem",color:"#2f6f8f",marginBottom:".5rem",fontWeight:600}}>
                    {t("devices.senderAuto")}
                  </div>
                  <div style={{fontSize:".65rem",color:"#6b7280",marginBottom:".5rem"}}>
                    {t("devices.senderHelp")}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
                    <div>
                      <label>{t("devices.senderId")}</label>
                      <input className={errors.sender_id?"err":""} value={form.sender_id || (profile.needs_sender ? autoSenderIdForGateway(gateway, devices) : "")} onChange={e=>{setForm(f=>({...f,sender_id:e.target.value})); setErrors({});}} placeholder={autoSenderIdForGateway(gateway, devices) || `${gateway.base_id.slice(0,-2)}01`}/>
                      {errors.sender_id&&<div className="em">{errors.sender_id}</div>}
                    </div>
                    <div>
                      <label>{t("devices.senderEep")}</label>
                      <input value={form.sender_eep||profile.sender_eep||""} onChange={e=>setForm(f=>({...f,sender_eep:e.target.value}))} placeholder={profile.sender_eep}/>
                    </div>
                    {profile.platform==="cover"&&<>
                      <div><label>{t("devices.openTime")}</label><input type="number" value={form.time_opens} onChange={e=>setForm(f=>({...f,time_opens:e.target.value}))} placeholder="25"/></div>
                      <div><label>{t("devices.closeTime")}</label><input type="number" value={form.time_closes} onChange={e=>setForm(f=>({...f,time_closes:e.target.value}))} placeholder="24"/></div>
                    </>}
                  </div>
                </div>
              )}

              <div style={{display:"flex",gap:".55rem"}}>
                <button className="btn pri" onClick={handleAdd}>{editIdx!==null?t("common.save"):t("common.add")}</button>
                {editIdx!==null&&<button className="btn ghost" onClick={()=>{setEditIdx(null);setForm(createEmptyForm());setErrors({});}}>{t("common.cancel")}</button>}
              </div>
            </div>

            {/* Device list */}
            {devices.length>0?(
              <div className="card" style={{marginBottom:"1rem"}}>
                <div style={{padding:".8rem 1.1rem",borderBottom:"1px solid #d9e0e7",display:"flex",justifyContent:"space-between",alignItems:"center",gap:".75rem"}}>
                  <span style={{fontSize:".75rem",color:"#53616f"}}>
                    {t("devices.listTitle")} <strong style={{color:"#2f6f8f"}}>{devices.length}</strong>
                  </span>
                  <div style={{display:"flex",gap:".45rem",alignItems:"center"}}>
                    <button className="btn del" onClick={handleDeleteAllDevices}>{t("common.deleteAll")}</button>
                    <button className="btn pri" onClick={handleGenerate}>{t("common.generateYaml")}</button>
                  </div>
                </div>
                {devices.map((d,i)=>{
                  const col = PC[d.platform]??"#2f6f8f";
                  return(
                    <div key={i} className="rh" style={{display:"flex",alignItems:"center",gap:".65rem",padding:".65rem 1.1rem",borderBottom:i<devices.length-1?"1px solid #d9e0e7":"none"}}>
                      <span style={{fontSize:".6rem",padding:".12rem .4rem",borderRadius:3,background:col+"20",color:col,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>{PI[d.platform]} {translatePlatform(language, d.platform)}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:"#111827",fontWeight:600,fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                        <div style={{color:"#6b7280",fontSize:".68rem"}}>{d.dev_id} · {d.eep.replace(/-sw$/,"")}{d.room?" · "+d.room:""}</div>
                      </div>
                      <div style={{display:"flex",gap:".35rem",flexShrink:0}}>
                        <button className="btn edit" onClick={()=>handleEdit(i)}>{t("devices.editButton")}</button>
                        <button className="btn del" onClick={()=>handleDelete(i)}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ):(
              <div style={{textAlign:"center",padding:"2rem",border:"1px dashed #b9c7d3",borderRadius:10,marginBottom:"1rem",color:"#8a96a3"}}>
                <div style={{fontSize:"1.8rem",marginBottom:".3rem"}}>📡</div>
                <div style={{fontSize:".78rem"}}>{t("devices.noDevices")}</div>
              </div>
            )}

            <div style={{display:"flex",gap:".5rem"}}>
              <button className="btn ghost" onClick={()=>setStep(1)}>{t("devices.backToGateway")}</button>
              {devices.length>0&&<button className="btn pri" onClick={handleGenerate}>{t("common.generateYaml")}</button>}
            </div>
          </>
        )}

        {/* ─── STEP 3: YAML ─── */}
        {step===3&&(
          <>
            <div className="card" style={{marginBottom:"1rem",padding:"1rem 1.1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap",marginBottom:".8rem"}}>
                <div>
                  <div style={{fontSize:".82rem",fontWeight:700,color:"#1f2937"}}>{t("yaml.writeTitle")}</div>
                  <div style={{fontSize:".68rem",color:"#667485",marginTop:".25rem",lineHeight:1.55}}>
                    {t("yaml.writeDescription")}
                  </div>
                </div>
                <span className="statusPill">{t("common.senderCount", { count: senderProgrammingEntries.length })}</span>
              </div>
              <div title={!busWriteGatewayConnected ? busWriteHint : ""} style={{opacity:busWriteGatewayConnected?1:.48,cursor:busWriteGatewayConnected?"default":"not-allowed"}}>
                <div style={{display:"grid",gridTemplateColumns:"minmax(210px,1fr) minmax(260px,1.2fr) auto",gap:".65rem",alignItems:"start"}}>
                  <div>
                    <label>{t("yaml.busComPort")}</label>
                    <input disabled={!hasRs485Gateway} value={writeBusPort || defaultBusWritePort} onChange={e=>setWriteBusPort(e.target.value)} placeholder={t("gateway.serialPortPlaceholder")} list="serial-port-list" style={{height:42,minHeight:42}}/>
                  </div>
                  <div>
                    <label>{t("yaml.senderIdsFromGateway")}</label>
                    <div style={{height:42,minHeight:42,display:"flex",alignItems:"center",padding:"0 .75rem",border:"1px solid #b9c7d3",borderRadius:7,background:"#f7f9fb",fontSize:".78rem",color:"#405061",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={senderGatewaySummary}>
                      {senderGatewaySummary || "-"}
                    </div>
                  </div>
                  <div>
                    <label style={{visibility:"hidden"}}>{t("yaml.writeToActuators")}</label>
                    <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                      <button className="btn pri" onClick={handleWriteSenderIds} disabled={!canWriteSenderIds} style={{whiteSpace:"nowrap",height:42,minHeight:42}} title={!busWriteGatewayConnected ? busWriteHint : ""}>
                        {writingSenders ? t("yaml.writing") : t("yaml.writeToActuators")}
                      </button>
                      <button className="btn ghost" onClick={handleCancelWriteSenderIds} disabled={!writingSenders} style={{whiteSpace:"nowrap",height:36,minHeight:36}}>
                        {t("common.cancel")}
                      </button>
                      <button className="btn ghost" onClick={handleDisconnectWriteGateway} disabled={disconnectingGateway || !busWriteGatewayConnected} style={{whiteSpace:"nowrap",height:36,minHeight:36}}>
                        {disconnectingGateway ? t("gateway.disconnecting") : t("gateway.disconnect")}
                      </button>
                    </div>
                  </div>
                </div>
                {writingSenders&&(()=>{
                  const total = Number(writeSenderProgress.total || senderProgrammingEntries.length || 0);
                  const processed = Math.min(total, Number(writeSenderProgress.processed || 0));
                  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
                  const phaseText = writeSenderProgress.phase === "connecting" ? "RS485-Bus verbinden …"
                    : writeSenderProgress.phase === "scanning" ? "Series-14-Geräte werden gesucht …"
                    : writeSenderProgress.phase === "canceling" ? "Abbruch wird ausgeführt …"
                    : writeSenderProgress.phase === "writing" ? (writeSenderProgress.message || "Sender-IDs werden geprüft/geschrieben …")
                    : "Sender-IDs werden vorbereitet …";
                  return <div style={{marginTop:".7rem"}}>
                    <div style={{height:10,borderRadius:999,background:"#dbe5eb",overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${percent}%`,background:"#2f6f8f",transition:"width .18s ease"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",gap:".75rem",fontSize:".68rem",color:"#53616f",marginTop:".35rem"}}>
                      <span>{processed} von {total} Sender-IDs verarbeitet</span>
                      <strong>{percent}%</strong>
                    </div>
                    <div style={{fontSize:".64rem",color:"#6b7280",marginTop:".25rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={phaseText}>{phaseText}</div>
                  </div>;
                })()}
              </div>
              {!busWriteGatewayConnected&&<div style={{fontSize:".68rem",marginTop:".65rem",padding:".5rem .7rem",borderRadius:5,background:"#fff7ed",color:"#9a3412",border:"1px solid #fed7aa"}}>{t("yaml.writeDisabled")}</div>}
              {writeSenderMsg&&<div style={{fontSize:".72rem",marginTop:".75rem",padding:".5rem .7rem",borderRadius:5,background:writeSenderMsg.startsWith("✓")?"#14532d22":writeSenderMsg.startsWith("✗")?"#450a0a22":"#eef5f8",color:writeSenderMsg.startsWith("✓")?"#166534":writeSenderMsg.startsWith("✗")?"#b42318":"#2f6f8f",border:"1px solid #c6d9e4"}}>{writeSenderMsg}</div>}
              {writeSenderLog.length>0&&(
                <div style={{marginTop:".75rem",maxHeight:170,overflowY:"auto",fontSize:".66rem",lineHeight:1.5,color:"#53616f",background:"#f7f9fb",border:"1px solid #d9e0e7",borderRadius:6,padding:".55rem .7rem"}}>
                  {writeSenderLog.slice(-80).map((e,i)=><div key={i}>{runtimeText(e.message || `${e.status}: ${e.device_id}`)}</div>)}
                </div>
              )}
            </div>

            <div className="card" style={{marginBottom:"1rem"}}>
              <div style={{padding:".8rem 1.1rem",borderBottom:"1px solid #d9e0e7",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem"}}>
                <span style={{fontSize:".8rem",color:"#53616f"}}>eltako_config.yaml — {t(devices.length === 1 ? "common.deviceCount" : "common.deviceCountPlural", { count: devices.length })}</span>
                <div style={{display:"flex",gap:".5rem"}}>
                  <button className="btn ghost" onClick={handleCopy}>{copied?t("common.copied"):t("common.copy")}</button>
                  <button className="btn pri"   onClick={handleDL}>{t("common.download")}</button>
                </div>
              </div>

              {/* Hint */}
              <div style={{padding:".7rem 1.1rem",borderBottom:"1px solid #d9e0e7",background:"#eef5f8",fontSize:".7rem",color:"#53616f",lineHeight:1.7}}>
                {t("yaml.contentHintBefore")} <code style={{color:"#245873"}}>/config/configuration.yaml</code> {t("yaml.contentHintAfter")}
              </div>

              <pre style={{margin:0,padding:"1.1rem",fontSize:".73rem",lineHeight:1.85,color:"#53616f",overflowX:"auto",maxHeight:540,overflowY:"auto"}}>
                {yaml.split("\n").map((line,i)=>{
                  let c="#53616f";
                  if(line.startsWith("#")) c="#7c8794";
                  else if(/^eltako:/.test(line)) c="#2f6f8f";
                  else if(/^\s+(gateway|devices|binary_sensor|sensor|light|switch|cover|climate):/.test(line)) c="#2f6f8f";
                  else if(/^\s+- id:|^\s+eep:|^\s+name:|^\s+device_class:|^\s+base_id:|^\s+device_type:/.test(line)) c="#245873";
                  else if(/^\s+(sender|comment|time_):/.test(line)) c="#2f6f8f";
                  else if(line.includes(":")) c="#53616f";
                  return <span key={i} style={{color:c}}>{line}{"\n"}</span>;
                })}
              </pre>
            </div>

            <button className="btn ghost" onClick={()=>setStep(2)}>{t("yaml.backToDevices")}</button>
          </>
        )}

        <div style={{marginTop:"1.2rem",fontSize:".68rem",color:"#8a96a3",lineHeight:1.55}}>
          <div>EEDTOY – ELTAKO EnOcean Device to YAML Generator</div>
          <div>{t("footer.developerNotice")}</div>
        </div>
        </div>
      </main>
      {deviceDbOpen && (() => {
        const entry = deviceDbEntries[deviceDbSelected] || {};
        const platformOptions = ["sensor","binary_sensor","switch","light","cover","climate"];
        const deviceClassOptions = {
          sensor:["temperature","humidity","power","energy","voltage","current","wind_speed","carbon_dioxide","volatile_organic_compounds_parts","battery"],
          binary_sensor:["door","window","opening","motion","occupancy","smoke","heat","moisture","battery","problem"],
          switch:["switch","outlet"], light:[], cover:["shutter","blind","awning","curtain","garage"], climate:[]
        };
        return <div className="modalOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDeviceDbOpen(false)}}>
          <div className="card" style={{width:"min(1180px,96vw)",height:"min(760px,92vh)",display:"grid",gridTemplateRows:"auto 1fr auto",padding:0,overflow:"hidden"}}>
            <div style={{padding:"1rem 1.2rem",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><strong>{language==="en"?"Device database":"Gerätedatenbank"}</strong><div style={{fontSize:".68rem",color:"#64748b"}}>{language==="en"?"Changes are stored locally and survive EEDTOY updates.":"Änderungen werden lokal gespeichert und bleiben bei EEDTOY-Updates erhalten."}</div></div>
              <button className="btn ghost" onClick={()=>setDeviceDbOpen(false)}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"390px 1fr",minHeight:0}}>
              <div style={{borderRight:"1px solid var(--line)",padding:".8rem",overflow:"auto"}}>
                <div style={{display:"flex",gap:".4rem",marginBottom:".7rem"}}><button className="btn pri" onClick={addDeviceDbEntry}>+ {language==="en"?"New":"Neu"}</button><button className="btn ghost" onClick={duplicateDeviceDbEntry}>{language==="en"?"Duplicate":"Duplizieren"}</button></div>
                {deviceDbEntries.map((item,index)=><button key={`${item.key}-${index}`} onClick={()=>setDeviceDbSelected(index)} style={{display:"block",width:"100%",textAlign:"left",padding:".55rem .65rem",marginBottom:".3rem",borderRadius:6,border:index===deviceDbSelected?"2px solid #0ea5e9":"1px solid var(--line)",background:index===deviceDbSelected?"#e0f2fe":"white",cursor:"pointer"}}><div style={{fontWeight:700,fontSize:".75rem"}}>{item.eltako||item.label}</div><div style={{fontSize:".62rem",color:"#64748b"}}>{item.platform} · {item.eep_out||item.key}</div></button>)}
              </div>
              <div style={{padding:"1rem 1.2rem",overflow:"auto"}}>
                <div className="formGrid">
                  <div><label>{language==="en"?"Database key":"Datenbankschlüssel"}</label><input value={entry.key||""} onChange={e=>updateDeviceDbField("key",e.target.value.toUpperCase())}/></div>
                  <div><label>{language==="en"?"Device name":"Gerätename"}</label><input value={language==="en"?translateDeviceName(language,entry.eltako||""):(entry.eltako||"")} onChange={e=>updateDeviceDbField("eltako",e.target.value)}/></div>
                  <div><label>{language==="en"?"Display label":"Anzeigetext"}</label><input value={language==="en"?translateDeviceLabel(language,entry.label||""):(entry.label||"")} onChange={e=>updateDeviceDbField("label",e.target.value)}/></div>
                  <div><label>{language==="en"?"Category":"Kategorie"}</label><select value={entry.platform||"sensor"} onChange={e=>updateDeviceDbField("platform",e.target.value)}>{platformOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
                  <div><label>{language==="en"?"Group":"Gruppe"}</label><select value={entry.group||""} onChange={e=>updateDeviceDbField("group",e.target.value)}>{[...new Set(Object.values(DEFAULT_EEP_DB).map(v=>v.group))].map(v=><option key={v} value={v}>{translateGroup(language,v)}</option>)}</select></div>
                  <div><label>EEP</label><input value={entry.eep_out||""} onChange={e=>updateDeviceDbField("eep_out",e.target.value.toUpperCase())}/></div>
                  <div><label>{language==="en"?"Device class":"Geräteklasse"}</label><select value={entry.default_dc||""} onChange={e=>updateDeviceDbField("default_dc",e.target.value)}><option value="">—</option>{(deviceClassOptions[entry.platform]||[]).map(v=><option key={v}>{v}</option>)}</select></div>
                  <div><label>{language==="en"?"Teach-in telegram":"Lerntelegramm"}</label><input value={entry.teach_in_telegram||""} onChange={e=>updateDeviceDbField("teach_in_telegram",e.target.value.toUpperCase())}/></div>
                  <div><label>{language==="en"?"Sender required":"Sender erforderlich"}</label><select value={entry.needs_sender?"yes":"no"} onChange={e=>updateDeviceDbField("needs_sender",e.target.value==="yes")}><option value="no">{language==="en"?"No":"Nein"}</option><option value="yes">{language==="en"?"Yes":"Ja"}</option></select></div>
                  {entry.needs_sender&&<div><label>{language==="en"?"Sender EEP":"Sender-EEP"}</label><input value={entry.sender_eep||""} onChange={e=>updateDeviceDbField("sender_eep",e.target.value.toUpperCase())}/></div>}
                  {entry.platform==="cover"&&<><div><label>{language==="en"?"Channels":"Kanäle"}</label><input type="number" min="1" value={entry.channels||1} onChange={e=>updateDeviceDbField("channels",Number(e.target.value)||1)}/></div><div><label>{language==="en"?"Default opening time":"Standard-Öffnungszeit"}</label><input type="number" min="1" value={entry.time_opens||25} onChange={e=>updateDeviceDbField("time_opens",Number(e.target.value)||25)}/></div><div><label>{language==="en"?"Default closing time":"Standard-Schließzeit"}</label><input type="number" min="1" value={entry.time_closes||25} onChange={e=>updateDeviceDbField("time_closes",Number(e.target.value)||25)}/></div></>}
                  {entry.platform==="climate"&&<><div><label>{language==="en"?"Min. temperature":"Min. Temperatur"}</label><input type="number" step="0.5" value={entry.min_target_temperature??16} onChange={e=>updateDeviceDbField("min_target_temperature",Number(e.target.value))}/></div><div><label>{language==="en"?"Max. temperature":"Max. Temperatur"}</label><input type="number" step="0.5" value={entry.max_target_temperature??25} onChange={e=>updateDeviceDbField("max_target_temperature",Number(e.target.value))}/></div><div><label>{language==="en"?"Frost protection temperature":"Frostschutztemperatur"}</label><input type="number" step="0.5" value={entry.frost_temperature??8} onChange={e=>updateDeviceDbField("frost_temperature",Number(e.target.value))}/></div><div><label>{language==="en"?"Hysteresis":"Hysterese"}</label><input type="number" step="0.1" value={entry.hysteresis??1} onChange={e=>updateDeviceDbField("hysteresis",Number(e.target.value))}/></div></>}
                  {entry.platform==="light"&&<><div><label>RGBW</label><select value={entry.rgbw?"yes":"no"} onChange={e=>updateDeviceDbField("rgbw",e.target.value==="yes")}><option value="no">{language==="en"?"No":"Nein"}</option><option value="yes">{language==="en"?"Yes":"Ja"}</option></select></div><div><label>{language==="en"?"Dimming speed":"Dimmgeschwindigkeit"}</label><input type="number" min="0" value={entry.dimming_speed??0} onChange={e=>updateDeviceDbField("dimming_speed",Number(e.target.value))}/></div></>}
                  {entry.platform==="sensor" && (entry.group==="Zähler" || String(entry.eep_out||entry.key||"").startsWith("A5-12-"))&&<div><label>{language==="en"?"Meter tariffs":"Zählertarife"}</label><input value={entry.meter_tariffs||""} onChange={e=>updateDeviceDbField("meter_tariffs",e.target.value)} placeholder="[1]"/></div>}
                </div>
                <div style={{marginTop:"1rem"}}><button className="btn danger" onClick={deleteDeviceDbEntry}>{language==="en"?"Delete device":"Gerät löschen"}</button></div>
              </div>
            </div>
            <div style={{padding:".8rem 1.2rem",borderTop:"1px solid var(--line)",display:"flex",justifyContent:"space-between"}}><button className="btn ghost" onClick={resetDeviceDatabase}>{language==="en"?"Restore defaults":"Standard wiederherstellen"}</button><div style={{display:"flex",gap:".5rem"}}><button className="btn ghost" onClick={()=>setDeviceDbOpen(false)}>{language==="en"?"Cancel":"Abbrechen"}</button><button className="btn pri" onClick={saveDeviceDatabase}>{language==="en"?"Save and reload":"Speichern und neu laden"}</button></div></div>
          </div>
        </div>;
      })()}
    </div>
  );
}
