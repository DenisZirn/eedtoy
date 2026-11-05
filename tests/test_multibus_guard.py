import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
spec = importlib.util.spec_from_file_location('multi_writer', Path(__file__).resolve().parents[1] / 'python/write_senders.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)
state = {'scans': 0, 'stopped': False, 'unlocked': False}
class Bus:
    is_serial_connected = types.SimpleNamespace(wait=lambda **kw: None)
    def __init__(self,*a,**kw): pass
    def start(self): pass
    def is_active(self): return True
    def set_callback(self,*a): pass
    def stop(self): state['stopped'] = True
    def join(self,*a): pass
class Fam:
    async def get_base_id_in_int(self): return 0xFFBB0000
    async def get_base_id_in_bytes(self): return bytes.fromhex('FFBB0000')
async def create(**kw): return Fam()
async def lock(bus): return 'locked'
async def unlock(bus): state['unlocked'] = True
async def enumerate_targets(*args):
    state['scans'] += 1
    if False: yield None
async def fd2g(*args): return []
sys.modules['eltakobus'] = types.ModuleType('eltakobus')
sys.modules['eltakobus'].locking = types.SimpleNamespace(LOCKED='locked',lock_bus=lock,unlock_bus=unlock)
sys.modules['eltakobus.device'] = types.SimpleNamespace(FAM14=Fam,create_busobject=create)
sys.modules['eltakobus.serial'] = types.SimpleNamespace(RS485SerialInterfaceV2=Bus)
sys.modules['eltakobus.util'] = types.SimpleNamespace(b2s=lambda b: '-'.join(f'{x:02X}' for x in b))
writer.enumerate_target_devices = enumerate_targets
writer.ensure_fd2g14_from_yaml = fd2g
async def run():
    with tempfile.TemporaryDirectory() as temp:
        path=Path(temp)/'entries.json'
        entry={'device_id':'FF-AA-00-01','sender_id':'FF-A6-04-81','sender_eep':'A5-38-08','expected_bus_base_id':'FF-AA-00-00'}
        path.write_text(json.dumps({'entries':[entry]}))
        result=await writer.write_senders('TEST',str(path))
        assert result['ok'] is False and 'Falsches Bussystem' in result['error']
        assert state['scans']==0 and state['stopped'] and state['unlocked']
        entry.update(device_id='FF-BB-00-01',expected_bus_base_id='FF-BB-00-00')
        path.write_text(json.dumps({'entries':[entry]}))
        await writer.write_senders('TEST',str(path))
        assert state['scans']==1
    print('Multi-bus guard rejects wrong FAM14 before scanning/writing and releases the bus; matching FAM14 proceeds.')
asyncio.run(run())
