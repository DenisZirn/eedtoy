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
    result=await detector.detect_write_gateway('COM2','FF-BB-00-00',strict_port=True)
    assert not result['ok'] and calls==[('COM2',57600,'fam14')]
    assert len(result['ports'])==3  # Do not hide the primary FAM-USB from the shared port list.
    calls.clear()
    result=await detector.detect_write_gateway('com3','FF-BB-00-00',strict_port=True)
    assert result['ok'] and result['portPath']=='COM3' and len(calls)==1
    calls.clear()
    result=await detector.detect_write_gateway('COM2','FF-BB-00-00')
    assert result['ok'] and result['portPath']=='COM3', 'A cached port must not prevent finding another bus.'
    calls.clear()
    async def slow_probe(port,baud,target):
        calls.append((port,baud,target))
        if baud==57600:return {'ok':False,'error':'no response'}
        return {'ok':True,'gateway':{'type':'fam14','base_id':'FF-BB-00-00'}}
    detector.try_rs485_port=slow_probe
    result=await detector.detect_write_gateway('COM3','FF-BB-00-00',strict_port=True)
    assert result['ok'] and result['baudRate']==9600
    assert calls==[('COM3',57600,'fam14'),('COM3',9600,'fam14')]
    calls.clear()
    result=await detector.detect_write_gateway('','invalid')
    assert not result['ok'] and not calls
    detector.list_ports=lambda preferred: []
    result=await detector.detect_write_gateway('', 'FF-BB-00-00')
    assert not result['ok']
    calls.clear()
    result=await detector.detect_write_gateway('', 'FF-BB-00-00', candidate_ports=['COM9','com9'])
    assert result['ok'] and result['portPath']=='COM9' and len(result['ports'])==1
    assert calls==[('COM9',57600,'fam14'),('COM9',9600,'fam14')]
    calls.clear()
    result=await detector.detect_write_gateway('COM7', 'FF-BB-00-00', strict_port=True, candidate_ports=['COM9'])
    assert result['ok'] and result['portPath']=='COM7'
    assert all(call[0]=='COM7' for call in calls)
    def broken_list(preferred): raise RuntimeError('port enumeration failed')
    detector.list_ports=broken_list
    result=await detector.detect_write_gateway('', 'FF-BB-00-00', candidate_ports=['COM9'])
    assert result['ok'] and result['portPath']=='COM9'
    print('Write-gateway discovery: empty port, multiple buses, FAM-USB exclusion, strict manual port, invalid base and no ports passed.')
asyncio.run(run())

# Exercise the real script with the same isolated interpreter flag as Electron.
import subprocess
import json
result = subprocess.run([sys.executable, '-I', str(ROOT/'python/detect_write_gateway.py'), '--expected-base-id', 'invalid'], capture_output=True, text=True, check=True)
assert json.loads(result.stdout)['ok'] is False
assert 'ModuleNotFoundError' not in result.stderr
print('Isolated embedded-Python launch can load the sibling detector module.')

# Windows embedded Python ignores encoding environment variables under -I.
# Exercise a non-UTF-8 stdout code page and split transport bytes individually.
code = """
import importlib.util, sys
sys.stdout.reconfigure(encoding='cp1252')
spec = importlib.util.spec_from_file_location('write_detector', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.jprint({'ok': False, 'error': 'Kein passendes FAM14 für Basis-ID FF-E4-AB-00 gefunden. Erkannte Bussysteme: COM3 (FF-BF-5C-80).', 'details': 'Ungültig: äöü ÄÖÜ ß –'})
"""
result = subprocess.run([sys.executable, '-I', '-c', code, str(ROOT/'python/detect_write_gateway.py')], capture_output=True, check=True)
assert result.stdout.isascii(), result.stdout
transport = ''.join(bytes([byte]).decode('utf-8') for byte in result.stdout)
message = json.loads(transport)
assert 'für Basis-ID FF-E4-AB-00' in message['error']
assert message['details'] == 'Ungültig: äöü ÄÖÜ ß –'
assert '\ufffd' not in message['error']
print('Write-gateway JSON preserves German characters under isolated cp1252 stdout and split transport chunks.')
