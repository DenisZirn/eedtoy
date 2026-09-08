# EEDTOY v1.0.97

EEDTOY v1.0.97 ergänzt FMS14 und FKS-B, korrigiert die FHK14-Controllerprogrammierung und stellt die zuverlässige automatische Gateway-Erkennung wieder her.

## Änderungen

- Fehler bei der automatischen Gateway-Erkennung unter Windows behoben.
- Die Windows-Gateway-Erkennung basiert wieder exakt auf dem funktionierenden Stand FIX70.
- FMS14 als eigener 2-Kanal-Multifunktions-Stromstoßschalter ergänzt.
- Der PCT14-XML-Import erkennt FMS14 automatisch und legt beide Kanäle mit fortlaufenden Geräte- und Sender-IDs an.
- FMS14 verwendet das Statusprofil `M5-38-08` und das Senderprofil `A5-38-08`. Die Sender-IDs werden als `State from Controller` in den Aktor geschrieben.
- Falsche FMS14-Tastereinträge aus einem früheren v1.0.97-Build werden beim erneuten Schreiben ersetzt.
- FHK14 schreibt die Controller-ID jetzt korrekt in Function Group 3 mit Function 65 (`temperature setpoint from controller`).
- Der FHK14-Schreibvorgang ignoriert verspätete doppelte `F2`-Antworten und wartet zuverlässig auf die gültige `F4`-Schreibbestätigung.
- Für den einzelnen FHK14-Controllerplatz gilt die Priorität `FGW14-USB > FAM-USB > FAM14`. Ist ausschließlich ein FAM14 vorhanden, wird dessen Sender-ID verwendet.
- Frühere falsche FHK14-Einträge mit Function 65 in Function Group 4 werden beim erneuten Schreiben entfernt.
- FKS-B wurde als eigenes Klimagerät ergänzt und wird technisch wie FKS-H mit dem bidirektionalen EEP `A5-20-04`, dem Lerntelegramm `80-20-0D-80` und einem Sollwertbereich von 10–30 °C behandelt.
- Bestehende Gerätedatenbanken werden einmalig auf Schema 54 migriert; eigene Änderungen bleiben erhalten.

## Installation

### Windows

`EEDTOY-Setup-1.0.97.exe` herunterladen und ausführen.

Die Anwendung ist derzeit nicht digital signiert. Windows SmartScreen kann beim ersten Start eine Sicherheitswarnung anzeigen.

### macOS

Die macOS-DMGs für Intel und Apple Silicon können separat zum Release hinzugefügt werden.

Die Anwendung ist derzeit nicht digital signiert. macOS Gatekeeper kann beim ersten Start eine Sicherheitswarnung anzeigen.

Wichtig: Unter macOS zuerst das tatsächlich angeschlossene physische Gateway in EEDTOY auswählen. Erst danach auf `Gateway erkennen` klicken. Unter Windows ist dieser zusätzliche Auswahlschritt nicht erforderlich.
