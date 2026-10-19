"""Exercise the actual RS485 callback with interleaved bus/radio messages."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import threading
import types
import unittest
from unittest.mock import patch

script = Path(__file__).resolve().parents[1] / "python" / "learn_device_id.py"
spec = importlib.util.spec_from_file_location("eedtoy_learn_radio", script)
learn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learn)


def message(sid="FE-EF-D6-D5", org=0x05, sequence=0x8B, data=b"\x70\x00\x00\x00", **attributes):
    address = bytes.fromhex(sid.replace("-", ""))
    return types.SimpleNamespace(
        body=bytes([sequence, org]) + data + address + b"\x30",
        address=address, org=org, data=data[:1], **attributes,
    )


class RadioButtonLearningTests(unittest.TestCase):
    def receive(self, messages, mode="fam14", **options):
        instances = []

        class FakeBus:
            def __init__(self, port, **kwargs):
                self.options = kwargs
                self.stopped = False
                self.joined = False
                self.is_serial_connected = threading.Event()
                self.is_serial_connected.set()
                instances.append(self)

            def start(self):
                for item in messages:
                    self.options["callback"](item)

            def stop(self):
                self.stopped = True

            def join(self, timeout):
                self.joined = True

        serial = types.ModuleType("eltakobus.serial")
        serial.RS485SerialInterfaceV2 = FakeBus
        with patch.dict(sys.modules, {"eltakobus": types.ModuleType("eltakobus"), "eltakobus.serial": serial}):
            with contextlib.redirect_stderr(io.StringIO()):
                result = learn.listen_rs485("COM3", mode, 0, **options)
        self.assertTrue(instances[0].stopped)
        self.assertTrue(instances[0].joined)
        return result, instances[0].options

    def test_real_button_ids_without_a_fixed_prefix(self):
        for sid in ("FE-EF-D6-D5", "00-25-92-7A", "01-A0-45-5D", "FF-F3-A0-80"):
            for org in (0x05, 0xF6):
                with self.subTest(sid=sid, org=org):
                    self.assertEqual(learn.extract_radio_id_from_message(message(sid, org), "radio-rps")["id"], sid)

    def test_all_short_bus_ids_are_rejected(self):
        for value in range(256):
            self.assertIsNone(learn.extract_radio_id_from_message(message(f"00-00-00-{value:02X}"), "radio-rps"))

    def test_other_telegrams_control_frames_and_echoes_are_rejected(self):
        for org in (0x06, 0x07, 0xA5, 0xD5, 0xD2, 0xF2, 0xF4, 0xFF):
            self.assertIsNone(learn.extract_radio_id_from_message(message(org=org), "radio-rps"))
        for sequence in (0x6B, 0xAB):
            self.assertIsNone(learn.extract_radio_id_from_message(message(sequence=sequence), "radio-rps"))
        self.assertIsNone(learn.extract_radio_id_from_message(message(outgoing=True), "radio-rps"))
        self.assertIsNone(learn.extract_radio_id_from_message(message(data=b"\x70\x01\x00\x00"), "radio-rps"))
        self.assertIsNone(learn.extract_radio_id_from_message(types.SimpleNamespace(body=b"\x05"), "radio-rps"))
        self.assertIsNone(learn.extract_radio_id_from_message(types.SimpleNamespace(address="FE-EF-D6-D5"), "radio-rps"))

    def test_all_sensor_families_accept_real_ids_and_skip_short_bus_ids(self):
        families = (("radio-rps", (0x05, 0xF6), b"\x70\x00\x00\x00"),
                    ("radio-1bs", (0x06, 0xD5), b"\x09\x00\x00\x00"),
                    ("radio-4bs", (0x07, 0xA5), b"\x10\x10\x0D\x87"))
        for learn_filter, orgs, data in families:
            for org in orgs:
                for sid in ("FE-EF-D6-D5", "00-25-92-7A", "01-A0-45-5D"):
                    with self.subTest(filter=learn_filter, org=org, sid=sid):
                        self.assertEqual(learn.extract_radio_id_from_message(message(sid, org, data=data), learn_filter)["id"], sid)
                for address in range(256):
                    self.assertIsNone(learn.extract_radio_id_from_message(message(f"00-00-00-{address:02X}", org, data=data), learn_filter))
                for sequence in (0x6B, 0xAB):
                    self.assertIsNone(learn.extract_radio_id_from_message(message(org=org, sequence=sequence, data=data), learn_filter))
                self.assertIsNone(learn.extract_radio_id_from_message(message(org=org, data=data, outgoing=True), learn_filter))
            for other_filter, other_orgs, other_data in families:
                if other_filter == learn_filter:
                    continue
                self.assertIsNone(learn.extract_radio_id_from_message(message(org=other_orgs[0], data=other_data), learn_filter))

    def test_1bs_and_4bs_teach_in_and_regular_data(self):
        for data in (b"\x00\x00\x00\x00", b"\x09\x00\x00\x00"):
            self.assertIsNotNone(learn.extract_radio_id_from_message(message(org=0x06, data=data), "radio-1bs"))
        self.assertIsNone(learn.extract_radio_id_from_message(message(org=0x06, data=b"\x09\x01\x00\x00"), "radio-1bs"))
        for data in (b"\x10\x10\x0D\x87", b"\x00\x7F\xFF\x09"):
            self.assertIsNotNone(learn.extract_radio_id_from_message(message(org=0x07, data=data), "radio-4bs"))

    def test_1bs_and_4bs_wait_past_other_physical_sensors_and_bus_traffic(self):
        families = (("radio-1bs", 0x06, b"\x09\x00\x00\x00"),
                    ("radio-4bs", 0x07, b"\x10\x10\x0D\x87"))
        for learn_filter, org, data in families:
            for mode in ("fam14", "fgw14usb", "fam-usb"):
                with self.subTest(filter=learn_filter, mode=mode):
                    messages = [message("00-00-00-12"), message("00-00-00-39", org, data=data),
                                message("01-A0-45-5D", 0x05), message(org=org, sequence=0x6B, data=data),
                                message(org=org, data=data)]
                    result, _ = self.receive(messages, mode, learn_filter=learn_filter)
                    self.assertTrue(result["ok"])
                    self.assertEqual(result["id"], "FE-EF-D6-D5")

    def test_native_vld_sensor_objects(self):
        def vld(sid="FE-EF-D6-D5", outgoing=False):
            return types.SimpleNamespace(org=0xD2, address=bytes.fromhex(sid.replace("-", "")),
                                         data=b"\x01\x02\x03\x04\x05\x06", outgoing=outgoing)
        for sid in ("FE-EF-D6-D5", "00-25-92-7A"):
            self.assertEqual(learn.extract_radio_id_from_message(vld(sid), "radio-vld")["id"], sid)
        for address in range(256):
            self.assertIsNone(learn.extract_radio_id_from_message(vld(f"00-00-00-{address:02X}"), "radio-vld"))
        self.assertIsNone(learn.extract_radio_id_from_message(vld(outgoing=True), "radio-vld"))
        self.assertIsNone(learn.extract_radio_id_from_message(message(org=0xD2), "radio-vld"))
        result, _ = self.receive([message("00-00-00-12"), vld()], learn_filter="radio-vld")
        self.assertEqual(result["id"], "FE-EF-D6-D5")

    def test_bus_traffic_then_button_on_all_existing_gateway_modes(self):
        noise = [message("00-00-00-12"), message("00-00-00-39"), message(org=0xA5), message(sequence=0x6B)]
        for mode, baud, delay in (("fam14", 57600, 0.001), ("fgw14usb", 57600, 0.01), ("fam-usb", 9600, 0.2)):
            with self.subTest(mode=mode):
                result, options = self.receive(noise + [message(), message("00-25-92-7A")], mode, learn_filter="radio-rps")
                self.assertTrue(result["ok"])
                self.assertEqual(result["id"], "FE-EF-D6-D5", "First matching button wins, never the bus actor")
                self.assertEqual(options["baud_rate"], baud)
                self.assertEqual(options["delay_message"], delay)

    def test_noise_only_does_not_succeed(self):
        result, _ = self.receive([message("00-00-00-12"), message(org=0x07)], learn_filter="radio-rps")
        self.assertFalse(result["ok"])

    def test_unfiltered_bus_learning_is_preserved(self):
        result, _ = self.receive([message("00-00-00-12")])
        self.assertTrue(result["ok"])
        self.assertEqual(result["id"], "00-00-00-12")

    def test_fts14em_still_counts_five_bus_presses(self):
        press = message("00-00-10-01")
        release = message("00-00-10-01", data=b"\x00\x00\x00\x00")
        result, _ = self.receive([press, release] * 5, mode="fgw14usb", repeat_count=5,
                                 required_rorg=0x05, required_data_byte3=0x70)
        self.assertEqual(result["id"], "00-00-10-01")
        self.assertEqual(result["repeat_count"], 5)


if __name__ == "__main__":
    unittest.main()
