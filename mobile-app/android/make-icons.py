import struct, zlib, os, math

RES = 'app/src/main/res'

def render(S, shape, heart_ratio, K=3):
    """shape: 'squircle' | 'circle' | 'none'；heart_ratio: 心形宽度占画布比例"""
    N = S * K
    px = bytearray(N * N * 4)
    cx = cy = N / 2.0
    hs = N * heart_ratio / 2.0          # 心形尺度
    rad = N * 0.22                      # 圆角半径
    for y in range(N):
        for x in range(N):
            i = (y * N + x) * 4
            inside = True
            if shape == 'squircle':
                dx = abs(x - cx) - (cx - rad); dy = abs(y - cy) - (cy - rad)
                if dx < 0: dx = 0
                if dy < 0: dy = 0
                inside = (dx * dx + dy * dy) <= rad * rad
            elif shape == 'circle':
                inside = ((x - cx) ** 2 + (y - cy) ** 2) <= (N / 2.0) ** 2
            if not inside:
                px[i + 3] = 0
                continue
            if shape == 'none':
                px[i + 3] = 0
            else:
                t = (x + y) / (2.0 * N)
                r = int(0x34 + (0x05 - 0x34) * t)
                g = int(0xd3 + (0x96 - 0xd3) * t)
                b = int(0x99 + (0x69 - 0x99) * t)
                px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255
            # 心形（白色）
            nx = (x - cx) / hs
            ny = -(y - cy) / hs + 0.08
            if (nx * nx + ny * ny - 1) ** 3 - nx * nx * (ny ** 3) <= 0:
                px[i] = 255; px[i+1] = 255; px[i+2] = 255; px[i+3] = 255
    # 降采样
    out = bytearray(S * S * 4)
    inv = K * K
    for y in range(S):
        for x in range(S):
            ar = ag = ab = aa = 0
            for j in range(K):
                base = ((y * K + j) * N + x * K) * 4
                for k in range(K):
                    ii = base + k * 4
                    a = px[ii + 3]
                    ar += px[ii] * a; ag += px[ii+1] * a; ab += px[ii+2] * a; aa += a
            o = (y * S + x) * 4
            if aa:
                out[o] = ar // aa; out[o+1] = ag // aa; out[o+2] = ab // aa
            out[o+3] = aa // inv
    return bytes(out)

def png(S, rgba):
    raw = bytearray()
    for y in range(S):
        raw.append(0)
        raw += rgba[y*S*4:(y+1)*S*4]
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))

plan = [
    ('mipmap-mdpi',    48,  108),
    ('mipmap-hdpi',    72,  162),
    ('mipmap-xhdpi',   96,  216),
    ('mipmap-xxhdpi', 144,  324),
    ('mipmap-xxxhdpi',192,  432),
]
total = 0
for folder, sq, fg in plan:
    d = os.path.join(RES, folder)
    # 方形（圆角）
    open(os.path.join(d, 'ic_launcher.png'), 'wb').write(png(sq, render(sq, 'squircle', 0.56)))
    # 圆形
    open(os.path.join(d, 'ic_launcher_round.png'), 'wb').write(png(sq, render(sq, 'circle', 0.52)))
    # adaptive 前景（透明底白心，系统负责圆形/圆角裁切）
    open(os.path.join(d, 'ic_launcher_foreground.png'), 'wb').write(png(fg, render(fg, 'none', 0.46)))
    total += 3
    print(f'{folder}: {sq}px 方/圆 + {fg}px 前景')

# 预览图
open('icon-preview.png', 'wb').write(png(192, render(192, 'squircle', 0.56)))
print('共生成', total, '个图标')
