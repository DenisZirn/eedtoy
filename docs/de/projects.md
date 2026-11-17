# Projekte speichern und wieder öffnen

[← Übersicht](README.md)

EEDTOY unterscheidet eine **Projektdatei** für die weitere Bearbeitung von der **YAML-Datei** für Home Assistant.

## Die drei Projektaktionen

In der oberen Leiste – und ebenfalls im Menü **Datei** – sind folgende Funktionen verfügbar:

| Schaltfläche | Funktion |
| --- | --- |
| **Projekt öffnen** | Eine gespeicherte EEDTOY-Projektdatei laden |
| **Projekt speichern** | In eine bereits gewählte Projektdatei speichern; beim ersten Speichern den Speicherort abfragen |
| **Projekt speichern unter …** | Projekt unter neuem Namen oder an anderem Ort speichern |

Das EEDTOY-Projektformat verwendet Dateien mit der Endung **`.eedtoy`**.

## Empfohlene Vorgehensweise

1. Gateway einrichten und erste Geräte hinzufügen beziehungsweise importieren.
2. **Projekt speichern unter …** wählen und einen eindeutigen Dateinamen vergeben, zum Beispiel `Haus_EG_FAM14.eedtoy`.
3. Nach Änderungen an Geräten, Gateway-Zuordnungen oder Sender-IDs **Projekt speichern** verwenden.
4. Vor größeren Bus- oder Controller-Änderungen mit **Projekt speichern unter …** zusätzlich eine Sicherungskopie anlegen.
5. Beim nächsten Start **Projekt öffnen** anklicken und Projektdatei wählen.

Beim Speichern wird eine gültige aktuelle Gerätebearbeitung berücksichtigt. Sind die Angaben fehlerhaft, meldet EEDTOY die betroffenen Felder statt einen ungültigen Stand stillschweigend zu übernehmen.

## Welche Angaben bleiben erhalten?

Ein Projekt speichert unter anderem die Geräte, das Hauptgateway und ergänzende Gateways, die Zuordnung zu Bussystemen, die ausgewählten YAML-Gateways sowie den Status ausstehender Controller-ID-Schreibvorgänge.

Nach dem Öffnen sollten besonders **Base-IDs**, **Gateway-Zuordnung** und **offene Schreibhinweise** geprüft werden. Nach wesentlichen Änderungen die YAML erneut erzeugen.

Die separat bearbeitbare **Gerätedatenbank** wird lokal verwaltet und sollte bei einem Rechnerwechsel gesondert berücksichtigt werden.

## Projektdateien vertraulich behandeln

Sie können Geräteadressen, Gateway-Base-IDs und lokale Portangaben enthalten. Projektdateien daher geschützt aufbewahren und nicht ungeprüft öffentlich hochladen.

Weiter: [YAML und Home Assistant](yaml-home-assistant.md).
