# EEDTOY v1.0.96

EEDTOY v1.0.96 ist ein umfangreiches Funktions-, Geräte- und Stabilitätsupdate. Der Schwerpunkt liegt auf der neu aufgebauten Gerätedatenbank, zuverlässigeren Gerätezuordnungen und der verbesserten Zusammenarbeit mit der Home-Assistant-Integration „ELTAKO Sensors & Actuators“ v0.1.156.

## Wichtigste Neuerungen

- Neu strukturierte, frei bearbeitbare und persistent gespeicherte Gerätedatenbank mit 74 freigegebenen Geräteprofilen.
- Verbesserter PCT14-Import und eindeutige Profilzuordnung beim Laden und Bearbeiten von Projekten.
- Lerntelegramme steuerbarer Geräte werden aus der aktiven Gerätedatenbank übernommen und bleiben editierbar.
- Gateway-Erkennung für FAM14, FAM-USB und FGW14-USB unter Windows und macOS stabilisiert.
- FTS14EM-Basis-ID-Lernen über FAM14 und FGW14-USB mit sicherer Fünffach-Betätigung desselben E1-Eingangs.
- Gatewayübergreifende Senderprogrammierung mit Fortschrittsanzeige, Abbrechen und gezieltem Trennen des Gateways.
- Dauerhafte, kollisionsfreie Sender-IDs und Unterstützung mehrerer Sender pro Aktor und Kanal.
- Vollständig vereinheitlichte deutsche und englische Oberfläche.
- Verbesserter Home-Assistant-YAML-Export ohne lokale serielle Portpfade.

## macOS

- FAM-USB verwendet die direkte ESP2-AB-58-Base-ID-Abfrage.
- FAM-USB-Portpaare werden unabhängig von der Seriennummer erkannt; Interface 1 wird bei B0/B1- und 0/1-Bezeichnungen zuverlässig bevorzugt.
- Separate Builds für Apple Silicon und Intel mit jeweils passender eingebetteter Python-Laufzeit.
- Kein Homebrew und keine separate Python-Installation erforderlich.

## Installation

### Windows

`EEDTOY-Setup-1.0.96.exe` herunterladen und ausführen.

### macOS Apple Silicon

Für Macs mit Apple-M-Prozessor `EEDTOY-macOS-1.0.96-arm64.dmg` verwenden.

### macOS Intel

Für Macs mit Intel-Prozessor `EEDTOY-macOS-1.0.96-x64.dmg` verwenden.

Die Anwendung ist derzeit nicht digital signiert. Windows SmartScreen beziehungsweise macOS Gatekeeper können beim ersten Start eine Sicherheitswarnung anzeigen.
