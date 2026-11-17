# Geräte hinzufügen und verwalten

[← Übersicht](README.md)

## Manuell hinzufügen

1. Im Schritt **Geräte** unter **Gerät hinzufügen** einen Namen eintragen.
2. Eine **Geräte-ID** eingeben oder **ID automatisch erkennen** verwenden. Dazu muss das richtige Empfangsgateway samt Port verfügbar sein.
3. Optional einen **Raum** angeben.
4. Unter **ELTAKO-Gerät / EEP-Profil** das konkrete Geräteprofil wählen.
5. Je nach Profil Geräteklasse, Betriebsart oder Senderparameter prüfen.
6. **Hinzufügen** anklicken.

Eine erfolgreich erkannte ID füllt zunächst nur das Formular aus; sie fügt kein Gerät automatisch zur Liste hinzu.

Bei steuerbaren Aktoren stehen gegebenenfalls **Sender-ID** und **Sender-EEP** zur Verfügung. Die Sender-ID wird anhand der Gateway-Base-ID vorgeschlagen und kann manuell angepasst werden. **Sender-ID und Geräte-ID sind nicht dasselbe.**

### Bearbeiten und Entfernen

In der Geräteliste **Bearbeiten** wählen, Änderungen durchführen und mit **Speichern** übernehmen. **Alles löschen** entfernt nach Rückfrage die aufgelisteten Geräte; die Gateway-Einstellungen bleiben bestehen.

## Geräte-ID erkennen

EEDTOY erwartet abhängig vom Profil passende Funk- oder Bustelegamme und bietet eine abbrechbare ID-Erkennung. Die Auswahl des richtigen Geräteprofils hilft, fremde Telegramme auszufiltern.

- **FTS14EM:** Erkennung nur über FAM14/FGW14-USB am RS485-Bus. Die **gleiche an E1 angeschlossene Taste fünfmal** betätigen und die ermittelte ID anschließend über **Hinzufügen** bestätigen.
- **F4USM61B:** Geräte-ID und gegebenenfalls zusätzlich notwendige physische Batterie-ID getrennt behandeln.
- **FWG14MS:** Empfangs-ID beziehungsweise ID-Bereich hängen von der Drehschalterposition ab; die PCT14-Busadresse ist separat.

## YAML-Gateway pro Gerät

Rechts in der Geräteliste besitzt jedes Gerät die Auswahl **YAML-Gateway**.

| Aktion | Ergebnis |
| --- | --- |
| Geeignetes Gateway anhaken | Das Gerät erscheint unter genau diesem Gateway in der YAML |
| Ein anderes Gateway wählen | Exportweg ändert sich; gegebenenfalls wird ein Schreiben der Controller-ID erforderlich |
| Alle Häkchen entfernen | Das Gerät bleibt im Projekt, fehlt aber bewusst in der YAML |
| „Bisheriges Gateway deaktiviert – neu zuordnen“ | Eine nicht mehr gültige oder inkompatible Zuordnung muss korrigiert werden |

EEDTOY v1.1.04 versucht ungültige **automatische** FAM-USB-Zuordnungen von reinen Busgeräten wie FTS14EM einem geeigneten Busgateway zuzuordnen. Eine bereits gültige manuelle Auswahl wird nicht überschrieben.

## Räume und Geräteprofile

Der Anzeigename kann frei vergeben werden. Der technische **device_type** ergibt sich aus dem gewählten Profil. Ein ausdrücklich eingetragener Raum kann als **area** exportiert werden; automatische PCT14-Adresshinweise sind davon zu unterscheiden.

Die eigene **Gerätedatenbank** kann lokal bearbeitet werden. Ein selbst angelegtes Profil bedeutet nicht automatisch, dass Home Assistant auch die zugehörige Steuerungs-/Decoder-Logik unterstützt.

Weiter: [PCT14 importieren](pct14-import.md) · [YAML erzeugen](yaml-home-assistant.md).
