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
    dev = FD2G14([None, TimeoutError(), Response(14,b'bad'), None, None, None])
    writer._prepare_fd2g14_memory_access(dev)
    try: await dev.read_mem_line(14)
    except TimeoutError as error: assert 'Zeile 14' in str(error)
    else: raise AssertionError('missing reply must fail')
    assert len(dev.bus.calls) == 6
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
    writer.enumerate_series14_devices=no_scan
    processed=set()
    events=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,processed)
    assert events[0]['status']=='updated'
    assert calls==[('discover',41),('discover',41),('write',0,'00-00-B0-29')]
    assert await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,processed)==[]

    # If the first bus scan already discovered the physical FD2G14, do not
    # rediscover it and never fall back to the generic writer.
    reused=FD2G14([])
    reuse_calls=[]
    async def reuse_program(channel,sender,profile):
        reuse_calls.append(channel)
        return False
    reused.ensure_programmed=reuse_program
    async def forbidden_discovery(**kwargs):
        raise AssertionError('FD2G14 was already discovered; no second scan allowed')
    devices.create_busobject=forbidden_discovery
    result=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,set(),{41:reused})
    assert result[0]['status']=='exists'
    assert reuse_calls==[0]

    transient=FD2G14([])
    transient_calls=[]
    async def transient_program(channel,sender,profile):
        transient_calls.append(channel)
        if len(transient_calls)==1:
            raise TimeoutError('transient FD2G14 memory read timeout')
        return True
    transient.ensure_programmed=transient_program
    async def transient_discover(**kwargs): return transient
    devices.create_busobject=transient_discover
    events=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,set())
    assert events[0]['status']=='updated'
    assert transient_calls==[0,0]

    # Repeated failure still gets an error and must not be treated as success.
    failed=FD2G14([])
    failed_calls=[]
    async def failed_program(channel,sender,profile):
        failed_calls.append(channel)
        raise TimeoutError('permanent memory read timeout')
    failed.ensure_programmed=failed_program
    async def failed_discover(**kwargs): return failed
    devices.create_busobject=failed_discover
    events=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,set())
    assert events[0]['status']=='error'
    assert failed_calls==[0,0,0]

    wrong=FD2G14([]);wrong.address=57
    wrong.ensure_programmed=lambda *args: (_ for _ in ()).throw(AssertionError('wrong actor'))
    async def wrong_discover(**kwargs):return wrong
    async def wrong_scan(bus):yield wrong
    devices.create_busobject=wrong_discover
    writer.enumerate_series14_devices=wrong_scan
    events=await writer.ensure_fd2g14_from_yaml(None,0xFFBF5C80,target,set())
    assert events[0]['status']=='error'

    # A permanent failure at the first FD2G14 ID-table row applies to the
    # same physical memory for all 16 channels. Stop hammering row 14 for
    # each channel; defer the other logical IDs to the fresh RS485 session.
    first_two = {
        'FF-BF-5C-A9': [{'device_type': 'FD2G14', 'sender': {'id': '00-00-B0-29', 'eep': 'A5-38-08'}}],
        'FF-BF-5C-AA': [{'device_type': 'FD2G14', 'sender': {'id': '00-00-B0-2A', 'eep': 'A5-38-08'}}],
    }
    class BrokenTable(FD2G14):
        def __init__(self):
            super().__init__([])
            self.discovery_response = types.SimpleNamespace(model=bytes((0x04, 0x82)))
            self.operations = []
        async def ensure_programmed(self, channel, sender, profile):
            self.operations.append(channel)
            raise TimeoutError(
                'FD2G14 Basisadresse 41: keine gültige Speicherantwort für Zeile 14 nach 6 Versuchen'
            )
    broken_table = BrokenTable()
    devices.create_busobject = lambda **kwargs: None
    async def fixed_discovery(**kwargs): return broken_table
    devices.create_busobject = fixed_discovery
    errors = await writer.ensure_fd2g14_from_yaml(None, 0xFFBF5C80, first_two, set())
    assert [e['status'] for e in errors] == ['error', 'error']
    assert broken_table.operations == [0, 0, 0], (
        'Only the first channel may retry the unreadable memory table in this session'
    )
    assert all(writer._fd2g14_is_read_timeout(e) for e in errors)

    # One manual second run works because the bus is closed and reopened.
    # Verify the top-level recovery genuinely starts a SECOND session and
    # limits its channel set to failed FD2G14 IDs. Successful channels and
    # other devices must not be programmed again.
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.json') as path:
        original_session = writer._write_senders_session
        sessions = []
        async def sessions_stub(port, sender_map_path, baud_rate=57600,
                                gateway_type='fam14', only_fd2g_ids=None):
            sessions.append(None if only_fd2g_ids is None else set(only_fd2g_ids))
            if only_fd2g_ids is None:
                return {'ok': True, 'events': [
                    {'status': 'exists', 'device_type': 'FSB14',
                     'device_id': 'FF-BF-5C-82', 'message': 'Unchanged'},
                    {'status': 'exists', 'device_type': 'FD2G14',
                     'device_id': 'FF-BF-5C-A9', 'message': 'Already programmed'},
                    {'status': 'error', 'device_type': 'FD2G14',
                     'device_id': 'FF-BF-5C-AA',
                     'message': 'FD2G14 Basisadresse 41: keine gültige Speicherantwort für Zeile 14 nach 6 Versuchen'},
                    {'status': 'error', 'device_type': 'FHK14',
                     'device_id': 'FF-BF-5C-C0', 'message': 'Unrelated problem'},
                ]}
            assert only_fd2g_ids == {'FF-BF-5C-AA'}
            return {'ok': True, 'events': [
                {'status': 'exists', 'device_type': 'FD2G14',
                 'device_id': 'FF-BF-5C-AA', 'message': 'Sender-ID exists'},
            ]}
        writer._write_senders_session = sessions_stub
        try:
            result = await writer.write_senders('TEST',path.name)
            assert sessions == [None, {'FF-BF-5C-AA'}]
            assert result['fd2g14_recovered'] == 1
            assert result['counts'] == {'exists': 3, 'error': 1}
            assert 'neuer RS485-Verbindung' in result['events'][2]['message']
            assert result['events'][3]['status'] == 'error'

            # If the freshly reopened bus still fails, never report success.
            async def still_broken(*args, **kwargs):
                if kwargs.get('only_fd2g_ids') is None:
                    return await sessions_stub(*args, **kwargs)
                return {'ok': False, 'error': 'No bus lock', 'events': []}
            writer._write_senders_session = still_broken
            unsuccessful = await writer.write_senders('TEST',path.name)
            assert unsuccessful['fd2g14_recovered'] == 0
            assert unsuccessful['counts'] == {'exists': 2, 'error': 2}
            assert 'No bus lock' in unsuccessful['events'][2]['message']
        finally:
            writer._write_senders_session = original_session

    print('FD2G14: transient/stale replies, exhausted reads, lost ACK readback, direct discovery retry, completed channels and wrong-address rejection passed.')
asyncio.run(run())
