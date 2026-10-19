# EEDTOY v1.1.00

EEDTOY v1.1.00 verbessert den Home-Assistant-YAML-Export, korrigiert die Empfangs-ID des FWG14MS und erweitert die automatische ID-Erkennung für Funk-Sensoren. Der Release übernimmt den zuletzt bestätigten Teststand einschließlich der getrennten Anzeige für Geräte- und Batterie-ID.

## Technischer Gerätetyp im Home-Assistant-Export

- Alle 80 bekannten Geräteprofile exportieren zentral genau einen technischen `device_type`, beispielsweise `FT55`, `F2T55` oder `F4USM61B`.
- Der Wert stammt aus dem ausgewählten Geräteprofil. Er bleibt bei frei geändertem Gerätenamen und beim Sprachwechsel erhalten.
- `name` bleibt der Anzeigename und `eep` das EnOcean-Profil.
- Interne Zuordnungsfelder wie `device_family`, `profile_key` und `rocker_positions` werden nicht zusätzlich in die Home-Assistant-YAML geschrieben.
- Benötigte profilspezifische Angaben wie `operating_mode`, Sender, Basis-IDs, Lüfterstufen und Raumregler-Betriebsarten bleiben erhalten.
- Der technische Gerätetyp kann in der Gerätedatenbank separat vom Anzeigetext bearbeitet werden.

## FWG14MS: Wetter-Empfangs-ID und Busadresse getrennt

- Ein eigenes FWG14MS-Profil unterscheidet die tatsächliche Empfangs-ID der Wettertelegramme von der PCT14-Busadresse.
- Die Drehschalterposition ist in einem Dropdown auswählbar:
  - Position 1: Empfangs-ID `00-00-18-00`, Bereich `00-00-18-00` bis `00-00-18-0C`.
  - Position 2: Empfangs-ID `00-00-18-10`, Bereich `00-00-18-10` bis `00-00-18-1C`.
- Die PCT14-Adresse bleibt als `bus_address` erhalten und kann weiterhin im Anzeigenamen stehen.
- EEP `A5-13-01` und Lerntelegramm `4C-08-0D-80` bleiben erhalten.
- Die Empfangs-ID wird aus der gewählten Position bestimmt. Andere Series-14-Geräte behalten ihre bisherige ID-Bildung.

## Zuverlässigere, abbrechbare ID-Erkennung

- Alle 37 Funk-Sensorprofile erhalten einen passenden Empfangsfilter für ihre Telegrammfamilie: RPS, 1BS oder 4BS. Auch FNSN55EB/FNS65EB, FTKE, Fensterkontakte sowie Bewegungs-, Temperatur- und Luftsensoren sind berücksichtigt.
- Kurze Busadressen wie `00-00-00-12`, andere Telegrammtypen und ausgehende ESP2-Telegramme beenden die Funk-Sensorsuche nicht mehr.
- Gültige Funk-IDs benötigen kein bestimmtes Herstellerpräfix.
- Die aktive Erkennungsschaltfläche wechselt zu **Abbrechen**. Nach dem Beenden des Empfängers kann die Suche erneut gestartet werden.
- Verspätete Ergebnisse einer abgebrochenen Suche werden verworfen.
- Geräte-ID und F4USM61B-Batterie-ID besitzen getrennte Suchaktionen. Fortschritt, Ergebnis, Fehler und Abbruch erscheinen direkt am jeweiligen Feld.
- Die besondere Erkennung verdrahteter FTS14EM-Eingänge sowie die Bus-ID-Behandlung von F3Z14D und FWG14MS bleiben erhalten.

Mehrere gleichzeitig sendende Funk-Sensoren derselben Telegrammfamilie lassen sich durch diesen Filter allein nicht eindeutig unterscheiden. Für die Erkennung bitte gezielt den gewünschten Sensor betätigen oder dessen Teach-in/LRN auslösen.

## Gerätedatenbank und bestehende Projekte

- Bestehende Gerätedatenbanken werden auf Schema 58 migriert und um fehlende technische Kennungen sowie das eigene FWG14MS-Profil ergänzt.
- Eigene technische Kennungen und Datenbankänderungen bleiben erhalten.
- Gespeicherte Geräte werden anhand ihrer technischen Profilzuordnung aufgelöst; frei vergebene Anzeigenamen bestimmen den exportierten Gerätetyp nicht.
- Bestehende Projekte können weiterhin geöffnet werden.

