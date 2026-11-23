"use strict";
/* EEDTOY decentralized actuator learning guide. Read-only: no actuator commands. */
(function (root, make) {
  const api = make();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EEDTOY_LEARN_GUIDE = api;
})(typeof window === "undefined" ? null : window, function () {
  const downloads = "https://www.eltako.com/de/service/downloads-zone/";
  const rows = [
    ["FHK61-230V","61","heating","fhk61","A5-10-06","40-30-0D-87","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FHK61-230V_UC_30100045-3_dt.pdf"],
    ["FHK61U-230V","61","heating","fhk61","A5-10-06","40-30-0D-87","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FHK61U-230V_30100050-2_dt.pdf"],
    ["FHK61SSR-230V","61","heating","fhk61","A5-10-06","40-30-0D-87",downloads],
    ["FSR61-230V","61","relay","generic61","A5-38-08","E0-40-0D-80",downloads],
    ["FSR61NP-230V","61","relay","fsr61np","A5-38-08","E0-40-0D-80","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FSR61NP-230V_30100030-12_dt.pdf"],
    ["FSR61G-230V","61","relay","generic61","A5-38-08","E0-40-0D-80",downloads],
    ["FSR61/8-24V UC","61","relay","generic61","A5-38-08","E0-40-0D-80",downloads],
    ["FUD61NP-230V","61","dimmer","generic61","A5-38-08","E0-40-0D-80",downloads],
    ["FUD61NPN-230V","61","dimmer","generic61","A5-38-08","E0-40-0D-80",downloads],
    ["FLC61NP-230V","61","relay","generic61","A5-38-08","E0-40-0D-80",downloads],
    ["FSB61-230V","61","cover","fsb61","H5-3F-7F","FF-F8-0D-80","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FSB61-230V_30200432-2_dt.pdf"],
    ["FSB61NP-230V","61","cover","generic61","H5-3F-7F","FF-F8-0D-80",downloads],
    ["FD62NP-230V","62","dimmer","fd62","A5-38-08","E0-40-0D-80","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FD62NP-230V_30100537-1_dt.pdf"],
    ["FD62NPN-230V","62","dimmer","fd62","A5-38-08","E0-40-0D-80","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FD62NPN-230V_30100535-2_dt.pdf"],
    ["FJ62NP-230V","62","cover","fj62","H5-3F-7F","FF-F8-0D-80","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FJ62NP-230V_30200535-2_dt.pdf"],
    ["FJ62/12-36V DC","62","cover","fj62","H5-3F-7F","FF-F8-0D-80",downloads],
    ["FR62-230V","62","relay","generic62","A5-38-08","E0-40-0D-80",downloads],
    ["FR62NP-230V","62","relay","generic62","A5-38-08","E0-40-0D-80","https://www.eltako.com/fileadmin/downloads/de/_bedienung/FR62NP-230V_30100543-2_dt.pdf"],
    ["FL62-230V","62","relay","generic62","A5-38-08","E0-40-0D-80",downloads],
    ["FL62NP-230V","62","relay","generic62","A5-38-08","E0-40-0D-80",downloads]
  ];
  const catalog = rows.map(row=>Object.freeze({
    model:row[0],series:row[1],kind:row[2],guide:row[3],eep:row[4],telegram:row[5],manual:row[6],
    detailed: !row[3].startsWith("generic") && row[6] !== downloads
  }));
  const types = {
    de:{heating:"Heizung",relay:"Schaltaktor",dimmer:"Dimmer",cover:"Rollladen / Jalousie"},
    en:{heating:"Heating",relay:"Relay",dimmer:"Dimmer",cover:"Blind / shutter"}
  };
  function normalize(value) {
    return String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  }
  function findModel(query) {
    const q = normalize(query);
    if (!q) return null;
    return catalog.find(x=>normalize(x.model)===q) ||
      catalog.find(x=>normalize(x.model).startsWith(q)) ||
      catalog.find(x=>q.startsWith(normalize(x.model))) || null;
  }
  function stepsFor(item, role="controller",lang="de") {
    const en=lang==="en";
    const mode=role==="mode" && item?.kind==="heating";
    const ha=en
      ? 'In Home Assistant open the corresponding actuator/integration and select “Send teach-in telegram”, if available for this device. Verify the sender ID and gateway first. Do not mistake a sent telegram for successful teaching.'
      : 'In Home Assistant den betreffenden Aktor in der Integration öffnen und – sofern für dieses Modell vorhanden – „Einlerntelegramm senden“ drücken. Vorher Sender-ID und Gateway prüfen. Ein versendetes Telegramm allein bestätigt das Einlernen nicht.';
    const signal=en
      ? 'Check the confirmation at the physical actuator (LED or load/motor feedback). If there is no confirmation, treat teaching as unsuccessful.'
      : 'Die Bestätigung am physischen Aktor prüfen (LED beziehungsweise Lampen-/Motorquittierung). Ohne Quittierung nicht als erfolgreich eingelernt ansehen.';
    const finish=en
      ? 'Exit learning mode, restore the desired operating settings and test the actuator from Home Assistant.'
      : 'Einlernmodus verlassen, vorgesehene Betriebsstellung wiederherstellen und den Aktor anschließend aus Home Assistant testen.';
    const ensure=en
      ? 'Check the exact model and device revision. Keep other radio senders quiet during teaching. Never use CLR or erase the complete learning memory.'
      : 'Exakten Gerätetyp und Fertigungsstand prüfen. Während des Lernens andere Funksender ruhig halten. Nicht auf CLR stellen und keinen Lernspeicher löschen.';
    let steps=[ensure];
    let note="";
    if (!item) {
      steps.push(en
        ? 'Put the physical actuator into its documented teaching mode. The correct switch position or tapping sequence depends on the model.'
        : 'Aktor gemäß seiner genauen Herstelleranleitung in Lernbereitschaft versetzen. Drehschalterstellung beziehungsweise Tippfolge sind geräteabhängig.');
    } else if (item.guide==="fhk61") {
      steps.push(mode
        ? (en
          ? 'For a fourfold operating-mode sender, set the lower rotary switch to right stop 4.5.'
          : 'Für den Vierfach-Betriebsartensender den unteren Drehschalter auf Rechtsanschlag 4,5 stellen.')
        : (en
          ? 'For the A5-10-06 temperature-controller sender, select the temperature-controller teach-in position from this exact actuator manual. The 4.5 position is reserved here for the operating-mode sender.'
          : 'Für A5-10-06-Temperaturregler die zum jeweiligen Aktor passende Einlernposition gemäß Anleitung wählen. Die Stellung 4,5 ist hier dem Betriebsartensender vorbehalten.'));
      steps.push(en
        ? 'Turn the upper rotary switch to LRN. The LED flashes slowly.'
        : 'Oberen Drehschalter auf LRN stellen. Die LED blinkt ruhig.');
      if(mode) {
        steps.push(en
          ? 'In Home Assistant press “Send teach-in telegram” for the assigned operating-mode RPS sender, if the integration provides this function. RPS data codes: 0x70 Home, 0x50 Sleep, 0x30 Eco, 0x10 Off/frost protection. This is NOT the A5-10-06 temperature-controller telegram.'
          : 'In Home Assistant – sofern für RPS-Betriebsarten angeboten – bei der zugeordneten Betriebsarten-Sender-ID „Einlerntelegramm senden“ drücken. RPS-Daten: 0x70 Normal, 0x50 Nacht, 0x30 Eco, 0x10 Aus/Frostschutz. Das ist NICHT das A5-10-06-Temperaturreglertelegramm.');
      } else {
        steps.push(en
          ? 'For an A5-10-06 temperature controller, press “Send teach-in telegram” in Home Assistant, if available. EEDTOY records 40-30-0D-87 as the temperature-controller teach-in payload.'
          : 'Für den A5-10-06-Temperaturregler in Home Assistant – sofern verfügbar – „Einlerntelegramm senden“ drücken. EEDTOY führt 40-30-0D-87 als Einlerntelegramm des Temperaturreglers.');
      }
      steps.push(en?'The actuator LED should go out when the sender is learned.':'Nach erfolgreichem Einlernen muss die LED am Aktor erlöschen.');
      note=en
        ? 'On FHK61SSR, direct PWM (A5-38-08) is a separate actuator mode; do not combine it with A5-10-06 temperature control.'
        : 'Beim FHK61SSR ist Direkt-PWM (A5-38-08) eine eigenständige Aktor-Betriebsart; nicht mit der A5-10-06-Temperaturregelung vermischen.';
    } else if (item.guide==="fsr61np") {
      steps.push(en
        ? 'For a controller teach-in, verify the selected function on the lower rotary switch. The manual states no special teaching position is required for the controller.'
        : 'Für das Einlernen eines Controllers die gewünschte Zuordnung prüfen. Laut Anleitung ist für Controller keine bestimmte Stellung des unteren Drehschalters erforderlich.');
      steps.push(en?'Turn the upper rotary switch to LRN; the LED flashes slowly.':'Oberen Drehschalter auf LRN drehen; die LED blinkt ruhig.');
      steps.push(ha);
      steps.push(en?'The actuator LED should go out after learning.':'Nach erfolgreichem Einlernen erlischt die Aktor-LED.');
    } else if (item.guide==="fsb61") {
      steps.push(en
        ? 'For the documented GFVS/controller teach-in FF-F8-0D-80, the manual requires no special lower rotary position.'
        : 'Für das in der Anleitung dokumentierte GFVS-/Controller-Lerntelegramm FF-F8-0D-80 ist keine besondere Stellung des unteren Drehschalters erforderlich.');
      steps.push(en?'Set the upper rotary switch to LRN; the LED flashes slowly.':'Oberen Drehschalter auf LRN stellen; die LED blinkt ruhig.');
      steps.push(ha);
      steps.push(en?'The LED should go out when learning succeeds.':'Bei erfolgreichem Lernen erlischt die LED.');
    } else if(item.guide==="fd62" || item.guide==="fj62") {
      steps.push(en
        ? 'There is no LRN rotary switch. If teaching is locked, unlock it with an already learned pushbutton or the local input: 4 short taps followed by one long tap (>2 seconds). Check the confirmation on the light/motor.'
        : 'Kein LRN-Drehschalter vorhanden! Falls der Lernmodus gesperrt ist: mit einem bereits eingelernten Taster oder dem örtlichen Eingang 4-mal kurz und anschließend 1-mal lang (>2 Sekunden) tippen. Quittierung an Lampe beziehungsweise Motor kontrollieren.');
      steps.push(en
        ? 'The type-specific tap sequence depends on the desired pushbutton function (e.g. universal 3 short, directional 4 short); a controller teach-in uses its own documented telegram instead.'
        : 'Die Tippfolge zur Tasterfunktion richtet sich nach der gewünschten Rolle (z. B. Universal 3-mal kurz, Richtung 4-mal kurz). Ein Controller wird dagegen mit seinem dokumentierten Controller-Lerntelegramm eingelernt.');
      steps.push(ha);
      steps.push(en
        ? (item.guide==="fj62"?'The motor acknowledges the teaching operation with a short movement.':'The lamp acknowledges the teach-in with a short on/off sequence.')
        : (item.guide==="fj62"?'Die Rollladensteuerung quittiert das Einlernen durch eine kurze Bewegung.':'Der Dimmer quittiert den Einlernvorgang durch kurzes Ein-/Ausschalten der Lampe.'));
      note=en
        ? '62-series tapping sequences vary by actuator and function; never transfer them from a different model.'
        : 'Tippsequenzen der Serie 62 unterscheiden sich nach Aktor und Funktion; nicht pauschal von anderen Modellen übernehmen.';
    } else if (item.guide==="generic62") {
      steps.push(en
        ? 'Series 62 generally uses tapping sequences instead of an LRN rotary switch. Use the exact device manual to enter teaching mode; do not assume 4-short/1-long for every revision.'
        : 'Baureihe 62 verwendet häufig Tippsequenzen statt LRN-Drehschaltern. Lernmodus exakt nach der Geräteanleitung aktivieren; 4-mal kurz + 1-mal lang gilt nicht ungeprüft für jede Geräteversion.');
      steps.push(ha);
      note=en?'Exact tapping sequence not yet verified for this model.':'Konkrete Tippsequenz für dieses Modell noch nicht verifiziert.';
    } else {
      steps.push(en
        ? 'Check the device manual and select the appropriate lower rotary function if applicable. Set the documented learning switch to LRN, only if your device actually has one.'
        : 'Die passende Einlernfunktion gemäß Anleitung wählen. Nur wenn das Gerät einen entsprechenden Drehschalter besitzt, diesen wie dokumentiert auf LRN stellen.');
      steps.push(ha);
      note=en?'Exact rotary settings not verified for this model.':'Konkrete Drehschalterstellung für dieses Modell noch nicht verifiziert.';
    }
    if (!steps.includes(ha) && item?.guide==="fhk61") {
      // Both RPS and A5-10-06 HA actions are already described above.
    }
    steps.push(signal);
    steps.push(finish);
    return {steps,note,manual:item?.manual||downloads,mode:mode};
  }
  function isOfficialManualLink(url) {
    try {
      const x=new URL(url);
      return x.protocol==="https:" && ["eltako.com","www.eltako.com"].includes(x.hostname);
    } catch (_) {return false;}
  }
  return Object.freeze({catalog,downloads,types,normalize,findModel,stepsFor,isOfficialManualLink});
});
