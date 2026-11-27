#!/usr/bin/env python3
"""
素材フォルダのフォント（SVG カラーフォント .otf）と、書き出し済みの動画から
サイト用のファイルを作る。

  python3 tools/build_fonts.py <素材フォルダ> <サイトのフォルダ>

作るもの
  assets/glyphs/<フォント名>/A.svg … 各文字の絵（Chrome はこの形式のフォントを表示できないため画像にする）
  fonts/chimerabet-metrics.otf     … 字送りだけのフォント（ロゴ用。絵は画像で重ねる）
  js/assets.js                     … 上の素材と assets/ 内の動画の一覧（サイトが読み込む）
"""
import gzip
import json
import os
import re
import struct
import sys
import unicodedata

LETTERS = [chr(c) for c in range(ord('A'), ord('Z') + 1)]


# ---------------------------------------------------------------- フォントの読み込み
def read_tables(b):
    n = struct.unpack('>H', b[4:6])[0]
    tabs = {}
    for i in range(n):
        tag, cs, off, ln = struct.unpack('>4sIII', b[12 + 16 * i:28 + 16 * i])
        tabs[tag.decode('latin1')] = (off, ln, cs)
    return tabs


def font_name(b, tabs):
    off = tabs['name'][0]
    _, cnt, so = struct.unpack('>HHH', b[off:off + 6])
    names = {}
    for i in range(cnt):
        pid, eid, lid, nid, ln, o = struct.unpack('>HHHHHH', b[off + 6 + 12 * i:off + 18 + 12 * i])
        s = b[off + so + o:off + so + o + ln]
        try:
            v = s.decode('utf-16-be') if pid in (0, 3) else s.decode('latin1')
        except UnicodeDecodeError:
            continue
        names.setdefault(nid, v)
    return names.get(4) or names.get(1) or ''


def char_to_glyph(b, tabs):
    off = tabs['cmap'][0]
    nt = struct.unpack('>H', b[off + 2:off + 4])[0]
    c2g = {}
    for i in range(nt):
        pid, eid, so = struct.unpack('>HHI', b[off + 4 + 8 * i:off + 12 + 8 * i])
        so += off
        fmt = struct.unpack('>H', b[so:so + 2])[0]
        if fmt == 4:
            segx2 = struct.unpack('>H', b[so + 6:so + 8])[0]
            seg = segx2 // 2
            ends = struct.unpack('>%dH' % seg, b[so + 14:so + 14 + segx2])
            starts = struct.unpack('>%dH' % seg, b[so + 16 + segx2:so + 16 + 2 * segx2])
            deltas = struct.unpack('>%dh' % seg, b[so + 16 + 2 * segx2:so + 16 + 3 * segx2])
            rpos = so + 16 + 3 * segx2
            rofs = struct.unpack('>%dH' % seg, b[rpos:rpos + segx2])
            for k, (s, e) in enumerate(zip(starts, ends)):
                if s == 0xFFFF:
                    continue
                for c in range(s, e + 1):
                    if rofs[k] == 0:
                        g = (c + deltas[k]) & 0xFFFF
                    else:
                        p = rpos + 2 * k + rofs[k] + 2 * (c - s)
                        g = struct.unpack('>H', b[p:p + 2])[0]
                        if g:
                            g = (g + deltas[k]) & 0xFFFF
                    c2g.setdefault(c, g)
        elif fmt == 12:
            ng = struct.unpack('>I', b[so + 12:so + 16])[0]
            for k in range(ng):
                s, e, g0 = struct.unpack('>III', b[so + 16 + 12 * k:so + 28 + 12 * k])
                for c in range(s, e + 1):
                    c2g.setdefault(c, g0 + c - s)
    return c2g


