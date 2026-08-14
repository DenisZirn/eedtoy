# Changelog

## 1.0.96

EEDTOY v1.0.96 ist ein umfangreiches Funktions-, Geräte- und Stabilitätsupdate.

### Gerätedatenbank und Profile

- Neu strukturierte, frei bearbeitbare und persistent gespeicherte Gerätedatenbank.
- Geräte können angelegt, dupliziert, geändert, deaktiviert und gelöscht werden.
- 74 freigegebene Geräteprofile mit Gerätekategorie, EEP, Home-Assistant-Plattform, Geräteklasse, Sender-EEP und gerätespezifischen Exportdaten.
- Eindeutige Profilschlüssel verhindern falsche Zuordnungen beim Bearbeiten oder Laden älterer Projekte.
- Lerntelegramme steuerbarer Geräte werden aus der aktiven Gerätedatenbank übernommen und bleiben benutzerdefiniert änderbar.
- Ergänzte beziehungsweise korrigierte Profile unter anderem für FTFSB, FTS14EM, F4USM61B, FTR-/FHK-Geräte, FDG14, FRGBW14/FRGBW71L, FSR71-Varianten und weitere Series-14-Geräte.

### Gateway-Erkennung und Geräteerfassung

- Stabilere Erkennung von FAM14, FAM-USB und FGW14-USB unter Windows und macOS.
- FAM-USB verwendet unter macOS die direkte ESP2-AB-58-Base-ID-Abfrage.
- macOS erkennt FAM-USB-Portpaare unabhängig von der Seriennummer und bevorzugt zuverlässig Interface 1 bei B0/B1- sowie 0/1-Bezeichnungen.
- FAM14 und FGW14-USB werden weiterhin über FTDI-/RS485-Schnittstellen erkannt.
- FTS14EM-Basis-IDs können über FAM14 und FGW14-USB gelernt werden. Zur sicheren Erkennung sind fünf Betätigungen desselben E1-Eingangs erforderlich.

### Senderprogrammierung und YAML

- Benötigte Sender-IDs können gatewayübergreifend ermittelt, geprüft und in Series-14-Aktoren geschrieben werden.
- Fortschrittsanzeige, Abbrechen und gezieltes Trennen des Gateways wurden ergänzt beziehungsweise verbessert.
- Mehrere Sender pro Aktor und Kanal sowie dauerhafte, kollisionsfreie Sender-IDs werden unterstützt.
- YAML-Export verwendet die aktuelle Gerätedatenbank und speichert keine lokalen seriellen Portpfade.
- PCT14-Import und Projektmigration wurden für die neuen Profile und eindeutigen Datenbankschlüssel erweitert.

### Oberfläche und Plattformen

- Deutsche und englische Oberfläche vollständig über feste Übersetzungsschlüssel vereinheitlicht.
- Windows-Installer enthält eine eingebettete Python-3.12-Laufzeit und benötigt keine vorhandene Python-Installation.
- macOS-Builds für Apple Silicon und Intel enthalten jeweils eine passende eingebettete Python-Laufzeit und benötigen kein Homebrew.
- Die Anwendung bleibt unter Windows und macOS derzeit nicht digital signiert; beim ersten Start kann deshalb eine Sicherheitswarnung erscheinen.

## 1.0.95

- Gatewayübergreifende Ermittlung und Programmierung erforderlicher Sender-IDs.
- Unterstützung mehrerer Sender pro Aktor und Kanal.
- Senderprogrammierung für FHK14-Aktoren.
- Verbesserte Gatewayübersicht und Bedienung der Senderprogrammierung.
