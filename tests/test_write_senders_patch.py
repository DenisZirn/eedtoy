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


async def test_frgbw14_group_3_function_81():
    class ReadbackDevice(FakeDevice):
        """Simulate a real actuator separately from the BusObject memory cache."""
        def __init__(self, memory_size=127):
            super().__init__(memory_size)
            self.hardware = list(self.memory)

        def seed(self, row, value):
            self.hardware[row] = value
            self.memory[row] = value

        async def read_mem_line(self, row):
            self.memory[row] = self.hardware[row]
            return self.hardware[row]

        async def write_mem_line(self, row, value):
            self.hardware[row] = value
            self.memory[row] = value

    expected = bytes.fromhex("FFA604A300510F00")
    unrelated = bytes.fromhex("0000B00100330100")

    dev = ReadbackDevice()
    dev.seed(8, expected)
    dev.seed(12, unrelated)
    assert await module._ensure_programmed_controller_profile(dev, "FF-A6-04-A3") is True
    assert dev.hardware[12] == unrelated
    assert dev.hardware[13] == expected
    assert dev.hardware[8] == bytes(8)
    assert await module._ensure_programmed_controller_profile(dev, "FF-A6-04-A3") is False

    # PCT14 group 3 begins at ID entry 5, but a busy entry 5 is NEVER
    # overwritten. The writer may use entries 6, 7, 8, ... instead.
    first_three_taken = ReadbackDevice()
    existing_rows = {
        12: bytes.fromhex("0000B00500510F00"),  # PCT14 entry 5
        13: bytes.fromhex("0000B00600510F00"),  # PCT14 entry 6
        14: bytes.fromhex("0000B00700510F00"),  # PCT14 entry 7
    }
    for row, line in existing_rows.items():
        first_three_taken.seed(row, line)
    assert await module._ensure_programmed_controller_profile(first_three_taken, "FF-A6-04-A3") is True
    assert first_three_taken.hardware[15] == expected  # PCT14 entry 8
    assert first_three_taken._eedtoy_frgbw14_row == 15
    assert all(first_three_taken.hardware[row] == line for row, line in existing_rows.items())
    assert first_three_taken.hardware[8] == bytes(8)
    assert await module._ensure_programmed_controller_profile(first_three_taken, "FF-A6-04-A3") is False

    # If this exact sender ID already exists later in group 3, reuse it
    # without creating a duplicate in the first available lower entry.
    already_later = ReadbackDevice()
    already_later.seed(16, expected)  # PCT14 entry 9
    assert await module._ensure_programmed_controller_profile(already_later, "FF-A6-04-A3") is False
    assert already_later._eedtoy_frgbw14_row == 16
    assert all(already_later.hardware[row] == bytes(8) for row in range(12, 16))

    legacy = ReadbackDevice()
    legacy.seed(8, bytes.fromhex("FFA604A300200100"))
    assert await module._ensure_programmed_controller_profile(legacy, "FF-A6-04-A3") is True
    assert legacy.hardware[8] == bytes(8)
    assert legacy.hardware[12] == expected

    other_sender = ReadbackDevice()
    other_sender.seed(8, unrelated)
    assert await module._ensure_programmed_controller_profile(other_sender, "FF-A6-04-A3") is True
    assert other_sender.hardware[8] == unrelated
    assert other_sender.hardware[12] == expected

    class BrokenWrite(ReadbackDevice):
        async def write_mem_line(self, row, value):
            # ACK is simulated but hardware memory never changes.
            self.memory[row] = value

    broken = BrokenWrite()
    try:
        await module._ensure_programmed_controller_profile(broken, "FF-A6-04-A3")
    except RuntimeError as exc:
        assert "nicht bestätigt" in str(exc)
    else:
        raise AssertionError("FRGBW14 must reject unconfirmed writes")


