#!/usr/bin/env python3
"""Listen for one EnOcean radio telegram and return its sender ID as JSON.

This intentionally uses the same Python stack as the gateway detector for
Eltako/FAM14/FAM-USB paths. It is more reliable than parsing raw bytes in
Electron because FAM14/FGW14 use Eltako ESP2/RS485 specifics and echo handling.
"""
import argparse
import asyncio
import json
import sys
import threading
import time
from typing import Any, Optional


def log(*args: Any) -> None:
    print("[python-learn]", *args, file=sys.stderr, flush=True)


def fmt_id_from_int(value: int) -> Optional[str]:
    try:
        if value is None or value <= 0 or value > 0xFFFFFFFF:
            return None
        return "-".join(f"{b:02X}" for b in int(value).to_bytes(4, "big"))
    except Exception:
        return None


def fmt_id_from_bytes(value: Any) -> Optional[str]:
    try:
        b = bytes(value)
        if len(b) < 4:
            return None
        # Prefer exactly 4 bytes. If a larger buffer is passed, take the last 4
        # only as a fallback for integer-like encodings.
        if len(b) != 4:
            b = b[-4:]
        if b == b"\x00\x00\x00\x00":
            return None
        return "-".join(f"{x:02X}" for x in b)
    except Exception:
        return None


def normalize_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip().upper().replace(":", "-").replace(" ", "-")
        parts = [p for p in s.split("-") if p]
        if len(parts) == 4 and all(len(p) <= 2 for p in parts):
            try:
                return "-".join(f"{int(p, 16):02X}" for p in parts)
            except Exception:
                return None
        return None
    if isinstance(value, int):
        return fmt_id_from_int(value)
    if isinstance(value, (bytes, bytearray, list, tuple)):
        return fmt_id_from_bytes(value)
    return None


def body_candidates(body: bytes):
    """Return plausible sender IDs from an ESP2-style body.

    Different adapters expose either the full ESP2 body or already translated
    radio payloads. We try known layouts first and then conservative fallbacks
    around EnOcean RORG markers.
    """
    if not body:
        return []
    candidates = []

    def add(label: str, b: bytes, rorg: Optional[int] = None, data_byte3: Optional[int] = None):
        sid = fmt_id_from_bytes(b)
        if sid:
            candidates.append((label, sid, rorg, data_byte3))

    rorgs = {0x05, 0xF6, 0xD5, 0xA5, 0xD2, 0xD4}
    n = len(body)

    # ESP2Message body often is: H_SEQ/LEN, RORG, DATA3..DATA0, ID3..ID0, STATUS
    if n >= 10 and body[1] in rorgs:
        add("esp2-body-1", body[6:10], body[1], body[2])

    # Sometimes body starts at RORG directly: RORG, DATA..., ID3..ID0, STATUS
    if n >= 9 and body[0] in rorgs:
        add("esp2-body-0", body[5:9], body[0], body[1])

    # ERP1 radio payload: RORG + variable data + SenderID(4) + STATUS
    if n >= 6 and body[0] in rorgs:
        add("erp1-body", body[-5:-1], body[0], body[1] if n > 1 else None)

    # Scan for RORG marker and use the normal ERP1 convention after it.
    for pos, val in enumerate(body):
        if val in rorgs and pos + 6 <= n:
            payload = body[pos:]
            add(f"rorg-scan-{pos}", payload[-5:-1], val, payload[1] if len(payload) > 1 else None)

    return candidates


def extract_id_from_message(msg: Any) -> Optional[dict]:
    """Best-effort sender ID plus RORG/data extraction from eltakobus messages."""
    attr_sid = None
    attr_source = None
    attr_names = [
        "sender", "sender_id", "senderid", "address", "originator",
        "source", "source_id", "source_address", "id",
    ]
    for name in attr_names:
        try:
            if hasattr(msg, name):
                sid = normalize_id(getattr(msg, name))
                if sid:
                    attr_sid = sid
                    attr_source = f"attr.{name}"
                    break
        except Exception:
            pass

    try:
        body = bytes(getattr(msg, "body"))
    except Exception:
        body = b""
    # Eltako RS485 bus telegram objects may expose the legacy ORG value 0x05
    # and their data byte directly as attributes instead of embedding an EnOcean
    # radio RORG (F6) in the body. Read those attributes first so IDs such as
    # 00-00-10-01 from an FTS14EM can be learned reliably.
    attr_rorg = None
    for name in ("rorg", "org", "ORG", "telegram_type"):
        try:
            if hasattr(msg, name):
                value = getattr(msg, name)
                if hasattr(value, "value"):
                    value = value.value
                if isinstance(value, str):
                    attr_rorg = int(value, 16)
                else:
                    attr_rorg = int(value)
                break
        except Exception:
            pass

    attr_data_byte3 = None
    for name in ("data_byte3", "db3", "data", "value"):
        try:
            if hasattr(msg, name):
                value = getattr(msg, name)
                if isinstance(value, int):
                    attr_data_byte3 = value & 0xFF
                    break
                raw_value = bytes(value)
                if raw_value:
                    attr_data_byte3 = raw_value[0]
                    break
        except Exception:
            pass

    candidates = body_candidates(body)
    if candidates:
        label, body_sid, rorg, data_byte3 = candidates[0]
        return {
            "id": attr_sid or body_sid,
            "source": attr_source or label,
            "rorg": f"{(attr_rorg if attr_rorg is not None else rorg):02X}" if (attr_rorg is not None or rorg is not None) else None,
            "data_byte3": attr_data_byte3 if attr_data_byte3 is not None else data_byte3,
            "message_type": type(msg).__name__,
        }

    try:
        raw = bytes(msg)
    except Exception:
        raw = b""
    candidates = body_candidates(raw)
    if candidates:
        label, body_sid, rorg, data_byte3 = candidates[0]
        return {
            "id": attr_sid or body_sid,
            "source": attr_source or ("raw." + label),
            "rorg": f"{rorg:02X}" if rorg is not None else None,
            "data_byte3": data_byte3,
            "message_type": type(msg).__name__,
        }

    if attr_sid:
        return {
            "id": attr_sid,
            "source": attr_source,
            "rorg": f"{attr_rorg:02X}" if attr_rorg is not None else None,
            "data_byte3": attr_data_byte3,
            "message_type": type(msg).__name__,
        }
    return None


