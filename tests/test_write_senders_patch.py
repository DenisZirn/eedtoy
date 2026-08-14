#!/usr/bin/env python3
import asyncio
import importlib.util
import json
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "python" / "write_senders.py"
spec = importlib.util.spec_from_file_location("write_senders_patch", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class FakeDevice:
    def __init__(self, memory_size=24):
        self.memory_size = memory_size
        self.memory = [bytes(8) for _ in range(memory_size)]

    async def read_mem_line(self, line):
        return self.memory[line]

    async def write_mem_line(self, line, value):
        self.memory[line] = value


async def test_fhk_multiple_controller_senders():
    dev = FakeDevice(memory_size=24)
    first = module._sender_bytes_from_id("00-00-B0-01") + bytes((0, 65, 1, 0))
    second = module._sender_bytes_from_id("FF-A6-07-01") + bytes((0, 65, 1, 0))
    dev.memory[12] = first

    assert await module._ensure_programmed_fhk_controller(dev, "00-00-B0-01", 0, "FHK14") is False
    assert await module._ensure_programmed_fhk_controller(dev, "FF-A6-07-01", 0, "FHK14") is True
    assert dev.memory[13] == second
    assert await module._ensure_programmed_fhk_controller(dev, "FF-A6-07-01", 0, "FHK14") is False


async def test_memory_layouts():
    fsr = FakeDevice(20)
    assert await module._ensure_programmed_fsr14ssr(fsr, "00-00-B0-15", 0) is True
    assert fsr.memory[12] == bytes.fromhex("0000B01500330100")
    assert await module._ensure_programmed_fsr14ssr(fsr, "00-00-B0-15", 0) is False
    assert await module._ensure_programmed_fsr14ssr(fsr, "00-00-B0-16", 1) is True
    assert fsr.memory[13] == bytes.fromhex("0000B01600330200")

    fhk = FakeDevice(20)
    assert await module._ensure_programmed_fhk_controller(fhk, "00-00-B0-06", 0, "FHK14") is True
    assert fhk.memory[12] == bytes.fromhex("0000B00600410100")
    assert await module._ensure_programmed_fhk_controller(fhk, "00-00-B0-06", 0, "FHK14") is False

    f4hk = FakeDevice(24)
    assert await module._ensure_programmed_fhk_controller(f4hk, "00-00-B0-20", 2, "F4HK14") is True
    assert f4hk.memory[18] == bytes.fromhex("0000B02000410400")


def test_target_addresses():
    base = int("FFBF5C80", 16)
    sender_map = {
        "FF-BF-5C-82": {},
        "FF-BF-5C-83": {},
        "FF-BF-5C-95": {},
        "FF-BF-5C-96": {},
        "FF-BF-5C-B8": {},
    }
    assert module.target_bus_addresses(base, sender_map) == [2, 3, 21, 22, 56]


def test_fd2g14_uses_grimm_scan():
    source = SCRIPT.read_text(encoding="utf-8")
    assert "enumerate_bus_grimm" in source
    assert "Discovery-Modell 04-82" in source
    assert "dev.ensure_programmed(channel, sender_address, profile)" in source
    assert "_ensure_programmed_fsr14ssr" in source
    assert "_ensure_programmed_fhk_controller" in source


def test_multiple_senders_per_device_are_preserved():
    payload = {"entries": [{"device_id":"FF-F2-6C-8B","sender_id":"00-00-B0-0B","sender_eep":"H5-3F-7F","name":"FSB14 Kanal 1"},{"device_id":"FF-F2-6C-8B","sender_id":"FF-A6-07-0B","sender_eep":"H5-3F-7F","name":"FSB14 Kanal 1"},{"device_id":"FF-F2-6C-8B","sender_id":"00-00-B0-0B","sender_eep":"H5-3F-7F","name":"duplicate"}]}
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "senders.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        sender_map = module.load_sender_map(str(path))
    entries = sender_map["FF-F2-6C-8B"]
    assert len(entries) == 2
    assert {entry["sender"]["id"] for entry in entries} == {"00-00-B0-0B", "FF-A6-07-0B"}


if __name__ == "__main__":
    test_target_addresses()
    test_fd2g14_uses_grimm_scan()
    test_multiple_senders_per_device_are_preserved()
    asyncio.run(test_fhk_multiple_controller_senders())
    asyncio.run(test_memory_layouts())
    print("R7 sender-write patch tests passed.")
