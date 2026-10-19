# EEDTOY – ELTAKO EnOcean Device to YAML Generator

EEDTOY ist ein Desktop-Konfigurator für EnOcean-Geräte, ELTAKO-Gateways, PCT14-Import und den YAML-Export für Home Assistant.

> **Hinweis:** EEDTOY wird privat von D. Zirnbauer entwickelt und ist kein offizielles Produkt der ELTAKO GmbH. ELTAKO-Produktnamen werden ausschließlich zur Beschreibung der Gerätekompatibilität verwendet.

## Funktionen

- FAM14-, FAM-USB- und FGW14-USB-Unterstützung
- automatische Gateway- und Base-ID-Erkennung
- echtes COM-Port-Dropdown bei mehreren erkannten Schnittstellen
- PCT14/XML-Import
- MiniSafe2-Konfigurationsimport aus E-Mail-Text oder TXT-/JSON-Datei
- F2L14-Import als zweistufiger Lüfter mit exklusiver oder addierender Betriebsart
- automatische, abbrechbare Geräte-ID-Erkennung mit profilabhängigen Funkfiltern
- getrennte Erkennung von Geräte-ID und F4USM61B-Batterie-ID
- FWG14MS-Empfangs-ID anhand der Drehschalterposition, getrennt von der PCT14-Busadresse
- verwaltete Sender-IDs und Kollisionsprüfung
- Home-Assistant-YAML-Export mit stabilem technischem `device_type` aus dem gewählten Profil
- EEDTOY-Projekte speichern und später wieder öffnen

## MiniSafe2-Import: Sender-IDs

Im Importfenster kann **Sender-IDs der Aktoren übernehmen** gewählt werden.

- Ohne Haken vergibt EEDTOY neue freie Sender-IDs wie beim manuellen Anlegen. Ein FAM-USB mit Basis `FF-A6-04-80` verwendet beispielsweise `FF-A6-04-81`, `FF-A6-04-82` usw. Bereits belegte IDs werden übersprungen; Sensoren benötigen keine Sender-ID.
- Mit Haken übernimmt EEDTOY die vollständige `senderID` aus dem Geräteeintrag oder aus dem Abschnitt `getStates` der E-Mail. Die Zuordnung erfolgt über `sid` und wird gegen die Geräteadresse geprüft. Zusätzliche Einträge aus `getStates` erzeugen keine neuen Geräte. Bei fehlenden, ungültigen oder widersprüchlichen Sender-IDs bleibt der Import offen und meldet das betroffene Gerät.

Übernommene Sender-IDs bleiben im Projekt und beim YAML-Export erhalten. Das gewählte Gateway muss diese IDs tatsächlich senden können. Die Gateway-Basis wird durch den Import nicht verändert. Cloud-Zugangsdaten, Aktionen und Gateway-Konfigurationen werden nicht übernommen.

Die HA-ELTAKO-Integration verwendet bei Relais `M5-38-08` als internes Rückmeldeprofil; `sender.eep: A5-38-08` beschreibt die Steuertelegramme. Diese zwei Felder haben unterschiedliche Aufgaben.
In der Geräteauswahl wird bei diesen Relais das tatsächliche Steuerprofil angezeigt, beispielsweise `A5-38-08, Steuerung`. Die interne Decoder-Zuordnung für den YAML-Export wird dadurch nicht verändert.

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