class HeatingDevice(FakeDevice):
    """Keep actuator contents independent from the eltakobus read cache."""

    def __init__(self, device_type, memory_size=32):
        super().__init__(memory_size)
        self.device_type = device_type
        self.size = 4 if device_type == "F4HK14" else (
            1 if device_type == "FHK14" else 2
        )
        self.hardware = list(self.memory)

    def seed(self, row, data):
        self.hardware[row] = data
        self.memory[row] = data

    async def read_mem_line(self, row):
        self.memory[row] = self.hardware[row]
        return self.hardware[row]

    async def write_mem_line(self, row, data):
        self.hardware[row] = data
        self.memory[row] = data


async def test_heating_group_1_function_64_only():
    cases = [
        ("FHK14", 1),
        ("F4HK14", 4),
        ("FAE14LPR", 2),
        ("FAE14SSR", 2),
    ]
    for model, channels in cases:
        dev = HeatingDevice(model)
        group3_base = 10 if model == "FHK14" else (16 if model == "F4HK14" else 12)
        unrelated = bytes.fromhex("AABBCCDD00410100")
        for channel in range(channels):
            sender = f"FF-A6-04-{0xC0 + channel:02X}"
            mask = 1 << channel
            old_row = group3_base + channel
            old_entry = module._sender_bytes_from_id(sender) + bytes((0, 65, mask, 0))
            dev.seed(old_row, old_entry)
        # Unrelated learned IDs cannot be touched.
        if model == "F4HK14":
            dev.seed(20, unrelated)
        for channel in range(channels):
            sender = f"FF-A6-04-{0xC0 + channel:02X}"
            expected = module._sender_bytes_from_id(sender) + bytes((0, 64, 1 << channel, 0))
            assert await module._ensure_programmed_fhk_controller(dev, sender, channel, model) is True
            assert dev.hardware[8 + channel] == expected
            assert not any(dev.hardware[group3_base + channel])
            assert await module._ensure_programmed_fhk_controller(dev, sender, channel, model) is False
        if model == "F4HK14":
            assert dev.hardware[20] == unrelated

    # Refuse to replace a controller belonging to another sender.
    blocked = HeatingDevice("F4HK14")
    occupied = bytes.fromhex("0102030400400100")
    blocked.seed(8, occupied)
    try:
        await module._ensure_programmed_fhk_controller(blocked, "FF-A6-04-C0", 0, "F4HK14")
    except RuntimeError as exc:
        assert "anderen Sender-ID" in str(exc)
    else:
        raise AssertionError("A foreign controller in function group 1 must be protected")
    assert blocked.hardware[8] == occupied
    assert not any(blocked.hardware[16])

    # Remove function 65 for the same ID even if found in a different
    # slot of the old function-group section, but leave other IDs intact.
    migrated = HeatingDevice("FHK14")
    old = bytes.fromhex("FFA604C000410100")
    migrated.seed(13, old)
    migrated.seed(10, unrelated)
    assert await module._ensure_programmed_fhk_controller(migrated, "FF-A6-04-C0", 0, "FHK14") is True
    assert migrated.hardware[8] == bytes.fromhex("FFA604C000400100")
    assert migrated.hardware[13] == bytes(8)
    assert migrated.hardware[10] == unrelated


async def test_f2l14_confirmed_pct14_additive_double_rocker_entry():
    dev = FakeDevice(memory_size=127)
    assert await module._ensure_programmed_f2l14(dev, "00-00-B0-3C", "additive") is True
    assert dev.memory[8] == bytes.fromhex("0000B03C07380301")
    assert await module._ensure_programmed_f2l14(dev, "00-00-B0-3C", "additive") is False

    dev.memory[8] = bytes.fromhex("07130D0307380301")
    assert await module._ensure_programmed_f2l14(dev, "00-00-B0-3C", "additive") is True
    assert dev.memory[9] == bytes.fromhex("0000B03C07380301")

    exclusive = FakeDevice(memory_size=127)
    assert await module._ensure_programmed_f2l14(exclusive, "00-00-B0-3C", "exclusive") is True
    assert exclusive.memory[8] == bytes.fromhex("0000B03C07380300")


