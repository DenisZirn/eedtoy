#!/usr/bin/env python3
"""Discover the selected FAM14 for programming without changing HA gateway detection."""
import argparse
import asyncio
import json
import re
import importlib.util
from pathlib import Path

# The embedded runtime uses -I, so sibling modules are loaded by their exact
# application path rather than adding the working directory to sys.path.
_spec = importlib.util.spec_from_file_location('_eedtoy_detector', Path(__file__).with_name('detect_gateway.py'))
_shared = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_shared)
def jprint(obj):
    # Embedded Python runs with -I and ignores PYTHONIOENCODING. Keep the JSON
    # transport ASCII-only so Windows code pages cannot corrupt German text.
    print(json.dumps(obj, ensure_ascii=True), flush=True)


list_ports = _shared.list_ports
try_rs485_port = _shared.try_rs485_port


def normalize_base(value):
    raw = re.sub(r'[-: ]', '', str(value or '')).upper()
    if not re.fullmatch(r'[0-9A-F]{8}', raw):
        return ''
    return '-'.join(raw[i:i+2] for i in range(0, 8, 2))


async def detect_write_gateway(preferred_path='', expected_base_id='', strict_port=False, candidate_ports=None):
    expected = normalize_base(expected_base_id)
    if not expected or expected == '00-00-00-00':
        return {'ok': False, 'error': 'Ungültige FAM14-Basis-ID für das ausgewählte Bussystem.', 'ports': []}
    try:
        available_ports = list_ports(preferred_path)
    except Exception:
        available_ports = []
    seen = {port['path'].upper() for port in available_ports}
    for path in ([preferred_path] if preferred_path else []) + list(candidate_ports or []):
        path = str(path).strip()
        if path and path.upper() not in seen:
            available_ports.append({'path': path, 'source': 'electron'})
            seen.add(path.upper())
    ports = available_ports
    if preferred_path and strict_port:
        ports = [port for port in ports if port['path'].upper() == preferred_path.upper()]
    attempts = []
    found = []
    for port in ports:
        # Match the existing manual FAM14 detector, including its 9600 fallback.
        for baud_rate in (57600, 9600):
            result = await try_rs485_port(port['path'], baud_rate, 'fam14')
            gateway = result.get('gateway') or {}
            actual = normalize_base(gateway.get('base_id'))
            matched = bool(result.get('ok') and actual == expected and gateway.get('type') == 'fam14')
            attempts.append({'path': port['path'], 'base_id': actual, 'baudRate': baud_rate,
                             'ok': matched, 'error': result.get('error', '')})
            if matched:
                return {'ok': True, 'portPath': port['path'], 'baseId': actual, 'gatewayType': 'fam14',
                        'baudRate': baud_rate, 'ports': available_ports, 'attempts': attempts}
            if result.get('ok') and gateway.get('type') == 'fam-usb':
                break
            if actual and gateway.get('type') == 'fam14':
                found.append(f"{port['path']} ({actual})")
                break  # A different bus will not acquire another base ID at a second baud rate.
    error = f'Kein passendes FAM14 für Basis-ID {expected} gefunden.'
    if found:
        error += ' Erkannte Bussysteme: ' + ', '.join(found) + '.'
    return {'ok': False, 'error': error, 'ports': available_ports, 'attempts': attempts}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preferred', default='')
    parser.add_argument('--mode', default='fam14', choices=['fam14'])
    parser.add_argument('--expected-base-id', required=True)
    parser.add_argument('--strict-port', action='store_true')
    parser.add_argument('--candidate-port', action='append', default=[])
    args = parser.parse_args()
    try:
        jprint(await detect_write_gateway(args.preferred.strip(), args.expected_base_id, args.strict_port, args.candidate_port))
    except Exception as error:
        jprint({'ok': False, 'error': str(error), 'ports': []})


if __name__ == '__main__':
    asyncio.run(main())
