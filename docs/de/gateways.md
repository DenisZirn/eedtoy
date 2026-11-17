# Gateways, COM-Ports und Base-IDs

[← Übersicht](README.md)

Das **YAML-Gateway** für Home Assistant ist nicht automatisch der **RS485-Programmieranschluss**. Beides muss getrennt betrachtet werden.

| Gateway | Aufgabe | Einstellung |
| --- | --- | --- |
| **FAM-USB** | Funk-Gateway | ESP2, 9.600 Baud |
| **FAM14** | Zugang zum Series-14-Bus | RS485, 57.600 Baud |
| **FGW14-USB** | USB-Zugang zum Series-14-Bus | ESP2/RS485, 57.600 Baud |

**Der FAM-USB kann über EEDTOY keine Sender-IDs direkt in Series-14-Aktoren schreiben.** Dazu ist der tatsächliche FAM14- oder FGW14-USB-RS485-Anschluss notwendig.

## Gateway einrichten

1. Hardware am Rechner anschließen.
2. Im Schritt **Gateway** einen der drei unterstützten Typen auswählen.
3. **Suchen** anklicken, um vorhandene COM-Ports anzuzeigen; anschließend den passenden Port auswählen.
4. **Gateway automatisch erkennen** verwenden. Alternativ nach Wahl des richtigen Typs **Base-ID auslesen** anklicken.
5. Angezeigten Gateway-Typ, COM-Port und Base-ID mit der Anlage abgleichen.
6. Erst dann zu **Geräte** wechseln.

Die automatische Gateway-Erkennung prüft serielle Schnittstellen. Ein manuell eingetragener Port wird zuerst geprüft. Das bloße Vorhandensein eines COM-Ports bestätigt noch nicht, dass er zum gewünschten Bussystem gehört.

## Verschiedene Base-IDs

In einer Anlage können z. B. **FAM-USB FF-A6-07-00** und **FAM14-Bus FF-F2-6C-80** verwendet werden. Diese Werte beschreiben unterschiedliche Komponenten. Ihre Vertauschung kann zu korrekt aussehender YAML führen, deren Steuertelegramme jedoch vom Aktor nicht akzeptiert werden.

## Zusätzliche Exportgateways

Nach einem PCT14-Import kann EEDTOY erkannte **FAM14-/FGW14-USB-Gateways** separat aktivieren. Unter **Geräte → YAML-Gateway** wird **für jedes Gerät genau ein** geeignetes Gateway ausgewählt. Sind alle Häkchen abgewählt, bleibt das Gerät im Projekt, wird aber nicht exportiert.

Ändert sich die benötigte Controller-ID, ist eventuell ein späterer Schreibvorgang nötig. **Ein Gatewaywechsel in der Geräteliste programmiert nichts.**

## Hardwarewechsel

Einen in EEDTOY verbundenen FAM14-/FGW14-USB-Anschluss vor dem Abziehen oder Wechseln über **Gateway trennen** lösen. PCT14 oder Home Assistant dürfen während eines exklusiven Schreibzugriffs den Bus nicht parallel verwenden.

Weiter: [PCT14 und mehrere Bussysteme](pct14-import.md) · [Sender-IDs schreiben](sender-ids.md).