async def test_f2l14_mode_change_replaces_existing_sender_and_cleans_duplicates():
    dev = FakeDevice(memory_size=127)
    physical_button = bytes.fromhex("07130D0307380301")
    exclusive = bytes.fromhex("0000B03C07380300")
    additive = bytes.fromhex("0000B03C07380301")
    dev.memory[8] = physical_button
    dev.memory[9] = exclusive

    # Changing the same HA sender from exclusive to additive must reuse row 9.
    assert await module._ensure_programmed_f2l14(dev, "00-00-B0-3C", "additive") is True
    assert dev.memory[8] == physical_button
    assert dev.memory[9] == additive
    assert not any(dev.memory[10])

    # Repair the duplicate layout produced by the previous test build.
    dev.memory[10] = exclusive
    assert await module._ensure_programmed_f2l14(dev, "00-00-B0-3C", "additive") is True
    assert dev.memory[8] == physical_button
    assert dev.memory[9] == additive
    assert not any(dev.memory[10])
    assert await module._ensure_programmed_f2l14(dev, "00-00-B0-3C", "additive") is False


async def test_fhk_writer_ignores_duplicate_f2_before_f4():
    class DummyWriteError(Exception):
        pass

    class DummyEltakoMessage:
        def __init__(self, org, address, payload=bytes(8)):
            self.org = org
            self.address = address
            self.payload = payload

    class DuplicateF2Bus:
        def __init__(self):
            self.select_count = 0
            self.write_count = 0

        async def exchange(self, request, response_type=None):
            if request.org == 0xF2:
                self.select_count += 1
                return DummyEltakoMessage(0xF2, request.address)
            self.write_count += 1
            return DummyEltakoMessage(0xF2 if self.write_count == 1 else 0xF4, request.address)

    fake_modules = {
        "eltakobus.error": types.SimpleNamespace(WriteError=DummyWriteError),
        "eltakobus.message": types.SimpleNamespace(EltakoMessage=DummyEltakoMessage),
    }
    previous = {name: sys.modules.get(name) for name in fake_modules}
    sys.modules.update(fake_modules)
    try:
        dev = FakeDevice(24)
        dev.address = 0x1D
        dev.bus = DuplicateF2Bus()
        value = bytes.fromhex("0000B01D00410100")
        await module._write_fhk_mem_line(dev, 10, value)
        assert dev.bus.select_count == 1
        assert dev.bus.write_count == 2
        assert dev.memory[10] == value
    finally:
        for name, old_module in previous.items():
            if old_module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = old_module


async def test_fhk_writer_accepts_successful_write_after_lost_ack():
    class DummyWriteError(Exception):
        pass

    class DummyEltakoMessage:
        def __init__(self, org, address, payload=bytes(8)):
            self.org = org
            self.address = address
            self.payload = payload

    class AckLostBus:
        def __init__(self):
            self.write_count = 0
            self.stored = {}

        async def exchange(self, request, response_type=None):
            if request.org == 0xF2:
                return DummyEltakoMessage(0xF2, request.address)
            self.write_count += 1
            self.stored[request.address] = request.payload
            return DummyEltakoMessage(0xF2, request.address)

    class ReadbackDevice(FakeDevice):
        async def read_mem_line(self, line):
            if self.memory[line] is None:
                self.memory[line] = self.bus.stored.get(line, bytes(8))
            return self.memory[line]

    fake_modules = {
        "eltakobus.error": types.SimpleNamespace(WriteError=DummyWriteError),
        "eltakobus.message": types.SimpleNamespace(EltakoMessage=DummyEltakoMessage),
    }
    previous = {name: sys.modules.get(name) for name in fake_modules}
    sys.modules.update(fake_modules)
    try:
        dev = ReadbackDevice(24)
        dev.address = 0x1D
        dev.bus = AckLostBus()
        value = bytes.fromhex("0000B01D00410100")
        await module._write_fhk_mem_line(dev, 10, value)
        assert dev.bus.write_count == 1
        assert dev.memory[10] == value
    finally:
        for name, old_module in previous.items():
            if old_module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = old_module