## F2L14 – zweistufiger Lüfter

- PCT14 erkennt den F2L14 und importiert beide Relaisadressen als eine gemeinsame Home-Assistant-Lüfterentität.
- Die Stufenbetriebsart kann als `exklusiv` oder `addierend` ausgewählt werden.
- Vorhandene PCT14-Einträge übernehmen ihre gespeicherte Betriebsart automatisch.
- EEDTOY schreibt die Home-Assistant-Sender-ID als F6-02-01-Doppelwippe mit Taste 7, Funktion 56 und beiden Kanälen in den Aktor.
- Ein Wechsel zwischen `exklusiv` und `addierend` aktualisiert denselben Sendereintrag direkt, statt eine zweite Speicherzeile anzulegen.
- Bereits durch frühere Teststände entstandene doppelte Moduseinträge derselben HA-Sender-ID werden automatisch bereinigt.
- Eingelernte physische Taster mit anderen Sender-IDs bleiben unverändert erhalten.
- Die erzeugte YAML enthält `stage_1_id`, `stage_2_id`, zwei Lüfterstufen und den ausgewählten `f2l14_mode`.

## MiniSafe2-Konfigurationsimport

- Vollständigen `Config:`-Text aus der MiniSafe2-E-Mail direkt aus der Zwischenablage einfügen.
- Alternativ eine TXT- oder JSON-Datei auswählen.
- Die Gerätevorschau erscheint automatisch nach der Zwischenablage- oder Dateiauswahl; ein zusätzlicher Button „Konfiguration prüfen“ ist nicht erforderlich.
- Der MiniSafe2-Import besitzt einen eigenen Bereich und ist vollständig vom PCT14-Import getrennt.
- Geräte ohne zugewiesenes EEP-Profil bleiben in der Vorschau gelb hervorgehoben, bis ein Profil ausgewählt wurde.
- Die MiniSafe2-Importmeldung erscheint in der eigenen MiniSafe2-Kachel und nicht im PCT14-Bereich.
- Importiert werden ausschließlich physische ELTAKO-EnOcean-Geräte mit ihrer `address`, dem Namen, dem MiniSafe2-Gerätetyp und dem zugeordneten Raum.
- `senderID`, Gateway-, Cloud-, Zugangsdaten-, Aktions- und Szenendaten werden ausdrücklich nicht übernommen.
- Bekannte MiniSafe2-Gerätetypen werden automatisch einem EEDTOY-/EEP-Profil zugeordnet.
- Nicht eindeutig zuordenbare Gerätetypen können vor dem Import manuell einem Profil zugewiesen werden.
- Bereits vorhandene Geräte-IDs werden übersprungen.

## Weitere unterstützte Geräteprofile

- **FAH** mit EEP `A5-06-01`, Geräteklasse `illuminance` und Lerntelegramm `18-08-0D-80`.
- **FRW-ws** mit EEP `F6-02-01`, Geräteklasse `smoke` und dokumentierter Batterie-Warnung bei Datentelegramm `0x30`.

## Senderprogrammierung und Stabilität

- FHK14 behält die bestätigte Programmierung in Function Group 3 mit Function 65.
- FAE14LPR verwendet weiterhin seinen ursprünglichen Schreibweg und erhält pro Kanal genau eine priorisierte Controller-ID.
- Bei einer unklaren Schreibbestätigung wird die gespeicherte Zeile zurückgelesen, bevor erneut geschrieben wird.
- Fortschritts-, Ergebnis- und Abbruchmeldungen sind vollständig auf Deutsch und Englisch verfügbar.
- Die automatische Sender-ID-Vergabe berücksichtigt weiterhin FAM-USB-Base-IDs mit Endung `80` und überspringt bereits belegte vollständige Senderadressen.

## Installation

### Windows

`EEDTOY-Setup-1.1.00.exe` herunterladen und ausführen. Python 3.12 und die benötigten Module sind vollständig enthalten; die Installation funktioniert offline.

Die Anwendung ist derzeit nicht digital signiert. Windows SmartScreen kann beim ersten Start eine Sicherheitswarnung anzeigen.

### macOS

Die DMGs für Intel und Apple Silicon können separat zu diesem Release hinzugefügt werden. Unter macOS zuerst das tatsächlich angeschlossene physische Gateway auswählen und danach `Gateway erkennen` verwenden.