def listen_rs485(port: str, mode: str, timeout: float, repeat_count: int = 1, required_rorg: Optional[int] = None, required_data_byte3: Optional[int] = None) -> dict:
    from eltakobus.serial import RS485SerialInterfaceV2

    if mode == "fam-usb":
        baud = 9600
        delay = 0.2
    elif mode == "fgw14usb":
        baud = 57600
        # Reference eltakobus timing for FGW14-USB. It is a wired ESP2 bus
        # gateway without FAM14 echo suppression.
        delay = 0.01
    else:
        baud = 57600
        delay = 0.001
    event = threading.Event()
    result = {"ok": False}
    seen = {"count": 0}
    presses = {}
    armed = {}
    last_counted_at = {}

    def callback(message: Any) -> None:
        seen["count"] += 1
        try:
            body = getattr(message, "body", None)
            body_hex = bytes(body).hex(" ") if body is not None else ""
        except Exception:
            body_hex = ""
        log("RX", port, baud, type(message).__name__, body_hex or repr(message))
        parsed = extract_id_from_message(message)
        if not (parsed and parsed.get("id")):
            return

        sid = parsed["id"]
        try:
            rorg_value = int(str(parsed.get("rorg") or ""), 16)
        except Exception:
            rorg_value = None
        data_value = parsed.get("data_byte3")

        if required_rorg is not None and rorg_value != required_rorg:
            return

        if repeat_count > 1:
            # FTS14EM: count deliberate presses of the same bus ID. A 0x00
            # release telegram re-arms immediately. Some FGW14/eltakobus paths
            # do not expose the release byte, therefore a conservative debounce
            # also permits the next press after 250 ms without resetting the
            # candidate because of unrelated RS485 traffic.
            now = time.monotonic()
            if data_value == 0x00:
                armed[sid] = True
                return
            if required_data_byte3 is not None and data_value != required_data_byte3:
                return
            if armed.get(sid, True) is False and now - last_counted_at.get(sid, 0.0) < 0.25:
                return
            armed[sid] = False
            last_counted_at[sid] = now
            presses[sid] = presses.get(sid, 0) + 1
            count = presses[sid]
            print("[python-learn-progress] " + json.dumps({"id": sid, "count": count, "required": repeat_count}), file=sys.stderr, flush=True)
            if count < repeat_count:
                return

        result.update({
            "ok": True,
            "id": sid,
            "rorg": parsed.get("rorg"),
            "protocol": "eltakobus-rs485",
            "baudRate": baud,
            "message_type": parsed.get("message_type"),
            "source": parsed.get("source"),
            "data_byte3": data_value,
            "repeat_count": presses.get(sid, 1),
        })
        event.set()

    bus = None
    try:
        log("LISTEN", port, baud, "mode=", mode, "timeout=", timeout)
        bus = RS485SerialInterfaceV2(
            port,
            baud_rate=baud,
            callback=callback,
            delay_message=delay,
            auto_reconnect=False,
        )
        bus.start()
        if not bus.is_serial_connected.wait(timeout=2):
            return {"ok": False, "error": f"Port {port} konnte nicht geöffnet werden."}

        event.wait(timeout)
        if result.get("ok"):
            return result
        return {
            "ok": False,
            "error": f"Kein EnOcean-Telegramm innerhalb von {int(timeout)} Sekunden empfangen. Empfangene Busnachrichten: {seen['count']}",
            "baudRate": baud,
            "protocol": "eltakobus-rs485",
        }
    finally:
        try:
            if bus is not None:
                bus.stop()
                bus.join(0.5)
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True)
    parser.add_argument("--mode", default="auto")
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--repeat-count", type=int, default=1)
    parser.add_argument("--required-rorg", default="")
    parser.add_argument("--required-data-byte3", default="")
    args = parser.parse_args()

    mode = (args.mode or "auto").lower().strip()
    if mode in ("fam14", "auto"):
        mode = "fam14"
    elif mode in ("fgw14usb", "fgw14"):
        mode = "fgw14usb"
    elif mode in ("fam-usb", "famusb"):
        mode = "fam-usb"

    try:
        required_rorg = int(args.required_rorg, 16) if args.required_rorg else None
        required_data_byte3 = int(args.required_data_byte3, 0) if args.required_data_byte3 else None
        result = listen_rs485(
            args.port, mode, args.timeout,
            repeat_count=max(1, int(args.repeat_count or 1)),
            required_rorg=required_rorg,
            required_data_byte3=required_data_byte3,
        )
    except Exception as exc:
        log("fatal", repr(exc))
        import traceback
        traceback.print_exc(file=sys.stderr)
        result = {"ok": False, "error": f"Python-Lerntelegramm-Listener fehlgeschlagen: {type(exc).__name__}: {exc}"}

    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
