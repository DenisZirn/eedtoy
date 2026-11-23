# EEDTOY v1.1.05

## Geräte und Schreibfunktionen

- **FHK14, F4HK14 und FAE14:** Unterstützen zwei getrennte Temperaturregelungsarten. Beim HA-Temperatursensor wird die HA-Sender-ID in Funktionsgruppe 1 / Funktion 64 programmiert. Bei einem bereits eingelernten FTR/FUTH bleibt dessen Zuordnung erhalten; die HA-Sollwertvorgabe wird über Funktionsgruppe 3 / Funktion 65 eingerichtet.
- **F4HK14:** Korrekte Zuordnung aller vier Heizkanäle und ihrer Kanalmasken auch bei uneinheitlicher Gerätebezeichnung.
- **FHK61-Familie:** FHK61-230V, FHK61U-230V und FHK61SSR-230V als auswählbare Geräteprofile. Beim FHK61SSR sind Temperaturregelung und direkte PWM-Steuerung getrennte Betriebsarten. Bestehende Gerätedatenbanken werden um die Profile ergänzt.
- **FRGBW14:** Controller-ID in Funktionsgruppe 3 / Funktion 81 mit der RGBW-Vierkanalmaske.
- **FD2G14:** Sicheres Auslesen und Prüfen aller 16 Kanäle über die physische Busadresse. Sporadische Antwortausfälle werden protokolliert; fehlgeschlagene Speicherzugriffe werden nicht als erfolgreich gemeldet. Ein möglicher Geräte- oder Busfehler kann weiterhin zu Timeouts führen.

## Diagnose und Zuverlässigkeit

- **Python-Schreibdiagnose:** Bei jedem Sender-ID-Schreibvorgang wird automatisch `EEDTOY-Schreibdiagnose.log` neben der installierten Anwendung erstellt; falls Windows dort keine Schreibrechte gewährt, wird das EEDTOY-Benutzerverzeichnis verwendet. Der tatsächliche Pfad wird nach dem Schreiben angezeigt.
- **Eindeutige Ergebnisse:** Wenn einzelne Sender-IDs nicht bestätigt werden können, meldet EEDTOY den Gesamtvorgang nicht mehr als vollständig erfolgreich.
- **Geprüfter Programmstart:** Zusätzliche JavaScript-Syntaxprüfung im Buildprozess.

## Installation

**Windows:** `EEDTOY-Setup-1.1.05.exe` installieren. Die mitgelieferte Python-Laufzeit benötigt keine separate Installation.

**Hinweis:** Vor Änderungen an Busaktoren die bestehende PCT14-Konfiguration sichern. Bei sporadischen FD2G14-Timeouts zunächst die Busverbindung und das Gerät prüfen. Die Diagnoseprotokolle enthalten technische Geräte- und Schnittstellenkennungen.

**macOS:** Ein aktueller DMG-Installer wird separat bereitgestellt.
