# PCT14-Import und mehrere Bussysteme

[← Übersicht](README.md)

EEDTOY verarbeitet unterstützte Series-14-Geräte aus einer **PCT14-XML-/HTML-Datei**. Laut Programmoberfläche gehören dazu unter anderem FSB14, FUD14, FDG14, FRGBW14, FSR14, FMS14, F2L14, FHK14, FD2G14, FWG14MS, FWZ14 und DSZ14.

**Vor größeren Änderungen die PCT14-Daten und bestehende Aktorzuordnungen sichern.**

## Ein Bussystem

1. Hauptgateway im Schritt **Gateway** festlegen.
2. Unter **Geräte → PCT14-Export importieren → Datei auswählen** die XML-/HTML-Datei öffnen.
3. Importmeldung prüfen: Anzahl der Geräte/Kanäle, Bus-Base-ID und eventuell nicht unterstützte Geräte.
4. Falls FAM14/FGW14-USB erkannt wird, unter **Aus PCT14 erkannt** die tatsächlich gewünschten Gateway-Optionen aktivieren.
5. In der Geräteliste das **YAML-Gateway** jedes importierten Gerätes prüfen.
6. Projekt speichern.

Ein erneuter Import kann neue Geräte ergänzen und bei bekannten Geräten PCT14-Informationen zur eingelernten Controller-ID aktualisieren, ohne eine manuelle Gateway-Auswahl überschreiben zu sollen.

## Mehrere getrennte FAM14-Bussysteme

Der Mehrbus-Modus ist für mehrere physisch getrennte Series-14-Busse vorgesehen, die beispielsweise über ein gemeinsames FAM-USB gesteuert werden.

1. **FAM-USB als Hauptgateway** wählen.
2. Unter PCT14-Import **Mehrere getrennte FAM14-Bussysteme vorhanden** aktivieren.
3. Bei **Bussystem für diesen PCT14-Import** die Auswahl **Neues Bussystem aus PCT14-Datei hinzufügen** verwenden.
4. Die Datei des ersten Busses importieren und bei Bedarf den Bussystemnamen anpassen.
5. Für einen weiteren Bus die Option **Neues Bussystem …** erneut wählen und dessen PCT14-Datei importieren.
6. Bei zusätzlichen Geräten eines vorhandenen Busses zuerst dieses bestehende Bussystem auswählen.
7. Den importierten Geräten unter **YAML-Gateway** nur geeignete Gateways des richtigen Busses zuordnen.
8. Projekt speichern und YAML erzeugen.

EEDTOY prüft die **Bus-Base-ID**: Stimmt eine Datei nicht zum ausgewählten Bussystem oder wird dieselbe Base-ID als neuer Bus verwendet, wird dies gemeldet.

### Programmieren bei mehreren Bussystemen

Unter **YAML** zunächst **Aktuell zum Beschreiben angeschlossenes Bussystem** wählen. Nur dessen RS485-Anschluss verbinden. Den **Bus-COM-Port** für eine automatische Suche leer lassen und **Gateway verbinden** wählen, oder einen sicher bekannten COM-Port eintragen.

Vor dem Schreiben die erkannte Base-ID prüfen. Für den nächsten Bus zuerst **Gateway trennen**, die Hardware wechseln und dann das andere Bussystem auswählen.

Die FAM-USB-Funksender-Base-ID ist nicht die FAM14-Bus-Base-ID.

Weiter: [Controller-IDs schreiben](sender-ids.md).
