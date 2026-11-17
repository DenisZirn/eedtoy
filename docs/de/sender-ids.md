# Controller-IDs und Sender-IDs sicher schreiben

[← Übersicht](README.md)

**Dieser Vorgang kann die im Series-14-Aktor hinterlegte Senderzuordnung verändern.** Deshalb vor jedem Schreiben die ursprüngliche PCT14-Konfiguration sichern und die physische Anlage prüfen.

## Warum ist eine Sender-ID notwendig?

Ein steuerbarer Aktor akzeptiert nur die jeweils eingelernten Controller-/Sender-IDs. EEDTOY unterscheidet deshalb die **Geräte-ID des Aktors** von der **Sender-ID des Steuerungsgateways**.

Je nach Gerät sind andere Einlernparameter nötig. Ein **FHK14** kann beispielsweise in PCT14 einen Controller-Eintrag unter **Funktionsgruppe 3, Funktion 65** enthalten. Diese Gruppenzuordnung gilt nicht allgemein für alle Aktoren.

## Wann erscheint die Schreibwarnung?

Bei einer Änderung unter **Geräte → YAML-Gateway** berechnet EEDTOY für betroffene Aktoren die erforderliche Sender-ID.

- Weicht sie von einer bekannten eingelernten bzw. erfolgreich geschriebenen Controller-ID ab, erscheint **Controller-ID schreiben erforderlich**.
- Beim Wechsel von **Geräte** zu **YAML** wird auf ausstehende Schreibvorgänge hingewiesen. Eine YAML-Vorschau ist trotzdem möglich.
- Wechselst du **ohne dazwischenliegenden Schreibvorgang** zu einem nachweislich bereits eingelernten Gateway zurück, kann die Warnung wieder verschwinden.
- Ist der eingelernte Controller nicht zuverlässig bekannt, bleibt der Schreibhinweis bestehen. Ein erneuter PCT14-Import kann die gespeicherte Controller-ID aktualisieren.
- Der Wechsel des YAML-Gateways **programmiert selbst noch keinen Aktor**.

## Voraussetzungen

1. Das passende **Series-14-Bussystem** und dessen Base-ID sind bekannt.
2. Ein **FAM14 oder FGW14-USB** ist als physischer **RS485-Busanschluss** angeschlossen.
3. Der Bus-COM-Port ist eindeutig geprüft. Er darf nicht mit dem Funk-COM-Port des FAM-USB verwechselt werden.
4. **PCT14, Home Assistant und andere parallel zugreifende Anwendungen** verwenden den Bus während des Schreibens nicht.
5. Die bestehende Gerätekonfiguration ist gesichert.

## Schritt-für-Schritt-Anleitung

1. Unter **Geräte** die YAML-Gateway-Zuordnung der Aktoren kontrollieren.
2. **YAML generieren** anklicken und gegebenenfalls die Warnung über noch zu schreibende IDs beachten.
3. Im Schritt **YAML** den Bereich **Home-Assistant-Sender-IDs in Series-14-Aktoren schreiben** öffnen.
4. Falls mehrere Bussysteme vorhanden sind, unter **Aktuell zum Beschreiben angeschlossenes Bussystem** den richtigen Bus auswählen.
5. Den **Bus-COM-Port FAM14/FGW14-USB** eintragen; alternativ Feld leer lassen, damit die Suche nach dem passenden Busanschluss erfolgt.
6. **Gateway verbinden** anklicken und die gemeldete **Bus-Base-ID** mit der PCT14-Datei vergleichen.
7. **Alle Sender-IDs schreiben** wählen. Die Bestätigungsabfrage zeigt Bus-Port, Exportgateways und die Anzahl der Einträge.
8. Erst nach Kontrolle aller Daten bestätigen.
9. Das Protokoll auswerten: **geschrieben**, **bereits vorhanden**, **nicht unterstützt**, **Fehler**.
10. Nach bestätigtem Erfolg das EEDTOY-Projekt erneut speichern.

EEDTOY zeigt Fortschritt und eine Funktion **Abbrechen** an. Ein Abbruch macht bereits abgeschlossene Schreibvorgänge nicht automatisch rückgängig.

## Wann gilt der Schreibvorgang als erfolgreich?

Die Warnung wird nur nach einem durch EEDTOY vollständig bestätigten Schreibvorgang für die jeweiligen Geräte zurückgesetzt. Sobald Fehler oder nicht unterstützte Einträge auftreten, bleibt der betreffende Status offen. **Eine erzeugte YAML-Datei ist kein Nachweis für eine erfolgreiche Programmierung.**

## Beispiel: FAM-USB gegenüber Series-14-Controller

Bei einer **beispielhaften** Busadresse 2 und diesen Beispiel-Base-IDs:

| Steuerweg | Controller-/Sender-ID |
| --- | --- |
| FAM14/FGW14-USB am Series-14-Bus | `00-00-B0-02` |
| FAM-USB mit Base-ID `FF-A6-07-00` | `FF-A6-07-02` |

Das sind **keine allgemeinen Werte für beliebige Anlagen**. Die tatsächliche Base-ID und der Gerätekontext sind immer zu prüfen.

Weiter: [Praxisbeispiele](examples.md) · [Fehlerbehebung](troubleshooting.md).
