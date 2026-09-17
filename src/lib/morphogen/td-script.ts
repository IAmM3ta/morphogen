export const TD_CALLBACKS = `# Morphogen → TouchDesigner WebSocket DAT callbacks
# 1. Add a WebSocket DAT, set it to Server, Active on, port 9980
# 2. Paste this into the DAT's callbacks
# 3. In Morphogen, open Sync and Connect to ws://127.0.0.1:9980
#    (use wss://host:port if Morphogen is served over HTTPS)
#
# Suggested CHOPs / TOPs:
#   - Table DAT named 'morphogen_json' (this script fills it)
#   - Script CHOP to unpack field/sensors
#   - Script TOP to rebuild the 16×16 grid as a texture

import json

def onConnect(dat, webSocket):
    print('Morphogen connected')
    return

def onDisconnect(dat, webSocket):
    print('Morphogen disconnected')
    return

def onReceiveText(dat, rowIndex, message):
    try:
        data = json.loads(message)
    except Exception:
        return
    table = op('morphogen_json') if op('morphogen_json') else None
    if table is None:
        return
    table.clear()
    table.appendRow(['path', 'value'])
    if not isinstance(data, dict):
        return
    params = data.get('params') or {}
    field = data.get('field') or {}
    sensors = data.get('sensors') or {}
    audio = data.get('audio') or {}
    loop = data.get('loop') or {}
    for k, v in params.items():
        table.appendRow(['/morphogen/params/' + str(k), v])
    for k, v in field.items():
        table.appendRow(['/morphogen/field/' + str(k), v])
    for k, v in sensors.items():
        table.appendRow(['/morphogen/sensors/' + str(k), v])
    for k, v in audio.items():
        table.appendRow(['/morphogen/audio/' + str(k), v])
    for k, v in loop.items():
        table.appendRow(['/morphogen/loop/' + str(k), v])
    grid = data.get('grid')
    if isinstance(grid, list):
        gdat = op('morphogen_grid')
        if gdat is not None:
            gdat.clear()
            # 16 rows of 16
            for y in range(16):
                gdat.appendRow(grid[y*16:(y+1)*16])
    return

def onReceiveBinary(dat, contents):
    return
`;

export const MIDI_MAP = [
  { cc: 20, name: "Feed" },
  { cc: 21, name: "Kill" },
  { cc: 22, name: "Energy" },
  { cc: 23, name: "Mean V" },
  { cc: 24, name: "Centroid X" },
  { cc: 25, name: "Centroid Y" },
  { cc: 26, name: "Mic RMS" },
  { cc: 27, name: "Gyro γ" },
  { cc: 28, name: "Gyro β" },
  { cc: 29, name: "Edge" },
] as const;
