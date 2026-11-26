// =====================================================================
// 素材フォルダの動画を、サイト用に書き出す（macOS 標準の AVFoundation を使用）
//   swift tools/build_videos.swift <素材フォルダ> <出力先 assets フォルダ> [文字…]
//
//   ・ファイル名に「ターンテーブル」を含む動画 … ターンテーブル（先頭の英字 = 文字）
//       assets/turntable/A.mp4       個別ページ用（アニメーションと同じ 1920×1080 のまま。ドラッグで戻しやすい形式）
//       assets/turntable/grid/A.mp4  ホーム一覧用（小さい正方形）
//       元の動画は「ゆっくり始まってゆっくり止まる」1回転なので、一定の速さで回り続けるよう並べ直す
//   ・それ以外で先頭が英字の動画 … アニメーション
//       assets/animation/B.mp4       背景が黒なら白背景に変換
//       assets/animation/grid/B.mp4  ホーム一覧用（一覧のターンテーブルと同じ切り抜き・大きさ）
//   ・書き出した動画ごとに、最初のコマの静止画（同じ名前の .jpg）も作る（読み込み中に先に見せる）
// =====================================================================
import AVFoundation
import CoreImage
import Foundation
import ImageIO

// ---------- 調整用 ----------
let SECONDS_PER_TURN = 6.0 // ターンテーブル1回転の秒数
let MIN_STEP_DEG = 1.5     // これより細かい角度差のコマは間引く（動き出し・止まり際のコマが非常に細かいため）
// 元動画の回り方：0〜1 の進み具合 u に対する回転（1 = 360°）。
// 3u² − 2u³ は「ゆっくり始まってゆっくり止まる」標準的な動き（真横を向くコマ位置で確認済み）。
// 一定の速さで書き出された動画に替えたら { u in u } にする
let SOURCE_EASE: (Double) -> Double = { u in u * u * (3 - 2 * u) }

struct Out {
  let crop: CGRect // 元動画上の切り抜き範囲（左上原点・px）。はみ出した部分は白
  let width: Int
  let height: Int
  let keyInterval: Int
  let quality: Double // 0〜1（画質で指定すると白い背景が真っ白のまま保たれやすい）
}

// 個別ページ用：アニメーションの動画と外枠がそろうよう、切り抜かずに 1920×1080 のまま
let TT_DETAIL = Out(crop: CGRect(x: 0, y: 0, width: 1920, height: 1080), width: 1920, height: 1080, keyInterval: 4, quality: 0.8)
// 一覧用：一覧の静止画（フォントの絵）と足元・大きさがそろう位置
let TT_GRID = Out(crop: CGRect(x: 416, y: 129, width: 1088, height: 1088), width: 288, height: 288, keyInterval: 30, quality: 0.72)
// ホーム一覧用のアニメーション：一覧のターンテーブルと同じ切り抜き（外枠がそろう）
let ANIM_GRID = Out(crop: TT_GRID.crop, width: TT_GRID.width, height: TT_GRID.height, keyInterval: 24, quality: TT_GRID.quality)
let ANIM = Out(crop: CGRect(x: 0, y: 0, width: 1920, height: 1080), width: 1920, height: 1080, keyInterval: 24, quality: 0.78)

let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull(), .cacheIntermediates: false])
let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: -4000, y: -4000, width: 12000, height: 12000))
let black = CIImage(color: CIColor(red: 0, green: 0, blue: 0)).cropped(to: CGRect(x: -4000, y: -4000, width: 12000, height: 12000))

func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }

// 黒背景 → 白背景（黒いほど透明とみなして白と合成）
// a = clamp(4(R+G+B) − 0.15)、out = RGB + (1 − a)
func keyBlackToWhite(_ img: CIImage) -> CIImage {
  let inv = img.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: -4, y: -4, z: -4, w: 0),
    "inputGVector": CIVector(x: -4, y: -4, z: -4, w: 0),
    "inputBVector": CIVector(x: -4, y: -4, z: -4, w: 0),
    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
    "inputBiasVector": CIVector(x: 1.15, y: 1.15, z: 1.15, w: 0),
  ]).applyingFilter("CIColorClamp")
  // 足し算で不透明度も 2 になるので 1 に戻してから範囲内に収める
  return inv.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: img])
    .settingAlphaOne(in: img.extent)
    .applyingFilter("CIColorClamp")
    .cropped(to: img.extent)
}

