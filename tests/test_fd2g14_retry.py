"""Exercise missing, stale and lost-ACK FD2G14 replies without hardware."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('writer', root/'python/write_senders.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)

class Request:
    def __init__(self, address, row): self.address, self.row = address, row
class Response:
    def __init__(self, row, value): self.row, self.value = row, value
messages = types.ModuleType('eltakobus.message')
messages.EltakoMemoryRequest, messages.EltakoMemoryResponse = Request, Response
sys.modules['eltakobus'] = types.ModuleType('eltakobus')
sys.modules['eltakobus.message'] = messages

class Bus:
    def __init__(self, replies): self.replies, self.calls = list(replies), []
    async def exchange(self, request, response_type, **options):
        self.calls.append(request.row)
        response = self.replies.pop(0)
        if isinstance(response, Exception): raise response
        return response
class FD2G14:
    address, size = 41, 16
    def __init__(self, replies):
        self.memory = [None]*127
        self.bus = Bus(replies)
        self.writes = []
    async def write_mem_line(self, row, value):
        self.writes.append((row,value))
        raise TimeoutError('lost ACK')

async def run():
    value = bytes.fromhex('0000B02900200000')
    dev = FD2G14([None, Response(15,bytes(8)), Response(14,value)])
    writer._prepare_fd2g14_memory_access(dev)
    assert await dev.read_mem_line(14) == value
    assert dev.bus.calls == [14,14,14]
    assert await dev.read_mem_line(14) == value and len(dev.bus.calls)==3
    writer._prepare_fd2g14_memory_access(dev)  # no recursive wrapping
    dev.bus.replies = [Response(14,value)]
    await dev.write_mem_line(14,value)
    assert len(dev.writes)==1 and len(dev.bus.calls)==4
    dev = FD2G14([None,TimeoutError(),Response(14,b'bad')])
    writer._prepare_fd2g14_memory_access(dev)
    try: await dev.read_mem_line(14)
    except TimeoutError as error: assert 'Zeile 14' in str(error)
    else: raise AssertionError('missing reply must fail')
    assert dev.memory[14] is None and not dev.writes
    other = types.SimpleNamespace()
    writer._prepare_fd2g14_memory_access(other)
    assert not hasattr(other,'read_mem_line')

    devices=types.ModuleType('eltakobus.device')
    eep=types.ModuleType('eltakobus.eep')
    eep.EEP=types.SimpleNamespace(find=lambda value:value)
    sys.modules['eltakobus.eep']=eep
    sys.modules['eltakobus'].AddressExpression=types.SimpleNamespace(parse=lambda value:value)
    sys.modules['eltakobus.device']=devices
    target={'FF-BF-5C-A9':[{'device_type':'FD2G14','sender':{'id':'00-00-B0-29','eep':'A5-38-08'}}]}
    calls=[]
    good=FD2G14([])
    async def program(channel,sender,profile):
        calls.append(('write',channel,sender));return True
    good.ensure_programmed=program
    responses=[None,good]
    async def discover(**kwargs):
        calls.append(('discover',kwargs['id']));return responses.pop(0)
    devices.create_busobject=discover
    async def no_scan(bus):
        raise AssertionError('full scan not needed');yield
    writer.enumerate_bus_grimm=no_scan
    processed=set()
    events=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,processed)
    assert events[0]['status']=='updated'
    assert calls==[('discover',41),('discover',41),('write',0,'00-00-B0-29')]
    assert await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,processed)==[]

    wrong=FD2G14([]);wrong.address=57
    wrong.ensure_programmed=lambda *args: (_ for _ in ()).throw(AssertionError('wrong actor'))
    async def wrong_discover(**kwargs):return wrong
    async def wrong_scan(bus):yield wrong
    devices.create_busobject=wrong_discover
    writer.enumerate_bus_grimm=wrong_scan
    events=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,set())
    assert events[0]['status']=='error'
    print('FD2G14: transient/stale replies, exhausted reads, lost ACK readback, direct discovery retry, completed channels and wrong-address rejection passed.')
asyncio.run(run())
