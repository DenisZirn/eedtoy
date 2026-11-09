# EEDTOY v1.1.02

EEDTOY v1.1.02 ergänzt FHD60SB als eigenes Geräteprofil und übernimmt eingegebene Räume im Home-Assistant-YAML als `area`. Die im Offline-Test bestätigten Änderungen sind damit offiziell verfügbar.

## FHD60SB und FAH

- FHD60SB ist unter **Wetterstation** als eigener Funk-Helligkeitssensor auswählbar.
- FAH und FHD60SB exportieren `eep: "A5-06-01"`, `device_class: illuminance` und `teach_in_telegram: "18-08-0D-80"`.
- `device_type` lautet je nach ausgewähltem Profil `FAH` oder `FHD60SB`. Der frei vergebene Gerätename verändert den technischen Gerätetyp nicht.
- Bestehende Gerätedatenbanken erhalten das FHD60SB-Profil einmalig per Migration auf Schema 60. Eigene Einstellungen bleiben erhalten; spätere bewusste Änderungen oder Löschungen werden nicht zurückgesetzt.
- Die Gerätedatenbank enthält jetzt 81 Profile. Die beiden EEP-Varianten für FFT60SB und FTFSB bleiben erhalten.

## Räume für Home Assistant

- Der Inhalt des Felds **Raum** wird zentral für alle Geräteprofile als aktives `area`-Feld exportiert, beispielsweise `area: "Garten"`.
- Die frühere Ausgabe ausschließlich als `#comment` entfällt für echte Raumnamen. Das gilt auch für übernommene MiniSafe2-Räume und bereits gespeicherte Projekte mit Raumangaben.
- Anführungszeichen, Umlaute und mehrzeilige Angaben werden sicher als YAML-Zeichenketten ausgegeben.
- Leere Raumfelder erzeugen kein `area`-Feld. Automatische PCT14-Adresshinweise bleiben Kommentare, damit sie keine unbeabsichtigten Home-Assistant-Räume anlegen.
- Die Raumzuordnung wird beim erneuten Import der exportierten YAML durch die Home-Assistant-Integration übernommen.

## Bestehende Funktionen

Die bestätigten FAM14-Verbindungs-, FD2G14-Speicher- und Windows-Zeichenkodierungskorrekturen aus v1.1.01 bleiben enthalten. Die Gateway-Erkennung, Mehrbus-Zuordnung und übrigen Geräteprofile bleiben erhalten. Die README wurde nicht verändert.

## Installation

### Windows

`EEDTOY-Setup-1.1.02.exe` herunterladen und installieren. Die eingebettete Python-Laufzeit und die benötigten Module sind enthalten; die Installation funktioniert offline. Die offizielle Installation verwendet den normalen EEDTOY-Einstellungsordner, nicht den separaten Ordner der Offline-Testversion.

### macOS

Die DMGs für Intel und Apple Silicon werden separat gebaut und ergänzt. Bestehende DMGs älterer Releases werden nicht verändert.
