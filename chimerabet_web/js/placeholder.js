/* =====================================================================
   仮キャラクター（プレースホルダー）
   キャラクター素材ができるまでは、各文字の色の丸を表示します。
   data.js に素材を登録した項目は、こちらは使われません。
   ===================================================================== */
(function () {
  'use strict';

  function darken(hex, p) {
    const n = parseInt(hex.slice(1), 16);
    return '#' + [16, 8, 0]
      .map((s) => Math.round(((n >> s) & 255) * (1 - p)).toString(16).padStart(2, '0'))
      .join('');
  }

  const FONT = "'Arial Rounded MT Bold','Arial Black',Arial,sans-serif";

  function circle({ fill, stroke, letter, ink }) {
    let o = stroke
      ? `<circle cx="100" cy="100" r="78" fill="${fill}" stroke="${stroke}" stroke-width="5"/>`
      : `<circle cx="100" cy="100" r="80" fill="${fill}"/>`;
    if (letter) {
      o += `<text x="100" y="102" text-anchor="middle" dominant-baseline="central" font-family="${FONT}"`
        + ` font-weight="900" font-size="80" fill="${ink}">${letter}</text>`;
    }
    return 'data:image/svg+xml;charset=utf-8,'
      + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${o}</svg>`);
  }

  window.CHIMERA_PH = {
    make(L, color) {
      return {
        illust: circle({ fill: color, stroke: '#161616', letter: L, ink: '#fff' }), // カラー版
        silhouette: circle({ fill: color, letter: L, ink: '#fff' }),               // シルエット版
        back: circle({ fill: color, stroke: '#161616' }),                          // ターンテーブルの裏面
        edge: circle({ fill: darken(color, 0.5) }),                                // ターンテーブルの厚み
        icon: circle({ fill: '#fff', letter: L, ink: '#666' }),                    // シルエットボタンのアイコン
      };
    },
  };
})();
