# EEDTOY – ELTAKO EnOcean Device to YAML Generator

EEDTOY ist ein Desktop-Konfigurator für EnOcean-Geräte, ELTAKO-Gateways, PCT14-Import und den YAML-Export für Home Assistant.

> **Hinweis:** EEDTOY wird privat von D. Zirnbauer entwickelt und ist kein offizielles Produkt der ELTAKO GmbH. ELTAKO-Produktnamen werden ausschließlich zur Beschreibung der Gerätekompatibilität verwendet.

## Funktionen

- FAM14-, FAM-USB- und FGW14-USB-Unterstützung
- automatische Gateway- und Base-ID-Erkennung
- echtes COM-Port-Dropdown bei mehreren erkannten Schnittstellen
- PCT14/XML-Import
- automatische Geräte-ID-Erkennung über EnOcean-Telegramme
- verwaltete Sender-IDs und Kollisionsprüfung
- Home-Assistant-YAML-Export
- EEDTOY-Projekte speichern und später wieder öffnen

## Installation unter Windows

1. Die aktuelle Datei `EEDTOY-Setup-<Version>.exe` aus den GitHub Releases herunterladen.
2. Installer starten und Zielverzeichnis auswählen.
3. EEDTOY starten.

Python 3.12 und alle für die Gateway-Erkennung benötigten Python-Module sind bereits vollständig im Installer enthalten. Eine vorhandene Python-Installation wird nicht verwendet oder verändert. Für die Installation selbst ist keine Internetverbindung erforderlich.

Die Anwendung und der Installer sind derzeit nicht digital signiert. Windows kann deshalb eine SmartScreen-Warnung anzeigen.

## Datenschutz und Sicherheit

EEDTOY verarbeitet Konfigurationen lokal. Serielle Gerätezugriffe und Python-Unterprozesse werden auf dem Rechner des Benutzers ausgeführt. Projektdateien können Geräte-IDs, Gateway-Daten und lokale COM-Port-Angaben enthalten und sollten entsprechend geschützt werden.

Sicherheitsprobleme bitte über eine private GitHub Security Advisory melden. Details stehen in [SECURITY.md](SECURITY.md).

## Rechte und Marken

Copyright © 2026 D. Zirnbauer. Der Quellcode steht unter der Lizenz **GPL-3.0-or-later**. Siehe [LICENSE](LICENSE).

ELTAKO ist eine Marke der ELTAKO GmbH. Dieses Projekt ist weder mit der ELTAKO GmbH verbunden noch von ihr herausgegeben oder bestätigt.

## Versionshinweise

Die Änderungen der aktuellen Version stehen in [CHANGELOG.md](CHANGELOG.md).
