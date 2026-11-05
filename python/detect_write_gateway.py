#!/usr/bin/env python3
"""Discover the selected FAM14 for programming without changing HA gateway detection."""
import argparse
import asyncio
import re
import importlib.util
from pathlib import Path

# The embedded runtime uses -I, so sibling modules are loaded by their exact
# application path rather than adding the working directory to sys.path.
_spec = importlib.util.spec_from_file_location('_eedtoy_detector', Path(__file__).with_name('detect_gateway.py'))
_shared = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_shared)
jprint = _shared.jprint
list_ports = _shared.list_ports
try_rs485_port = _shared.try_rs485_port


def normalize_base(value):
    raw = re.sub(r'[-: ]', '', str(value or '')).upper()
    if not re.fullmatch(r'[0-9A-F]{8}', raw):
        return ''
    return '-'.join(raw[i:i+2] for i in range(0, 8, 2))


async def detect_write_gateway(preferred_path='', expected_base_id=''):
    expected = normalize_base(expected_base_id)
    if not expected or expected == '00-00-00-00':
        return {'ok': False, 'error': 'Ungültige FAM14-Basis-ID für das ausgewählte Bussystem.', 'ports': []}
    available_ports = list_ports(preferred_path)
    ports = available_ports
    if preferred_path:
        ports = [port for port in ports if port['path'].upper() == preferred_path.upper()]
    attempts = []
    found = []
    for port in ports:
        # Same FAM14 handshake as the existing detector, at the programming baud rate.
        result = await try_rs485_port(port['path'], 57600, 'fam14')
        gateway = result.get('gateway') or {}
        actual = normalize_base(gateway.get('base_id'))
        matched = bool(result.get('ok') and actual == expected and gateway.get('type') == 'fam14')
        attempts.append({'path': port['path'], 'base_id': actual, 'ok': matched, 'error': result.get('error', '')})
        if matched:
            return {'ok': True, 'portPath': port['path'], 'baseId': actual, 'gatewayType': 'fam14',
                    'baudRate': 57600, 'ports': available_ports, 'attempts': attempts}
        if actual:
            found.append(f"{port['path']} ({actual})")
    error = f'Kein passendes FAM14 für Basis-ID {expected} gefunden.'
    if found:
        error += ' Erkannte Bussysteme: ' + ', '.join(found) + '.'
    return {'ok': False, 'error': error, 'ports': available_ports, 'attempts': attempts}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preferred', default='')
    parser.add_argument('--mode', default='fam14', choices=['fam14'])
    parser.add_argument('--expected-base-id', required=True)
    args = parser.parse_args()
    try:
        jprint(await detect_write_gateway(args.preferred.strip(), args.expected_base_id))
    except Exception as error:
        jprint({'ok': False, 'error': str(error), 'ports': []})


if __name__ == '__main__':
    asyncio.run(main())
