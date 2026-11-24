#!/usr/bin/env python3
"""Series-14 heater FG4/F30 RPS teach-in regression tests."""
import asyncio
import importlib.util
import json
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "python" / "write_senders.py"
spec = importlib.util.spec_from_file_location("write_senders_heat_modes", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Hardware:
    def __init__(self, model, memory_size=48):
        self.size = 4 if model == "F4HK14" else (1 if model == "FHK14" else 2)
        self.memory_size = memory_size
        self.memory = [bytes(8) for _ in range(memory_size)]
        self.hardware = list(self.memory)
        self.writes = []

    def seed(self, row, value):
        self.hardware[row] = value
        self.memory[row] = value

    async def read_mem_line(self, row):
        self.memory[row] = self.hardware[row]
        return self.hardware[row]

    async def write_mem_line(self, row, value):
        self.hardware[row] = value
        self.memory[row] = value
        self.writes.append((row, value))


async def test_fg4_per_channel():
    for model, count in (("FHK14", 1), ("F4HK14", 4),
                         ("FAE14LPR", 2), ("FAE14SSR", 2)):
        dev = Hardware(model)
        start = module._heating_group_4_start(model, count)
        assert start == (20 if count == 4 else 14)
        sensor = bytes.fromhex("1122334400400100")
        foreign = bytes.fromhex("CCBBAA77001E0800")
        dev.seed(8, sensor)
        dev.seed(start, foreign)
        for channel in range(count):
            sender = f"7A-BB-CC-{0x10 + channel:02X}"
            expected = bytes.fromhex(sender.replace("-", "")) + bytes((7, 30, 1 << channel, 0))
            assert await module._ensure_programmed_heating_operating_mode(
                dev, sender, channel, model
            ) is True
            assert dev.hardware[start + channel + 1] == expected
            before = len(dev.writes)
            assert await module._ensure_programmed_heating_operating_mode(
                dev, sender, channel, model
            ) is False
            assert len(dev.writes) == before, "Repeat write must be idempotent"
        assert dev.hardware[start] == foreign
        assert dev.hardware[8] == sensor

        # Explicitly remembered old ID is the ONLY ID eligible for replacement.
        new_id = "70-60-50-40"
        assert await module._ensure_programmed_heating_operating_mode(
            dev, new_id, 0, model, "7A-BB-CC-10"
        ) is True
        assert dev.hardware[start + 1] == bytes.fromhex("70605040071E0100")
        assert dev.hardware[start] == foreign
        assert await module._ensure_programmed_heating_operating_mode(
            dev, new_id, 0, model, "7A-BB-CC-10"
        ) is False
        assert sum(v == bytes.fromhex("70605040071E0100")
                   for v in dev.hardware[start:]) == 1



async def test_legacy_key_zero_is_updated_in_place():
    for model, channel in (("FHK14", 0), ("F4HK14", 2),
                           ("FAE14LPR", 1), ("FAE14SSR", 0)):
        dev = Hardware(model)
        start = module._heating_group_4_start(model, dev.size)
        sender = "FF-A6-04-86"
        mask = 1 << channel
        old = bytes.fromhex("FFA60486") + bytes((0, 30, mask, 0))
        corrected = bytes.fromhex("FFA60486") + bytes((7, 30, mask, 0))
        foreign = bytes.fromhex("FFAD2425") + bytes((7, 30, mask, 0))
        dev.seed(start, foreign)
        dev.seed(start + 3, old)
        assert await module._ensure_programmed_heating_operating_mode(
            dev, sender, channel, model
        ) is True
        assert dev.hardware[start + 3] == corrected
        assert dev.hardware[start] == foreign
        assert len(dev.writes) == 1
        assert dev.writes[0] == (start + 3, corrected)
        assert await module._ensure_programmed_heating_operating_mode(
            dev, sender, channel, model
        ) is False
        assert len(dev.writes) == 1

    # A partially migrated device may contain both key-0 and key-7 for
    # precisely the same sender/function/channel. Keep only the right one.
    dev = Hardware("FHK14")
    corrected = bytes.fromhex("FFA60486071E0100")
    old = bytes.fromhex("FFA60486001E0100")
    dev.seed(14, corrected)
    dev.seed(15, old)
    assert await module._ensure_programmed_heating_operating_mode(
        dev, "FF-A6-04-86", 0, "FHK14"
    ) is True
    assert dev.hardware[14] == corrected
    assert dev.hardware[15] == bytes(8)
    assert await module._ensure_programmed_heating_operating_mode(
        dev, "FF-A6-04-86", 0, "FHK14"
    ) is False


async def test_shared_sender_and_temperature_roles():
    dev = Hardware("FHK14")
    assert await module._ensure_programmed_fhk_controller(
        dev, "FF-A6-04-A3", 0, "FHK14", "ha_external"
    )
    assert await module._ensure_programmed_heating_operating_mode(
        dev, "FF-A6-04-A3", 0, "FHK14"
    )
    assert dev.hardware[8] == bytes.fromhex("FFA604A300400100")
    assert dev.hardware[14] == bytes.fromhex("FFA604A3071E0100")

    native = Hardware("F4HK14")
    for channel in range(4):
        sensor = bytes.fromhex("12345678") + bytes((0, 64, 1 << channel, 0))
        native.seed(8 + channel, sensor)
        sender_id = f"FF-A6-04-{0xC0 + channel:02X}"
        assert await module._ensure_programmed_fhk_controller(
            native, sender_id, channel, "F4HK14", "learned_sensor"
        )
        assert await module._ensure_programmed_heating_operating_mode(
            native, sender_id, channel, "F4HK14"
        )
        assert native.hardware[8 + channel] == sensor
        assert native.hardware[16 + channel] == (
            bytes.fromhex(sender_id.replace("-", "")) + bytes((0, 65, 1 << channel, 0))
        )
        assert native.hardware[20 + channel] == (
            bytes.fromhex(sender_id.replace("-", "")) + bytes((7, 30, 1 << channel, 0))
        )


async def test_occupied_or_unconfirmed_are_never_reported_as_success():
    dev = Hardware("F4HK14", memory_size=32)
    for row in range(20, 32):
        dev.seed(row, (0xAA000000 + row).to_bytes(4, "big") + bytes((0, 30, 4, 0)))
    original = list(dev.hardware)
    try:
        await module._ensure_programmed_heating_operating_mode(
            dev, "AA-BB-CC-DD", 0, "F4HK14"
        )
    except RuntimeError as exc:
        assert "kein freier FG4-Eintrag" in str(exc)
    else:
        raise AssertionError("Full FG4 may not overwrite a foreign entry")
    assert dev.hardware == original

    class LostWrite(Hardware):
        async def write_mem_line(self, row, value):
            self.memory[row] = value  # fake acknowledgement; hardware unchanged

    broken = LostWrite("FHK14")
    try:
        await module._ensure_programmed_heating_operating_mode(
            broken, "FF-01-02-03", 0, "FHK14"
        )
    except RuntimeError as exc:
        assert "nicht bestätigt" in str(exc)
    else:
        raise AssertionError("Unconfirmed FG4 writes must be rejected")


def test_sender_map_roles():
    with tempfile.TemporaryDirectory() as tempdir:
        p = Path(tempdir) / "map.json"
        p.write_text(json.dumps({"entries": [{
            "device_id": "FF-BF-5C-86", "sender_id": "00-00-B0-06",
            "sender_eep": "A5-10-06", "device_type": "FHK14",
            "operating_mode_sender_id": "00-00-B0-70",
            "previous_operating_mode_sender_id": "00-00-B0-05",
        }]}), encoding="utf-8")
        data = module.load_sender_map(str(p))
    entry = data["FF-BF-5C-86"][0]
    assert entry["operating_mode_sender_id"] == "00-00-B0-70"
    assert entry["previous_operating_mode_sender_id"] == "00-00-B0-05"


if __name__ == "__main__":
    test_sender_map_roles()
    asyncio.run(test_fg4_per_channel())
    asyncio.run(test_shared_sender_and_temperature_roles())
    asyncio.run(test_legacy_key_zero_is_updated_in_place())
    asyncio.run(test_occupied_or_unconfirmed_are_never_reported_as_success())
    print("Heating operating-mode FG4/F30 tests passed.")
