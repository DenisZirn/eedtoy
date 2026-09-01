# EEDTOY v1.0.97

EEDTOY v1.0.97 ergänzt den FMS14 und stellt die zuverlässige automatische Gateway-Erkennung wieder her.

## Änderungen

- Fehler bei der automatischen Gateway-Erkennung behoben.
- Die Gateway-Erkennung basiert wieder exakt auf dem funktionierenden Windows-Stand FIX70.
- FMS14 als eigener 2-Kanal-Multifunktions-Stromstoßschalter ergänzt.
- PCT14-XML-Import erkennt FMS14 automatisch und legt beide Kanäle mit fortlaufenden Geräte- und Sender-IDs an.
- FMS14-Sender-IDs werden für beide Kanäle direkt als PTM200/RPS in den Aktor geschrieben.
- FMS14-Sender erscheinen in PCT14 als `State from Controller` (Schlüsselfunktion 51); falsche Tastereinträge aus einem früheren v1.0.97-Build werden beim erneuten Schreiben ersetzt.
- Statusprofil `M5-38-08` und Senderprofil `F6-02-01` werden korrekt verwendet.
- Lerntelegramm beziehungsweise EIN-Telegramm `0x70` und AUS-Telegramm `0x50` werden korrekt erzeugt.
- Bestehende Gerätedatenbanken werden einmalig auf Schema 52 migriert; eigene Änderungen bleiben erhalten.

## Installation

### Windows

`EEDTOY-Setup-1.0.97.exe` herunterladen und ausführen.

Die Anwendung ist derzeit nicht digital signiert. Windows SmartScreen kann beim ersten Start eine Sicherheitswarnung anzeigen.
