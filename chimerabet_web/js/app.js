/* =====================================================================
   CHIMERABET
   #/grid/{mode}       … ホーム（A〜Z）※ターンテーブル表示のときだけ回転、それ以外は静止
   #/{A-Z}/{mode}      … 個別ページ（ホームの上にポップアップで表示）
   mode = animation | silhouette | turntable
   ===================================================================== */
(function () {
  'use strict';

  const CFG = window.CHIMERABET || {};
  const S = Object.assign({
    animationMs: 6500,
    secondsPerTurn: 6,
  }, CFG.settings);

  const MODES = ['animation', 'silhouette', 'turntable'];
  const LABEL = { animation: 'Animation', silhouette: 'Silhouette', turntable: 'Turntable' };
  const LABEL_JA = { animation: 'アニメーション表示', silhouette: 'シルエット表示', turntable: 'ターンテーブル表示' };
  const LOGO_COLORS = ['#5BB32F', '#1E9BD7', '#9CC31B', '#E4007F', '#F39800', '#EA5514', '#E60012', '#3E3A8E', '#F6AB00', '#6AB72D'];
  const LOGO_TILT = [-6, 4, -3, 5, -4, 3, -5, 4, -3, 6];

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, index) => {
    const color = (CFG.colors || {})[letter] || '#888888';
    const a = (CFG.assets || {})[letter] || {};
    const ph = window.CHIMERA_PH.make(letter, color);
    return {
      letter, index, color, ph,
      illust: a.illust || ph.illust,
      silhouette: a.silhouette || ph.silhouette,
      animation: a.animation || null,
      turntable: a.turntable || null,
      hasIllust: !!a.illust,
      hasSilhouette: !!a.silhouette,
    };
  });
  const BY = {};
  CHARS.forEach((c) => { BY[c.letter] = c; });
  const prevOf = (c) => CHARS[(c.index + CHARS.length - 1) % CHARS.length];
  const nextOf = (c) => CHARS[(c.index + 1) % CHARS.length];

  /* ---------- 小物 ---------- */
  const noop = () => {};
  const mod = (n, m) => ((n % m) + m) % m;

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
    const v = h('video', { class: 'media', playsinline: true, muted: true, preload: 'auto' });
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

  const ICON = {
    animation: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 11.8v24.4c0 1.3 1.4 2 2.5 1.3l18.6-12.2a1.5 1.5 0 0 0 0-2.6L20.5 10.5c-1.1-.7-2.5 0-2.5 1.3z" fill="#fff"/></svg>',
    turntable: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="18.5" r="11" fill="#fff"/><path d="M9 31.4C6.4 32.5 5 33.8 5 35.2 5 39 13.5 42 24 42s19-3 19-6.8c0-1.5-1.4-2.9-3.8-4" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><path d="M44.4 29.2l-5.2 1.2 2.6 5" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    chevL: '<svg viewBox="0 0 130 240" aria-hidden="true"><path d="M116 8L16 120l100 112" fill="none" stroke="currentColor" stroke-width="22"/></svg>',
    chevR: '<svg viewBox="0 0 130 240" aria-hidden="true"><path d="M14 8l100 112L14 232" fill="none" stroke="currentColor" stroke-width="22"/></svg>',
  };

  /* ---------- ターンテーブル用の共通タイマー ---------- */
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
     表示パーツ（詳細ページ用：silhouette / animation / turntable）
     どれも { el, start(), stop() } を返す
     ===================================================================== */

  function viewSilhouette(c) {
    return { el: h('div', { class: 'view view-silhouette' }, img(c.silhouette, 'media')), start: noop, stop: noop };
  }

  // 一覧用：動かない絵（シルエット表示ならシルエット、それ以外はカラーイラスト）
  function viewStill(c, mode) {
    return h('div', { class: 'view view-still' }, img(mode === 'silhouette' ? c.silhouette : c.illust, 'media'));
  }

  // 枠の右外から入ってきて左外へ抜ける（枠の両端はマスクでフェード）
  const WALK = [
    { transform: 'translateX(68%)', opacity: 0 },
    { transform: 'translateX(40%)', opacity: 1, offset: 0.14 },
    { transform: 'translateX(-40%)', opacity: 1, offset: 0.86 },
    { transform: 'translateX(-68%)', opacity: 0 },
  ];

  function viewAnimation(c) {
    const mover = h('div', { class: 'anim-mover' });
    const el = h('div', { class: 'view view-animation' }, h('div', { class: 'anim-frame' }, mover));
    let anim = null;
    let vid = null;

    if (c.animation) {
      vid = makeVideo(c.animation, true);
      mover.classList.add('has-video');
      mover.append(vid);
    } else {
      mover.append(h('div', { class: 'crawl' }, img(c.illust, 'media')));
    }

    return {
      el,
      // 終わったら最初から繰り返す
      start() {
        if (vid) vid.play().catch(noop);
        else anim = mover.animate(WALK, { duration: S.animationMs, easing: 'linear', iterations: Infinity });
      },
      stop() {
        if (anim) anim.cancel();
        if (vid) vid.pause();
      },
    };
  }

  function viewTurntable(c, ctx) {
    const rotor = h('div', { class: 'tt-rotor' });
    const el = h('div', { class: 'view view-turntable' }, h('div', { class: 'tt-stage' }, rotor));
    const src = c.turntable;
    const speed = 360 / (S.secondsPerTurn * 1000); // 度/ms
    let angle = 0;
    let held = false;
    let render = noop;
    let vid = null;
    let ro = null;
    let hold;

    if (typeof src === 'string' || Array.isArray(src)) {
      // ループ動画
      vid = makeVideo(src, true);
      rotor.append(vid);
      let t0 = 0;
      hold = {
        begin() { vid.pause(); t0 = vid.currentTime; },
        drag(dx) { if (vid.duration) vid.currentTime = mod(t0 + (dx / 600) * vid.duration, vid.duration); },
        end() { vid.play().catch(noop); },
      };
    } else {
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
        // 仮表示：イラストを何枚も重ねて厚みを出し、3D回転させる
        const n = ctx === 'grid' ? 12 : 32;
        for (let i = 0; i < n; i++) {
          let s = c.hasIllust ? c.illust : c.ph.edge;
          let cls = 'media tt-layer';
          if (i === n - 1) s = c.illust;
          else if (i === 0) s = c.hasIllust ? c.illust : c.ph.back;
          else if (c.hasIllust) cls += ' is-edge';
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
      hold = {
        begin() { held = true; a0 = angle; },
        drag(dx) { angle = mod(a0 + dx * 0.6, 360); },
        end() { held = false; },
      };
    }

    const item = {
      update(dt) {
        if (!held) angle = (angle + dt * speed) % 360;
        render();
      },
    };
    function start() { if (vid) vid.play().catch(noop); else ticker.add(item); }
    function pause() { if (vid) vid.pause(); ticker.remove(item); }

    return {
      el,
      hold,
      start,
      pause,
      stop() { pause(); if (ro) ro.disconnect(); },
    };
  }

  function makeView(c, mode) {
    if (mode === 'animation') return viewAnimation(c);
    if (mode === 'turntable') return viewTurntable(c);
    return viewSilhouette(c);
  }

  // 押している間は止まる（そのままドラッグで回せる）
  function bindHold(target, hold) {
    let id = null;
    let x0 = 0;
    target.addEventListener('pointerdown', (e) => {
      if (id !== null || e.button > 0) return;
      id = e.pointerId;
      x0 = e.clientX;
      target.setPointerCapture(id);
      target.classList.add('is-held');
      hold.begin();
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) hold.drag(e.clientX - x0);
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

  /* ---------- 共通パーツ ---------- */

  function logo(mode) {
    const attrs = { class: 'logo', href: `#/grid/${mode}`, 'aria-label': 'CHIMERABET' };
    if (CFG.logo) return h('a', attrs, h('img', { src: CFG.logo, alt: 'CHIMERABET' }));
    return h('a', attrs, 'CHIMERABET'.split('').map((ch, i) =>
      h('span', { 'aria-hidden': 'true', style: `color:${LOGO_COLORS[i]};--r:${LOGO_TILT[i]}deg;--d:${i * 40}ms` }, ch)));
  }

  function modeButtons(current, opt) {
    const silIcon = opt.iconChar.hasSilhouette
      ? () => h('img', { src: opt.iconChar.silhouette, alt: '', class: 'to-white', draggable: 'false' })
      : () => h('img', { src: opt.iconChar.ph.icon, alt: '', draggable: 'false' });
    return h('nav', { class: `modes ${opt.className || ''}`, 'aria-label': '表示の切り替え' },
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
  const root = document.documentElement;

  /* ---------- ホーム ---------- */
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
      h('header', { class: 'grid-head' }, h('h1', { class: 'visually-hidden' }, 'CHIMERABET'), logo(mode)),
      h('div', { class: 'grid' }, cells,
        modeButtons(mode, { className: 'grid-controls', href: (m) => `#/grid/${m}`, iconChar: BY.A }))));
    window.scrollTo(0, y);

    return {
      mode,
      play() { spinners.forEach((v) => v.start()); },
      pause() { spinners.forEach((v) => v.pause()); },
      stop() { spinners.forEach((v) => v.stop()); },
    };
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
    popup.panel.replaceChildren(
      h('a', { class: 'close-btn', href: `#/grid/${mode}`, title: '閉じる（ホームに戻る）', 'aria-label': '閉じてホームに戻る', html: ICON.close }),
      h('header', { class: 'detail-head' },
        h('h1', { class: 'detail-title', id: 'popup-title' }, `${c.letter} ${LABEL[mode]}`)),
      h('a', { class: 'nav nav-prev', href: `#/${prev.letter}/${mode}`, 'aria-label': `前へ（${prev.letter}）`, html: ICON.chevL }),
      stage,
      h('a', { class: 'nav nav-next', href: `#/${next.letter}/${mode}`, 'aria-label': `次へ（${next.letter}）`, html: ICON.chevR }),
      h('footer', { class: 'detail-foot' },
        mode === 'turntable' ? h('p', { class: 'hint' }, '長押しで停止 ・ そのまま左右ドラッグで回転') : null,
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
  function parseRoute() {
    const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
    const mode = MODES.includes(b) ? b : 'animation';
    const L = (a || '').toUpperCase();
    if (L.length === 1 && BY[L]) return { view: 'detail', letter: L, mode };
    return { view: 'grid', mode };
  }

  let route = null;
  let grid = null;
  function onRoute() {
    route = parseRoute();
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
  if (favicon) favicon.href = BY.A.ph.illust;
  onRoute();
})();
