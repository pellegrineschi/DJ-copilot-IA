#!/usr/bin/env python3
"""Read-only ALSA sequencer -> JSON lines. Stdlib + system libasound, no pip.

One named duplex virtual port for Mixxx/PortMidi discovery. This process never
writes MIDI events; it only receives telemetry from the separate Mixxx mapping.
"""
import ctypes as C
import ctypes.util
import json
import os
import signal
import sys
import time


def emit(kind, **kwargs):
    print(json.dumps(dict(type=kind, **kwargs)), flush=True)


def main():
    if not os.path.exists('/dev/snd/seq'):
        emit('error', message='ALSA MIDI no disponible: falta /dev/snd/seq. Ejecutá el puente en tu sesión Ubuntu con ALSA sequencer habilitado.')
        return 1
    lib = C.CDLL(ctypes.util.find_library('asound') or 'libasound.so.2')
    def bind(name, result, args):
        fn = getattr(lib, name)
        fn.restype, fn.argtypes = result, args
        return fn
    ptr = C.c_void_p
    open_seq = bind('snd_seq_open', C.c_int, [C.POINTER(ptr), C.c_char_p, C.c_int, C.c_int])
    close_seq = bind('snd_seq_close', C.c_int, [ptr])
    name_seq = bind('snd_seq_set_client_name', C.c_int, [ptr, C.c_char_p])
    port_seq = bind('snd_seq_create_simple_port', C.c_int, [ptr, C.c_char_p, C.c_uint, C.c_uint])
    client_id = bind('snd_seq_client_id', C.c_int, [ptr])
    input_seq = bind('snd_seq_event_input', C.c_int, [ptr, C.POINTER(ptr)])
    free_event = bind('snd_seq_free_event', C.c_int, [ptr])
    new_parser = bind('snd_midi_event_new', C.c_int, [C.c_size_t, C.POINTER(ptr)])
    free_parser = bind('snd_midi_event_free', None, [ptr])
    decode = bind('snd_midi_event_decode', C.c_long, [ptr, C.POINTER(C.c_ubyte), C.c_long, ptr])
    strerror = bind('snd_strerror', C.c_char_p, [C.c_int])
    seq, parser = ptr(), ptr()
    def checked(code):
        if code < 0:
            raise RuntimeError(strerror(code).decode('utf-8', errors='replace'))
        return code
    checked(open_seq(C.byref(seq), b'default', 3, 1))  # DUPLEX, NONBLOCK
    try:
        checked(name_seq(seq, b'DJ Copilot IA'))
        # READ | WRITE | SUBS_READ | SUBS_WRITE; MIDI_GENERIC | APPLICATION
        port = checked(port_seq(seq, b'DJ Copilot IA', 1 | 2 | 32 | 64, 2 | (1 << 20)))
        checked(new_parser(4096, C.byref(parser)))
        emit('ready', address=f'{client_id(seq)}:{port}')
        running = True
        def stop(_sig, _frame):
            nonlocal running
            running = False
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        buf = (C.c_ubyte * 4096)()
        while running:
            event = ptr()
            code = input_seq(seq, C.byref(event))
            if code == -11:  # EAGAIN, poll at 50 Hz; telemetry itself is only 2 Hz
                time.sleep(0.02)
                continue
            checked(code)
            if event:
                try:
                    size = decode(parser, buf, len(buf), event)
                    if size > 0:
                        emit('midi', bytes=list(buf[:size]))
                finally:
                    free_event(event)
    finally:
        if parser:
            free_parser(parser)
        close_seq(seq)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        emit('error', message=str(error))
        sys.exit(1)