final class Writer {
  let w: AVAssetWriter
  let input: AVAssetWriterInput
  let adaptor: AVAssetWriterInputPixelBufferAdaptor
  let out: Out
  let url: URL
  init(_ url: URL, _ out: Out, fps: Int) {
    self.url = url
    self.out = out
    try? FileManager.default.removeItem(at: url)
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    w = try! AVAssetWriter(outputURL: url, fileType: .mp4)
    w.shouldOptimizeForNetworkUse = true
    var compression: [String: Any] = [
      AVVideoQualityKey: out.quality,
      AVVideoMaxKeyFrameIntervalKey: out.keyInterval,
      AVVideoAllowFrameReorderingKey: false,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoExpectedSourceFrameRateKey: fps,
    ]
    var settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: out.width,
      AVVideoHeightKey: out.height,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: compression,
    ]
    // 画質指定が使えない環境では、だいたい同じ画質になるビットレートで書き出す
    if !w.canApply(outputSettings: settings, forMediaType: .video) {
      compression.removeValue(forKey: AVVideoQualityKey)
      compression[AVVideoAverageBitRateKey] = Int(Double(out.width * out.height) * 1.6 * out.quality)
      settings[AVVideoCompressionPropertiesKey] = compression
    }
    input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    // RGB で渡すとエンコーダー内部の変換で白が少し暗くなる（255 → 252）ので、YUV に変換してから渡す
    adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
      kCVPixelBufferWidthKey as String: out.width,
      kCVPixelBufferHeightKey as String: out.height,
    ])
    w.add(input)
    w.startWriting()
    w.startSession(atSourceTime: .zero)
  }
  func append(_ src: CIImage, srcHeight: CGFloat, keyBlack: Bool, at t: CMTime) {
    // CoreImage は左下原点なので y を反転して切り抜く
    let c = out.crop
    let rect = CGRect(x: c.minX, y: srcHeight - c.maxY, width: c.width, height: c.height)
    var img: CIImage
    if keyBlack {
      // 黒背景：切り抜きで元の画面からはみ出す部分もいったん黒で埋めてから、まとめて黒 → 白に変換する
      // （白で埋めてから変換すると、YUV に描いたときにはみ出した部分が黒くなる）
      img = keyBlackToWhite(src.composited(over: black).cropped(to: rect))
    } else {
      img = src.composited(over: white).cropped(to: rect)
    }
    img = img.transformed(by: CGAffineTransform(translationX: -c.minX, y: -(srcHeight - c.maxY)))
    let sx = CGFloat(out.width) / c.width
    if abs(sx - 1) > 0.001 {
      // 縮小時に枠の外（透明）を拾って縁が暗くならないよう、端の色を外側へ延ばしてから縮小
      img = img.clampedToExtent()
        .applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: sx, kCIInputAspectRatioKey: 1.0])
        .cropped(to: CGRect(x: 0, y: 0, width: out.width, height: out.height))
    }
    while !input.isReadyForMoreMediaData { usleep(2000) }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    // BT.709 の YUV として描く（CoreImage がこの指定どおりに変換する）
    CVBufferSetAttachment(pb!, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb!, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb!, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
    ctx.render(img, to: pb!, bounds: CGRect(x: 0, y: 0, width: out.width, height: out.height), colorSpace: nil)
    adaptor.append(pb!, withPresentationTime: t)
  }
  func finish(endTime: CMTime?) -> Int {
    input.markAsFinished()
    if let e = endTime { w.endSession(atSourceTime: e) } // 最後のコマの表示時間（ループの1周の長さ）
    let sem = DispatchSemaphore(value: 0)
    w.finishWriting { sem.signal() }
    sem.wait()
    if w.status != .completed { fail("書き出しに失敗: \(url.path) \(String(describing: w.error))") }
    return ((try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0) ?? 0
  }
}


