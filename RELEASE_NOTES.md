# EEDTOY v1.1.05

## Geräte und Aktorprogrammierung

- **FRGBW14 – an echter Hardware bestätigt:** Die Home-Assistant-Sender-ID wird in **Funktionsgruppe 3 / Funktion 81** mit RGBW-Vierkanalmaske `00001111` geschrieben. Die physische PCT14-ID-Tabelle beginnt nach vier Konfigurationszeilen: **FG1 ab Speicherzeile 12, FG3 ab Zeile 16**. Bereits eingelernte fremde IDs bleiben unangetastet. Ein fehlerhafter alter FG1-Eintrag derselben Sender-ID wird erst nach erfolgreicher FG3-Programmierung entfernt.
- **FHK14, F4HK14 und FAE14:** Wählbare Temperaturreferenz: externe Home-Assistant-Temperatur in FG1/Funktion 64 oder vorhandener eingelernter Sensor in FG1 mit HA-Sollwertvorgabe in FG3/Funktion 65. Ein Wechsel der Regelungsart wird als **noch in den Aktor zu schreiben** angezeigt und erst nach bestätigtem Schreibvorgang quittiert.
- **F4HK14:** Zuordnung aller vier Heizkanäle und Kanalmasken bei unterschiedlichen Gerätebezeichnungen verbessert.
- **FHK14-FG4-Taste:** PCT14-Funktion 30 („4-fach Taster, alle Tasten“) erhält jetzt Taste **7** statt 0. Bereits von älteren EEDTOY-Testversionen geschriebene gleiche Sender-/Funktions-/Kanaleinträge werden an derselben Speicherstelle korrigiert, ohne vorhandene MiniSafe-IDs zu verändern oder Duplikate zu erzeugen.
- **Betriebsarten Series-14:** FHK14, F4HK14 (vier Kanäle getrennt), FAE14LPR und FAE14SSR: optional eigenständiger Betriebsartensender in **FG4 / Funktion 30 (Vierfach-Taster)**. Bestehende Temperaturzuordnung FG1/F64 bzw. FG3/F65 bleibt unverändert. Fremde MiniSafe-/FTR-/FUTH-Einträge werden nicht überschrieben. Nach bestätigter Rücklesung werden Gruppe, Funktion, Kanal und Sender-ID protokolliert.
- **Betriebsarten FHK61:** FHK61-230V, FHK61U-230V und FHK61SSR-230V in Temperaturregelung: getrennte Senderrollen mit Anleitung zum **manuellen Funk-Einlernen** (4,5 / LRN / RPS-Taster / Betriebsstellung). Kein FG4-Busschreiben und keine fingierte Einlernbestätigung. Direkt-PWM beim FHK61SSR bleibt separat.
- **YAML:** Optional `operating_mode_sender_id`; fehlt die separate ID, wird die ursprüngliche Temperaturcontroller-`sender.id` verwendet. Die explizite Sender-ID wird gegen Gateway-/Base-ID-Zuordnung validiert.
- **FHK61-Familie:** FHK61-230V, FHK61U-230V und FHK61SSR-230V ergänzt; Temperaturregelung und direkter PWM-Betrieb beim SSR bleiben getrennte Betriebsarten.
- **FD2G14:** Wiederanlauf nach fehlgeschlagener Geräteerkennung gegen `NameError` abgesichert; Diagnose und Rückleseprüfung für 16 Kanäle erweitert. Sporadische Timeouts können weiterhin auftreten.

## EEDTOY-Einlernhilfe für dezentrale Funkaktoren

- Unter **Hilfe → Dezentrale Aktoren einlernen** steht ein eigenständiges, durchsuchbares Hilfefenster für Modelle der **Baureihe 61 und 62** zur Verfügung. Die **Baureihe 72** wird nur mit allgemeinen Hinweisen angezeigt, solange keine genaue Gerätevariante bestätigt ist.
- Das Geräteformular bietet für passende Modelle einen direkten Link **„Einlernhilfe für diesen Aktor öffnen“**. Dadurch öffnet sich die Anleitung sofort mit der Modellvorauswahl.
- Die Anleitungen enthalten nun die vier wesentlichen Schritte **Aktor auf LRN beziehungsweise per Tippsequenz lernbereit machen → in Home Assistant „Einlerntelegramm senden“ drücken (sofern verfügbar) → Gerätequittierung kontrollieren → Betriebsstellung wiederherstellen**.
- FHK61: Temperaturregler A5-10-06 und RPS-Betriebsartensender sind getrennt auswählbar. Direkt-PWM am FHK61SSR wird nicht mit der Temperaturregelung gleichgesetzt.
- Für unbestätigte Varianten werden keine Einlernpositionen erfunden. Hersteller-PDFs beziehungsweise die offizielle Download-Zone sind separat verlinkt. Die Hilfefunktion schreibt selbst keine Telegramme und ändert keine Projekte.

## Sicherheit und Diagnose

- Bei Änderungen an programmierungsrelevanten Aktoreinstellungen (z. B. Temperaturreferenz, Sender-ID, Kanal oder F2L14-Modus) verlangt EEDTOY einen **separaten, ausdrücklich bestätigten Schreibvorgang**. Das Speichern der Projektdatei allein programmiert keinen Aktor.
- Der Schreibstatus wird erst nach bestätigtem Gerätezugriff zurückgesetzt; bei Fehlern bleiben ausstehende Änderungen sichtbar.
- Die Python-Schreibdiagnose wird als `EEDTOY-Schreibdiagnose.log` gespeichert. Der Dateipfad wird in EEDTOY angezeigt; falls das Installationsverzeichnis nicht beschreibbar ist, wird das Benutzerverzeichnis verwendet.
- Zusätzliche Regressionstests für FRGBW14-Speicheradressierung, fremde Sender-IDs, unterschiedliche Controller-IDs, Gateway-Zuordnung und eingebettete Python-Laufzeit.
- Der Windows-Installer wird im CI-Build auf einem sauberen Windows-System testinstalliert.

## Installation

**Windows:** `EEDTOY-Setup-1.1.05.exe` installieren. Die benötigte Python-Laufzeit ist enthalten.

**Wichtig:** Vor Schreibvorgängen eine PCT14-Sicherung erstellen und immer den richtigen Series-14-Bus auswählen. Eine neue macOS-DMG-Version ist nicht Bestandteil dieser Windows-Veröffentlichung.

> EEDTOY ist ein privat entwickeltes Projekt und kein offizielles Produkt der ELTAKO GmbH.
