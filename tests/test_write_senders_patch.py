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
    dev.seed(8, bytes.fromhex("03FE03FE03FE03FE"))  # hardware config, NEVER ID
    dev.seed(12, expected)  # legacy FG1
    dev.seed(16, unrelated)  # occupied FG3/PCT14 entry 5
    assert await module._ensure_programmed_controller_profile(dev, "FF-A6-04-A3") is True
    assert dev.hardware[16] == unrelated
    assert dev.hardware[17] == expected
    assert dev.hardware[12] == bytes(8)
    assert dev.hardware[8] == bytes.fromhex("03FE03FE03FE03FE")
    assert await module._ensure_programmed_controller_profile(dev, "FF-A6-04-A3") is False

    # PCT14 group 3 begins at ID entry 5, but a busy entry 5 is NEVER
    # overwritten. The writer may use entries 6, 7, 8, ... instead.
    first_three_taken = ReadbackDevice()
    existing_rows = {
        16: bytes.fromhex("0000B00500510F00"),  # PCT14 entry 5
        17: bytes.fromhex("0000B00600510F00"),  # PCT14 entry 6
        18: bytes.fromhex("0000B00700510F00"),  # PCT14 entry 7
    }
    for row, line in existing_rows.items():
        first_three_taken.seed(row, line)
    assert await module._ensure_programmed_controller_profile(first_three_taken, "FF-A6-04-A3") is True
    assert first_three_taken.hardware[19] == expected  # PCT14 entry 8
    assert first_three_taken._eedtoy_frgbw14_row == 19
    assert all(first_three_taken.hardware[row] == line for row, line in existing_rows.items())
    assert first_three_taken.hardware[8] == bytes(8)
    assert await module._ensure_programmed_controller_profile(first_three_taken, "FF-A6-04-A3") is False

    # If this exact sender ID already exists later in group 3, reuse it
    # without creating a duplicate in the first available lower entry.
    already_later = ReadbackDevice()
    already_later.seed(20, expected)  # PCT14 entry 9
    assert await module._ensure_programmed_controller_profile(already_later, "FF-A6-04-A3") is False
    assert already_later._eedtoy_frgbw14_row == 20
    assert all(already_later.hardware[row] == bytes(8) for row in range(16, 20))

    legacy = ReadbackDevice()
    legacy.seed(12, bytes.fromhex("FFA604A300200100"))
    assert await module._ensure_programmed_controller_profile(legacy, "FF-A6-04-A3") is True
    assert legacy.hardware[12] == bytes(8)
    assert legacy.hardware[16] == expected

    other_sender = ReadbackDevice()
    other_sender.seed(12, unrelated)
    assert await module._ensure_programmed_controller_profile(other_sender, "FF-A6-04-A3") is True
    assert other_sender.hardware[12] == unrelated
    assert other_sender.hardware[16] == expected

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



