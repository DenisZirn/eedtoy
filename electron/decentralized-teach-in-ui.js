"use strict";
(function () {
  const guide = window.EEDTOY_LEARN_GUIDE;
  if (!guide) throw new Error("EEDTOY teaching guide could not be loaded");
  const byId = id => document.getElementById(id);
  const url = new URL(window.location.href);
  const locale = url.searchParams.get("lang") === "en" ? "en" : "de";
  const en = locale === "en";
  document.documentElement.lang = locale;
  document.title = en ? "EEDTOY – Teach in decentralized actuators" : "EEDTOY – Dezentrale Aktoren einlernen";
  const tr = (de, english) => en ? english : de;
  byId("pageTitle").textContent = tr("Dezentrale Aktoren einlernen","Teach in decentralized actuators");
  byId("pageSubtitle").textContent = tr(
    "Eigene EEDTOY-Schritt-für-Schritt-Hilfe · Baureihe 61/62 · 72 nur nach Geräteprüfung",
    "EEDTOY step-by-step guide · Series 61/62 · verify exact models of Series 72");
  byId("searchLabel").textContent = tr("Aktor suchen","Find an actuator");
  byId("search").placeholder = tr("z. B. FHK61, FJ62, FSR61","e.g. FHK61, FJ62, FSR61");
  byId("stepsHeading").textContent = tr("Vorgehen am Aktor und in Home Assistant","At the actuator and in Home Assistant");
  byId("roleLabel").textContent = tr("Einzulernende Senderrolle","Sender role to teach");
  const roleOptions = byId("role").options;
  roleOptions[0].textContent = tr("Temperaturregler (A5-10-06)","Temperature controller (A5-10-06)");
  roleOptions[1].textContent = tr("Betriebsartentaster (RPS)","Operating-mode pushbutton (RPS)");
  byId("footer").textContent = tr(
    "Nur eine Einlernhilfe: EEDTOY sendet hier selbst keine Telegramme. Eine erfolgreiche Übertragung ist keine Einlernbestätigung. Den Lernerfolg ausschließlich anhand der Aktor-LED beziehungsweise der tatsächlichen Quittierung prüfen. Hinweise zu Elektrofachkraft und Netzspannung beachten.",
    "Guide only: EEDTOY does not transmit telegrams here. Successful transmission is not a teach-in confirmation. Verify learning at the actuator by LED or actual load/motor acknowledgement. Observe electrical safety instructions.");
  byId("manual").textContent = tr("Offizielle ELTAKO-Anleitung öffnen","Open official ELTAKO manual");
  const params = { search: url.searchParams.get("model") || "", series: "all", selected: null };
  const matched = guide.findModel(params.search);
  params.selected = matched?.model || guide.catalog[0].model;
  byId("search").value = params.search;

  function updateFilters() {
    document.querySelectorAll("[data-series]").forEach(button => {
      const selected = button.dataset.series === params.series;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function addEmptyModel(text) {
    const panel = document.createElement("p");
    panel.className = "empty";
    panel.textContent = text;
    byId("models").appendChild(panel);
  }

  function listModels() {
    updateFilters();
    const area = byId("models");
    area.replaceChildren();
    const q = guide.normalize(params.search);
    const available = guide.catalog.filter(item =>
      (params.series === "all" || item.series === params.series) &&
      (!q || guide.normalize(item.model).includes(q))
    );
    if (!available.length) {
      addEmptyModel(params.series === "72" ?
        tr("Für die Baureihe 72 ist noch kein bestätigtes Einzelmodell hinterlegt. Gib die genaue Gerätebezeichnung ein und prüfe die ELTAKO-Anleitung.",
          "No verified Series 72 model is listed yet. Enter the exact model and check its ELTAKO manual.") :
        tr("Kein passendes Modell gefunden. Die allgemeinen Schritte werden angezeigt; genaue Einlernpositionen bitte anhand der Herstelleranleitung prüfen.",
          "No matching model found. General steps shown; verify exact teaching positions in the manufacturer's instructions."));
    }
    for (const item of available) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "model"+(item.model === params.selected ? " selected" : "");
      btn.setAttribute("aria-pressed", String(item.model === params.selected));
      const name = document.createElement("strong");
      name.textContent = item.model;
      btn.appendChild(name);
      const hint = document.createElement("small");
      hint.textContent = guide.types[locale][item.kind] + (item.detailed ?
        tr(" · Gerätedetails", " · model guidance") :
        tr(" · Anleitung prüfen", " · verify manual"));
      btn.appendChild(hint);
      btn.addEventListener("click", () => {
        params.selected = item.model;
        params.search = "";
        byId("search").value = "";
        byId("role").value = "controller";
        listModels();
        updateDetails();
      });
      area.appendChild(btn);
    }
  }

  function getSelected() {
    const exact=guide.catalog.find(item=>item.model === params.selected);
    const q=guide.normalize(params.search);
    if (params.search && (!exact || !guide.normalize(exact.model).includes(q))) return guide.findModel(params.search);
    if (params.series === "72") return null;
    if (params.series !== "all" && exact?.series !== params.series) return null;
    return exact || null;
  }

  function updateDetails() {
    const model = getSelected();
    const requested = String(params.search || "").trim();
    const unknown = !model;
    const selectedText = model?.model || requested || tr("Nicht hinterlegtes Modell / Baureihe 72", "Unlisted model / Series 72");
    byId("modelTitle").textContent = selectedText;
    byId("kind").textContent = model ? guide.types[locale][model.kind] + " · " + model.series :
      tr("Modellabhängige Hinweise","Model-specific guidance");
    const meta=byId("meta");
    meta.replaceChildren();
    if (model) {
      for (const value of [tr("EnOcean-Profil: ","EnOcean profile: ") + model.eep,
        tr("EEDTOY-Controller-Lerntelegramm: ","EEDTOY controller learn payload: ") + model.telegram]) {
        const badge = document.createElement("span");
        badge.className = "pill";
        badge.textContent = value;
        meta.appendChild(badge);
      }
    }
    const roleWrap = byId("roleWrap");
    const heater = Boolean(model && model.kind === "heating");
    roleWrap.classList.toggle("hide", !heater);
    if(!heater) byId("role").value="controller";
    const role = byId("role").value;
    byId("caution").textContent=unknown
      ? tr("Für diese Gerätebezeichnung liegen noch keine gesicherten Einlerneinstellungen vor. Die folgenden Schritte sind nur die allgemeine Vorgehensweise; LRN-Positionen oder Tippsequenzen nicht von einem anderen Aktor übertragen.",
        "No verified teach-in positions are available for this model. Steps below are general only; never transfer LRN positions or tapping sequences from another actuator.")
      : tr("Vor Beginn Sender-ID, Gateway und Fertigungsstand kontrollieren. Bestehende Einträge nicht durch Löschen des gesamten Lernspeichers zurücksetzen. Die Anleitung gilt nur für die genannte Gerätevariante.",
        "Check sender ID, gateway and device revision first. Never erase all learned senders. Instructions apply only to the selected model variant.");
    const result = guide.stepsFor(model,role,locale);
    const steps = byId("steps");
    steps.replaceChildren();
    result.steps.forEach((step,index)=>{
      const li = document.createElement("li");
      const num = document.createElement("span");
      num.className="num";
      num.textContent=String(index+1);
      const text = document.createElement("div");
      text.className="step-text";
      text.textContent=step;
      if (/Home Assistant/.test(step)) {
        text.style.fontWeight="650";
        text.style.color="#165d81";
      }
      li.append(num,text);
      steps.appendChild(li);
    });
    byId("detailNote").classList.toggle("hide",!result.note);
    byId("detailNote").textContent=result.note || "";
    const external = model?.manual || guide.downloads;
    byId("manual").href=guide.isOfficialManualLink(external)?external:guide.downloads;
  }

  byId("search").addEventListener("input",e=>{
    params.search=e.target.value.trim();
    const result=guide.findModel(params.search);
    if(result && (params.series==="all"||result.series===params.series)) params.selected=result.model;
    else if(params.search) params.selected=null;
    listModels();
    updateDetails();
  });
  document.querySelectorAll("[data-series]").forEach(button=>button.addEventListener("click",()=>{
    params.series=button.dataset.series;
    params.search="";
    byId("search").value="";
    const next = guide.catalog.find(item=>params.series==="all"||item.series===params.series);
    params.selected=next?.model||null;
    byId("role").value="controller";
    listModels();
    updateDetails();
  }));
  byId("role").addEventListener("change",updateDetails);
  listModels();
  updateDetails();
})();