def svg_docs(b, tabs):
    if 'SVG ' not in tabs:
        return {}
    so = tabs['SVG '][0]
    dl = so + struct.unpack('>I', b[so + 2:so + 6])[0]
    ne = struct.unpack('>H', b[dl:dl + 2])[0]
    docs = {}
    for i in range(ne):
        sg, eg, do, dln = struct.unpack('>HHII', b[dl + 2 + 12 * i:dl + 14 + 12 * i])
        d = b[dl + do:dl + do + dln]
        if d[:2] == b'\x1f\x8b':
            d = gzip.decompress(d)
        for g in range(sg, eg + 1):
            docs[g] = d.decode('utf-8')
    return docs


def advances(b, tabs):
    ho = tabs['hhea'][0]
    nhm = struct.unpack('>H', b[ho + 34:ho + 36])[0]
    hm = tabs['hmtx'][0]
    adv = [struct.unpack('>H', b[hm + 4 * i:hm + 4 * i + 2])[0] for i in range(nhm)]
    upem = struct.unpack('>H', b[tabs['head'][0] + 18:tabs['head'][0] + 20])[0]
    return (lambda g: adv[min(g, nhm - 1)]), upem


def strip_svg_table(b, tabs):
    """SVG 表を取り除いたフォント（字送りだけ残り、文字は描かれない）"""
    keep = sorted(t for t in tabs if t != 'SVG ')
    n = len(keep)
    es = max(i for i in range(16) if 2 ** i <= n)
    head = struct.pack('>4sHHHH', b[:4], n, 16 * 2 ** es, es, n * 16 - 16 * 2 ** es)
    off = 12 + 16 * n
    dirs, body = b'', b''
    head_pos = None
    for t in keep:
        o, ln, cs = tabs[t]
        data = b[o:o + ln]
        if t == 'head':
            data = data[:8] + b'\0\0\0\0' + data[12:]
            head_pos = off + len(body)
            cs = table_checksum(data)
        dirs += struct.pack('>4sIII', t.encode('latin1'), cs, off + len(body), ln)
        body += data + b'\0' * ((4 - ln % 4) % 4)
    out = bytearray(head + dirs + body)
    adj = (0xB1B0AFBA - table_checksum(bytes(out))) & 0xFFFFFFFF
    out[head_pos + 8:head_pos + 12] = struct.pack('>I', adj)
    return bytes(out)


