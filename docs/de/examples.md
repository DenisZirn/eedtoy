# Praxisbeispiele: FHK14 und FTS14EM

[← Übersicht](README.md)

Die folgenden IDs sind **Anlagenbeispiele**. Sie dürfen nicht ungeprüft auf andere Installationen übertragen werden.

## FHK14: Rückwechsel zum bereits eingelernten Controller

Annahmen:

- Bus-Base-ID: `FF-F2-6C-80`
- FAM-USB-Base-ID: `FF-A6-07-00`
- FHK14: lokale Busadresse `2`
- PCT14 zeigt die eingelernte Controller-ID `00-00-B0-02` in **Funktionsgruppe 3, Funktion 65**

Daraus ergibt sich für diesen Fall:

| Steuerungsgateway | Sender-ID | Konsequenz |
| --- | --- | --- |
| Passendes FAM14/FGW14-USB am Bus | `00-00-B0-02` | Entspricht der bekannten eingelernten Controller-ID |
| FAM-USB | `FF-A6-07-02` | Andere Sender-ID, unter Umständen neu einzulernen |

### Ablauf

1. Unter **Geräte → YAML-Gateway** den FHK14 von FGW14-USB auf FAM-USB ändern.
2. EEDTOY meldet **Controller-ID schreiben erforderlich**, sofern die alte PCT14-ID bekannt und die neue ID abweichend ist.
3. Ohne dazwischenliegendes Schreiben zurück zum ursprünglichen Gateway wechseln.
4. Wenn die alte Controller-ID noch als nachweislich eingelernt gespeichert ist, verschwindet die Warnung wieder.

Wenn jedoch zwischenzeitlich **tatsächlich die neue Sender-ID geschrieben** wurde, kann beim Rückwechsel erneut eine Programmierung notwendig sein.

## FTS14EM: ungültige FAM-USB-Zuordnung

FTS14EM gehört zum **Series-14-Bus** und wird nicht über das FAM-USB als YAML-Gateway exportiert.

1. Im PCT14-Import den passenden FAM14-/FGW14-USB-Bus aktivieren.
2. Prüfen, ob die **Bus-Base-ID** zum importierten FTS14EM passt.
3. In der Geräteliste **YAML-Gateway** auf das zugehörige Busgateway einstellen.
4. YAML erneut erzeugen.

EEDTOY v1.1.04 korrigiert geeignete ungültige **automatische Standardzuordnungen**, sobald ein passendes Busgateway verfügbar ist. Eine bewusst gesetzte gültige Zuordnung bleibt erhalten.

### FTS14EM-Geräte-ID erkennen

Alternativ zu PCT14 kann die ID am physischen FAM14/FGW14-USB-RS485-Anschluss erkannt werden: **Dieselbe an E1 angeschlossene Taste fünfmal drücken**. Der Fortschritt wird angezeigt. Anschließend mit **Hinzufügen** übernehmen.

## Mehrere Series-14-Busse über ein FAM-USB

Pro physischem Bus eine passende PCT14-Datei mit dessen Base-ID importieren. Geräteeinträge des ersten Busses dürfen nicht versehentlich unter dem zweiten Bussystem landen. Zum Schreiben jeweils **nur den richtigen RS485-Bus** anschließen und die Bus-Base-ID vor der Bestätigung abgleichen.

Weiter: [Mehrbus-Import](pct14-import.md) · [Sender-IDs schreiben](sender-ids.md).