async def test_frgbw14_ignores_stale_busobject_cache():
    """The physical PCT14 table must win over a stale BusObject cache."""
    class Response:
        def __init__(self, value, row):
            self.value = value
            self.row = row

    class Bus:
        def __init__(self, dev):
            self.dev = dev
            self.reads = []

        async def exchange(self, request, response_type=None):
            row = getattr(request, "row", None)
            if row is None:
                row = getattr(request, "memory_line", None)
            if row is None:
                row = getattr(request, "address", None)
            # EltakoMemoryRequest exposes the memory line as memory_line or
            # memory_address depending on the bus library version.
            if row is None or not isinstance(row, int) or row >= len(self.dev.hardware):
                row = getattr(request, "memory_address", None)
            assert isinstance(row, int), repr(request)
            self.reads.append(row)
            return Response(self.dev.hardware[row], row)

    class StaleDevice(FakeDevice):
        def __init__(self):
            super().__init__(127)
            self.hardware = list(self.memory)
            self.address = 35
            self.bus = Bus(self)

        async def read_mem_line(self, row):
            return self.memory[row]  # deliberately stale

        async def write_mem_line(self, row, value):
            self.hardware[row] = value
            self.memory[row] = value

    # Unit tests run with the system Python, without the bundled eltakobus.
    # Supply only the two message types; the production integration still
    # imports the real library and exchanges actual RS485 telegrams.
    fake_pkg = types.ModuleType("eltakobus")
    fake_messages = types.ModuleType("eltakobus.message")
    class MemoryRequest:
        def __init__(self, address, row):
            self.address = address
            self.row = row
    class MemoryResponse:
        pass
    fake_messages.EltakoMemoryRequest = MemoryRequest
    fake_messages.EltakoMemoryResponse = MemoryResponse
    fake_devices = types.ModuleType("eltakobus.device")
    async def create_busobject(bus, id):
        assert id == 35
        return bus.dev
    fake_devices.create_busobject = create_busobject
    fake_pkg.device = fake_devices
    sys.modules["eltakobus"] = fake_pkg
    sys.modules["eltakobus.message"] = fake_messages
    sys.modules["eltakobus.device"] = fake_devices

    dev = StaleDevice()
    dev.discovery_response = types.SimpleNamespace(model=bytes((0x04, 0xA1, 0, 0)))
    dev.size = 6
    expected = bytes.fromhex("FFA604A300510F00")
    foreign = bytes.fromhex("FFAD246800510F00")
    dev.hardware[8] = bytes.fromhex("03FE03FE03FE03FE")
    dev.hardware[12] = expected      # PCT14 FG1 contains the wrong assignment
    dev.hardware[16] = foreign       # PCT14 FG3 entry 5 is someone else's ID
    dev.memory[16] = expected        # stale false-positive FG3 cache
    assert await module._ensure_programmed_controller_profile(dev, "FF-A6-04-A3") is True
    assert dev.hardware[8] == bytes.fromhex("03FE03FE03FE03FE")
    assert dev.hardware[12] == bytes(8)
    assert dev.hardware[16] == foreign
    assert dev.hardware[17] == expected
    assert 8 in dev.bus.reads and 12 in dev.bus.reads and 16 in dev.bus.reads and 17 in dev.bus.reads



