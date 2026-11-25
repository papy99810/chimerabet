#!/bin/bash
# =====================================================================
# ダブルクリックで実行：素材フォルダ（chimerabet_google drive）から、サイト用のファイルを作り直す
#   assets/turntable, assets/animation, assets/glyphs, fonts/chimerabet-metrics.otf, js/assets.js
# 必要なもの：macOS の Swift と Python3（Xcode のコマンドラインツールに入っています）
# =====================================================================
cd "$(dirname "$0")/.." || exit 1
SRC="chimerabet_google drive"

finish() {
  echo
  read -r -n1 -p "何かキーを押すと閉じます" _ 2>/dev/null
  echo
  exit "$1"
}

if [ ! -d "$SRC" ]; then
  echo "素材フォルダ「$SRC」が見つかりません（index.html と同じ場所に置いてください）"
  finish 1
fi

echo "素材フォルダ: $SRC"
echo
# 作り直すので、前回書き出した分は消す（assets 内のほかのフォルダには触らない）
rm -rf assets/turntable assets/animation assets/glyphs

echo "== 動画 =="
BIN="${TMPDIR:-/tmp}/chimerabet_build_videos"
if ! swiftc -O tools/build_videos.swift -o "$BIN" 2>/dev/null; then
  echo "動画の書き出しツールを準備できませんでした（Xcode のコマンドラインツールが必要です）"
  finish 1
fi
"$BIN" "$SRC" assets || { echo "動画の書き出しに失敗しました"; finish 1; }

echo
echo "== フォントの絵・素材の一覧 =="
python3 tools/build_fonts.py "$SRC" . || { echo "フォントの書き出しに失敗しました"; finish 1; }

echo
echo "完了しました。ブラウザで index.html を再読み込みしてください。"
finish 0