async def test_memory_layouts():
    fsr = FakeDevice(20)
    assert await module._ensure_programmed_fsr14ssr(fsr, "00-00-B0-15", 0) is True
    assert fsr.memory[12] == bytes.fromhex("0000B01500330100")
    assert await module._ensure_programmed_fsr14ssr(fsr, "00-00-B0-15", 0) is False
    assert await module._ensure_programmed_fsr14ssr(fsr, "00-00-B0-16", 1) is True
    assert fsr.memory[13] == bytes.fromhex("0000B01600330200")

    fms = FakeDevice(128)
    assert await module._ensure_programmed_fms14(fms, "00-00-B0-03", 0) is True
    assert fms.memory[8] == bytes.fromhex("0000B00300330100")
    assert await module._ensure_programmed_fms14(fms, "00-00-B0-03", 0) is False
    assert await module._ensure_programmed_fms14(fms, "00-00-B0-04", 1) is True
    assert fms.memory[9] == bytes.fromhex("0000B00400330200")

    legacy_fms = FakeDevice(128)
    legacy_fms.memory[17] = bytes.fromhex("0000B00306030100")
    assert await module._ensure_programmed_fms14(legacy_fms, "00-00-B0-03", 0) is True
    assert legacy_fms.memory[17] == bytes.fromhex("0000B00300330100")
    assert not any(legacy_fms.memory[8])
    try:
        await module._ensure_programmed_fms14(fms, "00-00-B0-04", 2)
        raise AssertionError("FMS14 channel 3 must be rejected")
    except ValueError:
        pass

    # The three heating device families now learn only function 64 in FG1.
    for model, count in (("FHK14", 1), ("F4HK14", 4), ("FAE14LPR", 2), ("FAE14SSR", 2)):
        heater = HeatingDevice(model)
        for channel in range(count):
            sender = f"00-00-B0-{0x06 + channel:02X}"
            assert await module._ensure_programmed_fhk_controller(
                heater, sender, channel, model
            ) is True
            expected = module._sender_bytes_from_id(sender) + bytes((0, 64, 1 << channel, 0))
            assert heater.hardware[8 + channel] == expected

    # Unchanged FHK14 low-level F2/F4 handshake is tested independently below.


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
            "FF-E4-AB-03": [{"sender":{"id":"00-00-B0-03","eep":"A5-38-08"}, "device_type":"FMS14", "name":"FMS14 00-00-00-03 (1/2)"}],
            "FF-E4-AB-04": [{"sender":{"id":"00-00-B0-04","eep":"A5-38-08"}, "device_type":"FMS14", "name":"FMS14 00-00-00-04 (2/2)"}],
        }
        events = await module.ensure_programmed_for_device(base, dev, sender_map)
        assert [event["status"] for event in events] == ["updated", "updated"]
        assert dev.memory[8] == bytes.fromhex("0000B00300330100")
        assert dev.memory[9] == bytes.fromhex("0000B00400330200")
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
    asyncio.run(test_frgbw14_group_3_function_81())
    asyncio.run(test_heating_group_1_function_64_only())
    asyncio.run(test_f2l14_confirmed_pct14_additive_double_rocker_entry())
    asyncio.run(test_f2l14_mode_change_replaces_existing_sender_and_cleans_duplicates())
    asyncio.run(test_fhk_writer_ignores_duplicate_f2_before_f4())
    asyncio.run(test_fhk_writer_accepts_successful_write_after_lost_ack())
    asyncio.run(test_memory_layouts())
    asyncio.run(test_fms14_writer_dispatch())
    print("R7 sender-write patch tests passed.")
