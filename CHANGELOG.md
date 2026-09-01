## 1.0.97

- FMS14 als eigener 2-Kanal-Multifunktions-Stromstoßschalter ergänzt.
- PCT14-XML-Import erkennt `FMS14` automatisch und erzeugt genau zwei Kanäle mit fortlaufenden Geräte- und Sender-IDs.
- PCT14-Kanalbeschreibungen werden als Namen übernommen.
- Statusprofil `M5-38-08`, PTM200-/RPS-Senderprofil `F6-02-01`, `0x70` EIN und `0x50` AUS.
- Bereits gespeicherte Gerätedatenbanken werden einmalig auf Schema 52 migriert.
- Gateway-Erkennung, Portauswahl, Electron-Hauptprozess, Python-Gatewaycode und Windows-Buildskripte bleiben unverändert aus FIX70 erhalten.

## 1.0.96 FIX48

- Vollständige Pflege der vom Nutzer dokumentierten Lerntelegramme in der editierbaren Gerätedatenbank.
- Ergänzt wurden D5-00-01, F6-10-00, A5-14-09, A5-07-01, A5-08-01, A5-30-03, A5-04-02, A5-09-0C, A5-09-04, A5-12-01 und A5-13-01.
- Bestehende lokale Datenbanken werden über Schema 48 einmalig um fehlende oder bislang leere verifizierte Lerntelegramme ergänzt. Danach bleiben Benutzeränderungen erhalten.
- FSM60B bleibt bewusst ohne Lerntelegramm. Für F4USM61B wird kein nicht dokumentierter Telegrammwert geraten.
- YAML übernimmt Lerntelegramme weiterhin ausschließlich aus dem aktiven Datenbankprofil.

## 1.0.96 FIX46

- Lerntelegramme steuerbarer Geräte werden als editierbare Profildaten in der Gerätedatenbank gepflegt und aus dieser in die YAML exportiert.
- Bestehende benutzerdefinierte Lerntelegramme werden bei der Datenbankmigration nicht überschrieben.
- Einzelne `FIX*_NOTES.txt` wurden in `FIX_NOTES.txt` zusammengeführt.

## 1.0.96 FIX44

- FTFSB profiles A5-04-02 and A5-04-03 restored.
- Existing FIX43 device databases receive the missing profiles once via schema migration.
- Existing FTFSB projects resolve their stored profile keys again.

## 1.0.96 FIX43

- Gerätedatenbank nach dem Speichern vollständig autoritativ: Änderungen, neue Profile, umbenannte Schlüssel und Löschungen bleiben dauerhaft erhalten.
- Standardprofile werden nur beim ersten Start oder über „Standard wiederherstellen“ geladen; kein automatisches Wiederauffüllen gelöschter Profile.
- YAML-Export löst jedes Gerät unmittelbar gegen die aktuelle Gerätedatenbank auf. Normale neue Profile werden dadurch ohne Codeänderung exportiert.
- Gerätespezifische Projektwerte wie IDs, Name, Raum, Kanal, Zeiten und Sender-ID bleiben erhalten.
- Spezialgeräte behalten ihre ausdrücklich implementierten Sonderregeln.

## 1.0.96 FIX42

- FRGBW free-profile database entries corrected to 07-3F-7F.
- Database-key renaming is now persistent.

## 1.0.96 FIX41

- Korrigiert die Profilzuordnung beim Laden gespeicherter EEDTOY-Projekte.
- Der Bearbeitungsdialog ermittelt das Geräteprofil jetzt anhand des gespeicherten Datenbankschlüssels sowie EEP, Gerätetyp, Modell, Name, Plattform und Sender-EEP.
- Geräte wie FUD14 und FSB14 werden beim Bearbeiten nicht mehr fälschlich als F2T55 angezeigt.
- Neue Projekte speichern den eindeutigen `profile_key`, damit die Zuordnung dauerhaft erhalten bleibt.
- Für nicht eindeutig auflösbare Altprofile gibt es keinen stillen F2T55-Fallback mehr; stattdessen wird das unbekannte gespeicherte Profil sichtbar angezeigt.

## 1.0.96 FIX39

