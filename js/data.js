/* =====================================================================
   CHIMERABET 設定ファイル
   ---------------------------------------------------------------------
   素材は「chimerabet_google drive」フォルダに入れて、
   tools/素材を書き出す.command をダブルクリックすると、サイト用に変換されて自動で反映されます。
     ・ターンテーブル/Aターンテーブル.mp4 … ターンテーブル（ファイル名の先頭の英字 = 文字）
     ・B混同 透過.mp4 など               … アニメーション（黒背景は白背景に変換）
     ・otf/〜.otf                         … 各文字の絵（イラスト・シルエット・ロゴ）
   アニメーション動画がない文字は、アニメーション表示には出ません（その文字のアニメーションボタンも出ません）。

   ここ（data.js）では、素材の使い分けと色などを決めます。
   ===================================================================== */

window.CHIMERABET = {
  // ロゴ画像（null の間は、下の logoFont の絵で「CHIMERABET」を並べて表示）
  logo: null, // 'assets/logo.png'

  // ロゴに使うフォント（One / Two / Three / Four / Five / silhouette）
  // silhouette のような単色のフォントは、各文字の色（下の colors）で塗ります
  logoFont: 'silhouette',

  // どのフォントの絵を使うか
  glyphs: {
    illust: 'Two',            // ターンテーブル動画がない文字の仮表示に使う絵（斜め向き）
    silhouette: 'silhouette', // シルエット表示（各文字の色で塗ります）
    front: 'Three',           // 正面の絵（タブのアイコンなど）
  },

  // about ページの中身（段落ごとに1行）
  about: {
    title: 'About',
    body: [
      'ここに CHIMERABET の紹介文が入ります。',
      '（制作者・クレジット・お問い合わせ先など）',
    ],
  },

  // 各文字の色（シルエットの色・詳細ページの見出しの色）
  // フォントの正面の絵（Three）でいちばん面積の大きい色。見出しは白の上で読める濃さに自動で調整します
  colors: {
    A: '#FE2600', B: '#6100FF', C: '#0DFE00', D: '#4200FE', E: '#FF9600',
    F: '#7B00FE', G: '#00EDFE', H: '#00B5FE', I: '#B6FF00', J: '#FEED5F',
    K: '#7FFE00', L: '#00FEA0', M: '#FE008E', N: '#FE3DCA', O: '#FEB500',
    P: '#FFEC00', Q: '#00FED8', R: '#FE5D00', S: '#B100FE', T: '#45FE00',
    U: '#007CFE', V: '#FE0055', W: '#EB00FE', X: '#FC0000', Y: '#00FF2D',
    Z: '#0043FE',
  },

  // 素材を個別に差し替えたいときだけ書く（書いたものが優先されます）
  assets: {
    // A: {
    //   illust:     'assets/A/illust.png',     // 透過PNG / SVG
    //   silhouette: 'assets/A/silhouette.png',
    //   animation:  'assets/A/animation.mp4',  // 黒背景のままの動画は { src: '...', keyBlack: true }
    //   turntable:  'assets/A/turntable.mp4',  // 1回転でつながるループ動画（一定の速さで回るもの）
    // },
  },

  // 動きの調整
  settings: {
    dragDegPerPx: 0.5,  // ターンテーブルをドラッグしたとき、1px で何度回るか
    // ※ ターンテーブルの回転の速さは tools/build_videos.swift の SECONDS_PER_TURN（今は 6秒で1回転）
  },
};