def table_checksum(data):
    data += b'\0' * ((4 - len(data) % 4) % 4)
    return sum(struct.unpack('>%dI' % (len(data) // 4), data)) & 0xFFFFFFFF


# ---------------------------------------------------------------- SVG の処理
NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


def path_points(d):
    """パスの点（制御点を含む）を返す。外接矩形の計算用"""
    pts = []
    x = y = sx = sy = 0.0
    for cmd, args in re.findall(r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)', d):
        v = [float(t) for t in NUM.findall(args)]
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'Z':
            x, y = sx, sy
            continue
        step = {'M': 2, 'L': 2, 'T': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'A': 7}[c]
        for i in range(0, len(v) - step + 1, step):
            a = v[i:i + step]
            bx, by = (x, y) if rel else (0.0, 0.0)
            if c == 'H':
                x = a[0] + (x if rel else 0)
            elif c == 'V':
                y = a[0] + (y if rel else 0)
            elif c == 'A':
                x, y = a[5] + bx, a[6] + by
            else:
                for j in range(0, step, 2):
                    pts.append((a[j] + bx, a[j + 1] + by))
                x, y = a[step - 2] + bx, a[step - 1] + by
            pts.append((x, y))
            if c == 'M' and i == 0:
                sx, sy = x, y
                if step == 2:
                    c = 'L'  # M の後に続く座標は L 扱い
    return pts


def svg_points(svg):
    pts = []
    for d in re.findall(r'\sd="([^"]+)"', svg):
        pts += path_points(d)
    for p in re.findall(r'\spoints="([^"]+)"', svg):
        v = [float(t) for t in NUM.findall(p)]
        pts += list(zip(v[0::2], v[1::2]))
    for tag in re.findall(r'<(?:rect|circle|ellipse|line)\b[^>]*>', svg):
        a = {k: float(v) for k, v in re.findall(r'\s(x|y|width|height|cx|cy|r|rx|ry|x1|y1|x2|y2)="([-\d.e]+)"', tag)}
        if tag.startswith('<rect'):
            pts += [(a.get('x', 0), a.get('y', 0)), (a.get('x', 0) + a.get('width', 0), a.get('y', 0) + a.get('height', 0))]
        elif tag.startswith('<line'):
            pts += [(a.get('x1', 0), a.get('y1', 0)), (a.get('x2', 0), a.get('y2', 0))]
        else:
            rx, ry = a.get('rx', a.get('r', 0)), a.get('ry', a.get('r', 0))
            pts += [(a.get('cx', 0) - rx, a.get('cy', 0) - ry), (a.get('cx', 0) + rx, a.get('cy', 0) + ry)]
    return pts


def clean_svg(doc):
    """フォントの SVG を、単体で表示できる 1000×1000 の画像にする"""
    s = re.sub(r'<\?xml[^>]*\?>', '', doc).strip()
    m = re.search(r'<svg\b[^>]*>', s)
    tag = m.group(0)
    new_tag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'
    s = s.replace(tag, new_tag, 1)
    s = re.sub(r'>\s+<', '><', s)
    s = re.sub(r'\s*\n\s*', ' ', s)
    return s


def is_mono(svgs):
    colors = set()
    for s in svgs:
        colors |= {c.lower() for c in re.findall(r'(?:fill|stroke)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{3,6}|[a-z]+)', s)}
    colors -= {'none', 'transparent'}
    def dark(c):
        if c in ('black', 'currentcolor'):
            return True
        if not c.startswith('#'):
            return False
        h = c[1:]
        if len(h) == 3:
            h = ''.join(ch * 2 for ch in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return r + g + b < 120
    return all(dark(c) for c in colors)


def monochrome(svg):
    """単色フォント：黒い部分を「あとで塗る色」に置き換える（サイト側で __COLOR__ を差し替える）"""
    s = re.sub(r'#(?:0{3}|0{6}|040000|231815)\b', 'currentColor', svg, flags=re.I)
    s = re.sub(r'(fill|stroke)\s*:\s*black', r'\1: currentColor', s)
    return s.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
                     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" fill="currentColor" color="__COLOR__">', 1)


def label_of(stem):
    tail = re.split(r'[-_ ]', stem, maxsplit=1)[-1]
    tail = re.sub(r'^\d+[_ -]*', '', tail)
    return tail[:1].upper() + tail[1:] if tail else stem


# ---------------------------------------------------------------- メイン
def main():
    if len(sys.argv) < 3:
        sys.exit('使い方: python3 build_fonts.py <素材フォルダ> <サイトのフォルダ>')
    src, site = sys.argv[1], sys.argv[2]
    font_files = []
    for root, _, files in os.walk(src):
        for f in files:
            if f.lower().endswith(('.otf', '.ttf')):
                font_files.append(os.path.join(root, f))
    font_files.sort(key=lambda p: unicodedata.normalize('NFC', os.path.basename(p)))

    fonts, mono_svgs = [], {}
    metrics_written = False
    for path in font_files:
        b = open(path, 'rb').read()
        tabs = read_tables(b)
        docs = svg_docs(b, tabs)
        if not docs:
            print('  （SVG の絵が入っていないので飛ばします）', os.path.basename(path))
            continue
        stem = re.sub(r'[^A-Za-z0-9_-]+', '_', unicodedata.normalize('NFC', os.path.splitext(os.path.basename(path))[0]))
        c2g = char_to_glyph(b, tabs)
        adv, upem = advances(b, tabs)
        glyphs, cleaned = {}, {}
        for L in LETTERS:
            g = c2g.get(ord(L))
            if g is None or g not in docs:
                continue
            svg = clean_svg(docs[g])
            pts = [p for p in svg_points(svg) if -500 < p[0] < 1500 and -500 < p[1] < 1500]
            if not pts:
                pts = [(0, 0), (upem, upem)]
            # 絵の範囲（1000×1000 の中の座標）
            glyphs[L] = {k: round(v) for k, v in zip(('x0', 'y0', 'x1', 'y1'), (
                min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)))}
            cleaned[L] = svg
        mono = is_mono(cleaned.values())
        out_dir = os.path.join(site, 'assets', 'glyphs', stem)
        os.makedirs(out_dir, exist_ok=True)
        for L, svg in cleaned.items():
            with open(os.path.join(out_dir, L + '.svg'), 'w', encoding='utf-8') as fh:
                fh.write(svg)
        if mono:
            mono_svgs[stem] = {L: monochrome(svg) for L, svg in cleaned.items()}
        # 足元の線：絵の下端のまん中の値（しっぽ等で下にはみ出す文字があっても揃うように）
        bottoms = sorted(g['y1'] for g in glyphs.values())
        baseline = bottoms[len(bottoms) // 2] if bottoms else 800
        fonts.append({'id': stem, 'name': font_name(b, tabs), 'label': label_of(stem), 'mono': mono,
                      'baseline': baseline, 'glyphs': glyphs})
        # 字送りだけのフォント（全フォントで共通に使う）
        if not metrics_written:
            os.makedirs(os.path.join(site, 'fonts'), exist_ok=True)
            with open(os.path.join(site, 'fonts', 'chimerabet-metrics.otf'), 'wb') as fh:
                fh.write(strip_svg_table(b, tabs))
            ho = tabs['hhea'][0]
            asc, desc = struct.unpack('>hh', b[ho + 4:ho + 8])
            metrics = {'em': upem, 'ascent': asc, 'descent': -desc,
                       'adv': {L: adv(c2g[ord(L)]) for L in LETTERS if ord(L) in c2g}, 'space': adv(c2g.get(32, 0))}
            metrics_written = True
        print('  %s（%s）%d文字%s' % (os.path.basename(path), stem, len(glyphs), ' 単色' if mono else ''))

    def videos(sub):
        d = os.path.join(site, 'assets', sub)
        found = {}
        if os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                m = re.match(r'^([A-Z])\.mp4$', f)
                if m:
                    found[m.group(1)] = 'assets/%s/%s' % (sub, f)
        return found

    data = {
        'fonts': fonts,
        'metrics': metrics if metrics_written else None,
        'mono': mono_svgs,
        'animation': videos('animation'),
        'animationGrid': videos('animation/grid'),
        'turntable': videos('turntable'),
        'turntableGrid': videos('turntable/grid'),
    }
    # 動画ごとの最初のコマの静止画（読み込み中に先に見せる）
    data['posters'] = {}
    for kind in ('animation', 'animationGrid', 'turntable', 'turntableGrid'):
        for src in data[kind].values():
            jpg = src[:-4] + '.jpg'
            if os.path.exists(os.path.join(site, jpg)):
                data['posters'][src] = jpg
    # ファイルの大きさ（ロード画面の進み具合を、実際に届いた量で出すため）
    data['sizes'] = {}
    for path in list(data['posters'].keys()) + list(data['posters'].values()) + ['fonts/chimerabet-metrics.otf']:
        full = os.path.join(site, path)
        if os.path.exists(full):
            data['sizes'][path] = os.path.getsize(full)
    js = ('/* 自動生成ファイル（tools/build_fonts.py）。手で書き換えないでください */\n'
          'window.CHIMERA_ASSETS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with open(os.path.join(site, 'js', 'assets.js'), 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('  js/assets.js（フォント %d・アニメーション %d・ターンテーブル %d）' % (
        len(fonts), len(data['animation']), len(data['turntable'])))


if __name__ == '__main__':
    main()
