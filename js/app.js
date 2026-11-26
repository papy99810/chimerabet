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
    secondsPerTurn: 6,
    dragDegPerPx: 0.5,
  }, CFG.settings);

  const MODES = ['turntable', 'animation', 'silhouette']; // 表示切り替えボタンの並び（左から）
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

  // 動画の最初のコマの静止画（tools が書き出したもの。読み込み中に先に見せる）
  const posterOf = (src) => (AS.posters || {})[Array.isArray(src) ? src[0] : src] || null;

  function makeVideo(src, loop) {
    const v = h('video', { class: 'media', playsinline: true, muted: true, preload: 'auto', disablepictureinpicture: true, poster: posterOf(src) });
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

  // 絵のまん中が画像のまん中に来るよう、表示範囲（viewBox）をずらした画像（大きさはそのまま）
  function centeredGlyphURL(f, L, color) {
    const g = f && f.glyphs && f.glyphs[L];
    const svgs = f && (f.svg || AS.mono[f.id]);
    if (!g || !svgs || !svgs[L]) return glyphURL(f, L, color);
    const cx = Math.round((g.x0 + g.x1) / 2);
    const cy = Math.round((g.y0 + g.y1) / 2);
    const svg = svgs[L].replace('viewBox="0 0 1000 1000"', `viewBox="${cx - 500} ${cy - 500} 1000 1000"`);
    return svgURL(f.mono ? svg.replace('__COLOR__', color || '#000') : svg);
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
      // 個別ページ用：絵のまん中を動画の枠のまん中にそろえたシルエット
      silhouetteCentered: a.silhouette || (silGlyph && centeredGlyphURL(SIL_FONT, letter, color)) || ph.silhouette,
      // 表示切り替えボタン用（白いシルエット）
      silhouetteIcon: silGlyph ? glyphURL(SIL_FONT, letter, '#fff') : null,
      animation: anim.src || null,
      animationKeyBlack: !!anim.keyBlack,
      animationGrid: (!a.animation && AS.animationGrid[letter]) || null, // ホーム一覧用（ターンテーブルと同じ切り抜き）
      turntable: a.turntable || AS.turntable[letter] || null,
      turntableGrid: a.turntableGrid || AS.turntableGrid[letter] || null,
      hasIllust: !!(a.illust || ILLUST_FONT),
      hasSilhouette: !!(a.silhouette || silGlyph),
    };
  });
  const BY = {};
  CHARS.forEach((c) => { BY[c.letter] = c; });
  const ANIM_CHARS = CHARS.filter((c) => c.animation);
  // その表示モードで出す文字（アニメーション表示は、アニメーションがある文字だけ）
  const charsFor = (mode) => (mode === 'animation' ? ANIM_CHARS : CHARS);
  const hasMode = (c, mode) => mode !== 'animation' || !!c.animation;
  function stepOf(c, mode, d) {
    const list = charsFor(mode);
    const i = list.indexOf(c);
    return list[((i < 0 ? 0 : i) + d + list.length) % list.length];
  }
  const prevOf = (c, mode) => stepOf(c, mode, -1);
  const nextOf = (c, mode) => stepOf(c, mode, 1);

  const ICON = {
    keyboard: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="5.5" y="13" width="37" height="23" rx="4" stroke="#fff" stroke-width="2.8"/><path d="M12 20.2h1.6M18.2 20.2h1.6M24.4 20.2h1.6M30.6 20.2h1.6M36 20.2h.4M12 26.2h1.6M18.2 26.2h1.6M24.4 26.2h1.6M30.6 26.2h1.6M36 26.2h.4M16.5 31h15" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>',
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

  // 個別ページは、どの表示も同じ 16:9 の表示枠（.stage）いっぱいに置く。
  // アニメーションとターンテーブルの動画はどちらも 1920×1080 なので、外枠がぴったり重なる
  function viewSilhouette(c) {
    return { el: h('div', { class: 'view view-silhouette' }, img(c.silhouetteCentered, 'media')), start: noop, stop: noop };
  }

  // 一覧用：シルエット表示の絵
  function viewStill(c) {
    return h('div', { class: 'view view-still' }, img(c.silhouette, 'media'));
  }

  // アニメーション動画（終わったら最初から繰り返す）。アニメーションがある文字だけで使う
  function viewAnimation(c) {
    const vid = makeVideo(c.animation, true);
    if (c.animationKeyBlack) vid.classList.add('key-black');
    return {
      el: h('div', { class: 'view view-animation' }, vid),
      start() { vid.currentTime = 0; vid.play().catch(noop); },
      stop() { releaseVideo(vid); },
    };
  }

  /* 一覧の動画のまとめ役
     まず最初のコマの静止画を読み込んで見せ、それが届いてから動画を読み込み始める（回線を取り合わないように）。
     全部の動画が読み込めたら、そろって最初から動かす。
     （最大 8 秒待っても読み込めない動画は、読み込めた時点で、ほかと同じ向き・位置に合わせて動き出す）
     あとから足したマスの動画も、読み込めたらほかと同じ位置に合わせて動き出す。
     動き出したあとは 2 秒ごとに見回って、ずれた動画だけ合わせ直す（読み込み途中で位置合わせが遅れた分なども） */
  function makeVideoGroup() {
    const items = new Set();
    let live = false;     // 動き出したか
    let active = false;   // 動かしてよいか（個別ページを開いている間は止める）
    let t0 = 0;           // 動き出した時刻（止めていた時間はずらす）
    let pausedAt = null;
    let timer = 0;
    let patrol = 0;
    let begun = false;    // 動画の読み込みを始めたか
    let scheduled = false;
    const posters = [];
    const isReady = (v) => v.readyState >= 3;
    const synced = new WeakSet(); // 動き出したあと、ほかと位置を合わせた動画
    const elapsed = () => ((pausedAt == null ? performance.now() : pausedAt) - t0) / 1000;
    function join(v) {
      const d = v.duration;
      try { v.currentTime = d && isFinite(d) ? elapsed() % d : 0; } catch (e) { /* まだ位置を変えられない */ }
      synced.add(v);
      if (active) v.play().catch(noop);
      else v.pause();
    }
    function goLive() {
      if (live) return;
      live = true;
      clearTimeout(timer);
      t0 = performance.now();
      if (!active) pausedAt = t0;
      items.forEach((v) => { if (isReady(v)) join(v); });
      patrol = setInterval(resync, 2000);
    }
    // 本来の位置から 0.2 秒以上ずれている動画だけ合わせ直す（ループの切れ目をまたぐずれも考える）
    function resync() {
      if (!items.size) { clearInterval(patrol); return; }
      if (!active) return;
      items.forEach((v) => {
        const d = v.duration;
        if (!synced.has(v) || v.paused || v.seeking || !isReady(v) || !d || !isFinite(d)) return;
        const want = elapsed() % d;
        const gap = Math.abs(v.currentTime - want);
        if (Math.min(gap, d - gap) > 0.2) v.currentTime = want;
      });
    }
    const check = () => { if (!live && items.size && [...items].every(isReady)) goLive(); };
    // 動画の読み込みを始める。スマホは再生しないと読み込みを始めないことがあるので、いったん再生してすぐ止める
    // （止める前に動き出してしまったら、ほかと位置を合わせる）
    function load(v) {
      v.preload = 'auto';
      v.play().then(() => { if (!live) v.pause(); else if (!synced.has(v)) join(v); }).catch(noop);
    }
    function begin() {
      if (begun) return;
      begun = true;
      items.forEach((v) => { if (!synced.has(v)) load(v); });
    }
    // 静止画が全部届いたら（最大 2.5 秒）動画の読み込みを始める
    function scheduleBegin() {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        const waits = posters.map((src) => new Promise((done) => { const im = new Image(); im.onload = im.onerror = done; im.src = src; }));
        Promise.race([Promise.all(waits), new Promise((done) => setTimeout(done, 2500))]).then(begin);
      }, 0);
    }
    return {
      add(v) {
        items.add(v);
        v.addEventListener('canplay', () => {
          if (!live) check();
          else if (!synced.has(v)) join(v); // 遅れて読み込めた動画・あとから足した動画は、ほかと同じ位置から
        });
        if (!begun) {
          v.preload = 'none'; // 静止画が届くまで、動画はまだ読み込まない
          if (v.poster) posters.push(v.poster);
          scheduleBegin();
        } else if (live && isReady(v)) {
          join(v);
        } else {
          load(v); // あとから足したマスの動画
        }
        return v;
      },
      remove(v) { items.delete(v); check(); },
      start() {
        if (active) return;
        active = true;
        if (live) {
          if (pausedAt != null) { t0 += performance.now() - pausedAt; pausedAt = null; }
          items.forEach((v) => { if (isReady(v)) join(v); });
        } else {
          check();
          if (!timer) timer = setTimeout(goLive, 8000);
        }
      },
      pause() {
        if (!active) return;
        active = false;
        if (live) pausedAt = performance.now();
        items.forEach((v) => v.pause());
      },
    };
  }

  // 一覧：アニメーション動画をマスの中で流す（大きさ・位置は一覧のターンテーブルと同じ）
  function viewGridAnimation(c, group) {
    const vid = makeVideo(c.animationGrid || c.animation, true);
    if (c.animationKeyBlack) vid.classList.add('key-black');
    group.add(vid);
    return {
      el: h('div', { class: `view grid-video${c.animationGrid ? '' : ' is-full'}` }, vid),
      start: group.start,
      pause: group.pause,
      stop() { group.remove(vid); releaseVideo(vid); },
    };
  }

  const isVideoSrc = (src) => typeof src === 'string' || Array.isArray(src);

  function viewTurntable(c, ctx, group) {
    if (ctx === 'grid') {
      const src = c.turntableGrid || c.turntable;
      if (isVideoSrc(src)) return spinGridVideo(src, group);
    } else if (isVideoSrc(c.turntable)) {
      return spinVideo(c.turntable);
    }
    return spinLayers(c, ctx);
  }

  // 一覧：小さい回転動画（全員の向きがそろうよう、まとめ役が再生位置を合わせる）
  function spinGridVideo(src, group) {
    const vid = makeVideo(src, true);
    group.add(vid);
    return {
      el: h('div', { class: 'view view-turntable grid-video' }, vid),
      start: group.start,
      pause: group.pause,
      stop() { group.remove(vid); releaseVideo(vid); },
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
     ロゴ（クリックするとホームへ）
     文字はフォントの絵（画像）で表示。どのフォントを使うかは data.js の logoFont
     ===================================================================== */
  const LOGO_TEXT = 'CHIMERABET';
  const LOGO_GAP = 30; // 絵と絵の間（1000 = 文字の大きさ）
  const LOGO_FONT = findFont(CFG.logoFont || 'Three');

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
  if (AS.metrics && LOGO_FONT) {
    new FontFace('ChimerabetMetrics', 'url("fonts/chimerabet-metrics.otf")').load()
      .then((f) => {
        document.fonts.add(f);
        ascentEm = measureAscent();
        document.querySelectorAll('.logo-text').forEach(paintLogo);
      })
      .catch(() => console.warn('fonts/chimerabet-metrics.otf を読み込めませんでした'))
      .finally(() => root.classList.add('metrics-ready'));
  } else {
    root.classList.add('metrics-ready');
  }

  // 1文字ずつ並べる。フォントにある英字は絵、それ以外はふつうの文字
  function paintLogo(el) {
    const f = LOGO_FONT;
    const glyphMode = !!f && !!AS.metrics;
    el.dataset.font = glyphMode ? 'glyph' : 'plain';
    el.replaceChildren(...Array.from(LOGO_TEXT, (ch, i) => {
      const g = glyphMode && f.glyphs[ch];
      if (!g) return h('span', { class: 't', style: `color:${LOGO_COLORS[i % LOGO_COLORS.length]}` }, ch);
      const em = AS.metrics.em;
      const adv = (AS.metrics.adv[ch] || em) / em;
      // 絵の左端・右端に合わせて詰める（フォントの字送りは全部同じ幅なので）
      const left = (LOGO_GAP / 2 - g.x0) / em;
      const width = (g.x1 - g.x0 + LOGO_GAP) / em;
      // 絵の足元（baseline）を文字の並ぶ線に合わせる
      const top = ascentEm - f.baseline / em;
      return h('span', {
        class: 'g',
        style: `background-image:url("${glyphURL(f, ch, BY[ch].color)}");margin-left:${left.toFixed(3)}em;letter-spacing:${(width - left - adv).toFixed(3)}em;background-position:0 ${top.toFixed(3)}em`,
      }, ch);
    }));
  }

  function logoLink(mode) {
    const a = h('a', { class: 'logo logo-text', href: `#/grid/${mode}`, 'aria-label': 'CHIMERABET（ホームへ）' });
    if (CFG.logo) a.append(h('img', { src: CFG.logo, alt: 'CHIMERABET' }));
    else paintLogo(a);
    return a;
  }

  function siteHead(logoEl, current) {
    return h('header', { class: 'site-head' },
      logoEl,
      h('nav', { class: 'site-nav', 'aria-label': 'サイト内リンク' },
        h('a', { href: '#/about', 'aria-current': current === 'about' ? 'page' : null }, 'about')));
  }

  function modeButtons(current, opt) {
    const c = opt.iconChar;
    const silIcon = () => {
      if (c.silhouetteIcon) return h('img', { src: c.silhouetteIcon, alt: '', draggable: 'false' });
      if (c.hasSilhouette) return h('img', { src: c.silhouette, alt: '', class: 'to-white', draggable: 'false' });
      return h('img', { src: c.ph.icon, alt: '', draggable: 'false' });
    };
    return h('nav', { class: `modes ${opt.className || ''}`, 'aria-label': '表示の切り替え', style: opt.style || null },
      (opt.modes || MODES).map((m) =>
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
    if (mode === 'animation') return null; // アニメーション表示は文字を詰めて並べるので、そろえる相手がいない
    const f = mode === 'silhouette' ? SIL_FONT : FRONT_FONT;
    const custom = CFG.assets || {};
    if (!f || (custom.T && custom.T.silhouette) || (custom.U && custom.U.silhouette)) return null;
    const T = f.glyphs.T;
    const U = f.glyphs.U;
    if (!T || !U) return null;
    const inner = 1 - 2 * STILL_PAD;
    return `--inset-l:${(STILL_PAD + (T.x0 / 1000) * inner).toFixed(3)};--inset-r:${(STILL_PAD + (1 - U.x1 / 1000) * inner).toFixed(3)}`;
  }

  // ホームに並べる文字と、編集のカーソルの位置（文字と文字の間。0 = 先頭）
  // キーボードで消したり足したりできる。再読み込みすると A〜Z に戻る
  let sequence = LETTERS.join('');
  let caretPos = sequence.length;

  function renderGrid(mode) {
    // ターンテーブル：全員そろって回転 / アニメーション：アニメーションがある文字だけ再生 / シルエット：静止画
    const gridEl = h('div', { class: 'grid' });
    let entries = []; // { letter, idx（並びの中の位置）, el, view }
    let playing = false;
    const group = makeVideoGroup(); // 一覧の動画のまとめ役（全部読み込めたら、そろって動かす）

    function makeCell(c) {
      let view = null;
      let content;
      if (mode === 'silhouette') {
        content = viewStill(c);
      } else {
        view = mode === 'turntable' ? viewTurntable(c, 'grid', group) : viewGridAnimation(c, group);
        content = view.el;
      }
      const el = h('a', {
        class: 'cell',
        href: `#/${c.letter}/${mode}`,
        style: `--c:${c.color}`,
        'aria-label': `${c.letter} ${LABEL[mode]}`,
      }, content);
      return { letter: c.letter, idx: 0, el, view };
    }

    // 表示切り替えボタン（一覧の最後の項目。スマホでは画面の右下に固定される）
    const controls = modeButtons(mode, {
      className: 'grid-controls',
      href: (m) => `#/grid/${m}`,
      iconChar: BY.A,
      style: controlInsets(mode),
      modes: MODES.filter((m) => charsFor(m).length), // アニメーションが1つもなければボタンを出さない
    });
    gridEl.append(controls);

    // PC：表示切り替えボタンは、文字を減らしても最初の並び（A〜Z）のときの行より上には上がらない
    //     （足していって最初の行より下へ回るときは、今までどおり下がる）
    const baseCount = charsFor(mode).length;
    const colCount = () => getComputedStyle(gridEl).gridTemplateColumns.split(' ').filter((t) => t && t !== 'none').length || 7;
    // マスが n 個のとき、ボタン（右側 2 マス分）が入る行（1 から数える）
    const controlsRow = (n, cols) => {
      if (!n) return 1;
      const last = Math.ceil(n / cols);
      return n - (last - 1) * cols <= cols - 2 ? last : last + 1;
    };
    function placeControls() {
      const cols = colCount();
      controls.style.gridRowStart = String(Math.max(controlsRow(entries.length, cols), controlsRow(baseCount, cols)));
      // キャラクターがいない行も、マスと同じ高さにする（全部消しても、ボタンの位置が変わらないように）
      const cell = parseFloat(getComputedStyle(gridEl).gridTemplateColumns);
      if (cell > 0) gridEl.style.gridAutoRows = `${cell}px`;
    }

    // 並びが変わったら、変わった部分のマスだけ作り直す（前後の同じ部分はそのまま。動画も読み直さない）
    function update(seq) {
      const letters = [];
      Array.from(seq).forEach((L, idx) => { if (BY[L] && hasMode(BY[L], mode)) letters.push({ L, idx }); });
      let k = 0;
      while (k < entries.length && k < letters.length && entries[k].letter === letters[k].L) k++;
      let m = 0;
      while (m < entries.length - k && m < letters.length - k
        && entries[entries.length - 1 - m].letter === letters[letters.length - 1 - m].L) m++;
      entries.splice(k, entries.length - k - m).forEach((e) => { if (e.view) e.view.stop(); e.el.remove(); });
      const anchor = entries[k] ? entries[k].el : controls;
      const added = letters.slice(k, letters.length - m).map(({ L }) => makeCell(BY[L]));
      added.forEach((e) => {
        gridEl.insertBefore(e.el, anchor);
        if (playing && e.view) e.view.start();
      });
      entries.splice(k, 0, ...added);
      entries.forEach((e, j) => { e.idx = letters[j].idx; });
      placeControls();
      renderCaret();
    }

    // 編集のカーソル：カーソルの前にある最後のマスのすぐ右に出す（先頭なら最初のマスの左、空なら一覧の先頭）
    function renderCaret() {
      let j = -1;
      entries.forEach((e, i) => {
        e.el.classList.remove('caret-after', 'caret-before');
        if (e.idx < caretPos) j = i;
      });
      gridEl.classList.toggle('is-empty', !entries.length);
      const prev = entries[j];
      const next = entries[j + 1];
      // 行の折り返しをまたぐ位置では、次に打つ文字が入る「次の行の先頭」に出す
      if (prev && next && next.el.offsetTop > prev.el.offsetTop) next.el.classList.add('caret-before');
      else if (prev) prev.el.classList.add('caret-after');
      else if (next) next.el.classList.add('caret-before');
    }
    const caretCell = () => gridEl.querySelector('.caret-after, .caret-before');

    // 画面上の点 (x, y) に一番近い「文字と文字の間」（クリックしたところにカーソルを置く）
    function pointToCaret(x, y) {
      if (!entries.length) return sequence.length;
      const gap = parseFloat(getComputedStyle(gridEl).rowGap) || 0;
      const rows = [];
      entries.forEach((e) => {
        const r = e.el.getBoundingClientRect();
        const row = rows[rows.length - 1];
        if (row && Math.abs(row.top - r.top) < 2) row.items.push({ e, r });
        else rows.push({ top: r.top, bottom: r.bottom, items: [{ e, r }] });
      });
      if (y < rows[0].top - gap) return sequence.length; // 一覧より上（見出しのあたり）→ 最後
      const row = rows.find((rw) => y <= rw.bottom + gap / 2);
      if (!row) return sequence.length; // 一覧より下 → 最後
      for (const { e, r } of row.items) if (x < r.left + r.width / 2) return e.idx;
      return row.items[row.items.length - 1].e.idx + 1; // 行の右の余白 → その行の最後
    }
    // ← → で止まる位置：先頭と、見えている各マスのすぐうしろ
    // （アニメーション表示で隠れている文字の前後のように、画面で見て同じ場所には止まらない）
    function caretStops() {
      return [...new Set([0, ...entries.map((e) => e.idx + 1)])].sort((p, q) => p - q);
    }
    // ↑ ↓：1行上・下の同じ列あたりへ
    function verticalCaret(dir) {
      const cell = caretCell();
      if (!cell) return caretPos;
      const st = getComputedStyle(gridEl);
      const r = cell.getBoundingClientRect();
      const x = cell.classList.contains('caret-after') ? r.right + (parseFloat(st.columnGap) || 0) / 2 : r.left;
      const y = r.top + r.height / 2 + dir * (r.height + (parseFloat(st.rowGap) || 0));
      if (y < entries[0].el.getBoundingClientRect().top) return 0;
      if (y > entries[entries.length - 1].el.getBoundingClientRect().bottom) return sequence.length;
      return pointToCaret(x, y);
    }

    update(sequence);

    const typing = makeTyping({
      // 文字が増えたり減ったりしたとき（atEnd：最後を編集した / grew：増えた）
      edit(atEnd, grew) {
        const before = controls.getBoundingClientRect().top;
        update(sequence);
        const dy = controls.getBoundingClientRect().top - before;
        // PC で最後に足したとき：表示切り替えボタンが次の行へ回ったら、「一段増えた」として画面をその分だけ下げる
        // （ボタンは画面上の同じ場所に留まり、並びが一段上へ送られる。消して戻るときも同じ）
        if (atEnd && dy && !isPhone()) {
          // ページの下が足りず一段分下げられないときは、下に余白を足してから下げる
          const need = window.scrollY + dy + window.innerHeight;
          if (dy > 0 && document.documentElement.scrollHeight < need) main.style.minHeight = `${Math.ceil(need)}px`;
          window.scrollBy(0, dy);
        }
        showCaret(atEnd && grew);
      },
      // カーソルだけ動いたとき
      move() { renderCaret(); showCaret(false); },
      stops: caretStops,
      vertical: verticalCaret,
    });
    // カーソルのあたりが隠れていたら、見える所までスクロール（最後に足したときは、うしろのボタンまで）
    function showCaret(atEnd) {
      if (isPhone()) {
        const cell = caretCell();
        if (cell) reveal(cell.getBoundingClientRect(), 100); // 右下に固定したボタンの分だけ上で止める
      } else if (atEnd && caretPos === sequence.length) {
        reveal(controls.getBoundingClientRect(), 24); // 最後に足しているときは、うしろのボタンまで
      } else {
        const cell = caretCell();
        if (cell) reveal(cell.getBoundingClientRect(), 24);
      }
    }

    // PC：キャラクター（やリンク・ボタン）以外の場所をクリックすると、そこにカーソルを置いて編集を始める
    const onBackground = (e) => !e.target.closest('a, button, input');
    const main = h('main', {
      class: 'page-grid',
      onmousedown: (e) => { if (onBackground(e) && document.activeElement === typing.input) e.preventDefault(); }, // 編集中にクリックしても続ける
      onclick: (e) => {
        if (isPhone() || !onBackground(e)) return;
        typing.start(pointToCaret(e.clientX, e.clientY));
      },
    });

    const y = window.scrollY;
    main.append(
      h('h1', { class: 'visually-hidden' }, 'CHIMERABET'),
      siteHead(logoLink(mode), 'home'),
      gridEl,
      typing.input,
      typing.btn);
    app.replaceChildren(main);
    placeControls(); // ページに置いてから、実際の列の数で置き直す
    onGridResize = placeControls; // 画面の幅が変わって列の数が変わったときも
    window.scrollTo(0, y);

    return {
      mode,
      play() { playing = true; entries.forEach((e) => e.view && e.view.start()); },
      pause() { playing = false; entries.forEach((e) => e.view && e.view.pause()); },
      stop() { playing = false; entries.forEach((e) => e.view && e.view.stop()); },
    };
  }

  // 画面の幅が変わったら、いま表示しているホームの表示切り替えボタンを置き直す
  let onGridResize = noop;
  window.addEventListener('resize', () => onGridResize());

  // 画面上の範囲 r が、画面の下（キーボードや固定したボタン）に隠れていたら、見える所までスクロール
  function reveal(r, margin) {
    const vv = window.visualViewport;
    const bottom = (vv ? vv.height + vv.offsetTop : window.innerHeight) - margin;
    if (r.bottom > bottom) window.scrollBy({ top: r.bottom - bottom, behavior: 'smooth' });
    else if (r.top < 0) window.scrollBy({ top: r.top - 20, behavior: 'smooth' });
  }

  /* ---------- ホームの文字の編集 ----------
     スマホ：左下のキーボードボタンを押すと OS のキーボード（英語配列）が出る
     PC    ：キャラクター以外の場所をクリックすると、そこにカーソルが置かれ、手元のキーボードで打てる
     どちらも見えない入力欄で受け取る。英字はカーソルの位置に入り、削除キーでカーソルの前を消す */
  const isPhone = () => window.matchMedia('(max-width: 600px)').matches; // style.css のスマホの幅と合わせる
  const onlyLetters = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');

  function makeTyping(hooks) {
    const input = h('input', {
      class: 'kb-input',
      type: 'text',
      inputmode: 'email', // 日本語キーボードが既定の端末でも、英語配列のキーボードが出る
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-label': 'ホームに並べる文字（A〜Z）',
    });
    const btn = h('button', {
      type: 'button',
      class: 'mode-btn kb-btn',
      title: 'キーボードで文字を消したり足したりする',
      'aria-label': 'キーボードで文字を消したり足したりする',
      'aria-pressed': 'false',
      html: ICON.keyboard,
      onpointerdown: (e) => e.preventDefault(), // 押したときに入力欄からフォーカスが外れないように
      onclick: () => { if (document.activeElement === input) input.blur(); else start(); },
    });
    const page = () => input.closest('.page-grid');

    // 並びとカーソルを変えて、見えない入力欄の中身・カーソルもそろえる
    function apply(seq, caret) {
      const atEnd = caretPos === sequence.length;
      const changed = seq !== sequence;
      const grew = seq.length > sequence.length;
      sequence = seq;
      caretPos = clamp(caret, 0, seq.length);
      if (input.value !== seq) input.value = seq;
      if (document.activeElement === input) input.setSelectionRange(caretPos, caretPos);
      if (changed) hooks.edit(atEnd, grew);
      else hooks.move();
    }
    function start(caret) {
      if (caret != null) caretPos = clamp(caret, 0, sequence.length);
      input.focus({ preventScroll: true });
      btn.setAttribute('aria-pressed', 'true');
      page().classList.add('is-editing');
      apply(sequence, caretPos);
    }
    input.addEventListener('focus', () => {
      btn.setAttribute('aria-pressed', 'true');
      page().classList.add('is-editing');
      apply(sequence, caretPos);
    });
    input.addEventListener('blur', () => {
      btn.setAttribute('aria-pressed', 'false');
      const p = page();
      if (p) p.classList.remove('is-editing');
    });

    // PC：押されたキーの位置で判断する（日本語入力がオンでも、A のキーなら A を入れる）
    let keyAt = 0;
    input.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (!e.isComposing) { e.preventDefault(); input.blur(); }
        return;
      }
      const c = caretPos;
      const seq = sequence;
      let next = null;
      if (e.key === 'Backspace') next = c > 0 ? [seq.slice(0, c - 1) + seq.slice(c), c - 1] : [seq, c];
      else if (e.key === 'Delete') next = [seq.slice(0, c) + seq.slice(c + 1), c];
      else if (e.key === 'ArrowLeft') next = [seq, hooks.stops().filter((p) => p < c).pop() ?? c];
      else if (e.key === 'ArrowRight') next = [seq, hooks.stops().find((p) => p > c) ?? c];
      else if (e.key === 'ArrowUp') next = [seq, hooks.vertical(-1)];
      else if (e.key === 'ArrowDown') next = [seq, hooks.vertical(1)];
      else if (e.key === 'Home') next = [seq, 0];
      else if (e.key === 'End') next = [seq, seq.length];
      else {
        const m = /^Key([A-Z])$/.exec(e.code || '');
        if (m) next = [seq.slice(0, c) + m[1] + seq.slice(c), c + 1];
      }
      if (!next) return; // スマホのキーボードは、ここでは分からないことが多い → 下の input で受け取る
      e.preventDefault();
      keyAt = performance.now();
      apply(next[0], next[1]);
    });

    // スマホ：入力欄の中身とカーソル位置から、英字だけを取り出す
    const fromInput = () => {
      const v = input.value;
      const sel = input.selectionStart == null ? v.length : input.selectionStart;
      return [onlyLetters(v), onlyLetters(v.slice(0, sel)).length];
    };
    input.addEventListener('input', (e) => {
      if (performance.now() - keyAt < 80) { apply(sequence, caretPos); return; } // キーで処理した直後（日本語入力の変換などが混ざったもの）は戻す
      const [seq, caret] = fromInput();
      if (e.isComposing) { // 変換中の文字はまだ整えない（入力欄には触らない）
        if (seq !== sequence) {
          const atEnd = caretPos === sequence.length;
          const grew = seq.length > sequence.length;
          sequence = seq;
          caretPos = caret;
          hooks.edit(atEnd, grew);
        }
        return;
      }
      apply(seq, caret);
    });
    input.addEventListener('compositionend', () => { const [seq, caret] = fromInput(); apply(seq, caret); });
    // スマホのキーボードでカーソルを動かしたとき（iPhone のスペースキー長押しなど）
    onSelectionChange = () => {
      if (document.activeElement !== input) return;
      const [seq, caret] = fromInput();
      if (seq === sequence && caret !== caretPos) { caretPos = caret; hooks.move(); }
    };

    return { input, btn, start };
  }
  // 入力欄のカーソル位置の変化は、いま表示しているホームの入力欄だけに伝える（何度ホームを作り直しても1つだけ）
  let onSelectionChange = noop;
  document.addEventListener('selectionchange', () => onSelectionChange());

  // キーボードが出ている間は、画面下に固定したボタンをキーボードの上へ持ち上げる
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const sync = () => root.style.setProperty('--kb-offset', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
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

    const prev = prevOf(c, mode);
    const next = nextOf(c, mode);
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
        // スマホでは × の代わりに、表示切り替えボタンと同じ丸いボタンを左下に出す
        h('a', { class: 'mode-btn close-round', href: `#/grid/${mode}`, title: '閉じる（ホームに戻る）', 'aria-label': '閉じてホームに戻る', html: ICON.close }),
        mode === 'turntable' ? h('p', { class: 'hint' }, '長押しで止まる ・ 左右にドラッグで回る') : null,
        // アニメーションがない文字は、アニメーションのボタンを出さない
        modeButtons(mode, { href: (m) => `#/${c.letter}/${m}`, iconChar: c, modes: MODES.filter((m) => hasMode(c, m)) })));
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
  const DEFAULT_MODE = 'turntable'; // 最初に開いたときの表示
  let lastMode = DEFAULT_MODE; // about から戻ったとき、前の表示モードのホームに戻す
  function parseRoute() {
    const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
    if (a === 'about') return { view: 'about', mode: lastMode };
    const mode = MODES.includes(b) ? b : DEFAULT_MODE;
    const L = (a || '').toUpperCase();
    if (L.length === 1 && BY[L]) return { view: 'detail', letter: L, mode };
    return { view: 'grid', mode };
  }

  let route = null;
  let grid = null;
  function onRoute() {
    route = parseRoute();
    if (route.mode === 'animation' && (route.view === 'detail' ? !hasMode(BY[route.letter], 'animation') : !ANIM_CHARS.length)) {
      location.replace(route.view === 'detail' ? `#/${route.letter}/${DEFAULT_MODE}` : `#/grid/${DEFAULT_MODE}`);
      return;
    }
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
    if (e.key === 'ArrowLeft') location.hash = `#/${prevOf(c, route.mode).letter}/${route.mode}`;
    else if (e.key === 'ArrowRight') location.hash = `#/${nextOf(c, route.mode).letter}/${route.mode}`;
    else if (e.key === 'Escape') location.hash = homeHash();
  });
  window.addEventListener('hashchange', onRoute);

  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = glyphURL(FRONT_FONT, 'A') || BY.A.ph.illust;
  onRoute();
})();
