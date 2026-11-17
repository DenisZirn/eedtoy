# EEDTOY v1.1.04

## Gateway-Zuordnung und YAML-Export

- **Pro Gerät ein YAML-Gateway:** In „Geräte“ lässt sich festlegen, über welches Gateway ein Gerät nach Home Assistant exportiert werden soll. Dadurch werden Geräte bei mehreren Gateways nicht mehr automatisch doppelt exportiert.
- **PCT14-Import:** Erkannte FAM14- und FGW14-USB-Gateways sind separat auswählbar. Die Zuordnung berücksichtigt bei mehreren Bussystemen die jeweilige Bus-Base-ID.
- **FTS14EM:** Geräte werden standardmäßig einem passenden Series-14-Gateway zugeordnet und nicht irrtümlich dem FAM-USB. Bestehende unpassende Standardzuordnungen werden beim Laden bzw. Aktivieren eines geeigneten Gateways berichtigt.
- **Projektdateien:** Gateway-Zuordnungen und ausstehende Schreibvorgänge bleiben beim Speichern und erneuten Öffnen erhalten.

## Controller-IDs sicher schreiben

- Ein Wechsel des Steuerungsgateways markiert bei betroffenen Aktoren die Controller-ID als **noch zu schreiben**, wenn die neue Sender-ID von der zuletzt bekannten eingelernten ID abweicht.
- Beim Wechsel von „Geräte“ zu „YAML“ erscheint bei ausstehenden Schreibvorgängen ein Hinweis; eine Vorschau bleibt möglich.
- Beim Zurückwechseln auf ein nachweislich bereits eingelerntes Gateway verschwindet die Warnung wieder. PCT14-Controller-IDs werden berücksichtigt; ein erneuter PCT14-Import kann den bekannten Stand ergänzen, ohne die manuelle Gateway-Auswahl zu überschreiben.
- Das Schreiben erfolgt weiterhin bewusst über den gewählten Series-14-RS485-Bus. Ein Gatewaywechsel allein programmiert keinen Aktor um.

## Bedienung

- Oben in der Anwendung steht nun **„Projekt speichern unter …“** direkt neben „Projekt speichern“. Beide Funktionen bleiben auch über das Datei-Menü zugänglich.
- Ergänzte Regressionstests für Gateway-Routing, PCT14-Import, gespeicherte Projekte und Schreibwarnungen.

## Installation

**Windows:** `EEDTOY-Setup-1.1.04.exe` herunterladen und installieren. Eine separate Python-Installation ist nicht erforderlich.

**macOS:** Die DMGs für Intel und Apple Silicon werden separat ergänzt.

**Hinweis:** Vor dem Schreiben von Controller-IDs die Gateway- und Buszuordnung prüfen. Bereits exportierte doppelte Geräte müssen gegebenenfalls separat in Home Assistant bereinigt werden.