async def test_frgbw14_arbitrary_sender_ids_and_occupied_slots():
    """Program arbitrary controller IDs; do not special-case the testwand IDs."""
    class HardwareDevice(FakeDevice):
        def __init__(self):
            super().__init__(127)
            self.hardware = list(self.memory)

        async def read_mem_line(self, row):
            self.memory[row] = self.hardware[row]
            return self.hardware[row]

        async def write_mem_line(self, row, value):
            self.hardware[row] = value
            self.memory[row] = value

    for sender_id, occupied_slots in (
        ("01-23-45-67", 0),
        ("7A-BB-CC-DD", 1),
        ("FE-12-34-56", 4),
        ("A0-B1-C2-D3", 12),
    ):
        dev = HardwareDevice()
        expected = bytes.fromhex(sender_id.replace("-", "")) + bytes((0, 81, 15, 0))
        foreign = {}
        for offset in range(occupied_slots):
            row = 16 + offset
            value = (1000 + offset).to_bytes(4, "big") + bytes((0, 81, 15, 0))
            foreign[row] = value
            dev.hardware[row] = value
        dev.hardware[8] = bytes.fromhex("03FE03FE03FE03FE")
        dev.hardware[12] = expected
        assert await module._ensure_programmed_controller_profile(dev, sender_id) is True
        assert dev.hardware[16 + occupied_slots] == expected
        assert dev.hardware[12] == bytes(8)
        assert dev.hardware[8] == bytes.fromhex("03FE03FE03FE03FE")
        assert all(dev.hardware[row] == value for row, value in foreign.items())
        assert await module._ensure_programmed_controller_profile(dev, sender_id) is False
        assert sum(
            dev.hardware[row] == expected for row in range(16, 127)
        ) == 1

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

    # PCT14 exports sometimes label a physical four-channel F4HK14 as FHK14.
    # The physical model (04-18) and size=4 must choose the F4HK14 layout:
    # FG1 rows 8..11, FG3 rows 16..19. Both temperature source modes must
    # work per-channel without overwriting siblings.
    misnamed = HeatingDevice("FHK14")
    misnamed.size = 4
    misnamed.discovery_response = types.SimpleNamespace(model=bytes((0x04, 0x18)))
    for channel in range(4):
        sender = f"FF-A6-04-{0xC0 + channel:02X}"
        old = bytes.fromhex(sender.replace("-", "")) + bytes((0, 65, 1 << channel, 0))
        misnamed.seed(16 + channel, old)
        assert await module._ensure_programmed_fhk_controller(
            misnamed, sender, channel, "FHK14", "ha_external"
        ) is True
        assert misnamed.hardware[8 + channel] == (
            bytes.fromhex(sender.replace("-", "")) + bytes((0, 64, 1 << channel, 0))
        )
        assert misnamed.hardware[16 + channel] == bytes(8)
        assert await module._ensure_programmed_fhk_controller(
            misnamed, sender, channel, "FHK14", "ha_external"
        ) is False

    misnamed_sensor = HeatingDevice("FHK14")
    misnamed_sensor.size = 4
    misnamed_sensor.discovery_response = types.SimpleNamespace(model=bytes((0x04, 0x18)))
    for channel in range(4):
        mask = 1 << channel
        sensor = bytes.fromhex("12345678") + bytes((0, 64, mask, 0))
        misnamed_sensor.seed(8 + channel, sensor)
        sender = f"FF-A6-04-{0xC0 + channel:02X}"
        assert await module._ensure_programmed_fhk_controller(
            misnamed_sensor, sender, channel, "FHK14", "learned_sensor"
        ) is True
        assert misnamed_sensor.hardware[8 + channel] == sensor
        assert misnamed_sensor.hardware[16 + channel] == (
            bytes.fromhex(sender.replace("-", "")) + bytes((0, 65, mask, 0))
        )
        assert await module._ensure_programmed_fhk_controller(
            misnamed_sensor, sender, channel, "FHK14", "learned_sensor"
        ) is False

    # The sole FG1 function-64 thermostat of a channel can be deliberately
    # taken over by the new HA room controller, even if its sender ID differs.
    takeover = HeatingDevice("FHK14")
    occupied = bytes.fromhex("0102030400400100")
    takeover.seed(8, occupied)
    assert await module._ensure_programmed_fhk_controller(
        takeover, "FF-A6-04-C0", 0, "FHK14"
    ) is True
    assert takeover.hardware[8] == bytes.fromhex("FFA604C000400100")
    assert await module._ensure_programmed_fhk_controller(
        takeover, "FF-A6-04-C0", 0, "FHK14"
    ) is False

    # No other function or channel may be replaced by this takeover.
    blocked = HeatingDevice("F4HK14")
    blocked.seed(8, bytes.fromhex("01020304001E0100"))
    try:
        await module._ensure_programmed_fhk_controller(blocked, "FF-A6-04-C0", 0, "F4HK14")
    except RuntimeError as exc:
        assert "fremde Funktion" in str(exc)
    else:
        raise AssertionError("A non-thermostat sensor in FG1 must be protected")
    assert blocked.hardware[8] == bytes.fromhex("01020304001E0100")
    assert not any(blocked.hardware[16])

    # Native PCT14 thermostat in FG1 must remain completely unchanged while
    # the HA controller writes the setpoint (function 65) in FG3.
    for model, channels in cases:
        native = HeatingDevice(model)
        group3_base = 10 if model == "FHK14" else (16 if model == "F4HK14" else 12)
        for channel in range(channels):
            mask = 1 << channel
            original_sensor = bytes.fromhex("12345678") + bytes((0, 64, mask, 0))
            native.seed(8 + channel, original_sensor)
            sender = f"FF-A6-04-{0xC0+channel:02X}"
            assert await module._ensure_programmed_fhk_controller(
                native, sender, channel, model, "learned_sensor"
            ) is True
            assert native.hardware[8 + channel] == original_sensor
            assert native.hardware[group3_base + channel] == (
                bytes.fromhex(sender.replace("-", "")) + bytes((0, 65, mask, 0))
            )
            assert await module._ensure_programmed_fhk_controller(
                native, sender, channel, model, "learned_sensor"
            ) is False

    # The native mode never silently writes a setpoint without a real sensor.
    no_sensor = HeatingDevice("FHK14")
    try:
        await module._ensure_programmed_fhk_controller(
            no_sensor, "FF-A6-04-C0", 0, "FHK14", "learned_sensor"
        )
    except RuntimeError as exc:
        assert "kein Temperatursensor" in str(exc)
    else:
        raise AssertionError("Native mode requires a physical FG1 sensor")
    assert not any(no_sensor.hardware[10])

    # Protect a different controller in the channel's FG3 slot.
    occupied_fg3 = HeatingDevice("FHK14")
    occupied_fg3.seed(8, bytes.fromhex("1234567800400100"))
    occupied_fg3.seed(10, bytes.fromhex("ABCDEF0100410100"))
    try:
        await module._ensure_programmed_fhk_controller(
            occupied_fg3, "FF-A6-04-C0", 0, "FHK14", "learned_sensor"
        )
    except RuntimeError as exc:
        assert "anderen Sender" in str(exc)
    else:
        raise AssertionError("FG3 may not overwrite a foreign controller")
    assert occupied_fg3.hardware[8] == bytes.fromhex("1234567800400100")
    assert occupied_fg3.hardware[10] == bytes.fromhex("ABCDEF0100410100")

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