// 元の動画も書き出しの設定も前回から変わっていなければ、書き出しを省く
// （書き出し直すと中身が同じでも毎回ファイルが変わり、GitHub に毎回まるごと上がってしまうため）
// 動画の作り方（色の変換など）を変えたときは VIDEO_FORMAT を 1 増やすと、全部書き出し直す
let VIDEO_FORMAT = 3
func modified(_ url: URL) -> Date? { (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date }
var settingsChanged = false // 書き出しの設定が前回と違うか（下で調べる）
func upToDate(_ src: URL, _ outs: [URL]) -> Bool {
  if settingsChanged { return false }
  let need = modified(src) ?? Date()
  return outs.allSatisfy { (modified($0) ?? .distantPast) > need }
}

// turntable: true のとき、元のコマ f の角度 = 360 × SOURCE_EASE(f / 最後のコマ番号) として
// 一定の速さで回るタイミングに置き直す（最後のコマ = 360° = 最初のコマと同じなので使わない）
func process(_ src: URL, outs: [(URL, Out)], turntable: Bool) {
  let asset = AVURLAsset(url: src)
  guard let track = asset.tracks(withMediaType: .video).first else { fail("映像がありません: \(src.path)") }
  let size = track.naturalSize
  let fps = Int(round(track.nominalFrameRate > 0 ? track.nominalFrameRate : 24))
  let lastIndex = max(1, Int(round(asset.duration.seconds * Double(fps))) - 1)
  let reader = try! AVAssetReader(asset: asset)
  // YUV のまま受け取り、RGB への変換は CoreImage に任せる（ここでも RGB で受け取ると白が少しずれる）
  let ro = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
  ro.alwaysCopiesSampleData = false
  reader.add(ro)
  reader.startReading()

  let skip = upToDate(src, outs.map { $0.0 })
  if skip {
    print("  \(src.lastPathComponent) → 変更なし（書き出しは省略）")
    return
  }
  let writers = outs.map { Writer($0.0, $0.1, fps: turntable ? 60 : fps) }
  var keyBlack: Bool? = turntable ? false : nil
  var f = -1 // 元のコマ番号
  var written = 0
  var lastDeg = -1000.0
  while let sb = ro.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    f += 1
    let img = CIImage(cvPixelBuffer: pb)
    if keyBlack == nil {
      // 左上の色で背景を判定（黒っぽければ黒背景）
      var px = [UInt8](repeating: 0, count: 4)
      ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: 2, y: size.height - 3, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
      keyBlack = Int(px[0]) + Int(px[1]) + Int(px[2]) < 60
    }
    var t: CMTime
    if turntable {
      let deg = 360 * SOURCE_EASE(min(1, Double(f) / Double(lastIndex)))
      if deg - lastDeg < MIN_STEP_DEG || deg > 360 - MIN_STEP_DEG / 2 { continue }
      lastDeg = deg
      t = CMTime(seconds: SECONDS_PER_TURN * deg / 360, preferredTimescale: 6000)
    } else {
      t = CMTime(value: CMTimeValue(f * 100), timescale: CMTimeScale(fps * 100))
    }
    writers.forEach { $0.append(img, srcHeight: size.height, keyBlack: keyBlack ?? false, at: t) }
    written += 1
  }
  if reader.status == .failed { fail("読み込みに失敗: \(src.path) \(String(describing: reader.error))") }
  let end = turntable ? CMTime(seconds: SECONDS_PER_TURN, preferredTimescale: 6000) : nil
  let sizes = writers.map { $0.finish(endTime: end) }
  let note = turntable ? "（元 \(f + 1)コマ → \(written)コマ・\(SECONDS_PER_TURN)秒で1回転）" : ((keyBlack ?? false) ? "（黒背景→白）" : "")
  print("  \(src.lastPathComponent) → " + zip(outs, sizes).map { "\($0.0.0.path.components(separatedBy: "assets/").last ?? "") \($0.1 / 1024)KB" }.joined(separator: ", ") + " " + note)
}

// ---------------------------------------------------------------------
let args = CommandLine.arguments
if args.count < 3 { fail("使い方: swift build_videos.swift <素材フォルダ> <assetsフォルダ> [文字…]") }
let srcRoot = URL(fileURLWithPath: args[1])
let outRoot = URL(fileURLWithPath: args[2])
let only = Set(args.dropFirst(3).map { $0.uppercased() })

// 書き出しの設定を前回と比べる（assets/video-settings.txt に残しておく）
let settingsURL = outRoot.appendingPathComponent("video-settings.txt")
let settings = "format \(VIDEO_FORMAT) / turn \(SECONDS_PER_TURN)s step \(MIN_STEP_DEG) / \(TT_DETAIL) / \(TT_GRID) / \(ANIM) / \(ANIM_GRID)"
if let old = try? String(contentsOf: settingsURL, encoding: .utf8) {
  settingsChanged = old != settings
  if settingsChanged { print("書き出しの設定が変わったので、動画を全部書き出し直します") }
}
try? FileManager.default.createDirectory(at: outRoot, withIntermediateDirectories: true)
try? settings.write(to: settingsURL, atomically: true, encoding: .utf8)

let files = (FileManager.default.enumerator(at: srcRoot, includingPropertiesForKeys: nil)?.allObjects as? [URL] ?? [])
  .filter { ["mp4", "mov", "m4v"].contains($0.pathExtension.lowercased()) }
  .sorted { $0.lastPathComponent < $1.lastPathComponent }

var tt: [String: URL] = [:]
var anim: [String: URL] = [:]
for f in files {
  let name = f.deletingPathExtension().lastPathComponent.precomposedStringWithCanonicalMapping
  guard let c = name.first, c.isASCII, c.isLetter else { continue }
  let L = String(c).uppercased()
  if !only.isEmpty && !only.contains(L) { continue }
  if f.path.precomposedStringWithCanonicalMapping.contains("ターンテーブル") { tt[L] = f } else { anim[L] = f }
}

