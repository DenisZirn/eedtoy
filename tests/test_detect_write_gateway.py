import asyncio
import importlib.util
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'python'))
spec=importlib.util.spec_from_file_location('write_detector',ROOT/'python/detect_write_gateway.py')
detector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(detector)
async def run():
    calls=[]
    detector.list_ports=lambda preferred: [{'path':'COM1'},{'path':'COM2'},{'path':'COM3'}]
    async def probe(port,baud,target):
        calls.append((port,baud,target))
        if port=='COM1': return {'ok':True,'gateway':{'type':'fam-usb','base_id':'FF-A6-04-80'}}
        return {'ok':True,'gateway':{'type':'fam14','base_id':'FF-AA-00-00' if port=='COM2' else 'FF-BB-00-00'}}
    detector.try_rs485_port=probe
    result=await detector.detect_write_gateway('', 'FF-BB-00-00')
    assert result['ok'] and result['portPath']=='COM3'
    assert len(calls)==3 and all(c[1:]==(57600,'fam14') for c in calls)
    calls.clear()
    result=await detector.detect_write_gateway('COM2','FF-BB-00-00')
    assert not result['ok'] and calls==[('COM2',57600,'fam14')]
    assert len(result['ports'])==3  # Do not hide the primary FAM-USB from the shared port list.
    calls.clear()
    result=await detector.detect_write_gateway('com3','FF-BB-00-00')
    assert result['ok'] and result['portPath']=='COM3' and len(calls)==1
    calls.clear()
    result=await detector.detect_write_gateway('','invalid')
    assert not result['ok'] and not calls
    detector.list_ports=lambda preferred: []
    result=await detector.detect_write_gateway('', 'FF-BB-00-00')
    assert not result['ok']
    print('Write-gateway discovery: empty port, multiple buses, FAM-USB exclusion, strict manual port, invalid base and no ports passed.')
asyncio.run(run())

# Exercise the real script with the same isolated interpreter flag as Electron.
import subprocess
import json
result = subprocess.run([sys.executable, '-I', str(ROOT/'python/detect_write_gateway.py'), '--expected-base-id', 'invalid'], capture_output=True, text=True, check=True)
assert json.loads(result.stdout)['ok'] is False
assert 'ModuleNotFoundError' not in result.stderr
print('Isolated embedded-Python launch can load the sibling detector module.')