def test_fd2g14_uses_series14_scan():
    source = SCRIPT.read_text(encoding="utf-8")
    assert "enumerate_series14_devices" in source
    assert "Discovery-Modell 04-82" in source
    assert "dev.ensure_programmed(channel, sender_address, profile)" in source
    assert "_ensure_programmed_fsr14ssr" in source
    assert "_ensure_programmed_fms14" in source
    assert "_ensure_programmed_fhk_controller" in source


def test_heating_control_mode_survives_sender_map():
    device_id = "FF-BF-5C-C0"
    template = {
        "device_id": device_id,
        "sender_id": "FF-A6-04-C0",
        "sender_eep": "A5-10-06",
        "device_type": "F4HK14",
    }
    for mode in ("learned_sensor", "ha_external"):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "senders.json"
            path.write_text(json.dumps({
                "entries": [{**template, "heating_control_mode": mode}]
            }), encoding="utf-8")
            sender_map = module.load_sender_map(str(path))
        assert sender_map[device_id][0]["heating_control_mode"] == mode

    # Legacy projects retain the established HA external sensor mode.
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "senders.json"
        path.write_text(json.dumps({"entries": [template]}), encoding="utf-8")
        sender_map = module.load_sender_map(str(path))
    assert sender_map[device_id][0]["heating_control_mode"] == "ha_external"


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
    test_fd2g14_uses_series14_scan()
    test_heating_control_mode_survives_sender_map()
    test_multiple_senders_per_device_are_preserved()
    asyncio.run(test_frgbw14_group_3_function_81())
    asyncio.run(test_frgbw14_ignores_stale_busobject_cache())
    asyncio.run(test_frgbw14_arbitrary_sender_ids_and_occupied_slots())
    asyncio.run(test_heating_group_1_function_64_only())
    asyncio.run(test_f2l14_confirmed_pct14_additive_double_rocker_entry())
    asyncio.run(test_f2l14_mode_change_replaces_existing_sender_and_cleans_duplicates())
    asyncio.run(test_fhk_writer_ignores_duplicate_f2_before_f4())
    asyncio.run(test_fhk_writer_accepts_successful_write_after_lost_ack())
    asyncio.run(test_memory_layouts())
    asyncio.run(test_fms14_writer_dispatch())
    print("R7 sender-write patch tests passed.")
