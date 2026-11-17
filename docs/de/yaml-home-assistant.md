# YAML erzeugen und in Home Assistant importieren

[← Übersicht](README.md)

EEDTOY erstellt YAML für die benutzerdefinierte Home-Assistant-Integration **ELTAKO Sensors & Actuators**.

## YAML vorbereiten

1. Unter **Geräte** Namen, Geräte-ID, EEP-Profil, optionalen Raum und gegebenenfalls Sender-ID prüfen.
2. Unter **YAML-Gateway** je Gerät **genau ein** kompatibles Gateway auswählen.
3. Bei deaktiviertem oder inkompatiblem Gateway die Zuordnung korrigieren.
4. **YAML generieren** anklicken.
5. Einen Hinweis über ausstehende Controller-ID-Schreibvorgänge berücksichtigen. Die Vorschau darf geöffnet werden, ohne dass dadurch ein Aktor beschrieben wird.
6. Im Schritt **YAML** die erzeugte Konfiguration prüfen und mit **Kopieren** übernehmen oder über **Download** als `eltako_config.yaml` speichern.

Nach späteren Gateway- oder Geräteänderungen muss die YAML **neu erzeugt** werden.

## Welche Geräte werden exportiert?

EEDTOY v1.1.04 exportiert ein Projektgerät nicht ungefragt mehrfach unter verschiedenen Gateways. **Nur Geräte mit einem gültig ausgewählten YAML-Gateway** werden übernommen. Werden alle Gateway-Häkchen für ein Gerät entfernt, bleibt es im Projekt, erscheint aber nicht in der YAML.

Nicht kompatible oder nicht mehr aktivierte Gateway-Zuordnungen müssen vor der YAML-Erzeugung korrigiert werden.

## Import in Home Assistant

1. Home Assistant öffnen und sicherstellen, dass **ELTAKO Sensors & Actuators** installiert und eingerichtet ist.
2. In dieser Integration die Funktion **EEDTOY YAML importieren** öffnen.
3. Die erzeugte YAML über die Importoberfläche übernehmen.
4. Die übernommenen Geräte und Entitäten prüfen. Nach Angaben der EEDTOY-Oberfläche wird die Integration anschließend automatisch neu geladen.
5. Funktionen mit der tatsächlich angeschlossenen Hardware überprüfen.

**Nicht** den gesamten EEDTOY-Export manuell in die normale Home-Assistant-`configuration.yaml` kopieren; vorgesehen ist die spezielle Importfunktion.

### Räume und technische Gerätetypen

- Ein ausdrücklich eingegebener Raum wird für den YAML-Export als `area` berücksichtigt.
- Der technische `device_type` stammt aus dem Geräteprofil, nicht aus dem frei vergebenen Anzeigenamen.
- Bei Relais können Steuer-EEP und internes Rückmeldeprofil unterschiedlich sein; zum Beispiel `sender.eep: A5-38-08` gegenüber `M5-38-08`.

## Bereits bestehende doppelte Entitäten

Der neue EEDTOY-Export verhindert doppelte Gerätedefinitionen durch mehrfache Gateway-Zuordnung. **Bereits früher in Home Assistant angelegte doppelte Geräte oder Entitäten** können allerdings weiter bestehen und müssen bei Bedarf dort gezielt bereinigt werden. Dabei keine Geräte anderer Integrationen löschen.

## Warum das EEDTOY-Projekt zusätzlich speichern?

Die YAML ist eine Ausgabe für Home Assistant, aber **kein vollständiger Arbeitsstand** für EEDTOY. Die Projektdatei speichert zusätzlich Geräte- und Gateway-Konfigurationen sowie gegebenenfalls offene Schreibaufgaben.

Weiter: [Projektdateien](projects.md).
