#!/usr/bin/env python3
import asyncio
import importlib.util
import json
import sys
import tempfile
import types
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

    fms = FakeDevice(128)
    assert await module._ensure_programmed_fms14(fms, "00-00-B0-03", 0) is True
    assert fms.memory[8] == bytes.fromhex("0000B00306030100")
    assert await module._ensure_programmed_fms14(fms, "00-00-B0-03", 0) is False
    assert await module._ensure_programmed_fms14(fms, "00-00-B0-04", 1) is True
    assert fms.memory[9] == bytes.fromhex("0000B00406030200")
    try:
        await module._ensure_programmed_fms14(fms, "00-00-B0-04", 2)
        raise AssertionError("FMS14 channel 3 must be rejected")
    except ValueError:
        pass

    fhk = FakeDevice(20)
    assert await module._ensure_programmed_fhk_controller(fhk, "00-00-B0-06", 0, "FHK14") is True
    assert fhk.memory[12] == bytes.fromhex("0000B00600410100")
    assert await module._ensure_programmed_fhk_controller(fhk, "00-00-B0-06", 0, "FHK14") is False

    f4hk = FakeDevice(24)
    assert await module._ensure_programmed_fhk_controller(f4hk, "00-00-B0-20", 2, "F4HK14") is True
    assert f4hk.memory[18] == bytes.fromhex("0000B02000410400")


async def test_fms14_writer_dispatch():
    class DummyAddressExpression:
        @staticmethod
        def parse(value):
            return value

    class DummyEEP:
        @staticmethod
        def find(value):
            return value

    class DummyDimmerStyle:
        pass

    class DummyHasProgrammableRPS:
        pass

    class DummyWriteError(Exception):
        pass

    fake_modules = {
        "eltakobus": types.SimpleNamespace(AddressExpression=DummyAddressExpression),
        "eltakobus.device": types.SimpleNamespace(DimmerStyle=DummyDimmerStyle, HasProgrammableRPS=DummyHasProgrammableRPS),
        "eltakobus.eep": types.SimpleNamespace(EEP=DummyEEP),
        "eltakobus.util": types.SimpleNamespace(b2s=lambda value: "-".join(f"{byte:02X}" for byte in value), AddressExpression=DummyAddressExpression),
        "eltakobus.error": types.SimpleNamespace(WriteError=DummyWriteError),
    }
    previous = {name: sys.modules.get(name) for name in fake_modules}
    sys.modules.update(fake_modules)
    try:
        dev = FakeDevice(128)
        dev.address = 3
        dev.size = 2
        base = int("FFE4AB00", 16)
        sender_map = {
            "FF-E4-AB-03": [{"sender":{"id":"00-00-B0-03","eep":"F6-02-01"}, "device_type":"FMS14", "name":"FMS14 00-00-00-03 (1/2)"}],
            "FF-E4-AB-04": [{"sender":{"id":"00-00-B0-04","eep":"F6-02-01"}, "device_type":"FMS14", "name":"FMS14 00-00-00-04 (2/2)"}],
        }
        events = await module.ensure_programmed_for_device(base, dev, sender_map)
        assert [event["status"] for event in events] == ["updated", "updated"]
        assert dev.memory[8] == bytes.fromhex("0000B00306030100")
        assert dev.memory[9] == bytes.fromhex("0000B00406030200")
        events = await module.ensure_programmed_for_device(base, dev, sender_map)
        assert [event["status"] for event in events] == ["exists", "exists"]
    finally:
        for name, old_module in previous.items():
            if old_module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = old_module


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
    assert "_ensure_programmed_fms14" in source
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
    asyncio.run(test_fms14_writer_dispatch())
    print("R7 sender-write patch tests passed.")