- FSR71NP-4x-230V auf die offizielle Gerätebezeichnung vereinheitlicht.
- Vierkanal-YAML-Export verwendet für alle Kanäle den offiziellen Namen und `device_family: FSR71NP-4x-230V`.
- Frühere Namensvarianten werden beim Laden nur noch intern normalisiert.


## 1.0.96 FIX4

- FRWB corrected to EEP A5-30-03 with unique database key A5-30-03-FRWB.
- FHMB uses unique database key A5-30-03-FHMB.
- Device database now blocks duplicate database keys instead of silently overwriting another device.
# Changelog

## 1.0.96
- Gerätedatenbank speichert jetzt alle bearbeitbaren Felder zuverlässig in einer persistenten JSON-Datei.
- Änderungen werden nach dem Speichern sofort in die Geräteauswahl übernommen.


## 1.0.96

- Neue Gerätedatenbank als separates, frei skalierbares Fenster unter „Bearbeiten“.
- Geräte können angelegt, bearbeitet, dupliziert, deaktiviert und gelöscht werden.
- Kategorie und Geräteklasse werden über vorgefertigte Dropdowns ausgewählt.
- Gerätespezifische Felder werden abhängig von der Plattform dynamisch eingeblendet.
- Änderungen an der Gerätedatenbank aktualisieren die Geräteauswahl sofort, ohne das Projekt neu zu laden.
- Zählertarife werden nur bei Zählerprofilen angezeigt.
- FFT60SB auf EEP A5-04-02 und A5-04-03 korrigiert; A5-04-01 entfernt.
- Hinweis zum YAML-Import an das automatische Neuladen der Integration angepasst.

## 1.0.95

- Ein Klick prüft und programmiert jetzt die erforderlichen Sender-IDs aller Gateways, die in die YAML exportiert werden.
- FAM14 und FGW14-USB werden auf den gemeinsamen internen `00-00-B0-xx`-Sender dedupliziert.
- Die Sender-ID eines FAM-USB wird weiterhin dynamisch aus dessen tatsächlicher Base-ID und dem Aktor-/Kanaloffset gebildet.
- Mehrere erforderliche Sender für denselben Series-14-Aktorkanal bleiben in der Schreibliste erhalten und werden einzeln geprüft.
- Bus-COM-Port, Gatewayübersicht und Schreibschaltfläche sind im YAML-Schreibbereich auf gleicher Höhe dargestellt.
- Python-Regressionstest für mehrere Sender pro Aktorkanal in den normalen Testlauf aufgenommen.

## 1.0.94

- Automatische Gateway-Erkennung für FAM14, FAM-USB und FGW14-USB stabilisiert.
- Echtes COM-Port-Dropdown für mehrere erkannte serielle Schnittstellen ergänzt.
- Bereits ausgewählter COM-Port bleibt bei einer erneuten Suche erhalten.
- Manuelle COM-Port-Eingabe bleibt als Rückfall verfügbar.
- Python 3.12 und alle benötigten Module werden vollständig im Windows-Installer mitgeliefert.
- Vorhandene Python-Installationen werden nicht verwendet oder verändert.
- Der CI-Build installiert den erzeugten Windows-Installer auf einem sauberen Runner und prüft die eingebettete Laufzeit aus dem tatsächlichen Installationsverzeichnis.
- Versionsangaben in Anwendung, YAML-Header, `package.json`, `package-lock.json` und Regressionstests vereinheitlicht.
- Plattformabhängige Zeilenenden werden bei der Schutzprüfung der freigegebenen Gerätedatenbank normalisiert.

## 1.0.93

- FTR65DSB, FTR55DSB, FTR55EHB, FTR55ESB, FTR65HB, FTRF65HB, FTR55HB, FTR65SB, FTRF65SB und FTR55SB ergänzt.
- Für die FTR55/65-Familie sind die Betriebsarten TF61 (A5-38-08, Lerntelegramm `E0-40-0D-80`, EIN/AUS mit 1 K Hysterese) und FHK (A5-10-06, Lerntelegramm `40-30-0D-87`) auswählbar.
- FHK-Profile exportieren den Sollwertbereich 12–28 °C sowie 8 °C als Frostschutzwert.
- FDG14 als DALI-Gateway/Dimmaktor mit A5-38-08 FUNC=38, Command 2 ergänzt.
- Der PCT14-Import erkennt FDG14 automatisch als dimmbaren A5-38-08-Aktor.
- Deutsche und englische Gerätebezeichnungen sowie Regressionstests erweitert.

