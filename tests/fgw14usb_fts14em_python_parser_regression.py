from pathlib import Path
import importlib.util
p = Path(__file__).resolve().parents[1] / 'python' / 'learn_device_id.py'
spec = importlib.util.spec_from_file_location('eedtoy_learn', p)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class WrappedRPS:
    org = 0x05
    address = bytes.fromhex('00 00 10 01')
    data = bytes([0x70])
    body = bytes([0x8B,0x05,0x70,0,0,0,0,0,0x10,0x01,0])

parsed = mod.extract_id_from_message(WrappedRPS())
assert parsed is not None, parsed
assert parsed['id'] == '00-00-10-01', parsed
assert parsed['rorg'] == '05', parsed
assert parsed['data_byte3'] == 0x70, parsed
print('FGW14-USB wrapped FTS14EM RPS parser regression passed.')
