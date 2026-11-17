# Fehlerbehebung und FAQ

[← Übersicht](README.md)

Diese Hinweise beziehen sich auf **EEDTOY v1.1.04**.

## Typische Meldungen

| Meldung oder Beobachtung | Prüfung |
| --- | --- |
| **Kein serieller Port gefunden** | USB-Verbindung und Windows-Gerätemanager prüfen, danach **Gateway → Suchen** |
| **Gateway nicht erkannt** | Gateway-Typ, COM-Port und konkurrierende Zugriffe prüfen |
| **Bisheriges Gateway deaktiviert – neu zuordnen** | Ein gültiges, aktives und kompatibles **YAML-Gateway** für das Gerät auswählen |
| **Kein geeignetes Gateway aktiviert** | PCT14-Gateway aktivieren und korrekte Bus-Base-ID prüfen |
| **FTS14EM unter FAM-USB** | FTS14EM benötigt ein passendes FAM14-/FGW14-USB-Gateway; FAM-USB ist dafür kein geeigneter YAML-Exportweg |
| **Controller-ID schreiben erforderlich** | Aktuell benötigte Sender-ID entspricht nicht dem bekannten eingelernten Stand oder der Stand ist unbekannt |
| **Warnung bleibt trotz Rückwechsel** | PCT14-Datei mit aktueller eingelernter Controller-ID erneut importieren und Projektstand prüfen |
| **Falsches Bussystem / Base-ID stimmt nicht** | Angeschlossenen RS485-Bus mit der ausgewählten Bus-Base-ID vergleichen |
| **Bitte zuerst Gateway verbinden** | Im YAML-Schreibbereich FAM14/FGW14-USB über den passenden Bus-COM-Port verbinden |
| **Keine Series-14-Aktoren mit Sender-ID gefunden** | Import, Geräteprofile und vorgesehene Sender-ID-Einträge prüfen |
| **Schreiben nur teilweise erfolgreich** | Protokoll auf **nicht unterstützt** und **Fehler** kontrollieren; nicht blind erneut schreiben |
| **Doppelte Geräte in Home Assistant** | Neue YAML-Gateway-Zuordnung prüfen; bereits existierende HA-Entitäten bei Bedarf gezielt bereinigen |
| **SmartScreen-Warnung** | Laut Projekt-README ist die Windows-Anwendung nicht digital signiert; Quelle des Installers prüfen |
| **Projekt nicht gespeichert** | Ungültige Gerätefelder oder Dateiberechtigungen kontrollieren; gegebenenfalls **Projekt speichern unter …** |

## Warum kann ich nicht mit dem FAM-USB in Series-14-Aktoren schreiben?

Das FAM-USB ist in EEDTOY der Funkzugang. Die Schreibfunktion verlangt einen **physischen RS485-Anschluss** über FAM14 oder FGW14-USB. Der Funkstick ersetzt diese Verbindung nicht.

## Warum fehlen Geräte nach dem PCT14-Import?

EEDTOY übernimmt nur unterstützte Profile und gegebenenfalls Kanäle. Die Importmeldung benennt nicht übernommene Geräte. Aus einer gültigen PCT14-Datei folgt nicht automatisch, dass jeder darin enthaltene Aktor unterstützt wird.

## Warum reagiert ein Aktor trotz erzeugter YAML nicht?

Der Aktor muss die tatsächlich verwendete Controller-/Sender-ID akzeptieren. YAML erzeugen programmiert nichts. Gateway und Base-ID prüfen und bei Bedarf den separaten [Schreibvorgang](sender-ids.md) ausführen.

## Was, wenn ein Schreibvorgang abgebrochen wurde?

Ein Abbruch macht vorherige Schreibvorgänge nicht rückgängig. Zuerst das Ergebnisprotokoll auswerten, die aktiven Controller-IDs kontrollieren und danach nur erforderliche Korrekturen vornehmen.

## Was soll ich einem Fehlerbericht beifügen?

Version, Gateway-Typ, COM-Port, erwartete/erkannte Base-ID, betroffenes Geräteprofil und **vollständige Fehlermeldung** helfen bei der Analyse. Vor einer öffentlichen Veröffentlichung sensible IDs und Konfigurationsdetails entfernen.

[GitHub Issues](https://github.com/DenisZirn/eedtoy/issues/new/choose) · [Sicherheit](../../SECURITY.md) · [Übersicht](README.md)
