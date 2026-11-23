#!/usr/bin/env python3
"""
Gateway detector bridge for the Electron app.

This uses the Series-14 communication routines provided by eltakobus:
- list serial ports with pyserial
- detect FAM14/FGW/FAM-USB with eltakobus.serial.RS485SerialInterfaceV2
- for FAM14, lock the bus and read the FAM14 bus object at address 255
- for FAM-USB, use the AB 58 base-id request through RS485SerialInterfaceV2

The script prints exactly one JSON object to stdout. Diagnostic information goes
to stderr so Electron can show/log it without breaking JSON parsing.
"""

import argparse
import asyncio
import json
import sys
import traceback
from typing import Any, Dict, List, Optional


def jprint(obj: Dict[str, Any]) -> None:
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def log(*parts: Any) -> None:
    print("[python-detect]", *parts, file=sys.stderr, flush=True)


def fmt_base_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value.upper()
    if isinstance(value, int):
        raw = value.to_bytes(4, "big", signed=False)
        return "-".join(f"{b:02X}" for b in raw)
    if isinstance(value, (bytes, bytearray)):
        raw = bytes(value[:4])
        if len(raw) == 4:
            return "-".join(f"{b:02X}" for b in raw)
    if isinstance(value, list) and len(value) >= 4:
        return "-".join(f"{int(b) & 0xFF:02X}" for b in value[:4])
    return str(value).upper()


def list_ports(preferred_path: str = "") -> List[Dict[str, Any]]:
    import serial.tools.list_ports

    ports: List[Dict[str, Any]] = []
    seen = set()

    def add(path: str, manufacturer: str = "", description: str = "", source: str = "pyserial") -> None:
        if not path:
            return
        key = path.upper()
        if key in seen:
            return
        seen.add(key)
        ports.append({
            "path": path,
            "manufacturer": manufacturer or "",
            "description": description or "",
            "source": source,
        })

    if preferred_path:
        add(preferred_path.strip(), "Manuell eingetragen", "", "manual")

    for p in serial.tools.list_ports.comports():
        add(
            getattr(p, "device", ""),
            getattr(p, "manufacturer", "") or "",
            getattr(p, "description", "") or "",
            "pyserial",
        )

    return ports


async def get_fam_usb_base_id(bus: Any) -> Optional[str]:
    from eltakobus.message import ESP2Message
    from eltakobus.util import b2s

    old_callback = getattr(bus, "callback", None)
    try:
        try:
            bus.set_callback(None)
        except Exception:
            pass

        data = b"\xAB\x58\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        response = await bus.exchange(ESP2Message(bytes(data)), ESP2Message, retries=3, timeout=1)
        base_id = b2s(response.body[2:6])
        if base_id and base_id != "00-00-00-00":
            return base_id.upper()
        return None
    finally:
        try:
            bus.set_callback(old_callback)
        except Exception:
            pass


async def get_fam14_base_id(bus: Any) -> Optional[str]:
    from eltakobus import locking
    from eltakobus.device import create_busobject

    old_callback = getattr(bus, "callback", None)
    locked = False
    try:
        try:
            bus.set_callback(None)
        except Exception:
            pass

        log("locking FAM14 bus")
        locked = (await locking.lock_bus(bus)) == locking.LOCKED
        log("bus locked", locked)

        fam14 = await create_busobject(bus=bus, id=255)
        log("created bus object", fam14)

        base_id = await fam14.get_base_id()
        return fmt_base_id(base_id)
    finally:
        if locked:
            try:
                await locking.unlock_bus(bus)
                log("bus unlocked")
            except Exception as e:
                log("unlock failed", repr(e))
        try:
            bus.set_callback(old_callback)
        except Exception:
            pass


