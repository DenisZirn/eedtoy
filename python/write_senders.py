#!/usr/bin/env python3
"""
Write Home Assistant sender IDs into ELTAKO Series-14 bus actuators.

This mirrors the relevant write path of Philipp Grimm's EnOcean Device Manager:
connect to the FAM14/FGW14 bus, lock it, address only the devices referenced by
the PCT14 sender map and program the requested controller sender IDs.
"""
import argparse
import asyncio
import json
import sys
import traceback
from typing import Any, Dict, List, Optional, Set


def _configure_utf8_streams() -> None:
    """Keep umlauts intact in Electron on Windows and macOS."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


_configure_utf8_streams()


def jprint(obj: Dict[str, Any]) -> None:
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def log(*parts: Any) -> None:
    print("[python-write-senders]", *parts, file=sys.stderr, flush=True)


def norm_id(value: str) -> str:
    raw = str(value or "").strip().upper().replace(":", "-").replace(" ", "-")
    parts = [p for p in raw.split("-") if p]
    if len(parts) == 4 and all(len(p) <= 2 for p in parts):
        return "-".join(p.zfill(2) for p in parts)
    clean = raw.replace("-", "")
    if len(clean) == 8:
        return "-".join(clean[i:i+2] for i in range(0, 8, 2))
    return raw


def _id_to_int(value: str) -> Optional[int]:
    clean = norm_id(value).replace("-", "")
    if len(clean) != 8:
        return None
    try:
        return int(clean, 16)
    except ValueError:
        return None


def load_sender_map(path: str) -> Dict[str, List[Dict[str, Any]]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    result: Dict[str, List[Dict[str, Any]]] = {}
    seen: Set[tuple[str, str, str]] = set()
    for item in data.get("entries", data if isinstance(data, list) else []):
        device_id = norm_id(item.get("device_id") or item.get("id") or "")
        sender_id = norm_id(item.get("sender_id") or "")
        sender_eep = str(item.get("sender_eep") or item.get("eep") or "").strip().upper()
        name = str(item.get("name") or "")
        if not device_id or not sender_id or not sender_eep:
            continue
        key = (device_id, sender_id, sender_eep)
        if key in seen:
            continue
        seen.add(key)
        result.setdefault(device_id, []).append({
            "sender": {"id": sender_id, "eep": sender_eep},
            "name": name,
            "device_eep": str(item.get("device_eep") or item.get("device_eep_out") or "").strip().upper(),
            "device_type": str(item.get("device_type") or "").strip(),
            "platform": str(item.get("platform") or "").strip(),
            "expected_bus_base_id": norm_id(item.get("expected_bus_base_id") or ""),
            "source_gateway_type": str(item.get("source_gateway_type") or "").strip(),
            "source_gateway_base_id": norm_id(item.get("source_gateway_base_id") or ""),
            "f2l14_mode": str(item.get("f2l14_mode") or "exclusive").strip().lower(),
            "heating_control_mode": str(item.get("heating_control_mode") or "ha_external").strip().lower(),
        })
    return result


def target_bus_addresses(fam14_base_id_int: int, sender_map: Dict[str, Any]) -> List[int]:
    """Return only the Series-14 addresses referenced by the sender map.

    PCT14 entries use the FAM14 base ID plus the physical bus address/channel
    offset. Multi-channel devices are contiguous; after discovering their first
    address, enumerate_target_devices skips the remaining covered addresses.
    """
    result: Set[int] = set()
    for device_id in sender_map:
        value = _id_to_int(device_id)
        if value is None:
            continue
        offset = value - fam14_base_id_int
        if 1 <= offset <= 254:
            result.add(offset)
        else:
            log("ignore sender-map device outside FAM14 range", device_id, "offset", offset)
    return sorted(result)


async def enumerate_target_devices(bus: Any, target_addresses: List[int]):
    """Discover only devices needed for the requested sender IDs."""
    from eltakobus.device import create_busobject

    pending: Set[int] = set(target_addresses)
    while pending:
        address = min(pending)
        pending.discard(address)
        try:
            bus_object = await create_busobject(bus=bus, id=address)
            if bus_object is None:
                log("No device response at target address", address)
                continue
            start = int(getattr(bus_object, "address", address) or address)
            size = max(1, int(getattr(bus_object, "size", 1) or 1))
            for covered in range(start, min(255, start + size)):
                pending.discard(covered)
            log("target device", type(bus_object).__name__, "address", start, "size", size)
            yield bus_object
        except TimeoutError:
            log("Timeout detecting target device at address", address)
        except Exception as e:
            log("Cannot detect target device at address", address, repr(e))


def _sender_bytes_from_id(sender_id: str) -> bytes:
    clean = norm_id(sender_id).replace("-", "")
    if len(clean) != 8:
        raise ValueError(f"ungültige Sender-ID: {sender_id}")
    return bytes(int(clean[i:i+2], 16) for i in range(0, 8, 2))


def _clean_label(value: Any) -> str:
    text = str(value or "").strip()
    if not text or text.lower() in {"none", "null", "undefined"}:
        return ""
    return text


def _entry_device_type(entry: Dict[str, Any]) -> str:
    candidates = [entry.get("device_type"), entry.get("model"), entry.get("eltako")]
    name = _clean_label(entry.get("name"))
    if name:
        candidates.append(name.split()[0])
    for candidate in candidates:
        label = _clean_label(candidate)
        if label and label != "BusObject":
            return label
    return "Gerät"


def _device_display_name(entry: Dict[str, Any], fallback_type: str, device_ext_id: str) -> str:
    device_type = _entry_device_type(entry)
    name = _clean_label(entry.get("name"))
    if name and name != device_type and name != device_ext_id:
        return f"{name} ({device_type} {device_ext_id})"
    if device_type and device_type != "Gerät":
        return f"{device_type} {device_ext_id}"
    fallback = _clean_label(fallback_type)
    if fallback and fallback != "BusObject":
        return f"{fallback} {device_ext_id}"
    return f"Unbekanntes Gerät {device_ext_id}"


async def _find_or_write_free_line(dev: Any, expected_line: bytes, start_line: int) -> Optional[bool]:
    memory_size = int(getattr(dev, "memory_size", 0) or 0)
    if memory_size <= start_line or not hasattr(dev, "read_mem_line") or not hasattr(dev, "write_mem_line"):
        return None

    first_empty = None
    for memory_id in range(start_line, memory_size):
        line = await dev.read_mem_line(memory_id)
        if line == expected_line:
            return False
        if not any(line) and first_empty is None:
            first_empty = memory_id

    if first_empty is None:
        raise RuntimeError("Kein freier Speicherplatz zum Einlernen des Controller-Senders gefunden")
    await _write_mem_line_with_readback(dev, first_empty, expected_line)
    return True


async def _read_back_mem_line(dev: Any, row: int) -> Optional[bytes]:
    """Force one row to be read from the actuator instead of its local cache."""
    memory = getattr(dev, "memory", None)
    previous = None
    can_invalidate = isinstance(memory, list) and 0 <= row < len(memory)
    if can_invalidate:
        previous = memory[row]
        memory[row] = None
    try:
        actual = await dev.read_mem_line(row)
    except Exception:
        if can_invalidate and memory[row] is None:
            memory[row] = previous
        return None
    if actual is None and can_invalidate:
        memory[row] = previous
        return None
    return actual


async def _write_mem_line_with_readback(dev: Any, row: int, value: bytes) -> None:
    """Accept a write whose acknowledgement was lost when read-back confirms it."""
    try:
        await dev.write_mem_line(row, value)
    except Exception:
        await asyncio.sleep(0.08)
        if await _read_back_mem_line(dev, row) == value:
            return
        raise


def _is_real_frgbw14(dev: Any) -> bool:
    """Recognize the physical FRGBW14 (PCT14 model 04-A1, six bus addresses).

    The Eltako bus library exposes this model as a generic BusObject.
    Checking only a YAML name/EEP is insufficient and could otherwise route
    the sender into another actuator's function group.
    """
    response = getattr(dev, "discovery_response", None)
    model = bytes(getattr(response, "model", b"") or b"")
    size = int(getattr(dev, "size", 0) or 0)
    return model[:2] == bytes((0x04, 0xA1)) and size == 6


async def _ensure_programmed_controller_profile(dev: Any, sender_id: str, channel: int = 0) -> Optional[bool]:
    """Write the FRGBW14 controller exclusively to PCT14 function group 3.

    Confirmed FRGBW14 PCT14 memory layout (04-A1, offset first block 8):
      entry 1 / function group 1: memory row 8
      entries 2..4 / group 2:    memory rows 9..11
      entry 5+ / function group 3: memory rows 12..123
    The PCT14 controller entry uses button 0, function 81, channel
    bitmap 00001111 (all RGBW channels), value 0.

    Older EEDTOY builds sometimes left the same sender in group 1.
    Migrate ONLY that same sender ID, never erase unrelated group-1 IDs.
    Require a fresh device read-back after every write; a bus ACK alone
    is not sufficient evidence of successful programming.
    """
    sender = _sender_bytes_from_id(sender_id)
    expected_line = sender + bytes((0, 81, 0x0F, 0))
    memory_size = int(getattr(dev, "memory_size", 0) or 0)
    group3_end = min(memory_size, 124)  # 116 PCT14 ID entries, starting at row 8
    if group3_end <= 12 or not hasattr(dev, "read_mem_line") or not hasattr(dev, "write_mem_line"):
        raise RuntimeError("FRGBW14: kein Zugriff auf die PCT14-ID-Tabelle (Funktionsgruppe 3)")

    async def read_verified(row: int) -> bytes:
        actual = await _read_back_mem_line(dev, row)
        if not isinstance(actual, (bytes, bytearray)) or len(actual) != 8:
            raise TimeoutError(
                f"FRGBW14: Speicherzeile {row} konnte nicht sicher aus dem Aktor gelesen werden"
            )
        return bytes(actual)

    async def write_verified(row: int, value: bytes) -> None:
        await _write_mem_line_with_readback(dev, row, value)
        if await read_verified(row) != value:
            raise RuntimeError(
                f"FRGBW14: Schreiben in Speicherzeile {row} nicht bestätigt; "
                "Aktorinhalt weicht vom Sollwert ab"
            )

    # A stale BusObject cache must never hide a wrong group-1 assignment.
    old_group1 = await read_verified(8)

    exact_row = None
    sender_row = None
    free_row = None
    for row in range(12, group3_end):
        line = await dev.read_mem_line(row)
        if not isinstance(line, (bytes, bytearray)) or len(line) != 8:
            raise TimeoutError(f"FRGBW14: ungültige Speicherantwort für Zeile {row}")
        line = bytes(line)
        if line == expected_line:
            # Validate against the hardware, not just the library cache.
            line = await read_verified(row)
            if line == expected_line:
                exact_row = row
                break
        if line[:4] == sender and any(line) and sender_row is None:
            sender_row = row
        if not any(line) and free_row is None:
            free_row = row

    changed = False
    target_row = exact_row
    if target_row is None:
        target_row = sender_row if sender_row is not None else free_row
        if target_row is None:
            raise RuntimeError("FRGBW14: Funktionsgruppe 3 hat keinen freien ID-Eintrag")

        before = await read_verified(target_row)
        if before == expected_line:
            pass
        elif not any(before) or before[:4] == sender:
            await write_verified(target_row, expected_line)
            changed = True
        else:
            raise RuntimeError(
                f"FRGBW14: Speicherzeile {target_row} wurde zwischen Lesen und Schreiben "
                "durch einen anderen Eintrag belegt; es wurde nichts überschrieben"
            )

    # Only after successful group-3 programming may a legacy group-1 entry
    # for the very same sender be removed. Ignore its other bytes: old
    # builds did not all use the same key/function/channel encoding.
    if old_group1[:4] == sender:
        current_group1 = await read_verified(8)
        if current_group1[:4] == sender:
            await write_verified(8, bytes(8))
            changed = True

    # Final hardware verification prevents false "written" or "exists" output.
    if await read_verified(target_row) != expected_line:
        raise RuntimeError("FRGBW14: Controller-ID ist nicht in Funktionsgruppe 3 gespeichert")
    if (await read_verified(8))[:4] == sender:
        raise RuntimeError("FRGBW14: fehlerhafter Eintrag in Funktionsgruppe 1 ist noch vorhanden")
    dev._eedtoy_frgbw14_row = target_row
    log("FRGBW14 verified", "bus_address", getattr(dev, "address", "?"),
        "sender", norm_id(sender_id), "function_group", 3,
        "pct14_entry", target_row - 7, "memory_row", target_row,
        "function", 81, "channel_mask", "00001111")
    return changed


async def _ensure_programmed_fsr14ssr(dev: Any, sender_id: str, channel: int = 0) -> Optional[bool]:
    """Use the standard FSR14 function-group-2 layout for FSR14SSR."""
    sender = _sender_bytes_from_id(sender_id)
    if channel < 0 or channel > 7:
        raise ValueError(f"Ungültiger FSR14SSR-Kanal: {channel + 1}")
    expected_line = sender + bytes((0, 51, 1 << channel, 0))
    return await _find_or_write_free_line(dev, expected_line, 12)


async def _ensure_programmed_fms14(dev: Any, sender_id: str, channel: int = 0) -> Optional[bool]:
    """Program one FMS14 channel as PCT14 ``State from Controller``.

    FMS14 is not represented by a dedicated eltakobus device class. Its
    programmable table starts at memory line 8. PCT14 key function 51
    (0x33) is ``State from Controller``; key 0 selects the controller
    telegram instead of a physical RPS rocker. Earlier v1.0.97 builds wrote
    key 6/function 3, so replace that exact legacy row in place when found.
    """
    sender = _sender_bytes_from_id(sender_id)
    if channel < 0 or channel > 1:
        raise ValueError(f"Ungültiger FMS14-Kanal: {channel + 1}")
    channel_mask = 1 << channel
    expected_line = sender + bytes((0, 51, channel_mask, 0))
    legacy_line = sender + bytes((6, 3, channel_mask, 0))
    memory_size = int(getattr(dev, "memory_size", 0) or 0)
    if memory_size <= 8 or not hasattr(dev, "read_mem_line") or not hasattr(dev, "write_mem_line"):
        return None

    first_empty = None
    legacy_memory_id = None
    for memory_id in range(8, memory_size):
        line = await dev.read_mem_line(memory_id)
        if line == expected_line:
            return False
        if line == legacy_line and legacy_memory_id is None:
            legacy_memory_id = memory_id
        if not any(line) and first_empty is None:
            first_empty = memory_id

    target_memory_id = legacy_memory_id if legacy_memory_id is not None else first_empty
    if target_memory_id is None:
        raise RuntimeError("Kein freier Speicherplatz zum Einlernen des FMS14-Controller-Senders gefunden")
    await _write_mem_line_with_readback(dev, target_memory_id, expected_line)
    return True


async def _ensure_programmed_f2l14(dev: Any, sender_id: str, mode: str = "exclusive") -> Optional[bool]:
    """Program the F2L14 virtual double rocker for the selected stage mode.

    A real PCT14 export from F2L14 manual v4 / software 65 confirms the
    eight-byte entry layout: sender + button 7 + function 56 + channel mask 3
    PCT14 references confirm value 0 for rotary position 1 (exclusive) and
    value 1 for position 2 (additive). Entry 1 maps to memory row 8.
    """
    sender = _sender_bytes_from_id(sender_id)
    normalized_mode = str(mode or "exclusive").strip().lower()
    if normalized_mode not in {"exclusive", "additive"}:
        raise ValueError(f"Ungültige F2L14-Betriebsart: {mode}")
    assignment = sender + bytes((7, 56, 3))
    expected_line = assignment + bytes((1 if normalized_mode == "additive" else 0,))
    memory_size = int(getattr(dev, "memory_size", 0) or 0)
    if memory_size <= 8 or not hasattr(dev, "read_mem_line") or not hasattr(dev, "write_mem_line"):
        return None

    first_empty = None
    matching_rows = []
    exact_rows = []
    for memory_id in range(8, memory_size):
        line = await dev.read_mem_line(memory_id)
        if line == expected_line:
            exact_rows.append(memory_id)
        if line[:7] == assignment:
            matching_rows.append(memory_id)
        if not any(line) and first_empty is None:
            first_empty = memory_id

    # One HA sender must occupy exactly one F2L14 entry.  A mode change only
    # changes the final PCT14 value byte, so replace the existing row in place
    # instead of consuming a second row.  Also repair duplicates written by
    # earlier test builds while leaving entries from physical pushbuttons alone.
    if matching_rows:
        target_row = exact_rows[0] if exact_rows else matching_rows[0]
        changed = False
        if not exact_rows:
            await _write_mem_line_with_readback(dev, target_row, expected_line)
            changed = True
        for duplicate_row in matching_rows:
            if duplicate_row == target_row:
                continue
            await _write_mem_line_with_readback(dev, duplicate_row, bytes(8))
            changed = True
        return changed

    if first_empty is None:
        raise RuntimeError("Kein freier Speicherplatz zum Einlernen des F2L14-Controller-Senders gefunden")
    await _write_mem_line_with_readback(dev, first_empty, expected_line)
    return True


def _heating_group_1_layout(device_type: str, size: int) -> tuple[int, int, int, tuple[int, ...]]:
    """Return channels, group-1 row, former group-3 row, expected model bytes.

    Physical PCT14 rows: FHK14 1-channel (8 / 10), FHK14 2-channel
    (8..9 / 12..13), F4HK14 (8..11 / 16..19),
    FAE14LPR / FAE14SSR (8..9 / 12..13).
    """
    name = str(device_type or "").upper()
    if size == 4 and ("F4HK14" in name or "FHK14" in name):
        # Some PCT14 imports or BusObjects label four-channel F4HK14 as FHK14.
        # Use physical size; discovery model 04-18 is checked by the caller.
        return 4, 8, 16, (0x18,)
    if "FHK14" in name and size == 1:
        return 1, 8, 10, (0x0F,)
    if "FHK14" in name and size == 2:
        return 2, 8, 12, (0x18,)
    if "FAE14LPR" in name and size == 2:
        return 2, 8, 12, (0x10,)
    if "FAE14SSR" in name and size == 2:
        return 2, 8, 12, (0x16,)
    raise ValueError(
        f"{device_type}: nicht unterstützte Geräte-/Kanalzuordnung ({size} Kanäle)"
    )


async def _ensure_programmed_fhk_controller(
    dev: Any,
    sender_id: str,
    channel: int,
    device_type: str,
    control_mode: str = "ha_external",
) -> bool:
    """Program the HA A5-10-06 sender according to the sensor source.

    ha_external: FG1 function 64 provides the HA room temperature and setpoint.
    learned_sensor: keep the real FG1 room sensor and add HA setpoint in FG3
    function 65. Only matching HA-sender legacy entries are ever removed.
    """
    count, group1_start, group3_start, model_codes = _heating_group_1_layout(
        device_type, int(getattr(dev, "size", 0) or 0)
    )
    if count == 4 and "F4HK14" not in str(device_type).upper():
        log("F4HK14 recognized despite legacy FHK14 label",
            "label", device_type, "address", getattr(dev, "address", "?"))
    if not isinstance(channel, int) or not 0 <= channel < count:
        raise ValueError(f"{device_type}: ungültiger Kanal {channel!r}")
    discovery = getattr(dev, "discovery_response", None)
    model = bytes(getattr(discovery, "model", b"") or b"")
    if len(model) >= 2 and (model[0] != 0x04 or model[1] not in model_codes):
        raise RuntimeError(
            f"{device_type}: physische Gerätekennung {model[:2].hex('-').upper()} "
            "passt nicht zum ausgewählten Aktortyp"
        )

    memory_size = int(getattr(dev, "memory_size", 0) or 0)
    if (memory_size < group3_start + count
            or not hasattr(dev, "read_mem_line") or not hasattr(dev, "write_mem_line")):
        raise RuntimeError(f"{device_type}: ID-Speicher nicht verfügbar")

    if control_mode not in {"ha_external", "learned_sensor"}:
        raise ValueError(f"{device_type}: unbekannte Temperaturregelungsart {control_mode!r}")

    sender = _sender_bytes_from_id(sender_id)
    mask = 1 << channel
    expected = sender + bytes((0, 64, mask, 0))
    former = sender + bytes((0, 65, mask, 0))
    target_row = group1_start + channel

    async def read_fresh(row: int) -> bytes:
        line = await _read_back_mem_line(dev, row)
        if not isinstance(line, (bytes, bytearray)) or len(line) != 8:
            raise TimeoutError(f"{device_type}: keine gültige Speicherantwort für Zeile {row}")
        return bytes(line)

    async def write_checked(row: int, value: bytes) -> None:
        if count <= 2 and "FHK14" in str(device_type).upper() and "F4HK14" not in str(device_type).upper():
            await _write_fhk_mem_line(dev, row, value)
        else:
            await _write_mem_line_with_readback(dev, row, value)
        if await read_fresh(row) != value:
            raise RuntimeError(
                f"{device_type}: Schreiben der Speicherzeile {row} nicht bestätigt"
            )

    if control_mode == "learned_sensor":
        # PCT14: A separate, already learned sensor in FG1 provides the
        # reference room temperature. HA may only contribute the GFVS
        # A5-10-06 target setpoint via FG3 function 65.
        current_sensor = await read_fresh(target_row)
        if not any(current_sensor):
            raise RuntimeError(
                f"{device_type} Kanal {channel + 1}: kein Temperatursensor "
                "in Funktionsgruppe 1 eingelernt. Zuerst den Sensor im Aktor "
                "einlernen; Funktionsgruppe 3 wurde nicht verändert."
            )
        if current_sensor[:4] == sender and current_sensor[5:] == bytes((64, mask, 0)):
            raise RuntimeError(
                f"{device_type} Kanal {channel + 1}: Funktionsgruppe 1 "
                "enthält noch die HA-Sender-ID mit Funktion 64. "
                "Zuerst einen separaten Temperatursensor in FG1 einlernen; "
                "kein Schreiben in FG3."
            )
        if current_sensor[4:] != bytes((0, 64, mask, 0)):
            raise RuntimeError(
                f"{device_type} Kanal {channel + 1}: Funktionsgruppe 1 "
                "enthält keine verifizierbare Funktion-64-Zuordnung für "
                "diesen Kanal; HA-Sollwert in FG3 wurde nicht geschrieben."
            )

        target_group3_row = group3_start + channel
        current_setpoint = await read_fresh(target_group3_row)
        if any(current_setpoint) and current_setpoint != former:
            raise RuntimeError(
                f"{device_type} Kanal {channel + 1}: Funktionsgruppe 3 "
                "ist durch einen anderen Sender oder eine andere Funktion "
                "belegt; kein Eintrag wurde überschrieben."
            )

        # Retire misplaced exact HA function-65 duplicates in old FHK14
        # writer layouts, but never alter any other sender.
        stale_rows = []
        if "FHK14" in str(device_type).upper() and "F4HK14" not in str(device_type).upper() and count == 1:
            for row in (12, 13):
                if row < memory_size and await read_fresh(row) == former:
                    stale_rows.append(row)

        changed = False
        if current_setpoint != former:
            await write_checked(target_group3_row, former)
            changed = True
        for row in stale_rows:
            if await read_fresh(row) != former:
                raise RuntimeError(f"{device_type}: Speicherzeile {row} zwischenzeitlich verändert")
            await write_checked(row, bytes(8))
            changed = True

        if await read_fresh(target_row) != current_sensor:
            raise RuntimeError(f"{device_type}: vorhandener Temperatursensor in FG1 wurde verändert")
        if await read_fresh(target_group3_row) != former:
            raise RuntimeError(f"{device_type}: FG3, Funktion 65 nicht bestätigt")
        log("Heating writer verified", device_type, "channel", channel + 1,
            "sender", norm_id(sender_id), "function_group", 3,
            "function", 65, "channel_mask", f"{mask:08b}", "memory_row", target_group3_row)
        return changed

    # HA provides both reference temperature and setpoint in FG1.
    # Validate everything before the first write.
    current = await read_fresh(target_row)
    if (any(current) and current != expected
            and not (current[:4] == sender and current[6] == mask)):
        # Writing a new HA room controller deliberately takes over the one
        # physical thermostat-controller slot of this exact channel. PCT14
        # Function 64 is the only replaceable legacy thermostat entry.
        # Never overwrite other functions or a different channel mask.
        if current[4:] != bytes((0, 64, mask, 0)):
            raise RuntimeError(
                f"{device_type} Kanal {channel + 1}: Funktionsgruppe 1 "
                "enthält eine fremde Funktion oder Kanalzuordnung; "
                "nicht überschrieben"
            )
        log("Heating FG1 takeover", device_type, "channel", channel + 1,
            "old_sender", current[:4].hex("-").upper(), "new_sender", sender_id)

    # Only remove an old FG3 sender with the *identical* ID, function 65
    # and channel bitmask. Never clear another learned sender or channel.
    old_rows = list(range(group3_start, group3_start + count))
    if "FHK14" in str(device_type).upper() and "F4HK14" not in str(device_type).upper() and count == 1:
        # Older EEDTOY versions also misplaced FHK14 function 65 in rows 12/13.
        old_rows += [12, 13]
    clear_rows = []
    for row in old_rows:
        if row < memory_size and await read_fresh(row) == former:
            clear_rows.append(row)

    changed = False
    if current != expected:
        await write_checked(target_row, expected)
        changed = True

    # Migration is safe only after the new FG1 entry has been read back.
    for row in clear_rows:
        if await read_fresh(row) != former:
            raise RuntimeError(f"{device_type}: Speicherzeile {row} zwischenzeitlich verändert")
        await write_checked(row, bytes(8))
        changed = True

    if await read_fresh(target_row) != expected:
        raise RuntimeError(f"{device_type}: Funktionsgruppe 1, Funktion 64 nicht bestätigt")
    for row in old_rows:
        if row < memory_size and await read_fresh(row) == former:
            raise RuntimeError(f"{device_type}: alte Funktion 65 noch vorhanden")

    log("Heating writer verified", device_type, "channel", channel + 1,
        "sender", norm_id(sender_id), "function_group", 1,
        "function", 64, "channel_mask", f"{mask:08b}", "memory_row", target_row)
    return changed

async def _write_fhk_mem_line(dev: Any, row: int, value: bytes) -> None:
    """Write an FHK14 row without mistaking a delayed F2 reply for the F4 ACK."""
    bus = getattr(dev, "bus", None)
    if bus is None or not hasattr(bus, "exchange"):
        await dev.write_mem_line(row, value)
        return

    from eltakobus.error import WriteError
    from eltakobus.message import EltakoMessage

    select_response = await bus.exchange(EltakoMessage(0xF2, dev.address))
    if select_response is None or getattr(select_response, "org", None) != 0xF2:
        raise WriteError(f"Device selection failed; expected 0xf2, got {select_response!r}")

    # Some FHK14 units send the F2 selection reply twice. Let the second reply
    # leave the exchange hook before sending F4. If it still races with F4,
    # repeat only the idempotent row write without selecting the device again.
    await asyncio.sleep(0.08)
    write_response = None
    for attempt in range(3):
        write_response = await bus.exchange(EltakoMessage(0xF4, row, value))
        if write_response is not None and getattr(write_response, "org", None) == 0xF4:
            dev.memory[row] = value
            return
        if write_response is not None and getattr(write_response, "org", None) == 0xF2:
            await asyncio.sleep(0.08)
            if await _read_back_mem_line(dev, row) == value:
                return
            continue
        raise WriteError(f"Write failed; expected 0xf4, got {write_response!r}")

    raise WriteError(f"Write failed; expected 0xf4, got {write_response!r}")




def _is_fd2g14_entry(entry: Dict[str, Any]) -> bool:
    label = f"{_entry_device_type(entry)} {_clean_label(entry.get('name'))}".upper()
    return "FD2G14" in label


def _fd2g14_targets(fam14_base_id_int: int, sender_map: Dict[str, List[Dict[str, Any]]]) -> Dict[int, Dict[int, Dict[str, Any]]]:
    """Group the 16 logical FD2G14 YAML channels by their PCT14 base address."""
    items = []
    for device_id, entries in sender_map.items():
        value = _id_to_int(device_id)
        if value is None:
            continue
        offset = value - fam14_base_id_int
        if not (1 <= offset <= 254):
            continue
        for entry in entries:
            if _is_fd2g14_entry(entry):
                items.append((offset, device_id, entry))
    if not items:
        return {}

    by_offset = {offset: (device_id, entry) for offset, device_id, entry in items}
    remaining = set(by_offset)
    result: Dict[int, Dict[int, Dict[str, Any]]] = {}
    while remaining:
        base = min(remaining)
        channels: Dict[int, Dict[str, Any]] = {}
        for channel in range(16):
            offset = base + channel
            item = by_offset.get(offset)
            if item is None:
                continue
            device_id, entry = item
            channels[channel] = {"device_id": device_id, "entry": entry}
            remaining.discard(offset)
        result[base] = channels
    return result


async def enumerate_bus_grimm(bus: Any):
    """Enumerate Series-14 devices exactly like Grimm's eltakotool.

    A multi-channel device is discovered once at its physical base address and
    its complete address range is skipped afterwards. This is important for the
    FD2G14/FDG14 family, which reports size=16 and can have an additional
    compatibility response inside that range.
    """
    from eltakobus.device import create_busobject

    skip_until = 0
    for address in range(1, 255):
        if address <= skip_until:
            continue
        try:
            dev = await create_busobject(bus=bus, id=address)
            if dev is None:
                continue
            size = max(1, int(getattr(dev, "size", 1) or 1))
            skip_until = address + size - 1
            yield dev
        except TimeoutError:
            continue
        except Exception as exc:
            log("Grimm bus scan failed", address, repr(exc))


def _is_real_fd2g14(dev: Any) -> bool:
    """Return True only for a real FD2G14 discovery object."""
    if type(dev).__name__.upper() == "FD2G14":
        return True
    response = getattr(dev, "discovery_response", None)
    model = bytes(getattr(response, "model", b"") or b"")
    size = int(getattr(dev, "size", 0) or 0)
    return model[:2] == bytes((0x04, 0x82)) and size == 16


def _prepare_fd2g14_memory_access(dev: Any) -> None:
    """Guard only FD2G14 memory replies; retain its library programming layout."""
    if not _is_real_fd2g14(dev) or getattr(dev, "_eedtoy_memory_guard", False):
        return
    from eltakobus.message import EltakoMemoryRequest, EltakoMemoryResponse
    original_write = dev.write_mem_line

    async def read_row(row):
        cached = dev.memory[row]
        if cached is not None:
            return cached
        # FD2G14 replies can arrive after the default 1-second exchange
        # window. The V2 interface clears its receive queue on each new
        # exchange; repeated 1-second calls can therefore discard delayed
        # replies indefinitely. Allow a full 2.5 seconds for this actuator,
        # without changing timeouts for any other Series-14 device.
        # All accepted rows still require a real typed response and row match.
        for attempt in range(6):
            started_at = asyncio.get_running_loop().time()
            try:
                response = await dev.bus.exchange(
                    EltakoMemoryRequest(dev.address, row), EltakoMemoryResponse,
                    retries=1, timeout=2.5)
                elapsed_ms = round((asyncio.get_running_loop().time() - started_at) * 1000)
                if (isinstance(response, EltakoMemoryResponse)
                        and response.row == row
                        and isinstance(response.value, (bytes, bytearray))
                        and len(response.value) == 8):
                    dev.memory[row] = bytes(response.value)
                    log("FD2G14 row read verified", "base", dev.address,
                        "row", row, "attempt", attempt + 1, "elapsed_ms", elapsed_ms)
                    return dev.memory[row]
                log("FD2G14 unexpected row response", "base", dev.address,
                    "row", row, "attempt", attempt + 1,
                    "elapsed_ms", elapsed_ms, "received", repr(response))
            except TimeoutError as exc:
                elapsed_ms = round((asyncio.get_running_loop().time() - started_at) * 1000)
                log("FD2G14 row read timeout", "base", dev.address,
                    "row", row, "attempt", attempt + 1,
                    "elapsed_ms", elapsed_ms, repr(exc))
            if attempt < 5:
                await asyncio.sleep(min(0.2 * (attempt + 1), 0.8))
        raise TimeoutError(
            f"FD2G14 Basisadresse {dev.address}: keine gültige Speicherantwort "
            f"für Zeile {row} nach 6 Versuchen; Busantwort fehlt, "
            "Schreiben wurde sicher abgebrochen."
        )

    async def write_row(row, value):
        try:
            await original_write(row, value)
        except Exception:
            # A lost ACK may follow a successful write. Confirm the real memory
            # before reporting failure; never accept the library's cache alone.
            dev.memory[row] = None
            if await read_row(row) == value:
                return
            raise

    dev.read_mem_line = read_row
    dev.write_mem_line = write_row
    dev._eedtoy_memory_guard = True


async def ensure_fd2g14_from_yaml(
    bus: Any,
    fam14_base_id_int: int,
    sender_map: Dict[str, List[Dict[str, Any]]],
    processed_ids: Set[str],
    known_devices: Optional[Dict[int, Any]] = None,
) -> List[Dict[str, Any]]:
    """Program FD2G14 through Grimm's real FD2G14/FDG14 BusObject path.

    The sixteen YAML IDs describe the logical DALI groups. They are *not* used
    as raw memory-access addresses. We discover the physical FD2G14 on the bus,
    then call its DimmerStyle.ensure_programmed() for channels 0..15. Grimm's
    implementation writes A5-38-08 as sender + 00 + function 32 + group + 00.
    """
    from eltakobus.eep import EEP
    try:
        from eltakobus import AddressExpression
    except Exception:
        from eltakobus.util import AddressExpression

    events: List[Dict[str, Any]] = []
    targets = _fd2g14_targets(fam14_base_id_int, sender_map)
    if not targets:
        return events

    pending_bases = {base for base, channels in targets.items()
                     if any(item["device_id"] not in processed_ids for item in channels.values())}
    if not pending_bases:
        return events

    from eltakobus.device import create_busobject
    # Reuse FD2G14 objects from the first targeted scan. The previous code
    # sometimes programmed via the generic path and sometimes via this path,
    # depending on the first discovery response.
    known_devices = known_devices or {}
    discovered: List[Any] = [
        known_devices[address]
        for address in sorted(pending_bases)
        if address in known_devices
        and _is_real_fd2g14(known_devices[address])
        and int(getattr(known_devices[address], "address", -1)) == address
    ]
    already_found = {int(dev.address) for dev in discovered}
    for address in sorted(pending_bases - already_found):
        for attempt in range(3):
            try:
                dev = await create_busobject(bus=bus, id=address)
                if dev is not None and int(getattr(dev, "address", -1)) == address and _is_real_fd2g14(dev):
                    discovered.append(dev)
                    break
            except Exception as exc:
                log("FD2G14 discovery retry", address, attempt + 1, repr(exc))
            if attempt < 2:
                await asyncio.sleep(0.15)

    missing_bases = pending_bases - {int(d.address) for d in discovered}
    if missing_bases:
        async for dev in enumerate_bus_grimm(bus):
            if _is_real_fd2g14(dev) and int(getattr(dev, "address", -1)) in missing_bases:
                discovered.append(dev)
                missing_bases.discard(int(dev.address))
                if not missing_bases:
                    break

    used_devices: Set[int] = set()
    for yaml_base, channels in sorted(targets.items()):
        pending = {ch: item for ch, item in channels.items() if item["device_id"] not in processed_ids}
        if not pending:
            continue

        # Both the physical PCT14 address and FD2G14 identity must match.
        dev = next((d for d in discovered if int(getattr(d, "address", -1)) == yaml_base and id(d) not in used_devices), None)
        if dev is None:
            for channel in sorted(pending):
                item = pending[channel]
                entry = item["entry"]
                device_id = item["device_id"]
                sender_id = norm_id(entry.get("sender", {}).get("id", ""))
                msg = (
                    f"FD2G14 {device_id}: beim vollständigen Series-14-Bus-Scan wurde "
                    "kein FD2G14 mit Discovery-Modell 04-82 und Größe 16 gefunden."
                )
                events.append({"status": "error", "device_id": device_id, "device_type": "FD2G14", "sender_id": sender_id, "sender_eep": "A5-38-08", "message": msg})
                processed_ids.add(device_id)
            continue

        _prepare_fd2g14_memory_access(dev)
        used_devices.add(id(dev))
        real_address = int(getattr(dev, "address", 0) or 0)
        # Give the RS485 interface time to settle after discovery before
        # the first FD2G14 ID-table read (usually memory row 14).
        await asyncio.sleep(0.3)
        log("FD2G14 matched", "yaml-base", yaml_base, "physical-base", real_address, "size", getattr(dev, "size", "?"))

        memory_read_failed: Optional[TimeoutError] = None
        for channel in sorted(pending):
            item = pending[channel]
            device_id = item["device_id"]
            entry = item["entry"]
            sender_id = norm_id(entry.get("sender", {}).get("id", ""))
            sender_eep = str(entry.get("sender", {}).get("eep", "")).strip().upper()
            display_name = _device_display_name(entry, "FD2G14", device_id)
            if not sender_id or sender_eep != "A5-38-08":
                continue

            if memory_read_failed is not None:
                # Each subchannel shares one physical memory table. Repeating
                # the same unreadable row for fifteen more channels is futile
                # and can keep the bus busy for minutes. Record each pending
                # channel as unverified so the fresh-session retry covers them.
                message = (
                    f"Fehler beim Schreiben von {sender_id} ({sender_eep}) in "
                    f"{display_name} über FD2G14-Basisadresse {real_address}: "
                    f"TimeoutError: {memory_read_failed}; "
                    "Speichertabelle für weiteren Kanal nicht erneut gelesen."
                )
                events.append({
                    "status": "error", "device_id": device_id,
                    "device_type": "FD2G14", "sender_id": sender_id,
                    "sender_eep": sender_eep, "message": message
                })
                processed_ids.add(device_id)
                log(message)
                continue

            try:
                sender_address = AddressExpression.parse(sender_id)
                profile = EEP.find("A5-38-08")
                # FD2G14 occasionally fails to answer a memory-read request.
                # Retry the entire idempotent ensure_programmed operation, just
                # as restarting the writer manually would. Never ignore a final
                # timeout or retry non-timeout programming failures.
                for operation_attempt in range(3):
                    try:
                        changed = await dev.ensure_programmed(channel, sender_address, profile)
                        break
                    except TimeoutError as exc:
                        log("FD2G14 channel timeout", real_address, channel + 1,
                            operation_attempt + 1, repr(exc))
                        if operation_attempt == 2:
                            raise
                        await asyncio.sleep(0.25 * (operation_attempt + 1))
                await asyncio.sleep(0.05)
                if changed:
                    status = "updated"
                    message = (
                        f"Home-Assistant Sender-ID {sender_id} für EEP {sender_eep} in {display_name} "
                        f"über FD2G14-Basisadresse {real_address} geschrieben."
                    )
                else:
                    status = "exists"
                    message = f"Sender-ID {sender_id} für EEP {sender_eep} in {display_name} existiert bereits."
            except Exception as exc:
                status = "error"
                message = (
                    f"Fehler beim Schreiben von {sender_id} ({sender_eep}) in {display_name} "
                    f"über FD2G14-Basisadresse {real_address}: {type(exc).__name__}: {exc}"
                )
                if isinstance(exc, TimeoutError) and "keine gültige Speicherantwort" in str(exc):
                    memory_read_failed = exc
                    log("FD2G14 memory table unavailable, remaining channels postponed",
                        "base", real_address, "from_channel", channel + 1)

            events.append({"status": status, "device_id": device_id, "device_type": "FD2G14", "sender_id": sender_id, "sender_eep": sender_eep, "message": message})
            processed_ids.add(device_id)
            log(message)

    return events


async def ensure_programmed_for_device(fam14_base_id_int: int, dev: Any, sender_map: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    from eltakobus.device import DimmerStyle, HasProgrammableRPS
    from eltakobus.eep import EEP
    from eltakobus.util import b2s
    from eltakobus.error import WriteError
    try:
        from eltakobus import AddressExpression
    except Exception:
        from eltakobus.util import AddressExpression

    events: List[Dict[str, Any]] = []
    size = int(getattr(dev, "size", 1) or 1)
    address = int(getattr(dev, "address", 0) or 0)
    dev_type = type(dev).__name__
    _prepare_fd2g14_memory_access(dev)

    for channel in range(size):
        device_ext_id = b2s((fam14_base_id_int + address + channel).to_bytes(4, "big"))
        entries = sender_map.get(device_ext_id) or []
        for entry in entries:
            sender_id = norm_id(entry.get("sender", {}).get("id", ""))
            sender_eep = str(entry.get("sender", {}).get("eep", "")).strip().upper()
            device_eep = str(entry.get("device_eep") or "").strip().upper()
            entry_name = str(entry.get("name") or "")
            entry_type = _entry_device_type(entry)
            combined_label = f"{entry_type} {entry_name}"
            display_name = _device_display_name(entry, dev_type, device_ext_id)
            is_frgbw14_entry = "FRGBW14" in combined_label.upper()
            is_frgbw14_hardware = _is_real_frgbw14(dev)
            is_fsr14ssr = "FSR14SSR" in combined_label.upper()
            is_fms14 = "FMS14" in combined_label.upper()
            is_f2l14 = "F2L14" in combined_label.upper()
            is_fhk = any(token in combined_label.upper() for token in ("FHK14", "F4HK14", "FAE14SSR", "FAE14LPR"))
            if not sender_id or not sender_eep:
                continue
            retry = 3
            last_exception: Optional[Exception] = None
            update_result = None
            while retry > 0:
                try:
                    if is_frgbw14_entry and not is_frgbw14_hardware:
                        raise RuntimeError(
                            "FRGBW14-Schreiben gesperrt: physische Gerätekennung 04-A1 "
                            "mit sechs Busadressen wurde nicht bestätigt"
                        )
                    if is_frgbw14_hardware:
                        if sender_eep not in {"07-3F-7F", "07-37-F7", "07-3F-F7"}:
                            raise ValueError(
                                f"FRGBW14: Sender-EEP {sender_eep} ist kein freies RGBW-Profil 07-3F-7F"
                            )
                        update_result = await _ensure_programmed_controller_profile(dev, sender_id, channel)
                    elif is_fsr14ssr:
                        update_result = await _ensure_programmed_fsr14ssr(dev, sender_id, channel)
                    elif is_fms14 and sender_eep == "A5-38-08":
                        update_result = await _ensure_programmed_fms14(dev, sender_id, channel)
                    elif is_f2l14 and sender_eep == "F6-02-01":
                        update_result = await _ensure_programmed_f2l14(dev, sender_id, entry.get("f2l14_mode", "exclusive"))
                    elif is_fhk and sender_eep == "A5-10-06":
                        update_result = await _ensure_programmed_fhk_controller(
                            dev, sender_id, channel, entry_type,
                            str(entry.get("heating_control_mode") or "ha_external"),
                        )
                    elif isinstance(dev, HasProgrammableRPS) or isinstance(dev, DimmerStyle) or hasattr(dev, "ensure_programmed"):
                        sender_address = AddressExpression.parse(sender_id)
                        eep_profile = EEP.find(sender_eep)
                        update_result = await dev.ensure_programmed(channel, sender_address, eep_profile)
                    else:
                        update_result = None
                    last_exception = None
                    await asyncio.sleep(0.05)
                    break
                except (WriteError, TimeoutError, Exception) as e:
                    last_exception = e
                    retry -= 1
                    log("retry", 3 - retry, "failed", dev_type, device_ext_id, sender_id, sender_eep, repr(e))
                    await asyncio.sleep(0.15)
            if last_exception is not None:
                events.append({"status": "error", "device_id": device_ext_id, "device_type": entry_type, "sender_id": sender_id, "sender_eep": sender_eep, "message": f"Fehler beim Schreiben von {sender_id} ({sender_eep}) in {display_name}: {type(last_exception).__name__}: {last_exception}"})
                continue
            if update_result is None:
                status = "unsupported"
                message = f"Update für Gerät {display_name} nicht unterstützt."
            elif update_result is True:
                status = "updated"
                message = f"Home-Assistant Sender-ID {sender_id} für EEP {sender_eep} in {display_name} geschrieben."
            else:
                status = "exists"
                message = f"Sender-ID {sender_id} für EEP {sender_eep} in {display_name} existiert bereits."
            if is_fhk and sender_eep == "A5-10-06" and update_result is not None:
                learned = str(entry.get("heating_control_mode") or "ha_external") == "learned_sensor"
                group, function = (3, 65) if learned else (1, 64)
                message += (
                    f" Bestätigt: Funktionsgruppe {group}, Funktion {function}, "
                    f"Kanalmaske {1 << channel:08b}."
                )
            if is_frgbw14_hardware and update_result is not None:
                slot = getattr(dev, "_eedtoy_frgbw14_row", None)
                if slot is not None:
                    message += (
                        f" Bestätigt: Funktionsgruppe 3, PCT14-Eintrag {slot - 7}, "
                        "Funktion 81, Kanal 00001111."
                    )
            events.append({"status": status, "device_id": device_ext_id, "device_type": entry_type, "sender_id": sender_id, "sender_eep": sender_eep, "message": message})
            log(message)
    return events

async def _write_senders_session(
    port: str,
    sender_map_path: str,
    baud_rate: int = 57600,
    gateway_type: str = "fam14",
    only_fd2g_ids: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """One Series-14 connection and bus lock.

    With only_fd2g_ids, keep the complete original sender map to preserve the
    FD2G14 physical base + 16 logical channel offsets. Discover only the FD2G14
    physical base addresses and skip every already-successful channel.
    """
    from eltakobus import locking
    from eltakobus.device import FAM14, create_busobject
    from eltakobus.serial import RS485SerialInterfaceV2
    from eltakobus.util import b2s

    sender_map = load_sender_map(sender_map_path)
    if not sender_map:
        return {"ok": False, "error": "Keine Sender-IDs zum Schreiben vorhanden.", "events": []}

    bus = None
    locked = False
    events: List[Dict[str, Any]] = []
    try:
        # The FGW14-USB RS485 adapter needs ~10 ms pacing at 57600 baud.
        # The previous 1 ms pacing could overload consecutive memory reads
        # after writing dozens of sender IDs; use the conservative delay for
        # all 57600-baud Series-14 write sessions.
        delay_message = 0.01 if baud_rate == 57600 else 0.2
        log("connect", port, baud_rate, gateway_type, "sender entries", sum(len(entries) for entries in sender_map.values()))
        bus = RS485SerialInterfaceV2(port, baud_rate=baud_rate, delay_message=delay_message, auto_reconnect=False)
        bus.start()
        bus.is_serial_connected.wait(timeout=2)
        if not bus.is_active():
            return {"ok": False, "error": f"Port {port} geöffnet, aber Bus ist nicht aktiv.", "events": []}

        try:
            bus.set_callback(None)
        except Exception:
            pass

        locked = (await locking.lock_bus(bus)) == locking.LOCKED
        log("bus locked", locked)
        if not locked:
            return {"ok": False, "error": "Series-14-Bus konnte nicht gesperrt werden; Schreiben abgebrochen.", "events": []}

        fam14: FAM14 = await create_busobject(bus=bus, id=255)
        fam14_base_id_int = await fam14.get_base_id_in_int()
        fam14_base_id = b2s(await fam14.get_base_id_in_bytes())
        log("fam14 base", fam14_base_id)

        expected_bases = {entry["expected_bus_base_id"] for entries in sender_map.values()
                          for entry in entries if entry.get("expected_bus_base_id")}
        if expected_bases and expected_bases != {norm_id(fam14_base_id)}:
            return {"ok": False, "events": [], "error":
                    f"Falsches Bussystem angeschlossen: FAM14 {fam14_base_id}; erwartet: {', '.join(sorted(expected_bases))}. Es wurde nichts geschrieben."}

        fd2g_targets = _fd2g14_targets(fam14_base_id_int, sender_map)
        recovery_mode = only_fd2g_ids is not None
        if recovery_mode:
            requested = {norm_id(value) for value in only_fd2g_ids}
            fd2g_ids = {
                item["device_id"] for group in fd2g_targets.values()
                for item in group.values()
            }
            if not requested or not requested.issubset(fd2g_ids):
                return {
                    "ok": False,
                    "error": "FD2G14-Wiederanlauf: angeforderter Kanal gehört nicht zu einem erkannten FD2G14-Senderblock.",
                    "events": [],
                }
            target_addresses = sorted(
                base for base, group in fd2g_targets.items()
                if any(item["device_id"] in requested for item in group.values())
            )
            # Prevent all other IDs, including the already successful FD2G14
            # channels, from being sent through any programming routine again.
            processed_ids: Set[str] = set(sender_map) - requested
            log("FD2G14 fresh-session recovery", "physical bases", target_addresses,
                "failed channel IDs", sorted(requested))
        else:
            # The FD2G14 gets its own first access immediately after the bus
            # has been locked and the FAM14 base ID verified. The remaining
            # devices are scanned later; this prevents hundreds of prior
            # Series-14 transactions from starving its first memory read.
            all_targets = target_bus_addresses(fam14_base_id_int, sender_map)
            target_addresses = [
                addr for addr in all_targets
                if not any(base <= addr < base + 16 for base in fd2g_targets)
            ]
            processed_ids: Set[str] = set()
        log("target bus addresses", ",".join(str(a) for a in target_addresses),
            "FD2G14 physical bases", sorted(fd2g_targets))
        log("FD2G14 dedicated programming before other device writes")
        fd2g_events = await ensure_fd2g14_from_yaml(
            bus, fam14_base_id_int, sender_map, processed_ids
        )
        events.extend(fd2g_events)

        async for dev in enumerate_target_devices(bus, target_addresses):
            device_address = int(getattr(dev, "address", 0) or 0)
            if device_address in fd2g_targets and _is_real_fd2g14(dev):
                # Never program FD2G14 through the generic path: its sixteen
                # logical channel IDs belong to one physical base address.
                discovered_fd2g[device_address] = dev
                log("FD2G14 reserved for dedicated path", device_address)
                continue
            if recovery_mode:
                log("FD2G14 recovery: ignoring non-FD2G14 response",
                    device_address, type(dev).__name__)
                continue
            device_events = await ensure_programmed_for_device(fam14_base_id_int, dev, sender_map)
            events.extend(device_events)
            processed_ids.update(e.get("device_id", "") for e in device_events)

        for device_id, entries in sender_map.items():
            if device_id in processed_ids:
                continue
            for entry in entries:
                sender_id = norm_id(entry.get("sender", {}).get("id", ""))
                sender_eep = str(entry.get("sender", {}).get("eep", "")).strip().upper()
                display_name = _device_display_name(entry, "BusObject", device_id)
                events.append({
                    "status": "error",
                    "device_id": device_id,
                    "device_type": _entry_device_type(entry),
                    "sender_id": sender_id,
                    "sender_eep": sender_eep,
                    "message": f"Busgerät {display_name} wurde an der erwarteten Series-14-Adresse nicht gefunden.",
                })

        counts: Dict[str, int] = {}
        for event in events:
            counts[event.get("status", "unknown")] = counts.get(event.get("status", "unknown"), 0) + 1

        return {
            "ok": True,
            "fam14_base_id": fam14_base_id,
            "target_addresses": target_addresses,
            "scanned_devices": len({e.get("device_id") for e in events if e.get("device_id")}),
            "events": events,
            "counts": counts,
            "message": f"Sender-ID Schreiben beendet. Aktualisiert: {counts.get('updated', 0)}, bereits vorhanden: {counts.get('exists', 0)}, nicht unterstützt: {counts.get('unsupported', 0)}, Fehler: {counts.get('error', 0)}.",
        }
    finally:
        if bus is not None:
            try:
                if locked:
                    await locking.unlock_bus(bus)
                    log("bus unlocked")
            except Exception as e:
                log("unlock failed", repr(e))
            try:
                bus.stop()
                bus.join(2.0)
                if callable(getattr(bus, 'is_alive', None)) and bus.is_alive():
                    raise RuntimeError(
                        "RS485-Worker wurde nicht beendet; weiterer Schreibversuch "
                        "auf derselben seriellen Schnittstelle gesperrt."
                    )
            except Exception as exc:
                log("Series-14 RS485 shutdown problem", repr(exc))
                raise


def _fd2g14_is_read_timeout(event: Dict[str, Any]) -> bool:
    """Only the FD2G14 ID-table read timeout merits a new bus session."""
    message = str(event.get("message") or "")
    return (
        event.get("status") == "error"
        and str(event.get("device_type") or "").upper() == "FD2G14"
        and "FD2G14 Basisadresse" in message
        and "keine gültige Speicherantwort" in message
    )


def _update_sender_write_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    events = result.get("events") or []
    counts: Dict[str, int] = {}
    for event in events:
        status = event.get("status", "unknown")
        counts[status] = counts.get(status, 0) + 1
    result["counts"] = counts
    result["scanned_devices"] = len({e.get("device_id") for e in events if e.get("device_id")})
    result["message"] = (
        f"Sender-ID Schreiben beendet. Aktualisiert: {counts.get('updated', 0)}, "
        f"bereits vorhanden: {counts.get('exists', 0)}, "
        f"nicht unterstützt: {counts.get('unsupported', 0)}, "
        f"Fehler: {counts.get('error', 0)}."
    )
    return result


async def write_senders(
    port: str, sender_map_path: str, baud_rate: int = 57600,
    gateway_type: str = "fam14",
) -> Dict[str, Any]:
    """Recover intermittent FD2G14 ID-table read failures on a fresh RS485 bus.

    The user's second *manual* run succeeds after closing the port, releasing
    the bus and opening a new connection. Retrying the same memory row six times
    in one connection cannot reproduce that reset. Reconnect only when the
    first session reports this specific FD2G14 error, then retry only failed
    logical channel IDs using the original physical 16-channel group layout.
    """
    first = await _write_senders_session(
        port, sender_map_path, baud_rate, gateway_type
    )
    if not first.get("ok"):
        return first

    initial_events = first.get("events") or []
    failed_ids = {
        norm_id(event.get("device_id") or "")
        for event in initial_events if _fd2g14_is_read_timeout(event)
    }
    if not failed_ids:
        return first

    log("FD2G14 retry: reopening serial port and re-locking bus", sorted(failed_ids))
    await asyncio.sleep(0.5)
    try:
        second = await _write_senders_session(
            port, sender_map_path, baud_rate, gateway_type,
            only_fd2g_ids=failed_ids
        )
    except Exception as exc:
        log("FD2G14 fresh-session recovery failed", repr(exc))
        second = {"ok": False, "error": f"{type(exc).__name__}: {exc}", "events": []}

    retry_events = {
        norm_id(event.get("device_id") or ""): event
        for event in second.get("events") or []
    }
    merged = []
    recovered = 0
    for original in initial_events:
        original_id = norm_id(original.get("device_id") or "")
        if original_id not in failed_ids or not _fd2g14_is_read_timeout(original):
            merged.append(original)
            continue

        new_event = retry_events.get(original_id)
        if (second.get("ok") and new_event
                and new_event.get("status") in ("updated", "exists")):
            successful = dict(new_event)
            successful["message"] = (
                str(new_event.get("message") or "")
                + " (Automatisch nach neuer RS485-Verbindung bestätigt.)"
            )
            merged.append(successful)
            recovered += 1
        else:
            failed = dict(original)
            detail = (
                str(new_event.get("message") or "")
                if new_event else str(second.get("error") or "Keine bestätigte Antwort.")
            )
            failed["message"] = (
                str(original.get("message") or "")
                + " Auch nach vollständigem Neuaufbau der RS485-Verbindung "
                "fehlgeschlagen: " + detail
            )
            merged.append(failed)

    first["events"] = merged
    first["fd2g14_recovery_attempted"] = True
    first["fd2g14_recovered"] = recovered
    log("FD2G14 fresh-session retry completed", "recovered", recovered,
        "still failed", len(failed_ids) - recovered)
    return _update_sender_write_summary(first)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True)
    parser.add_argument("--sender-map", required=True)
    parser.add_argument("--baud", type=int, default=57600)
    parser.add_argument("--gateway-type", default="fam14")
    args = parser.parse_args()

    try:
        result = await write_senders(args.port, args.sender_map, args.baud, args.gateway_type)
        jprint(result)
    except Exception as e:
        log("fatal", repr(e))
        traceback.print_exc(file=sys.stderr)
        jprint({"ok": False, "error": f"Sender-ID Schreiben fehlgeschlagen: {type(e).__name__}: {e}", "events": []})


if __name__ == "__main__":
    asyncio.run(main())