## 1.0.92

- Deutsche und englische Oberflächentexte vollständig sprachlich und technisch überarbeitet.
- Gemischte deutsche/englische Beschriftungen wie `Disconnect / Bus freigeben`, `Wireless` und der englische Fußzeilentext in der deutschen Oberfläche entfernt.
- Alle 61 freigegebenen Geräteprofile besitzen jetzt eine feste, vollständige englische Gerätebezeichnung. Die fehleranfällige Übersetzung aus einzelnen Wortfragmenten dient nur noch als Rückfall für zukünftige unbekannte Bezeichnungen.
- Technische Begriffe für Klima, RGBW, Zähler, Relais, Rollladen/Jalousie und Series-14-Sender-IDs präzisiert.
- Gateway-Beschreibungen, Projektdatei-Dialoge, Dateifilter, Kontextmenü und Info-Dialog werden vollständig in der gewählten Sprache angezeigt.
- Beim Sprachwechsel wird eine bereits erzeugte YAML-Vorschau automatisch in der gewählten Sprache neu erzeugt.
- Beim Öffnen eines Projekts wird die YAML-Vorschau mit der aktuellen EEDTOY-Version und der aktuell gewählten Sprache neu erzeugt; veraltete Kommentartexte aus älteren Projektdateien bleiben nicht erhalten.
- Zusätzliche Regressionstests für Übersetzungsschlüssel, Platzhalter, alle 61 Gerätebezeichnungen, YAML-Erzeugung, FKS-SV-Sender-ID-Kollisionen und die Electron-IPC-Schnittstelle ergänzt.
- Gerätedatenbank, EEP-Zuordnungen, Gateway-Protokolle und YAML-Maschinenschlüssel bleiben unverändert.

## 1.0.91

- Englische Oberfläche vollständig auf feste React-Übersetzungsschlüssel umgestellt.
- Gateway-, Geräte- und YAML-Seite einschließlich Formulare, Hinweise, Statusmeldungen und Schaltflächen vollständig zweisprachig.
- Gerätegruppen und alle 61 freigegebenen Gerätebezeichnungen werden in der englischen Oberfläche übersetzt; Produktnamen und EEPs bleiben unverändert.
- Dynamische Texte wie Geräteanzahl und `✓ Kopiert` bleiben unter React-Kontrolle und werden nicht mehr nachträglich im DOM überschrieben.
- Deutsch/English bleibt über das Menü umschaltbar und wird gespeichert.
- Neue Projektdateien erhalten je nach Sprache den Namen `EEDTOY-Projekt-…` oder `EEDTOY-Project-…`.
- PCT14-importierte Geräte werden unabhängig von der beim Import aktiven Sprache weiterhin korrekt als PCT14-Geräte erkannt.
- Keine Änderung an Gerätedatenbank, EEP-Zuordnung, Gateway-Protokollen oder YAML-Maschinenschlüsseln.

## 1.0.90

- FUTH55ED in fünf Betriebsarten ergänzt: FHK, FKS Kieback & Peter, FKS-H Hora, TF61R/FR62 und Hygrostat.
- Produktbezeichnung `FFT60SB` für A5-04-01 festgelegt.
- Aktorbezeichnungen `FSR14-2x` und `FSR14-4x` verwenden einen Bindestrich.
- Nur `FSR71NP-4x-230V` ist als 4-Kanal-Variante der Baureihe 71 enthalten.
- FFTE ist im gemeinsamen Profil `FTKE, FFTE, FFG7B` unter F6-10-00 enthalten.
- FFG7B bleibt für A5-14-09 und F6-10-00 als dreistufiger Fenstergriff markiert.
- Der Regressionsfix für Geräteanzahl und `✓ Kopiert` bleibt unverändert enthalten.

## 1.0.96 FIX33

- FTS14EM base-ID detection now requires five separate presses of the same E1 input.
- Filters unrelated RS485 bus traffic and counts a new press only after the matching release telegram.
- Shows live 0/5 to 5/5 detection progress.
- Detection fills only the ID field; the device is stored only after clicking Add.

## 1.0.96 FIX34

- Corrected missing English translations in the device database editor.
- Device groups, names, display labels and editor-specific options now follow the selected UI language.
