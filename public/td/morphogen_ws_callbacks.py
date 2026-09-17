# Morphogen → TouchDesigner WebSocket DAT callbacks
# 1. Add a WebSocket DAT, set it to Server, Active on, port 9980
# 2. Paste this into the DAT's callbacks (or point the DAT at this file)
# 3. Create Table DATs named 'morphogen_json' and 'morphogen_grid'
# 4. In Morphogen, open Sync and Connect to ws://127.0.0.1:9980
#    If Morphogen is served over HTTPS, expose this socket as wss://
#
# MIDI alternative: enable MIDI in Morphogen and map CCs 20–29 in a MIDI In CHOP.

import json

def onConnect(dat, webSocket):
    print("Morphogen connected")
    return

def onDisconnect(dat, webSocket):
    print("Morphogen disconnected")
    return

def onReceiveText(dat, rowIndex, message):
    try:
        data = json.loads(message)
    except Exception:
        return
    table = op("morphogen_json") if op("morphogen_json") else None
    if table is None:
        return
    table.clear()
    table.appendRow(["path", "value"])
    if not isinstance(data, dict):
        return
    params = data.get("params") or {}
    field = data.get("field") or {}
    sensors = data.get("sensors") or {}
    audio = data.get("audio") or {}
    loop = data.get("loop") or {}
    for k, v in params.items():
        table.appendRow(["/morphogen/params/" + str(k), v])
    for k, v in field.items():
        table.appendRow(["/morphogen/field/" + str(k), v])
    for k, v in sensors.items():
        table.appendRow(["/morphogen/sensors/" + str(k), v])
    for k, v in audio.items():
        table.appendRow(["/morphogen/audio/" + str(k), v])
    for k, v in loop.items():
        table.appendRow(["/morphogen/loop/" + str(k), v])
    grid = data.get("grid")
    if isinstance(grid, list):
        gdat = op("morphogen_grid")
        if gdat is not None:
            gdat.clear()
            for y in range(16):
                gdat.appendRow(grid[y * 16 : (y + 1) * 16])
    return

def onReceiveBinary(dat, contents):
    return
