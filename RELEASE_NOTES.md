# EEDTOY v1.0.98

EEDTOY v1.0.98 ergänzt den lokalen Import einer per E-Mail versendeten MiniSafe2-Konfiguration, nimmt FAH und FRW-ws in die Gerätedatenbank auf und enthält die zuletzt bestätigten Korrekturen für die Series-14-Senderprogrammierung.

## MiniSafe2-Konfigurationsimport

- Vollständigen `Config:`-Text aus der MiniSafe2-E-Mail direkt aus der Zwischenablage einfügen.
- Alternativ eine TXT- oder JSON-Datei auswählen.
- Die Gerätevorschau erscheint automatisch nach der Zwischenablage- oder Dateiauswahl; ein zusätzlicher Button „Konfiguration prüfen“ ist nicht erforderlich.
- Der MiniSafe2-Import besitzt einen eigenen Bereich und ist vollständig vom PCT14-Import getrennt.
- Importiert werden ausschließlich physische ELTAKO-EnOcean-Geräte mit ihrer `address`, dem Namen, dem MiniSafe2-Gerätetyp und dem zugeordneten Raum.
- `senderID`, Gateway-, Cloud-, Zugangsdaten-, Aktions- und Szenendaten werden ausdrücklich nicht übernommen.
- Bekannte MiniSafe2-Gerätetypen werden automatisch einem EEDTOY-/EEP-Profil zugeordnet.
- Nicht eindeutig zuordenbare Gerätetypen können vor dem Import manuell einem Profil zugewiesen werden.
- Bereits vorhandene Geräte-IDs werden übersprungen.

## Neue Geräteprofile

- **FAH** mit EEP `A5-06-01`, Geräteklasse `illuminance` und Lerntelegramm `18-08-0D-80`.
- **FRW-ws** mit EEP `F6-02-01`, Geräteklasse `smoke` und dokumentierter Batterie-Warnung bei Datentelegramm `0x30`.
- Bestehende lokale Gerätedatenbanken werden einmalig auf Schema 55 migriert; eigene Änderungen bleiben erhalten.

## Senderprogrammierung und Stabilität

- FHK14 behält die bestätigte Programmierung in Function Group 3 mit Function 65.
- FAE14LPR verwendet weiterhin seinen ursprünglichen Schreibweg und erhält pro Kanal genau eine priorisierte Controller-ID.
- Bei einer unklaren Schreibbestätigung wird die gespeicherte Zeile zurückgelesen, bevor erneut geschrieben wird.
- Fortschritts-, Ergebnis- und Abbruchmeldungen sind vollständig auf Deutsch und Englisch verfügbar.
- Die automatische Sender-ID-Vergabe berücksichtigt weiterhin FAM-USB-Base-IDs mit Endung `80` und überspringt bereits belegte vollständige Senderadressen.

## Installation

### Windows

`EEDTOY-Setup-1.0.98.exe` herunterladen und ausführen. Python 3.12 und die benötigten Module sind vollständig enthalten; die Installation funktioniert offline.

Die Anwendung ist derzeit nicht digital signiert. Windows SmartScreen kann beim ersten Start eine Sicherheitswarnung anzeigen.

### macOS

Die DMGs für Intel und Apple Silicon können separat zu diesem Release hinzugefügt werden. Unter macOS zuerst das tatsächlich angeschlossene physische Gateway auswählen und danach `Gateway erkennen` verwenden.
