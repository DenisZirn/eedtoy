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


## Heizungs-Betriebsartensteuerung (Testfunktion)

Für **FHK14, F4HK14, FAE14LPR und FAE14SSR** schreibt EEDTOY zusätzlich zur
vorhandenen Temperaturregelung einen Betriebsartensender als **Vierfach-RPS-Taster
in FG4 / Funktion 30**. Ein eigener Sender kann pro Heizkanal im Geräteformular
hinterlegt werden. Ist das Feld leer, wird die zu diesem Gateway gehörende
bisherige Temperatur-Controller-ID verwendet. Der F4HK14 behält für jeden seiner
vier Heizkanäle die eigene Sender- und Kanalzuordnung.

**FG1/F64 und FG3/F65 bleiben fachlich getrennte Temperaturrollen.** Der
Schreibvorgang liest bestehende FG4-Einträge aus, ergänzt nur einen freien
Eintrag oder aktualisiert eine EEDTOY bekannte vorherige Betriebsarten-ID
für denselben Kanal. Fremde FTR-/FUTH-/MiniSafe-Sender werden nicht überschrieben.
Beim erneuten Schreiben entstehen keine neuen Doppeleinträge.

Die Vierfach-RPS-Datenwerte zur Betriebsartensteuerung sind:

| RPS-Datenbyte | Betriebsart |
| --- | --- |
| `0x70` | Normalbetrieb / Home |
| `0x50` | Nachtabsenkung 4 K / Sleep |
| `0x30` | Absenkung 2 K / Eco |
| `0x10` | Aus / Frostschutz |

Diese Werte sind **RPS-Datenbytes**, nicht das EnOcean-Statusbyte.

### FHK61, FHK61U und FHK61SSR (Funkaktoren)

Die FHK61-Familie wird **nicht** über RS485-FG4 programmiert. Den
Betriebsartensender separat einlernen:

1. Für den Vierfach-Funktaster den unteren Drehschalter auf
   **Rechtsanschlag 4,5** einstellen.
2. Den oberen Drehschalter auf **LRN** stellen. Die LED blinkt ruhig.
3. Den zugeordneten RPS-Vierfach-Taster betätigen; nach erfolgreichem
   physischen Einlernen erlischt die LED am Aktor.
4. Beide Drehschalter auf die vorgesehene Betriebsstellung zurückdrehen.
   Anschließend die vier Betriebsarten am Aktor testen.

Die Vorgehensweise ist unter anderem für die neuere FHK61-230V-Anleitung
(Version 30 100 045-3), FHK61U-230V und FHK61SSR dokumentiert.
Ein Absetzen eines Funksignals **allein** bestätigt noch keinen Lernerfolg.
EEDTOY zeigt eine manuelle Anleitung, sendet in dieser Testversion jedoch
kein automatisches Funk-Lerntelegramm.

Quellen (ELTAKO):
- [FHK61-230V – aktuelle Bedienungsanleitung](https://www.eltako.com/fileadmin/downloads/de/_bedienung/FHK61-230V_UC_30100045-3_dt.pdf)
- [FHK61U-230V – Bedienungsanleitung](https://www.eltako.com/fileadmin/downloads/de/_bedienung/FHK61U-230V_30100050-2_dt.pdf)
- [FHK61SSR – Bedienungsanleitung](https://www.eltako.com/fileadmin/downloads/de/_bedienung/FHK61SSR_30100034-1_dt.pdf)

**FHK61SSR-230V:** Die direkte A5-38-08-PWM-Regelung ist eine
eigenständige Aktorbetriebsart und darf nicht mit der
A5-10-06-Temperaturregelung vermischt werden.
