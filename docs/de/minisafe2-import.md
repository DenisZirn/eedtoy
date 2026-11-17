# MiniSafe2-Konfiguration importieren

[← Übersicht](README.md)

Der MiniSafe2-Import steht im Schritt **Geräte** in einem eigenen Dialog bereit. Er unterstützt Konfigurationsdaten aus Text beziehungsweise TXT-/JSON-Dateien.

## Ablauf

1. Im Schritt **Geräte** den **MiniSafe2-Import** öffnen.
2. Den Konfigurationstext einfügen oder über **Datei auswählen** eine TXT-/JSON-Datei öffnen.
3. Die Vorschautabelle auf **Name, Geräte-ID, Typ, Raum und Profil** prüfen.
4. Für nicht eindeutig erkannte Geräte das passende EEDTOY-Profil zuordnen.
5. Nur gewünschte Geräte angehakt lassen.
6. Die Einstellung **Sender-IDs der Aktoren übernehmen** bewusst wählen.
7. Ausgewählte Geräte importieren, danach deren **YAML-Gateway** prüfen und das Projekt speichern.

## Sender-ID-Übernahme

| Option | Verhalten |
| --- | --- |
| Aus | EEDTOY vergibt freie Sender-IDs anhand des eingestellten Gateways |
| Ein | EEDTOY übernimmt nach Möglichkeit vollständige vorhandene Sender-IDs aus den Geräteeinträgen oder aus **getStates**, zugeordnet über **sid** |

Sind vorhandene IDs ungültig, nicht eindeutig oder widersprüchlich, meldet EEDTOY die betreffenden Geräte. Eine übernommene Sender-ID ist nur dann für die Steuerung brauchbar, wenn das ausgewählte Gateway diese tatsächlich senden kann und der Aktor sie akzeptiert.

**Nicht übernommen:** MiniSafe2-Cloud-Zugangsdaten, Aktionen oder Gateway-Konfigurationen. Der Import ist kein vollständiger Ersatz für die MiniSafe2-Systemmigration.

Siehe [Geräte](devices.md), [Controller-IDs](sender-ids.md) und [Home Assistant](yaml-home-assistant.md).
