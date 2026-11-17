# Installation und erster Start

[← Übersicht](README.md)

## Voraussetzungen

Für **v1.1.04** gibt es einen Windows-Installer für **64 Bit**. Beim Zugriff auf physische Geräte muss ein geeigneter USB-/COM-Anschluss verfügbar sein. Für den späteren Import wird Home Assistant mit der benutzerdefinierten Integration **ELTAKO Sensors & Actuators** benötigt.

## Windows installieren

1. Die Datei [EEDTOY-Setup-1.1.04.exe](https://github.com/DenisZirn/eedtoy/releases/download/v1.1.04/EEDTOY-Setup-1.1.04.exe) herunterladen.
2. Installer starten und Zielverzeichnis auswählen.
3. EEDTOY über Startmenü oder Desktop-Verknüpfung öffnen.
4. Mit dem ersten Schritt **Gateway** beginnen.

Eine separate Python-Installation ist nicht nötig: Python 3.12 und die benötigten Module sind bereits im Windows-Installer enthalten. Eine vorhandene Python-Installation wird nicht verändert. Die Installation erfordert keine dauerhafte Internetverbindung.

**Windows SmartScreen:** Nach dem dokumentierten Stand sind Anwendung und Installer nicht digital signiert. Nur Dateien aus dem offiziellen GitHub-Release verwenden und eine Sicherheitswarnung nicht ungeprüft übergehen.

## Oberfläche

Die Navigation führt durch **Gateway → Geräte → YAML**. In der oberen Leiste stehen zusätzlich **Projekt öffnen**, **Projekt speichern** und **Projekt speichern unter …**. Dieselben Projektaktionen gibt es im Menü **Datei**.

Für einen ersten Test zunächst nur ein Gateway erkennen, COM-Port und Base-ID prüfen und danach Geräte importieren oder anlegen. **Sender-IDs noch nicht schreiben**, solange Anlage und Buszuordnung nicht geprüft sind.

## macOS

Für Version 1.1.04 sind im geprüften GitHub-Release die Windows-Dateien vorhanden. DMGs für Intel und Apple Silicon sollen separat ergänzt werden; deshalb enthält dieses Handbuch noch keine verbindliche macOS-Installationsanleitung.

Weiter: [Gateway-Einrichtung](gateways.md).
