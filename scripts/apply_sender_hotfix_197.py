"""Apply the narrowly scoped EEDTOY 1.0.97 sender allocation hotfix once."""
from pathlib import Path
import json

OLD = '''function nextFreeSenderOffset(deviceList) {
  const used = new Set();
  for (const device of deviceList || []) {
    for (const value of [device?.sender_id, device?.dev_id]) {
      const offset = senderOffsetFromId(value);
      if (Number.isInteger(offset) && offset > 0 && offset <= 0x7F) used.add(offset);
    }
  }
  for (let i = 1; i <= 0x7F; i++) {
    if (!used.has(i)) return i;
  }
  return 1;
}

function autoSenderIdForGateway(gw, deviceList) {
  const offset = nextFreeSenderOffset(deviceList);
  if (gw?.type === "fam14" || gw?.type === "fgw14usb") return busIdFromAddress(0xB000 + offset);
  if (gw?.base_id) return addToBaseId(gw.base_id, offset);
  return "";
}'''
NEW = '''function nextFreeSenderOffset(deviceList, gw) {
  // Compare complete addresses, not their last byte. For a FAM-USB base
  // ending in 0x80, sender ...81 occupies offset 1, not offset 129.
  const used = new Set();
  const reserve = (value) => {
    const id = normalizeId(value);
    if (id) used.add(id);
  };
  for (const device of deviceList || []) {
    reserve(device?.sender_id);
    reserve(device?.dev_id);
    // PCT14 stores bus sender IDs, but FAM-USB exports the corresponding
    // radio address. Reserve that effective address as well.
    if (isPct14ImportedDevice(device) && profileFor(device?.eep).needs_sender) {
      reserve(senderIdFromOffsetForGateway(gw, addressFromBusId(device.dev_id)));
    }
  }
  for (let offset = 1; offset <= 0x7F; offset++) {
    const candidate = normalizeId(senderIdFromOffsetForGateway(gw, offset));
    if (candidate && !used.has(candidate)) return offset;
  }
  // Never silently reuse offset 1 after exhausting the address range.
  return null;
}

function autoSenderIdForGateway(gw, deviceList) {
  const normalizedGateway = { ...gw, base_id: normalizeId(gw?.base_id) };
  const offset = nextFreeSenderOffset(deviceList, normalizedGateway);
  return offset === null ? "" : senderIdFromOffsetForGateway(normalizedGateway, offset);
}'''
OLD_VALIDATE = '''      if (!f.sender_id.trim()) e.sender_id = t("validation.senderBaseIdMissing");'''
NEW_VALIDATE = '''      if (!f.sender_id.trim()) {
        const hasSenderBase = ["fam14", "fgw14usb"].includes(gateway.type) || Boolean(normalizeId(gateway.base_id));
        e.sender_id = t(hasSenderBase ? "validation.senderIdsExhausted" : "validation.senderBaseIdMissing");
      }'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Refusing {label}: expected one exact match, got {count}")
    return text.replace(old, new, 1)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    app_path = root / "src/App.jsx"
    app = app_path.read_text(encoding="utf-8")
    assert 'const APP_VERSION = "1.0.97";' in app
    app = replace_once(app, OLD, NEW, "sender allocation")
    app = replace_once(app, OLD_VALIDATE, NEW_VALIDATE, "exhaustion validation")
    app_path.write_text(app, encoding="utf-8", newline="\n")

    translations = root / "src/i18n.js"
    lines = translations.read_text(encoding="utf-8").splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if "'validation.senderBaseIdMissing':" in line]
    if len(matches) != 2:
        raise SystemExit("Expected German and English sender validation messages")
    messages = (
        "Keine freie Sender-ID im Adressbereich dieses Gateways vorhanden",
        "No free sender ID is available in this gateway's address range",
    )
    for index, message in reversed(list(zip(matches, messages))):
        lines.insert(index + 1, "    'validation.senderIdsExhausted': " + json.dumps(message, ensure_ascii=False) + ",\n")
    translations.write_text("".join(lines), encoding="utf-8", newline="\n")

    package_path = root / "package.json"
    package_text = package_path.read_text(encoding="utf-8")
    package = json.loads(package_text)
    assert package["version"] == "1.0.97"
    old_test = package["scripts"]["test"]
    new_test = old_test + " && node tests/sender_base_id_197_regression.js"
    package_text = replace_once(package_text, json.dumps(old_test), json.dumps(new_test), "test command")
    package_path.write_text(package_text, encoding="utf-8", newline="\n")
    lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
    assert lock["version"] == "1.0.97" and lock["packages"][""]["version"] == "1.0.97"

    notes_path = root / "RELEASE_NOTES.md"
    notes = notes_path.read_text(encoding="utf-8")
    hotfix = '''## Hotfix vom 01.10.2026: Sender-ID-Vergabe (Windows)

Die Versionsnummer bleibt **1.0.97**. Der Windows-Installer wurde neu gebaut.

- Automatische Sender-ID-Vergabe für FAM-USB mit Base-ID-Endung `80` korrigiert; Base-IDs auf `00` funktionieren weiterhin.
- Bereits belegte vollständige Senderadressen werden bei der Vergabe übersprungen, einschließlich der aus PCT14 importierten Aktoradressen.
- Bei erschöpftem Vergabebereich wird keine doppelte Sender-ID erzeugt, sondern eine Fehlermeldung angezeigt.
- Bestehende gespeicherte Sender-IDs werden nicht automatisch umnummeriert. Bereits entstandene Doppelbelegungen müssen gesondert geprüft werden.
- Gerätedatenbank, Gateway-Erkennung und Senderprogrammierung wurden nicht geändert.

**Installation:** `EEDTOY-Setup-1.0.97.exe` erneut herunterladen und installieren. Eine bereits installierte 1.0.97 enthält den Hotfix nicht automatisch.

**macOS:** Die vorhandenen DMGs wurden mit diesem Windows-Hotfix nicht neu gebaut und enthalten diese Korrektur noch nicht.

---

'''
    notes_path.write_text(hotfix + notes, encoding="utf-8", newline="\n")
    print("Applied sender allocation hotfix; application version remains 1.0.97")


if __name__ == "__main__":
    main()
