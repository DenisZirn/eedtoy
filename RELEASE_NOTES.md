# EEDTOY v1.1.03

## FWS81-Wassermelder

- **FWS81** ist unter **Wasser** als eigenes Geräteprofil auswählbar.
- Der YAML-Export verwendet `eep: "F6-05-01"`, `device_type: "FWS81"` und `device_class: moisture`.
- Gerätename und Raum können frei vergeben werden. Der technische Gerätetyp bleibt unabhängig vom Namen erhalten; der Raum wird als `area` übernommen.
- Bestehende Gerätedatenbanken werden automatisch um das FWS81-Profil ergänzt. Eigene Einstellungen bleiben erhalten.
- Die Gerätedatenbank enthält jetzt 82 Profile.

Für die Anzeige des Wasserstatus ist eine Version von **ELTAKO Sensors & Actuators** mit FWS81-Unterstützung erforderlich. Der FWS81 meldet bei Datenbyte `0x11` mit Status `0x30` Wasser und mit Status `0x20` keinen Wasserkontakt.

## Installation

**Windows:** `EEDTOY-Setup-1.1.03.exe` herunterladen und installieren. Eine separate Python-Installation ist nicht erforderlich.

**macOS:** Die DMGs für Intel und Apple Silicon werden separat ergänzt.
