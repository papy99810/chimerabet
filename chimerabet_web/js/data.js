/* =====================================================================
   CHIMERABET 設定ファイル
   ---------------------------------------------------------------------
   素材ができたら下の assets に書き足すだけで差し替わります。
   書いていない項目は、仮キャラクター（各文字の色の丸）で表示されます。

   illust     : カラーイラスト（透過PNG / SVG）
                ※ 一覧の静止画（アニメーション・ターンテーブル表示時）にも使います
   silhouette : シルエット画像（透過PNG / SVG）
   animation  : アニメーション動画（1回分の長さで書き出し。詳細ページで繰り返し再生します）
                'assets/A/animation.webm'
                Safari でも透過させたい場合は配列で複数指定（上から順に再生を試みます）
                ['assets/A/animation.mov', 'assets/A/animation.webm']
   turntable  : 回転素材。次のどちらか
                ・動画  'assets/A/turntable.webm'   … 1回転でつながるループ動画
                ・連番  { frames: 'assets/A/turntable/####.png', count: 36, start: 1 }
                        #### が 0001, 0002 … に置き換わります（# の数 = 桁数）
   ===================================================================== */

window.CHIMERABET = {
  // ロゴ画像（null の間は文字ロゴを表示）
  logo: null, // 'assets/logo.png'

  // 各文字のテーマカラー（詳細ページの見出し色・仮キャラクターの色）
  colors: {
    A: '#E60012', B: '#3E3A8E', C: '#5BB32F', D: '#F08300', E: '#F6AB00',
    F: '#00A0E9', G: '#D6006F', H: '#1E88D0', I: '#9CC31B', J: '#8E57A4',
    K: '#EA5514', L: '#00A497', M: '#E4007F', N: '#6A4C9C', O: '#F4C400',
    P: '#F25A8C', Q: '#2BA36B', R: '#E8501C', S: '#4FB6D8', T: '#6AB72D',
    U: '#C2185B', V: '#2F5FB3', W: '#F39C12', X: '#7B8D1E', Y: '#E8B300',
    Z: '#9B2D8E',
  },

  // 素材ファイル（用意できた文字だけ書けばOK）
  assets: {
    // A: {
    //   illust:     'assets/A/illust.png',
    //   silhouette: 'assets/A/silhouette.png',
    //   animation:  'assets/A/animation.webm',
    //   turntable:  { frames: 'assets/A/turntable/####.png', count: 36 },
    // },
  },

  // 動きの調整
  settings: {
    animationMs: 6500, // 詳細ページのアニメーション1回の長さ（仮キャラ用）
    secondsPerTurn: 6, // ターンテーブル1回転の秒数
  },
};