async def try_rs485_port(port_path: str, baud_rate: int, target: str = "auto") -> Dict[str, Any]:
    from eltakobus.serial import RS485SerialInterfaceV2

    bus = None
    try:
        log("try RS485", port_path, baud_rate, "target=", target)
        delay_message = 0.001 if baud_rate == 57600 else 0.2
        bus = RS485SerialInterfaceV2(
            port_path,
            baud_rate=baud_rate,
            delay_message=delay_message,
            auto_reconnect=False,
        )
        bus.start()
        bus.is_serial_connected.wait(timeout=2)

        if not bus.is_active():
            return {"ok": False, "error": "Port geöffnet, aber RS485Interface nicht aktiv"}

        suppress_echo = bool(getattr(bus, "suppress_echo", False))
        log("RS485 active", port_path, baud_rate, "suppress_echo=", suppress_echo)

        # Same detection criterion as EnOcean Device Manager: suppress_echo means FAM14.
        if suppress_echo:
            if target == "fam-usb":
                return {"ok": False, "error": "Port verhält sich wie FAM14 (suppress_echo), nicht wie FAM-USB"}
            base_id = await asyncio.wait_for(get_fam14_base_id(bus), timeout=8)
            if base_id:
                return {
                    "ok": True,
                    "gateway": {
                        "type": "fam14",
                        "label": "Eltako FAM14",
                        "serial_path": port_path,
                        "baudRate": baud_rate,
                        "protocol": "eltakobus-fam14",
                        "parser": "python-eltakobus-create_busobject-255",
                        "base_id": base_id,
                    },
                }
            return {"ok": False, "error": "FAM14 erkannt, aber Base-ID konnte nicht gelesen werden"}

        # FAM-USB: only test AB 58 at 9600, matching the reference implementation.
        if baud_rate == 9600 and target in ("auto", "fam-usb", "rs485"):
            base_id = await asyncio.wait_for(get_fam_usb_base_id(bus), timeout=5)
            if base_id:
                return {
                    "ok": True,
                    "gateway": {
                        "type": "fam-usb",
                        "label": "Eltako FAM-USB",
                        "serial_path": port_path,
                        "baudRate": baud_rate,
                        "protocol": "eltakobus-fam-usb-ab58",
                        "parser": "python-eltakobus-exchange-ab58",
                        "base_id": base_id,
                    },
                }

        # EnOcean Device Manager criterion: 57600 baud and an active RS485
        # interface without echo suppression is classified as FGW14-USB.
        if baud_rate == 57600:
            gateway = {
                "type": "fgw14usb",
                "label": "Eltako FGW14-USB",
                "serial_path": port_path,
                "baudRate": baud_rate,
                "protocol": "eltakobus-rs485-no-suppress-echo",
                "parser": "python-eltakobus-rs485-no-suppress-echo",
                "base_id": "",
            }
            if target in ("auto", "fgw14", "rs485"):
                return {"ok": True, "gateway": gateway}
            return {"ok": False, "possible_gateway": gateway, "error": "Port behaves like FGW14-USB."}

        return {"ok": False, "error": "Keine passende RS485/FAM Antwort"}

    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    finally:
        if bus is not None:
            try:
                bus.stop()
                bus.join(0.8)
            except Exception:
                pass



async def detect(preferred_path: str = "", mode: str = "auto") -> Dict[str, Any]:
    ports = list_ports(preferred_path)
    attempts: List[Dict[str, Any]] = []

    if not ports:
        return {"ok": False, "ports": [], "attempts": [], "error": "Kein serieller Port gefunden"}

    # Match the reference detector's order closely. For explicit modes we keep
    # the search narrow so selecting FAM-USB does not accidentally classify a
    # FAM14 on the same COM port.
    for p in ports:
        port_path = p["path"]
        candidates = []
        if mode == "auto":
            candidates.extend([("rs485", 9600, "auto"), ("rs485", 57600, "auto")])
        elif mode == "fam-usb":
            candidates.append(("rs485", 9600, "fam-usb"))
        elif mode == "fam14":
            candidates.extend([("rs485", 57600, "fam14"), ("rs485", 9600, "fam14")])
        elif mode == "fgw14":
            candidates.append(("rs485", 57600, "fgw14"))
        elif mode == "rs485":
            candidates.extend([("rs485", 9600, "rs485"), ("rs485", 57600, "rs485")])

        for proto, baud, target in candidates:
            result = await try_rs485_port(port_path, baud, target)

            attempts.append({
                "path": port_path,
                "manufacturer": p.get("manufacturer", ""),
                "description": p.get("description", ""),
                "protocol": proto,
                "baudRate": baud,
                "ok": result.get("ok", False),
                "error": result.get("error", ""),
                "possible_gateway": result.get("possible_gateway"),
            })

            if result.get("ok"):
                gw = result["gateway"]
                gw["manufacturer"] = p.get("manufacturer", "")
                gw["description"] = p.get("description", "")
                return {"ok": True, "gateway": gw, "ports": ports, "attempts": attempts}

    possible = [a.get("possible_gateway") for a in attempts if a.get("possible_gateway")]
    return {
        "ok": False,
        "ports": ports,
        "attempts": attempts,
        "possible_gateways": possible,
        "error": "Ports wurden getestet, aber keine Base-ID konnte gelesen werden. Falls FAM14 angeschlossen ist: prüfen, ob der Bus frei ist und keine andere Software den COM-Port belegt.",
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preferred", default="")
    parser.add_argument("--mode", default="auto", choices=["auto", "fam14", "fam-usb", "fgw14", "rs485"])
    args = parser.parse_args()

    try:
        result = await detect(args.preferred, args.mode)
        jprint(result)
    except Exception as e:
        log("fatal", repr(e))
        traceback.print_exc(file=sys.stderr)
        jprint({"ok": False, "error": f"Python-Detector fehlgeschlagen: {type(e).__name__}: {e}", "ports": [], "attempts": []})


if __name__ == "__main__":
    asyncio.run(main())
