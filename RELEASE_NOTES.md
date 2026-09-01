# EEDTOY v1.0.97

EEDTOY v1.0.97 ergänzt den FMS14 und stellt die zuverlässige automatische Gateway-Erkennung wieder her.

## Änderungen

- Fehler bei der automatischen Gateway-Erkennung behoben.
- Die Gateway-Erkennung basiert wieder exakt auf dem funktionierenden Windows-Stand FIX70.
- FMS14 als eigener 2-Kanal-Multifunktions-Stromstoßschalter ergänzt.
- PCT14-XML-Import erkennt FMS14 automatisch und legt beide Kanäle mit fortlaufenden Geräte- und Sender-IDs an.
- FMS14-Sender-IDs werden für beide Kanäle als `State from Controller` in den Aktor geschrieben.
- FMS14-Sender erscheinen in PCT14 als `State from Controller` (Schlüsselfunktion 51); falsche Tastereinträge aus einem früheren v1.0.97-Build werden beim erneuten Schreiben ersetzt.
- Statusprofil `M5-38-08` und Senderprofil `A5-38-08` werden korrekt verwendet.
- Die aus der YAML übernommenen Sender-IDs werden unverändert für die 4BS-Controllertelegramme verwendet.
- Bestehende Gerätedatenbanken werden einmalig auf Schema 53 migriert; eigene Änderungen bleiben erhalten.

## Installation

### Windows

`EEDTOY-Setup-1.0.97.exe` herunterladen und ausführen.

Die Anwendung ist derzeit nicht digital signiert. Windows SmartScreen kann beim ersten Start eine Sicherheitswarnung anzeigen.
