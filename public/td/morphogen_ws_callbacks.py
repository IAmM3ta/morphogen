# MORPHOS → TouchDesigner  ·  IIHQ Tutorial 087 wiring
# Recipe: Feedback TOP → Blur → Sharpen → Level → Transform → back
# https://www.youtube.com/watch?v=s4ytd8PThJM
#
# 1. WebSocket DAT  ·  Server  ·  Active  ·  port 9980
# 2. Paste this into the DAT callbacks
# 3. Add Table DATs: morphogen_json , morphogen_grid
# 4. (Optional) Name your 087 loop ops exactly:
#      feedback1   Feedback TOP
#      blur        Blur TOP
#      sharpen     Image Filter (sharpen)
#      level1      Level TOP
#      xform       Transform TOP
#    This script will ride their parameters live.
# 5. Pixels: NDI / Spout / Window COMP of the MORPHOS canvas.
#    This socket is the knobs. The canvas is the chemical.
#
# MORPHOS Sync → ws://127.0.0.1:9980
# HTTPS page needs wss:// on the TD side.

import json

def onConnect(dat, webSocket):
    print('MORPHOS connected')
    return

def onDisconnect(dat, webSocket):
    print('MORPHOS disconnected')
    return

def _set(name, attr, val):
    o = op(name)
    if o is None:
        return
    try:
        p = getattr(o.par, attr)
        if hasattr(p, 'val'):
            p.val = val
        else:
            setattr(o.par, attr, val)
    except Exception:
        pass

def _pulse(name, attr):
    o = op(name)
    if o is None:
        return
    try:
        getattr(o.par, attr).pulse()
    except Exception:
        pass

def onReceiveText(dat, rowIndex, message):
    try:
        data = json.loads(message)
    except Exception:
        return
    if not isinstance(data, dict):
        return
    if data.get('hello'):
        print('hello', data.get('hello'), data.get('recipe'))
        return

    table = op('morphogen_json')
    if table is not None:
        table.clear()
        table.appendRow(['path', 'value'])
        def walk(prefix, obj):
            if not isinstance(obj, dict):
                return
            for k, v in obj.items():
                if isinstance(v, dict):
                    walk(prefix + '/' + str(k), v)
                elif not isinstance(v, list):
                    table.appendRow([prefix + '/' + str(k), v])
        walk('/morphogen', data)

    fb = data.get('feedback') or {}
    if fb:
        _set('blur', 'size', fb.get('blur', 8))
        _set('sharpen', 'amount', fb.get('sharpen', 1))
        _set('level1', 'opacity', fb.get('opacity', 0.7))
        _set('level1', 'gamma1', fb.get('gamma', 0.6))
        _set('level1', 'contrast', fb.get('contrast', 1))
        _set('xform', 'scale', fb.get('scale', 1.001))
        _set('xform', 'rotate', fb.get('rotate', 0))
        _set('xform', 'tx', fb.get('tx', 0))
        _set('xform', 'ty', fb.get('ty', 0))
        if fb.get('reset'):
            _pulse('feedback1', 'resetpulse')

    grid = data.get('grid')
    if isinstance(grid, list):
        gdat = op('morphogen_grid')
        if gdat is not None:
            gdat.clear()
            n = 16
            for y in range(n):
                gdat.appendRow(grid[y*n:(y+1)*n])
    return

def onReceiveBinary(dat, contents):
    return