print("ターンテーブル \(tt.count)本")
for L in tt.keys.sorted() {
  autoreleasepool { // 1本ごとにエンコーダーを解放する（ためこむと途中から使えなくなる）
    process(tt[L]!, outs: [
      (outRoot.appendingPathComponent("turntable/\(L).mp4"), TT_DETAIL),
      (outRoot.appendingPathComponent("turntable/grid/\(L).mp4"), TT_GRID),
    ], turntable: true)
  }
}
// 素材フォルダから消えた文字の動画（と静止画）は消す（全部の文字を書き出すときだけ）
if only.isEmpty {
  for (dir, have) in [("turntable", tt), ("turntable/grid", tt), ("animation", anim), ("animation/grid", anim)] {
    let d = outRoot.appendingPathComponent(dir)
    for f in (try? FileManager.default.contentsOfDirectory(atPath: d.path)) ?? [] where f.hasSuffix(".mp4") || f.hasSuffix(".jpg") {
      if have[String(f.dropLast(4))] == nil {
        try? FileManager.default.removeItem(at: d.appendingPathComponent(f))
        print("  素材にない \(dir)/\(f) を削除")
      }
    }
  }
}
print("アニメーション \(anim.count)本")
for L in anim.keys.sorted() {
  autoreleasepool {
    process(anim[L]!, outs: [
      (outRoot.appendingPathComponent("animation/\(L).mp4"), ANIM),
      (outRoot.appendingPathComponent("animation/grid/\(L).mp4"), ANIM_GRID),
    ], turntable: false)
  }
}

// ---------------------------------------------------------------------
// 書き出した動画の最初のコマを JPEG にする（動画とこのツールより新しい静止画があれば作り直さない）
// 動画と同じく YUV のまま受け取って CoreImage で RGB にする（標準の取り出し方だと白が 254 になり、薄い四角が見える）
let TOOL_DATE = modified(URL(fileURLWithPath: #filePath)) ?? Date()
func writePoster(_ video: URL) -> Bool {
  let poster = video.deletingPathExtension().appendingPathExtension("jpg")
  if let p = modified(poster), let v = modified(video), p > v, p > TOOL_DATE { return false }
  let asset = AVURLAsset(url: video)
  guard let track = asset.tracks(withMediaType: .video).first, let reader = try? AVAssetReader(asset: asset) else { return false }
  let ro = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
  reader.add(ro)
  reader.startReading()
  guard let sb = ro.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) else {
    print("  最初のコマを取り出せませんでした: \(video.lastPathComponent)")
    return false
  }
  reader.cancelReading()
  var img = CIImage(cvPixelBuffer: pb)
  // macOS の JPEG 保存は、大きい画像（1920×1080 など）だと真っ白が 254 になるので、幅 1280 までに縮める
  // （読み込み中に一瞬見せるだけなので、これで十分）
  if img.extent.width > 1280 {
    let k = 1280 / img.extent.width
    img = img.clampedToExtent()
      .applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: k, kCIInputAspectRatioKey: 1.0])
      .cropped(to: CGRect(x: 0, y: 0, width: (img.extent.width * k).rounded(), height: (img.extent.height * k).rounded()))
  }
  let w = Int(img.extent.width), h = Int(img.extent.height)
  var px = [UInt8](repeating: 0, count: w * h * 4)
  ctx.render(img, toBitmap: &px, rowBytes: w * 4, bounds: img.extent, format: .RGBA8, colorSpace: nil)
  // 圧縮で白がわずかに暗く（246〜254）なっている所は 255 にそろえる（白の上で薄い四角に見えないように）
  for i in stride(from: 0, to: px.count, by: 4) where px[i] >= 246 && px[i + 1] >= 246 && px[i + 2] >= 246 {
    px[i] = 255; px[i + 1] = 255; px[i + 2] = 255
  }
  guard let provider = CGDataProvider(data: Data(px) as CFData),
        let cg = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                         space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                         provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent),
        let dest = CGImageDestinationCreateWithURL(poster as CFURL, "public.jpeg" as CFString, 1, nil) else { return false }
  CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
  return CGImageDestinationFinalize(dest)
}
var posters = 0
for dir in ["turntable", "turntable/grid", "animation", "animation/grid"] {
  let d = outRoot.appendingPathComponent(dir)
  for f in ((try? FileManager.default.contentsOfDirectory(atPath: d.path)) ?? []).sorted() where f.hasSuffix(".mp4") {
    if only.isEmpty || only.contains(String(f.prefix(1))) {
      autoreleasepool { if writePoster(d.appendingPathComponent(f)) { posters += 1 } }
    }
  }
}
print("最初のコマの静止画 \(posters)枚")
