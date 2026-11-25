/* =====================================================================
   CHIMERABET
   #/grid/{mode}       … ホーム（A〜Z）※ターンテーブル表示のときだけ回転、それ以外は静止
   #/{A-Z}/{mode}      … 個別ページ（ホームの上にポップアップで表示）
   #/about             … about ページ（別ページ）
   mode = animation | silhouette | turntable
   素材の一覧は js/assets.js（tools/素材を書き出す.command で自動生成）
   ===================================================================== */
(function () {
  'use strict';

  const CFG = window.CHIMERABET || {};
  const AS = Object.assign({ fonts: [], metrics: null, mono: {}, animation: {}, turntable: {}, turntableGrid: {} }, window.CHIMERA_ASSETS);
  const S = Object.assign({
    animationMs: 6500,
    secondsPerTurn: 6,
    dragDegPerPx: 0.5,
  }, CFG.settings);

  const MODES = ['animation', 'silhouette', 'turntable'];
  const LABEL = { animation: 'Animation', silhouette: 'Silhouette', turntable: 'Turntable' };
  const LABEL_JA = { animation: 'アニメーション表示', silhouette: 'シルエット表示', turntable: 'ターンテーブル表示' };
  const LOGO_COLORS = ['#5BB32F', '#1E9BD7', '#9CC31B', '#E4007F', '#F39800', '#EA5514', '#E60012', '#3E3A8E', '#F6AB00', '#6AB72D'];
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  /* ---------- 小物 ---------- */
  const noop = () => {};
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const root = document.documentElement;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }
  const img = (src, cls) => h('img', { src, class: cls, alt: '', draggable: 'false' });

  function makeVideo(src, loop) {
    const v = h('video', { class: 'media', playsinline: true, muted: true, preload: 'auto', disablepictureinpicture: true });
    v.muted = true;
    v.playsInline = true;
    v.loop = !!loop;
    const types = { webm: 'video/webm', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4; codecs="hvc1"' };
    (Array.isArray(src) ? src : [src]).forEach((s) => {
      const ext = s.split('?')[0].split('.').pop().toLowerCase();
      v.append(h('source', { src: s, type: types[ext] }));
    });
    return v;
  }
  // 使い終わった動画の読み込みを止めてメモリを空ける
  function releaseVideo(v) {
    v.pause();
    v.querySelectorAll('source').forEach((s) => s.remove());
    v.removeAttribute('src');
    v.load();
  }

  // 白い背景の上でも読める濃さにした色（見出し用）
  function readable(hex, min) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    for (let k = 1; k > 0.1; k -= 0.02) {
      const [r, g, b] = rgb.map((v) => v * k);
      const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      if (1.05 / (L + 0.05) >= (min || 2.4)) return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
    }
    return hex;
  }

  /* =====================================================================
     フォントの絵（素材フォルダの otf から書き出した各文字の SVG）
     ===================================================================== */
  const FONTS = AS.fonts.map((f) => Object.assign({ dir: `assets/glyphs/${f.id}/` }, f));
  function findFont(key) {
    if (!key) return null;
    const k = String(key).toLowerCase();
    return FONTS.find((f) => f.id.toLowerCase() === k || f.label.toLowerCase() === k)
      || FONTS.find((f) => f.id.toLowerCase().includes(k)) || null;
  }
  const svgURL = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const glyphCache = new Map();
  // f の文字 L の画像。単色フォント（シルエット）は color で塗る
  function glyphURL(f, L, color) {
    if (!f || !f.glyphs || !f.glyphs[L]) return null;
    const svgs = f.svg || AS.mono[f.id];
    if (!svgs) return f.dir + L + '.svg';
    const key = `${f.id}/${L}/${f.mono ? color : ''}`;
    if (!glyphCache.has(key)) glyphCache.set(key, svgURL(f.mono ? svgs[L].replace('__COLOR__', color || '#000') : svgs[L]));
    return glyphCache.get(key);
  }

  const G = CFG.glyphs || {};
  const ILLUST_FONT = findFont(G.illust || 'Two');
  const SIL_FONT = findFont(G.silhouette || 'silhouette');
  const FRONT_FONT = findFont(G.front || 'Three');

  /* ---------- キャラクター ---------- */
  const CHARS = LETTERS.map((letter, index) => {
    const color = (CFG.colors || {})[letter] || '#888888';
    const a = (CFG.assets || {})[letter] || {};
    const ph = window.CHIMERA_PH.make(letter, color);
    const animSrc = a.animation || AS.animation[letter] || null;
    const anim = animSrc && animSrc.src ? animSrc : { src: animSrc };
    const silGlyph = !a.silhouette && glyphURL(SIL_FONT, letter, color);
    return {
      letter, index, color, ph,
      illust: a.illust || glyphURL(ILLUST_FONT, letter) || ph.illust,
      silhouette: a.silhouette || silGlyph || ph.silhouette,
      // 表示切り替えボタン用（白いシルエット）
      silhouetteIcon: silGlyph ? glyphURL(SIL_FONT, letter, '#fff') : null,
      animation: anim.src || null,
      animationKeyBlack: !!anim.keyBlack,
      turntable: a.turntable || AS.turntable[letter] || null,
      turntableGrid: a.turntableGrid || AS.turntableGrid[letter] || null,
      hasIllust: !!(a.illust || ILLUST_FONT),
      hasSilhouette: !!(a.silhouette || silGlyph),
    };
  });
  const BY = {};
  CHARS.forEach((c) => { BY[c.letter] = c; });
  const prevOf = (c) => CHARS[(c.index + CHARS.length - 1) % CHARS.length];
  const nextOf = (c) => CHARS[(c.index + 1) % CHARS.length];

  const ICON = {
    animation: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 11.8v24.4c0 1.3 1.4 2 2.5 1.3l18.6-12.2a1.5 1.5 0 0 0 0-2.6L20.5 10.5c-1.1-.7-2.5 0-2.5 1.3z" fill="#fff"/></svg>',
    turntable: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="18.5" r="11" fill="#fff"/><path d="M9 31.4C6.4 32.5 5 33.8 5 35.2 5 39 13.5 42 24 42s19-3 19-6.8c0-1.5-1.4-2.9-3.8-4" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><path d="M44.4 29.2l-5.2 1.2 2.6 5" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    chevL: '<svg viewBox="0 0 130 240" aria-hidden="true"><path d="M116 8L16 120l100 112" fill="none" stroke="currentColor" stroke-width="22"/></svg>',
    chevR: '<svg viewBox="0 0 130 240" aria-hidden="true"><path d="M14 8l100 112L14 232" fill="none" stroke="currentColor" stroke-width="22"/></svg>',
  };

  /* ---------- 仮のターンテーブル用の共通タイマー ---------- */
  const ticker = {
    items: new Set(),
    raf: 0,
    last: 0,
    add(it) {
      this.items.add(it);
      if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    },
    remove(it) {
      this.items.delete(it);
      if (!this.items.size && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    },
    tick(now) {
      const dt = Math.min(now - ticker.last, 64);
      ticker.last = now;
      ticker.items.forEach((it) => it.update(dt));
      ticker.raf = requestAnimationFrame(ticker.tick);
    },
  };

  /* =====================================================================
     表示パーツ。どれも { el, start(), stop() } を返す
     ===================================================================== */

  function viewSilhouette(c) {
    return { el: h('div', { class: 'view view-silhouette' }, img(c.silhouette, 'media')), start: noop, stop: noop };
  }

  // 一覧用：動かない絵（シルエット表示ならシルエット、それ以外は斜め向きのイラスト）
  function viewStill(c, mode) {
    return h('div', { class: 'view view-still' }, img(mode === 'silhouette' ? c.silhouette : c.illust, 'media'));
  }

  // 動画がない文字：枠の右外から歩いてきて左外へ抜ける（枠の両端はマスクでフェード）
  const WALK = [
    { transform: 'translateX(68%)', opacity: 0 },
    { transform: 'translateX(40%)', opacity: 1, offset: 0.14 },
    { transform: 'translateX(-40%)', opacity: 1, offset: 0.86 },
    { transform: 'translateX(-68%)', opacity: 0 },
  ];

  function viewAnimation(c) {
    if (c.animation) {
      const vid = makeVideo(c.animation, true);
      vid.classList.add('anim-video');
      if (c.animationKeyBlack) vid.classList.add('key-black');
      return {
        el: h('div', { class: 'view view-animation has-video' }, vid),
        // 終わったら最初から繰り返す
        start() { vid.currentTime = 0; vid.play().catch(noop); },
        stop() { releaseVideo(vid); },
      };
    }
    const mover = h('div', { class: 'anim-mover' }, h('div', { class: 'crawl' }, img(c.illust, 'media')));
    let anim = null;
    return {
      el: h('div', { class: 'view view-animation' }, h('div', { class: 'anim-frame' }, mover)),
      start() { anim = mover.animate(WALK, { duration: S.animationMs, easing: 'linear', iterations: Infinity }); },
      stop() { if (anim) anim.cancel(); },
    };
  }

  const isVideoSrc = (src) => typeof src === 'string' || Array.isArray(src);

  function viewTurntable(c, ctx) {
    if (ctx === 'grid') {
      const src = c.turntableGrid || c.turntable;
      if (isVideoSrc(src)) return spinGridVideo(src);
    } else if (isVideoSrc(c.turntable)) {
      return spinVideo(c.turntable);
    }
    return spinLayers(c, ctx);
  }

  // 一覧：小さい回転動画を流すだけ。全員の向きがそろうよう、時計に合わせて再生位置を決める
  function spinGridVideo(src) {
    const vid = makeVideo(src, true);
    let on = false;
    const sync = () => { if (vid.duration) vid.currentTime = (performance.now() / 1000) % vid.duration; };
    vid.addEventListener('loadedmetadata', () => { if (on) sync(); });
    return {
      el: h('div', { class: 'view view-turntable tt-grid' }, vid),
      start() { on = true; sync(); vid.play().catch(noop); },
      pause() { on = false; vid.pause(); },
      stop() { on = false; releaseVideo(vid); },
    };
  }

  /* 個別ページ：回転動画を「手で回している」ように動かす
     ・ふだんは動画をそのまま再生（一定の速さで回り続ける）
     ・押した瞬間に止まる → 押したまま左右にドラッグすると、その分だけ回る
     ・はじくように離すと勢いよく回り、だんだん元の速さに戻る
     回転の角度と動画の再生位置は比例している（tools/build_videos.swift で並べ直し済み） */
  function spinVideo(src) {
    const vid = makeVideo(src, true);
    const el = h('div', { class: 'view view-turntable tt-detail' }, vid);
    const period = () => (vid.duration && isFinite(vid.duration) ? vid.duration : S.secondsPerTurn);
    const secPerPx = () => (period() / 360) * S.dragDegPerPx;

    let active = false; // 表示中
    let manual = false; // 動画の再生ではなく、こちらで位置を動かしている間
    let held = false;
    let pos = 0;        // 再生位置（秒・1周を超えても続けて数える）
    let vel = 1;        // 1 = ふつうの速さ、0 = 停止、マイナス = 逆回転
    let raf = 0;
    let last = 0;
    let x0 = 0, pos0 = 0, lastX = 0, lastT = 0, vx = 0;

    // シークが終わる前に次を頼むと詰まるので、終わってから最新の位置だけを頼む
    let pending = null;
    let shown = -1;
    function seek(t) {
      if (vid.readyState < 1) return;
      t = mod(t, period());
      if (Math.abs(t - shown) < 0.004) return;
      shown = t;
      if (vid.seeking) pending = t;
      else vid.currentTime = t;
    }
    vid.addEventListener('seeked', () => {
      if (pending == null) return;
      const t = pending;
      pending = null;
      vid.currentTime = t;
    });

    function loop(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!held) {
        // 摩擦で、ふつうの速さ（1）へ近づける
        vel += (1 - vel) * (1 - Math.exp(-dt / 0.55));
        pos += vel * dt;
        if (Math.abs(vel - 1) < 0.03) {
          // ふつうの速さに戻ったら動画の再生に任せる
          raf = 0;
          manual = false;
          pending = null;
          shown = -1;
          if (vid.readyState >= 1) vid.currentTime = mod(pos, period());
          if (active) vid.play().catch(noop);
          return;
        }
      }
      seek(pos);
      raf = requestAnimationFrame(loop);
    }
    function runLoop() {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }

    const hold = {
      begin(x) {
        if (!manual) { pos = vid.currentTime || 0; } // 押したその瞬間の向きで止める
        manual = true;
        held = true;
        vel = 0;
        vid.pause();
        x0 = lastX = x;
        pos0 = pos;
        lastT = performance.now();
        vx = 0;
        runLoop();
      },
      move(x) {
        const now = performance.now();
        // 左へドラッグ = 正面が左へ流れる向き（再生と同じ向き）
        pos = pos0 - (x - x0) * secPerPx();
        const dt = Math.max(now - lastT, 1) / 1000;
        vx = vx * 0.5 + ((x - lastX) / dt) * 0.5;
        lastX = x;
        lastT = now;
      },
      end() {
        held = false;
        // 離す直前に指が止まっていたら勢いはつけない
        const still = performance.now() - lastT > 90;
        vel = still ? 0 : clamp(-vx * secPerPx(), -14, 14);
        runLoop();
      },
    };

    function pause() {
      active = false;
      vid.pause();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    return {
      el,
      hold,
      start() { active = true; if (manual) runLoop(); else vid.play().catch(noop); },
      pause,
      stop() { pause(); releaseVideo(vid); },
    };
  }

  // 動画がないとき：連番画像、またはイラストを重ねた仮の3D回転
  function spinLayers(c, ctx) {
    const rotor = h('div', { class: 'tt-rotor' });
    const el = h('div', { class: 'view view-turntable' }, h('div', { class: 'tt-stage' }, rotor));
    const src = c.turntable;
    const speed = 360 / (S.secondsPerTurn * 1000); // 度/ms
    let angle = 0;
    let held = false;
    let render = noop;
    let ro = null;

    if (src && src.frames) {
      // 連番画像：角度 → コマ番号
      const count = src.count;
      const start = src.start == null ? 1 : src.start;
      const urls = Array.from({ length: count }, (_, i) =>
        src.frames.replace(/#+/, (m) => String(start + i).padStart(m.length, '0')));
      urls.forEach((u) => { new Image().src = u; });
      const im = img(urls[0], 'media');
      rotor.append(im);
      let last = 0;
      render = () => {
        const i = Math.floor((mod(angle, 360) / 360) * count) % count;
        if (i !== last) { im.src = urls[i]; last = i; }
      };
    } else {
      const n = ctx === 'grid' ? 12 : 32;
      for (let i = 0; i < n; i++) {
        let s = c.ph.edge;
        let cls = 'media tt-layer';
        if (i === n - 1) s = c.illust;
        else if (i === 0) s = c.ph.back;
        const layer = img(s, cls);
        layer.style.setProperty('--z', i - (n - 1) / 2);
        rotor.append(layer);
      }
      ro = new ResizeObserver(([e]) => {
        rotor.style.setProperty('--gap', ((e.contentRect.width * 0.12) / (n - 1)).toFixed(2) + 'px');
      });
      ro.observe(rotor);
      render = () => { rotor.style.transform = `rotateY(${angle.toFixed(2)}deg)`; };
    }
    let a0 = 0;
    let x0 = 0;
    const hold = {
      begin(x) { held = true; a0 = angle; x0 = x; },
      move(x) { angle = mod(a0 + (x - x0) * S.dragDegPerPx, 360); },
      end() { held = false; },
    };
    const item = {
      update(dt) {
        if (!held) angle = (angle + dt * speed) % 360;
        render();
      },
    };
    const pause = () => ticker.remove(item);
    return {
      el,
      hold,
      start() { ticker.add(item); },
      pause,
      stop() { pause(); if (ro) ro.disconnect(); },
    };
  }

  function makeView(c, mode) {
    if (mode === 'animation') return viewAnimation(c);
    if (mode === 'turntable') return viewTurntable(c, 'detail');
    return viewSilhouette(c);
  }

  // 押している間は止まる（そのままドラッグで回せる）
  function bindHold(target, hold) {
    let id = null;
    target.addEventListener('pointerdown', (e) => {
      if (id !== null || e.button > 0) return;
      id = e.pointerId;
      target.setPointerCapture(id);
      target.classList.add('is-held');
      hold.begin(e.clientX);
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) hold.move(e.clientX);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      target.classList.remove('is-held');
      hold.end();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // スマホ：左右スワイプで前後の文字へ
  function bindSwipe(target, onLeft, onRight) {
    let x0 = null;
    let y0 = 0;
    target.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
    target.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
    });
  }

  /* =====================================================================
     ロゴ（ホームではクリックで文字を編集できる）
     文字はフォントの絵（画像）で表示。編集中はフォントを切り替えられる
     ===================================================================== */
  const LOGO_DEFAULT = 'CHIMERABET';
  const LOGO_STORE = 'chimerabet.logoText';
  const LOGO_FONT_STORE = 'chimerabet.logoFont';
  const LOGO_GAP = 30; // 絵と絵の間（1000 = 文字の大きさ）
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できない環境では何もしない */ } },
  };
  let logoText = store.get(LOGO_STORE) || LOGO_DEFAULT;

  const PLAIN = { id: 'plain', label: '標準', name: '標準の文字（絵を使わない）', plain: true };
  let dropFont = null; // 画面にドロップして試しているフォント（再読み込みで消える）
  const logoFonts = () => FONTS.concat(PLAIN, dropFont ? [dropFont] : []);
  const defaultLogoFont = () => findFont(CFG.logoFont || 'Three') || PLAIN;
  let logoFontId = store.get(LOGO_FONT_STORE);
  const currentLogoFont = () => logoFonts().find((f) => f.id === logoFontId) || defaultLogoFont();

  // 字送りだけのフォント（絵は背景画像で重ねる）
  // 文字の箱の上端から並ぶ線（ベースライン）までの距離はブラウザによって違うので、読み込み後に測る
  let ascentEm = AS.metrics ? AS.metrics.ascent / AS.metrics.em : 1;
  function measureAscent() {
    const probe = h('span', { style: 'display:inline-block;width:0;height:0;vertical-align:baseline' });
    const inner = h('span', { style: 'font:100px/1 ChimerabetMetrics' }, 'A', probe);
    const box = h('div', { style: 'position:absolute;left:-9999px;top:0;white-space:nowrap' }, inner);
    document.body.append(box);
    const a = (probe.getBoundingClientRect().top - inner.getBoundingClientRect().top) / 100;
    box.remove();
    return a > 0.3 && a < 2 ? a : ascentEm;
  }
  if (AS.metrics) {
    new FontFace('ChimerabetMetrics', 'url("fonts/chimerabet-metrics.otf")').load()
      .then((f) => { document.fonts.add(f); ascentEm = measureAscent(); repaintLogos(); })
      .catch(() => console.warn('fonts/chimerabet-metrics.otf を読み込めませんでした'))
      .finally(() => root.classList.add('metrics-ready'));
  } else {
    root.classList.add('metrics-ready');
  }

  // 1文字ずつ描き直す。フォントにある英字は絵、それ以外はふつうの文字
  function paintLogo(el, text) {
    const f = currentLogoFont();
    const glyphMode = !f.plain && !!f.glyphs && !!AS.metrics;
    el.dataset.font = glyphMode ? 'glyph' : 'plain';
    el.style.fontFamily = f.family ? `"${f.family}", var(--font-logo)` : '';
    const em = glyphMode ? AS.metrics.em : 1000;
    el.replaceChildren(...Array.from(text, (ch, i) => {
      const L = ch.toUpperCase();
      const g = glyphMode && f.glyphs[L];
      if (!g) {
        if (glyphMode && ch === ' ') return h('span', { class: 'sp' }, ch);
        return h('span', { class: 't', style: `color:${LOGO_COLORS[i % LOGO_COLORS.length]}` }, ch);
      }
      const url = glyphURL(f, L, BY[L].color);
      const adv = (AS.metrics.adv[L] || em) / em;
      // 絵の左端・右端に合わせて詰める（フォントの字送りは全部同じ幅なので）
      const left = (LOGO_GAP / 2 - g.x0) / em;
      const width = (g.x1 - g.x0 + LOGO_GAP) / em;
      // 絵の足元（baseline）を文字の並ぶ線に合わせる
      const top = ascentEm - f.baseline / em;
      return h('span', {
        class: 'g',
        style: `background-image:url("${url}");margin-left:${left.toFixed(3)}em;letter-spacing:${(width - left - adv).toFixed(3)}em;background-position:0 ${top.toFixed(3)}em`,
      }, ch);
    }));
  }
  function repaintLogos() {
    document.querySelectorAll('.logo-text').forEach((el) => {
      const pos = document.activeElement === el ? caretOffset(el) : null;
      paintLogo(el, document.activeElement === el ? el.textContent : logoText);
      if (pos != null) placeCaret(el, pos);
    });
    document.querySelectorAll('.logo-fonts').forEach((n) => n.dispatchEvent(new Event('redraw')));
  }
  function setLogoFont(id) {
    logoFontId = id;
    if (id !== 'drop') store.set(LOGO_FONT_STORE, id);
    repaintLogos();
  }

  // 文字を描き直してもカーソル位置がずれないように
  function caretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !el.contains(sel.focusNode)) return null;
    const r = document.createRange();
    r.setStart(el, 0);
    r.setEnd(sel.focusNode, sel.focusOffset);
    return r.toString().length;
  }
  function placeCaret(el, offset) {
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = offset;
    let placed = false;
    let n;
    while (offset != null && (n = walker.nextNode())) {
      if (left <= n.length) { r.setStart(n, left); r.collapse(true); placed = true; break; }
      left -= n.length;
    }
    if (!placed) { r.selectNodeContents(el); r.collapse(false); }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // 編集中に出る、フォントの切り替えボタン
  function logoFontPicker() {
    const nav = h('div', { class: 'logo-fonts', role: 'group', 'aria-label': 'ロゴのフォント' });
    const draw = () => {
      const cur = currentLogoFont();
      nav.replaceChildren(...logoFonts().map((f) => h('button', {
        type: 'button',
        class: 'logo-font',
        title: f.name || f.label,
        'aria-pressed': f.id === cur.id ? 'true' : 'false',
        onpointerdown: (e) => e.preventDefault(), // 押しても編集中のカーソルが消えないように
        onclick: () => setLogoFont(f.id),
      }, f.plain
        ? h('span', { class: 'logo-font-aa', style: f.family ? `font-family:"${f.family}"` : null }, 'Aa')
        : img(glyphURL(f, 'A', BY.A.color) || '', 'logo-font-img'),
      h('span', { class: 'logo-font-name' }, f.label))));
    };
    nav.addEventListener('redraw', draw);
    draw();
    return nav;
  }

  function editableLogo() {
    if (CFG.logo) return h('div', { class: 'logo' }, h('img', { src: CFG.logo, alt: 'CHIMERABET' }));
    const el = h('div', {
      class: 'logo logo-text logo-edit',
      contenteditable: 'true',
      role: 'textbox',
      spellcheck: 'false',
      autocapitalize: 'off',
      'aria-label': 'ロゴの文字（クリックして編集できます）',
      title: 'クリックで文字を編集（Enterで確定 / Escで取り消し）\nフォントファイルを画面にドロップすると、そのフォントで試せます',
    });
    paintLogo(el, logoText);
    let before = logoText;
    const save = (text) => { logoText = text; store.set(LOGO_STORE, text); };
    const repaint = () => {
      const pos = caretOffset(el);
      paintLogo(el, el.textContent.replace(/[\r\n]/g, ''));
      placeCaret(el, pos);
      const t = el.textContent.trim();
      if (t) save(t); // 入力するたびに保存（ページを移っても残る）
    };
    el.addEventListener('focus', () => { before = el.textContent; });
    el.addEventListener('input', (e) => { if (!e.isComposing) repaint(); }); // 日本語の変換中は描き直さない
    el.addEventListener('compositionend', repaint);
    el.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      else if (e.key === 'Escape') { paintLogo(el, before); save(before.trim() || LOGO_DEFAULT); el.blur(); }
    });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text').replace(/[\r\n]+/g, ' ');
      document.execCommand('insertText', false, t);
    });
    el.addEventListener('blur', () => {
      save(el.textContent.trim() || LOGO_DEFAULT); // 全部消したら「CHIMERABET」に戻す
      paintLogo(el, logoText);
    });
    return h('div', { class: 'logo-wrap' }, el, logoFontPicker());
  }

  // about ページなどで使う、ホームへのリンクになったロゴ
  function logoLink(mode) {
    const a = h('a', { class: 'logo logo-text', href: `#/grid/${mode}`, 'aria-label': 'ホームへ' });
    if (CFG.logo) a.append(h('img', { src: CFG.logo, alt: 'CHIMERABET' }));
    else paintLogo(a, logoText);
    return a;
  }

  function siteHead(logoEl, current) {
    return h('header', { class: 'site-head' },
      logoEl,
      h('nav', { class: 'site-nav', 'aria-label': 'サイト内リンク' },
        h('a', { href: '#/about', 'aria-current': current === 'about' ? 'page' : null }, 'about')));
  }

  /* ---------- フォントファイルをドロップしてロゴで試す ----------
     SVG カラーフォント（今回の otf と同じ形式）は、絵を取り出して表示する
     ふつうのフォントは、そのまま文字のフォントとして使う */
  const FONT_FILE = /\.(otf|ttf|woff2?)$/i;
  let triedFace = null;

  async function readSvgFont(buf) {
    const dv = new DataView(buf);
    const tabs = {};
    for (let i = 0, n = dv.getUint16(4); i < n; i++) {
      const o = 12 + 16 * i;
      tabs[String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3))] = dv.getUint32(o + 8);
    }
    if (tabs['SVG '] == null || tabs.cmap == null) return null;
    // 文字 → 字形番号（cmap format 4）
    const c2g = {};
    const cm = tabs.cmap;
    for (let i = 0, nt = dv.getUint16(cm + 2); i < nt; i++) {
      const so = cm + dv.getUint32(cm + 4 + 8 * i + 4);
      if (dv.getUint16(so) !== 4) continue;
      const seg = dv.getUint16(so + 6) / 2;
      const ends = so + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, rofs = deltas + 2 * seg;
      for (let k = 0; k < seg; k++) {
        const s = dv.getUint16(starts + 2 * k), e = dv.getUint16(ends + 2 * k);
        const d = dv.getInt16(deltas + 2 * k), r = dv.getUint16(rofs + 2 * k);
        for (const L of LETTERS) {
          const c = L.charCodeAt(0);
          if (c < s || c > e || c2g[L] != null) continue;
          let g = r ? dv.getUint16(rofs + 2 * k + r + 2 * (c - s)) : c;
          if (g) g = (g + d) & 0xffff;
          c2g[L] = g;
        }
      }
    }
    // SVG の絵
    const so = tabs['SVG '];
    const list = so + dv.getUint32(so + 2);
    const docs = {};
    for (let i = 0, ne = dv.getUint16(list); i < ne; i++) {
      const e = list + 2 + 12 * i;
      const sg = dv.getUint16(e), eg = dv.getUint16(e + 2);
      let bytes = new Uint8Array(buf, list + dv.getUint32(e + 4), dv.getUint32(e + 8));
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      }
      const text = new TextDecoder().decode(bytes);
      for (let g = sg; g <= eg; g++) docs[g] = text;
    }
    const glyphs = {};
    const svg = {};
    const colors = new Set();
    for (const L of LETTERS) {
      const doc = docs[c2g[L]];
      if (!doc) continue;
      const s = doc.replace(/<\?xml[^>]*\?>/, '').trim()
        .replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">');
      // 絵の範囲を測る
      const box = h('div', { style: 'position:absolute;left:-99999px;top:0;width:1000px;height:1000px;visibility:hidden', html: s });
      document.body.append(box);
      const bb = box.firstElementChild.getBBox();
      box.remove();
      glyphs[L] = { x0: bb.x, x1: bb.x + bb.width, y0: bb.y, y1: bb.y + bb.height };
      svg[L] = s;
      (s.match(/(?:fill|stroke)\s*[:=]\s*"?\s*(#[0-9a-f]{3,6})/gi) || []).forEach((m) => colors.add(m.slice(m.indexOf('#'))));
    }
    if (!Object.keys(glyphs).length) return null;
    // 黒一色のフォントは、シルエットと同じく文字ごとの色で塗る
    const dark = (c) => { const x = c.length === 4 ? c.replace(/\w/g, '$&$&') : c; return [1, 3, 5].reduce((s, i) => s + parseInt(x.substr(i, 2), 16), 0) < 120; };
    const mono = [...colors].every(dark);
    if (mono) {
      for (const L in svg) {
        svg[L] = svg[L].replace(/#(?:000|000000|040000|231815)\b/gi, 'currentColor')
          .replace('viewBox="0 0 1000 1000">', 'viewBox="0 0 1000 1000" fill="currentColor" color="__COLOR__">');
      }
    }
    const bottoms = Object.values(glyphs).map((g) => g.y1).sort((a, b) => a - b);
    return { glyphs, svg, mono, baseline: bottoms[bottoms.length >> 1] };
  }

  async function tryFontFile(file) {
    const buf = await file.arrayBuffer();
    const name = file.name.replace(/\.[^.]+$/, '');
    let parsed = null;
    try { parsed = await readSvgFont(buf); } catch (e) { parsed = null; }
    if (parsed) {
      dropFont = Object.assign({ id: 'drop', label: 'ドロップ', name: `${file.name}（試し中）` }, parsed);
    } else {
      const face = new FontFace('ChimerabetLogoTry', buf);
      await face.load();
      if (triedFace) document.fonts.delete(triedFace);
      document.fonts.add(face);
      triedFace = face;
      dropFont = { id: 'drop', label: 'ドロップ', name: `${file.name}（試し中）`, plain: true, family: 'ChimerabetLogoTry' };
    }
    glyphCache.forEach((v, k) => { if (k.startsWith('drop/')) glyphCache.delete(k); });
    console.info('ロゴのフォントを試しています:', name);
    setLogoFont('drop');
  }
  let dragTimer = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // ドロップしたファイルをブラウザが開いてしまわないように
    root.classList.add('is-dragging-file');
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => root.classList.remove('is-dragging-file'), 200);
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    root.classList.remove('is-dragging-file');
    const file = Array.from(e.dataTransfer.files).find((f) => FONT_FILE.test(f.name));
    if (file) tryFontFile(file).catch(() => alert(`「${file.name}」はフォントとして読み込めませんでした`));
    else alert('フォントファイル（.otf / .ttf / .woff / .woff2）をドロップしてください');
  });

  function modeButtons(current, opt) {
    const c = opt.iconChar;
    const silIcon = () => {
      if (c.silhouetteIcon) return h('img', { src: c.silhouetteIcon, alt: '', draggable: 'false' });
      if (c.hasSilhouette) return h('img', { src: c.silhouette, alt: '', class: 'to-white', draggable: 'false' });
      return h('img', { src: c.ph.icon, alt: '', draggable: 'false' });
    };
    return h('nav', { class: `modes ${opt.className || ''}`, 'aria-label': '表示の切り替え', style: opt.style || null },
      MODES.map((m) =>
        h('a', {
          class: `mode-btn mode-${m}`,
          href: opt.href(m),
          title: LABEL_JA[m],
          'aria-label': LABEL_JA[m],
          'aria-current': m === current ? 'true' : null,
          html: m === 'silhouette' ? null : ICON[m],
        }, m === 'silhouette' ? silIcon() : null)));
  }

  /* =====================================================================
     ページ
     ホームは常に下に表示し、個別ページはその上にポップアップで開く
     ===================================================================== */
  const app = document.getElementById('app');

  /* ---------- ホーム ---------- */
  // 表示切り替えボタンを、T の絵の左端〜U の絵の右端に収める（マスの幅に対する割合）
  const STILL_PAD = 0.08; // .view-still の余白（style.css と合わせる）
  function controlInsets(mode) {
    const f = mode === 'silhouette' ? SIL_FONT : mode === 'turntable' ? FRONT_FONT : ILLUST_FONT;
    const custom = (CFG.assets || {});
    if (!f || (custom.T && (custom.T.illust || custom.T.silhouette)) || (custom.U && (custom.U.illust || custom.U.silhouette))) return null;
    const T = f.glyphs.T;
    const U = f.glyphs.U;
    if (!T || !U) return null;
    const inner = 1 - 2 * STILL_PAD;
    return `--inset-l:${(STILL_PAD + (T.x0 / 1000) * inner).toFixed(3)};--inset-r:${(STILL_PAD + (1 - U.x1 / 1000) * inner).toFixed(3)}`;
  }

  function renderGrid(mode) {
    // ターンテーブル表示のときだけ全員そろって回転。それ以外は静止画
    const spinners = [];
    const cells = CHARS.map((c) => {
      let content;
      if (mode === 'turntable') {
        const v = viewTurntable(c, 'grid');
        spinners.push(v);
        content = v.el;
      } else {
        content = viewStill(c, mode);
      }
      return h('a', {
        class: 'cell',
        href: `#/${c.letter}/${mode}`,
        style: `--c:${c.color}`,
        'aria-label': `${c.letter} ${LABEL[mode]}`,
      }, content);
    });

    const y = window.scrollY;
    app.replaceChildren(h('main', { class: 'page-grid' },
      h('h1', { class: 'visually-hidden' }, 'CHIMERABET'),
      siteHead(editableLogo(), 'home'),
      h('div', { class: 'grid' }, cells,
        modeButtons(mode, { className: 'grid-controls', href: (m) => `#/grid/${m}`, iconChar: BY.A, style: controlInsets(mode) }))));
    window.scrollTo(0, y);

    return {
      mode,
      play() { spinners.forEach((v) => v.start()); },
      pause() { spinners.forEach((v) => v.pause()); },
      stop() { spinners.forEach((v) => v.stop()); },
    };
  }

  /* ---------- about（別ページ） ---------- */
  function renderAbout(mode) {
    const about = CFG.about || {};
    app.replaceChildren(h('main', { class: 'page-about' },
      siteHead(logoLink(mode), 'about'),
      h('article', { class: 'about' },
        h('h1', { class: 'about-title' }, about.title || 'About'),
        (about.body || []).map((text) => h('p', null, text)),
        h('a', { class: 'back-link', href: `#/grid/${mode}` }, '← ホームへ戻る'))));
    window.scrollTo(0, 0);
    document.title = 'About | CHIMERABET';
  }

  /* ---------- 個別ページ（ポップアップ） ---------- */
  let popup = null; // { el, panel, view }
  const homeHash = () => `#/grid/${route.mode}`;

  function openPopup(c, mode) {
    if (!popup) {
      const panel = h('section', {
        class: 'popup-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'popup-title', tabindex: '-1',
      });
      const el = h('div', { class: 'popup' }, panel);
      // 外側の暗い部分をクリックしてもホームに戻る（中でドラッグして外で離した場合は戻らない）
      let downOnBackdrop = false;
      el.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === el; });
      el.addEventListener('click', (e) => { if (downOnBackdrop && e.target === el) location.hash = homeHash(); });
      document.body.append(el);
      root.classList.add('popup-open');
      app.inert = true;
      popup = { el, panel, view: null };
      panel.focus({ preventScroll: true });
    }
    if (popup.view) popup.view.stop();

    const prev = prevOf(c);
    const next = nextOf(c);
    const go = (ch) => { location.hash = `#/${ch.letter}/${mode}`; };
    const v = makeView(c, mode);
    const stage = h('div', { class: `stage stage-${mode}` }, v.el);
    if (mode === 'turntable') bindHold(stage, v.hold);
    else bindSwipe(stage, () => go(next), () => go(prev));

    popup.panel.style.setProperty('--c', c.color);
    popup.panel.style.setProperty('--title', readable(c.color));
    popup.panel.replaceChildren(
      h('a', { class: 'close-btn', href: `#/grid/${mode}`, title: '閉じる（ホームに戻る）', 'aria-label': '閉じてホームに戻る', html: ICON.close }),
      h('header', { class: 'detail-head' },
        h('h1', { class: 'detail-title', id: 'popup-title' }, `${c.letter} ${LABEL[mode]}`)),
      h('a', { class: 'nav nav-prev', href: `#/${prev.letter}/${mode}`, 'aria-label': `前へ（${prev.letter}）`, html: ICON.chevL }),
      stage,
      h('a', { class: 'nav nav-next', href: `#/${next.letter}/${mode}`, 'aria-label': `次へ（${next.letter}）`, html: ICON.chevR }),
      h('footer', { class: 'detail-foot' },
        mode === 'turntable' ? h('p', { class: 'hint' }, '長押しで止まる ・ 左右にドラッグで回る') : null,
        modeButtons(mode, { href: (m) => `#/${c.letter}/${m}`, iconChar: c })));
    popup.view = v;
    document.title = `${c.letter} ${LABEL[mode]} | CHIMERABET`;
    v.start();
  }

  function closePopup() {
    if (!popup) return;
    const { el, view } = popup;
    popup = null;
    if (view) view.stop();
    el.classList.add('is-closing');
    setTimeout(() => el.remove(), 220);
    root.classList.remove('popup-open');
    app.inert = false;
    document.title = 'CHIMERABET';
  }

  /* ---------- ルーティング ---------- */
  let lastMode = 'animation'; // about から戻ったとき、前の表示モードのホームに戻す
  function parseRoute() {
    const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
    if (a === 'about') return { view: 'about', mode: lastMode };
    const mode = MODES.includes(b) ? b : 'animation';
    const L = (a || '').toUpperCase();
    if (L.length === 1 && BY[L]) return { view: 'detail', letter: L, mode };
    return { view: 'grid', mode };
  }

  let route = null;
  let grid = null;
  function onRoute() {
    route = parseRoute();
    if (route.view === 'about') {
      closePopup();
      if (grid) { grid.stop(); grid = null; }
      renderAbout(route.mode);
      return;
    }
    lastMode = route.mode;
    // ホームは表示モードが変わったときだけ作り直す
    if (!grid || grid.mode !== route.mode) {
      if (grid) grid.stop();
      grid = renderGrid(route.mode);
    }
    if (route.view === 'detail') {
      grid.pause(); // ポップアップの後ろでは回さない
      openPopup(BY[route.letter], route.mode);
    } else {
      closePopup();
      grid.play();
      document.title = 'CHIMERABET';
    }
  }

  window.addEventListener('keydown', (e) => {
    if (!route || route.view !== 'detail' || e.metaKey || e.ctrlKey || e.altKey) return;
    const c = BY[route.letter];
    if (e.key === 'ArrowLeft') location.hash = `#/${prevOf(c).letter}/${route.mode}`;
    else if (e.key === 'ArrowRight') location.hash = `#/${nextOf(c).letter}/${route.mode}`;
    else if (e.key === 'Escape') location.hash = homeHash();
  });
  window.addEventListener('hashchange', onRoute);

  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = glyphURL(FRONT_FONT, 'A') || BY.A.ph.illust;
  onRoute();
})();
