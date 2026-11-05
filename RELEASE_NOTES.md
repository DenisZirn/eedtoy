# EEDTOY v1.1.01

EEDTOY v1.1.01 unterstützt mehrere getrennte FAM14-Bussysteme hinter einem gemeinsamen FAM-USB. Der bestätigte TEST3-Stand wird damit offiziell verfügbar. Das FAM14 zum Programmieren kann direkt im YAML-/Schreibschritt erkannt und geprüft werden; ein Wechsel zum ersten Bildschirm ist dafür nicht mehr erforderlich.

## Mehrere getrennte FAM14-Bussysteme

- Die optionale Checkbox **Mehrere getrennte FAM14-Bussysteme vorhanden** im PCT14-Import blendet die zusätzlichen Optionen ein. Ohne Haken bleibt der bisherige Einbus-Ablauf erhalten.
- Jede PCT14-Datei wird einem benannten Bussystem mit eigener FAM14-Basis-ID zugeordnet. Die Basis-ID wird aus der Datei übernommen.
- Geräte mit derselben lokalen Busadresse bleiben zwischen den Systemen getrennt. Im FAM-USB-YAML werden ihre Empfangs-IDs aus dem jeweiligen FAM14-Basisbereich gebildet.
- Steuerbare Kanäle erhalten freie FAM-USB-Sender-IDs über alle Busse hinweg. Belegte Adressen werden übersprungen; insgesamt stehen 127 Senderadressen zur Verfügung.
- Beim erneuten Import desselben Busses werden vorhandene Geräte nicht doppelt angelegt. Eine Datei mit abweichender Basis-ID wird für einen bereits ausgewählten Bus abgelehnt.
- Busnamen, Gerätezuordnungen, Sender-IDs und Auswahl werden im Projekt gespeichert und wiederhergestellt.
- Bereits importierte Einbus-Geräte werden beim Aktivieren dem ersten Bus zugeordnet; ihre bisher wirksamen FAM-USB-Sender-IDs bleiben erhalten.

## FAM14 direkt beim Schreiben verbinden

- Der vorhandene Button heißt zunächst **Gateway verbinden** und nach erfolgreicher Prüfung **Gateway trennen**.
- Bei leerem Bus-COM-Port sucht EEDTOY das angeschlossene FAM14 mit der Basis-ID des ausgewählten Bussystems und trägt den gefundenen Port ein.
- Bei einem manuell eingetragenen Port wird ausschließlich dieser Anschluss geprüft.
- Andere gefundene FAM14-Bussysteme und das FAM-USB werden nicht versehentlich als ausgewählter Schreibbus übernommen.
- Die FAM-USB-Einstellungen und ihre Funktion als Quelle der Home-Assistant-Sender-IDs bleiben erhalten.
- Port- oder Buswechsel sowie das erneute Öffnen eines Projekts erfordern eine neue Verbindungsprüfung. Veraltete Suchergebnisse werden verworfen.
- Beim Schreiben werden nur die Einträge des ausgewählten Busses übertragen. Der Python-Schreibprozess prüft die tatsächliche FAM14-Basis-ID vor dem ersten Schreiben erneut.
- Das Trennen gibt den Bus frei und setzt den Verbindungsbutton zurück.

## YAML-Importhinweis

Der Hinweis unter der YAML-Ausgabe verweist jetzt auf **EEDTOY YAML importieren** in der Home-Assistant-Integration **ELTAKO Sensors & Actuators**. Der bisherige pauschale Hinweis auf `/config/configuration.yaml` wurde auf Deutsch und Englisch ersetzt.

## Bestehende Installation

Die offizielle Version verwendet den normalen EEDTOY-Installations- und Einstellungsordner. Vorhandene Projekte und Gerätedatenbanken bleiben verwendbar. Die bisherigen Geräteprofile, profilspezifischen YAML-Felder und die Gateway-Erkennung im ersten Schritt bleiben erhalten. An der Home-Assistant-Integration ist für die Mehrbus-Zuordnung keine Änderung erforderlich.

Die Mehrbus-Funktion dieser Version ist für ein gemeinsames FAM-USB als Hauptgateway und mehrere FAM14 mit unterschiedlichen Basis-IDs vorgesehen. Die Busse werden zum Programmieren nacheinander angeschlossen.

## Installation

### Windows

`EEDTOY-Setup-1.1.01.exe` herunterladen und installieren. Python und die benötigten Laufzeitmodule sind enthalten; die Installation funktioniert offline.

### macOS

Die DMGs für Intel und Apple Silicon werden separat ergänzt. Die bisherige macOS-Gateway-Erkennung bleibt beim jeweiligen Plattformbuild erhalten: zuerst das physisch angeschlossene Gateway auswählen, danach **Gateway erkennen** verwenden.
